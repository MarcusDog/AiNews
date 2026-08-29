const express = require('express');

const {
  authService,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS
} = require('../services/AuthService');
const { getSessionToken } = require('../middleware/sessionAuth');

const router = express.Router();

function buildCookieAttributes(maxAgeSeconds) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];

  if (typeof maxAgeSeconds === 'number') {
    attributes.push(`Max-Age=${maxAgeSeconds}`);
  }

  if (process.env.NODE_ENV === 'production') {
    attributes.push('Secure');
  }

  return attributes;
}

function setSessionCookie(res, token, maxAgeMs) {
  const maxAgeSeconds = Math.floor(maxAgeMs / 1000);
  const cookie = buildCookieAttributes(maxAgeSeconds);
  cookie[0] = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
  res.setHeader('Set-Cookie', cookie.join('; '));
}

function clearSessionCookie(res) {
  const cookie = buildCookieAttributes(0);
  cookie[0] = `${SESSION_COOKIE_NAME}=`;
  res.setHeader('Set-Cookie', cookie.join('; '));
}

function getRequestContext(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ipAddress = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : String(forwardedFor || req.socket.remoteAddress || '').split(',')[0].trim();

  return {
    ipAddress: ipAddress || null,
    userAgent: req.headers['user-agent'] || null
  };
}

function sendAuthError(res, error) {
  res.status(error.status || 500).json({
    success: false,
    error: error.message || '认证失败'
  });
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body || {};
    const result = await authService.register(
      { email, password, displayName },
      getRequestContext(req)
    );

    setSessionCookie(res, result.token, result.maxAgeMs);

    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        oauth: {
          google: 'planned'
        }
      }
    });
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const result = await authService.login({ email, password }, getRequestContext(req));

    setSessionCookie(res, result.token, result.maxAgeMs);

    res.json({
      success: true,
      data: {
        user: result.user,
        session: {
          expiresIn: SESSION_MAX_AGE_MS
        }
      }
    });
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.get('/me', async (req, res) => {
  try {
    const user = await authService.getAuthenticatedUser(getSessionToken(req));
    if (!user) {
      return res.status(401).json({
        success: false,
        error: '未登录'
      });
    }

    res.json({
      success: true,
      data: {
        user,
        oauth: {
          google: 'planned'
        }
      }
    });
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.get('/session', async (req, res) => {
  try {
    const user = await authService.getAuthenticatedUser(getSessionToken(req));
    res.json({
      success: true,
      data: user ? { authenticated: true, user } : { authenticated: false }
    });
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.post('/logout', async (req, res) => {
  try {
    await authService.logout(getSessionToken(req));
    clearSessionCookie(res);
    res.json({
      success: true,
      data: {
        loggedOut: true
      }
    });
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.patch('/profile', async (req, res) => {
  try {
    const user = await authService.updateProfile(getSessionToken(req), {
      displayName: req.body?.displayName
    });

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.post('/password', async (req, res) => {
  try {
    const user = await authService.changePassword(getSessionToken(req), {
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword
    });

    res.json({
      success: true,
      data: {
        user,
        passwordUpdated: true
      }
    });
  } catch (error) {
    sendAuthError(res, error);
  }
});

module.exports = router;
