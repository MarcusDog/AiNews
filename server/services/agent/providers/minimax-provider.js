const axios = require('axios');
const { ModelProvider, ProviderError, validateResult } = require('../model-provider');
const { jsonValue } = require('../tool-schemas');

const DEFAULT_BASE_URL = 'https://api.minimax.io/anthropic';
const DEFAULT_MODEL = 'MiniMax-M2.5';
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
// api.minimaxi.com is retained solely for existing Aya deployments.
const ALLOWED_HOSTS = new Set(['api.minimax.io', 'api.minimax.cn', 'api.minimaxi.com']);

function delay(ms, signal) {
  return new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}

class MiniMaxProvider extends ModelProvider {
  #apiKey;
  constructor(options = {}) {
    super({ name: 'MiniMax', model: options.model || process.env.MINIMAX_MODEL || DEFAULT_MODEL });
    this.#apiKey = options.apiKey !== undefined ? options.apiKey : process.env.MINIMAX_API_KEY;
    this.baseUrl = options.baseUrl || process.env.MINIMAX_BASE_URL || DEFAULT_BASE_URL;
    this.httpClient = options.httpClient || axios;
    this.retryDelay = options.retryDelay || delay;
    this.maxAttempts = Math.min(Math.max(Math.floor(Number(options.maxProviderAttempts) || 3), 1), 4);
  }
  get enabled() { return Boolean(this.#apiKey); }
  validateConfig() {
    if (!this.#apiKey) throw new ProviderError('not_configured');
    let url;
    try { url = new URL(this.baseUrl); } catch { throw new ProviderError('invalid_config'); }
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname) || url.port || url.username || url.password
      || !['/anthropic', '/anthropic/'].includes(url.pathname) || url.search || url.hash
      || typeof this.#apiKey !== 'string' || /[\r\n]/.test(this.#apiKey)
      || typeof this.model !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(this.model)) throw new ProviderError('invalid_config');
  }

  buildBody({ messages, tools, limits }) {
    const converted = [];
    const system = [];
    for (const message of messages) {
      if (message.role === 'system') { system.push(message.content); continue; }
      if (message.role === 'tool') {
        const block = { type: 'tool_result', tool_use_id: message.toolCallId, content: message.content };
        const previous = converted.at(-1);
        if (previous?.role === 'user' && Array.isArray(previous.content)) previous.content.push(block);
        else converted.push({ role: 'user', content: [block] });
      } else converted.push({ role: message.role, content: message.providerContent || message.content });
    }
    const body = { model: this.model, max_tokens: limits.maxTokens, temperature: 0.2, messages: converted };
    if (system.length) body.system = system.join('\n\n');
    if (tools.length) body.tools = tools.map(({ name, description, inputSchema }) => ({ name, description, input_schema: inputSchema }));
    return body;
  }

  parse(response, request) {
    let data;
    try { data = jsonValue(response?.data, { maxBytes: request.limits.maxResponseBytes }); }
    catch (error) { throw new ProviderError(error instanceof RangeError ? 'response_too_large' : 'invalid_response'); }
    if (!Array.isArray(data?.content)) throw new ProviderError('invalid_response');
    const texts = []; const toolCalls = [];
    for (const block of data.content) {
      if (!block || typeof block !== 'object' || Array.isArray(block)) throw new ProviderError('invalid_response');
      if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text);
      else if (block.type === 'thinking' && typeof block.thinking === 'string'
        && (block.signature === undefined || typeof block.signature === 'string')) { /* retained only in opaque continuation */ }
      else if (block.type === 'tool_use') {
        if (Object.keys(block).some((key) => !['type', 'id', 'name', 'input'].includes(key))) throw new ProviderError('invalid_response');
        toolCalls.push({ id: block.id, name: block.name, input: block.input });
      } else throw new ProviderError('invalid_response');
    }
    const normalized = { text: texts.join('\n').trim(), toolCalls,
      usage: { inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens }, stopReason: data.stop_reason };
    return { result: validateResult(normalized, request.tools, request.limits), content: data.content };
  }

  async _generate(request) {
    const body = this.buildBody(request);
    if (Buffer.byteLength(JSON.stringify(body)) > MAX_REQUEST_BYTES) throw new ProviderError('invalid_request');
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      if (request.signal.aborted) throw new ProviderError('aborted');
      if (!request.remainingMs()) throw new ProviderError('timeout');
      try {
        const response = await this.httpClient.post(`${this.baseUrl.replace(/\/$/, '')}/v1/messages`, body, {
          headers: { Authorization: `Bearer ${this.#apiKey}`, 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
          signal: request.signal, timeout: request.remainingMs(), maxRedirects: 0,
          maxContentLength: request.limits.maxResponseBytes, maxBodyLength: MAX_REQUEST_BYTES
        });
        if (request.signal.aborted) throw new ProviderError('aborted');
        return this.parse(response, request);
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (request.signal.aborted) throw new ProviderError('aborted');
        const status = error?.response?.status;
        const retryable = status === 408 || status === 429 || (status >= 500 && status <= 599)
          || ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN'].includes(error?.code);
        if (!retryable || attempt === this.maxAttempts) throw new ProviderError('provider_failed');
        await this.retryDelay(Math.min(800 * (2 ** (attempt - 1)), 3200, request.remainingMs()), request.signal);
      }
    }
    throw new ProviderError('provider_failed');
  }
}
module.exports = { MiniMaxProvider, DEFAULT_BASE_URL, DEFAULT_MODEL };
