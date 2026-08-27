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
