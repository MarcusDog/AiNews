const crypto = require('node:crypto');
const { fields, text, page, publicJson, fail } = require('./agent-store');
const { publicUrl } = require('./public-projections');

const SOURCE_FIELDS = ['id', 'title', 'summary', 'source', 'url', 'publishedAt', 'category', 'evidenceType', 'region', 'claimBoundary'];
const CREDENTIAL_PARAM = /(?:token|secret|password|credential|api.?key|auth|cookie|signature)|^(?:key|sig|sign|session|sessionid|session_id)$/i;
const projection = row => ({ ...JSON.parse(row.source_json), citationId: `S${row.source_number}` });

/** Identity is the normalized public destination URL, never a caller's row ID.
 * First-public occurrence is immutable; source numbers are allocated under an
 * IMMEDIATE transaction and protected by both identity and number UNIQUE keys.
 */
class EvidenceLedger {
  constructor({ store } = {}) { if (!store) throw fail('invalid_input'); this.store = store; }
  registerEvidence(input) {
    fields(input, ['userId', 'runId', 'source'], ['userId', 'runId', 'source']);
    fields(input.source, SOURCE_FIELDS, ['url', 'title']);
    const data = publicJson(input.source, { allowedKeys: new Set(SOURCE_FIELDS) });
    for (const key of Object.keys(data)) text(data[key], key === 'url' ? 2048 : key === 'summary' ? 4000 : key === 'claimBoundary' ? 2000 : 1000, !['url', 'title'].includes(key));
    let url;
    try {
      const parsed = new URL(data.url);
      if ([...parsed.searchParams.keys()].some(key => CREDENTIAL_PARAM.test(key))) throw fail('invalid_input');
      url = publicUrl(data.url);
    } catch { throw fail('invalid_input'); }
    if (!url) throw fail('invalid_input');
    data.url = url;
    return this.store._transaction(() => {
      this.store._run(input.userId, input.runId);
      const existing = this.store.db.prepare('SELECT * FROM agent_evidence WHERE user_id=? AND run_id=? AND source_identity=?').get(input.userId, input.runId, url);
      if (existing) return projection(existing);
      const number = this.store.db.prepare('SELECT COALESCE(MAX(source_number),0)+1 AS n FROM agent_evidence WHERE user_id=? AND run_id=?').get(input.userId, input.runId).n;
      if (!Number.isSafeInteger(number)) throw fail('input_too_large');
      this.store.db.prepare('INSERT INTO agent_evidence(id,user_id,run_id,source_number,source_identity,source_json,created_at) VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(), input.userId, input.runId, number, url, JSON.stringify(data), this.store._time());
      return { ...data, citationId: `S${number}` };
    });
  }
  listEvidence(input) {
    fields(input, ['userId', 'runId', 'limit', 'afterSourceNumber'], ['userId', 'runId']); this.store._run(input.userId, input.runId);
    const after = input.afterSourceNumber ?? 0;
    if (!Number.isSafeInteger(after) || after < 0) throw fail('invalid_input');
    return this.store.db.prepare('SELECT * FROM agent_evidence WHERE user_id=? AND run_id=? AND source_number>? ORDER BY source_number LIMIT ?').all(input.userId, input.runId, after, page(input)).map(projection);
  }
  getEvidence(input) {
    fields(input, ['userId', 'runId', 'citationId'], ['userId', 'runId', 'citationId']); this.store._run(input.userId, input.runId);
    if (typeof input.citationId !== 'string' || !/^S[1-9][0-9]{0,9}$/.test(input.citationId)) throw fail('invalid_input');
    const row = this.store.db.prepare('SELECT * FROM agent_evidence WHERE user_id=? AND run_id=? AND source_number=?').get(input.userId, input.runId, Number(input.citationId.slice(1)));
    if (!row) throw fail('not_found'); return projection(row);
  }
}

module.exports = { EvidenceLedger };
