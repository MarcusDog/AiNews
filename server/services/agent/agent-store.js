const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createReadTools } = require('./tools/read-tools');
const { validate } = require('./tool-schemas');
const { ERRORS } = require('./tool-registry');
const { publicUrl, schemas } = require('./public-projections');

// Events accommodate the registry's 131072-byte / 20000-node result budget
// plus bounded metadata. Requests and raw evidence retain their smaller budget.
const LIMITS = Object.freeze({ textBytes: 32768, jsonBytes: 65536, eventJsonBytes: 163840, depth: 8, nodes: 2048, eventNodes: 20128, listItems: 100, pageItems: 100 });
const ACTIVE = ['queued', 'running', 'awaiting_approval'];
const TERMINAL = ['completed', 'failed', 'cancelled'];
const RESERVED_EVENTS = new Set([...ACTIVE, ...TERMINAL, 'recovered']);
const PRIVATE_KEY = /(?:thinking|reasoning|credential|secret|password|authorization|cookie|token$|api.?key|provider.?content|private|raw|headers|payload.?json|request.?json)/i;
const CONVERSATION_KEYS = new Set(['context', 'history', 'role', 'content', 'messages']);
// Conversation containers never cross this boundary, including inside tool
// results. Public user/assistant messages have their own agent_messages table.
// Nested tool results must already be projected by the read-tool registry.
const PUBLIC_KEYS = new Set(`message mode skillId skillIds model provider
  title summary description text answer verified reason status code error notice toolName toolCallId
  name arguments result data sources citationIds sourceIds usage inputTokens outputTokens totalTokens
  step count total items query limit since until category topic audience goal format request evidence
  generatedAt publishedAt createdAt updatedAt date id url canonicalUrl source sourceName sourceId
  citationId evidenceType region claimBoundary sourceGroup language sourceTrustClass platform kind author
  metrics tags views likes comments replies shares reposts stars forks openIssues points rank downloads
  bookmarks platformRank followersAtCapture opportunity profile formulaVersion angle creatorScore angles
  riskNotes anchor firstSeenAt latestSeenAt trendDirection evidenceStrength trendScore evidenceCount signals
  accountId creatorId creatorName contentType provenanceUrl verticalIds sourceConfidence verticalId hotness
  creatorCount platformCount postId tier lastSuccessAt lastAttemptAt latestPostAt accountCount
  enabledAccountCount postCount failureCount articleCount lastFetchAt seq topicId changeType changedAt
  diversity regions evidenceTypes citationPolicy site today diversityScore riskLevel trends blindSpots
  keyword recentCount previousCount growth blindSpot blindSpotLabel confidence requiresApproval
  sessionId runId progress durationMs elapsedMs maxSteps maxTokens timeoutMs evidenceUrls`.split(/\s+/).filter(Boolean));
const REQUEST_KEYS = new Set('message mode skillId skillIds model provider topic audience goal format query category since until limit maxSteps maxTokens timeoutMs'.split(' '));
const PROGRESS_KEYS = new Set('message summary step count total progress toolName toolCallId name durationMs elapsedMs code notice'.split(' '));
const TOOL_RESULT_KEYS = new Set([...PROGRESS_KEYS, 'arguments', 'result', 'usage']);
const TOOL_STARTED_KEYS = new Set([...PROGRESS_KEYS, 'arguments']);
const TRANSITION_KEYS = {
  running: new Set('status message summary step progress notice'.split(' ')),
  completed: new Set('answer verified citationIds usage model provider'.split(' ')),
  failed: new Set('status code error reason message'.split(' ')),
  cancelled: new Set('status code error reason message'.split(' '))
};
const EVENT_TEXT_KEYS = new Set('message text answer reason status code notice toolName toolCallId name summary model provider'.split(' '));
const EVIDENCE_KEYS = new Set(Object.keys(schemas.evidence.properties).filter(key => key !== 'citationId'));
// Derive nested public keys from the same closed input/output contracts used by
// the live registry; validate complete tool arguments/results below as well.
const TOOL_CONTRACTS = new Map(createReadTools().map(({ name, inputSchema, outputSchema }) => [name, { inputSchema, outputSchema }]));
function collectKeys(schema) {
  if (schema.properties) for (const [key, child] of Object.entries(schema.properties)) { PUBLIC_KEYS.add(key); collectKeys(child); }
  if (schema.items) collectKeys(schema.items);
}
for (const tool of TOOL_CONTRACTS.values()) { collectKeys(tool.inputSchema); collectKeys(tool.outputSchema); }
PUBLIC_KEYS.add('ok');

function fail(code) { const error = new Error(code); error.code = code; return error; }
function text(value, max = LIMITS.textBytes, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.includes('\u0000')) throw fail('invalid_input');
  if (Buffer.byteLength(value, 'utf8') > max) throw fail('input_too_large');
  return value;
}
function fields(input, allowed, required = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw fail('invalid_input');
  const keys = Reflect.ownKeys(input);
  if (keys.length > LIMITS.nodes) throw fail('input_too_large');
  if (keys.some(key => typeof key !== 'string' || !allowed.includes(key)
      || !Object.getOwnPropertyDescriptor(input, key).enumerable || !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key), 'value'))
    || required.some(key => !Object.hasOwn(input, key))) throw fail('invalid_input');
  return input;
}

function publicJson(value, { allowedKeys = PUBLIC_KEYS, rootKeys = allowedKeys, maxBytes = LIMITS.jsonBytes, maxNodes = LIMITS.nodes, validateUrls = false } = {}) {
  let nodes = 0; let bytes = 0;
  const seen = new Set();
  const walk = (item, depth) => {
    if (++nodes > maxNodes || depth > LIMITS.depth) throw fail('input_too_large');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number') { if (!Number.isFinite(item)) throw fail('invalid_input'); return item; }
    if (typeof item === 'string') {
      bytes += Buffer.byteLength(item, 'utf8');
      if (bytes > maxBytes) throw fail('input_too_large');
      if (item.includes('\u0000')) throw fail('invalid_input');
      return item;
    }
    if (!item || typeof item !== 'object' || seen.has(item)) throw fail('invalid_input');
    seen.add(item);
    let result;
    if (Array.isArray(item)) {
      if (item.length > LIMITS.listItems) throw fail('input_too_large');
      const keys = Reflect.ownKeys(item);
      if (keys.length !== item.length + 1 || keys.some(key => typeof key !== 'string'
        || (key !== 'length' && (!/^(0|[1-9][0-9]*)$/.test(key) || !Object.getOwnPropertyDescriptor(item, key).enumerable)))) throw fail('invalid_input');
      result = [];
      for (let i = 0; i < item.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(i));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw fail('invalid_input');
        result.push(walk(descriptor.value, depth + 1));
      }
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw fail('invalid_input');
      const keys = Reflect.ownKeys(item);
      if (keys.length + nodes > maxNodes) throw fail('input_too_large');
      if (keys.some(key => typeof key !== 'string')) throw fail('invalid_input');
      result = {};
      for (const key of keys.sort()) {
        bytes += Buffer.byteLength(key, 'utf8');
        if (bytes > maxBytes) throw fail('input_too_large');
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (PRIVATE_KEY.test(key) || CONVERSATION_KEYS.has(key) || !allowedKeys.has(key) || (depth === 0 && !rootKeys.has(key))
          || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw fail('invalid_input');
        // Scalar display metadata must not become an alternate nested provider
        // or message container under otherwise-public data/result projections.
        if (['provider', 'model', 'message', 'text'].includes(key) && typeof descriptor.value !== 'string') throw fail('invalid_input');
        // Evidence registration normalizes raw URLs separately. Durable event
        // trees may contain only already-canonical public destinations or null.
        if (validateUrls && ['url', 'canonicalUrl', 'provenanceUrl'].includes(key) && descriptor.value !== null
          && (typeof descriptor.value !== 'string' || publicUrl(descriptor.value) !== descriptor.value)) throw fail('invalid_input');
        result[key] = walk(descriptor.value, depth + 1);
      }
    }
    seen.delete(item);
    return result;
  };
  const result = walk(value, 0);
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > maxBytes) throw fail('input_too_large');
  return result;
}

function publicRequest(value) {
  const request = publicJson(value, { rootKeys: REQUEST_KEYS });
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw fail('invalid_input');
  for (const [key, item] of Object.entries(request)) {
    if (key === 'skillIds') {
      if (!Array.isArray(item)) throw fail('invalid_input');
      item.forEach(id => text(id, 200));
    } else if (['limit', 'maxSteps', 'maxTokens', 'timeoutMs'].includes(key)) {
      if (!Number.isSafeInteger(item) || item < 1) throw fail('invalid_input');
    } else text(item, key === 'message' ? LIMITS.textBytes : 2000);
  }
  return request;
}

function publicEvent(value, rootKeys) {
  const payload = publicJson(value, { rootKeys, maxBytes: LIMITS.eventJsonBytes, maxNodes: LIMITS.eventNodes, validateUrls: true });
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw fail('invalid_input');
  for (const [key, item] of Object.entries(payload)) {
    if (EVENT_TEXT_KEYS.has(key)) text(item, LIMITS.textBytes, true);
    if (['verified', 'requiresApproval'].includes(key) && typeof item !== 'boolean') throw fail('invalid_input');
  }
  return payload;
}

function publicSources(value) {
  if (!Array.isArray(value)) throw fail('invalid_input');
  for (const source of value) {
    fields(source, ['id', 'title', 'url', 'source', 'summary', 'publishedAt', 'category', 'evidenceType', 'region', 'claimBoundary', 'citationId'], ['title', 'url']);
    for (const [key, item] of Object.entries(source)) text(item, key === 'url' ? 2048 : 4000, true);
  }
}
function publicUsage(value) {
  fields(value, ['inputTokens', 'outputTokens', 'totalTokens']);
  if (Object.values(value).some(item => !Number.isSafeInteger(item) || item < 0)) throw fail('invalid_input');
}
function publicOrdinaryEvent(type, value) {
  const roots = type === 'tool_result' ? TOOL_RESULT_KEYS : ['tool_started', 'tool_call'].includes(type) ? TOOL_STARTED_KEYS : PROGRESS_KEYS;
  const payload = publicEvent(value, roots);
  if (type === 'tool_result' && !Object.hasOwn(payload, 'result')) throw fail('invalid_input');
  if (['tool_result', 'tool_started', 'tool_call'].includes(type)) {
    const tool = TOOL_CONTRACTS.get(payload.toolName);
    if (!tool) throw fail('invalid_input');
    if (Object.hasOwn(payload, 'arguments') && !validate(tool.inputSchema, payload.arguments)) throw fail('invalid_input');
    if (Object.hasOwn(payload, 'result')) {
      const result = payload.result;
      fields(result, ['ok', 'data', 'error'], ['ok']);
      if (result.ok === true) {
        fields(result, ['ok', 'data'], ['ok', 'data']);
        if (!validate(tool.outputSchema, result.data)) throw fail('invalid_input');
      } else if (result.ok === false) {
        fields(result, ['ok', 'error'], ['ok', 'error']); fields(result.error, ['code', 'message'], ['code', 'message']);
        if (!Object.hasOwn(ERRORS, result.error.code) || result.error.message !== ERRORS[result.error.code]) throw fail('invalid_input');
      } else throw fail('invalid_input');
    }
  }
  if (Object.hasOwn(payload, 'usage')) publicUsage(payload.usage);
  return payload;
}
function publicTransition(status, value) {
  if (!Object.hasOwn(TRANSITION_KEYS, status)) throw fail('invalid_transition');
  const payload = publicEvent(value, TRANSITION_KEYS[status]);
  if (status === 'completed') {
    if (!Object.hasOwn(payload, 'answer') || payload.verified !== true || !Array.isArray(payload.citationIds)) throw fail('invalid_input');
    text(payload.answer, LIMITS.textBytes);
  }
  if (Object.hasOwn(payload, 'error')) {
    fields(payload.error, ['code', 'message'], ['code', 'message']); text(payload.error.code, 200); text(payload.error.message, 2000);
  }
  if (Object.hasOwn(payload, 'sources')) publicSources(payload.sources);
  if (Object.hasOwn(payload, 'usage')) publicUsage(payload.usage);
  return payload;
}

function page(input) {
  const limit = input.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > LIMITS.pageItems) throw fail('invalid_input');
  return limit;
}
const sessionProjection = row => ({ id: row.id, title: row.title, archived: Boolean(row.archived), createdAt: row.created_at, updatedAt: row.updated_at });
const runProjection = row => ({ id: row.id, sessionId: row.session_id, requestKey: row.request_key, request: JSON.parse(row.request_json), status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at });
const messageProjection = row => ({ id: row.id, sessionId: row.session_id, runId: row.run_id, role: row.role, content: row.content, createdAt: row.created_at });
const eventProjection = row => ({ id: row.id, runId: row.run_id, sequence: row.sequence, type: row.type, payload: JSON.parse(row.payload_json), createdAt: row.created_at });

/** Synchronous SQLite boundary. All business operations require authenticated userId.
 * Inject a shared DatabaseService.db after its initialization, or use dbPath. A
 * recovery is universally opt-in. Only a coordinated single startup process
 * may explicitly reconcile interrupted work before accepting requests. Rolling
 * deployments and concurrent live connections must never opt in casually:
 * without a lease this would terminate runs owned by another live process.
 */
class AgentStore {
  constructor(options = {}) {
    this.dbPath = options.dbPath || process.env.AINEWS_DB_PATH || path.join(__dirname, '../../data/ainews.db');
    this.db = options.db || null;
    this.ownsDb = !options.db;
    this.initialized = false;
    this.now = options.now || Date.now;
    this.retentionMs = options.retentionMs ?? 30 * 24 * 60 * 60 * 1000;
    if (options.recoverOnInitialize !== undefined && typeof options.recoverOnInitialize !== 'boolean') throw fail('invalid_input');
    this.recoverOnInitialize = options.recoverOnInitialize ?? false;
    this._retention(this.retentionMs);
  }

  initialize() {
    if (this.initialized) return this;
    if (!this.db) {
      if (this.dbPath !== ':memory:') fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
      this.db = new Database(this.dbPath);
    }
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(id,user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_owner ON agent_sessions(user_id,updated_at DESC);
      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT NOT NULL,
        request_key TEXT NOT NULL, request_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('queued','running','awaiting_approval','completed','failed','cancelled')),
        last_event_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_event_sequence>=0),
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER,
        UNIQUE(user_id,session_id,request_key), UNIQUE(id,user_id), UNIQUE(id,user_id,session_id),
        FOREIGN KEY(session_id,user_id) REFERENCES agent_sessions(id,user_id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_runs_one_active ON agent_runs(session_id)
        WHERE status IN ('queued','running','awaiting_approval');
      CREATE INDEX IF NOT EXISTS idx_agent_runs_owner ON agent_runs(user_id,session_id,created_at DESC);
      CREATE TABLE IF NOT EXISTS agent_messages (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT NOT NULL, run_id TEXT,
        role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL, created_at INTEGER NOT NULL,
        FOREIGN KEY(session_id,user_id) REFERENCES agent_sessions(id,user_id) ON DELETE CASCADE,
        FOREIGN KEY(run_id,user_id,session_id) REFERENCES agent_runs(id,user_id,session_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_agent_messages_owner ON agent_messages(user_id,session_id,created_at,id);
      CREATE TABLE IF NOT EXISTS agent_run_events (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, run_id TEXT NOT NULL,
        sequence INTEGER NOT NULL CHECK(sequence>0), type TEXT NOT NULL, payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL, UNIQUE(run_id,sequence),
        FOREIGN KEY(run_id,user_id) REFERENCES agent_runs(id,user_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS agent_evidence (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, run_id TEXT NOT NULL,
        source_number INTEGER NOT NULL CHECK(source_number>0), source_identity TEXT NOT NULL,
        source_json TEXT NOT NULL, created_at INTEGER NOT NULL,
        UNIQUE(run_id,source_number), UNIQUE(run_id,source_identity),
        FOREIGN KEY(run_id,user_id) REFERENCES agent_runs(id,user_id) ON DELETE CASCADE
      );
    `);
    this.initialized = true;
    try { if (this.recoverOnInitialize) this.reconcileInterruptedRuns(); }
    catch (error) { this.initialized = false; throw error; }
    return this;
  }

  close() {
    if (this.ownsDb && this.db?.open) { this.db.close(); this.db = null; }
    this.initialized = false;
  }
  _ready() { if (!this.initialized) this.initialize(); }
  _time() { const value = this.now(); if (!Number.isSafeInteger(value) || value < 0) throw fail('invalid_input'); return value; }
  _owner(userId) { return text(userId, 200); }
  _session(userId, sessionId) {
    this._ready(); this._owner(userId); text(sessionId, 200);
    const row = this.db.prepare('SELECT rowid AS cursor_order,* FROM agent_sessions WHERE id=? AND user_id=?').get(sessionId, userId);
    if (!row) throw fail('not_found'); return row;
  }
  _run(userId, runId) {
    this._ready(); this._owner(userId); text(runId, 200);
    const row = this.db.prepare('SELECT rowid AS cursor_order,* FROM agent_runs WHERE id=? AND user_id=?').get(runId, userId);
    if (!row) throw fail('not_found'); return row;
  }
  _transaction(callback) {
    if (this.db?.inTransaction) throw fail('unsupported_transaction_context');
    this._ready();
    if (this.db.inTransaction) throw fail('unsupported_transaction_context');
    return this.db.transaction(callback).immediate();
  }

  createSession(input) {
    fields(input, ['userId', 'title'], ['userId']); this._owner(input.userId);
    const title = text(input.title ?? 'New conversation', 500); const now = this._time();
    const id = crypto.randomUUID(); this._ready();
    this.db.prepare('INSERT INTO agent_sessions(id,user_id,title,created_at,updated_at) VALUES(?,?,?,?,?)').run(id, input.userId, title, now, now);
    return this.getSession({ userId: input.userId, sessionId: id });
  }
  getSession(input) { fields(input, ['userId', 'sessionId'], ['userId', 'sessionId']); return sessionProjection(this._session(input.userId, input.sessionId)); }
  listSessions(input) {
    fields(input, ['userId', 'limit', 'includeArchived', 'beforeSessionId', 'beforeSessionUpdatedAt'], ['userId']); this._owner(input.userId); const limit = page(input);
    if (input.includeArchived !== undefined && typeof input.includeArchived !== 'boolean') throw fail('invalid_input');
    this._ready();
    const hasCursor = Object.hasOwn(input, 'beforeSessionId') || Object.hasOwn(input, 'beforeSessionUpdatedAt');
    if (hasCursor && (!Object.hasOwn(input, 'beforeSessionId') || !Object.hasOwn(input, 'beforeSessionUpdatedAt')
      || !Number.isSafeInteger(input.beforeSessionUpdatedAt) || input.beforeSessionUpdatedAt < 0)) throw fail('invalid_input');
    const anchor = hasCursor ? this._session(input.userId, input.beforeSessionId) : null;
    const cursorTime = hasCursor ? input.beforeSessionUpdatedAt : null;
    return this.db.prepare(`SELECT * FROM agent_sessions WHERE user_id=? AND (?=1 OR archived=0)
      AND (? IS NULL OR updated_at<? OR (updated_at=? AND rowid<?)) ORDER BY updated_at DESC,rowid DESC LIMIT ?`)
      .all(input.userId, input.includeArchived ? 1 : 0, cursorTime, cursorTime, cursorTime, anchor?.cursor_order ?? null, limit).map(sessionProjection);
  }
  updateSessionTitle(input) {
    fields(input, ['userId', 'sessionId', 'title'], ['userId', 'sessionId', 'title']);
    return this._transaction(() => {
      this._session(input.userId, input.sessionId); const title = text(input.title, 500);
      this.db.prepare('UPDATE agent_sessions SET title=?,updated_at=? WHERE id=? AND user_id=?').run(title, this._time(), input.sessionId, input.userId);
      return this.getSession({ userId: input.userId, sessionId: input.sessionId });
    });
  }
  archiveSession(input) {
    fields(input, ['userId', 'sessionId'], ['userId', 'sessionId']);
    return this._transaction(() => {
      this._session(input.userId, input.sessionId);
      if (this.db.prepare("SELECT id FROM agent_runs WHERE user_id=? AND session_id=? AND status IN ('queued','running','awaiting_approval')").get(input.userId, input.sessionId)) throw fail('active_run_exists');
      this.db.prepare('UPDATE agent_sessions SET archived=1,updated_at=? WHERE id=? AND user_id=?').run(this._time(), input.sessionId, input.userId);
      return this.getSession(input);
    });
  }
  appendMessage(input) {
    fields(input, ['userId', 'sessionId', 'runId', 'role', 'content'], ['userId', 'sessionId', 'role', 'content']);
    const content = text(input.content); if (!['user', 'assistant'].includes(input.role)) throw fail('invalid_input');
    return this._transaction(() => {
      this._session(input.userId, input.sessionId);
      if (input.runId !== undefined) {
        const run = this._run(input.userId, input.runId);
        if (run.session_id !== input.sessionId) throw fail('not_found');
        if (TERMINAL.includes(run.status)) throw fail('run_terminal');
      }
      const id = crypto.randomUUID(); const now = this._time();
      this.db.prepare('INSERT INTO agent_messages(id,user_id,session_id,run_id,role,content,created_at) VALUES(?,?,?,?,?,?,?)').run(id, input.userId, input.sessionId, input.runId ?? null, input.role, content, now);
      this.db.prepare('UPDATE agent_sessions SET updated_at=? WHERE id=? AND user_id=?').run(now, input.sessionId, input.userId);
      return this.getMessage({ userId: input.userId, messageId: id });
    });
  }
  getMessage(input) {
    fields(input, ['userId', 'messageId'], ['userId', 'messageId']); this._owner(input.userId); text(input.messageId, 200); this._ready();
    const row = this.db.prepare('SELECT * FROM agent_messages WHERE id=? AND user_id=?').get(input.messageId, input.userId);
    if (!row) throw fail('not_found'); return messageProjection(row);
  }
  listMessages(input) {
    fields(input, ['userId', 'sessionId', 'limit', 'beforeMessageId'], ['userId', 'sessionId']); this._session(input.userId, input.sessionId);
    let anchor = null;
    if (input.beforeMessageId !== undefined) {
      text(input.beforeMessageId, 200);
      anchor = this.db.prepare('SELECT rowid AS cursor_order,* FROM agent_messages WHERE id=? AND user_id=? AND session_id=?').get(input.beforeMessageId, input.userId, input.sessionId);
      if (!anchor) throw fail('not_found');
    }
    return this.db.prepare(`SELECT * FROM (SELECT rowid AS cursor_order,* FROM agent_messages WHERE user_id=? AND session_id=?
      AND (? IS NULL OR created_at<? OR (created_at=? AND rowid<?)) ORDER BY created_at DESC,rowid DESC LIMIT ?)
      ORDER BY created_at,cursor_order`).all(input.userId, input.sessionId, anchor?.created_at ?? null, anchor?.created_at ?? null, anchor?.created_at ?? null, anchor?.cursor_order ?? null, page(input)).map(messageProjection);
  }
  createRun(input) {
    fields(input, ['userId', 'sessionId', 'requestKey', 'request'], ['userId', 'sessionId', 'requestKey', 'request']);
    text(input.requestKey, 200); const request = publicRequest(input.request);
    const json = JSON.stringify(request);
    return this._transaction(() => {
      const session = this._session(input.userId, input.sessionId);
      const existing = this.db.prepare('SELECT * FROM agent_runs WHERE user_id=? AND session_id=? AND request_key=?').get(input.userId, input.sessionId, input.requestKey);
      if (existing) { if (existing.request_json !== json) throw fail('request_key_conflict'); return runProjection(existing); }
      if (session.archived) throw fail('session_archived');
      if (this.db.prepare("SELECT id FROM agent_runs WHERE user_id=? AND session_id=? AND status IN ('queued','running','awaiting_approval')").get(input.userId, input.sessionId)) throw fail('active_run_exists');
      const id = crypto.randomUUID(); const now = this._time();
      this.db.prepare("INSERT INTO agent_runs(id,user_id,session_id,request_key,request_json,status,created_at,updated_at) VALUES(?,?,?,?,?,'queued',?,?)").run(id, input.userId, input.sessionId, input.requestKey, json, now, now);
      this._insertEvent(input.userId, id, 'queued', { status: 'queued' });
      this.db.prepare('UPDATE agent_sessions SET updated_at=? WHERE id=? AND user_id=?').run(now, input.sessionId, input.userId);
      return this.getRun({ userId: input.userId, runId: id });
    });
  }
  getRun(input) { fields(input, ['userId', 'runId'], ['userId', 'runId']); return runProjection(this._run(input.userId, input.runId)); }
  listRuns(input) {
    fields(input, ['userId', 'sessionId', 'limit', 'beforeRunId'], ['userId', 'sessionId']); this._session(input.userId, input.sessionId);
    const anchor = input.beforeRunId === undefined ? null : this._run(input.userId, input.beforeRunId);
    if (anchor && anchor.session_id !== input.sessionId) throw fail('not_found');
    return this.db.prepare(`SELECT * FROM agent_runs WHERE user_id=? AND session_id=?
      AND (? IS NULL OR created_at<? OR (created_at=? AND rowid<?)) ORDER BY created_at DESC,rowid DESC LIMIT ?`)
      .all(input.userId, input.sessionId, anchor?.created_at ?? null, anchor?.created_at ?? null, anchor?.created_at ?? null, anchor?.cursor_order ?? null, page(input)).map(runProjection);
  }
  findRunByRequestKey(input) {
    fields(input, ['userId', 'sessionId', 'requestKey'], ['userId', 'sessionId', 'requestKey']);
    this._session(input.userId, input.sessionId); text(input.requestKey, 200);
    const row = this.db.prepare('SELECT * FROM agent_runs WHERE user_id=? AND session_id=? AND request_key=?').get(input.userId, input.sessionId, input.requestKey);
    return row ? runProjection(row) : null;
  }
  startRun(input) { fields(input, ['userId', 'runId'], ['userId', 'runId']); return this.transitionRun({ ...input, status: 'running' }); }
  claimRun(input) { return this.startRun(input); }
  cancelRun(input) { fields(input, ['userId', 'runId', 'payload'], ['userId', 'runId']); return this.transitionRun({ ...input, status: 'cancelled' }); }
  // Called only inside the same IMMEDIATE transaction as the state and event
  // mutation. A bare S# is meaningful exclusively within its owned run ledger.
  _completedSources(userId, runId, citationIds, answer) {
    const seen = new Set();
    for (const citationId of citationIds) {
      if (typeof citationId !== 'string' || !/^S[1-9][0-9]{0,9}$/.test(citationId) || seen.has(citationId)) throw fail('invalid_evidence_reference');
      seen.add(citationId);
    }
    const answerIds = new Set(Array.from(answer.matchAll(/\[(S\d+)\]/g), match => match[1]));
    if (answerIds.size !== seen.size || [...answerIds].some(id => !seen.has(id))) throw fail('invalid_evidence_reference');
    const lookup = this.db.prepare('SELECT source_number,source_json FROM agent_evidence WHERE user_id=? AND run_id=? AND source_number=?');
    return citationIds.map(citationId => {
      const row = lookup.get(userId, runId, Number(citationId.slice(1)));
      if (!row) throw fail('invalid_evidence_reference');
      let source;
      try {
        source = publicJson(JSON.parse(row.source_json), { allowedKeys: EVIDENCE_KEYS });
        publicSources([source]);
        if (!publicUrl(source.url) || publicUrl(source.url) !== source.url) throw fail('invalid_evidence_reference');
      } catch { throw fail('invalid_evidence_reference'); }
      return { ...source, citationId: `S${row.source_number}` };
    });
  }
  transitionRun(input) {
    fields(input, ['userId', 'runId', 'status', 'payload'], ['userId', 'runId', 'status']);
    const payload = publicTransition(input.status, input.payload ?? {});
    return this._transaction(() => {
      const run = this._run(input.userId, input.runId);
      const allowed = run.status === 'queued' ? ['running', 'failed', 'cancelled']
        : run.status === 'running' ? TERMINAL : run.status === 'awaiting_approval' ? ['failed', 'cancelled'] : [];
      if (!allowed.includes(input.status)) throw fail('invalid_transition');
      const eventPayload = input.status === 'completed'
        ? publicJson({ ...payload, status: input.status, sources: this._completedSources(input.userId, input.runId, payload.citationIds, payload.answer) }, { maxBytes: LIMITS.eventJsonBytes, maxNodes: LIMITS.eventNodes, validateUrls: true })
        : { ...payload, status: input.status };
      const now = this._time();
      this.db.prepare('UPDATE agent_runs SET status=?,updated_at=?,completed_at=? WHERE id=? AND user_id=?').run(input.status, now, TERMINAL.includes(input.status) ? now : null, input.runId, input.userId);
      const event = this._insertEvent(input.userId, input.runId, input.status, eventPayload);
      this.db.prepare('UPDATE agent_sessions SET updated_at=? WHERE id=? AND user_id=?').run(now, run.session_id, input.userId);
      return { run: this.getRun({ userId: input.userId, runId: input.runId }), event };
    });
  }
  _insertEvent(userId, runId, type, payload) {
    const run = this._run(userId, runId); const sequence = run.last_event_sequence + 1;
    if (!Number.isSafeInteger(sequence)) throw fail('input_too_large');
    const id = crypto.randomUUID(); const now = this._time();
    this.db.prepare('INSERT INTO agent_run_events(id,user_id,run_id,sequence,type,payload_json,created_at) VALUES(?,?,?,?,?,?,?)').run(id, userId, runId, sequence, type, JSON.stringify(payload), now);
    this.db.prepare('UPDATE agent_runs SET last_event_sequence=? WHERE id=? AND user_id=?').run(sequence, runId, userId);
    return { id, runId, sequence, type, payload: JSON.parse(JSON.stringify(payload)), createdAt: now };
  }
  appendEvent(input) {
    fields(input, ['userId', 'runId', 'type', 'payload'], ['userId', 'runId', 'type', 'payload']);
    if (typeof input.type !== 'string' || !/^[a-z][a-z0-9_.:-]{0,79}$/.test(input.type) || RESERVED_EVENTS.has(input.type)) throw fail('invalid_input');
    const payload = publicOrdinaryEvent(input.type, input.payload);
    return this._transaction(() => {
      if (TERMINAL.includes(this._run(input.userId, input.runId).status)) throw fail('run_terminal');
      return this._insertEvent(input.userId, input.runId, input.type, payload);
    });
  }
  listEvents(input) {
    fields(input, ['userId', 'runId', 'afterSequence', 'limit'], ['userId', 'runId']); this._run(input.userId, input.runId);
    const after = input.afterSequence ?? 0;
    if (!Number.isSafeInteger(after) || after < 0) throw fail('invalid_input');
    return this.db.prepare('SELECT * FROM agent_run_events WHERE user_id=? AND run_id=? AND sequence>? ORDER BY sequence LIMIT ?').all(input.userId, input.runId, after, page(input)).map(eventProjection);
  }

  // Startup-only maintenance; it deliberately operates across owners, derives
  // the owner from stored rows and never accepts caller-supplied target IDs.
  reconcileInterruptedRuns() {
    return this._transaction(() => {
      const runs = this.db.prepare("SELECT id,user_id FROM agent_runs WHERE status IN ('queued','running','awaiting_approval') ORDER BY created_at,id").all();
      for (const run of runs) {
        const now = this._time();
        this.db.prepare("UPDATE agent_runs SET status='failed',updated_at=?,completed_at=? WHERE id=? AND user_id=?").run(now, now, run.id, run.user_id);
        this._insertEvent(run.user_id, run.id, 'recovered', { status: 'failed', code: 'interrupted', reason: 'Execution interrupted by server restart.' });
      }
      return runs.length;
    });
  }
  _retention(value) { if (!Number.isSafeInteger(value) || value < 0) throw fail('invalid_input'); }
  pruneRetention(input = {}) {
    fields(input, ['now', 'retentionMs']); const now = input.now ?? this._time(); const retention = input.retentionMs ?? this.retentionMs;
    this._retention(now); this._retention(retention);
    return this._transaction(() => {
      const where = "status IN ('completed','failed','cancelled') AND completed_at IS NOT NULL AND completed_at < ?";
      const cutoff = now - retention;
      const counts = { runs: this.db.prepare(`SELECT COUNT(*) AS n FROM agent_runs WHERE ${where}`).get(cutoff).n };
      for (const [key, table] of [['messages', 'agent_messages'], ['events', 'agent_run_events'], ['evidence', 'agent_evidence']]) {
        counts[key] = this.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE run_id IN (SELECT id FROM agent_runs WHERE ${where})`).get(cutoff).n;
      }
      this.db.prepare(`DELETE FROM agent_runs WHERE ${where}`).run(cutoff);
      return counts;
    });
  }
}

module.exports = { AgentStore, LIMITS, publicJson, fields, text, page, fail };
