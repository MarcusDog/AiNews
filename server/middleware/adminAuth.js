const crypto = require('node:crypto');

function digest(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

function isAdminKeyValid(configuredKey, providedKey) {
  if (typeof configuredKey !== 'string' || typeof providedKey !== 'string') return false;
  if (!configuredKey || !providedKey) return false;
  return crypto.timingSafeEqual(digest(configuredKey), digest(providedKey));
}

function adminAuth(req, res, next) {
  const configuredKey = process.env.ADMIN_API_KEY;
  if (!configuredKey) {
    return res.status(503).json({ success: false, error: '管理后台尚未配置' });
  }

  const providedKey = req.get('x-admin-api-key');
  if (!isAdminKeyValid(configuredKey, providedKey)) {
    return res.status(401).json({ success: false, error: '管理密钥无效' });
  }

  return next();
}

module.exports = { adminAuth, isAdminKeyValid };
