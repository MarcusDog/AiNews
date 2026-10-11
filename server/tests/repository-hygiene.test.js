const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const test = require('node:test');
const semver = require('semver');

const root = path.resolve(__dirname, '../..');
const checker = path.join(root, 'scripts/check-repository-hygiene.mjs');
const forbidden = [
  '.env', 'server/.env.production', 'nested/.env.local', 'server/token.local.env',
  'server/data/ainews.db', 'nested/data.sqlite', 'nested/data.sqlite3',
  'server/data/ainews.db-wal', 'server/data/ainews.db-shm',
  'server/data/ainews.db.previous-1', 'nested/data.sqlite3-shm',
  'server/server.log', 'client/client.log', 'nested/output.log.1', 'nested/logs/output.txt',
  'nested/backups/state.json', 'nested/backup/state.json', 'nested/state.bak',
  'nested/state.backup', 'nested/state.dump', 'nested/reports/result.json',
  'nested/report/result.json', 'nested/.cache/value.json', 'nested/cache/value.json',
  'nested/caches/value.json',
  'server/data/exports/aya-creator-2026-10-12T00-00-00-000Z.jsonl',
  'server/data/exports/aya-creator-2026-10-12T00-00-00-000Z.jsonl.tmp-1234',
  'nested/exports/custom.jsonl', 'nested/aya-creator-2026-10-12T00-00-00-000Z.jsonl',
  'nested/aya-creator-2026-10-12T00-00-00-000Z.jsonl.tmp-1234'
];

function meetsSecurityFloor(version, minimum) {
  return Boolean(semver.valid(version) && semver.valid(minimum) && semver.gte(version, minimum));
}

async function loadChecker() {
  assert.ok(fs.existsSync(checker), 'reusable repository hygiene checker must exist');
  return import(checker);
}

test('tracked-file classification rejects secrets and runtime state while allowing templates and code', async () => {
  const { classifyPath } = await loadChecker();
  for (const file of forbidden) assert.ok(classifyPath(file), `must reject ${file}`);
  for (const file of ['server/.env.example', 'nested/.env.example', 'server/index.js', 'server/tests/report.test.js']) {
    assert.equal(classifyPath(file), null, `must allow ${file}`);
  }
});

test('current tracked files and Git/Docker/release exclusions pass the reusable checker', async () => {
  const { checkRepository } = await loadChecker();
  assert.deepEqual(checkRepository(root), []);
  const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('checker resolves the repository root when invoked from the server directory', async () => {
  await loadChecker();
  const result = spawnSync(process.execPath, [checker], { cwd: path.join(root, 'server'), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('checker rejects a Docker policy weakened to a root-only .env pattern', async (t) => {
  const { checkRepository } = await loadChecker();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-docker-policy-'));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', sandbox]);
  fs.mkdirSync(path.join(sandbox, 'server'));
  fs.mkdirSync(path.join(sandbox, 'scripts'));
  for (const file of ['.gitignore', 'scripts/build-release.sh']) {
    fs.copyFileSync(path.join(root, file), path.join(sandbox, file));
  }
  const weakened = fs.readFileSync(path.join(root, 'server/.dockerignore'), 'utf8').replace('**/.env\n', '.env\n');
  fs.writeFileSync(path.join(sandbox, 'server/.dockerignore'), weakened);
  const findings = checkRepository(sandbox);
  assert.ok(findings.some((entry) => entry.category === 'docker-ignore:secret' && entry.path === 'nested/.env'));
  assert.ok(!findings.some((entry) => entry.category === 'docker-ignore:secret' && entry.path === '.env'));
});

test('Docker matching anchors root patterns and preserves recursive, parent, and last-rule behavior', async () => {
  const { dockerExcludes } = await loadChecker();
  assert.equal(typeof dockerExcludes, 'function', 'Docker matcher must be independently testable');
  const cases = [
    [['.env'], '.env', true], [['.env'], 'nested/.env', false],
    [['*.log'], 'nested/output.log', false], [['**/*.log'], 'nested/deep/output.log', true],
    [['**/.env'], '.env', true], [['**/.env'], 'nested/deep/.env', true],
    [['**'], 'nested/deep/file.js', true], [['/**'], 'nested/deep/file.js', true],
    [['/data/'], 'data/nested/value.json', true], [['data'], 'nested/data/value.json', false],
    [['*/temp*'], 'somedir/temporary.txt', true], [['*/temp*'], 'somedir/subdir/temporary.txt', false],
    [['temp?'], 'tempa', true], [['temp?'], 'nested/tempa', false],
    [['**/.env.*', '!**/.env.example'], 'nested/.env.example', false],
    [['**/.env.*', '!**/.env.example', '**/.env.example'], 'nested/.env.example', true],
    [['.'], 'nested/file.js', false]
  ];
  for (const [rules, file, expected] of cases) assert.equal(dockerExcludes(rules, file), expected, `${rules.join(',')} → ${file}`);
});

test('checker fails closed when Docker uses embedded double-star syntax', async (t) => {
  const { checkRepository, dockerExcludes } = await loadChecker();
  for (const pattern of ['**/data**db', 'data**', '**data', 'nested/**foo/file', '***']) {
    assert.throws(() => dockerExcludes([pattern], 'data.db'), /unsupported Docker glob syntax/, pattern);
  }
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-docker-double-star-'));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', sandbox]);
  fs.mkdirSync(path.join(sandbox, 'server'));
  fs.mkdirSync(path.join(sandbox, 'scripts'));
  for (const file of ['.gitignore', 'scripts/build-release.sh']) {
    fs.copyFileSync(path.join(root, file), path.join(sandbox, file));
  }
  const weakened = fs.readFileSync(path.join(root, 'server/.dockerignore'), 'utf8').replace('**/*.db\n', '**/data**db\n');
  fs.writeFileSync(path.join(sandbox, 'server/.dockerignore'), weakened);
  assert.throws(() => checkRepository(sandbox), /unsupported Docker glob syntax/);
  const result = spawnSync(process.execPath, [checker], { cwd: sandbox, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), { category: 'checker:unavailable', path: '.' });
});

test('security floors apply SemVer ordering to prereleases, build metadata, and invalid input', () => {
  const cases = [
    ['4.22.2', false], ['4.22.2+build.1', false], ['4.22.3-beta.1', false],
    ['4.22.3-beta.1+build.1', false], ['4.22.3', true], ['4.22.3+build.1', true],
    ['4.22.4-beta.1', true], ['4.22.4', true], ['4.23.0', true], ['5.0.0', true],
    ['4.22.3garbage', false], ['4.22.3+', false], ['4.22', false], ['4.22.03', false],
    ['4.22.3-01', false], ['4.22.3+bad?metadata', false]
  ];
  for (const [version, expected] of cases) assert.equal(meetsSecurityFloor(version, '4.22.3'), expected, version);
});

test('checker rejects tracked violations with paths and categories only', async (t) => {
  await loadChecker();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-hygiene-'));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', sandbox]);
  fs.mkdirSync(path.join(sandbox, 'server'), { recursive: true });
  fs.mkdirSync(path.join(sandbox, 'scripts'));
  for (const file of ['.gitignore', 'server/.dockerignore', 'scripts/build-release.sh']) {
    fs.copyFileSync(path.join(root, file), path.join(sandbox, file));
  }
  const sentinel = 'SYNTHETIC_CONTENT_MUST_NEVER_BE_PRINTED';
  for (const file of [...forbidden, 'server/.env.example']) {
    fs.mkdirSync(path.dirname(path.join(sandbox, file)), { recursive: true });
    fs.writeFileSync(path.join(sandbox, file), sentinel);
  }
  execFileSync('git', ['add', '-f', '--', ...forbidden, 'server/.env.example'], { cwd: sandbox });
  const result = spawnSync(process.execPath, [checker], { cwd: sandbox, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(sentinel));
  const violations = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(violations.map(({ path: file }) => file).sort(), [...forbidden].sort());
  assert.ok(violations.every((entry) => Object.keys(entry).sort().join(',') === 'category,path'));
});

test('repository ignore rules exclude every runtime class and allow .env.example', () => {
  const ignored = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {
    cwd: root, input: forbidden.join('\n') + '\n', encoding: 'utf8'
  });
  assert.equal(ignored.status, 0);
  assert.deepEqual(ignored.stdout.trim().split('\n').sort(), [...forbidden].sort());
  const template = spawnSync('git', ['check-ignore', '--no-index', 'server/.env.example'], { cwd: root });
  assert.equal(template.status, 1);
});

test('release archive omits equivalent runtime classes and preserves .env.example', (t) => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-hygiene-release-'));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  fs.mkdirSync(path.join(sandbox, 'scripts'));
  for (const file of ['build-release.sh', 'release-manifest.mjs']) {
    fs.copyFileSync(path.join(root, 'scripts', file), path.join(sandbox, 'scripts', file));
  }
  for (const file of [...forbidden, 'server/.env.example', 'server/index.js']) {
    fs.mkdirSync(path.dirname(path.join(sandbox, file)), { recursive: true });
    fs.writeFileSync(path.join(sandbox, file), 'synthetic fixture');
  }
  const archive = execFileSync('bash', [path.join(sandbox, 'scripts/build-release.sh')], {
    cwd: sandbox, env: { ...process.env, AYA_SKIP_BUILD: '1', AYA_RELEASE_OUTPUT_DIR: path.join(sandbox, 'artifacts') },
    encoding: 'utf8'
  }).trim().split('\n').at(-1);
  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n').map((file) => file.replace(/^\.\//, ''));
  for (const file of forbidden) assert.ok(!entries.includes(file), `archive must omit ${file}`);
  assert.ok(entries.includes('server/.env.example'));
  assert.ok(entries.includes('server/index.js'));
});

test('production dependencies retain compatible majors and minimum security fixes', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'server/package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'server/package-lock.json'), 'utf8'));
  const minimums = {
    express: '4.22.3', undici: '7.29.1', 'engine.io': '6.6.10', 'proxy-addr': '2.0.8',
    qs: '6.16.0', 'body-parser': '1.20.8', axios: '1.20.0', 'socket.io': '4.8.3'
  };
  for (const [name, minimum] of Object.entries(minimums)) {
    const entries = Object.entries(lock.packages).filter(([file]) => file.endsWith(`node_modules/${name}`));
    assert.ok(entries.length, `lockfile must contain ${name}`);
    for (const [file, entry] of entries) {
      assert.ok(meetsSecurityFloor(entry.version, minimum), `${file} ${entry.version} must be at least ${minimum}`);
    }
  }
  assert.match(manifest.dependencies.express, /^\^4\.22\.3$/);
  assert.match(manifest.dependencies.undici, /^\^7\.(?:29\.[1-9]\d*|30\.\d+)$/);
  assert.match(manifest.dependencies['node-cron'], /^\^3\./);
  assert.match(lock.packages['node_modules/express'].version, /^4\./);
  assert.match(lock.packages['node_modules/node-cron'].version, /^3\./);
});
