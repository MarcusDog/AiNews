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
