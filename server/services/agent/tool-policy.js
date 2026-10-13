const { jsonValue, assertSchema } = require('./tool-schemas');

const FIELDS = ['name', 'version', 'description', 'inputSchema', 'outputSchema', 'effect', 'requiredScope', 'timeoutMs', 'maxOutputBytes'];
function denied() { const error = new Error('Tool is not authorized.'); error.code = 'forbidden_tool'; return error; }
function trustedScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length > 100 || scopes.some(scope => typeof scope !== 'string' || !/^[a-z][a-z0-9_.:-]{0,79}$/.test(scope))) throw denied();
  return [...new Set(scopes)];
}
function declarations(registry) {
  const result = jsonValue(registry.list());
  if (!Array.isArray(result) || result.length > 100) throw denied();
  const names = new Set();
  for (const tool of result) {
    if (!tool || typeof tool !== 'object' || Array.isArray(tool) || Object.keys(tool).length !== FIELDS.length
      || FIELDS.some(key => !Object.hasOwn(tool, key)) || !/^[a-z][a-z0-9_]{0,79}$/.test(tool.name)
      || names.has(tool.name) || typeof tool.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(tool.version)
      || typeof tool.description !== 'string' || !tool.description.trim() || tool.description.length > 1000
      || typeof tool.effect !== 'string' || typeof tool.requiredScope !== 'string' || !/^[a-z][a-z0-9_.:-]{0,79}$/.test(tool.requiredScope)
      || !Number.isSafeInteger(tool.timeoutMs) || tool.timeoutMs < 1 || tool.timeoutMs > 60000
      || !Number.isSafeInteger(tool.maxOutputBytes) || tool.maxOutputBytes < 1 || tool.maxOutputBytes > 1048576) throw denied();
    assertSchema(tool.inputSchema); assertSchema(tool.outputSchema); names.add(tool.name);
  }
  return result;
}

// Registry metadata is pinned independently of prompts. Every execution checks
// the current closed declaration against that snapshot, including its version,
// effect, scope and schemas. A future write declaration is never model-visible.
class ToolPolicy {
  #registry; #pinned;
  constructor({ registry } = {}) {
    if (!registry || typeof registry.list !== 'function') throw denied();
    this.#registry = registry;
    try { this.#pinned = new Map(declarations(registry).map(tool => [tool.name, tool])); }
    catch { throw denied(); }
  }
  declarations({ scopes } = {}) {
    const granted = new Set(trustedScopes(scopes));
    return jsonValue([...this.#pinned.values()].filter(tool => tool.effect === 'read' && granted.has(tool.requiredScope)));
  }
  authorize({ name, scopes } = {}) {
    const granted = new Set(trustedScopes(scopes));
    const pinned = this.#pinned.get(name);
    if (!pinned || pinned.effect !== 'read' || !granted.has(pinned.requiredScope)) throw denied();
    try {
      const current = declarations(this.#registry).find(tool => tool.name === name);
      if (!current || current.effect !== 'read' || JSON.stringify(current) !== JSON.stringify(pinned)) throw denied();
    } catch { throw denied(); }
    return jsonValue(pinned);
  }
}
module.exports = { ToolPolicy };
