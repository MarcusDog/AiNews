# AyaNews — Creator Intelligence Radar & Evidence Agent

> AyaNews 正从「AI 新闻聚合站」演进为「AI 热点发现 + Creator Intelligence + 可核验证据 Agent」平台。系统把公开资讯、趋势、创作者内容和来源健康度统一为可追溯证据，并让受限 Agent 在同一数据边界内完成研究、选题和内容简报。

所有当前范围、架构决策、逐模块进度与真实验证结果记录在 [Agent Platform Completion Plan](./plan.md)；产品重建背景仍见 [PROJECT_REBUILD_STATUS.md](./PROJECT_REBUILD_STATUS.md)。

完整安装、页面、来源、观察名单、回填、选题、推送、API、维护与上线流程见 [AyaNews 整个系统使用方案](./docs/SYSTEM_USAGE_GUIDE.md)。

## 当前能力

- 前端：React 18 + Vite 8 + TypeScript 7 + Tailwind CSS + shadcn/ui 式本地组件。
- 首页：电影感首屏 + 24/48/72 小时「视野监测台」。
- 数据链路：公开 Signal → Topic 聚类 → 窗口化 `trend-v1` → 核验博主公开帖子 → `creator-hotness-v1` / 跨博主共题 → 证据型选题与推送。
- 来源：新闻/官方发布、GitHub、Hacker News、Mastodon、Reddit、Hugging Face、Bilibili；Creator 主干支持 YouTube Atom、Bluesky、Mastodon、GitHub、RSS，可选 Reddit、X、Instagram、抖音官方 API 和签名 Sidecar。
- 核心交互：首页雷达、`/topics`、`/research`、`/creators`、`/verticals/:id`、`/sources`、`/alerts` 和 `/skills`。
- Agent 后端：登录态会话、持久化运行、耐久事件流、取消与恢复、引用审计，以及 11 个只读数据工具；首方 `/agent` 工作台仍在开发中。
- 开放能力：REST、OpenAPI 3.1（2.4）、Topic JSON Feed、RSS、登录态 SSE、安全签名 Webhook 与 AyaNewsSkill。MCP、A2A 尚未实现，文档不会冒充可用。
- Node.js 要求：`>=20.19.0`。

```bash
# 开发
npm run dev

# 新前端测试
cd client && npm test

# 生产构建（输出 client/dist）
cd client && npm run build
```

## Evidence Agent（当前后端能力）

AyaNews Agent 不是一个可访问任意网络或执行任意代码的通用机器人。它是一个运行在现有新闻、Signal、Topic、Creator 与内容研究服务之上的**有边界研究运行时**：模型只能调用服务端注册、带版本、闭合 JSON Schema 和权限范围的工具；所有重要进度先写入 SQLite，再通过 SSE 对已登录用户播放。

### 已实现

- **持久化会话与运行**：会话、消息、运行、事件和证据分表保存；所有读取均按登录用户所有权隔离。
- **幂等与并发约束**：运行创建要求 `Idempotency-Key`，同一会话仅允许一个活动运行；状态迁移和事件序号在事务内完成。
- **可恢复事件流**：`Last-Event-ID` / `since` 支持断线重放；慢客户端背压、心跳、终态自动关闭和跨 Store 轮询均有测试覆盖。SSE 断开不会取消后台运行。
- **受限 Agent 循环**：每次运行最多 6 个模型轮次、10 次串行工具调用、120 秒总时限；模型可见的单个工具结果最多 24 KiB。
- **证据优先输出**：最终来源从运行自身的耐久证据账本重建，引用 ID 稳定分配；引用结构验证与事实核验明确分离，系统不会把格式正确冒充为事实正确。
- **安全模型接入**：当前提供 MiniMax Anthropic-compatible 适配器与完全离线的 Fake Provider。模型私有 thinking 不持久化、不返回给客户端。
- **只读工具集**：最新新闻、新闻搜索、热点 Topic、Topic 证据与变化、创作者机会/帖子/Topic、来源覆盖与健康度、带证据的内容 Brief。
- **失败隔离**：工具输入、输出、深度、节点数、字节数、超时和权限均在注册表边界验证；内部异常、堆栈、原始配置与凭据不会进入公开结果。

当前尚未完成的 Agent 能力包括首方 `/agent` 前端工作台、审批后写操作、MCP 和 A2A 适配器。请以 [plan.md](./plan.md) 的 Delivery ledger 为准，不要把计划项当作已交付功能。

### Agent API 快速体验

持久化 Agent API 使用现有登录 Cookie。先通过站点登录，再创建会话和运行：

```bash
# 1. 创建会话
curl -sS -X POST http://localhost:3002/api/agent/sessions \
  -H 'Content-Type: application/json' \
  -H 'Cookie: ainews_session=YOUR_SESSION_COOKIE' \
  -d '{"title":"AI Agent 趋势研究"}'

# 2. 创建运行（SESSION_ID 来自上一步）
curl -sS -X POST http://localhost:3002/api/agent/sessions/SESSION_ID/runs \
  -H 'Content-Type: application/json' \
  -H 'Cookie: ainews_session=YOUR_SESSION_COOKIE' \
  -H 'Idempotency-Key: research-2026-10-14-001' \
  -d '{"message":"总结最近 48 小时值得关注的 AI Agent 话题，并列出来源。"}'

# 3. 获取运行状态或以 SSE 订阅耐久事件
curl -sS http://localhost:3002/api/agent/runs/RUN_ID \
  -H 'Cookie: ainews_session=YOUR_SESSION_COOKIE'
curl -N http://localhost:3002/api/agent/runs/RUN_ID/events \
  -H 'Cookie: ainews_session=YOUR_SESSION_COOKIE'

# 4. 取消运行
curl -sS -X POST http://localhost:3002/api/agent/runs/RUN_ID/cancel \
  -H 'Content-Type: application/json' \
  -H 'Cookie: ainews_session=YOUR_SESSION_COOKIE' \
  -d '{}'
```

生产环境模型配置只放在 `server/.env`：

```dotenv
MINIMAX_API_KEY=replace_with_a_server_side_key
MINIMAX_BASE_URL=https://api.minimax.io/anthropic
MINIMAX_MODEL=MiniMax-M2.5
```

中国区可使用 `https://api.minimax.cn/anthropic`。允许的端点、请求预算、重试和 continuation 约束详见 [模型提供商运行说明](./docs/operations/MODEL_PROVIDER.md)。`AYA_AGENT_RECOVER_INTERRUPTED_RUNS=1` 仅适用于固定单实例，或确认没有其他 Agent worker 存活的维护启动；滚动发布和多副本部署必须保持 `0`，直到实现每个运行的租约/所有权协调。

Agent 后端专项测试可直接运行：

```bash
env PATH="/usr/local/bin:$PATH" NODE_ENV=test \
  /usr/local/bin/node --test server/tests/agent-*.test.js
```

## Signal 来源与运维

配置模板位于 `server/.env.example`。复制为 `server/.env` 后按需填写；所有 Token 都只放在服务端，空值不会让可选来源被误报为在线。

### 本地配置与仓库安全

使用 `cp server/.env.example server/.env` 创建本地配置，并以 `chmod 600 server/.env` 限制读取权限。只提交不含真实凭据的 `.env.example`；环境配置、SQLite 数据库及 WAL/SHM、日志、备份、报告、Creator JSONL 导出（含临时文件）和缓存必须留在 Git、Docker 构建上下文和发布包之外。发布包保留配置模板，运行时配置与数据由服务器独立维护。

提交和发布前在仓库根目录运行 `node scripts/check-repository-hygiene.mjs`（或 `npm --prefix server run check:hygiene`）。检查器只报告违规路径与类别，不读取秘密或运行时文件内容。生产依赖检查使用 `npm --prefix server audit --omit=dev --audit-level=high`。

Docker 规则按构建上下文根目录匹配，嵌套路径用 `**/`；检查器支持当前策略中的字面路径、`*`、作为完整路径段的 `**`、`?` 和 `!` 例外，遇到内嵌 `**`、字符类或反斜杠等不支持的模式会拒绝通过，避免误报排除成功。

如果真实凭据曾进入提交、构建上下文或已分享的发布包，应由凭据所有者轮换或撤销相关凭据、检查访问记录，并按需另行安排历史清理。停止跟踪文件不能删除旧提交中的内容，也不能使已泄露的凭据失效；不要把真实值贴入问题单或日志。当前保留 Express 4 与 node-cron 3 的兼容性；node-cron 3 的 uuid 依赖仍可能报告中等风险，升级其不兼容主版本需另行验证。

| 层级 | 默认能力 | 配置方式 |
|---|---|---|
| L1 | News、HN、GitHub、Mastodon、Reddit、Hugging Face、Bilibili | 免密可运行；`GITHUB_TOKEN` 提升 GitHub 额度；`MASTODON_INSTANCES` 与 `REDDIT_COMMUNITIES` 可用逗号调整 |
| L2 | YouTube、X | 分别配置 `YOUTUBE_API_KEY`、`X_BEARER_TOKEN` |
| L3 | 微博/知乎/抖音等桥接与自定义 JSON Signal | 自托管 `RSSHUB_BASE_URL`、`NEWSNOW_BASE_URL` 或 `SIGNAL_BRIDGES_JSON`；仅接受 HTTPS |
| L4 | MediaCrawler、Agent-Reach 深挖 | 独立登录态 Sidecar，Web 服务不会直接调度；清洗后通过 JSON Bridge 接入 |

来源状态含义：`online` 表示最近成功，`degraded` 表示本轮失败但保留过往成功时间，`offline` 表示持续失败，`unconfigured` 表示缺少可选凭据/地址，`disabled` 表示明确禁用，`pending` 表示尚未首次采集。“已配置”不等于“本轮在线”。

默认 Signal 每 30 分钟刷新，Topic 使用 72 小时窗口重建；每日 02:00 清理，Signal 保留 45 天。默认时区为 `Asia/Shanghai`。首次启动会采集；也可人工触发：

```bash
curl -X POST http://localhost:3002/api/signals/v1/admin/refresh \
  -H 'Content-Type: application/json' \
  -H 'x-admin-api-key: YOUR_ADMIN_API_KEY' \
  -d '{"refreshLegacy":false,"itemLimit":20}'

curl http://localhost:3002/api/signals/v1/health
curl 'http://localhost:3002/api/signals/v1/topics?window=72h'
curl 'http://localhost:3002/api/news/hot-rank?window=24h'
curl 'http://localhost:3002/api/news/discover?window=48h&profile=tool-review'
curl 'http://localhost:3002/api/news/dashboard?window=72h'
curl http://localhost:3002/api/news/by-source
curl http://localhost:3002/topics/feed.json
curl http://localhost:3002/topics/rss.xml
```

兼容聚合路由还包括 `/api/news/feed` 与 `/api/news/domestic`。`profile` 可取 `general`、`short-video`、`tool-review`、`news-commentary`、`deep-dive`。

公开接口的完整契约以 `/openapi.json` 为准。匿名 GitHub、Reddit、Bilibili 等端点可能限流或临时拒绝请求；单源失败不会阻断其他来源，健康接口会保留真实失败状态。

## 跨垂类 Creator Intelligence

首发覆盖美妆、穿搭、AI 科技和娱乐。系统只对人工核验观察名单账号采集平台当前允许读取的公开历史；`complete` 必须经过 cursor 耗尽和 reconciliation，受平台历史窗口限制时显示 `partial`，权限/风控时显示 `blocked`，缺少密钥或授权时显示 `unconfigured`。未知互动指标保持 `null`，不会伪造成 0。

```bash
curl 'http://localhost:3002/api/creators/v1/creators?status=verified&vertical=ai-tech'
curl 'http://localhost:3002/api/creators/v1/posts?q=Agent&vertical=ai-tech'
curl 'http://localhost:3002/api/creators/v1/hot?window=24h&type=cross_platform'
curl http://localhost:3002/api/creators/v1/sources
```

运营文档：

- [整个系统使用方案](./docs/SYSTEM_USAGE_GUIDE.md)
- [Creator 来源、观察名单与回填](./docs/CREATOR_SOURCES.md)
- [Creator Sidecar 签名接入](./docs/CREATOR_SIDECAR.md)
- [Creator 推送、重试、保留、备份与导出](./docs/CREATOR_ALERTS.md)

## 现有 v2.0 系统资料（历史迁移参考）

> 以下内容仅保留为旧版本迁移背景，不作为当前操作手册；当前行为以 [整个系统使用方案](./docs/SYSTEM_USAGE_GUIDE.md) 和 `/openapi.json` 为准。

一个实时获取并分析AI科技新闻的Web平台，帮助用户跟上AI技术发展的步伐，减少信息差。

## v2.0 更新内容

### 🎉 新特性
- **SQLite数据库持久化** - 新闻数据本地存储，重启后数据不丢失
- **WebSocket实时推送** - 新闻更新实时通知，无需手动刷新
- **智能限流机制** - 自动防止HTTP 429错误，智能请求调度
- **自动崩溃恢复** - 服务异常时自动重启，保证系统稳定性
- **更多数据源** - **160 个已启用 RSS/Atom 源**，其中 120 个为本轮新增；提交流水已退出公开新闻流，覆盖国内外一手发布、研究、媒体与工程社区
- **优化的前端体验** - 防抖、缓存、平滑加载
- **增强UI组件库** - 统计卡片、进度条、标签、时间线等
- **新闻详情优化** - 相关推荐、分享功能、收藏功能

### ⚡ 性能优化
- 新闻列表无限滚动加载
- 多级缓存策略（内存 + 文件 + LocalStorage）
- 请求防抖和取消
- 图片懒加载
- WebSocket连接优化

### 🔧 功能增强
- 数据分析仪表板 - 统计、图表、趋势分析
- 信息茧房检测 - 多样性评分和改进建议
- 每日模型复核 - MiniMax 每天检查地区、发布者与证据类型缺口，结论保留原文引用
- 热门话题提取 - TF-IDF关键词分析
- 内容质量分析 - 图片、描述完整性检测
- 面包屑导航 - 更好的导航体验

### 🐛 Bug修复
- 修复新闻重复刷新问题
- 优化请求并发控制
- 改进UI/UX设计
- 增强错误处理机制

## 功能特性

### 核心功能
- 📰 **实时资讯聚合**: 自动获取AI相关的新闻、算法、框架、工具和思路
- 🔍 **智能搜索**: 支持关键词搜索和分类筛选
- 📊 **数据分析**: 信息茧房检测、多样性评分、趋势分析
- ⚡ **个性化推荐**: 基于内容多样性的智能推荐
- 🔄 **自动更新**: 每日8:00全量更新 + 每2小时增量更新
- 🔌 **实时推送**: WebSocket实时新闻通知
- 💾 **数据持久化**: SQLite本地数据库存储
- 📱 **响应式设计**: 适配桌面端和移动端

### 内容分类
| 分类 | 描述 |
|------|------|
| AI新闻 | 行业动态、公司新闻、政策法规 |
| AI框架 | PyTorch、TensorFlow、Hugging Face等 |
| 新算法 | 论文解读、算法创新、技术突破 |
| 新思路 | 思考分享、行业洞察、经验总结 |
| 新工具 | 产品介绍、工具推荐、使用教程 |

## 技术栈

### 后端
- **Node.js + Express** - 服务器框架
- **SQLite3** - 轻量级数据库
- **Socket.io** - WebSocket实时通信
- **RSS Parser** - RSS源数据获取
- **Node-cron** - 定时任务
- **Express-rate-limit** - API限流

### 前端
- **React 18 + TypeScript** - 类型安全的用户界面
- **Vite 8** - 开发服务与生产构建
- **Tailwind CSS + shadcn/ui** - 设计 Token 与可访问组件
- **Radix UI** - Dialog 焦点管理与键盘交互
- **Lucide React** - 图标库
- **Vitest + Testing Library** - 前端行为测试

## 快速开始

### 环境要求
- Node.js 20.19+
- npm 7+

### 一键启动

```bash
# 克隆项目后
cd Ainews
chmod +x start.sh
./start.sh
```

### 手动安装

```bash
# 安装服务器依赖
cd server && npm install

# 安装客户端依赖  
cd ../client && npm install
```

### 分步启动

```bash
# 终端1 - 启动后端
cd server && node index.js

# 终端2 - 启动前端
cd client && npm run dev
```

### 访问应用
| 服务 | 地址 |
|------|------|
| 前端页面 | http://localhost:3000 |
| 后端API | http://localhost:3002 |
| 健康检查 | http://localhost:3002/health |
| WebSocket | ws://localhost:3002 |

## 数据源配置

### RSS源（160 个已启用高质量数据源）

#### 学术源 (高优先级)
| 名称 | 分类 | 说明 |
|------|------|------|
| arXiv AI | 新算法 | 人工智能论文 |
| arXiv ML | 新算法 | 机器学习论文 |
| arXiv CV | 新算法 | 计算机视觉论文 |
| arXiv NLP | 新算法 | 自然语言处理论文 |
| arXiv Robotics | 新算法 | 机器人论文 |

#### 大厂博客 (中优先级)
| 名称 | 分类 | 说明 |
|------|------|------|
| OpenAI Blog | AI新闻 | OpenAI官方博客 |
| Google AI Blog | AI新闻 | Google AI动态 |
| DeepMind Blog | 新思路 | DeepMind研究 |
| Meta AI Blog | AI新闻 | Meta AI更新 |
| Microsoft AI Blog | AI新闻 | 微软AI博客 |
| NVIDIA Blog | AI新闻 | NVIDIA技术 |
| Anthropic Research | 新思路 | Claude研究 |
| Cohere Blog | AI新闻 | 大语言模型 |
| Mistral AI | AI新闻 | 开源LLM |
| Stability AI | AI新闻 | 图像生成 |
| Apple ML | 新算法 | 苹果机器学习 |

#### 框架与工具 (中优先级)
| 名称 | 分类 | 说明 |
|------|------|------|
| Hugging Face | AI框架 | Transformers生态 |
| PyTorch Blog | AI框架 | PyTorch更新 |
| TensorFlow Blog | AI框架 | TensorFlow动态 |
| LangChain Blog | AI框架 | LLM应用框架 |
| LlamaIndex | AI框架 | RAG框架 |
| vLLM | AI框架 | 推理加速 |
| EleutherAI | AI框架 | 开源LLM |
| Weights & Biases | AI框架 | ML实验跟踪 |
| Pinecone | 新工具 | 向量数据库 |
| Chroma | 新工具 | 向量数据库 |
| Ollama | 新工具 | 本地LLM运行 |

#### 科技媒体 (中优先级)
| 名称 | 分类 | 说明 |
|------|------|------|
| MIT Tech Review | AI新闻 | 权威科技媒体 |
| WIRED AI | AI新闻 | 科技前沿 |
| TechCrunch AI | AI新闻 | 创业科技 |
| The Verge AI | AI新闻 | 科技新闻 |
| Ars Technica | AI新闻 | 深度科技 |
| VentureBeat AI | AI新闻 | 科技商业 |

#### 中文源 (中优先级)
| 名称 | 分类 | 说明 |
|------|------|------|
| 机器之心 | AI新闻 | 国内领先AI媒体 |
| 量子位 | AI新闻 | AI科技资讯 |
| PaperWeekly | 新算法 | 论文解读 |

#### 学习资源 (低优先级)
| 名称 | 分类 | 说明 |
|------|------|------|
| Towards Data Science | 新算法 | Medium数据科学 |
| Machine Learning Mastery | 新思路 | ML教程 |
| The Batch | 新思路 | Deeplearning.ai |
| KDnuggets | 新工具 | 数据挖掘 |
| Distill.pub | 新算法 | 可视化论文 |
| Analytics Vidhya | 新算法 | 数据分析 |

#### 研究机构 (中优先级)
| 名称 | 分类 | 说明 |
|------|------|------|
| Stanford AI Lab | 新思路 | 斯坦福AI实验室 |
| Berkeley AI Research | 新思路 | 伯克利AI研究 |
| CMU ML | 新算法 | CMU机器学习 |
| MIT CSAIL | 新算法 | MIT计算机系 |

#### 通讯周刊 (低优先级)
| 名称 | 分类 | 说明 |
|------|------|------|
| AI Weekly | AI新闻 | AI周刊 |
| Last Week in AI | AI新闻 | AI周报 |
| Import AI | 新思路 | Jack Clark |
| Ben's Bites | AI新闻 | AI通讯 |
| AI Tool Report | 新工具 | AI工具周报 |

#### AI工具 (中优先级)
| 名称 | 分类 | 说明 |
|------|------|------|
| Replicate | 新工具 | 模型托管 |
| Product Hunt AI | 新工具 | 产品发现 |
| FutureTools | 新工具 | AI工具目录 |

*完整列表见 `server/services/NewsService.js`*

### API源（可选）

```bash
# 在 server/.env 中配置
NEWSAPI_KEY=your_api_key_here
```

## 项目结构

```
Ainews/
├── 📁 client/                 # React前端
│   ├── 📁 src/
│   │   ├── 📁 components/     # 组件
│   │   │   ├── Header.js              # 顶部导航栏
│   │   │   ├── Sidebar.js             # 侧边栏导航
│   │   │   ├── NewsList.js            # 新闻列表（无限滚动）
│   │   │   ├── NewsDetail.js          # 新闻详情（含推荐）
│   │   │   └── 📁 ui/                 # UI组件库
│   │   │       └── index.js           # StatCard, ProgressBar, Tag等
│   │   ├── 📁 contexts/
│   │   │   ├── SocketContext.js       # WebSocket连接管理
│   │   │   └── UserDataContext.js     # 用户数据（收藏、阅读）
│   │   ├── 📁 pages/          # 页面组件
│   │   │   ├── Analytics.js           # 数据分析仪表板
│   │   │   ├── GlossaryPage.js        # AI术语词典
│   │   │   ├── SearchPage.js          # 搜索页面
│   │   │   ├── FavoritesPage.js       # 我的收藏
│   │   │   ├── SkillPage.js           # 多源研究与内容 Agent
│   │   │   └── AdminPage.js           # 独立管理后台（API Key 鉴权）
│   │   ├── App.js             # 应用入口
│   │   └── index.css          # 全局样式（含动画）
│   └── package.json
│
├── 📁 server/                 # Node.js后端
│   ├── 📁 services/
│   │   ├── NewsService.js             # 新闻服务（RSS抓取）
│   │   └── DatabaseService.js         # 数据库服务
│   ├── 📁 routes/
│   │   ├── news.js                    # 新闻API路由
│   │   ├── analytics.js               # 分析API路由
│   │   └── glossary.js                # 术语API路由
│   ├── 📁 data/               # SQLite数据库
│   ├── 📁 cache/              # RSS缓存文件
│   ├── index.js               # 服务入口
│   └── package.json
│
├── 📁 logs/                   # 日志文件
├── start.sh                   # 启动脚本
└── README.md                  # 项目文档
```

## API文档

### 新闻API

```bash
# 获取最新新闻
GET /api/news/latest?page=1&limit=20&category=AI新闻

# 搜索新闻
GET /api/news/search?q=GPT&page=1&limit=20

# 获取新闻详情
GET /api/news/:id

# 获取系统状态
GET /api/news/status

# 手动触发更新（需要 x-admin-api-key）
POST /api/news/update
```

### 分析API

```bash
# 多样性分析（信息茧房检测）
GET /api/analytics/diversity

# 趋势分析
GET /api/analytics/trends

# 多样化推荐
GET /api/analytics/recommendations
```

### 管理API

```bash
# 所有 /api/admin/* 请求必须携带：
x-admin-api-key: <ADMIN_API_KEY>

# 进入不显示在前台导航中的管理页
/#/admin

# 查看概览、来源、日志与联系表单
GET /api/admin/overview
GET /api/admin/sources
GET /api/admin/logs
GET /api/admin/contacts

# 手动恢复
POST /api/admin/recovery

# 手动刷新
POST /api/admin/refresh
```

## WebSocket事件

### 客户端 -> 服务器
| 事件 | 说明 |
|------|------|
| `subscribe` | 订阅分类 `{category: 'AI新闻'}` |
| `unsubscribe` | 取消订阅 |

### 服务器 -> 客户端
| 事件 | 说明 |
|------|------|
| `welcome` | 连接成功 |
| `news-update` | 新闻更新通知 |
| `daily-update` | 每日更新通知 |

## 优化建议

### 1. 性能优化
- [x] 前端请求防抖，避免重复请求
- [x] LocalStorage缓存，减少API调用
- [x] SQLite持久化，快速数据访问
- [x] 并发控制，最多2个同时请求
- [ ] 考虑添加Redis缓存层
- [ ] 图片CDN加速

### 2. 稳定性优化
- [x] HTTP 429限流保护
- [x] 自动崩溃恢复机制
- [x] 请求失败重试（最多2次）
- [x] 数据库连接池
- [ ] 添加日志轮转
- [ ] 监控告警系统

### 3. 功能优化
- [x] WebSocket实时推送
- [x] 信息茧房检测
- [x] 多样性推荐
- [x] 收藏和阅读历史
- [x] 相关推荐功能
- [x] UI组件库
- [ ] 用户登录系统
- [ ] 邮件订阅推送
- [ ] 移动端APP

### 4. 数据源优化
- [x] 18+ RSS源配置
- [x] 中英文双语支持
- [ ] 添加更多中文源
- [ ] 社交媒体数据抓取
- [ ] 自定义RSS源添加

## 故障排除

### HTTP 429 Too Many Requests
系统已内置限流机制，自动处理：
- 每个源最多30请求/分钟
- 请求间隔至少2秒
- 失败自动延迟重试

### 新闻不更新
1. 检查网络连接
2. 查看 `server/server.log` 日志
3. 手动触发恢复：`POST /api/admin/recovery`

### 前端显示演示数据
1. 等待后端完成RSS获取（约30秒）
2. 检查后端健康状态：`/health`
3. 点击刷新按钮

### 数据库问题
```bash
# 先执行在线备份与完整性检查，不要删除生产数据库
cd server
node scripts/creator-maintenance.js backup
sqlite3 "${AINEWS_DB_PATH:-./data/ainews.db}" 'PRAGMA integrity_check;'
```

如仍异常，保留数据库和日志，在独立临时库复现后再决定恢复或迁移。

## 定时任务

| 任务 | 时间 | 说明 |
|------|------|------|
| 每日更新 | 08:00 | 全量更新所有RSS源 |
| 增量更新 | 每2小时 | 增量获取新内容 |
| 信息茧房复核 | 08:30 | MiniMax 对当天来源分布进行带引用复核 |
| 数据清理 | 02:00 | 清理45天前的旧新闻 |

## 部署建议

### 生产环境
```bash
# 使用PM2管理进程
npm install -g pm2
cd server && pm2 start index.js --name ainews-server

# 构建前端
cd client && npm run build
# 使用 Nginx 托管 dist 目录
```

### Docker部署
```dockerfile
# 待添加Dockerfile
```

## 版本历史

### v2.0.0 (2026-08-08)
- SQLite数据库持久化
- WebSocket实时推送
- 智能限流和自动恢复
- 160 个启用 RSS/Atom 数据源
- MiniMax Agent、逐句引用审查与每日信息茧房复核
- UI/UX优化

### v1.0.0
- 基础新闻聚合功能
- RSS源获取
- 分类筛选

## 许可证

MIT License

---

**提示**: 首次启动会抓取较多来源，所需时间取决于网络状况；之后每两小时增量刷新。如遇问题请查看日志文件。
