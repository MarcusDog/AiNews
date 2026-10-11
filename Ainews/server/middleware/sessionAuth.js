const { authService, SESSION_COOKIE_NAME } = require('../services/AuthService');

function parseCookies(cookieHeader = '') {
  return String(cookieHeader)
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((cookies, chunk) => {
      const separatorIndex = chunk.indexOf('=');
      if (separatorIndex < 1) return cookies;
      const key = chunk.slice(0, separatorIndex);
      const rawValue = chunk.slice(separatorIndex + 1);
      try {
        cookies[key] = decodeURIComponent(rawValue);
      } catch {
        cookies[key] = rawValue;
      }
      return cookies;
    }, {});
}

function getSessionToken(req) {
  return parseCookies(req.headers.cookie || '')[SESSION_COOKIE_NAME] || null;
}

async function requireSessionUser(req, res, next) {
  try {
    const user = await authService.requireAuthenticatedUser(getSessionToken(req));
    req.authUser = user;
    next();
  } catch (error) {
    res.status(error.status || 401).json({
      success: false,
      error: error.message || '未登录'
    });
  }
}

module.exports = {
  getSessionToken,
  parseCookies,
  requireSessionUser
};
