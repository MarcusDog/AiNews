const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const http = require('http');
const { Server } = require('socket.io');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;

// WebSocket配置 - 允许所有来源（开发环境）
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://yourdomain.com']
      : ['http://localhost', 'http://localhost:80', 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'http://127.0.0.1', '*'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 120000,  // 2 分钟超时
  pingInterval: 30000,  // 30 秒心跳
  transports: ['websocket', 'polling'] // 允许轮询作为备选
});

// 信任代理设置
app.set('trust proxy', 1);

// 安全中间件（放宽CSP以支持WebSocket）
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:", "http://localhost:*", "https://*"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  }
}));

// CORS配置 - 允许所有来源（开发环境）
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://yourdomain.com']
    : true, // 开发环境允许所有来源
  credentials: true
}));

// 基础中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API限率配置（更宽松，避免429）
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 60, // 每分钟60次请求
  message: {
    success: false,
    error: '请求过于频繁，请稍后再试',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // 跳过健康检查和WebSocket
    return req.path === '/health' || req.path.startsWith('/socket.io');
  }
});
app.use('/api/', apiLimiter);

// 导入路由
const { createNewsRouter } = require('./routes/news');
const analyticsRoutes = require('./routes/analytics');
const glossaryRoutes = require('./routes/glossary');
const authRoutes = require('./routes/auth');
const userDataRoutes = require('./routes/userData');
const { createContentRouter } = require('./routes/content');
const agentRoutes = require('./routes/agent');
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');
const SignalService = require('./services/signals/signal-service');
const { createSignalsRouter } = require('./routes/signals');
const { newsSchedules } = require('./config/schedules');
const cronOptions = { timezone: newsSchedules.timezone };
const signalService = new SignalService();

// API路由
app.use('/api/news', createNewsRouter({ signalService }));
app.use('/api/analytics', analyticsRoutes);
app.use('/api/glossary', glossaryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user-data', userDataRoutes);
app.use('/api/content/v1', createContentRouter({ signalService }));
app.use('/api/agent', agentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/signals/v1', createSignalsRouter({ service: signalService }));
const contactRoutes = require('./routes/contact');
app.use('/api/contact', contactRoutes);

// 不依赖前端 JavaScript 的公开发现与订阅入口。
app.use(publicRoutes.createPublicRouter({ signalService }));

// 健康检查
app.get('/health', async (req, res) => {
  try {
    const NewsService = require('./services/NewsService');
    const health = await NewsService.healthCheck();
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      ...health
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error.message
    });
  }
});


// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  
  // 记录错误到日志
  const errorLog = {
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  };
  console.error(JSON.stringify(errorLog));
  
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: '接口不存在' });
});

// WebSocket连接处理
io.on('connection', (socket) => {
  console.log(`WebSocket客户端连接: ${socket.id}`);
  
  // 记录连接时间
  socket.connectedAt = new Date();
  
  // 发送欢迎消息
  socket.emit('welcome', {
    message: 'AI资讯实时推送已连接',
    socketId: socket.id,
    serverVersion: '2.0.0',
    timestamp: new Date().toISOString()
  });
  
  // 发送当前系统状态
  (async () => {
    try {
      const NewsService = require('./services/NewsService');
      const health = await NewsService.healthCheck();
      socket.emit('system-status', {
        ...health,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('发送系统状态失败:', error.message);
    }
  })();
  
  // 心跳响应
  socket.on('ping', () => {
    socket.emit('pong');
  });
  
  // 处理订阅请求
  socket.on('subscribe', (data) => {
    console.log(`客户端 ${socket.id} 订阅:`, data);
    if (data.category) {
      socket.join(`category:${data.category}`);
      socket.emit('subscribed', { category: data.category, timestamp: new Date().toISOString() });
    }
  });
  
  // 处理取消订阅
  socket.on('unsubscribe', (data) => {
    if (data.category) {
      socket.leave(`category:${data.category}`);
      socket.emit('unsubscribed', { category: data.category, timestamp: new Date().toISOString() });
    }
  });
  
  // 变更数据的操作只允许走带管理密钥的 /api/admin 路由。
  socket.on('refresh-news', () => {
    socket.emit('refresh-error', {
      error: '请从独立管理后台执行刷新',
      timestamp: new Date().toISOString()
    });
  });
  
  // 请求系统状态
  socket.on('get-status', async () => {
    try {
      const NewsService = require('./services/NewsService');
      const health = await NewsService.healthCheck();
      socket.emit('system-status', {
        ...health,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      socket.emit('error-message', { message: error.message });
    }
  });
  
  // 断开连接
  socket.on('disconnect', (reason) => {
    const connectedDuration = socket.connectedAt 
      ? Math.round((Date.now() - socket.connectedAt.getTime()) / 1000) 
      : 0;
    console.log(`WebSocket客户端断开: ${socket.id}, 原因: ${reason}, 连接时长: ${connectedDuration}秒`);
  });
});

function getLifecycleFlags(env = process.env) {
  const parsedLimit = Number(env.AINEWS_SIGNAL_SOURCE_LIMIT);
  return {
    disableCron: env.AINEWS_DISABLE_CRON === '1',
    skipStartupRefresh: env.AINEWS_SKIP_STARTUP_REFRESH === '1',
    signalSourceLimit: Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined
  };
}

let recoveryTimer = null;

// 启动时初始化。数据库与公开路由始终可用，外部抓取可由显式开关跳过。
async function initializeSystem(options = {}) {
  const env = options.env || process.env;
  const flags = getLifecycleFlags(env);
  const databaseService = options.databaseService || require('./services/DatabaseService');
  const newsService = options.newsService || require('./services/NewsService');
  const currentSignalService = options.signalService || signalService;
  const diversityAuditService = options.diversityAuditService || require('./services/DiversityAuditService').diversityAuditService;
  const socketServer = options.socketServer || io;
  const result = { skippedRefresh: flags.skipStartupRefresh, errors: [] };

  try {
    console.log('🔄 初始化系统...');
    await databaseService.initialize();
    console.log('✅ 数据库初始化完成');
    newsService.setSocketIO(socketServer);
    currentSignalService.initialize();
  } catch (error) {
    result.errors.push(`database: ${error.message}`);
    console.error('❌ 数据库或 Signal 存储初始化失败:', error);
    if (!flags.skipStartupRefresh && !flags.disableCron) scheduleRecoveryInit(options);
    return result;
  }

  if (flags.skipStartupRefresh) return result;

  try {
    console.log('🔄 获取初始新闻数据...');
    await newsService.updateAllNews();
    console.log('✅ 新闻数据初始化完成');
  } catch (error) {
    result.errors.push(`news: ${error.message}`);
    console.error('❌ 初始新闻刷新失败:', error.message);
  }

  try {
    result.signals = await currentSignalService.refreshAll({
      refreshLegacy: false,
      sourceLimit: flags.signalSourceLimit,
      windowHours: newsSchedules.signalWindowHours
    });
    console.log(`✅ Signal 与 Topic 初始化完成：${result.signals.rebuild?.topicCount || 0} 个主题`);
  } catch (error) {
    result.errors.push(`signals: ${error.message}`);
    console.error('❌ 启动时 Signal 刷新失败:', error.message);
  }

  diversityAuditService.ensureTodayAudit()
    .then((audit) => console.log(`✅ 每日信息茧房复核就绪：${audit.status}`))
    .catch((error) => console.error('❌ 启动时信息茧房复核失败:', error.message));
  return result;
}

// 初始化恢复调度；测试/维护模式下不创建后台计时器。
function scheduleRecoveryInit(options = {}) {
  const flags = getLifecycleFlags(options.env || process.env);
  if (flags.disableCron || flags.skipStartupRefresh || recoveryTimer) return null;
  console.log('📅 调度初始化恢复，2分钟后重试...');
  recoveryTimer = setTimeout(async () => {
    recoveryTimer = null;
    const result = await initializeSystem(options);
    if (result.errors?.length) scheduleRecoveryInit(options);
  }, 2 * 60 * 1000);
  recoveryTimer.unref?.();
  return recoveryTimer;
}

let scheduledJobs = [];

function registerCronJobs(options = {}) {
  const env = options.env || process.env;
  if (getLifecycleFlags(env).disableCron) return [];
  const cronLib = options.cronLib || cron;
  const newsService = options.newsService || require('./services/NewsService');
  const currentSignalService = options.signalService || signalService;
  const databaseService = options.databaseService || require('./services/DatabaseService');
  const diversityAuditService = options.diversityAuditService || require('./services/DiversityAuditService').diversityAuditService;
  const sourceLimit = getLifecycleFlags(env).signalSourceLimit;

  const refreshNewsAndSignals = async (label) => {
    try {
      console.log(`⏰ 执行${label}...`);
      await newsService.updateAllNews();
      await currentSignalService.refreshAll({
        refreshLegacy: false,
        sourceLimit,
        windowHours: newsSchedules.signalWindowHours
      });
      console.log(`✅ ${label}完成`);
    } catch (error) {
      console.error(`❌ ${label}失败:`, error.message);
    }
  };

  const jobs = [
    cronLib.schedule(newsSchedules.dailyMorning, () => refreshNewsAndSignals('每日新闻与热点更新'), cronOptions),
    cronLib.schedule(newsSchedules.recurring, () => refreshNewsAndSignals('定期新闻与热点更新'), cronOptions),
    cronLib.schedule(newsSchedules.signalRecurring, async () => {
      try {
        await currentSignalService.refreshAll({ sourceLimit, windowHours: newsSchedules.signalWindowHours });
      } catch (error) {
        console.error('❌ Signal 定时更新失败:', error.message);
      }
    }, cronOptions),
    cronLib.schedule(newsSchedules.diversityAudit, async () => {
      try {
        const audit = await diversityAuditService.runDailyAudit();
        console.log(`✅ 信息茧房复核完成：${audit.status}，评分 ${audit.score ?? '暂无'}`);
      } catch (error) {
        console.error('❌ 信息茧房复核失败:', error.message);
      }
    }, cronOptions),
    cronLib.schedule(newsSchedules.cleanup, async () => {
      try {
        await databaseService.initialize();
        const cleaned = await databaseService.cleanOldNews(newsSchedules.retentionDays);
        const signalCleaned = currentSignalService.store.purgeOldData();
        console.log(`✅ 清理完成，新闻 ${cleaned} 条，Signal ${signalCleaned.signals || 0} 条`);
      } catch (error) {
        console.error('❌ 数据清理失败:', error.message);
      }
    }, cronOptions)
  ];
  scheduledJobs.push(...jobs);
  return jobs;
}

let processHandlersRegistered = false;
function registerProcessHandlers() {
  if (processHandlersRegistered) return;
  processHandlersRegistered = true;
  process.on('uncaughtException', (error) => console.error('未捕获的异常:', error));
  process.on('unhandledRejection', (reason) => console.error('未处理的Promise拒绝:', reason));
  process.on('SIGTERM', () => shutdown({ exit: true }));
}

async function shutdown(options = {}) {
  console.log('开始优雅关闭...');
  if (recoveryTimer) {
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }
  scheduledJobs.forEach((job) => job.stop?.());
  scheduledJobs = [];
  io.close();
  signalService.close();
  try {
    const DatabaseService = require('./services/DatabaseService');
    await DatabaseService.close();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    console.log('服务器已关闭');
    if (options.exit) process.exit(0);
  } catch (error) {
    console.error('关闭时出错:', error);
    if (options.exit) process.exit(1);
  }
}

async function startServer(options = {}) {
  const env = options.env || process.env;
  registerProcessHandlers();
  scheduledJobs = registerCronJobs({ env });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port || PORT, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  console.log(`🚀 AI资讯服务器 v2.0 运行在端口 ${address.port}`);
  console.log(`📱 健康检查: http://localhost:${address.port}/health`);
  console.log(`🔌 WebSocket: ws://localhost:${address.port}`);
  console.log(`📅 定时更新: 每日8:00 + 每2小时；Signal 每30分钟`);
  console.log(`🧭 信息茧房复核: 每日8:30（${newsSchedules.timezone}）`);
  console.log('🧹 数据清理: 每日2:00');
  return initializeSystem({ env });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('服务器启动失败:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  app,
  server,
  io,
  signalService,
  getLifecycleFlags,
  initializeSystem,
  registerCronJobs,
  scheduleRecoveryInit,
  shutdown,
  startServer
};
