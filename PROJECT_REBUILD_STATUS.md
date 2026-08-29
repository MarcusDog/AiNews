# Aya Creator Intelligence Radar 重构状态

> 本文档是本轮重构的持久状态源。每进入一个新里程碑前必须先读取本文档；每完成一个里程碑后必须回写进度、验证证据、限制和下一步。

## 产品目标

将现有的「AI 新闻聚合站」重构为「AI 热点发现 + 趋势判断 + 创作者选题 + 素材情报平台」。

核心业务链路：

`Signal → Topic → Trend → Opportunity → Material → Creation`

首页必须首先回答：

1. 过去 24 / 48 / 72 小时什么正在发生；
2. 什么正在快速升温；
3. 什么值得现在做成内容；
4. 为什么值得做，以及可以从什么角度完成。

## 本阶段范围

当前只完成「前端框架与首页内容」的第一阶段重构：

- 将客户端从 Create React App + JavaScript 迁移到 React + Vite + TypeScript。
- 使用 Tailwind CSS 和 shadcn/ui 式本地组件。
- 构建全屏视频背景、电影感排版、液态玻璃导航的单页首屏。
- 将品牌和文案改写为 Aya 的 AI 创作情报定位，不原样照搬 Velorah 模板。
- 增加「今日随机选题」：优先从站内真实新闻产生可执行选题；无数据时仅显示明确标注的创作练习，不伪造实时热点。
- 更新开发、构建与容器静态资产目录。

本阶段不重写后端 Signal / Topic / Trend 数据模型；原有真实新闻 API 保留为首页选题的临时真实数据源。

## 已冻结设计决策

- 品牌名：`Aya Signals®`。
- 视觉基调：深海蓝、电影感、克制的液态玻璃。
- 背景：用户提供的 CloudFront MP4，全屏、自动播放、循环、静音、`playsInline`。
- 字体：Instrument Serif 用于展示字，Inter 400/500 用于正文。
- 首页主信息：「在噪声里，先看见下一个值得做的 AI 选题。」
- 一级信息架构：看热点 / 找选题 / 做研究 / Aya Skill。
- 主动作：「随机一个选题」，通过可访问的 shadcn/ui Dialog 展示结果。
- 不使用装饰光斑、径向渐变或额外视频遮罩层。

## 实施状态

| 里程碑 | 状态 | 完成情况 / 证据 |
|---|---|---|
| 0. 需求与现有前端审计 | 已完成 | 确认现有前端为 CRA + JS + Tailwind 3；生产通过 `client/build` 发布；后端 `/api/news/latest` 可继续提供真实新闻。 |
| 1. 重构记忆文档 | 已完成 | 建立本文档，并将在 README 标注当前重构入口。 |
| 2. 实施计划与评审 | 已完成 | 计划位于 `docs/superpowers/plans/2026-08-27-aya-creator-radar-frontend-rebuild.md`。首轮发现并修正 8 项问题；第二轮评审结果为 `✅ Approved`。 |
| 3. 随机选题领域逻辑 | 已完成 | 完成两轮 RED→GREEN：领域测试 6 项、真实 API 边界测试 6 项，合计 `12/12` 通过。已覆盖真实嵌套响应、安全 URL、随机注入、明确练习降级、HTTP/数据异常和 AbortError。 |
| 4. Vite + TypeScript + Tailwind + shadcn/ui | 已完成 | 已迁移 package/config/入口；使用 Vite 8.2.2 + TypeScript 7.0.2 + Tailwind 3.4.19 + Radix/shadcn 本地组件。TypeScript 与生产构建通过；最终产物 JS 223.55 kB（gzip 74.49 kB）。 |
| 5. 电影感首屏与选题交互 | 已完成 | 已实现 Aya 品牌、整页 `z-0` 远程视频、视频失败深蓝降级、液态玻璃导航、分层入场动画、移动端中文排版、可访问 Dialog 与真实来源选题。Chrome 已完成 1440×960 桌面和真实 390×844 设备模拟验收：`scrollWidth = innerWidth = 390`、视频 `readyState = 4`、Dialog 完整位于视口内、浏览器控制台无错误。UI/请求生命周期测试 9 项，客户端总计 `21/21` 通过。 |
| 6. 开发与部署路径迁移 | 已完成 | 根启动命令、`start.sh`、Dockerfile、Compose、Nginx、部署/管理脚本与 MD 已迁移到 `client/dist`。Shell 语法通过，`docker-compose config --quiet` 通过，Nginx 1.29.7 经本机路径替换后 `syntax is ok` / `test is successful`。HTML 为 no-cache，`/assets/` 为 immutable。 |
| 7. 验证与交付 | 已完成 | 客户端 `21/21`、服务端 `84/84` 通过；TypeScript + Vite 生产构建、客户端依赖审计、Shell、Compose、Nginx、严格密钥扫描、Git whitespace 和脏工作树保护校验均通过。 |

## 保护与兼容性约束

- 工作树已有与 AyaNewsSkill 公开接口相关的未提交变更；本阶段不覆盖服务端变更。
- 前端迁移前的受保护 diff SHA-256：`client/src/index.css` = `cf55bddd…fd1edc`，`client/src/config/api.js` = `47066adc…8c4f2`，`server/index.js` = `ba616109․71f4`，`server/routes/content.js` = `a3545436…04aea9`。本阶段结束时必须一致。
- `nginx/nginx.conf` 已有 `/skill.md`、`/openapi.json`、`/feed.json`、`/rss.xml` 代理变更；本轮只允许合并静态缓存和 SPA fallback 相关 hunk。
- 旧前端文件在第一阶段可保留为未引用的迁移参考，不让破坏性删除阻塞新首页上线。
- 不在 UI 中伪造 Heat Score、Creator Score、平台数、时效或「实时」状态。
- 旧 Hash 路由暂不再作为新首页一级导航；未完成的 Topic 业务页不做假链接。

## 当前限制

- 当前后端的核心对象仍是 News / Article，而不是 Topic。
- 「随机选题」第一版只能从最新真实新闻提取创作角度，不会冒充已完成的趋势评分引擎。
- 本轮未安装 gstack；已改用本机 Google Chrome + DevTools Protocol 完成真实设备指标、视频、弹窗、控制台和水平溢出验证。
- 当前 Docker CLI 可用且 Compose 文件可解析，但 Docker daemon 未运行；无法在本轮实际启动 Compose 容器或构建可选前端镜像。

## 下一步

1. 将本阶段的 `client/dist`、Nginx 配置与后端部署到目标环境。
2. 上线后核验 `/`、`/api/news/latest`、`/skill.md`、`/openapi.json`、`/feed.json`、`/rss.xml`。
3. 下一阶段再把 News / Article 数据模型升级为 Signal / Topic / Trend，并实现真实热度与创作者机会评分。

## 最终验证证据

- 客户端：4 个测试文件、`21/21` 测试通过；`tsc -b && vite build` 通过。
- 生产产物：CSS 16.39 kB（gzip 4.49 kB）；JS 223.55 kB（gzip 74.49 kB）。
- 客户端依赖：`npm audit` 为 0 个漏洞。
- 服务端：修复本机 Node ABI 缓存后，`84/84` 测试通过；机器可读公开路由、OpenAPI、JSON Feed、RSS、来源健康和证据约束测试均在其中。
- 发布配置：`bash -n`、`docker-compose config --quiet`、Nginx 1.29.7 `nginx -t` 均通过。
- 静态安全：构建产物中 OpenAI/Google/AWS/私钥严格格式命中数均为 0；`git diff --check` 通过。
- 受保护 diff 哈希保持不变：
  - `client/src/index.css`：`cf55bddd336027f23ce316732071d9ccef8da6b4b992fc595791779584fd1edc`
  - `client/src/config/api.js`：`47066adc4871b2c2ffd52bb51510a81789d84d65474cc00b05810fafbff8c4f2`
  - `server/index.js`：`ba616109215eef528773162e1c8c564fe2890bc4bfa4075dfcf61e34b02471f4`
  - `server/routes/content.js`：`a354543672665a1441b6718413c83e7c95f5370d4516c5576e682ac53604aea9`

## 更新日志

- 2026-08-27：建立重构持久状态文档；确认第一阶段为前端框架、电影感首屏与真实数据优先的随机选题。
- 2026-08-27：首轮计划评审未通过；已将 TDD 工具链前置，冻结 `dist` 宿主预构建发布流，补全真实 API 异常/取消/过期响应测试与脏文件保护。
- 2026-08-27：修订后计划通过第二轮完整评审；开始进入工具链迁移。
- 2026-08-27：完成 Vite / TypeScript / Vitest 工具链基础迁移；端口、基础测试和生产依赖安全审计已验证。
- 2026-08-27：完成随机选题领域模型与真实新闻 API 边界；`12/12` 测试通过，且练习降级不冒充热点。
- 2026-08-27：完成新首屏、shadcn/ui 对话框和选题请求生命周期；客户端 `21/21` 测试与 Vite 生产构建通过。
- 2026-08-27：完成 Vite `dist` 发布路径迁移和开发/部署 MD 更新；Compose 解析、Shell 语法和 Nginx 语法已验证，Docker daemon 未运行的限制已记录。
- 2026-08-27：完成本机 Chrome 桌面与 390×844 设备模拟验收；修正视频根层级和移动端中文标题换行，确认无水平溢出、无控制台错误、视频与选题 Dialog 正常。
- 2026-08-27：完成最终交付验证；客户端 `21/21`、服务端 `84/84`，构建、审计、发布配置、密钥扫描、Git whitespace 和受保护文件哈希全部通过。

---

## 第二阶段：多源热点与创作者选题系统

### 阶段目标

把第一阶段的首页雏形扩展为真实可运行的创作者情报产品：

`国内外公开信号 → 标准化 Signal → 事件 Topic 聚类 → 时间窗趋势评分 → 创作者机会评分 → 选题卡片 / 开放 API`

第二阶段必须同时覆盖：

- 新闻与官方发布，而不是只依赖新闻媒体转载；
- GitHub Trending、Release、Repository 等开源项目信号；
- 国内社交平台的公开热点入口与可合规接入的适配器；
- 国外 Reddit、Hacker News、YouTube、X 等社区信号；
- 来源能力、认证要求、限流、最后成功时间和降级状态；
- 24 / 48 / 72 小时时间窗与多来源交叉验证；
- 面向大众、AI 小白和自媒体创作者的不同选题角度；
- 不把无数据、未认证或单来源内容伪装为“正在爆火”。

### 第二阶段里程碑

| 里程碑 | 状态 | 完成情况 / 证据 |
|---|---|---|
| A. 现有系统与真实来源审计 | 已完成 | 确认现有主链路仍是单体 `NewsService` → RSS/NewsAPI → `news` 表；来源目录虽含 100+ 官方博客、媒体与 GitHub Release Atom，但没有统一 Signal、社交适配器、Topic 聚类、真实互动量、24/48/72h 动量或创作者评分。现有 `/api/analytics/trends` 与 `NewsService.getTrendAnalysis()` 含固定描述，`/api/news/demo` 含明确演示数据；第二阶段公开热点链路不得依赖这些结果。数据库尚无 signals/topics/topic_signals/source_registry 表，前端仅接入最新新闻随机选题。 |
| B. 近期生态与开源项目研究 | 已完成 | 研究文档位于 `docs/research/2026-08-27-ai-signal-source-audit.md`。本机免凭据探测确认 HN、GitHub、Mastodon、Reddit RSS、Hugging Face、Bilibili 返回真实数据；Bluesky Search、RSSHub 公共实例与 NewsNow 公共实例当前不可作为默认主干。已核验 TrendRadar、NewsNow、Agent-Reach、Horizon、MediaCrawler、AIMedia、RSSHub 的适用边界。 |
| C. 第二阶段实施计划与评审 | 已完成 | 计划位于 `docs/superpowers/plans/2026-08-27-aya-signal-topic-platform.md`。首轮审阅发现 7 个阻断问题、第二轮发现 5 个契约缺口；已补全稳定 Topic ID/游标、版本化评分公式、调度测试开关、安装版 Skill、Nginx Feed、B站过滤、NewsNow/L4 连接器和脏工作树保护，第三轮结果为 `Approved`。 |
| D. Signal 来源层 | 已完成 | Task 0–5 已完成；Signal 来源层 `35/35` 回归通过。采集器具有并发上限、确定性来源顺序、运行锁、单源失败隔离、无效项隔离、入库前去重、运行/健康写入和 legacy News 先刷新后导入能力。缺少密钥、自托管地址、禁用 Sidecar 时均零网络调用；某来源先成功后失败会保留 `last_success_at` 并更新降级证据。 |
| E. Topic / Trend / Opportunity | 已完成 | Task 6 已完成；纯引擎与持久化集成测试通过，Signal/Topic 子系统累计 `45/45`。实现中英同事件、共同 URL、仓库与强实体聚类，普通“AI”词不会强行合并；稳定 Topic ID、合并别名、拆分锚点保留、`trend-v1` 六段可解释评分、同版本快照方向比较与 `opportunity-v1` 三类受众选题均已落地。缺失指标不被伪造，单源/单平台选题会扣分并给出证据风险。 |
| F. 开放 API 与 Agent 接入 | 已完成 | Task 7–8 已完成。REST 提供 Topic、详情、机会、随机机会、来源、变化游标、健康和管理刷新；OpenAPI 3.1 已同步全部真实路由与指标 schema。新增由持久化 Topic 驱动的 `/topics/feed.json`、`/topics/rss.xml`，稳定 ID 与原始证据 URL 均保留。网页 Skill、安装版 AyaNewsSkill 2.2、API/证据规则和 CLI 已同步；发现面测试 `9/9`、Skill `14/14`，ZIP/TAR 的 SHA256 校验通过。MCP、A2A、Webhook 仍明确标记为未实现。 |
| G. 热点雷达与视野监测台 | 已完成 | 首页已接入真实 Topic / Source / Change API，提供 24/48/72 小时切换、升温主题、可解释评分、创作者机会、GitHub 项目、国内/海外证据覆盖、增量变化与来源状态；“随机一个选题”优先读取真实 Creator Opportunity、原始证据、真实评分与风险提示，仅在无机会时兼容降级到真实 News，全部不可用时才标注创作练习。客户端全量 `31/31`、TypeScript 与 Vite 生产构建通过。 |
| H. 最终验证与上线准备 | 已完成 | 验证报告位于 `docs/verification/2026-08-27-signal-platform-verification.md`。服务端 `147/147`、客户端 `32/32`，构建/审计/配置/密钥/Skill 包/基线保护通过；干净库真实采集和全部开放接口正常，Chrome 桌面/移动/错误态完成。Docker daemon 未运行的环境限制已记录。 |

### 第二阶段约束

- 只接入公开、官方、RSS/API 或允许的聚合入口；需要登录、Cookie、付费 API 或第三方服务的来源必须显式标记为可选，不在仓库中保存凭据。
- 来源是否“已配置”和是否“本次成功”分开记录；不能把理论支持的平台显示为在线。
- 热度评分必须可解释，并保留原始来源 URL、时间、平台和证据计数。
- 所有新生产逻辑先写失败测试并观察 RED，再实现 GREEN。
- 继续保护第一阶段前已有的 AyaNewsSkill 与公开接口变更，不覆盖用户未提交工作。

### 第二阶段脏工作树保护基线

- 基线目录：`/tmp/aya-phase2-baseline-20260827`（不含密钥、Cookie、数据库和 `.env`）。
- 清单 SHA-256：`c6b637bd744f3c7a49494eeb1bc4d99e880f1906e85014315d9580f40b8b2aa8`。
- 已保存 53 行 `git status --short`、目标文件完整副本和逐文件 phase-2 前 diff。
- `server/index.js` 只允许增加 Signal 路由、生命周期开关与调度；保留现有公开路由、Socket.IO、安全中间件和 News 初始化语义。
- `server/routes/content.js` 只允许扩展真实 Signal 能力说明，不移除现有证据约束和管理权限。
- `PublicDiscoveryService.js`、AyaNewsSkill 源文件只允许扩展 Topic/Signal 契约，不删除既有 News 兼容接口。
- `nginx/nginx.conf` 只允许新增 Topic Feed 精确代理；保留现有 SPA、静态缓存与机器可读路由。
- Compose/README/QUICKSTART/DEPLOY 只允许增加新环境变量和运维说明；保留第一阶段 Vite `dist` 发布路径。
- 最终验收必须分别审查 `HEAD→基线`、`基线→最终`、`HEAD→最终`，并在验证报告中列出保留结果。

### 第二阶段下一步

1. 部署当前 `client/dist`、后端与 Nginx 到目标环境。
2. 在生产域名核验首页、Signal API、OpenAPI、Skill 与 Topic JSON/RSS。
3. 按实际账号和自托管服务逐项启用 L2 / L3；L4 保持独立 Sidecar。

### 第二阶段更新日志

- 2026-08-27：完成现状审计；确认已有大规模 RSS/Release 来源目录，但核心数据对象、社交采集、真实趋势与创作者机会能力仍未实现，并识别出旧趋势固定描述和演示数据隔离要求。
- 2026-08-27：完成近期生态研究与真实端点探测；冻结 L1 免认证主干、L2 可选官方 API、L3 自托管桥接、L4 登录态深挖四级来源模型。
- 2026-08-27：第二阶段实施计划经三轮独立审阅后通过；开始在当前集成工作区按基线保护协议执行。
- 2026-08-27：完成 Task 0 脏工作树基线快照；保存 10 个重叠目标文件和 8 份既有 diff，冻结逐文件允许改动边界。
- 2026-08-27：完成 Task 1 RED→GREEN；来源目录与 Signal 标准化器 `8/8` 通过，未配置密钥不泄露且 L4 登录态工具不会被 Web 服务器调度。
- 2026-08-27：完成 Task 2 RED→GREEN；SignalStore `6/6` 通过，建立 8 张新表及索引，并验证失败源健康状态、Topic 别名和增量游标契约。
- 2026-08-27：完成 Task 3 RED→GREEN；六类 L1 外部适配器与 legacy News 导入测试通过。真实探测得到 21 条有效 Signal；Reddit 429 与 Bilibili 零相关结果被按来源诚实记录，未伪造成热点。
- 2026-08-27：完成 Task 4 RED→GREEN；可选官方 API、自托管 RSSHub/NewsNow/JSON Bridge 和 L4 Sidecar 边界测试通过，默认环境不会误报未配置平台为在线。
- 2026-08-27：完成 Task 5 RED→GREEN；新增采集编排与服务门面，覆盖并发、去重、防重入、单源失败、配置边界、legacy News 刷新顺序和来源健康状态；Signal 来源层全量 `35/35` 回归及 `git diff --check` 通过。
- 2026-08-27：完成 Task 6 RED→GREEN；Topic 聚类、稳定身份、趋势/方向、证据强度、创作者机会、快照持久化与服务重建累计 `45/45` 回归通过；评分公式和单源惩罚均以原始输入可解释输出，`git diff --check` 通过。
- 2026-08-27：完成 Task 7 RED→GREEN；开放 Signal API、管理刷新、30 分钟 Signal 调度、45/30 天保留清理和显式生命周期控制落地；指定兼容测试 `17/17` 及 `git diff --check` 通过。基线到当前的 `server/index.js` 差异仅限 Signal 路由、调度和生命周期责任，既有公开路由、WebSocket 与 News 语义仍保留。
- 2026-08-27：完成 Task 8 RED→GREEN；OpenAPI、网页 Skill、Topic JSON/RSS Feed、Content capabilities、安装版 Skill/CLI 同步完成。服务发现面 `9/9`、Skill `14/14`，重新打包的 ZIP/TAR 均通过 SHA256 清单校验。
- 2026-08-27：完成 Task 9 RED→GREEN；首页电影感首屏后接入真实“视野监测台”，覆盖 24/48/72 小时 Topic、趋势解释、创作者机会、开源项目、地区覆盖、变化流和来源运维状态。客户端全量 `28/28`，`tsc -b && vite build` 与 `git diff --check` 通过。
- 2026-08-27：完成 Task 10 RED→GREEN；随机选题先调用 `/api/signals/v1/opportunities/random`，再解析 Topic 详情中的安全原始证据，展示服务端真实 Creator/趋势分、选题角度和风险提示；404/旧部署兼容回退到真实 News，双源不可用才进入明确练习模式。客户端全量 `31/31` 与生产构建通过。
- 2026-08-27：完成 Task 11；新增可配置 Mastodon 实例与 Reddit 社区，完善 L1–L4、Token、自托管 Bridge、刷新/保留、健康和管理刷新文档；Compose 继续通过 `server/.env` 透传可选变量，Nginx 新增 Topic JSON/RSS 精确代理。来源配置测试 `5/5`，Shell、Compose、Nginx 1.29.7 本机路径替换语法与 `git diff --check` 均通过。
- 2026-08-27：完成 Task 12 与第二阶段收口。干净库真实采集发现并修复 Mastodon 非 AI 趋势混入；最终后端 `147/147`、客户端 `32/32`。真实采集、Live API、临时 Nginx Feed、Chrome 1440×960 / 390×844、503 诚实错误态、严格密钥扫描、Skill 包与三层脏工作树保护全部通过；详细证据见最终验证报告。
- 2026-08-27：完成 GitHub 发布准备与上传。AyaNewsSkill 2.2 已推送至 `codex/ayanews-skill-2-2` 并建立 [AyaNewsSkill PR #1](https://github.com/MarcusDog/AyaNewsSkill/pull/1)；AI News 完整重构已推送至 `codex/aya-creator-intelligence-radar` 并建立 [AiNews PR #1](https://github.com/MarcusDog/AiNews/pull/1)。发布前复验结果为服务端 `147/147`、客户端 `32/32`、Skill `14/14`，TypeScript/Vite 构建与客户端生产依赖审计通过。
- 2026-08-27：GitHub Actions 对 AyaNewsSkill PR 标记失败，但运行元数据显示 runner 未启动、执行步骤为 0，GitHub 注释原因为账号 billing 锁定，并非代码测试失败。已使用工作流相同的 Node.js `20.19.5` 本地复验：Skill `14/14`、安装、打包和 SHA256 校验全部通过；恢复 GitHub Actions 账户状态后需要重新运行该检查。

---

## 第三阶段：线上热点采集与创作者工作流修复

### 用户反馈与线上复现基线

- 2026-08-27 直接请求生产域名确认 `/api/news/feed`、`/domestic`、`/hot-rank`、`/discover`、`/dashboard`、`/by-source` 均返回 404，并被动态 `/:id` 路由误报为“新闻不存在”；`/api/news/latest` 正常。
- `/api/signals/v1/topics` 的 24h / 48h / 72h 前 10 项 ID、顺序和响应体完全相同，页面无法让用户感知时间窗口差异。
- 生产来源目录共 20 项；legacy News、Bilibili、GitHub、Hacker News 在线，Hugging Face、Mastodon 与三个 Reddit 来源离线，YouTube、X、RSSHub、NewsNow 和 JSON Bridge 未配置，社交讨论覆盖明显不足。
- 生产随机机会接口返回 Field Robotics 学术论文，Creator Score 34；页面机会卡也以新闻与 GitHub Release 为主，没有优先回答“今天 AI 社交媒体在讨论什么、创作者现在能做什么”。
- AI HOT 同期热点对照包含 GLM-5.3 Flash、Gemini 3.5 Transcribe、OpenAI/Hugging Face 事件、Qwen3.8 Flash Next、Claude 记忆等话题，当前站内头部 Topic 未覆盖，说明采集新鲜度与来源结构仍有缺口。
- 页面“换一个选题”不能稳定换到不同且适合创作者的选题；“做研究”没有独立工作区反馈。选题与研究需要拆成独立页面并保留真实证据链。

### 第三阶段目标

1. 补齐并测试 6 个 News 聚合路由，保留现有历史数据与 `/latest` 兼容契约。
2. 修复时间窗语义、来源在线状态和失败恢复，真实复测国内外热点来源。
3. 将机会排序改为面向 AI 自媒体创作者的热点、产品、项目和社交讨论优先，并支持博主类型。
4. 修复随机换题与研究动作，新增独立选题页和研究页。
5. 完成线上接口对照、全量回归、文档更新并继续推送现有 GitHub PR。

### 第三阶段状态

| 里程碑 | 状态 | 证据 |
|---|---|---|
| I. 线上问题复现 | 已完成 | 6 个路由 404、三窗口响应相同、来源状态与随机论文选题均已由生产 HTTPS 请求复现。 |
| J. 抓取来源修复 | 已完成 | RED→GREEN 修复 HF `limit>20` 导致的 400、Reddit 三社区并发 429、Mastodon 单端点失败整源下线，并在入库前过滤 `r/artificial` 泛哲学内容。最新全新临时库真实刷新收到/写入 `132/132` 条且零来源错误：HF 20、Mastodon 4、Reddit 67、GitHub 40、HN 1；重建得到 72 个 Topic，头部为 Qwen3.8 Flash Next、GLM-5.3 Flash、LTX-2.5，泛哲学 Topic 为 0。Bilibili 全站热门本轮真实返回 0 条 AI 相关内容；匿名搜索实测触发 412 风控，因此继续诚实显示零结果，国内深挖由可配置 RSSHub/NewsNow 承担。 |
| K. News 聚合 API | 已完成 | RED→GREEN 实装 `/api/news/feed`、`domestic`、`hot-rank`、`discover`、`dashboard`、`by-source`，全部位于 `/:id` 前；分别返回真实历史 News、国内 Signal Topic、趋势榜、创作者机会、聚合面板与来源统计。OpenAPI 同步，定向路由/发现测试 `8/8`。 |
| L. 创作者选题与研究页 | 已完成 | `opportunity-v2` 支持 general / short-video / tool-review / news-commentary / deep-dive 五种画像；前端随机换题排除当前 Topic，画像/窗口变化重取真实机会。新增 `/topics`、`/research`、`/skills` 三个独立页面；研究页通过 `topicId` 使用当前 Topic Signal 构建证据包，并对加载、成功、证据不足与失败提供反馈。前端定向测试 `19/19` 与生产构建通过。 |
| M. 最终验证与 GitHub 更新 | 已完成 | Live HTTP 与桌面/移动浏览器验收完成；最终服务端 `159/159`、客户端 `34/34`、Skill `15/15`，Vite 构建、生产依赖审计、Skill ZIP/TAR SHA256 与两个工作树 `git diff --check` 全部通过。AI News `dc56dc9a` 与 AyaNewsSkill `33b6e73` 已推送并更新现有草稿 PR。 |

### 第三阶段更新日志

- 2026-08-27：来源修复完成。HF Trending 请求上限改为真实契约 20；三个 Reddit 社区共享一个公开聚合 RSS 并按社区拆分，避免并发匿名请求触发 429；Mastodon statuses/links 改为部分成功可用。定向测试 `14/14`，全新库实采 `138/138`、零来源错误、78 个 Topic。
- 2026-08-27：六个 News 聚合路由完成并同步 OpenAPI。`feed` 保留历史 News 总量与引用 URL，其他路由复用真实 Signal/Topic/来源健康数据；定向测试 `8/8`。
- 2026-08-27：时间窗从“只按 Topic 最后出现时间过滤”改为按窗口裁剪真实证据并重算 Trend/Creator 分；详情 API 与前端详情请求同步携带 window。构造边界测试得到 24h/48h/72h 证据数 `1/2/3`，真实库 24h 与 48h 已出现可解释差异。
- 2026-08-27：创作者机会后端升级为 `opportunity-v2`，支持五种 AI 博主画像，增加低价值讨论/纯论文质量门槛和随机排除上一题；真实库 general 头部为 Qwen3.8 Flash Next、GLM-5.3 Flash、LTX-2.5 与 NVIDIA/Hugging Face 讨论。
- 2026-08-27：新增 Reddit 广泛社区入库前显式 AI 相关性过滤；定向采集/来源/研究测试 `18/18`。再次使用全新库实采 `132/132`、零错误、72 个 Topic，9 个默认 L1 来源均为 online（Bilibili 与空 legacy 库诚实返回 0），泛哲学 Topic 为 0。
- 2026-08-27：独立研究工作台已将 `topicId` 传给 `/api/content/v1/brief`；Content 路由支持注入 SignalService，并把当前 Topic 的官方、社区和项目 Signal 转换为可引用证据包。定向路由测试 `3/3`。
- 2026-08-27：完成独立 `/topics`、`/research`、`/skills` 页面与旧 `#/...` 兼容；五画像/窗口切换会重取真实机会，随机换题不会连续重复，手动改研究主题会清除旧 Topic ID。前端定向测试 `19/19`、Vite 生产构建通过。
- 2026-08-27：AyaNewsSkill 升级为 2.3；OpenAPI、网页 Skill、安装版 Skill/API 参考和零依赖 CLI 同步画像、`exclude`、窗口详情、`topicId` 研究和六个 News 聚合路由。发现面与 Skill 测试 `22/22`。
- 2026-08-28：完成真实 API 与 Chrome 页面验收。6 个 News 路由、OpenAPI 2.3、Skill Markdown、Topic Feed 均为 HTTP 200；24h/48h Qwen 证据数为 5/6，响应不再相同；随机接口补齐稳定 `id` 后，带 `exclude` 的两次调用返回不同 Topic。桌面与 390×844 移动端完成选题、画像/窗口切换、研究证据和 Skill 页面流程，控制台无错误。详细证据见 `docs/verification/2026-08-28-hotspot-creator-workflow-verification.md`。
- 2026-08-28：最终提交候选复验通过：服务端 `159/159`、客户端 `34/34`、AyaNewsSkill `15/15`；TypeScript/Vite 构建、客户端生产依赖审计、Skill ZIP/TAR SHA256、两个工作树 `git diff --check` 全部通过。
- 2026-08-28：完成 GitHub 上传与 PR 更新。AI News 代码提交 `dc56dc9a` 已推送至 [AiNews PR #1](https://github.com/MarcusDog/AiNews/pull/1)；AyaNewsSkill 2.3 提交 `33b6e73` 已推送至 [AyaNewsSkill PR #1](https://github.com/MarcusDog/AyaNewsSkill/pull/1)。Skill Actions 注释明确为账号 billing 锁定，job 步骤数为 0；不是代码或测试失败，恢复账号运行资格后需重新运行。

---

## 第四阶段：跨垂类博主内容、爆款与持久推送

### 用户目标

将 AyaNews 从 AI 新闻/Signal 产品继续扩展为跨垂类创作者情报系统，首发覆盖美妆、穿搭、AI 科技、娱乐。系统要对核验观察名单中的博主持续获取公开帖子，保存平台允许读取的历史，识别单博主爆款、多博主共题和跨平台扩散，生成适合不同博主类型的真实选题，并支持按垂类/平台/博主正确推送。

“所有对应博主内容”在本项目中的可验收定义是：对已导入并核验的观察名单账号，分页读取平台或已配置 Bridge 当前允许访问的全部公开历史直至 cursor 耗尽，再持续获取新增/编辑内容。它不等于平台全部用户，也不包含私人、付费、已删除、超出官方历史窗口或受权限/风控阻止的内容。账号必须公开显示 `pending/running/complete/partial/blocked`、历史起止时间、cursor 和限制原因。

### 当前审计结论

- 现有 SQLite/WAL、Signal 来源健康、Topic、24/48/72 小时窗口、证据 URL、changes Feed 和 30 分钟调度可以复用。
- 现有 `signals.author` 不是稳定博主身份；没有跨平台账号映射、逐帖生命周期、互动量历史快照、垂类观察名单、博主自身基线、跨博主扩散、历史回填 cursor、全文检索或持久推送 outbox。
- Socket.IO 当前订阅只是进程内 room，刷新后不保留，也不能保证外部 Webhook/消息推送。
- YouTube、Bluesky、Mastodon、GitHub、RSS 可作为公开主链；Reddit、X、Instagram、抖音官方能力需要 OAuth/付费/审批或账号授权；小红书、任意抖音/微博/B站深挖需要人工维护的登录态 Sidecar。
- 已研究 Agent-Reach、MediaCrawler、TrendRadar、RSSHub、NewsNow、Douyin_TikTok_Download_API、xiaohongshu-mcp、Harken；只借鉴其能力边界和架构，不直接复制受许可证、登录态或用途限制约束的代码。

### 第四阶段状态

| 里程碑 | 状态 | 证据 |
|---|---|---|
| N. 来源与开源项目审计 | 已完成 | `docs/research/2026-08-28-cross-vertical-creator-source-audit.md` 已记录现有缺口、项目热度/许可证、14 类平台接入矩阵、来源等级、本地保存、Hotness 与推送正确性边界。 |
| O. 产品/数据/接口规格 | 已完成 | `docs/superpowers/specs/2026-08-28-cross-vertical-creator-intelligence.md` 已冻结领域模型、签名 Sidecar、回填状态机、垂类规则、`creator-hotness-v1`、Creator API、订阅/outbox、前端页面、保留期和发布门槛。 |
| P. TDD 实施计划与评审 | 已完成 | `docs/superpowers/plans/2026-08-28-cross-vertical-creator-intelligence.md` 已形成 18 个任务、三条可独立交付 Slice；经过四轮独立审查，前三轮累计关闭 14 个阻断问题，第四轮结果为 `Approved`。 |
| Q. Slice A 可信采集与历史回填 | 已完成 | Task 0–7 已完成：公开主干、WebSub、官方受控 Connector、签名 Sidecar、增量优先队列、请求预算、账号互斥锁、逐页事务 cursor、可恢复历史回填和二次 reconciliation 均已落地。历史页不发送新帖事件；API/Feed 历史窗口会标记 `partial`，权限/风控失败会标记 `blocked`。重启不会重置 cursor，首次导入会自动安排增量时间。Creator 全量回归 `77/77`；真实临时库调度 canary 从 GitHub OpenAI/Hugging Face 与 Lab Muffin RSS 写入 229 条，三次 run 全部 success；RSS/无 YouTube Key 回填分别以明确原因落为 `partial`。 |
| R. Slice B 爆款/共题/选题 | 已完成 | Task 8–11 已完成：Hotness、规则垂类分类、独立博主/跨平台扩散、证据型选题与可搜索 Creator API 已串联。`/api/creators/v1` 提供垂类、博主、帖子、热点、主题、来源覆盖、增量变化与管理回填接口；帖子正文使用 SQLite FTS5，普通列表与全文搜索都使用绑定查询和不透明 keyset cursor。跨平台/多博主主题先过滤、按全局热度排序后再 limit。四垂类与五类画像输出具体对象、why-now、受众、形式、钩子、提纲、原帖来源、不确定性与披露风险。公开响应会剥离凭据、私有 cursor 和内部 payload。服务端全量 `275/275`；10 万帖子、每类 20 次查询的最慢 P95 为 `107.09ms`，通过 `<300ms` 门槛。 |
| S. Slice C 持久推送与产品页面 | 进行中 | Task 12–13 已完成：订阅、事件/outbox 原子写入、重试/死信/lease、端点测试审计、签名 Webhook、登录态 SSE/Socket.IO 及可选消息通道均已落地。Webhook 仅接受 HTTPS 443/显式端口，拒绝 userinfo、IP literal 与全部私网/链路本地/保留/metadata IPv4/IPv6，逐次重解析 DNS 并固定已验证 IP，同时保留 TLS hostname 校验、禁重定向、限并发/超时/响应体；默认只解析 `AYA_CREATOR_WEBHOOK_*` 专用 secret reference。SSE 以持久 `creator_events.seq` 为 ID，支持过滤、升序重放、15 秒心跳、`Last-Event-ID` 恢复和过期 cursor `410`。服务端全量 `303/303`；Nginx 1.29.7 语法与真实代理验收通过，心跳后从 ID 1 重连只收到 ID 2。Task 14–15 待完成。 |
| T. 真实来源 Canary 与 GitHub 更新 | 未开始 | 必须逐平台记录真实成功、零结果、`partial`、`blocked` 或 `unconfigured`，不能只凭理论支持标记完成。 |

### 第四阶段更新日志

- 2026-08-28：完成跨垂类博主来源与开源项目审计；确认“新闻热榜”和“指定博主逐帖监听”是两个不同数据链，第四阶段新增独立 Creator Intelligence bounded context。
- 2026-08-28：完成产品规格与实施计划草案；补齐观察名单范围内全公开历史的定义、每账号回填状态机、二次 reconciliation、四垂类、稳定身份、互动快照、博主相对基线、多博主/跨平台扩散、FTS5、本地 SQLite、持久 outbox 和签名 Sidecar。
- 2026-08-28：实施计划第一轮独立审查未通过；已修订脏工作树分片暂存、YouTube WebSub、Bridge 原始字节签名与账号白名单、单调 changes/SSE 恢复、FTS `q`/游标契约、预览式清理/在线备份/JSONL 导出，以及 Nginx SSE 无缓冲部署验证，进入第二轮复审。
- 2026-08-28：第二轮复审确认首轮 7 项全部关闭，但新增发现状态/event/outbox 缺少原子生产入口、`review`/`tool-review` 画像冲突、Webhook SSRF 策略不可执行、maintenance audit schema 缺失；现已加入统一 `applyCreatorStateChange` 事务、现有画像兼容回归、HTTPS/DNS/IP/重定向 SSRF 策略及可持久审计的单次 preview，进入第三轮复审。
- 2026-08-28：第三轮复审确认第二轮 4 项全部关闭，但新增发现白名单化 Bridge payload 缺少表/关联/30 天清理链、最终命令仍会整文件暂存状态 MD、AyaNewsSkill 缺少最终 push 与远端 SHA 核验；现已补齐 payload/run/post schema 与安全清理、默认排除重叠状态文件，并将两个仓库 push/远端 SHA 一致性加入最终门槛，进入第四轮复审。
- 2026-08-28：第四轮独立复审通过，结果为 `Approved`，无阻断项。计划最终冻结为 18 个 TDD 任务，实施仍未开始；下一步从 Slice A 的基线、CreatorStore、核验观察名单和公开主链连接器开始。
- 2026-08-28：开始执行 Slice A。Task 0 按 RED→GREEN 完成：先观察到基线清单缺失导致保护测试失败，再创建不含密钥/Cookie/数据库内容的 baseline；最终 `creator-baseline.test.js` 为 `5/5`，`git diff --check` 通过。
- 2026-08-28：完成 Slice A Task 1 RED→GREEN。CreatorStore 测试先因模块缺失失败，最小模块落地后 7 项行为用例继续按预期失败，完成实现后定向测试 `8/8` 通过；加上 baseline、SignalStore 和 DatabaseService 回归共 `27/27` 通过，`git diff --check` 通过。
- 2026-08-28：完成 Slice A Task 2 RED→GREEN。目录测试先因四垂类/观察名单模块不存在而 `0/7` 失败，实现后 `7/7` 通过；已实际反查 YouTube channel 规范链接与 Atom Feed、GitHub 组织数字 ID/API、Lab Muffin/Vogue/Variety RSS 及最新时间，联动回归 `25/25` 通过，`git diff --check` 通过。
- 2026-08-28：完成 Slice A Task 3 RED→GREEN。标准化测试先因模块不存在失败，最小导出落地后 `0/9` 按预期失败，完成严格契约后 `9/9` 通过；未公开指标保持 `null`，Cookie/Authorization/Token/未知 raw 字段不会进入标准对象。联动回归 `33/33` 与 `git diff --check` 通过。
- 2026-08-28：完成 Slice A Task 4 RED→GREEN。五类公开 Connector 先 `0/8` 按预期失败，实现后 `8/8`；WebSub 先 `0/6` 失败，补齐原始 XML 签名、精确 Topic/频道、重复回调、历史回填并行和 lease 续租后全部通过；最终指定回归 `40/40`。发现并修复本机 Node 不继承系统代理导致 YouTube 直连超时；修复后真实只读探测得到 YouTube 15、Vogue RSS 29、GitHub 100 条并保留可打开原帖 URL。测试数据库已隔离到临时路径，未提交任何 SQLite 内容，`git diff --check` 通过。
- 2026-08-28：完成 Slice A Task 5 RED→GREEN。官方连接器测试先因模块缺失失败，最小导出后 `0/7` 按预期失败，实现与环境文档完成后 `8/8` 通过；验证四类缺失凭据时零网络、授权账号绑定、凭据不进响应、指标可空与失败状态保留上次成功时间。公开/官方/标准化/目录联动回归 `33/33`，`git diff --check` 通过。
- 2026-08-29：完成 Slice A Task 6 RED→GREEN。Bridge 测试先因验签模块缺失失败；实现后 `11/11` 通过，覆盖原始字节 body hash、固定长度 timing-safe 比较、五分钟时间窗、未知来源、错误签名、2 MiB/500 条边界、私密/已删除内容、已核验账号绑定、重复/并发 nonce、持久化失败全量回滚和 payload allowlist 脱敏。合法签名 canary 后来源才转为 `online`；Creator/Connector/生命周期联动回归 `41/41`，`git diff --check` 通过。
- 2026-08-29：完成 Slice A Task 7 RED→GREEN。新增有界并发增量采集、账号级锁、单源失败隔离、请求预算、持久 cursor、可恢复回填、耗尽后二次 reconciliation、每日复核与最近 100 条指标刷新调度；修复首次 seed 无 `next_run_at`、重启重置回填进度及来源成功结果缺少顶层 `online` 状态三个真实链路问题。Creator 全量 `77/77`；真实临时 SQLite canary 写入 GitHub OpenAI 100、Hugging Face 119、Lab Muffin RSS 10 条，共 229 条，run 全部 success。RSS 与无 YouTube Key 历史测试分别保存 `rss_feed_retention_window`、`youtube_data_api_key_required_for_full_history` 并标记 `partial`，未误报全量完成。
- 2026-08-29：完成 Slice B Task 8 RED→GREEN。Hotness 测试先因模块缺失失败，实现后定向 `7/7`、Creator 全量 `84/84`。评分按同平台/同垂类/同年龄桶 peer 分位数与博主 30 天基线组合，小号按相同比例获得同等 creator-relative 分；缺失指标保持 `null` 并降低置信度，广告、转发、旧帖回流、低可信来源和缺失证据分别留痕扣分。`creator_post_scores` 保存可复算输入与每个加权分项；指标快照实行 72 小时细粒度、180 天每日保留，压缩不删除评分复算数据。
- 2026-08-29：完成 Slice B Task 9 RED→GREEN。分类/Topic 测试先因模块缺失失败，实现后新增 `12/12`、Creator 与旧 Signal Topic 联动 `98/98`。规则分类覆盖中英文本与关键歧义，博主 seed 只作先验且不能压过帖子反证。扩散引擎按 canonical creator 去重跨平台同步、按 syndication network 折叠转载，分别识别单博主爆款、6 小时 3 位/24 小时 5 位独立博主共题和 24 小时 3 位博主+2 平台扩散；Creator Topic、post 关系、首发/跟进证据与版本快照写入独立表。
- 2026-08-29：完成 Slice B Task 10 RED→GREEN。选题测试先因模块缺失失败，实现后定向 `5/5`、Content 服务/路由联动 `11/11`。四垂类×五类既有创作者画像均生成具体 subject、why-now、受众、内容形式、hook、提纲、HTTPS 原帖、不确定性和披露风险；单来源返回 `insufficient_evidence` 且不写“全网趋势”，抽象“AI 是否改变人类”类问题返回 `generic_or_unsupported_subject`。保留 `tool-review`，明确拒绝未定义的 `review`；ContentService 可按 Creator Topic ID 返回原帖证据边界，旧 Signal Topic 研究包不受影响。
- 2026-08-29：完成生产域名 Standard QA 基线，报告位于 `.gstack/qa-reports/qa-report-ainews-xiaotianaya-com-2026-08-29.md`。页面控制台、响应式布局与约 30 分钟刷新节奏正常，但生产仍复现 8 项问题：6 个 News 聚合路由 404、24/48/72h 响应完全相同、研究导航打开 JSON Feed、随机换题重复、`Latest` 等低信息标题、What Changed 不可识别，以及社交/国内来源大面积离线或未配置。生产 Hugging Face、Mastodon、3 个 Reddit 源连续失败 100 次且错误含可疑 DNS 解析地址；该部分需代码复验与生产 DNS/egress 双线处理。Task 11 开始前工作树将先保存此 QA 证据。
- 2026-08-29：完成 Slice B Task 11 RED→GREEN。新增 `/api/creators/v1` 公开与管理路由、SQLite FTS5 全文检索、绑定字面查询、Unicode/CJK 检索、普通/搜索 keyset cursor、来源覆盖和 retention-gap `410` 增量恢复。补测并修复热点帖子“先 limit 后排序”和跨平台主题“先 limit 后过滤”的漏榜问题；删除帖子会与 FTS 行在同一事务中清理。Creator 路由定向 `14/14`、服务端全量 `275/275`；10 万帖子基准最慢 P95 `107.09ms`，通过 `<300ms` 门槛。实际启动服务器后所有 Creator 端点均返回带生成时间、覆盖状态和公式版本的诚实空结果，未伪造热点。
- 2026-08-29：完成 Slice C Task 12 RED→GREEN。新增持久订阅服务、纯事件检测器与 durable outbox worker；帖子首次入库、Hotness 60/75/90 首次跨越、Topic 3 博主/2 平台首次跨越使用稳定 transition key，生产者重试不会重复事件。采集/评分/Topic 写入与事件、匹配订阅、outbox 在同一 SQLite 事务中，任一阶段失败全量回滚；历史回填不发送新帖事件。投递支持 2xx、429、5xx、终止 4xx、指数退避、lease 崩溃恢复、死信与手动重放。补齐登录用户订阅/端点 CRUD 与所有权隔离，凭据引用不回显；自审修复“未配置静默时段却默认延迟夜间热点”。Task 12 核心定向 `31/31`、Creator 路由 `15/15`、服务端全量 `289/289`。
- 2026-08-29：完成 Slice C Task 13 RED→GREEN。新增 Webhook、SSE/Socket.IO、Email 与 Feishu/WeCom/DingTalk/Telegram/ntfy/Bark 可选通道；未配置通道零网络调用。Webhook 实装 HMAC-SHA256 事件/投递/时间戳头、每次请求 DNS 重解析、公网 IP 全量校验与连接固定、TLS hostname 保留、HTTPS/端口白名单、禁重定向、超时/响应上限/并发限制；SSRF 测试覆盖 metadata、IPv4/IPv6 私网/链路本地/ULA/组播/文档和混合 DNS 答案，默认 secret resolver 只允许 `AYA_CREATOR_WEBHOOK_*` 前缀。SSE 对登录用户按持久 seq 重放、过滤、心跳与无重复恢复；站内端点只能指向当前用户，端点测试只经 outbox worker、内部测试订阅保持禁用并产生可按用户查询的审计 attempt。服务端全量 `303/303`，Nginx 1.29.7 临时配置语法成功；真实后端+Nginx canary 收到 15 秒心跳，并从 `Last-Event-ID: 1` 只续传 `id: 2`。Docker daemon 仍未运行，但不影响本机 Nginx 真实代理验收。
