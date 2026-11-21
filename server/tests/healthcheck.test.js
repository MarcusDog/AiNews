const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const script = path.join(__dirname, '..', 'healthcheck.js');

function check(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, PORT: String(port) }
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, output }));
  });
}

async function withHealthServer(status, callback, body = status === 200 ? JSON.stringify({ status: 'ok' }) : '') {
  const server = http.createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(status).end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await callback(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('healthcheck respects custom PORT and accepts HTTP 200', async () => {
  await withHealthServer(200, async (port) => {
    const result = await check(port);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Health check passed/);
  });
});

test('healthcheck rejects unhealthy HTTP responses', async () => {
  await withHealthServer(503, async (port) => {
    const result = await check(port);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /status 503/);
  });
});


test('healthcheck exits cleanly on malformed or out-of-range PORT', async () => {
  for (const value of ['', 'not-a-port', '3002junk', '0', '65536']) {
    const result = await check(value);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /PORT must be an integer between 1 and 65535/);
    assert.doesNotMatch(result.output, /RangeError|ERR_SOCKET_BAD_PORT/);
  }
});

test('healthcheck accepts updating application state', async () => {
  await withHealthServer(200, async (port) => {
    const result = await check(port);
    assert.equal(result.code, 0, result.output);
  }, JSON.stringify({ status: 'updating' }));
});

test('healthcheck rejects HTTP 200 with an invalid application response', async () => {
  for (const body of ['<html>OK</html>', '{}', '{', 'null', JSON.stringify({ status: 'ERROR' })]) {
    await withHealthServer(200, async (port) => {
      const result = await check(port);
      assert.equal(result.code, 1, result.output);
    }, body);
  }
  await withHealthServer(200, async (port) => {
    const result = await check(port);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /too large/);
  }, 'x'.repeat(70000));
});
