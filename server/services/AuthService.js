const crypto = require('node:crypto');
const util = require('node:util');

const DatabaseService = require('./DatabaseService');

const scryptAsync = util.promisify(crypto.scrypt);

const PASSWORD_MIN_LENGTH = 8;
const SESSION_COOKIE_NAME = 'ainews_session';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

class AuthService {
  normalizeEmail(email = '') {
    return String(email).trim().toLowerCase();
  }

  normalizeDisplayName(displayName = '', email = '') {
    const trimmed = String(displayName || '').trim();
    if (trimmed) return trimmed;

    const localPart = this.normalizeEmail(email).split('@')[0];
    return localPart || 'AI News Reader';
  }

  validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  validatePassword(password = '') {
    return typeof password === 'string' && password.length >= PASSWORD_MIN_LENGTH;
  }

  createHttpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
  }

  async hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await scryptAsync(password, salt, 64);
    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
  }

  async verifyPassword(password, storedHash) {
    if (!storedHash || typeof storedHash !== 'string') {
      return false;
    }

    const [algorithm, salt, hash] = storedHash.split(':');
    if (algorithm !== 'scrypt' || !salt || !hash) {
      return false;
    }

    const expected = Buffer.from(hash, 'hex');
    const actual = await scryptAsync(password, salt, expected.length);
    return crypto.timingSafeEqual(actual, expected);
  }

  hashSessionToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  sanitizeUser(user) {
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      provider: user.provider,
      hasPassword: Boolean(user.password_hash),
      googleLinked: Boolean(user.google_id),
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at
    };
  }

  async createSessionForUser(user, context = {}) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString();

    await DatabaseService.deleteExpiredAuthSessions();
    await DatabaseService.createAuthSession({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash,
      expiresAt,
      userAgent: context.userAgent || null,
      ipAddress: context.ipAddress || null
    });
    await DatabaseService.updateUserLastLogin(user.id);

    const freshUser = await DatabaseService.getUserById(user.id);

    return {
      token,
      maxAgeMs: SESSION_MAX_AGE_MS,
      user: this.sanitizeUser(freshUser)
    };
  }

  async register({ email, password, displayName }, context = {}) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!this.validateEmail(normalizedEmail)) {
      throw this.createHttpError(400, '请输入有效的邮箱地址');
    }
    if (!this.validatePassword(password)) {
      throw this.createHttpError(400, '密码长度至少为8位');
    }

    const existingUser = await DatabaseService.getUserByEmail(normalizedEmail);
    if (existingUser) {
      throw this.createHttpError(409, '该邮箱已注册');
    }

    const user = await DatabaseService.createUser({
      id: crypto.randomUUID(),
      email: normalizedEmail,
      passwordHash: await this.hashPassword(password),
      displayName: this.normalizeDisplayName(displayName, normalizedEmail),
      provider: 'password',
      googleId: null
    });

    return this.createSessionForUser(user, context);
  }

  async login({ email, password }, context = {}) {
    const normalizedEmail = this.normalizeEmail(email);
    const user = await DatabaseService.getUserByEmail(normalizedEmail);

    if (!user || !(await this.verifyPassword(password, user.password_hash))) {
      throw this.createHttpError(401, '邮箱或密码错误');
    }

    return this.createSessionForUser(user, context);
  }

  async getAuthenticatedUser(sessionToken) {
    if (!sessionToken) {
      return null;
    }

    const session = await DatabaseService.getAuthSessionWithUser(this.hashSessionToken(sessionToken));
    if (!session) {
      return null;
    }

    if (new Date(session.expires_at).getTime() <= Date.now()) {
      await DatabaseService.deleteAuthSession(session.token_hash);
      return null;
    }

    return this.sanitizeUser(session);
  }

  async logout(sessionToken) {
    if (!sessionToken) {
      return;
    }

    await DatabaseService.deleteAuthSession(this.hashSessionToken(sessionToken));
  }

  async requireAuthenticatedUser(sessionToken) {
    const user = await this.getAuthenticatedUser(sessionToken);
    if (!user) {
      throw this.createHttpError(401, '未登录');
    }

    return user;
  }

  async updateProfile(sessionToken, { displayName }) {
    const user = await this.requireAuthenticatedUser(sessionToken);
    const normalizedName = this.normalizeDisplayName(displayName, user.email);
    const updatedUser = await DatabaseService.updateUserProfile(user.id, {
      displayName: normalizedName
    });

    return this.sanitizeUser(updatedUser);
  }

  async changePassword(sessionToken, { currentPassword, newPassword }) {
    if (!currentPassword || !newPassword) {
      throw this.createHttpError(400, '请填写当前密码和新密码');
    }

    if (!this.validatePassword(newPassword)) {
      throw this.createHttpError(400, '新密码长度至少为8位');
    }

    const user = await this.requireAuthenticatedUser(sessionToken);
    const storedUser = await DatabaseService.getUserById(user.id);

    if (!storedUser || !(await this.verifyPassword(currentPassword, storedUser.password_hash))) {
      throw this.createHttpError(401, '当前密码错误');
    }

    await DatabaseService.updateUserPassword(user.id, await this.hashPassword(newPassword));
    await DatabaseService.deleteExpiredAuthSessions();

    return this.sanitizeUser(await DatabaseService.getUserById(user.id));
  }
}

module.exports = {
  AuthService,
  authService: new AuthService(),
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS
};
