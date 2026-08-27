# 快速启动指南

> 需要 Node.js 20.19 或更高版本。当前重构状态见 [PROJECT_REBUILD_STATUS.md](./PROJECT_REBUILD_STATUS.md)。

## 一键启动

```bash
# 赋予执行权限（首次运行）
chmod +x start.sh

# 运行启动脚本
./start.sh
```

## 手动启动

### 1. 安装依赖

```bash
# 根目录
npm install

# 服务器
cd server && npm install

# 客户端  
cd ../client && npm install
```

### 2. 配置环境（可选）

```bash
# 复制环境变量模板
cp server/.env.example server/.env

# 编辑配置文件
vim server/.env
```

### 3. 启动服务

#### 开发模式（推荐）
```bash
# 同时启动前端和后端
npm run dev
```

#### 分别启动
```bash
# 后端服务（端口3002）
npm run server:dev

# 前端服务（端口3000，单独终端）
npm run client:dev
```

## 访问应用

- 🎯 **前端界面**: http://localhost:3000
- 🔌 **后端API**: http://localhost:3002  
- 💚 **健康检查**: http://localhost:3002/health

## 测试功能

1. **电影感首屏**：确认远程背景视频正常播放；资源失败时保留深蓝背景。
2. **随机选题**：点击「生成今日选题」，优先显示真实 Creator Opportunity、评分、风险与原始证据链接。
3. **诚实降级**：后端不可用时，页面明确显示「创作练习」，不冒充实时热点。
4. **自动化测试**：`cd client && npm test`。
5. **生产构建**：`cd client && npm run build`，产物位于 `client/dist`。
6. **来源健康**：打开 `http://localhost:3002/api/signals/v1/health` 和 `/api/signals/v1/sources`，区分在线、降级、未配置与禁用。

## 多源热点首次配置

`server/.env.example` 已列出全部可选项。无需密钥即可运行 L1 主干；可按需设置：

```bash
GITHUB_TOKEN=
MASTODON_INSTANCES=https://mastodon.social,https://fosstodon.org
REDDIT_COMMUNITIES=LocalLLaMA,MachineLearning,artificial
YOUTUBE_API_KEY=
X_BEARER_TOKEN=
RSSHUB_BASE_URL=
NEWSNOW_BASE_URL=
SIGNAL_BRIDGES_JSON=[]
```

启动后可用管理员密钥执行一次有界刷新：

```bash
curl -X POST http://localhost:3002/api/signals/v1/admin/refresh \
  -H 'Content-Type: application/json' \
  -H 'x-admin-api-key: YOUR_ADMIN_API_KEY' \
  -d '{"itemLimit":10}'
```

随后访问首页“视野监测台”、`/topics` 选题工作台、`/research` 研究工作台或 `/skills` Skill 页面；机器可读入口为 `/topics/feed.json`、`/topics/rss.xml`、`/openapi.json`。

热点与创作者接口可直接检查：

```bash
curl 'http://localhost:3002/api/news/hot-rank?window=24h'
curl 'http://localhost:3002/api/news/discover?window=48h&profile=short-video'
curl 'http://localhost:3002/api/content/v1/brief?topic=Qwen&topicId=TOPIC_ID&format=article'
```

## 数据源说明

### 免费RSS源（默认启用）
- ✅ 机器之心
- ✅ AI科技大本营  
- ✅ ArXiv AI论文
- ✅ 其他AI技术博客

### 付费API（可选配置）
- 🔑 NewsAPI - 更多主流媒体新闻
- 🔑 OpenAI API - 智能内容分析

> **提示**: 默认配置无需任何API密钥即可使用基础功能

## 常见问题

### 端口占用
```bash
# 查看端口占用
lsof -ti:3000  # 前端端口
lsof -ti:5000  # 后端端口

# 杀死占用进程
kill $(lsof -ti:3000)
kill $(lsof -ti:5000)
```

### 依赖安装失败
```bash
# 清理npm缓存
npm cache clean --force

# 删除node_modules重新安装
rm -rf node_modules server/node_modules client/node_modules
npm install
```

### RSS源获取失败
- 检查网络连接
- 查看服务器日志: `tail -f logs/ainews.log`
- 验证RSS地址有效性

### API配置问题
- 确认API密钥正确性
- 检查API使用限制
- 验证账户余额

## 项目结构

```
ainews/
├── client/              # React前端
│   ├── src/
│   │   ├── components/  # UI组件
│   │   └── pages/       # 页面组件
│   └── package.json
├── server/              # Node.js后端
│   ├── routes/          # API路由
│   ├── services/        # 业务逻辑
│   └── index.js
├── start.sh             # 启动脚本
├── package.json         # 根配置
└── README.md            # 详细文档
```

## 下一步

1. ✅ 成功启动应用
2. 🔧 配置API密钥（可选）
3. 📊 查看数据分析
4. ⚙️ 调整个人偏好设置
5. 🚀 部署到生产环境

---

💡 **提示**: 如有问题请查看 `README.md` 获取详细文档。
