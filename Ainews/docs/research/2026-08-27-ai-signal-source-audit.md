# AyaNews 多源热点来源与开源生态审计

日期：2026-08-27

## 结论

AyaNews 第二阶段不应继续把“新闻条目”当作最终对象，而应建立：

`Source → Signal → Topic → Trend → Creator Opportunity`

默认上线版本采用“公开、免登录、可稳定探测”的来源作为主干；需要 API Key 的平台作为可选原生适配器；需要 Cookie、浏览器或自托管采集器的平台只作为深挖桥接。系统必须把 `configured`、`enabled`、`last_success_at`、`last_error` 分开记录，不能把理论支持显示成在线。

## 本机真实探测结果

以下探测在 2026-08-27 从项目主机发起，未携带用户凭据：

| 来源 | 端点 / 方式 | 结果 | 上线角色 |
|---|---|---:|---|
| Hacker News | Algolia `search_by_date` | HTTP 200，JSON | 默认主干；开发者讨论、points、comments |
| GitHub | REST Repository Search | HTTP 200，JSON | 默认主干；新项目、stars、forks、issues；Token 可提升额度 |
| Mastodon | `/api/v1/trends/statuses`、`/links` | HTTP 200，JSON | 默认主干；公开联邦社交趋势 |
| Reddit | `r/LocalLLaMA/.rss` | HTTP 200，Atom | 默认尽力源；重点社区公开讨论，失败时明确降级 |
| Hugging Face | `/api/trending` | HTTP 200，JSON | 默认主干；模型、数据集、Space 热点 |
| Bilibili | `/x/web-interface/popular` | HTTP 200，JSON | 默认主干；国内视频平台公开热门，再进行 AI 相关性过滤 |
| Bluesky Search | Public AppView `searchPosts` | HTTP 403 | 暂不作为默认源；保留可选适配器位 |
| RSSHub 公共实例 | 微博/知乎/抖音/B站路由 | HTTP 403 | 不依赖公共实例；仅支持用户自托管 `RSSHUB_BASE_URL` |
| NewsNow 公共实例 | 热榜 API | HTTP 403 | 不依赖公共实例；可配置自托管桥接 |

探测状态只代表本次主机网络条件，不等同于永久可用；运行时健康表必须保存最近成功与失败。

## 来源分层

### L1：默认免认证主干

- 现有官方博客、媒体与 GitHub Release RSS/Atom。
- Hacker News Algolia Search API。
- GitHub Repository Search API；未配置 `GITHUB_TOKEN` 时按匿名额度运行。
- Mastodon 公共趋势 API；实例列表可配置。
- Reddit 重点社区 RSS：`LocalLLaMA`、`MachineLearning`、`artificial` 等。
- Hugging Face Trending API。
- Bilibili 公开热门接口。

### L2：可选官方 API

- YouTube Data API：需要 `YOUTUBE_API_KEY`；用于关键词/频道视频搜索，后续再取视频统计。
- X Recent Search：需要 `X_BEARER_TOKEN`；保留公开指标与原始 URL。
- GitHub Token：不是启用条件，只用于提高额度与稳定性。

### L3：自托管桥接

- `RSSHUB_BASE_URL`：微博热搜、知乎热榜、抖音热榜等；逐条路由报告健康状态。
- `NEWSNOW_BASE_URL`：可接自托管 NewsNow，不使用其公共实例作为生产依赖。
- 通用 JSON Bridge：通过 `SIGNAL_BRIDGES_JSON` 接入用户自己的采集服务，输入统一数组契约。

### L4：登录态深挖连接器

- MediaCrawler：小红书、抖音、微博、B站、知乎、贴吧的帖子/评论/创作者深挖。
- Agent-Reach/OpenCLI：按平台选择首选与回退工具，适合人工工作站或受控 Sidecar。
- 此层默认关闭，不保存 Cookie，不在 Web 服务器内启动浏览器；只在某个 Topic 达到阈值后调用。

## 开源项目取舍

| 项目 | 借鉴 | 不直接采用的原因 |
|---|---|---|
| [TrendRadar](https://github.com/sansan0/TrendRadar) | 热榜轨迹、本次新增、来源配置、MCP 查询、健康检查 | 默认依赖 NewsNow 公共 API；AyaNews 需要自己的 Signal/Topic 数据模型与创作者评分 |
| [NewsNow](https://github.com/ourongxing/newsnow) | 国内热榜 source adapter 的目录结构 | 公共实例本次探测为 403；只允许自托管桥接 |
| [Agent-Reach](https://github.com/Panniantong/Agent-Reach) | 每个平台首选/备选列表、真实 probe、doctor 输出 | 它是本地 Agent 能力层，许多社交源依赖登录态，不应嵌入公开服务器主链路 |
| [Horizon](https://github.com/Thysrael/Horizon) | 多源采集、LLM 评分、日报流水线 | 更偏日报过滤；AyaNews 仍需 Topic 聚类、跨平台证据与机会评分 |
| [MediaCrawler](https://github.com/NanmiCoder/MediaCrawler) | 国内平台帖子/评论深挖 | 基于浏览器登录态，且项目声明限定研究学习；只能作为用户自托管、默认关闭的 Enrichment Sidecar |
| [AIMedia](https://github.com/Anning01/AIMedia) | 热点→内容→发布的产品闭环 | 架构重量大、自动发布超出本阶段范围，不复用其服务器或登录系统 |
| [RSSHub](https://github.com/DIYgod/RSSHub) | 将大量平台统一为 RSS 的桥接方式 | 公共实例受限；复杂路由依赖 Cookie/Puppeteer，必须自托管并按路由显示能力状态 |

## 规范与额度依据

- [GitHub REST API 限流](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)：匿名公共请求通常为每小时 60 次，认证用户通常为每小时 5,000 次；搜索端点有单独限制。
- [Hacker News Algolia API](https://hn.algolia.com/api)：支持按时间、story/comment、points/comments 数值过滤；单 IP 文档额度为每小时 10,000 次。
- [Mastodon Trends API](https://docs.joinmastodon.org/methods/trends/)：tags/statuses/links 趋势端点为公开读取。
- [YouTube Search API](https://developers.google.com/youtube/v3/docs/search/list)：需要项目/API Key，并有独立搜索配额。
- [X Recent Search](https://docs.x.com/x-api/posts/search-recent-posts)：需要 Bearer Token，返回帖子及可选 public metrics。
- [MediaCrawler README](https://github.com/NanmiCoder/MediaCrawler)：明确采用 Playwright/CDP 复用登录态，并覆盖小红书、抖音、B站、微博、贴吧、知乎等。

## 数据与评分决策

每条 Signal 至少保存：

- `source_id`、`platform`、`region`、`kind`；
- 标题/正文摘要、原始 URL、作者、发布时间；
- `views`、`likes`、`comments`、`shares`、`stars`、`forks`、`rank` 等可得指标；
- `first_seen_at`、`last_seen_at`、抓取时间和原始 JSON；
- 规范化 URL 与稳定指纹。

Topic 聚类首版采用可解释的确定性策略：规范化标题、品牌/项目实体、URL 主体、关键词集合相似度和时间窗。无法确认属于同一事件时宁可分开，不使用 LLM 强行合并。

趋势评分由以下可解释分项组成：

- 新鲜度；
- 互动量的对数归一化；
- 24/48/72 小时新增信号动量；
- 跨平台数量与来源类型多样性；
- GitHub 项目增长/活跃信号；
- 证据强度与来源可信等级。

Creator Opportunity 在趋势分之外加入：大众可理解性、可演示性、实用价值、争议/反共识空间和中文内容空缺。所有分数都返回 `score_breakdown`，没有真实互动指标时不得伪造。

## 首个可上线边界

第一版上线后应真实做到：

1. 定时采集 L1 来源，并保存每个来源的健康状态；
2. 把不同来源归一化为 Signal；
3. 生成 24/48/72h Topic 热点与可解释评分；
4. 提供创作者选题、随机选题、来源监测、增量变化 API；
5. 前端“视野监测台”只展示数据库里的真实 Topic/Signal；
6. L2/L3/L4 未配置时明确显示“待配置/需自托管”，不显示为在线。
