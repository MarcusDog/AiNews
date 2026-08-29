const crypto = require('node:crypto');
const dns = require('node:dns');
const https = require('node:https');
const net = require('node:net');

const BLOCKED_V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4]
];
const BLOCKED_V6 = [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32]
];

const blockList = new net.BlockList();
for (const [address, prefix] of BLOCKED_V4) blockList.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of BLOCKED_V6) blockList.addSubnet(address, prefix, 'ipv6');

function isPublicAddress(address, family) {
  const normalizedFamily = Number(family) === 6 || net.isIPv6(address) ? 'ipv6' : 'ipv4';
  if (!net.isIP(address)) return false;
  if (normalizedFamily === 'ipv6') {
    const mapped = String(address).match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (mapped) return isPublicAddress(mapped, 4);
  }
  return !blockList.check(address, normalizedFamily);
}

function allowedPorts(value) {
  const entries = Array.isArray(value) ? value : String(value || '').split(',');
  return new Set(['443', ...entries.map((item) => String(item).trim()).filter((item) => /^\d+$/.test(item))]);
}

async function validateWebhookDestination(destination, options = {}) {
  let url;
  try { url = new URL(destination); } catch { throw new TypeError('webhook_invalid_url'); }
  if (url.protocol !== 'https:') throw new TypeError('webhook_https_required');
  if (url.username || url.password) throw new TypeError('webhook_userinfo_forbidden');
  if (net.isIP(url.hostname.replace(/^\[|\]$/g, ''))) throw new TypeError('webhook_ip_literal_forbidden');
  const port = url.port || '443';
  if (!allowedPorts(options.allowedPorts).has(port)) throw new TypeError('webhook_port_forbidden');
  const lookup = options.lookup || dns.promises.lookup;
  let records;
  try { records = await lookup(url.hostname, { all: true, verbatim: true }); }
  catch { throw new TypeError('webhook_dns_failed'); }
  const addresses = Array.isArray(records) ? records : [records];
  if (!addresses.length || addresses.some((record) => !isPublicAddress(record?.address, record?.family))) {
    throw new TypeError('webhook_private_address');
  }
  return { url, address: addresses[0].address, family: Number(addresses[0].family) || net.isIP(addresses[0].address) };
}

function createLimiter(limit) {
  let active = 0;
  const waiting = [];
  return async (task) => {
    if (active >= limit) await new Promise((resolve) => waiting.push(resolve));
    active += 1;
    try { return await task(); }
    finally { active -= 1; waiting.shift()?.(); }
  };
}

function createWebhookTransport(options = {}) {
  const lookup = options.lookup || dns.promises.lookup;
  const request = options.request || https.request;
  const now = options.now || (() => new Date().toISOString());
  const resolveSecret = options.secretResolver || ((reference) => {
    const match = String(reference || '').match(/^env:(AYA_CREATOR_WEBHOOK_[A-Z0-9_]+)$/);
    return match ? process.env[match[1]] : null;
  });
  const timeoutMs = Math.max(Number(options.timeoutMs || 10_000), 100);
  const maxResponseBytes = Math.max(Number(options.maxResponseBytes || 65_536), 1024);
  const maxBodyBytes = Math.max(Number(options.maxBodyBytes || 262_144), 1024);
  const runLimited = createLimiter(Math.max(Number(options.concurrency || 4), 1));

  return async function webhookTransport(delivery = {}) {
    return runLimited(async () => {
      const endpoint = delivery.endpoint || {};
      const target = await validateWebhookDestination(endpoint.destination, {
        lookup, allowedPorts: options.allowedPorts || process.env.AYA_WEBHOOK_ALLOWED_PORTS
      });
      const secret = await resolveSecret(endpoint.secretRef, endpoint);
      if (!secret) return { status: 503, error: 'webhook_secret_unconfigured' };
      const timestamp = now();
      const payload = JSON.stringify({
        version: 1,
        deliveryId: delivery.outboxId,
        event: delivery.event
      });
      if (Buffer.byteLength(payload) > maxBodyBytes) throw new Error('webhook_payload_too_large');
      const signature = crypto.createHmac('sha256', String(secret)).update(`${timestamp}.${payload}`).digest('hex');
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          callback(value);
        };
        const pinnedLookup = (hostname, lookupOptions, callback) => callback(null, target.address, target.family);
        const req = request({
          protocol: 'https:', hostname: target.url.hostname, port: target.url.port || 443,
          path: `${target.url.pathname}${target.url.search}`, method: 'POST', servername: target.url.hostname,
          lookup: pinnedLookup, rejectUnauthorized: true,
          headers: {
            'content-type': 'application/json', 'content-length': Buffer.byteLength(payload),
            'user-agent': 'AyaNews-Creator-Webhook/1.0',
            'x-aya-timestamp': timestamp,
            'x-aya-event-id': String(delivery.event?.id || ''),
            'x-aya-delivery-id': String(delivery.outboxId || ''),
            'x-aya-signature': `sha256=${signature}`
          }
        }, (response) => {
          let received = 0;
          response.on('data', (chunk) => {
            received += Buffer.byteLength(chunk);
            if (received > maxResponseBytes) {
              req.destroy();
              finish(reject, new Error('webhook_response_too_large'));
            }
          });
          response.on('error', (error) => finish(reject, new Error(`webhook_response_error:${error.message}`)));
          response.on('end', () => finish(resolve, {
            status: Number(response.statusCode || 0),
            retryAfter: response.headers?.['retry-after'] || null
          }));
        });
        req.setTimeout(timeoutMs, () => {
          req.destroy();
          finish(reject, new Error('webhook_timeout'));
        });
        req.on('error', (error) => finish(reject, new Error(`webhook_network_error:${error.message}`)));
        req.write(payload);
        req.end();
      });
    });
  };
}

module.exports = { createWebhookTransport, validateWebhookDestination, isPublicAddress };
