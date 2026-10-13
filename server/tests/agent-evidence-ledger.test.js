const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const agentPath = path.join(__dirname, '../services/agent/agent-store.js');
const ledgerPath = path.join(__dirname, '../services/agent/evidence-ledger.js');
const AgentStore = fs.existsSync(agentPath) ? require(agentPath).AgentStore : null;
const EvidenceLedger = fs.existsSync(ledgerPath) ? require(ledgerPath).EvidenceLedger : null;
const check = (name, fn) => test(name, { skip: !AgentStore || !EvidenceLedger }, fn);
const source = (url = 'https://example.com/a', extra = {}) => ({ title: 'Public source', url, source: 'Official', evidenceType: 'official', ...extra });
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-agent-evidence-'));
  const store = new AgentStore({ dbPath: path.join(dir, 'agent.db') }); store.initialize();
  const session = store.createSession({ userId: 'alice', title: 'Evidence' });
  const run = store.createRun({ userId: 'alice', sessionId: session.id, requestKey: 'a', request: {} });
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { store, run, ledger: new EvidenceLedger({ store }), args: { userId: 'alice', runId: run.id } };
}
test('EvidenceLedger provides the persistent citation contract', () => assert.equal(typeof EvidenceLedger, 'function', 'EvidenceLedger implementation is missing'));

check('stable source numbers follow first normalized URL occurrence and survive close/reopen', (t) => {
  const { store, ledger, args } = fixture(t);
  const first = ledger.registerEvidence({ ...args, source: source('https://EXAMPLE.com:443/a#section') });
  assert.equal(first.citationId, 'S1');
  assert.equal(ledger.registerEvidence({ ...args, source: source('https://example.com/a', { title: 'Changed title' }) }).citationId, 'S1');
  assert.equal(ledger.registerEvidence({ ...args, source: source('https://example.com/b') }).citationId, 'S2');
  store.close(); store.initialize();
  assert.deepEqual(ledger.listEvidence(args).map(row => row.citationId), ['S1', 'S2']);
  assert.equal(ledger.getEvidence({ ...args, citationId: 'S1' }).title, 'Public source');
  assert.equal(ledger.registerEvidence({ ...args, source: source('https://example.com/c') }).citationId, 'S3');
});

check('same public URL with different external IDs retains the original stable identity', (t) => {
  const { ledger, args } = fixture(t);
  assert.equal(ledger.registerEvidence({ ...args, source: source(undefined, { id: 'external-a' }) }).citationId, 'S1');
  assert.equal(ledger.registerEvidence({ ...args, source: source(undefined, { id: 'external-b' }) }).citationId, 'S1');
  assert.equal(ledger.listEvidence(args).length, 1);
});

check('evidence ownership is enforced on every operation', (t) => {
  const { ledger, args } = fixture(t);
  ledger.registerEvidence({ ...args, source: source() });
  for (const call of [
    () => ledger.registerEvidence({ ...args, userId: 'bob', source: source() }),
    () => ledger.listEvidence({ ...args, userId: 'bob' }),
    () => ledger.getEvidence({ ...args, userId: 'bob', citationId: 'S1' })
  ]) assert.throws(call, { code: 'not_found' });
});

check('evidence rejects secret fields, private URLs, forged source numbers and oversized structures', (t) => {
  const { ledger, args } = fixture(t);
  for (const value of [
    source('http://example.com/a'), source('https://user:password@example.com/a'), source('https://127.0.0.1/a'),
    source('https://localhost/a'), source('file:///tmp/a'), source('https://example.com/a?api_key=secret'),
    source('https://example.com/a?key=secret'), source('https://example.com/a?session_id=secret'),
    source(undefined, { credentials: 'secret' }), source(undefined, { thinking: 'secret' }),
    source(undefined, { citationId: 'S99' }), source(undefined, { sourceNumber: 99 }),
    source(undefined, { providerContent: [] }), source(undefined, { extra: { password: 'secret' } })
  ]) assert.throws(() => ledger.registerEvidence({ ...args, source: value }), { code: 'invalid_input' });
  assert.throws(() => ledger.registerEvidence({ ...args, source: source(undefined, { summary: '中'.repeat(10000) }) }), { code: 'input_too_large' });
  assert.equal(ledger.listEvidence(args).length, 0);
});

check('failed evidence insertion cannot consume a source number and external connections preserve uniqueness', (t) => {
  const { store, ledger, args } = fixture(t);
  ledger.registerEvidence({ ...args, source: source() });
  store.db.exec("CREATE TRIGGER reject_evidence BEFORE INSERT ON agent_evidence BEGIN SELECT RAISE(ABORT,'evidence blocked'); END;");
  assert.throws(() => ledger.registerEvidence({ ...args, source: source('https://example.com/b') }), /evidence blocked/);
  store.db.exec('DROP TRIGGER reject_evidence');
  assert.equal(ledger.registerEvidence({ ...args, source: source('https://example.com/b') }).citationId, 'S2');
  const secondLedger = new EvidenceLedger({ store });
  assert.equal(secondLedger.registerEvidence({ ...args, source: source('https://example.com/a') }).citationId, 'S1');
  assert.equal(secondLedger.registerEvidence({ ...args, source: source('https://example.com/c') }).citationId, 'S3');
});

check('evidence counts are included in atomic retention and active evidence is preserved', (t) => {
  const { store, ledger, args, run } = fixture(t);
  ledger.registerEvidence({ ...args, source: source() });
  assert.equal(store.pruneRetention({ now: Date.now() + 100000000, retentionMs: 0 }).evidence, 0);
  store.cancelRun({ userId: 'alice', runId: run.id });
  store.db.exec("CREATE TRIGGER reject_run_delete BEFORE DELETE ON agent_runs BEGIN SELECT RAISE(ABORT,'delete blocked'); END;");
  assert.throws(() => store.pruneRetention({ now: Date.now() + 100000000, retentionMs: 0 }), /delete blocked/);
  assert.equal(ledger.listEvidence(args).length, 1);
  store.db.exec('DROP TRIGGER reject_run_delete');
  assert.equal(store.pruneRetention({ now: Date.now() + 100000000, retentionMs: 0 }).evidence, 1);
  assert.deepEqual(store.db.pragma('foreign_key_check'), []);
});

check('terminal evidence writes are rejected transactionally without assigning a source number', (t) => {
  const { store, ledger, args, run } = fixture(t);
  ledger.registerEvidence({ ...args, source: source() });
  store.cancelRun({ userId: 'alice', runId: run.id });
  assert.throws(() => ledger.registerEvidence({ ...args, source: source('https://example.com/b') }), { code: 'run_terminal' });
  assert.throws(() => ledger.registerEvidence({ ...args, source: source() }), { code: 'run_terminal' });
  assert.equal(ledger.listEvidence(args).length, 1);
});

check('trailing-dot public hosts normalize to the same source identity', (t) => {
  const { ledger, args } = fixture(t);
  assert.equal(ledger.registerEvidence({ ...args, source: source('https://example.com./a') }).citationId, 'S1');
  assert.equal(ledger.registerEvidence({ ...args, source: source('https://example.com/a') }).citationId, 'S1');
  assert.equal(ledger.listEvidence(args).length, 1);
  assert.equal(ledger.listEvidence(args)[0].url, 'https://example.com/a');
});

function runningFixture(t) {
  const result = fixture(t); result.store.startRun(result.args); return result;
}
const complete = (store, args, extra = {}) => store.transitionRun({ ...args, status: 'completed', payload: { answer: 'Audited public answer', verified: true, citationIds: [], ...extra } });
function unchanged(store, args) {
  assert.equal(store.getRun(args).status, 'running');
  assert.deepEqual(store.listEvents(args).map(event => event.sequence), [1, 2]);
}

check('completed requires a nonempty audited answer and an explicit citation ID list', (t) => {
  const { store, args } = runningFixture(t);
  for (const payload of [{}, { verified: true, citationIds: [] }, { answer: ' ', verified: true, citationIds: [] }, { answer: 'Draft', verified: false, citationIds: [] }, { answer: 'Audited', verified: true }]) {
    assert.throws(() => store.transitionRun({ ...args, status: 'completed', payload }), { code: 'invalid_input' });
    unchanged(store, args);
  }
});

check('nonexistent and malformed completed citations cannot consume a transition or sequence', (t) => {
  const { store, args } = runningFixture(t);
  for (const citationIds of [['S999'], ['S01'], [1], ['not-a-citation']]) {
    assert.throws(() => complete(store, args, { answer: `Referenced evidence ${citationIds.map(id => `[${id}]`).join('')}`, citationIds }), { code: 'invalid_evidence_reference' });
    unchanged(store, args);
  }
});

check('another run or owners S1 cannot satisfy a completion citation reference', (t) => {
  const { store, ledger, args } = runningFixture(t);
  for (const userId of ['alice', 'bob']) {
    const session = store.createSession({ userId, title: 'Other session' });
    const run = store.createRun({ userId, sessionId: session.id, requestKey: 'other', request: {} });
    ledger.registerEvidence({ userId, runId: run.id, source: source() });
  }
  assert.throws(() => complete(store, args, { answer: 'Other evidence [S1]', citationIds: ['S1'] }), { code: 'invalid_evidence_reference' });
  unchanged(store, args);
});

check('duplicate current-run citations are rejected before committing completion', (t) => {
  const { store, ledger, args } = runningFixture(t);
  ledger.registerEvidence({ ...args, source: source() });
  assert.throws(() => complete(store, args, { answer: 'Evidence [S1]', citationIds: ['S1', 'S1'] }), { code: 'invalid_evidence_reference' });
  unchanged(store, args);
});

check('callers cannot inject completion sources, source IDs, evidence URLs or state metadata', (t) => {
  const { store, args } = runningFixture(t);
  for (const extra of [
    { sources: [source('https://service.internal/private')] },
    { sources: [source('https://127.0.0.1/private')] },
    { sources: [source('https://example.com/a?token=private')] },
    { sources: [source('https://user:password@example.com/private')] },
    { sourceIds: ['S1'] }, { evidenceUrls: ['https://127.0.0.1/private'] }, { status: 'forged' }
  ]) {
    assert.throws(() => complete(store, args, extra), { code: 'invalid_input' });
    unchanged(store, args);
  }
});

check('completion derives exact public sources from the owned ledger in citation order', (t) => {
  const { store, ledger, args } = runningFixture(t);
  const first = ledger.registerEvidence({ ...args, source: source('https://EXAMPLE.com./a#part', { id: 'news-a', summary: 'First public summary' }) });
  const second = ledger.registerEvidence({ ...args, source: source('https://example.org/b', { id: 'news-b', summary: 'Second public summary' }) });
  const expected = [structuredClone(second), structuredClone(first)];
  first.title = 'Modified returned object';
  const result = complete(store, args, { answer: 'Audited evidence [S2][S1]', citationIds: ['S2', 'S1'] });
  assert.equal(result.run.status, 'completed');
  assert.deepEqual(result.event.payload.citationIds, ['S2', 'S1']);
  assert.deepEqual(result.event.payload.sources, expected);
  assert.deepEqual(store.listEvents(args).at(-1).payload.sources, expected);
  assert.equal(result.event.sequence, 3);
});

check('an audited insufficient-evidence answer may complete with zero citations and sources', (t) => {
  const { store, args } = runningFixture(t);
  const result = complete(store, args, { answer: '没有足够公开证据支持结论。' });
  assert.deepEqual(result.event.payload.citationIds, []);
  assert.deepEqual(result.event.payload.sources, []);
  assert.equal(result.run.status, 'completed');
});

check('derived completion sources obey JSON budgets and durable event failures fully roll back', (t) => {
  const { store, ledger, args } = runningFixture(t);
  const citationIds = Array.from({ length: 43 }, (_, index) => ledger.registerEvidence({ ...args, source: source(`https://example.com/${index}`, { summary: 'a'.repeat(4000) }) }).citationId);
  assert.throws(() => complete(store, args, { answer: `Audited evidence ${citationIds.map(id => `[${id}]`).join('')}`, citationIds }), { code: 'input_too_large' });
  unchanged(store, args);
  store.db.exec("CREATE TRIGGER reject_completion BEFORE INSERT ON agent_run_events WHEN NEW.type='completed' BEGIN SELECT RAISE(ABORT,'completion blocked'); END;");
  assert.throws(() => complete(store, args, { answer: 'Audited evidence [S1]', citationIds: ['S1'] }), /completion blocked/);
  unchanged(store, args);
  store.db.exec('DROP TRIGGER reject_completion');
  assert.equal(complete(store, args, { answer: 'Audited evidence [S1]', citationIds: ['S1'] }).event.payload.sources[0].citationId, 'S1');
});

check('answer citation markers must equal the explicit ledger reference set before completion', (t) => {
  const { store, ledger, args } = runningFixture(t);
  ledger.registerEvidence({ ...args, source: source() });
  ledger.registerEvidence({ ...args, source: source('https://example.com/b') });
  for (const [answer, citationIds] of [
    ['Unsupported [S999]', []], ['Unsupported [S999]', ['S1']], ['Evidence [S1]', ['S2']],
    ['Evidence [S1]', ['S1', 'S2']], ['No citation marker', ['S1']]
  ]) {
    assert.throws(() => complete(store, args, { answer, citationIds }), { code: 'invalid_evidence_reference' });
    unchanged(store, args);
  }
  const result = complete(store, args, { answer: 'Audited evidence [S1][S2][S1]', citationIds: ['S2', 'S1'] });
  assert.deepEqual(result.event.payload.sources.map(item => item.citationId), ['S2', 'S1']);
  assert.equal(result.event.sequence, 3);
});

check('ledger rejects malformed DNS and reserved names but preserves canonical IDN identity', (t) => {
  const { ledger, args } = fixture(t);
  for (const host of ['foo..bar', '-foo.com', 'foo-.com', '.example', 'under_score.com', 'foo.test', 'foo.example', 'foo.onion', 'example.com..', 'example.com...']) {
    assert.throws(() => ledger.registerEvidence({ ...args, source: source(`https://${host}/a`) }), { code: 'invalid_input' });
  }
  assert.equal(ledger.listEvidence(args).length, 0);
  assert.equal(ledger.registerEvidence({ ...args, source: source('https://例子.中国/a') }).citationId, 'S1');
  assert.equal(ledger.registerEvidence({ ...args, source: source('https://xn--fsqu00a.xn--fiqs8s/a') }).citationId, 'S1');
  assert.equal(ledger.listEvidence(args)[0].url, 'https://xn--fsqu00a.xn--fiqs8s/a');
});

check('completion refuses malformed legacy DNS destinations from durable source rows', (t) => {
  const { store, ledger, args } = runningFixture(t);
  ledger.registerEvidence({ ...args, source: source() });
  const original = store.db.prepare('SELECT source_json FROM agent_evidence WHERE run_id=? AND source_number=1').get(args.runId).source_json;
  for (const host of ['foo..bar', '-foo.com', 'foo-.com', '.example', 'under_score.com', 'foo.test', 'foo.example', 'foo.onion', 'example.com..', 'example.com...']) {
    store.db.prepare('UPDATE agent_evidence SET source_json=? WHERE run_id=? AND source_number=1').run(JSON.stringify({ ...JSON.parse(original), url: `https://${host}/a` }), args.runId);
    assert.throws(() => complete(store, args, { answer: 'Audited evidence [S1]', citationIds: ['S1'] }), { code: 'invalid_evidence_reference' });
    unchanged(store, args);
  }
  store.db.prepare('UPDATE agent_evidence SET source_json=? WHERE run_id=? AND source_number=1').run(original, args.runId);
  assert.equal(complete(store, args, { answer: 'Audited evidence [S1]', citationIds: ['S1'] }).event.payload.sources[0].url, 'https://example.com/a');
});
