const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const script = path.resolve(__dirname, '..', '..', 'scripts', 'release-manifest.mjs');

function run(root, command, releaseId) {
  return spawnSync(process.execPath, [script, command, root, ...(releaseId ? [releaseId] : [])], {
    encoding: 'utf8'
  });
}

test('release verification rejects altered checksum list and unsafe manifest metadata', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ainews-manifest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'app.txt'), 'real release content\n');

  assert.equal(run(root, 'create', 'aya-test-20261112').status, 0);
  assert.equal(run(root, 'verify').status, 0);

  const checksumPath = path.join(root, 'SHA256SUMS');
  const original = fs.readFileSync(checksumPath, 'utf8');
  fs.writeFileSync(checksumPath, 'not a valid checksum\n');
  assert.notEqual(run(root, 'verify').status, 0, 'modified SHA256SUMS must fail verification');
  fs.writeFileSync(checksumPath, original);

  const manifestPath = path.join(root, 'release-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, releaseId: '../../escape' }));
  assert.notEqual(run(root, 'verify').status, 0, 'releaseId used in deploy path must be safe');

  fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, fileCount: 999 }));
  assert.notEqual(run(root, 'verify').status, 0, 'fileCount must match manifest entries');

  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  fs.writeFileSync(path.join(root, 'app.txt'), 'modified release content\n');
  assert.notEqual(run(root, 'verify').status, 0, 'modified file must fail content verification');
});

test('verification rejects unlisted symlinks and linked checksum metadata', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ainews-symlinks-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'release');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'app.txt'), 'safe release');
  assert.equal(run(root, 'create', 'aya-test-20261113').status, 0);
  assert.equal(run(root, 'verify').status, 0);

  const outside = path.join(temp, 'outside.txt');
  fs.writeFileSync(outside, 'outside content');
  fs.symlinkSync(outside, path.join(root, 'leak.txt'));
  const extra = run(root, 'verify');
  assert.notEqual(extra.status, 0);
  assert.match(extra.stderr, /symbolic link/);
  fs.unlinkSync(path.join(root, 'leak.txt'));

  const sums = path.join(root, 'SHA256SUMS');
  const copy = path.join(temp, 'checksum.txt');
  fs.copyFileSync(sums, copy);
  fs.unlinkSync(sums);
  fs.symlinkSync(copy, sums);
  const metadata = run(root, 'verify');
  assert.notEqual(metadata.status, 0);
  assert.match(metadata.stderr, /symbolic link/);
});
