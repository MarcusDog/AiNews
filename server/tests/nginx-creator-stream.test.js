const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('creator SSE location precedes generic API proxy and disables buffering, cache and gzip', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../nginx/nginx.conf'), 'utf8');
  const stream = source.indexOf('location = /api/creators/v1/stream');
  const generic = source.indexOf('location /api/');
  assert(stream >= 0 && stream < generic);
  const block = source.slice(stream, generic);
  assert.match(block, /proxy_buffering off/);
  assert.match(block, /proxy_cache off/);
  assert.match(block, /gzip off/);
  assert.match(block, /proxy_read_timeout 1h/);
  assert.match(block, /proxy_http_version 1\.1/);
  assert.match(block, /X-Accel-Buffering ['"]?no/);
});
