const crypto = require('node:crypto');
const cheerio = require('cheerio');
const { normalizeCreatorPost } = require('./creator-normalizer');
const { createConnectorFetch, fetchWithTimeout } = require('./connectors/connector-utils');

const YOUTUBE_FEED_ORIGIN = 'https://www.youtube.com';
const YOUTUBE_FEED_PATH = '/feeds/videos.xml';

function httpError(statusCode, code) {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function parseTopic(topic) {
  try {
    const url = new URL(topic);
    if (url.origin !== YOUTUBE_FEED_ORIGIN || url.pathname !== YOUTUBE_FEED_PATH) return null;
    if ([...url.searchParams.keys()].some((key) => key !== 'channel_id')) return null;
    const channelId = url.searchParams.get('channel_id');
    if (!channelId) return null;
    return { channelId, topic: `${YOUTUBE_FEED_ORIGIN}${YOUTUBE_FEED_PATH}?channel_id=${encodeURIComponent(channelId)}` };
  } catch {
    return null;
  }
}

function secureHexEqual(actualHeader, algorithm, secret, body) {
  const match = new RegExp(`^${algorithm}=([a-f0-9]+)$`, 'i').exec(String(actualHeader || ''));
  const expected = crypto.createHmac(algorithm, secret).update(body).digest();
  if (!match) {
    crypto.timingSafeEqual(expected, expected);
    return false;
  }
  let actual;
  try {
    actual = Buffer.from(match[1], 'hex');
  } catch {
    crypto.timingSafeEqual(expected, expected);
    return false;
  }
  if (actual.length !== expected.length) {
    crypto.timingSafeEqual(expected, expected);
    return false;
  }
  return crypto.timingSafeEqual(expected, actual);
}

function parseEntries(rawBody) {
  const $ = cheerio.load(rawBody.toString('utf8'), { xmlMode: true });
  const selfTopic = $('feed > link[rel="self"]').attr('href') || null;
  const entries = $('entry').toArray().map((entry) => {
    const current = $(entry);
    return {
      channelId: current.find('yt\\:channelId').first().text().trim(),
      videoId: current.find('yt\\:videoId').first().text().trim(),
      title: current.find('title').first().text().trim(),
      url: current.find('link[rel="alternate"]').attr('href'),
      publishedAt: current.find('published').first().text().trim(),
      updatedAt: current.find('updated').first().text().trim()
    };
  });
  return { selfTopic, entries };
}

class SqliteYoutubeWebSubRepository {
  constructor(creatorStore) {
    this.creatorStore = creatorStore;
    this.db = creatorStore.db;
    this.initialize();
  }

  initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS creator_youtube_websub_subscriptions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL UNIQUE,
        channel_id TEXT NOT NULL UNIQUE,
        topic TEXT NOT NULL UNIQUE,
        secret_ref TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        lease_expires_at TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(account_id) REFERENCES creator_accounts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_creator_youtube_websub_lease
        ON creator_youtube_websub_subscriptions(status, lease_expires_at);
      CREATE TABLE IF NOT EXISTS creator_youtube_websub_receipts (
        receipt_key TEXT PRIMARY KEY,
        subscription_id TEXT NOT NULL,
        received_at TEXT NOT NULL,
        FOREIGN KEY(subscription_id) REFERENCES creator_youtube_websub_subscriptions(id) ON DELETE CASCADE
      );
    `);
  }

  mapSubscription(row) {
    return row ? {
      id: row.id,
      accountId: row.account_id,
      channelId: row.channel_id,
      topic: row.topic,
      secretRef: row.secret_ref,
      status: row.status,
      leaseExpiresAt: row.lease_expires_at
    } : null;
  }

  findVerifiedAccountByChannelId(channelId) {
    const row = this.db.prepare(`
      SELECT a.*, c.review_status
      FROM creator_accounts a JOIN creators c ON c.id = a.creator_id
      WHERE a.platform = 'youtube' AND a.external_account_id = ?
        AND a.enabled = 1 AND c.review_status = 'verified'
    `).get(channelId);
    if (!row) return null;
    const verticalIds = this.db.prepare(
      'SELECT vertical_id FROM creator_vertical_memberships WHERE creator_id = ? ORDER BY vertical_id'
    ).all(row.creator_id).map((item) => item.vertical_id);
    return {
      id: row.id,
      creatorId: row.creator_id,
      platform: row.platform,
      externalAccountId: row.external_account_id,
      profileUrl: row.profile_url,
      verticalIds,
      backfillState: row.backfill_state
    };
  }

  getSubscriptionByTopic(topic) {
    return this.mapSubscription(this.db.prepare(
      'SELECT * FROM creator_youtube_websub_subscriptions WHERE topic = ?'
    ).get(topic));
  }

  listSubscriptions() {
    return this.db.prepare('SELECT * FROM creator_youtube_websub_subscriptions ORDER BY id')
      .all().map((row) => this.mapSubscription(row));
  }

  saveSubscription(value) {
    this.db.prepare(`
      INSERT INTO creator_youtube_websub_subscriptions (
        id, account_id, channel_id, topic, secret_ref, status, lease_expires_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(topic) DO UPDATE SET
        account_id = excluded.account_id,
        channel_id = excluded.channel_id,
        secret_ref = excluded.secret_ref,
        status = excluded.status,
        lease_expires_at = excluded.lease_expires_at,
        updated_at = excluded.updated_at
    `).run(
      value.id,
      value.accountId,
      value.channelId,
      value.topic,
      value.secretRef,
      value.status,
      value.leaseExpiresAt,
      value.updatedAt || new Date().toISOString()
    );
    return this.getSubscriptionByTopic(value.topic);
  }

  listDueSubscriptions(now, renewBeforeMs = 6 * 60 * 60 * 1000) {
    const boundary = new Date(new Date(now).getTime() + renewBeforeMs).toISOString();
    return this.db.prepare(`
      SELECT * FROM creator_youtube_websub_subscriptions
      WHERE status != 'disabled' AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
      ORDER BY COALESCE(lease_expires_at, ''), id
    `).all(boundary).map((row) => this.mapSubscription(row));
  }

  commitNotification({ subscription, account, receiptKeys, posts, collectedAt }) {
    const insertReceipt = this.db.prepare(`
      INSERT OR IGNORE INTO creator_youtube_websub_receipts (receipt_key, subscription_id, received_at)
      VALUES (?, ?, ?)
    `);
    return this.db.transaction(() => {
      const freshPosts = [];
      let duplicate = 0;
      receiptKeys.forEach((receiptKey, index) => {
        const result = insertReceipt.run(receiptKey, subscription.id, collectedAt);
        if (result.changes === 1) freshPosts.push(posts[index]);
        else duplicate += 1;
      });
      if (freshPosts.length) {
        this.creatorStore.commitPage({
          accountId: account.id,
          cursorKind: 'websub',
          cursor: null,
          exhausted: false,
          posts: freshPosts,
          collectedAt
        });
      }
      return { accepted: freshPosts.length, duplicate };
    })();
  }
}

class YoutubeWebSubService {
  constructor(options = {}) {
    this.repository = options.repository
      || (options.creatorStore ? new SqliteYoutubeWebSubRepository(options.creatorStore) : null);
    if (!this.repository) throw new TypeError('YouTube WebSub repository is required');
    this.env = options.env || process.env;
    this.now = options.now || (() => new Date().toISOString());
    this.allowLegacySignature = options.allowLegacySignature === true;
    this.defaultSecretRef = options.defaultSecretRef || 'AYA_YOUTUBE_WEBSUB_SECRET';
    this.publicBaseUrl = options.publicBaseUrl || this.env.AYA_PUBLIC_BASE_URL || 'https://ainews.xiaotianaya.com';
    this.fetchImpl = createConnectorFetch(options);
    this.hubUrl = options.hubUrl || 'https://pubsubhubbub.appspot.com/subscribe';
    this.timeoutMs = options.timeoutMs || 10000;
  }

  resolveSecret(subscription) {
    const value = this.env[subscription.secretRef];
    return typeof value === 'string' && value ? value : null;
  }

  async verifyChallenge(query) {
    const mode = query['hub.mode'];
    const challenge = query['hub.challenge'];
    const parsed = parseTopic(query['hub.topic']);
    if (!['subscribe', 'unsubscribe'].includes(mode) || typeof challenge !== 'string' || !parsed) {
      throw httpError(400, 'invalid_websub_challenge');
    }
    const account = this.repository.findVerifiedAccountByChannelId(parsed.channelId);
    if (!account) throw httpError(404, 'unknown_youtube_channel');
    const existing = this.repository.getSubscriptionByTopic(parsed.topic);
    if (!existing) throw httpError(404, 'unknown_websub_subscription');
    const leaseSeconds = Math.min(10 * 24 * 60 * 60, Math.max(0, Number(query['hub.lease_seconds']) || 0));
    const leaseExpiresAt = mode === 'subscribe'
      ? new Date(new Date(this.now()).getTime() + leaseSeconds * 1000).toISOString()
      : null;
    this.repository.saveSubscription({
      ...existing,
      accountId: account.id,
      channelId: parsed.channelId,
      topic: parsed.topic,
      status: mode === 'subscribe' ? 'active' : 'disabled',
      leaseExpiresAt,
      updatedAt: this.now()
    });
    return challenge;
  }

  findSignedSubscription(headers, rawBody) {
    const requestedTopic = headers['x-hub-topic'];
    const candidates = requestedTopic
      ? [this.repository.getSubscriptionByTopic(requestedTopic)].filter(Boolean)
      : this.repository.listSubscriptions();
    for (const subscription of candidates) {
      const secret = this.resolveSecret(subscription);
      if (!secret) continue;
      if (secureHexEqual(headers['x-hub-signature-256'], 'sha256', secret, rawBody)) return subscription;
      if (this.allowLegacySignature && secureHexEqual(headers['x-hub-signature'], 'sha1', secret, rawBody)) {
        return subscription;
      }
    }
    throw httpError(401, 'invalid_websub_signature');
  }

  async handleNotification({ rawBody, headers = {} }) {
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) throw httpError(400, 'raw_atom_body_required');
    const normalizedHeaders = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value[0] : value])
    );
    const subscription = this.findSignedSubscription(normalizedHeaders, rawBody);
    const account = this.repository.findVerifiedAccountByChannelId(subscription.channelId);
    if (!account) throw httpError(404, 'unknown_youtube_channel');
    const parsed = parseEntries(rawBody);
    if (parsed.selfTopic && parsed.selfTopic !== subscription.topic) throw httpError(400, 'websub_topic_mismatch');
    if (!parsed.entries.length) return { accepted: 0, duplicate: 0 };
    const collectedAt = this.now();
    const posts = parsed.entries.map((entry) => {
      if (entry.channelId !== subscription.channelId) throw httpError(400, 'websub_channel_mismatch');
      return normalizeCreatorPost({
        externalPostId: entry.videoId,
        url: entry.url || `https://www.youtube.com/watch?v=${encodeURIComponent(entry.videoId)}`,
        title: entry.title,
        text: '',
        contentType: 'video',
        publishedAt: entry.publishedAt,
        editedAt: entry.updatedAt && Date.parse(entry.updatedAt) !== Date.parse(entry.publishedAt)
          ? entry.updatedAt
          : null,
        language: 'und',
        verticalIds: account.verticalIds || [],
        sourceConfidence: 'official',
        provenanceUrl: subscription.topic,
        metrics: null,
        collectedAt
      }, account, { now: collectedAt });
    });
    const receiptKeys = parsed.entries.map((entry) => crypto.createHash('sha256')
      .update(`${subscription.channelId}\u0000${entry.videoId}\u0000${entry.updatedAt || entry.publishedAt}`)
      .digest('hex'));
    return this.repository.commitNotification({ subscription, account, receiptKeys, posts, collectedAt });
  }

  async renewDue(options = {}) {
    if (typeof options.requestSubscription !== 'function') throw new TypeError('requestSubscription is required');
    const due = this.repository.listDueSubscriptions(this.now(), options.renewBeforeMs);
    let requested = 0;
    for (const subscription of due) {
      const request = {
        id: subscription.id,
        accountId: subscription.accountId,
        channelId: subscription.channelId,
        topic: subscription.topic,
        callback: `${this.publicBaseUrl.replace(/\/$/, '')}/api/ingest/v1/youtube/websub`,
        secretRef: subscription.secretRef,
        mode: 'subscribe'
      };
      await options.requestSubscription(request);
      this.repository.saveSubscription({ ...subscription, status: 'pending', updatedAt: this.now() });
      requested += 1;
    }
    return { requested };
  }

  async requestSubscription(request) {
    const secret = this.env[request.secretRef];
    if (typeof secret !== 'string' || !secret) throw httpError(503, 'websub_secret_unconfigured');
    const callback = new URL(request.callback);
    if (callback.protocol !== 'https:') throw httpError(400, 'websub_callback_must_be_https');
    const body = new URLSearchParams({
      'hub.callback': callback.toString(),
      'hub.topic': request.topic,
      'hub.verify': 'async',
      'hub.mode': request.mode || 'subscribe',
      'hub.secret': secret,
      'hub.lease_seconds': String(request.leaseSeconds || 7 * 24 * 60 * 60)
    });
    const response = await fetchWithTimeout(this.fetchImpl, this.hubUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    }, this.timeoutMs);
    if (response.status < 200 || response.status >= 300) {
      throw httpError(502, `websub_hub_http_${response.status}`);
    }
    return { accepted: true, status: response.status };
  }
}

module.exports = YoutubeWebSubService;
module.exports.SqliteYoutubeWebSubRepository = SqliteYoutubeWebSubRepository;
module.exports.parseTopic = parseTopic;
