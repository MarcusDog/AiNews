const crypto = require('node:crypto');

const DELIVERY_MODES = new Set(['immediate', 'digest']);
const ENDPOINT_TYPES = new Set(['in_app', 'webhook', 'email', 'feishu', 'wecom', 'dingtalk', 'telegram', 'ntfy', 'bark', 'test']);

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function json(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function uniqueStrings(value, max = 100) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw new TypeError('invalid_filter');
  return [...new Set(value.map((item) => String(item || '').normalize('NFKC').trim()).filter(Boolean))];
}

function normalizeFilters(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('invalid_filters');
  const minimumScore = value.minimumScore === undefined || value.minimumScore === null
    ? null
    : Number(value.minimumScore);
  if (minimumScore !== null && (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 100)) {
    throw new TypeError('invalid_minimum_score');
  }
  return {
    verticals: uniqueStrings(value.verticals),
    platforms: uniqueStrings(value.platforms),
    creators: uniqueStrings(value.creators),
    eventTypes: uniqueStrings(value.eventTypes),
    minimumScore
  };
}

function parseClock(value, fallback) {
  const text = value === undefined ? fallback : String(value);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new TypeError('invalid_quiet_hours');
  const [hour, minute] = text.split(':').map(Number);
  return { text, minutes: hour * 60 + minute, hour, minute };
}

function normalizeQuietHours(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('invalid_quiet_hours');
  const timezone = String(value.timezone || 'Asia/Shanghai');
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date()); } catch { throw new TypeError('invalid_timezone'); }
  const enabled = typeof value.enabled === 'boolean'
    ? value.enabled
    : value.start !== undefined || value.end !== undefined;
  return {
    enabled,
    timezone,
    start: parseClock(value.start, '23:00').text,
    end: parseClock(value.end, '07:00').text,
    digestAt: parseClock(value.digestAt, '08:00').text
  };
}

function zonedParts(timestamp, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(timestamp));
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function zonedLocalToUtc(parts, timezone) {
  let guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  for (let index = 0; index < 3; index += 1) {
    const observed = zonedParts(guess, timezone);
    const observedUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
    const desiredUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    guess += desiredUtc - observedUtc;
  }
  return new Date(guess).toISOString();
}

function plusLocalDays(parts, days) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function nextAttemptAt(subscription, occurredAt) {
  const quiet = normalizeQuietHours(subscription.quietHours || {});
  const local = zonedParts(occurredAt, quiet.timezone);
  const currentMinutes = local.hour * 60 + local.minute;
  const start = parseClock(quiet.start).minutes;
  const end = parseClock(quiet.end).minutes;
  if (subscription.deliveryMode === 'digest') {
    const digest = parseClock(quiet.digestAt);
    const day = currentMinutes < digest.minutes ? plusLocalDays(local, 0) : plusLocalDays(local, 1);
    return zonedLocalToUtc({ ...day, hour: digest.hour, minute: digest.minute }, quiet.timezone);
  }
  if (!quiet.enabled) return new Date(occurredAt).toISOString();
  const inQuiet = start < end
    ? currentMinutes >= start && currentMinutes < end
    : currentMinutes >= start || currentMinutes < end;
  if (!inQuiet) return new Date(occurredAt).toISOString();
  const endClock = parseClock(quiet.end);
  const day = start < end || currentMinutes >= start ? plusLocalDays(local, start < end ? 0 : 1) : plusLocalDays(local, 0);
  return zonedLocalToUtc({ ...day, hour: endClock.hour, minute: endClock.minute }, quiet.timezone);
}

function matches(filters, event) {
  const includes = (list, value) => !list.length || (value !== null && value !== undefined && list.includes(String(value)));
  return includes(filters.verticals, event.verticalId)
    && includes(filters.platforms, event.platform)
    && includes(filters.creators, event.creatorId ?? event.payload?.creatorId)
    && includes(filters.eventTypes, event.eventType)
    && (filters.minimumScore === null || Number(event.score) >= filters.minimumScore);
}

function mapSubscription(row, endpointIds = []) {
  return {
    id: row.id, userId: row.user_id, name: row.name,
    filters: normalizeFilters(parseJson(row.filters_json, {})),
    deliveryMode: row.delivery_mode,
    quietHours: normalizeQuietHours(parseJson(row.quiet_hours_json, {})),
    endpointIds, enabled: Number(row.enabled) === 1,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

class SubscriptionService {
  constructor(options = {}) {
    if (!options.store?.db) throw new TypeError('initialized store required');
    this.store = options.store;
    this.now = options.now || (() => new Date().toISOString());
  }

  createEndpoint(userId, input = {}) {
    if (!userId || !ENDPOINT_TYPES.has(input.type) || !input.destination) throw new TypeError('invalid_endpoint');
    const id = input.id || `endpoint_${crypto.randomUUID()}`;
    const timestamp = this.now();
    this.store.db.prepare(`
      INSERT INTO creator_delivery_endpoints (id, user_id, type, destination, secret_ref, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, input.type, String(input.destination), input.secretRef || null, input.enabled === false ? 0 : 1, timestamp, timestamp);
    return this.getEndpoint(userId, id);
  }

  getEndpoint(userId, id) {
    const row = this.store.db.prepare('SELECT * FROM creator_delivery_endpoints WHERE id = ? AND user_id = ?').get(id, userId);
    return row ? { id: row.id, type: row.type, destination: row.destination, enabled: Number(row.enabled) === 1, createdAt: row.created_at, updatedAt: row.updated_at } : null;
  }

  listEndpoints(userId) {
    return this.store.db.prepare('SELECT * FROM creator_delivery_endpoints WHERE user_id = ? ORDER BY created_at, id').all(userId)
      .map((row) => ({ id: row.id, type: row.type, destination: row.destination, enabled: Number(row.enabled) === 1, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  updateEndpoint(userId, id, patch = {}) {
    const current = this.store.db.prepare('SELECT * FROM creator_delivery_endpoints WHERE id = ? AND user_id = ?').get(id, userId);
    if (!current) return null;
    const type = patch.type ?? current.type;
    const destination = patch.destination ?? current.destination;
    if (!ENDPOINT_TYPES.has(type) || !destination) throw new TypeError('invalid_endpoint');
    this.store.db.prepare(`UPDATE creator_delivery_endpoints SET type=?, destination=?, secret_ref=?, enabled=?, updated_at=? WHERE id=? AND user_id=?`)
      .run(type, String(destination), patch.secretRef ?? current.secret_ref, patch.enabled === undefined ? current.enabled : patch.enabled ? 1 : 0, this.now(), id, userId);
    return this.getEndpoint(userId, id);
  }

  deleteEndpoint(userId, id) {
    return this.store.db.prepare('DELETE FROM creator_delivery_endpoints WHERE id = ? AND user_id = ?').run(id, userId).changes;
  }

  createSubscription(userId, input = {}) {
    if (!userId || !input.name || !DELIVERY_MODES.has(input.deliveryMode)) throw new TypeError('invalid_subscription');
    const filters = normalizeFilters(input.filters || {});
    const quietHours = normalizeQuietHours(input.quietHours || {});
    const endpointIds = uniqueStrings(input.endpointIds);
    if (!endpointIds.length) throw new TypeError('endpoint_required');
    const owned = this.store.db.prepare('SELECT id FROM creator_delivery_endpoints WHERE user_id = ? AND id = ?');
    for (const endpointId of endpointIds) if (!owned.get(userId, endpointId)) throw new TypeError('endpoint_not_owned');
    const id = input.id || `subscription_${crypto.randomUUID()}`;
    const timestamp = this.now();
    const transaction = this.store.db.transaction(() => {
      this.store.db.prepare(`
        INSERT INTO creator_subscriptions (id, user_id, name, filters_json, delivery_mode, quiet_hours_json, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, userId, String(input.name).slice(0, 200), json(filters, {}), input.deliveryMode, json(quietHours, {}), input.enabled === false ? 0 : 1, timestamp, timestamp);
      const link = this.store.db.prepare('INSERT INTO creator_subscription_endpoints (subscription_id, endpoint_id, created_at) VALUES (?, ?, ?)');
      for (const endpointId of endpointIds) link.run(id, endpointId, timestamp);
    });
    transaction();
    return this.getSubscription(userId, id);
  }

  getSubscription(userId, id) {
    const row = this.store.db.prepare('SELECT * FROM creator_subscriptions WHERE id = ? AND user_id = ?').get(id, userId);
    if (!row) return null;
    const endpointIds = this.store.db.prepare('SELECT endpoint_id FROM creator_subscription_endpoints WHERE subscription_id = ? ORDER BY endpoint_id').all(id).map((item) => item.endpoint_id);
    return mapSubscription(row, endpointIds);
  }

  listSubscriptions(userId) {
    return this.store.db.prepare('SELECT * FROM creator_subscriptions WHERE user_id = ? ORDER BY created_at, id').all(userId)
      .map((row) => this.getSubscription(userId, row.id));
  }

  updateSubscription(userId, id, patch = {}) {
    const current = this.getSubscription(userId, id);
    if (!current) return null;
    const transaction = this.store.db.transaction(() => {
      const filters = patch.filters === undefined ? current.filters : normalizeFilters(patch.filters);
      const quietHours = patch.quietHours === undefined ? current.quietHours : normalizeQuietHours(patch.quietHours);
      const mode = patch.deliveryMode ?? current.deliveryMode;
      if (!DELIVERY_MODES.has(mode)) throw new TypeError('invalid_subscription');
      this.store.db.prepare('UPDATE creator_subscriptions SET name=?, filters_json=?, delivery_mode=?, quiet_hours_json=?, enabled=?, updated_at=? WHERE id=? AND user_id=?')
        .run(String(patch.name ?? current.name).slice(0, 200), json(filters, {}), mode, json(quietHours, {}), patch.enabled === undefined ? current.enabled ? 1 : 0 : patch.enabled ? 1 : 0, this.now(), id, userId);
      if (patch.endpointIds !== undefined) {
        const endpointIds = uniqueStrings(patch.endpointIds);
        if (!endpointIds.length) throw new TypeError('endpoint_required');
        const owned = this.store.db.prepare('SELECT id FROM creator_delivery_endpoints WHERE user_id = ? AND id = ?');
        for (const endpointId of endpointIds) if (!owned.get(userId, endpointId)) throw new TypeError('endpoint_not_owned');
        this.store.db.prepare('DELETE FROM creator_subscription_endpoints WHERE subscription_id = ?').run(id);
        const link = this.store.db.prepare('INSERT INTO creator_subscription_endpoints (subscription_id, endpoint_id, created_at) VALUES (?, ?, ?)');
        for (const endpointId of endpointIds) link.run(id, endpointId, this.now());
      }
    });
    transaction();
    return this.getSubscription(userId, id);
  }

  deleteSubscription(userId, id) {
    return this.store.db.prepare('DELETE FROM creator_subscriptions WHERE id = ? AND user_id = ?').run(id, userId).changes;
  }

  matchEvent(event, occurredAt = this.now()) {
    const rows = this.store.db.prepare(`
      SELECT s.*, e.id AS endpoint_id
      FROM creator_subscriptions s
      JOIN creator_subscription_endpoints se ON se.subscription_id = s.id
      JOIN creator_delivery_endpoints e ON e.id = se.endpoint_id
      WHERE s.enabled = 1 AND e.enabled = 1
      ORDER BY s.id, e.id
    `).all();
    return rows.flatMap((row) => {
      const subscription = mapSubscription(row, [row.endpoint_id]);
      if (!matches(subscription.filters, event)) return [];
      return [{ subscriptionId: row.id, endpointId: row.endpoint_id, nextAttemptAt: nextAttemptAt(subscription, occurredAt) }];
    });
  }
}

module.exports = SubscriptionService;
module.exports.matches = matches;
module.exports.nextAttemptAt = nextAttemptAt;
module.exports.normalizeFilters = normalizeFilters;
