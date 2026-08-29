const CHANNEL_CONFIG = Object.freeze({
  feishu: 'AYA_FEISHU_WEBHOOK_URL',
  wecom: 'AYA_WECOM_WEBHOOK_URL',
  dingtalk: 'AYA_DINGTALK_WEBHOOK_URL',
  telegram: 'AYA_TELEGRAM_WEBHOOK_URL',
  ntfy: 'AYA_NTFY_WEBHOOK_URL',
  bark: 'AYA_BARK_WEBHOOK_URL'
});

function createGenericMessageTransport(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetch || globalThis.fetch;
  return async function genericMessageTransport(delivery = {}) {
    const type = delivery.endpoint?.type;
    const key = CHANNEL_CONFIG[type];
    const configuredUrl = key ? env[key] : null;
    if (!configuredUrl) return { status: 503, error: `transport_unconfigured:${type || 'unknown'}` };
    const response = await fetchImpl(configuredUrl, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/json', 'user-agent': 'AyaNews-Creator-Alerts/1.0' },
      body: JSON.stringify({ deliveryId: delivery.outboxId, event: delivery.event })
    });
    return { status: response.status, retryAfter: response.headers?.get?.('retry-after') || null };
  };
}

module.exports = { CHANNEL_CONFIG, createGenericMessageTransport };
