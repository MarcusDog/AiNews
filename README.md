# AI资讯平台 v2.0

一个实时获取并分析AI科技新闻的Web平台，帮助用户跟上AI技术发展的步伐，减少信息差。

## v2.0 更新内容

### 🎉 新特性
- **SQLite数据库持久化** - 新闻数据本地存储，重启后数据不丢失
- **WebSocket实时推送** - 新闻更新实时通知，无需手动刷新
- **智能限流机制** - 自动防止HTTP 429错误，智能请求调度
- **自动崩溃恢复** - 服务异常时自动重启，保证系统稳定性
- **更多数据源** - **50+ RSS源**，包含中英文资讯
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
- 🔄 **自动更新**: 每日8:00+每30分钟增量更新
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
- **React 18** - 用户界面框架
- **Socket.io-client** - WebSocket客户端
- **React Router** - 路由管理
- **Tailwind CSS** - 样式框架
- **Lucide React** - 图标库

## 快速开始

### 环境要求
- Node.js 16+ 
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
cd client && npm start
```

### 访问应用
| 服务 | 地址 |
|------|------|
| 前端页面 | http://localhost:3000 |
| 后端API | http://localhost:5000 |
| 健康检查 | http://localhost:5000/health |
| WebSocket | ws://localhost:5000 |

## 数据源配置

### RSS源（50+ 高质量数据源）

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
│   │   │   ├── SystemStatus.js        # 系统状态指示器
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
│   │   │   ├── SettingsPage.js        # 系统设置
│   │   │   └── HealthPage.js          # 系统监控
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

# 手动触发更新
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
| `refresh-news` | 请求刷新新闻 |

### 服务器 -> 客户端
| 事件 | 说明 |
|------|------|
| `welcome` | 连接成功 |
| `news-update` | 新闻更新通知 |
| `daily-update` | 每日更新通知 |
| `refresh-started` | 刷新开始 |
| `refresh-complete` | 刷新完成 |

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
# 删除数据库重新初始化
rm server/data/ainews.db
# 重启服务
```

## 定时任务

| 任务 | 时间 | 说明 |
|------|------|------|
| 每日更新 | 08:00 | 全量更新所有RSS源 |
| 增量更新 | 每30分钟 | 增量获取新内容 |
| 数据清理 | 02:00 | 清理7天前的旧新闻 |

## 部署建议

### 生产环境
```bash
# 使用PM2管理进程
npm install -g pm2
cd server && pm2 start index.js --name ainews-server

# 构建前端
cd client && npm run build
# 使用nginx托管build目录
```

### Docker部署
```dockerfile
# 待添加Dockerfile
```

## 版本历史

### v2.0.0 (2026-02-05)
- SQLite数据库持久化
- WebSocket实时推送
- 智能限流和自动恢复
- 18+ RSS数据源
- UI/UX优化

### v1.0.0
- 基础新闻聚合功能
- RSS源获取
- 分类筛选

## 许可证

MIT License

---

**提示**: 系统首次启动需要约30秒获取初始数据，请耐心等待。如遇问题请查看日志文件。
