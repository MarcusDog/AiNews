/**
 * Docker 健康检查脚本；使用与服务进程一致的 PORT。
 */
const http = require('http');

// A malformed Docker PORT must fail the health check cleanly, not throw from http.request.
// Only default when PORT is unset; an explicitly empty value is invalid.
const portValue = process.env.PORT ?? '3002';
const port = /^\d+$/.test(portValue) ? Number(portValue) : NaN;
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Health check configuration error: PORT must be an integer between 1 and 65535');
  process.exit(1);
}

const options = {
  host: '127.0.0.1',
  port,
  path: '/health',
  method: 'GET',
  timeout: 2000
};

const req = http.request(options, (res) => {
  if (res.statusCode !== 200) {
    console.log('Health check failed with status ' + res.statusCode);
    res.resume();
    process.exit(1);
    return;
  }

  let body = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    body += chunk;
    if (body.length > 65536) {
      console.log('Health check failed: response too large');
      req.destroy();
      process.exit(1);
    }
  });
  res.on('end', () => {
    let health;
    try {
      health = JSON.parse(body);
    } catch {
      console.log('Health check failed: invalid JSON response');
      process.exit(1);
      return;
    }
    // NewsService.healthCheck() returns "ok" or "updating" while the service is available.
    if (health && (health.status === 'ok' || health.status === 'updating')) {
      console.log('Health check passed');
      process.exit(0);
    }
    console.log('Health check failed: unexpected application status');
    process.exit(1);
  });
});

req.on('error', (err) => {
  console.log(`Health check error: ${err.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  console.log('Health check timeout');
  req.destroy();
  process.exit(1);
});

req.end();
