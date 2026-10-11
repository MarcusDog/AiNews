const crypto = require('node:crypto');
const express = require('express');
const { normalizeCreatorPost } = require('../services/creators/creator-normalizer');

function ingestError(statusCode, code) {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function parsePayload(rawBody) {
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw ingestError(400, 'invalid_json');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw ingestError(422, 'invalid_payload');
  }
  if (payload.version !== 1) throw ingestError(422, 'unsupported_payload_version');
  if (typeof payload.platform !== 'string' || !payload.platform.trim()) {
    throw ingestError(422, 'platform_required');
  }
  if (typeof payload.externalAccountId !== 'string' || !payload.externalAccountId.trim()) {
    throw ingestError(422, 'external_account_id_required');
  }
  if (!Array.isArray(payload.items) || payload.items.length > 500) {
    throw ingestError(422, 'items_must_be_array_at_most_500');
  }
  return payload;
}

function safeMetrics(metrics) {
  return {
    views: metrics.views,
    likes: metrics.likes,
    comments: metrics.comments,
    shares: metrics.shares,
    bookmarks: metrics.bookmarks,
    platformRank: metrics.platformRank,
    followersAtCapture: metrics.followersAtCapture
  };
}

function safePayload(payload, posts) {
  return {
    version: 1,
    platform: payload.platform.trim().toLowerCase(),
    externalAccountId: payload.externalAccountId.trim(),
    nextCursor: payload.nextCursor ?? null,
    exhausted: payload.exhausted === true,
    items: posts.map((post) => ({
      externalPostId: post.externalPostId,
      url: post.url,
      title: post.title,
      text: post.text,
      contentType: post.contentType,
      publishedAt: post.publishedAt,
      editedAt: post.editedAt,
      language: post.language,
      metrics: safeMetrics(post.metrics)
    }))
  };
}

function mapError(error) {
  if (error?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
    || error?.code === 'SQLITE_CONSTRAINT_UNIQUE'
    || /UNIQUE constraint failed: creator_bridge_nonces/i.test(error?.message || '')) {
    return ingestError(409, 'nonce_replayed');
  }
  if (error?.statusCode) return error;
  if (error instanceof TypeError) return ingestError(422, 'invalid_payload_schema');
  return error;
}

function createCreatorIngestRouter(options = {}) {
  const { creatorStore, sourceRegistry, verifier } = options;
  if (!creatorStore || !sourceRegistry || !verifier) {
    throw new TypeError('creatorStore, sourceRegistry and verifier are required');
  }
  const now = options.now || (() => new Date().toISOString());
  const router = express.Router();
  const rawParser = options.mountRawParser === false
    ? []
    : [express.raw({ type: 'application/json', limit: '2mb' })];
  router.post(
    '/',
    ...rawParser,
    (req, res) => {
      try {
        const verified = verifier.verify({ rawBody: req.body, headers: req.headers });
        const payload = parsePayload(req.body);
        const platform = payload.platform.trim().toLowerCase();
        const externalAccountId = payload.externalAccountId.trim();
        if (!sourceRegistry.isBridgeBindingAllowed(verified.source.id, platform, externalAccountId)) {
          throw ingestError(403, 'source_account_not_allowed');
        }
        const account = creatorStore.findVerifiedAccount(platform, externalAccountId);
        if (!account) throw ingestError(403, 'account_not_verified');
        const collectedAt = now();
        const posts = payload.items.map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw ingestError(422, 'invalid_item');
          }
          if (item.visibility !== undefined && item.visibility !== 'public') {
            throw ingestError(422, 'non_public_item_rejected');
          }
          if (item.deleted === true || item.deletedAt) {
            throw ingestError(422, 'deleted_item_rejected');
          }
          return normalizeCreatorPost({
            externalPostId: item.externalPostId,
            url: item.url,
            title: item.title,
            text: item.text,
            contentType: item.contentType,
            publishedAt: item.publishedAt,
            editedAt: item.editedAt,
            language: item.language,
            verticalIds: Array.isArray(item.verticalIds) ? item.verticalIds : account.verticalIds,
            sourceConfidence: 'bridge',
            provenanceUrl: item.provenanceUrl || item.url,
            metrics: item.metrics
          }, account, { now: collectedAt, collectedAt });
        });
        const runId = crypto.randomUUID();
        const payloadId = crypto.randomUUID();
        const result = creatorStore.commitBridgeBatch({
          sourceId: verified.source.id,
          nonce: verified.nonce,
          runId,
          payloadId,
          accountId: account.id,
          receivedAt: collectedAt,
          bodySha256: verified.bodySha256,
          safePayload: safePayload(payload, posts),
          posts,
          nextCursor: payload.nextCursor ?? null,
          exhausted: payload.exhausted === true,
          runMetadata: { adapter: verified.source.adapter, ingestionMode: 'signed-sidecar' }
        });
        sourceRegistry.markBridgeSuccess(verified.source.id);
        res.status(202).json({
          success: true,
          result: {
            accepted: result.inserted,
            updated: result.updated,
            rejected: 0,
            nextExpectedCursor: payload.nextCursor ?? null
          }
        });
      } catch (rawError) {
        const error = mapError(rawError);
        const status = Number(error.statusCode) || 500;
        res.status(status).json({
          success: false,
          error: status >= 500 ? 'creator_bridge_internal_error' : error.code || error.message
        });
      }
    }
  );
  router.use((error, req, res, next) => {
    if (error?.type === 'entity.too.large' || error?.status === 413) {
      res.status(413).json({ success: false, error: 'payload_too_large' });
      return;
    }
    next(error);
  });
  return router;
}

module.exports = {
  createCreatorIngestRouter,
  parsePayload,
  safePayload
};
