/**
 * Docker 健康检查脚本；使用与服务进程一致的 PORT。
 */
const http = require('http');

// A malformed Docker PORT must fail the health check cleanly, not throw from http.request.
const portValue = process.env.PORT || '3002';
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
  if (res.statusCode === 200) {
    console.log('Health check passed');
    process.exit(0);
  } else {
    console.log(`Health check failed with status ${res.statusCode}`);
    process.exit(1);
  }
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
