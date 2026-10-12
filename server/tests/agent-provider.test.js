const test = require('node:test');
const assert = require('node:assert/strict');
const util = require('node:util');
const { MiniMaxProvider } = require('../services/agent/providers/minimax-provider');
const { FakeProvider } = require('../services/agent/providers/fake-provider');
const { auditAnswer } = require('../services/agent/citation-audit');
const { object, text } = require('../services/agent/tool-schemas');

const tool = { name: 'news_search', description: 'Search public news', inputSchema: object({ query: text(100) }) };
const request = { messages: [{ role: 'system', content: 'Use citations.' }, { role: 'user', content: 'Find news' }], tools: [tool] };
const response = (content = [{ type: 'text', text: 'Answer [S1]' }], extra = {}) => ({ data: {
  content, usage: { input_tokens: 11, output_tokens: 7 }, stop_reason: 'end_turn', ...extra
} });
const result = (extra = {}) => ({ text: 'Answer [S1]', toolCalls: [], usage: { inputTokens: 11, outputTokens: 7 }, stopReason: 'end_turn', ...extra });
const provider = (post, options = {}) => new MiniMaxProvider({ apiKey: 'test-secret', httpClient: { post }, retryDelay: async () => {}, ...options });

test('MiniMax maps public tools, system messages, limits, auth and text without provider metadata', async () => {
  let call;
  const model = provider(async (...args) => { call = args; return response(); });
  assert.deepEqual(await model.generate({ ...request, limits: { maxTokens: 50 } }), result());
  assert.equal(call[0], 'https://api.minimax.io/anthropic/v1/messages');
  assert.deepEqual(call[1].tools, [{ name: tool.name, description: tool.description, input_schema: tool.inputSchema }]);
  assert.equal(call[1].system, 'Use citations.');
  assert.deepEqual(call[1].messages, request.messages.slice(1));
  assert.equal(call[1].max_tokens, 50);
  assert.equal(call[2].headers.Authorization, 'Bearer test-secret');
  assert.equal(call[2].maxRedirects, 0);
  assert.equal(model.capabilities.toolCalls, true);
  assert.equal(model.capabilities.streaming, false);
});

test('ordered calls and complete interleaved thinking survive opaque continuation without serialization leaks', async () => {
  const content = [
    { type: 'thinking', thinking: 'PRIVATE-THINKING', signature: 'signature' },
    { type: 'text', text: 'Searching' },
    { type: 'tool_use', id: 'call-b', name: tool.name, input: { query: 'B' } },
    { type: 'tool_use', id: 'call-a', name: tool.name, input: { query: 'A' } }
  ];
  const calls = [];
  const model = provider(async (...args) => { calls.push(args); return calls.length === 1 ? response(content, { stop_reason: 'tool_use' }) : response(); });
  const first = await model.generate(request);
  assert.equal(first.text, 'Searching');
  assert.deepEqual(first.toolCalls.map(({ id }) => id), ['call-b', 'call-a']);
  assert(!JSON.stringify(first).includes('PRIVATE-THINKING'));
  assert(!util.inspect(first, { showHidden: true, depth: 10 }).includes('PRIVATE-THINKING'));
  const assistant = model.assistantMessage(first);
  assert(!JSON.stringify(assistant).includes('PRIVATE-THINKING'));
  await model.generate({ ...request, messages: [...request.messages, assistant,
    { role: 'tool', toolCallId: 'call-b', content: '{"ok":true}' },
    { role: 'tool', toolCallId: 'call-a', content: '{"ok":true}' }] });
  assert.deepEqual(calls[1][1].messages[1], { role: 'assistant', content });
  assert.deepEqual(calls[1][1].messages[2].content.map((block) => block.tool_use_id), ['call-b', 'call-a']);
});

test('FakeProvider uses deterministic scripts, shares validation, and never mutates scripts', async () => {
  const script = [result({ text: '', toolCalls: [{ id: 'one', name: tool.name, input: { query: 'hi' } }], stopReason: 'tool_use' }), result()];
  const fake = new FakeProvider({ script });
  const first = await fake.generate(request);
  first.toolCalls[0].input.query = 'changed';
  assert.equal(script[0].toolCalls[0].input.query, 'hi');
  assert.deepEqual(await fake.generate(request), result());
  await assert.rejects(fake.generate(request), { code: 'script_exhausted' });
  assert.equal(fake.capabilities.toolCalls, true);
  await assert.rejects(new FakeProvider({ script: [result({ usage: { inputTokens: -1, outputTokens: 0 } })] }).generate(request), { code: 'invalid_response' });
});

for (const [name, value] of Object.entries({
  'missing content': { data: {} },
  'null block': response([null]),
  'non-string text': response([{ type: 'text', text: { secret: 'secret' } }]),
  'unknown block': response([{ type: 'server_tool_use', id: 'x', name: tool.name, input: {} }]),
  'malformed thinking': response([{ type: 'thinking', thinking: 2 }]),
  'empty ID': response([{ type: 'tool_use', id: '', name: tool.name, input: {} }], { stop_reason: 'tool_use' }),
  'duplicate ID': response([1, 2].map(() => ({ type: 'tool_use', id: 'same', name: tool.name, input: {} })), { stop_reason: 'tool_use' }),
  'non-object input': response([{ type: 'tool_use', id: 'one', name: tool.name, input: 'secret' }], { stop_reason: 'tool_use' }),
  'unknown tool': response([{ type: 'tool_use', id: 'one', name: 'shell', input: {} }], { stop_reason: 'tool_use' }),
  'missing usage': response(undefined, { usage: undefined }),
  'negative usage': response(undefined, { usage: { input_tokens: -1, output_tokens: 2 } }),
  'fractional usage': response(undefined, { usage: { input_tokens: 1.5, output_tokens: 2 } }),
  'invalid stop': response(undefined, { stop_reason: 'mystery' }),
  'missing calls at tool stop': response(undefined, { stop_reason: 'tool_use' }),
  'calls with end stop': response([{ type: 'tool_use', id: 'one', name: tool.name, input: {} }]),
  'empty output': response([])
})) test(`MiniMax rejects ${name}`, async () => {
  await assert.rejects(provider(async () => value).generate(request), { code: 'invalid_response' });
});

test('response and tool-call budgets fail closed for UTF-8 and excessive calls', async () => {
  await assert.rejects(provider(async () => response([{ type: 'text', text: '中'.repeat(100) }])).generate({ ...request, limits: { maxResponseBytes: 200 } }), { code: 'response_too_large' });
  await assert.rejects(provider(async () => response([1, 2].map((id) => ({ type: 'tool_use', id: String(id), name: tool.name, input: {} })), { stop_reason: 'tool_use' })).generate({ ...request, limits: { maxToolCalls: 1 } }), { code: 'invalid_response' });
});

for (const baseUrl of ['http://api.minimax.io/anthropic', 'https://api.minimax.io.evil.test/anthropic', 'https://user:pass@api.minimax.io/anthropic', 'https://api.minimax.io:444/anthropic', 'https://api.minimax.io/other', 'https://api.minimax.io/anthropic?x=1', 'https://api.minimax.io/anthropic#x']) {
  test(`rejects unsafe endpoint ${baseUrl}`, async () => {
    let calls = 0;
    await assert.rejects(provider(async () => { calls++; return response(); }, { baseUrl }).generate(request), { code: 'invalid_config' });
    assert.equal(calls, 0);
  });
}

test('China and documented legacy endpoints are supported with explicit authentication', async () => {
  for (const host of ['api.minimax.cn', 'api.minimaxi.com']) {
    let call;
    await provider(async (...args) => { call = args; return response(); }, { baseUrl: `https://${host}/anthropic/` }).generate(request);
    assert.equal(call[0], `https://${host}/anthropic/v1/messages`);
    assert.equal(call[2].headers.Authorization, 'Bearer test-secret');
  }
});

test('configuration, invalid requests and provider failures never carry secrets or raw causes', async () => {
  const sensitive = new Error('SECRET BODY test-secret');
  sensitive.response = { status: 401, data: 'SECRET BODY' };
  sensitive.config = { headers: { Authorization: 'Bearer test-secret' } };
  await assert.rejects(provider(async () => { throw sensitive; }).generate(request), (error) => {
    assert.equal(error.code, 'provider_failed');
    assert(!util.inspect(error, { showHidden: true, depth: 10 }).includes('test-secret'));
    assert(!JSON.stringify(error).includes('SECRET'));
    assert.equal(error.cause, undefined);
    return true;
  });
  await assert.rejects(provider(async () => response(), { apiKey: '' }).generate(request), { code: 'not_configured' });
  for (const bad of [{ messages: [] }, { ...request, tools: [{ type: 'function' }] }, { ...request, limits: { timeoutMs: -1 } }, { ...request, signal: {} }]) {
    await assert.rejects(provider(async () => response()).generate(bad), { code: 'invalid_request' });
  }
});

test('retry only transient errors and cap attempts', async () => {
  let calls = 0;
  const model = provider(async () => { if (++calls < 3) throw Object.assign(new Error('private'), { response: { status: 503 } }); return response(); });
  assert.deepEqual(await model.generate(request), result());
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(provider(async () => { calls++; throw { response: { status: 401 } }; }).generate(request), { code: 'provider_failed' });
  assert.equal(calls, 1);
});

test('total deadline bounds retries including a stuck injected retry delay', async () => {
  let calls = 0;
  const model = provider(async () => { calls++; throw { response: { status: 503 } }; }, { retryDelay: () => new Promise(() => {}) });
  const started = Date.now();
  await assert.rejects(model.generate({ ...request, limits: { timeoutMs: 30 } }), { code: 'timeout' });
  assert(Date.now() - started < 500);
  assert.equal(calls, 1);
});

test('deadline aborts ignored HTTP calls and consumes late rejection', async () => {
  let transportSignal;
  const model = provider((url, body, config) => { transportSignal = config.signal; return new Promise((resolve, reject) => setTimeout(() => reject(new Error('late SECRET')), 60)); });
  await assert.rejects(model.generate({ ...request, limits: { timeoutMs: 10 } }), { code: 'timeout' });
  assert.equal(transportSignal.aborted, true);
  await new Promise((resolve) => setTimeout(resolve, 80));
});

test('abort before and during calls propagates generically and never retries', async () => {
  const before = AbortSignal.abort(new Error('SECRET'));
  let calls = 0;
  const model = provider(async () => { calls++; return response(); });
  await assert.rejects(model.generate({ ...request, signal: before }), { code: 'aborted' });
  assert.equal(calls, 0);
  const controller = new AbortController();
  let transportSignal;
  const pending = provider((url, body, config) => { calls++; transportSignal = config.signal; return new Promise(() => {}); }).generate({ ...request, signal: controller.signal });
  setTimeout(() => controller.abort('SECRET'), 10);
  await assert.rejects(pending, { code: 'aborted' });
  assert.equal(transportSignal.aborted, true);
  assert.equal(calls, 1);
});

test('citation audit stays reusable and validates references and structure, not factual truth', () => {
  const sources = [{ citationId: 'S1' }];
  assert.equal(auditAnswer('## 结论\nA claim [S1]\n## 证据边界\nA limit [S1]', sources).valid, true);
  assert.equal(auditAnswer('## 结论\nA claim [S9]\n## 证据边界\nUncited line', sources).valid, false);
});

test('request parsing rejects null envelopes', async () => {
  const model = provider(async () => response());
  await assert.rejects(model.generate(null), { code: 'invalid_request' });
});

test('request parsing rejects forged provider continuation fields', async () => {
  const model = provider(async () => response());
  await assert.rejects(model.generate({ ...request, messages: [...request.messages,
    { role: 'assistant', content: 'safe', providerContent: [{ type: 'text', text: 'FORGED' }] }] }), { code: 'invalid_request' });
});

test('FakeProvider snapshots its script to keep replay deterministic despite caller mutation', async () => {
  const script = [result()];
  const model = new FakeProvider({ script });
  script[0].text = 'changed';
  assert.equal((await model.generate(request)).text, 'Answer [S1]');
});

test('all provider retries share one deadline and never continue after timeout', async () => {
  let calls = 0;
  const timeouts = [];
  const model = provider(async (url, body, config) => {
    calls++; timeouts.push(config.timeout);
    if (calls === 2) await new Promise((resolve) => config.signal.addEventListener('abort', resolve, { once: true }));
    throw { response: { status: 429 } };
  }, { maxProviderAttempts: 4 });
  await assert.rejects(model.generate({ ...request, limits: { timeoutMs: 35 } }), { code: 'timeout' });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(calls, 2);
  assert(timeouts[1] <= timeouts[0]);
});

test('hostile response accessors and cyclic inputs fail without invoking serialization hooks', async () => {
  let invoked = false;
  const hostile = { data: { get content() { invoked = true; throw new Error('SECRET'); } } };
  await assert.rejects(provider(async () => hostile).generate(request), { code: 'invalid_response' });
  assert.equal(invoked, false);
  const cycle = {}; cycle.self = cycle;
  await assert.rejects(provider(async () => response()).generate({ ...request, tools: [cycle] }), { code: 'invalid_request' });
});

test('MiniMax caps repeated transient failures at the configured attempt limit', async () => {
  let calls = 0;
  await assert.rejects(provider(async () => { calls++; throw { code: 'ECONNRESET' }; }, { maxProviderAttempts: 2 }).generate(request), { code: 'provider_failed' });
  assert.equal(calls, 2);
});

test('provider errors are sanitized even when a transport attaches data to a known error class', async () => {
  const { ProviderError } = require('../services/agent/model-provider');
  const error = new ProviderError('provider_failed');
  error.message = 'PRIVATE-KEY'; error.config = { key: 'PRIVATE-KEY' };
  await assert.rejects(provider(async () => { throw error; }).generate(request), (failure) => {
    assert(!util.inspect(failure, { showHidden: true }).includes('PRIVATE-KEY'));
    return true;
  });
});

test('thinking-only and empty MiniMax max_tokens responses preserve exhaustion without exposing thinking', async () => {
  for (const content of [[{ type: 'thinking', thinking: 'PRIVATE-THINKING' }], []]) {
    const model = provider(async () => response(content, { stop_reason: 'max_tokens' }));
    assert.deepEqual(await model.generate(request), result({ text: '', stopReason: 'max_tokens' }));
  }
});

const callBlocks = (ids) => [{ type: 'thinking', thinking: 'PRIVATE-THINKING' }, ...ids.map((id) => ({ type: 'tool_use', id, name: tool.name, input: { query: id } }))];
const toolResults = (ids) => ids.map((id) => ({ role: 'tool', toolCallId: id, content: 'Public evidence' }));

for (const mode of ['mutated', 'cloned', 'forged', 'cross-conversation']) {
  test(`continuation rejects ${mode} assistant before transport`, async () => {
    let calls = 0;
    const model = provider(async () => { calls++; return response(callBlocks(['a']), { stop_reason: 'tool_use' }); });
    const first = await model.generate(request);
    let assistant = model.assistantMessage(first);
    if (mode === 'mutated') assistant.content = 'Different visible text';
    if (mode === 'cloned') assistant = { ...assistant };
    if (mode === 'forged') {
      const forged = { role: 'assistant', content: assistant.content };
      Object.defineProperty(forged, 'continuation', { value: first.continuation || assistant.continuation });
      assistant = forged;
    }
    const prefix = mode === 'cross-conversation' ? request.messages.map((message) => ({ ...message })) : request.messages;
    await assert.rejects(model.generate({ ...request, messages: [...prefix, assistant, ...toolResults(['a'])] }), { code: 'invalid_request' });
    assert.equal(calls, 1);
  });
}

for (const ids of [['unknown'], ['b', 'a'], ['a', 'a'], ['a', 'b', 'a'], ['a'], []]) {
  test(`continuation rejects unmatched pending tool results ${JSON.stringify(ids)}`, async () => {
    let calls = 0;
    const model = provider(async () => { calls++; return response(callBlocks(['a', 'b']), { stop_reason: 'tool_use' }); });
    const first = await model.generate(request);
    await assert.rejects(model.generate({ ...request, messages: [...request.messages, model.assistantMessage(first), ...toolResults(ids)] }), { code: 'invalid_request' });
    assert.equal(calls, 1);
  });
}

test('tool results require an immediately preceding genuine assistant call round', async () => {
  let calls = 0;
  const model = provider(async () => { calls++; return response(callBlocks(['a']), { stop_reason: 'tool_use' }); });
  await assert.rejects(model.generate({ ...request, messages: [...request.messages, ...toolResults(['a'])] }), { code: 'invalid_request' });
  const first = await model.generate(request);
  await assert.rejects(model.generate({ ...request, messages: [...request.messages, model.assistantMessage(first), { role: 'user', content: 'Interruption' }, ...toolResults(['a'])] }), { code: 'invalid_request' });
  assert.equal(calls, 1);
});

test('genuine historical assistant objects survive two completed tool rounds and a later user turn', async () => {
  const calls = [];
  const model = provider(async (...args) => {
    calls.push(args);
    return calls.length <= 2 ? response(callBlocks([`round-${calls.length}`]), { stop_reason: 'tool_use' }) : response();
  });
  const messages = [...request.messages];
  for (let turn = 1; turn <= 3; turn++) {
    const output = await model.generate({ ...request, messages });
    messages.push(model.assistantMessage(output));
    if (turn <= 2) messages.push(...toolResults([`round-${turn}`]));
  }
  messages.push({ role: 'user', content: 'Follow up' });
  await model.generate({ ...request, messages });
  assert.deepEqual(calls[3][1].messages[1].content, callBlocks(['round-1']));
  assert.deepEqual(calls[3][1].messages[3].content, callBlocks(['round-2']));
  assert(!util.inspect(messages, { showHidden: true, depth: 10 }).includes('PRIVATE-THINKING'));
});

test('FakeProvider enforces the same ordered continuation contract across multiple tool rounds', async () => {
  const model = new FakeProvider({ script: [result({ text: '', toolCalls: [{ id: 'a', name: tool.name, input: {} }], stopReason: 'tool_use' }), result()] });
  const first = await model.generate(request);
  const assistant = model.assistantMessage(first);
  await assert.rejects(model.generate({ ...request, messages: [...request.messages, assistant, ...toolResults(['bad'])] }), { code: 'invalid_request' });
  assert.deepEqual(await model.generate({ ...request, messages: [...request.messages, assistant, ...toolResults(['a'])] }), result());
});

test('MiniMax rejects the combined serialized UTF-8 body above 2 MiB before transport', async () => {
  let calls = 0;
  const model = provider(async () => { calls++; return response(); });
  const tools = Array.from({ length: 100 }, (_, i) => ({ ...tool, name: `tool_${i}`, description: 'd'.repeat(1000) }));
  // Each message is under the per-message 256 KiB bound; the combination is
  // below 2 MiB until the tool declarations and provider envelope are included.
  const messages = Array.from({ length: 8 }, () => ({ role: 'user', content: '中'.repeat(83000) }));
  await assert.rejects(model.generate({ messages, tools }), { code: 'invalid_request' });
  assert.equal(calls, 0);
});

test('MiniMax accepts an exact 2 MiB serialized body and rejects one extra UTF-8 byte', async () => {
  let calls = 0; let sentBytes;
  const model = provider(async (url, body) => { calls++; sentBytes = Buffer.byteLength(JSON.stringify(body)); return response(); });
  const tools = Array.from({ length: 100 }, (_, i) => ({ ...tool, name: `tool_${i}`, description: 'd'.repeat(1000) }));
  const messages = Array.from({ length: 8 }, () => ({ role: 'user', content: '' }));
  const emptyBody = { model: 'MiniMax-M2.5', max_tokens: 1800, temperature: 0.2, messages,
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, input_schema: inputSchema })) };
  let remaining = 2 * 1024 * 1024 - Buffer.byteLength(JSON.stringify(emptyBody));
  for (const message of messages) {
    const bytes = Math.min(250000, remaining);
    message.content = '中'.repeat(Math.floor(bytes / 3)) + 'a'.repeat(bytes % 3);
    remaining -= bytes;
  }
  assert.equal(remaining, 0);
  await model.generate({ messages, tools });
  assert.equal(sentBytes, 2 * 1024 * 1024);
  messages.at(-1).content += 'a';
  await assert.rejects(model.generate({ messages, tools }), { code: 'invalid_request' });
  assert.equal(calls, 1);
});

test('continuations bind unchanged visible results and the full preceding transcript', async () => {
  const model = provider(async () => response());
  const first = await model.generate(request);
  const assistant = model.assistantMessage(first);
  await assert.rejects(model.generate({ ...request, messages: [{ role: 'system', content: 'Changed policy' }, request.messages[1], assistant] }), { code: 'invalid_request' });
  await assert.rejects(model.generate({ ...request, messages: [...request.messages, JSON.parse(JSON.stringify(assistant))] }), { code: 'invalid_request' });
  first.text = 'Changed result';
  assert.throws(() => model.assistantMessage(first), { code: 'invalid_request' });
  assert.equal(first.continuation, undefined);
});
