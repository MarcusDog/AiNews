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
const newsRoutes = require('./routes/news');
const analyticsRoutes = require('./routes/analytics');
const glossaryRoutes = require('./routes/glossary');
const authRoutes = require('./routes/auth');
const userDataRoutes = require('./routes/userData');
const contentRoutes = require('./routes/content');
const agentRoutes = require('./routes/agent');
const adminRoutes = require('./routes/admin');
const { newsSchedules } = require('./config/schedules');
const cronOptions = { timezone: newsSchedules.timezone };

// API路由
app.use('/api/news', newsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/glossary', glossaryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user-data', userDataRoutes);
app.use('/api/content/v1', contentRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/admin', adminRoutes);
const contactRoutes = require('./routes/contact');
app.use('/api/contact', contactRoutes);

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

// 启动时初始化
async function initialize() {
  try {
    console.log('🔄 初始化系统...');
    
    // 初始化数据库
    const DatabaseService = require('./services/DatabaseService');
    await DatabaseService.initialize();
    console.log('✅ 数据库初始化完成');
    
    // 设置WebSocket到NewsService
    const NewsService = require('./services/NewsService');
    NewsService.setSocketIO(io);
    
    // 初始化新闻数据
    console.log('🔄 获取初始新闻数据...');
    await NewsService.updateAllNews();
    console.log('✅ 新闻数据初始化完成');

    const { diversityAuditService } = require('./services/DiversityAuditService');
    diversityAuditService.ensureTodayAudit()
      .then((audit) => console.log(`✅ 每日信息茧房复核就绪：${audit.status}`))
      .catch((error) => console.error('❌ 启动时信息茧房复核失败:', error.message));
    
  } catch (error) {
    console.error('❌ 初始化失败:', error);
    // 不退出，继续运行，稍后重试
    scheduleRecoveryInit();
  }
}

// 初始化恢复调度
function scheduleRecoveryInit() {
  console.log('📅 调度初始化恢复，2分钟后重试...');
  setTimeout(async () => {
    try {
      const NewsService = require('./services/NewsService');
      await NewsService.updateAllNews();
      console.log('✅ 恢复初始化成功');
    } catch (error) {
      console.error('❌ 恢复初始化失败:', error);
      scheduleRecoveryInit(); // 继续重试
    }
  }, 2 * 60 * 1000);
}

// 定时任务：每日早上8点更新新闻（静默模式，不广播）
cron.schedule(newsSchedules.dailyMorning, async () => {
  console.log('⏰ 执行每日定时更新...');
  console.log(`📅 当前时间: ${new Date().toLocaleString('zh-CN')}`);
  try {
    const NewsService = require('./services/NewsService');
    const result = await NewsService.updateAllNews();
    
    if (result && result.totalSaved > 0) {
      console.log(`✅ 每日更新完成，新增 ${result.totalSaved} 条新闻`);
    } else {
      console.log('✅ 每日更新完成，暂无新内容');
    }
  } catch (error) {
    console.error('❌ 每日更新失败:', error);
    console.log('⏳ 将在下次调度时重试');
  }
}, cronOptions);

// 定时任务：每2小时更新一次
cron.schedule(newsSchedules.recurring, async () => {
  console.log('⏰ 执行定期更新（每2小时）...');
  console.log(`📅 当前时间: ${new Date().toLocaleString('zh-CN')}`);
  try {
    const NewsService = require('./services/NewsService');
    const result = await NewsService.updateAllNews();
    
    if (result && result.totalSaved > 0) {
      console.log(`✅ 更新完成，新增 ${result.totalSaved} 条新闻`);
    } else {
      console.log('✅ 更新完成，暂无新内容');
    }
  } catch (error) {
    console.error('❌ 定期更新失败:', error);
    console.log('⏳ 将在下次调度时重试');
  }
}, cronOptions);

// 定时任务：每日新闻刷新完成后，由 MiniMax 复核来源分布与信息盲区。
cron.schedule(newsSchedules.diversityAudit, async () => {
  console.log('🧭 执行每日信息茧房复核...');
  try {
    const { diversityAuditService } = require('./services/DiversityAuditService');
    const audit = await diversityAuditService.runDailyAudit();
    console.log(`✅ 信息茧房复核完成：${audit.status}，评分 ${audit.score ?? '暂无'}`);
  } catch (error) {
    console.error('❌ 信息茧房复核失败:', error.message);
  }
}, cronOptions);

// 定时任务：每天凌晨清理旧数据
cron.schedule(newsSchedules.cleanup, async () => {
  console.log('🧹 执行数据清理...');
  try {
    const DatabaseService = require('./services/DatabaseService');
    await DatabaseService.initialize();
    const cleaned = await DatabaseService.cleanOldNews(newsSchedules.retentionDays);
    console.log(`✅ 清理完成，删除 ${cleaned} 条过期新闻`);
  } catch (error) {
    console.error('❌ 数据清理失败:', error);
  }
}, cronOptions);

// 进程错误处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  // 记录但不退出，尝试恢复
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('收到SIGTERM信号，开始优雅关闭...');
  
  try {
    // 关闭WebSocket连接
    io.close();
    
    // 关闭数据库连接
    const DatabaseService = require('./services/DatabaseService');
    await DatabaseService.close();
    
    // 关闭HTTP服务器
    server.close(() => {
      console.log('服务器已关闭');
      process.exit(0);
    });
  } catch (error) {
    console.error('关闭时出错:', error);
    process.exit(1);
  }
});

// 启动服务器
server.listen(PORT, async () => {
  console.log(`🚀 AI资讯服务器 v2.0 运行在端口 ${PORT}`);
  console.log(`📱 健康检查: http://localhost:${PORT}/health`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`📅 定时更新: 每日8:00 + 每2小时一次`);
  console.log(`🧭 信息茧房复核: 每日8:30（${newsSchedules.timezone}）`);
  console.log(`🧹 数据清理: 每日2:00`);

  // 启动时初始化
  await initialize();
});

module.exports = { app, server, io };
