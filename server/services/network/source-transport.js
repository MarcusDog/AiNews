const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

function resolveProxyUrl(env = process.env) {
  return env.AYA_SOURCE_PROXY_URL
    || env.HTTPS_PROXY
    || env.https_proxy
    || env.HTTP_PROXY
    || env.http_proxy
    || null;
}

function redactNetworkText(value) {
  return String(value || '')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/([?&](?:token|api[_-]?key|access[_-]?token|key)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/(Authorization:\s*)[^\r\n]+/gi, '$1[redacted]')
    .replace(/(Bearer\s+)[a-z0-9._~+\/-]+/gi, '$1[redacted]');
}

function classifySourceError(error = {}) {
  const status = Number(error.response?.status || error.status) || null;
  const systemCode = String(error.code || '').toUpperCase();
  if (['ENOTFOUND', 'EAI_AGAIN', 'ENODATA'].includes(systemCode)) {
    return { code: 'dns_failure', status, retryable: true };
  }
  if (['ECONNABORTED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'ABORT_ERR'].includes(systemCode)) {
    return { code: 'timeout', status, retryable: true };
  }
  if (['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'].includes(systemCode)) {
    return { code: 'connection_failure', status, retryable: true };
  }
  if (status === 429) return { code: 'rate_limited', status, retryable: true };
  if (status >= 500) return { code: 'upstream_server_error', status, retryable: true };
  if (status >= 400) return { code: 'upstream_client_error', status, retryable: false };
  return { code: 'network_failure', status, retryable: true };
}

function wait(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSourceTransport(options = {}) {
  const env = options.env || process.env;
  const axiosImpl = options.axiosImpl || axios;
  const proxyUrl = resolveProxyUrl(env);
  const mode = String(env.AYA_SOURCE_NETWORK_MODE || (proxyUrl ? 'proxy-first' : 'direct-only')).toLowerCase();
  const retries = Math.max(0, Math.min(Number(options.retries ?? env.AYA_SOURCE_RETRIES ?? 2) || 0, 5));
  const retryDelayMs = Math.max(0, Math.min(Number(options.retryDelayMs ?? 250), 5000));
  const agentFactory = options.agentFactory || ((url) => new HttpsProxyAgent(url));
  const proxyAgent = proxyUrl ? agentFactory(proxyUrl) : null;
  const routes = mode === 'proxy-only'
    ? ['proxy']
    : mode === 'direct-first' && proxyAgent
      ? ['direct', 'proxy']
      : mode === 'proxy-first' && proxyAgent
        ? ['proxy', 'direct']
        : ['direct'];

  async function get(url, requestOptions = {}) {
    let lastFailure;
    for (const route of routes) {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const routeOptions = route === 'proxy'
            ? { httpsAgent: proxyAgent, httpAgent: proxyAgent, proxy: false }
            : { proxy: false };
          return await axiosImpl.get(url, {
            timeout: Number(requestOptions.timeout) || Number(env.AYA_SOURCE_TIMEOUT_MS) || 15000,
            maxRedirects: 5,
            ...requestOptions,
            ...routeOptions
          });
        } catch (error) {
          const classification = classifySourceError(error);
          lastFailure = new Error(`source request failed: ${classification.code}`);
          lastFailure.name = 'SourceNetworkError';
          lastFailure.code = classification.code;
          lastFailure.status = classification.status;
          lastFailure.retryable = classification.retryable;
          lastFailure.route = route;
          lastFailure.safeDetail = redactNetworkText(error.message || classification.code).slice(0, 300);
          if (!classification.retryable || attempt === retries) break;
          await wait(retryDelayMs * (attempt + 1));
        }
      }
    }
    throw lastFailure || new Error('source request failed: network_failure');
  }

  return {
    get,
    describe() {
      return {
        mode,
        proxyConfigured: Boolean(proxyAgent),
        routes: [...routes],
        retries
      };
    }
  };
}

function getSourceProxyAgent(options = {}) {
  const proxyUrl = resolveProxyUrl(options.env || process.env);
  if (!proxyUrl) return null;
  const factory = options.agentFactory || ((url) => new HttpsProxyAgent(url));
  return factory(proxyUrl);
}

module.exports = {
  classifySourceError,
  createSourceTransport,
  getSourceProxyAgent,
  redactNetworkText,
  resolveProxyUrl
};
