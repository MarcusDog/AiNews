const net = require('node:net');

const DEFAULT_PUBLIC_ORIGIN = 'http://localhost:3002';

function configurationError(name, message) {
  const error = new Error(`${name}: ${message}`);
  error.code = 'INVALID_SECURITY_CONFIGURATION';
  return error;
}

function canonicalOrigin(value, name, options = {}) {
  if (typeof value !== 'string' || !value || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    throw configurationError(name, 'must be a non-empty origin without whitespace or control characters');
  }
  if (value.includes('*') || value.includes('\\')) {
    throw configurationError(name, 'wildcards and backslashes are not allowed');
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw configurationError(name, 'must be an absolute HTTP(S) origin');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      !url.hostname || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw configurationError(name, 'must contain only an HTTP(S) scheme, host, and optional port');
  }
  if (options.requireHttps && url.protocol !== 'https:') {
    throw configurationError(name, 'must use HTTPS in production');
  }
  return url.origin;
}

function parseAllowedOrigins(rawValue, publicOrigin, requireHttps) {
  if (rawValue !== undefined && /[\u0000-\u001f\u007f]/.test(String(rawValue))) {
    throw configurationError('ALLOWED_ORIGINS', 'must not contain control characters');
  }
  const configured = rawValue === undefined ? [] : String(rawValue).split(',');
  if (configured.some((value) => !value.trim())) {
    throw configurationError('ALLOWED_ORIGINS', 'must not contain empty entries');
  }
  const origins = [publicOrigin];
  for (const value of configured) {
    const origin = canonicalOrigin(value.trim(), 'ALLOWED_ORIGINS', { requireHttps });
    if (!origins.includes(origin)) origins.push(origin);
  }
  return origins;
}

function isAllowedProxyEntry(value) {
  const addressPart = value.includes('/') ? value.slice(0, value.lastIndexOf('/')) : value;
  if (net.isIP(addressPart) === 6) {
    try {
      const canonical = new URL(`http://[${addressPart}]`).hostname.slice(1, -1).toLowerCase();
      if (canonical.startsWith('::ffff:')) return false;
    } catch {
      return false;
    }
  }
  if (net.isIP(value)) return true;
  const slash = value.lastIndexOf('/');
  if (slash <= 0) return false;
  const address = value.slice(0, slash);
  const prefix = Number(value.slice(slash + 1));
  const version = net.isIP(address);
  if (!version || !Number.isInteger(prefix)) return false;
  if (version === 4) return prefix >= 8 && prefix <= 32;
  return prefix >= 96 && prefix <= 128;
}

function parseTrustProxy(rawValue) {
  const raw = rawValue === undefined ? 'direct' : String(rawValue);
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    throw configurationError('TRUST_PROXY', 'must not contain control characters');
  }
  if (raw === 'direct' || raw === 'false') {
    return { proxyMode: 'direct', trustProxy: false };
  }
  if (raw === 'loopback') {
    return { proxyMode: 'loopback', trustProxy: ['loopback'] };
  }
  const entries = raw.split(',').map((value) => value.trim());
  if (!entries.length || entries.some((value) => !value || !isAllowedProxyEntry(value))) {
    throw configurationError('TRUST_PROXY', 'must be direct, loopback, or an explicit IP/CIDR allowlist');
  }
  return { proxyMode: 'allowlist', trustProxy: entries };
}

function loadSecurityConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const configuredPublicOrigin = env.PUBLIC_ORIGIN || env.AYA_PUBLIC_BASE_URL;
  if (production && !configuredPublicOrigin) {
    throw configurationError('PUBLIC_ORIGIN', 'is required in production');
  }
  const publicOrigin = canonicalOrigin(
    configuredPublicOrigin || DEFAULT_PUBLIC_ORIGIN,
    'PUBLIC_ORIGIN',
    { requireHttps: production }
  );
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS, publicOrigin, production);
  const allowedOriginSet = new Set(allowedOrigins);
  const { proxyMode, trustProxy } = parseTrustProxy(env.TRUST_PROXY);
  const isOriginAllowed = (origin) => origin === undefined || allowedOriginSet.has(origin);

  return {
    publicOrigin,
    allowedOrigins,
    proxyMode,
    trustProxy,
    isOriginAllowed,
    corsOptions: {
      credentials: true,
      origin(origin, callback) {
        callback(null, isOriginAllowed(origin));
      }
    }
  };
}

module.exports = {
  canonicalOrigin,
  loadSecurityConfig,
  parseTrustProxy
};
