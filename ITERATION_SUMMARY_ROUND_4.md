# 迭代摘要 - 第 4 轮

**时间**: 2026-02-05 01:42:15
**工作目录**: /home/tian/clawdbot/work/Ainews

---

## 本轮做了什么

### 1. RSS源配置优化
- **移除了有问题的RSS源**：机器之心（超时问题）
- **更新了RSS源列表**：
  - ArXiv AI (https://rss.arxiv.org/rss/cs.AI)
  - AI News - The Guardian (https://www.theguardian.com/technology/artificial-intelligence/rss)
  - MIT Technology Review AI (https://www.technologyreview.com/feed/)
  - VentureBeat AI (https://venturebeat.com/feed/)
  - Towards Data Science (https://towardsdatascience.com/feed)
  - Distill (https://distill.pub/rss.xml)

### 2. RSS获取机制增强
- **实现重试机制**：每个RSS源最多重试2次，递增延迟（2秒、4秒）
- **改善错误处理**：详细记录重试过程和失败原因
- **优化请求配置**：
  - 增加真实浏览器User-Agent
  - 设置15秒超时时间
  - 支持最多5次重定向
  - 只对5xx错误抛出异常

### 3. 系统状态管理
- **添加状态端点**：`GET /api/news/status`
- **返回系统信息**：新闻数量、分类统计、最后更新时间、运行状态
- **错误恢复机制**：当获取分类失败时返回默认分类

### 4. 服务器初始化优化
- **启动时数据初始化**：服务器启动时自动获取新闻数据
- **信任代理设置**：修复express-rate-limit的信任代理配置
- **异步初始化**：确保数据库初始化完成后再接受请求

## 下一轮目标
- 解决系统状态端点的技术问题（暂时被analytics路由影响）
- 寻找更多稳定的RSS源替换503错误的源
- 添加缓存机制减少频繁的RSS请求
- 实现新闻数据的持久化存储（当前为内存存储）
- 添加单元测试覆盖核心功能

## 遇到的错误/阻塞
- RSS源普遍出现503服务不可用错误（可能是网络环境或代理问题）
- 系统状态端点出现"新闻不存在"错误（需要进一步调试路由问题）
- analytics路由中的getStatistics方法可能存在依赖问题

## 风险与回滚提示
- **本轮改动较小，无特殊风险**
- 所有改动都是渐进式的，保留了原有的模拟数据fallback机制
- 可通过注释掉新增的状态端点快速回滚
- RSS源配置可以轻松恢复到之前版本
### 额外状态

肉眼可见的问题集中在三类：前端资源 404（manifest、部分图片）、页面布局/可读性（主体区域几乎空白、信息密度过低）、以及后端数据链路不稳（RSS 失败导致长期回退到模拟数据、以及你之前提到的 /status 路由被吞之类风险点）。

/manifest.json 404（明确的资源缺失/路径错误）
Network 里 manifest.json 是 404。它通常来自 HTML 里 <link rel="manifest" ...>，浏览器会主动去拉这个文件；缺失会导致 PWA 元数据不可用，控制台也会一直报错，属于“低功能、高噪音”的问题。
修法只有两条：

不做 PWA：移除 index.html 里的 manifest 引用。

做 PWA：把 manifest 放到正确位置并保证路径正确。CRA 体系默认是 public/manifest.json。

部分新闻图片 404（数据源质量问题 + 前端缺少 fallback）
Network 里多张 photo-... 请求是 404。你现在的 UI 会出现破图/空白块，影响观感；更糟糕的是如果你的卡片布局依赖图片高度，破图还会把排版搞乱。
急需做两件事：

前端兜底：给 <img> 加 onerror fallback（换成默认图/隐藏图片区域/显示占位骨架）。浏览器加载失败会触发 error/onerror，这是标准路径。

数据层清洗：生成新闻数据时就校验 URL（空、非 https、明显不合法直接替换默认图），别把脏数据推给 UI。

布局明显“只用左侧一小条，右边巨大空白”（响应式/布局策略失败）
从页面截图看，主内容区几乎没被利用：左侧导航 + 一个很窄的内容列，右侧大片留白。这通常是：

容器被写死了 max-width/固定宽度；或

display:flex 下主内容没 flex:1；或

使用了 position: absolute/固定边距导致内容不扩展。
这不是“审美问题”，是信息密度和可用性问题：你有 8 条资讯，但页面第一眼几乎看不到内容。

重复/不必要的请求（潜在的渲染触发问题）
Network 里同一个 latest?page=1&limit=10 出现多次 fetch。开发模式下 React StrictMode 会让某些 effect 表现为“多跑一次”，但如果你线上也这样，那就是依赖数组/状态更新触发了重复拉取，浪费带宽、拖慢首屏。
处理思路：把“请求触发条件”收紧（只在 page/filters 变化时拉取），并对并发请求做取消/去重。

你迭代摘要里显示：后端真实 RSS 仍然经常失败，系统回退到“模拟数据”
你 server.log 明确有 400 The plain HTTP request was sent to HTTPS port、以及多次“没有真实数据，返回模拟数据”。这意味着：页面现在看起来“有内容”，但实际上是 demo 数据，不是你的资讯平台核心能力。
这属于“产品根能力未闭环”的红灯：UI 再美也只是样板间。
建议把“数据链路稳定性”提升到最高优先级：协议/重定向/HTTPS、超时与重试退避、失败隔离、以及给前端明确显示数据来源与更新状态（别默默用 mock）。这一点和你想做的“系统级系统”是一致的：可观测性是底座。

（你之前提过的）/api/news/status 被当成 /:id 的风险点
如果你的 Express 路由里把参数路由（如 /:id）放在更具体的 /status 前面，就会发生“先匹配先执行”，/status 被当作 id。路由参数的机制和匹配规则是 Express/MDN 的基本行为。
这类 bug 会让“健康检查/状态页”变成随机 404/业务错误，属于运维灾难源头，必须优先消掉。

UI 交互与信息表达偏弱（不是功能 bug，但会直接拉低完成度）
截图里的“分类/搜索/导航”很密，但内容呈现很少；同时缺少“空状态/加载中/错误状态”说明。结果就是：只要后端一抖、图片一坏，用户就看到大片空白，还不知道发生了什么。
建议把三种状态做成硬规范：Loading（骨架屏）、Empty（无数据提示 + 建议操作）、Error（可重试 + 错误摘要 + 日志 id）。

###新增资料

免费RSS源推荐（用于AI新闻、算法、论文更新）
这些RSS大多完全免费，可直接在RSS阅读器（如Feedly、Inoreader）中订阅。

名称描述RSS链接arXiv Artificial IntelligencearXiv上最新AI论文（cs.AI类别），适合跟踪前沿算法和研究https://arxiv.org/rss/cs.AIarXiv Machine LearningarXiv上机器学习论文（cs.LG），算法和模型相关论文最多https://arxiv.org/rss/cs.LGHugging Face BlogHugging Face官方博客，覆盖模型发布、教程、AI新闻和开源动态https://huggingface.co/blog/feed.xmlAI Weekly每周AI精选新闻和论文摘要，简洁实用http://aiweekly.co/issues.rssMIT Technology Review AIMIT科技评论AI专题，深度新闻和趋势分析https://www.technologyreview.com/topic/artificial-intelligence/rss/NVIDIA BlogNVIDIA官方博客，GPU、AI硬件、算法应用新闻https://blogs.nvidia.com/feed/WIRED AIWIRED杂志AI专题，科普性强，覆盖新闻和伦理讨论https://www.wired.com/feed/tag/ai/latest/rssDeepMind BlogGoogle DeepMind研究更新和突破https://deepmind.google/discover/blog/rss.xml
提示：更多完整列表可参考 Feedspot 的 Top 100 AI RSS（https://rss.feedspot.com/ai_rss_feeds） 或 Reddit 整理的AI RSS合集。
API推荐（免费 + 付费）
这些API可用于获取AI新闻、论文、数据集或模型。免费的通常有额度限制，付费的更稳定和功能强大。
免费/有限免费API

名称描述特点链接Hugging Face Inference API免费调用数千个开源AI模型、数据集和论文相关工具有免费额度，适合算法实验和资料获取https://huggingface.co/docs/api-inferenceSemantic Scholar API免费获取AI论文摘要、引用、作者信息（覆盖arXiv等）学术导向，完全免费，无需付费https://api.semanticscholar.org/NewsAPI.org全球新闻API，可搜索“AI”“machine learning”等关键词免费层每天100次请求，适合AI新闻监控https://newsapi.org/arXiv OAI-PMH API批量获取arXiv论文元数据和全文（包括AI类别）完全免费，适合研究资料采集https://arxiv.org/help/oa

NewsAPI 凭据通过服务端环境变量 `NEWSAPI_KEY` 配置，禁止写入文档或 Git。
---

**本轮优化重点解决了第3轮遗留的RSS源连接问题，增强了系统的健壮性和可观测性。虽然外部RSS源仍有访问问题，但系统现在具备了更好的错误处理和重试机制。**
