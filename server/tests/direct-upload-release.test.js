const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..', '..');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('release archive excludes runtime state and publishes a verifiable manifest', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-release-output-'));
  const result = execFileSync('bash', [path.join(repositoryRoot, 'scripts', 'build-release.sh')], {
    cwd: repositoryRoot,
    env: { ...process.env, AYA_SKIP_BUILD: '1', AYA_RELEASE_OUTPUT_DIR: output },
    encoding: 'utf8'
  });
  const archive = result.trim().split('\n').at(-1);
  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((entry) => entry.replace(/^\.\//, ''));

  assert.ok(entries.includes('release-manifest.json'));
  assert.ok(entries.includes('SHA256SUMS'));
  assert.ok(entries.includes('server/index.js'));
  assert.ok(entries.every((entry) => !/(^|\/)(\.git|node_modules|\.env)(\/|$)/.test(entry)));
  assert.ok(entries.every((entry) => !/^server\/(data|logs|cache)(\/|$)/.test(entry)));

  const checksum = fs.readFileSync(`${archive}.sha256`, 'utf8').trim().split(/\s+/)[0];
  assert.equal(checksum, sha256(archive));
});

test('deployment tooling has no GitHub pull dependency', () => {
  const deploy = fs.readFileSync(path.join(repositoryRoot, 'docker-deploy.sh'), 'utf8');
  assert.doesNotMatch(deploy, /git\s+pull/i);
  assert.match(deploy, /package\)/);
  assert.match(deploy, /upload\)/);
  assert.match(deploy, /rollback\)/);
});

test('server activation switches atomically and rolls back after a failed health check', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-activate-'));
  const releaseOutput = path.join(sandbox, 'artifacts');
  fs.mkdirSync(releaseOutput);
  const archive = execFileSync('bash', [path.join(repositoryRoot, 'scripts', 'build-release.sh')], {
    cwd: repositoryRoot,
    env: { ...process.env, AYA_SKIP_BUILD: '1', AYA_RELEASE_OUTPUT_DIR: releaseOutput },
    encoding: 'utf8'
  }).trim().split('\n').at(-1);
  const root = path.join(sandbox, 'server-root');
  fs.mkdirSync(path.join(root, 'releases'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared', 'server', 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'shared', 'server', '.env'), 'NODE_ENV=production\n');
  fs.writeFileSync(path.join(root, 'shared', 'server', 'data', 'keep.db'), 'preserved');
  const previous = path.join(root, 'releases', 'previous');
  fs.mkdirSync(previous);
  fs.symlinkSync(previous, path.join(root, 'current'));

  const failed = spawnSync('bash', [path.join(repositoryRoot, 'scripts', 'activate-release.sh'), archive, root], {
    env: { ...process.env, AYA_RESTART_COMMAND: 'true', AYA_HEALTH_COMMAND: 'false' },
    encoding: 'utf8'
  });
  assert.notEqual(failed.status, 0);
  assert.equal(fs.realpathSync(path.join(root, 'current')), fs.realpathSync(previous));

  execFileSync('bash', [path.join(repositoryRoot, 'scripts', 'activate-release.sh'), archive, root], {
    env: { ...process.env, AYA_RESTART_COMMAND: 'true', AYA_HEALTH_COMMAND: 'true' }
  });
  assert.notEqual(fs.realpathSync(path.join(root, 'current')), fs.realpathSync(previous));
  const current = fs.realpathSync(path.join(root, 'current'));
  assert.ok(fs.existsSync(path.join(current, 'release-manifest.json')));
  assert.equal(fs.readFileSync(path.join(current, 'server', '.env'), 'utf8'), 'NODE_ENV=production\n');
  assert.equal(fs.readFileSync(path.join(current, 'server', 'data', 'keep.db'), 'utf8'), 'preserved');
});
