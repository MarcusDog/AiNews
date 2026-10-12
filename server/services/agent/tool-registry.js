const { assertSchema, validate, jsonValue } = require('./tool-schemas');

const ERRORS = Object.freeze({
  unknown_tool: 'Unknown tool.', forbidden: 'Required scope is missing.', invalid_input: 'Invalid tool input.',
  invalid_output: 'Invalid tool output.', output_too_large: 'Tool output exceeds its byte limit.',
  tool_failed: 'Tool execution failed.', timeout: 'Tool execution timed out.', aborted: 'Tool execution aborted.'
});
const failure = (code) => ({ ok: false, error: { code, message: ERRORS[code] } });

/**
 * @typedef {Object} ToolDeclaration
 * @property {string} name
 * @property {string} version Semantic version, pinned for the registry lifetime.
 * @property {string} description
 * @property {Object} inputSchema Closed, bounded supported JSON Schema subset.
 * @property {Object} outputSchema Closed, bounded public projection schema.
 * @property {'read'} effect
 * @property {string} requiredScope Scope supplied by trusted server authorization.
 * @property {number} timeoutMs
 * @property {number} maxOutputBytes Serialized data UTF-8 byte budget.
 * @property {function(Object, {signal: AbortSignal}): *} execute
 */
class ToolRegistry {
  #tools = new Map();
  constructor(declarations = []) { declarations.forEach((declaration) => this.register(declaration)); }

  register(declaration) {
    try {
      const { execute, ...metadata } = declaration;
      const data = jsonValue(metadata);
      const fields = ['name', 'version', 'description', 'inputSchema', 'outputSchema', 'effect', 'requiredScope', 'timeoutMs', 'maxOutputBytes'];
      if (Object.keys(data).length !== fields.length || fields.some((field) => !Object.hasOwn(data, field))
        || typeof data.name !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(data.name)
        || this.#tools.has(data.name) || typeof data.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(data.version)
        || typeof data.description !== 'string' || !data.description.trim() || data.description.length > 1000
        || data.effect !== 'read' || typeof data.requiredScope !== 'string' || !/^[a-z][a-z0-9_.:-]{0,79}$/.test(data.requiredScope)
        || !Number.isSafeInteger(data.timeoutMs) || data.timeoutMs < 1 || data.timeoutMs > 60000
        || !Number.isSafeInteger(data.maxOutputBytes) || data.maxOutputBytes < 1 || data.maxOutputBytes > 1048576
        || typeof execute !== 'function') throw new TypeError();
      assertSchema(data.inputSchema); assertSchema(data.outputSchema);
      this.#tools.set(data.name, { ...data, execute });
      return this;
    } catch { throw new TypeError('invalid_declaration'); }
  }

  list() {
    return [...this.#tools.values()].sort((a, b) => a.name.localeCompare(b.name)).map(({ execute, ...metadata }) => jsonValue(metadata));
  }

  async execute(name, input, options = {}) {
    const tool = this.#tools.get(name);
    if (!tool) return failure('unknown_tool');
    if (!options || typeof options !== 'object' || Array.isArray(options)
      || (options.signal !== undefined && !(options.signal instanceof AbortSignal))) return failure('invalid_input');
    if (!Array.isArray(options.scopes) || !options.scopes.includes(tool.requiredScope)) return failure('forbidden');
    let args;
    try { args = jsonValue(input, { maxBytes: 16384 }); if (!validate(tool.inputSchema, args)) return failure('invalid_input'); }
    catch { return failure('invalid_input'); }
    const callerSignal = options.signal;
    if (callerSignal?.aborted) return failure('aborted');
    const controller = new AbortController();
    let timer; let onAbort;
    try {
      const stop = new Promise((resolve) => {
        const finish = (code) => { resolve({ error: code }); controller.abort(); };
        onAbort = () => finish('aborted');
        callerSignal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => finish('timeout'), tool.timeoutMs);
      });
      const work = Promise.resolve().then(() => {
        if (controller.signal.aborted) return { error: 'aborted' };
        return Promise.resolve(tool.execute(args, { signal: controller.signal })).then((value) => ({ value }));
      }).catch(() => ({ error: 'tool_failed' }));
      const result = await Promise.race([stop, work]);
      if (result.error) return failure(result.error);
      let data;
      try { data = jsonValue(result.value, { maxBytes: tool.maxOutputBytes }); }
      catch (error) { return failure(error instanceof RangeError ? 'output_too_large' : 'invalid_output'); }
      if (!validate(tool.outputSchema, data)) return failure('invalid_output');
      return { ok: true, data };
    } catch { return failure('tool_failed'); }
    finally { clearTimeout(timer); if (onAbort) callerSignal?.removeEventListener('abort', onAbort); }
  }
}
module.exports = { ToolRegistry, ERRORS };
