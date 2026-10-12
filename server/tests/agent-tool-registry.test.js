const test = require('node:test');
const assert = require('node:assert/strict');
let api = {};
try { api = require('../services/agent/tool-registry'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
const object = (properties = {}) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const declaration = (overrides = {}) => ({ name: 'test_read', version: '1.0.0', description: 'Read a test value', inputSchema: object(), outputSchema: object({ value: { type: 'string', maxLength: 100 } }), effect: 'read', requiredScope: 'news:read', timeoutMs: 30, maxOutputBytes: 1000, execute: async () => ({ value: 'ok' }), ...overrides });
const registry = (overrides) => { assert.equal(typeof api.ToolRegistry, 'function'); return new api.ToolRegistry([declaration(overrides)]); };
const call = (r, input = {}, options = {}) => r.execute('test_read', input, { scopes: ['news:read'], ...options });

test('declarations expose immutable schemas and read/scope metadata without execute', () => {
  const r = registry();
  assert.equal(r.list()[0].effect, 'read');
  assert.equal(r.list()[0].requiredScope, 'news:read');
  assert.equal(r.list()[0].execute, undefined);
  assert.throws(() => r.register(declaration()), /invalid_declaration/);
  assert.throws(() => r.register(declaration({ version: '2.0.0' })), /invalid_declaration/);
  const listed = r.list(); listed[0].inputSchema.properties.bad = { type: 'boolean' };
  assert.equal(r.list()[0].inputSchema.properties.bad, undefined);
});

test('invalid declarations and unsupported or unbounded schemas fail closed', () => {
  for (const override of [{ effect: 'write' }, { requiredScope: '' }, { timeoutMs: 0 }, { maxOutputBytes: Infinity }, { execute: null }, { inputSchema: { type: 'object' } }, { outputSchema: { type: 'string' } }, { inputSchema: { ...object(), patternProperties: {} } }, { inputSchema: object({ q: { type: 'string', maxLength: 20, pattern: '.*' } }) }]) {
    assert.throws(() => registry(override), /invalid_declaration/);
  }
});

test('unknown tools, absent scopes, malformed and oversized inputs do not execute', async () => {
  let count = 0;
  const r = registry({ inputSchema: object({ q: { type: 'string', minLength: 1, maxLength: 5 } }), execute: () => { count++; return { value: 'ok' }; } });
  assert.equal((await r.execute('missing', {})).error.code, 'unknown_tool');
  assert.equal((await r.execute('test_read', { q: 'a' })).error.code, 'forbidden');
  for (const input of [null, [], {}, { q: '' }, { q: 1 }, { q: '123456' }, { q: 'a', raw: 'secret' }]) assert.equal((await call(r, input)).error.code, 'invalid_input');
  assert.equal(count, 0);
  assert.equal((await call(r, { q: 'a' })).ok, true);
});

test('successful results serialize deterministically and validate output', async () => {
  const r = registry({ outputSchema: object({ z: { type: 'integer', minimum: 0, maximum: 10 }, a: { type: 'boolean' } }), execute: () => ({ z: 2, a: true }) });
  assert.equal(JSON.stringify(await call(r)), '{"ok":true,"data":{"a":true,"z":2}}');
  assert.equal((await call(registry({ execute: () => ({ value: 'ok', token: 'SECRET' }) }))).error.code, 'invalid_output');
});

test('output limits count UTF-8 bytes including exact unicode boundary', async () => {
  const bytes = Buffer.byteLength(JSON.stringify({ value: '中' }));
  assert.equal((await call(registry({ maxOutputBytes: bytes, execute: () => ({ value: '中' }) }))).ok, true);
  assert.equal((await call(registry({ maxOutputBytes: bytes - 1, execute: () => ({ value: '中' }) }))).error.code, 'output_too_large');
});

test('circular, non-JSON, accessors and custom serializers fail without executing hooks', async () => {
  const circular = {}; circular.value = circular;
  let hooks = 0;
  const getter = Object.defineProperty({}, 'value', { enumerable: true, get() { hooks++; return 'SECRET'; } });
  for (const value of [circular, { value: undefined }, { value: 1n }, { value: NaN }, { value: () => 'SECRET' }, new Date(), getter, { toJSON() { hooks++; return { value: 'SECRET' }; } }]) {
    assert.equal((await call(registry({ execute: () => value }))).error.code, 'invalid_output');
  }
  assert.equal(hooks, 0);
});

test('exceptions never expose internal messages or stack', async () => {
  const result = await call(registry({ execute: () => { throw new Error('SECRET SQL credentials'); } }));
  assert.deepEqual(result, { ok: false, error: { code: 'tool_failed', message: 'Tool execution failed.' } });
});

test('timeouts settle non-cooperative tools and abort cooperative signals', async () => {
  let signal;
  const start = Date.now();
  const result = await call(registry({ execute: (_, context) => { signal = context.signal; return new Promise(() => {}); } }));
  assert.equal(result.error.code, 'timeout');
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - start < 500);
});

test('external abort settles, propagates, removes listeners and pre-abort never starts', async () => {
  const controller = new AbortController();
  let added = 0; let removed = 0; let propagated;
  const add = controller.signal.addEventListener.bind(controller.signal);
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (...args) => { added++; return add(...args); };
  controller.signal.removeEventListener = (...args) => { removed++; return remove(...args); };
  const pending = call(registry({ execute: (_, context) => { propagated = context.signal; return new Promise(() => {}); } }), {}, { signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve)); controller.abort(new Error('SECRET'));
  assert.equal((await pending).error.code, 'aborted');
  assert.equal(propagated.aborted, true); assert.equal(added, removed);
  let started = false;
  assert.equal((await call(registry({ execute: () => { started = true; } }), {}, { signal: controller.signal })).error.code, 'aborted');
  assert.equal(started, false);
});

test('success clears timer and caller listener without later abort', async () => {
  const controller = new AbortController(); let signal; let removed = 0;
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.removeEventListener = (...args) => { removed++; return remove(...args); };
  assert.equal((await call(registry({ execute: (_, context) => { signal = context.signal; return { value: 'ok' }; } }), {}, { signal: controller.signal })).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.equal(signal.aborted, false); assert.equal(removed, 1);
});

test('schema types, ranges and array contracts reject malformed declarations', () => {
  for (const outputSchema of [{ type: [] }, { type: ['null', 'null'] }, { type: 'integer', minimum: 0.5, maximum: 10 }, { type: 'array', maxItems: 5 }, { type: 'array', maxItems: 5, minItems: 6, items: { type: 'boolean' } }, object({ value: { type: 'string', maxLength: 5, enum: [4] } })]) {
    assert.throws(() => registry({ outputSchema }), /invalid_declaration/);
  }
});

test('late rejection after timeout is consumed and its caller listener is removed', async () => {
  const controller = new AbortController(); let removed = 0;
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.removeEventListener = (...args) => { removed++; return remove(...args); };
  const result = await call(registry({ timeoutMs: 5, execute: () => new Promise((_, reject) => setTimeout(() => reject(new Error('SECRET')), 15)) }), {}, { signal: controller.signal });
  assert.equal(result.error.code, 'timeout'); assert.equal(removed, 1);
  await new Promise((resolve) => setTimeout(resolve, 25));
});

test('null and malformed execution contexts fail closed without leaking exceptions', async () => {
  const r = registry();
  for (const options of [null, 1, { scopes: ['news:read'], signal: {} }]) {
    assert.equal((await r.execute('test_read', {}, options)).error.code, 'invalid_input');
  }
});

test('Symbol input values fail closed before invoking the executor', async () => {
  let executions = 0;
  const r = registry({
    inputSchema: object({ q: { type: 'string', maxLength: 100 } }),
    execute: () => { executions++; return { value: 'ok' }; }
  });
  const result = await call(r, { q: Symbol('private-input') });
  assert.equal(executions, 0);
  assert.deepEqual(result, { ok: false, error: { code: 'invalid_input', message: 'Invalid tool input.' } });
});

test('Symbol-keyed input properties fail closed before invoking the executor', async () => {
  let executions = 0;
  const r = registry({ execute: () => { executions++; return { value: 'ok' }; } });
  const result = await call(r, { [Symbol('private-input-key')]: 'hidden payload' });
  assert.equal(executions, 0);
  assert.deepEqual(result, { ok: false, error: { code: 'invalid_input', message: 'Invalid tool input.' } });
});

test('Symbol output values fail closed without returning partial data', async () => {
  const result = await call(registry({ execute: () => ({ value: Symbol('private-output') }) }));
  assert.deepEqual(result, { ok: false, error: { code: 'invalid_output', message: 'Invalid tool output.' } });
});

test('Symbol-keyed output properties fail closed without returning partial data', async () => {
  const result = await call(registry({ execute: () => ({ value: 'ok', [Symbol('private-output-key')]: 'hidden payload' }) }));
  assert.deepEqual(result, { ok: false, error: { code: 'invalid_output', message: 'Invalid tool output.' } });
});
