# Ainews 部署完成报告

**部署时间**: 2026-04-09  
**服务器**: 124.223.85.195 (腾讯云轻量应用服务器)  
**域名**: https://ainews.xiaotianaya.com

---

## ✅ 已完成功能

### 1. 网站部署
- [x] Nginx 反向代理配置
- [x] HTTPS 证书 (Let's Encrypt, 有效期至 2026-07-08)
- [x] 前端构建并部署
- [x] 后端 API 服务运行

### 2. 数据源配置
- [x] **92 个活跃 RSS 源** 已配置
  - arXiv (AI/ML/NLP/CV/Robotics 等)
  - 大厂 AI 博客 (OpenAI, Google, DeepMind, Meta, Microsoft, NVIDIA, Amazon)
  - 科技媒体 (MIT Tech Review, WIRED, TechCrunch, The Verge 等)
  - 中文源 (量子位等)
- [x] 自动抓取调度 (每日 8:00 + 每 3 小时)
- [x] 数据去重与缓存

### 3. 数据库配置
- [x] SQLite 数据库初始化
- [x] 用户认证表 (users, auth_sessions)
- [x] 新闻数据表 (news)
- [x] RSS 源状态表 (rss_sources)
- [x] 用户偏好表 (user_preferences)
- [x] 系统配置表 (system_config)

### 4. 用户系统
- [x] **注册功能** - `/api/auth/register`
- [x] **登录功能** - `/api/auth/login`
- [x] **登出功能** - `/api/auth/logout`
- [x] **用户信息查询** - `/api/auth/me`
- [x] **会话管理** - Cookie-based Session (30 天有效期)
- [x] **密码加密** - scrypt 哈希

### 5. 进程管理
- [x] PM2 守护进程
- [x] 开机自启配置
- [x] 日志记录

---

## 📊 当前状态

```
新闻总数：9,500+ 条 (持续增长中)
RSS 源：92 个活跃源
分类：5 个类别
更新频率：每 3 小时自动更新
```

---

## 🔧 服务管理命令

### 查看状态
```bash
pm2 status
```

### 查看日志
```bash
# 所有日志
pm2 logs

# 仅后端
pm2 logs ainews-server

# 仅前端
pm2 logs ainews-client
```

### 重启服务
```bash
# 重启所有
pm2 restart all

# 仅重启后端
pm2 restart ainews-server

# 仅重启前端
pm2 restart ainews-client
```

### 健康检查
```bash
curl http://localhost:3002/health
```

### 手动刷新新闻
```bash
curl -X POST http://localhost:3002/api/admin/refresh
```

---

## 🌐 访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| **Ainews 前端** | https://ainews.xiaotianaya.com | 主站点 |
| **后端 API** | http://localhost:3002 | 内部访问 |
| **健康检查** | http://localhost:3002/health | API 状态 |
| **WebSocket** | ws://localhost:3002 | 实时推送 |

---

## 🔐 API 端点

### 认证相关
```
POST   /api/auth/register   - 用户注册
POST   /api/auth/login      - 用户登录
POST   /api/auth/logout     - 用户登出
GET    /api/auth/me         - 获取当前用户信息
PATCH  /api/auth/profile    - 更新个人资料
POST   /api/auth/password   - 修改密码
```

### 新闻相关
```
GET    /api/news/latest     - 最新新闻
GET    /api/news/category   - 按分类筛选
GET    /api/news/search     - 搜索新闻
GET    /api/news/:id        - 新闻详情
POST   /api/news/update     - 手动更新
GET    /api/news/status     - 更新状态
```

### 分析相关
```
GET    /api/analytics/stats     - 统计数据
GET    /api/analytics/trending  - 热门话题
GET    /api/analytics/quality   - 内容质量
GET    /api/analytics/diversity - 多样性分析
GET    /api/analytics/trends    - 趋势分析
```

### 管理相关
```
GET    /api/admin/sources       - 数据源列表
POST   /api/admin/sources/reset - 重置失败源
POST   /api/admin/refresh       - 手动刷新
POST   /api/admin/recovery      - 恢复模式
GET    /api/admin/logs          - 请求日志
```

---

## 📁 文件结构

```
/root/website/Ainews/
├── client/              # React 前端
│   ├── build/           # 构建输出 (生产环境)
│   ├── src/
│   │   ├── components/  # UI 组件
│   │   ├── pages/       # 页面组件
│   │   ├── contexts/    # React Context
│   │   └── config/      # 配置文件
│   └── package.json
├── server/              # Node.js 后端
│   ├── routes/          # API 路由
│   ├── services/        # 业务逻辑
│   │   ├── AuthService.js      # 认证服务
│   │   ├── DatabaseService.js  # 数据库服务
│   │   └── NewsService.js      # 新闻服务
│   ├── data/            # SQLite 数据库
│   ├── logs/            # 日志文件
│   └── package.json
├── nginx/               # Nginx 配置
├── ecosystem.config.js  # PM2 配置
└── docker-compose.yml   # Docker 配置
```

---

## 🗄️ 数据库位置

```
/root/website/Ainews/server/data/ainews.db
```

### 主要数据表
- `news` - 新闻文章
- `users` - 用户账户
- `auth_sessions` - 登录会话
- `rss_sources` - RSS 源配置
- `user_preferences` - 用户偏好
- `system_config` - 系统配置
- `request_logs` - 请求日志

---

## 🔄 定时任务

| 时间 | 任务 | 说明 |
|------|------|------|
| 每日 8:00 | 新闻更新 | 全量抓取所有 RSS 源 |
| 每 3 小时 | 新闻更新 | 增量更新 |
| 每日 2:00 | 数据清理 | 删除 7 天前旧新闻 |

---

## 🛠️ 故障排查

### 后端无法启动
```bash
# 查看错误日志
pm2 logs ainews-server --lines 100

# 检查端口占用
lsof -ti:3002

# 重启服务
pm2 restart ainews-server
```

### 数据库问题
```bash
# 检查数据库文件
ls -la /root/website/Ainews/server/data/

# 进入容器检查
cd /root/website/Ainews/server
node -e "const db = require('./services/DatabaseService'); db.initialize().then(() => console.log('OK'))"
```

### RSS 源失败
```bash
# 重置失败的源
curl -X POST http://localhost:3002/api/admin/sources/reset

# 查看源状态
curl http://localhost:3002/api/admin/sources
```

---

## 📝 测试账户

测试账户不写入仓库。需要时在目标环境临时创建，并在验收后删除或禁用；凭据通过部署方的安全渠道传递。

---

## 🚀 下一步建议

1. **添加更多中文 RSS 源** - 机器之心、量子位等
2. **配置 OAuth 登录** - Google/微信登录
3. **用户个性化** - 偏好设置、收藏功能
4. **邮件通知** - 重要新闻推送
5. **性能优化** - Redis 缓存、CDN 加速

---

**部署完成！🦞**
