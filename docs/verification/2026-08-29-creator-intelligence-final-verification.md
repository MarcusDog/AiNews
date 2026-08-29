# Creator Intelligence Task 17 Final Verification

日期：2026-08-29（Asia/Shanghai）

## 结论

第四阶段的采集、本地保存、评分/共题加工、来源监测、浏览器产品页和持久推送已经连成可运行链路。本报告的「在线」只表示 2026-08-29 当次无凭据 Canary 真实成功，不代表其他需要 Token、OAuth、审批或登录态 Sidecar 的平台已经可用。

生产站 `https://ainews.xiaotianaya.com/` 仍是部署前基线；本轮没有执行生产部署，因此不把本地验收冒充为线上已修复。生产差异基线仍保留在 `.gstack/qa-reports/qa-report-ainews-xiaotianaya-com-2026-08-29.md`。

## 真实来源 Canary

执行方式：使用全新临时 SQLite，加载仓库中已人工核验的示例观察名单，运行真实公开 Connector，紧接着重放同页验证幂等，再执行 GitHub 三页历史回填和情报加工。报告和数据库位于 `/tmp/aya-creator-canary-final2.3VrC3q/`，不纳入 Git。

| 平台 / Connector | 当次结果 | 核验账号 | 首轮收到 | 回填后本地帖子 | 边界 |
|---|---:|---:|---:|---:|---|
| YouTube Atom | online | 6/6 | 90 | 90 | Atom 可持续取新，全历史/统计指标需 YouTube Data API key |
| GitHub public API | online | 2/2 | 219 | 387 | OpenAI 三页后仍为 `reconciling`，cursor 已持久化，不误报 complete |
| RSS | online | 3/3 | 49 | 49 | Feed 仅能代表其对外公开的保留窗口 |
| Bluesky | no verified seed | 0 | 0 | 0 | Connector 可调度，但本仓库没有经人工核验的账号，未发起网络请求 |
| Mastodon | no verified seed | 0 | 0 | 0 | 同上 |
| Reddit / X / Instagram / Douyin | unconfigured | 0 | 0 | 0 | 需官方 OAuth/Token/账号授权；缺少凭据时零网络请求 |
| TikTok Research API | eligibility_required | 0 | 0 | 0 | 需单独证明研究资格，不是通用博主采集接口 |

当次合计：

- 11 个已核验账号，首轮收到/写入 358 条；
- 完整重放后新增 0 条，证明逐帖子幂等约束生效；
- GitHub 三页历史回填后本地共 526 条：GitHub 387、YouTube 90、RSS 49；
- 数据库中四垂类帖子覆盖：AI 科技 387、美妆 26、娱乐 40、穿搭 51；未分类帖子不被强行塞入垂类；
- 加工生成 114 份可复算 Hotness 评分、55 个 72h Creator Topic，22 条帖子因证据不足保持未分类；
- 100/100 条抽样的 `url` 与 `provenance_url` 均为无凭据 HTTPS；20/20 个真实原帖链接当场可打开。

## 本轮发现并修复的真实链路问题

1. 采集器已写入数据，但定时服务未调用 Hotness/Topic 加工。现在 `tick`、`reconcile`和 `refreshMetrics` 在成功采集后运行 `CreatorIntelligenceService`。
2. 初始版按博主先验会把无关内容错分到美妆。现在每条帖子重新经过内容规则；个人博主必须有文本证据，只有经核验的单垂类专业媒体/品牌才能在无冲突中性标题上保留唯一先验。
3. GitHub 匿名 API 额度耗尽的 403 曾被误分为 `permission_missing`。现在通过 `x-ratelimit-remaining/reset` 精确分为 `rate_limited`并记录恢复时间。
4. 服务重启后来源页只读进程内 Registry，会丢失上次成功。现在合并持久化 `creator_runs`，页面能显示真实的最后成功时间、帖子数和失败原因。
5. 匿名访问 `/alerts` 会用受保护路由探测登录态，造成 401 噪声。现在增加始终 HTTP 200 的 `/api/auth/session`，并同步 OpenAPI 与基线变更记录。
6. 推送页创建的订阅未在 UI 中列出。现在展示订阅名称、垂类、最低分和启用状态。

## 真实浏览器验收

使用 Chromium 分别在 1440×960 和 390×844 验收：

- `/creators`：四垂类、24/48/72h、爆款/共题切换可交互；证据不足时显示专用空态，不绘制虚假爆款。
- `/creators/:id`：真实博主资料与帖子可读；Audrey Coyne 页发现 13 个可直达 YouTube 的原始证据链接。
- `/verticals/beauty|fashion|entertainment|ai-tech`：列出当次数据中对应的核验博主。
- `/sources`：展示 YouTube 90、GitHub 387、RSS 49 与最后成功时间；未配置/资格受限平台不显示为在线。
- `/alerts`：匿名页无 401 噪声；实际注册/登录、创建「美妆爆款 QA」订阅、建立 in-app 和 HTTPS Webhook 端点后，页面可看到订阅/端点；真实密钥从未输入或回显。
- `/topics`：随机按钮会更换结果；当 Canary 库没有旧 Signal 新闻时，页面明确写「创作练习」和「不冒充实时热点」。
- `/research`：提交具体主题后有可见反馈；证据不足时 API 返回 422，页面明确建议扩大窗口或更换关键词，不生成无来源结论。
- `/skills` 和 `/`：可读可导航；所有上述页在移动端 `scrollWidth === innerWidth === 390`。

除了研究证据不足场景中预期的 HTTP 422 资源记录，未发现应用 JavaScript 异常、未处理 Promise 或水平溢出。

## 自动化与性能门槛

| 验证 | 结果 |
|---|---|
| Server Node tests | 327/327 passed |
| Client Vitest | 48/48 passed |
| AyaNewsSkill | 17/17 passed |
| Client production build | `tsc -b && vite build` passed |
| Client production dependency audit | 0 vulnerabilities |
| AyaNewsSkill ZIP/TAR | SHA256 both OK |
| Creator 100k benchmark | max P95 116.33ms, threshold 300ms, passed |
| Git whitespace | `git diff --check` passed before closeout |

## 仍需要运营者提供的外部条件

- Reddit、X、Instagram、抖音等官方时间线不能在没有平台授权的情况下变成真实在线来源。
- TikTok Research API 需研究资格；小红书、微博及登录态深挖需由运营者独立维护合规 Sidecar。
- Webhook/飞书/企微/钉钉/Telegram/ntfy/Bark 必须在服务器中配置实际目标和密钥引用；仓库不保存真实凭据。
- 要让线上用户看到本轮结果，仍需合并 PR 并部署后端、`client/dist` 和 Nginx 配置，再跑一次生产 Canary。
