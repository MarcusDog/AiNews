const net = require('node:net');

const MAX_USER_AGENT_LENGTH = 512;

function normalizeIp(value) {
  if (typeof value !== 'string' || !value || value.includes('%') || value.includes(',')) return null;
  const candidate = value.trim();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(candidate);
  if (mapped && net.isIP(mapped[1]) === 4) return mapped[1];
  const version = net.isIP(candidate);
  if (version === 4) return candidate;
  if (version !== 6) return null;
  try {
    return new URL(`http://[${candidate}]`).hostname.slice(1, -1).toLowerCase();
  } catch {
    return null;
  }
}

function normalizeUserAgent(value) {
  if (typeof value !== 'string') return null;
  const sanitized = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, MAX_USER_AGENT_LENGTH);
  return sanitized || null;
}

function getRequestContext(req) {
  return {
    ipAddress: normalizeIp(req?.ip),
    ips: Array.isArray(req?.ips) ? req.ips.map(normalizeIp).filter(Boolean) : [],
    userAgent: normalizeUserAgent(req?.headers?.['user-agent'])
  };
}

function requestContext(req, res, next) {
  req.requestContext = getRequestContext(req);
  next();
}

module.exports = {
  getRequestContext,
  normalizeIp,
  requestContext
};
