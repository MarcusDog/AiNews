const rateLimit = require('express-rate-limit');

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(parsed, max)) : fallback;
}

function resolveApiRateLimit(env = process.env) {
  return {
    windowMs: 60_000,
    max: boundedInteger(env.AINEWS_API_RATE_LIMIT_PER_MINUTE, 300, 60, 2_000)
  };
}

function createApiRateLimiter(env = process.env) {
  const config = resolveApiRateLimit(env);
  return rateLimit({
    ...config,
    message: {
      success: false,
      error: '请求过于频繁，请稍后再试',
      retryAfter: Math.ceil(config.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health' || req.path.startsWith('/socket.io')
  });
}

module.exports = { createApiRateLimiter, resolveApiRateLimit };
