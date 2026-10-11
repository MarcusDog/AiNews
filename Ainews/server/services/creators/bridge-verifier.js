const crypto = require('node:crypto');

function bridgeError(statusCode, code) {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function header(headers, name) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function secureSignatureEqual(signatureHeader, expected, compare = crypto.timingSafeEqual) {
  const match = /^sha256=([a-f0-9]{64})$/i.exec(String(signatureHeader || ''));
  let actual = Buffer.alloc(expected.length);
  let structurallyValid = false;
  if (match) {
    actual = Buffer.from(match[1], 'hex');
    structurallyValid = actual.length === expected.length;
  }
  if (actual.length !== expected.length) actual = Buffer.alloc(expected.length);
  const equal = compare(expected, actual);
  return structurallyValid && equal;
}

class BridgeVerifier {
  constructor(options = {}) {
    if (!options.sourceRegistry) throw new TypeError('sourceRegistry is required');
    this.sourceRegistry = options.sourceRegistry;
    this.now = options.now || Date.now;
    this.maxAgeMs = Number(options.maxAgeMs || 5 * 60 * 1000);
  }

  verify({ rawBody, headers = {} } = {}) {
    if (!Buffer.isBuffer(rawBody)) throw bridgeError(400, 'raw_body_required');
    const sourceId = String(header(headers, 'x-aya-source-id') || '').trim();
    const source = this.sourceRegistry.getBridgeAuthorization(sourceId);
    if (!source) throw bridgeError(401, 'unknown_source');
    if (!source.configured || !source.secret) throw bridgeError(503, 'source_unconfigured');

    const nonce = String(header(headers, 'x-aya-nonce') || '').trim();
    if (!/^[A-Za-z0-9._:-]{8,160}$/.test(nonce)) throw bridgeError(400, 'invalid_nonce');
    const timestampText = String(header(headers, 'x-aya-timestamp') || '').trim();
    if (!/^\d{10,13}$/.test(timestampText)) throw bridgeError(400, 'invalid_timestamp');
    const numeric = Number(timestampText);
    const timestampMs = timestampText.length === 10 ? numeric * 1000 : numeric;
    if (!Number.isFinite(timestampMs) || Math.abs(this.now() - timestampMs) > this.maxAgeMs) {
      throw bridgeError(401, 'stale_timestamp');
    }

    const bodySha256 = crypto.createHash('sha256').update(rawBody).digest('hex');
    const expected = crypto.createHmac('sha256', source.secret)
      .update(`${timestampText}.${nonce}.${bodySha256}`)
      .digest();
    if (!secureSignatureEqual(header(headers, 'x-aya-signature'), expected)) {
      throw bridgeError(401, 'invalid_signature');
    }
    return {
      source: {
        id: source.id,
        adapter: source.adapter,
        bindings: source.bindings.map((binding) => ({ ...binding }))
      },
      nonce,
      timestampMs,
      bodySha256
    };
  }
}

module.exports = {
  BridgeVerifier,
  bridgeError,
  secureSignatureEqual
};
