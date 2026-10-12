const { jsonValue, assertSchema } = require('./tool-schemas');

const ERRORS = Object.freeze({
  invalid_request: 'Invalid model request.', invalid_response: 'Invalid model response.',
  response_too_large: 'Model response exceeds its byte limit.', provider_failed: 'Model provider request failed.',
  not_configured: 'Model provider is not configured.', invalid_config: 'Invalid model provider configuration.',
  aborted: 'Model request aborted.', timeout: 'Model request timed out.', script_exhausted: 'Offline model script exhausted.'
});
class ProviderError extends Error {
  constructor(code) {
    super(ERRORS[code] || ERRORS.provider_failed);
    this.name = 'ProviderError'; this.code = Object.hasOwn(ERRORS, code) ? code : 'provider_failed';
    this.status = code === 'not_configured' ? 503 : code === 'invalid_config' ? 500 : code === 'invalid_request' ? 400 : code === 'timeout' ? 504 : 502;
  }
}
const DEFAULT_LIMITS = Object.freeze({ timeoutMs: 60000, maxTokens: 1800, maxResponseBytes: 2 * 1024 * 1024, maxToolCalls: 10 });
const MAX_LIMITS = { timeoutMs: 120000, maxTokens: 32768, maxResponseBytes: 2 * 1024 * 1024, maxToolCalls: 10 };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nameValid = (name) => typeof name === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(name);

function validateResult(value, tools, limits) {
  let result;
  try { result = jsonValue(value, { maxBytes: limits.maxResponseBytes }); }
  catch (error) { throw new ProviderError(error instanceof RangeError ? 'response_too_large' : 'invalid_response'); }
  const calls = result?.toolCalls;
  const usage = result?.usage;
  if (!isObject(result) || typeof result.text !== 'string' || !Array.isArray(calls) || calls.length > limits.maxToolCalls
    || !isObject(usage) || !Number.isSafeInteger(usage.inputTokens) || usage.inputTokens < 0
    || !Number.isSafeInteger(usage.outputTokens) || usage.outputTokens < 0
    || !['end_turn', 'tool_use', 'max_tokens', 'stop_sequence'].includes(result.stopReason)
    || (result.stopReason === 'tool_use') !== (calls.length > 0) || (!result.text.trim() && !calls.length)) throw new ProviderError('invalid_response');
  const ids = new Set(); const names = new Set(tools.map((tool) => tool.name));
  for (const call of calls) {
    if (!isObject(call) || Object.keys(call).some((key) => !['id', 'name', 'input'].includes(key))
      || typeof call.id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(call.id) || ids.has(call.id)
      || !nameValid(call.name) || !names.has(call.name) || !isObject(call.input)) throw new ProviderError('invalid_response');
    ids.add(call.id);
  }
  return { text: result.text, toolCalls: calls, usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }, stopReason: result.stopReason };
}

/** Provider-neutral contract. Tools use registry inputSchema; tool results use
 * {role:'tool',toolCallId,content:string}. Limits bound the whole generate call,
 * including retries. No provider error object or response metadata escapes.
 */
class ModelProvider {
  #continuations = new WeakMap();
  constructor({ name = 'Model', model = 'unknown' } = {}) {
    this.name = name; this.model = model;
    this.capabilities = Object.freeze({ toolCalls: true, streaming: false, abort: true });
  }
  validateConfig() {}
  get enabled() { return true; }

  // Opaque tokens are intentionally neither JSON-persistable nor inspectable.
  // Keep the original message object within a run; never persist provider thinking.
  remember(result, content) {
    const token = Object.freeze({});
    this.#continuations.set(token, content);
    Object.defineProperty(result, 'continuation', { value: token });
    return result;
  }
  assistantMessage(result) {
    const message = { role: 'assistant', content: result.text };
    if (result.continuation && this.#continuations.has(result.continuation)) {
      Object.defineProperty(message, 'continuation', { value: result.continuation });
    }
    return message;
  }

  prepare(input) {
    try {
      const { messages, tools = [], signal, limits = {} } = input;
      if (signal !== undefined && !(signal instanceof AbortSignal)) throw new Error();
      const bounds = { ...DEFAULT_LIMITS, ...jsonValue(limits) };
      for (const [key, value] of Object.entries(bounds)) {
        if (!Object.hasOwn(MAX_LIMITS, key) || !Number.isSafeInteger(value) || value < 1 || value > MAX_LIMITS[key]) throw new Error();
      }
      const declarations = jsonValue(tools);
      const names = new Set();
      if (!Array.isArray(declarations) || declarations.length > 100) throw new Error();
      for (const tool of declarations) {
        if (!isObject(tool) || !nameValid(tool.name) || names.has(tool.name) || typeof tool.description !== 'string'
          || !tool.description.trim() || tool.description.length > 1000) throw new Error();
        assertSchema(tool.inputSchema); names.add(tool.name);
      }
      if (!Array.isArray(messages) || !messages.length || messages.length > 200) throw new Error();
      const normalized = messages.map((message) => {
        const token = Object.getOwnPropertyDescriptor(message, 'continuation')?.value;
        const item = jsonValue(message);
        if (Object.keys(item).some((key) => !['role', 'content', 'toolCallId'].includes(key))) throw new Error();
        if (!['system', 'user', 'assistant', 'tool'].includes(item.role) || typeof item.content !== 'string') throw new Error();
        if (item.role === 'tool' && (typeof item.toolCallId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(item.toolCallId))) throw new Error();
        if (token) {
          if (item.role !== 'assistant' || !this.#continuations.has(token)) throw new Error();
          item.providerContent = this.#continuations.get(token);
        }
        return item;
      });
      jsonValue(normalized, { maxBytes: 2 * 1024 * 1024 });
      if (!normalized.some((message) => message.role === 'user')) throw new Error();
      return { messages: normalized, tools: declarations, signal, limits: bounds };
    } catch { throw new ProviderError('invalid_request'); }
  }

  async generate(input) {
    const request = this.prepare(input);
    this.validateConfig();
    if (request.signal?.aborted) throw new ProviderError('aborted');
    const controller = new AbortController();
    const deadline = performance.now() + request.limits.timeoutMs;
    let timer; let onAbort;
    try {
      const stop = new Promise((resolve, reject) => {
        const finish = (code) => { reject(new ProviderError(code)); controller.abort(); };
        onAbort = () => finish('aborted');
        request.signal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => finish('timeout'), request.limits.timeoutMs);
      });
      const work = Promise.resolve().then(() => this._generate({ ...request, signal: controller.signal,
        remainingMs: () => Math.max(0, Math.ceil(deadline - performance.now())) }));
      return await Promise.race([stop, work]);
    } catch (error) {
      throw new ProviderError(error instanceof ProviderError ? error.code : 'provider_failed');
    } finally {
      clearTimeout(timer); request.signal?.removeEventListener('abort', onAbort);
    }
  }
}
module.exports = { ModelProvider, ProviderError, validateResult, DEFAULT_LIMITS };
