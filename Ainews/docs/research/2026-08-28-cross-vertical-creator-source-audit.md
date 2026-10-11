# 跨垂类博主内容来源与开源项目审计

日期：2026-08-28（Asia/Shanghai）

## 结论

AyaNews 当前已经能聚合 AI 新闻、公开社区 Signal、Topic 与创作者机会，但还不是“博主监听系统”。现有 `signals` 只有自由文本 `author`，没有稳定博主身份、跨平台账号映射、帖子生命周期、互动量快照、垂类归属、订阅规则和持久化投递队列。Socket.IO 的 `subscribe` 只在当前连接加入临时 room，刷新后不会保留，也不会向外部 Webhook、邮件或消息平台投递。

第四阶段应新增独立的 Creator Intelligence 子系统，继续复用 Signal/Topic 的标准化、来源健康、原始证据和窗口计算，但不要把全部博主数据继续塞入通用 `signals` 表。

“无论哪个平台都稳定实时获取”在现实中无法诚实承诺。YouTube、Bluesky、Mastodon、GitHub、RSS 和经过 OAuth 的 Reddit 可以成为高可靠主链；X、Instagram、抖音只有在付费 API、应用审批或创作者授权后才能使用官方能力；小红书、任意抖音账号、微博、微信公众号等任意公开博主监听通常需要登录态浏览器或自托管 Bridge，必须作为可选 Sidecar，显示登录过期和风控状态，不能伪装成永久在线。

本项目对“爬取所有对应博主内容”的可验收定义是：**对已经导入并核验的观察名单账号，分页获取平台或已配置 Bridge 当前允许读取的全部公开历史，直到 cursor 耗尽，并持续获取后续新增/编辑内容**。它不等于抓取平台上的所有用户，也不包含私人、付费、已删除、超出官方历史窗口或被平台限流而不可访问的内容。每个账号都必须展示最早/最新已获取时间、下一游标、回填状态和限制原因，不能把 `partial` 显示为“已全量”。

## 当前项目能力与缺口

### 已有且可复用

- SQLite + WAL、本地数据保存和幂等 upsert；
- Signal 来源目录、单源失败隔离、运行记录、健康状态与 30 分钟调度；
- 原始 URL、发布时间、采集时间、作者文本与可空互动指标；
- Topic 聚类、24/48/72 小时裁剪、趋势分和创作者机会；
- JSON Feed、RSS、OpenAPI、changes 游标和页面内 Socket.IO；
- L1 公开来源、L2 官方密钥、L3 自托管 Bridge、L4 登录态 Sidecar 的来源分层。

### 关键缺口

- 没有 `creators` / `creator_accounts`，同一个人跨平台无法合并；
- 没有按平台外部帖子 ID 唯一的帖子表和编辑/删除状态；
- `metrics_json` 只保存最后值，没有 15 分钟/小时级历史快照，无法计算增速与加速度；
- 没有美妆、穿搭、AI 科技、娱乐等可扩展垂类和账号观察名单；
- 没有“同一垂类多少博主同时在发”的扩散计算；
- 没有相对博主自身基线的爆款识别，大博主与小博主不能公平比较；
- 没有持久订阅、Webhook 签名、重试、幂等键和投递审计；
- 没有可恢复的历史回填 cursor，也没有本地全文检索；
- 没有真正的博主内容页面、垂类热点页面和推送管理页面。

## 热门开源项目核验

以下热度为 2026-08-28 通过 GitHub API 读取的近似 Star 数，只用于判断社区采用度，不等于生产可靠性。

| 项目 | 热度 | 值得借鉴 | 不应直接照搬 |
|---|---:|---|---|
| [Agent-Reach](https://github.com/Panniantong/Agent-Reach) | 约 76k | 多平台能力路由、doctor 检查、登录态本地保存、清楚区分零配置与需登录平台 | 定位是 Agent 临时检索，不是长期调度、指标快照和持久推送服务 |
| [MediaCrawler](https://github.com/NanmiCoder/MediaCrawler) | 约 64k | 小红书、抖音、快手、B站、微博、知乎的创作者主页、帖子和评论采集；SQLite/JSONL 等保存 | README 明确仅供学习、禁止商业和大规模抓取；依赖 Playwright 登录态，必须隔离为人工启用 Sidecar，不能复制进默认生产主链 |
| [TrendRadar](https://github.com/sansan0/TrendRadar) | 约 62k | 多平台热榜、RSS、SQLite、排名轨迹、时间段调度、多渠道推送与通用 Webhook | 数据主干依赖 NewsNow 热榜，不等于指定博主逐条帖子；GPL-3.0 代码不能无审查并入当前项目 |
| [RSSHub](https://github.com/DIYgod/RSSHub) | 约 46k | 统一 RSS 路由、自托管实例、快速扩展来源 | 路由可能受上游页面变化和登录要求影响；应由 AyaNews 记录每条 route 的真实健康 |
| [NewsNow](https://github.com/ourongxing/newsnow) | 约 22k | 多平台热点列表、最短两分钟自适应抓取、来源插件和缓存 | 适合平台榜单补充，不提供完整的博主身份/帖子/指标历史 |
| [Douyin_TikTok_Download_API](https://github.com/Evil0ctal/Douyin_TikTok_Download_API) | 约 20k | 抖音/TikTok/B站帖子解析 API 与结构化输出 | 明确依赖 Cookie、签名算法和反爬维护；适合作为解析 Sidecar，不适合作为可信唯一来源 |
| [xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp) | 约 15k | 登录检查、用户主页和内容读取、HTTP MCP、本机 Cookie 目录 | 登录会过期且同账号网页端会互踢；只能由操作者显式启用，不能在 Web 主进程自动登录 |
| [Harken](https://github.com/VladUZH/harken) | 社区较小 | 本地 SQLite、cursor 回填、源失败隔离、durable outbox、Webhook/邮件重试和运行指标设计 | 面向关键词 mention，不含中文封闭平台；适合作为投递与可观测性参考而非数据源 |

## 平台接入矩阵

| 平台 | 推荐方式 | 博主逐条内容 | 互动指标 | 新内容时效 | 生产级别 |
|---|---|---:|---:|---:|---|
| YouTube | 频道 Atom + WebSub；Data API 补统计 | 是 | 是 | 秒至分钟 | L1/L2，高可靠 |
| Bluesky | `getAuthorFeed` + Jetstream DID 过滤 | 是 | 是 | 秒级 | L1，高可靠 |
| Mastodon | `accounts/:id/statuses` + streaming | 是 | 是 | 秒至分钟 | L1/L2，高可靠，按实例 |
| GitHub | REST/GraphQL 的 releases、repos、events | 是 | Star/Fork 等 | 分钟级 | L1/L2，高可靠 |
| RSS/Atom | 官方博客、Newsletter、播客、频道 Feed | 是 | 通常无 | 分钟级 | L1，高可靠 |
| Reddit | OAuth 的用户 submissions、subreddit 与评论 | 是 | 是 | 分钟级 | L2；匿名 RSS 只作降级 |
| X | X API v2 user posts / filtered stream | 是 | 是 | 秒至分钟 | L2；BYO 付费/配额 |
| Instagram | Meta Graph Business Discovery | 仅 Business/Creator | 公开赞评；深层 insight 受限 | 分钟级 | L2；需应用与专业账号权限 |
| TikTok | Research API 仅合资格研究者；商业/创作者 API 受审批 | 受资格限制 | 受限 | 非通用实时 | L2 特殊，不作为默认承诺 |
| 抖音 | 官方 `video.list` 仅授权账号；任意账号需 Bridge | 授权账号是 | 是 | 分钟级 | L2 自有账号 / L4 任意账号 |
| 小红书 | 无通用公开读取 API；登录态 MCP/浏览器 Bridge | 是 | 依赖页面 | 5–30 分钟 | L4，人工维护 |
| B站 | 公开视频接口/自托管 RSSHub/bili-cli Bridge | 是 | 部分 | 5–15 分钟 | L1/L3，需真实 canary |
| 微博 | 开放 API 能力受审批；任意账号通常需 Bridge | 受限 | 受限 | 5–30 分钟 | L3/L4 |
| 微信公众号 | 账号自身接口或合规 RSS/人工名单 | 受限 | 通常无 | 10–60 分钟 | L3，不能承诺全量 |

### 官方能力依据

- YouTube 官方支持通过 [WebSub 推送](https://developers.google.com/youtube/v3/guides/push_notifications)接收频道视频新增/更新通知，并可通过 [playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list)分页读取上传播放列表；
- Bluesky 提供无需登录的公开 [Author Feed API](https://docs.bsky.app/docs/api/app-bsky-feed-get-author-feed)；
- Mastodon 提供实例级 [Streaming API](https://docs.joinmastodon.org/methods/streaming/)，可与账号 statuses 增量拉取组合；
- Reddit 官方 listing API 支持 `/user/{username}/submitted` 和 `after` cursor，接口目录见 [Reddit API](https://www.reddit.com/dev/api/)；
- X 官方 API 当前按量计费，用户时间线/流能力与历史搜索受套餐约束，见 [X API overview](https://docs.x.com/x-api/overview) 与 [full archive search](https://docs.x.com/tutorials/getting-historical-posts-using-the-full-archive-search-endpoint)；
- Meta 的 [Instagram API](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)面向 Business/Creator 专业账号，不提供任意 Consumer 账号的通用读取；
- [TikTok Research API](https://developers.tiktok.com/products/research-api/)需要研究资格，不应作为普通商业监控的默认接口；
- 抖音官方 [`video.list`](https://open.douyin.com/platform/resource/docs/openapi/video-management/douyin/search-video/account-video-list)读取的是已授权用户视频，不能据此宣称可以监听任意博主。

### 历史覆盖与“全量”核验

每个 `creator_account` 单独维护 `backfill_state`、`next_cursor`、`oldest_fetched_at`、`newest_fetched_at`、`last_reconciled_at` 和 `history_limit_reason`。回填必须满足：

1. 从最新页开始分页，帖子与互动快照成功落库后才前移 cursor；
2. cursor 耗尽后执行第二遍从最新页开始的 reconciliation，补齐回填期间新增或编辑的帖子；
3. 以 `(platform, external_post_id)` 幂等，重复页和重试不会制造重复帖子；
4. 官方 API 有历史窗口、配额或权限限制时状态为 `partial`，并保存可机器读取的原因；
5. 登录过期、验证码或风控时状态为 `blocked`，需要人工恢复后从原 cursor 继续；
6. 只有 cursor 耗尽、二次核对完成且抽样原帖一致时，状态才能为 `complete`。

## 推荐架构

```text
官方 API / RSS / WebSub / Jetstream
                 │
                 ▼
       Creator Connector Runtime
                 │  统一 CreatorPost 契约
登录态 Sidecar ──┤  HMAC + timestamp + nonce
                 ▼
       SQLite Creator Intelligence Store
 creators / accounts / posts / metric snapshots / cursors
                 │
       Vertical Classifier + Hotness v1
                 │
 creator topics / relative baseline / cross-creator diffusion
                 │
          Durable Delivery Outbox
                 │
 WebSocket/SSE / Webhook / Email / 飞书 / Telegram / ntfy
```

主服务不保存浏览器 Cookie，也不自动启动登录态爬虫。Sidecar 只向主服务提交经过 schema 验证的公开内容，签名请求需要时间戳、nonce 和 body SHA256，防止重放。来源页面必须分别展示“理论支持、已配置、本次成功、覆盖账号数、最近帖子时间、登录是否过期”。

## 首发垂类

首发固定四个一级垂类，但表结构允许继续增加：

1. `beauty` 美妆：护肤、彩妆、成分、测评、教程、新品与争议；
2. `fashion` 穿搭：通勤、季节趋势、单品、品牌、秀场、平替与搭配；
3. `ai-tech` AI 科技：模型、产品、工具、Agent、开源项目、创作者工作流；
4. `entertainment` 娱乐：影视、综艺、音乐、艺人、游戏、二创与舆情。

每条帖子允许多标签；每个博主也允许多个垂类。初始名单不按昵称猜测身份，必须保存平台稳定 ID、主页 URL、首次核验时间和人工备注。建议先录入每垂类 20–30 个已核验博主、覆盖至少 4 个平台，再用热点帖子作者作为“候选博主”进入人工审核池，逐步扩容，而不是无边界抓取。

## 爆款与“大家都在发”

不能直接跨平台比较点赞绝对值。`creator-hotness-v1` 应同时使用：

- 帖子在同平台、同垂类、相同发布年龄的互动速度百分位；
- 相对该博主最近 30 天中位表现的倍数；
- 15/60/180 分钟指标增量与加速度；
- 6/24 小时内同垂类独立博主采用数量；
- 跨平台出现数量和首发/跟随时间；
- 新鲜度、内容完整度、原始内容比例与证据可信度；
- 广告、搬运、单账号刷屏、缺指标和低可信 Sidecar 惩罚。

“大家都在发”必须至少由 3 个独立博主或 2 个平台共同支持；否则只能标记为单博主爆款，不能称为行业趋势。

## 本地保存与实时查询

- MVP 继续使用 SQLite WAL + FTS5，便于本机部署、备份和查询；
- 不默认下载图片/视频，只保存允许的公开元数据、短文本、封面 URL、原帖 URL 和指标；
- 帖子以 `(platform, external_post_id)` 幂等，handle 改名不会制造新博主；
- 新帖子 72 小时内按 15–60 分钟保存指标快照，之后压缩成日快照；
- 提供 cursor API、SQLite 在线备份、JSONL 导出和可配置保留期；
- 当帖子超过约 200 万条或持续写入超出单机边界时，再迁移 PostgreSQL；不在 MVP 同时维护两套存储。

## 推送正确性

推送由持久化 outbox 驱动，不能直接在采集事务里调用第三方接口。事件类型：

- `creator.post.new`：观察名单博主发布；
- `creator.post.viral`：Hotness 首次跨过阈值；
- `creator.topic.multi_creator`：同垂类 3+ 博主共同发布；
- `creator.topic.cross_platform`：同主题出现在 2+ 平台；
- `creator.source.degraded`：关键平台连续失败或登录过期。

每条事件带稳定 event ID，订阅按垂类、平台、博主、事件类型和最低分过滤。Webhook 使用 HMAC 签名，2xx 才确认；失败指数退避、保留 delivery attempt、进入 dead letter 后在后台可见。相同订阅与 event ID 只能成功投递一次。

## 不能接受的实现

- 页面写“支持小红书/抖音/X”，但没有当前登录、配额和最后成功证据；
- 用静态随机数或缺失指标的 0 值制造热度；
- 把浏览器 Cookie 写入数据库、日志、Git 或前端；
- 抓取私人账号、付费内容、私信或绕过验证码；
- 默认批量下载、二次分发他人的图片和视频；
- 只保存最终分数，不保存原帖、指标快照和公式版本；
- 同一平台的转载矩阵被误算为多个独立博主；
- 采集成功但推送失败时丢事件。

## 验收门槛

- 官方/公开主链连续 24 小时 canary 成功率不低于 99%，每条帖子可打开原始 URL；
- 所有已配置账号的最新发布时间与平台页面抽样核对，时间/ID/标题一致；
- 24 小时内人工抽样 100 条，博主身份准确率与垂类准确率分别达到 100% / 95%；
- 指标快照不把未知值写成 0，Hotness 可复算；
- 3 个博主同题、2 个平台扩散、单博主爆款三种测试场景严格区分；
- Webhook 重试、服务重启、重复通知和 dead-letter 恢复全部通过；
- 登录态源退出后显示 `auth_expired`，不继续显示 online；
- 所有查询使用游标，10 万帖子本地库的常用查询 p95 小于 300ms。
