const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..', '..');

test('server lockfile only uses canonical HTTPS npm registry tarballs', () => {
  const lockfile = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'server', 'package-lock.json'), 'utf8')
  );
  const invalidResolvedUrls = Object.values(lockfile.packages || {})
    .map((entry) => entry && entry.resolved)
    .filter(Boolean)
    .filter((resolved) => !resolved.startsWith('https://registry.npmjs.org/'));

  assert.deepEqual(
    invalidResolvedUrls,
    [],
    `non-canonical dependency tarballs:\n${invalidResolvedUrls.join('\n')}`
  );
});

test('production Compose builds dependencies into the server image', () => {
  const compose = fs.readFileSync(path.join(repositoryRoot, 'docker-compose.yml'), 'utf8');

  assert.doesNotMatch(compose, /command:\s*[^\n]*npm\s+(?:ci|install)/i);
  assert.match(compose, /ainews-server:[\s\S]*?build:\s*[\s\S]*?context:\s*\.\/server/);
});
