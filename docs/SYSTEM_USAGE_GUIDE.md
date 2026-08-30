# AyaNews 整个系统使用方案

> 适用版本：Aya Creator Intelligence Radar / OpenAPI 2.4 / AyaNewsSkill 2.4  
> 本文是系统当前的统一使用入口。接口字段以运行实例的 `/openapi.json` 为准；项目完成状态与验证证据见 [PROJECT_REBUILD_STATUS.md](../PROJECT_REBUILD_STATUS.md)。

## 1. 系统能做什么

AyaNews 面向四类用户：

| 用户 | 主要目标 | 推荐入口 |
|---|---|---|
| 大众与 AI 小白 | 用较短时间了解近期 AI 事件 | 首页 `/`、选题页 `/topics` |
| 自媒体创作者 | 找到值得马上制作的热点、项目、博主共题和原始素材 | `/topics`、`/creators`、`/verticals/:id`、`/research` |
| 内容运营者 | 管理新闻源、博主观察名单、历史回填、订阅和推送 | `/sources`、`/alerts`、管理 API |
| 开发者与 Agent | 读取结构化热点、证据、变化流和 Creator Intelligence | `/openapi.json`、`/skill.md`、REST、JSON Feed、RSS、AyaNewsSkill |

系统的两条数据链彼此独立、最终在选题与研究中汇合：

```text
新闻 / 官方发布 / 社区信号
  → Signal 标准化
  → Topic 聚类
  → 24h / 48h / 72h trend-v1
  → Creator Opportunity

核验博主 / 公开账号
  → Creator Post 与指标快照
  → creator-hotness-v1
  → 单博主爆款 / 多博主共题 / 跨平台扩散
  → 垂类选题与持久推送
```

首发垂类为美妆 `beauty`、穿搭 `fashion`、AI 科技 `ai-tech`、娱乐 `entertainment`。系统只采集人工核验观察名单账号在平台允许范围内的公开内容，不声称覆盖平台全部用户、私人内容或无限历史。

## 2. 五分钟启动

### 2.1 环境要求

- Node.js `>=20.19.0`
- npm
- 本地开发默认前端端口 `3000`、后端端口 `3002`
- 生产可使用 Docker Compose + Nginx；部署细节见 [DEPLOY.md](../DEPLOY.md)

### 2.2 安装与配置

```bash
npm install
cd server && npm install
cd ../client && npm install
cd ..

cp server/.env.example server/.env
```

编辑 `server/.env`。不配置可选 Token 时，L1 公共来源仍可运行；Token、Cookie、Webhook Secret 和生产观察名单都不得提交到 Git。

开发启动：

```bash
npm run dev
```

打开：

- 前端：`http://localhost:3000`
- 后端健康检查：`http://localhost:3002/health`
- OpenAPI：`http://localhost:3002/openapi.json`
- Skill：`http://localhost:3002/skill.md`

首次检查：

```bash
curl http://localhost:3002/health
curl http://localhost:3002/api/signals/v1/health
curl http://localhost:3002/api/creators/v1/sources
curl 'http://localhost:3002/api/signals/v1/topics?window=24h'
```

## 3. 页面使用说明

### 3.1 首页与视野监测台 `/`

首页用于回答“现在发生了什么、什么在升温、什么值得做”。

1. 切换 `24 小时 / 48 小时 / 72 小时`；服务端会按窗口裁剪真实证据并重新评分，不是前端重复同一列表。
2. 展开评分解释，查看新鲜度、动量、多平台和可信度贡献。
3. 打开原始证据，区分官方发布、媒体报道、项目和社区讨论。
4. 点击随机选题；系统优先返回当前窗口的真实 Creator Opportunity，并排除上一题。

单来源、单平台或指标不足会明确显示风险，不应把 `Trend Score` 或 `Creator Score` 当成已证实的事实。

### 3.2 选题工作台 `/topics`

选择适合账号的画像：

- `general`：综合创作者
- `short-video`：短视频
- `tool-review`：工具实测
- `news-commentary`：新闻点评
- `deep-dive`：深度内容

推荐流程：先选画像和窗口，再连续换题比较“为什么现在做、适合谁、内容形式、切口、风险与证据”。选定后进入研究工作台，不要只根据标题直接成稿。

### 3.3 研究工作台 `/research`

从 Topic 进入时，页面会携带稳定 `topicId`，请求 `/api/content/v1/brief` 生成证据包。研究结果应至少核对：

- 原始来源 URL 是否可打开；
- 发布时间与抓取时间是否混淆；
- 官方事实、媒体转述、社区意见和推断是否分开；
- 单来源结论是否已降低确定性；
- 是否仍存在需要人工补证的争议。

证据不足或请求失败时页面会显示反馈，不应把空结果补成完整研究。

### 3.4 博主雷达 `/creators`

用于查看核验博主、最新公开帖子、单帖爆发和共题扩散。可按垂类、平台、博主、时间窗和关键词筛选。帖子搜索使用 SQLite FTS5；翻页 cursor 与筛选条件绑定，不能修改或跨查询复用。

### 3.5 垂类页 `/verticals/:id`

可用路径：

- `/verticals/beauty`
- `/verticals/fashion`
- `/verticals/ai-tech`
- `/verticals/entertainment`

每页分别展示该垂类的热点帖子、多个博主共同发布的问题、跨平台扩散和可执行选题。运营者应先检查来源覆盖，再判断“没有热点”究竟是事实还是来源未配置。

### 3.6 来源监测 `/sources`

重点看 `configured`、`schedulable`、`status`、`lastSuccessAt`、失败原因、帖子数和最新帖子时间。

| 状态 | 含义 |
|---|---|
| `online` | 最近一次真实请求成功；成功但零结果仍可能在线 |
| `partial` | 只取得平台允许的部分历史 |
| `blocked` | 权限、风控或登录态阻止读取 |
| `unconfigured` | 缺少密钥、OAuth、Bridge 或审批 |
| `degraded` / `rate_limited` / `auth_expired` | 当前失败，但保留上次成功证据 |
| `complete` | 历史 cursor 耗尽且二次 reconciliation 完成 |

“支持该平台”不等于“该平台当前在线”。

### 3.7 推送中心 `/alerts`

页面内注册或登录后，可创建：

- 按垂类、平台、博主过滤的订阅；
- 新帖、热点阈值、多博主共题、跨平台扩散事件；
- 站内、Webhook、email、飞书、企微、钉钉、Telegram、ntfy、Bark 端点；
- 即时或摘要推送、时区与静默时段。

外部通道只有在服务端配置对应凭据后才可投递；前端创建成功不代表第三方通道已配置完成。测试投递同样经过持久 outbox，便于查看重试和失败原因。

## 4. 每日内容工作流

### 4.1 创作者早晨五分钟

1. 在首页先看 24 小时榜，识别刚出现和正在升温的话题。
2. 切到 48/72 小时，排除只是瞬时噪声的单来源内容。
3. 在目标垂类页查看是否已有多个独立博主或多个平台跟进。
4. 在 `/topics` 选择自己的账号画像并生成 3–5 个候选。
5. 选一个证据完整、对象具体、能在当天完成的题目进入 `/research`。
6. 成稿保留来源链接，并在事实、观点和推断之间做清楚标注。

### 4.2 运营者每日检查

1. 打开 `/sources`，处理 `auth_expired`、`blocked`、`rate_limited` 和长期 `degraded`。
2. 确认主要垂类至少有一个近期成功来源，最新帖子时间合理。
3. 抽查热点榜前 10 项的原帖 URL 和发布时间。
4. 检查 `/alerts` 最近投递、重试和 dead letter。
5. 检查数据库空间、备份结果和最近一次维护审计。

## 5. 来源分级与配置

### 5.1 Signal 新闻与热点来源

| 层级 | 示例 | 配置 |
|---|---|---|
| L1 | News、HN、GitHub、Mastodon、Reddit、Hugging Face、Bilibili | 免密主干；部分端点会匿名限流 |
| L2 | YouTube、X | `YOUTUBE_API_KEY`、`X_BEARER_TOKEN` |
| L3 | RSSHub、NewsNow、自定义 JSON Signal | 自托管 HTTPS 地址或 `SIGNAL_BRIDGES_JSON` |
| L4 | 登录态深挖工具 | 独立 Sidecar；Web 进程不直接读取 Cookie |

人工触发一次有界刷新：

```bash
curl -X POST http://localhost:3002/api/signals/v1/admin/refresh \
  -H 'Content-Type: application/json' \
  -H 'x-admin-api-key: YOUR_ADMIN_API_KEY' \
  -d '{"refreshLegacy":false,"itemLimit":20}'
```

### 5.2 Creator 观察名单

```bash
cp server/config/creatorSeeds.example.json server/config/creatorSeeds.local.json
```

逐条使用稳定平台账号 ID、规范 HTTPS profile URL、核验时间和垂类证据维护观察名单，然后设置：

```bash
AYA_CREATOR_SEEDS_PATH=./config/creatorSeeds.local.json
```

也可导入：

```bash
curl -X POST http://localhost:3002/api/creators/v1/admin/creators/import \
  -H 'Content-Type: application/json' \
  -H 'x-admin-api-key: YOUR_ADMIN_API_KEY' \
  --data-binary @server/config/creatorSeeds.local.json
```

完整的平台、回填状态和核验规则见 [CREATOR_SOURCES.md](./CREATOR_SOURCES.md)。

### 5.3 增量刷新与历史回填

```bash
curl -X POST http://localhost:3002/api/creators/v1/admin/refresh \
  -H 'x-admin-api-key: YOUR_ADMIN_API_KEY'

curl 'http://localhost:3002/api/creators/v1/admin/backfills?limit=100' \
  -H 'x-admin-api-key: YOUR_ADMIN_API_KEY'

curl -X POST http://localhost:3002/api/creators/v1/admin/backfill \
  -H 'Content-Type: application/json' \
  -H 'x-admin-api-key: YOUR_ADMIN_API_KEY' \
  -d '{"accountId":"ACCOUNT_ID","force":false}'
```

历史页不发送“新帖”事件；只有真实增量或阈值首次跨越才进入推送链。RSS/Atom 没有完整分页时应保持 `partial`，不能标记成全历史完成。

### 5.4 登录态平台 Sidecar

小红书、抖音/微博/B站深挖等能力应运行在独立 Sidecar：

1. 人工维护合法账号授权与登录态；
2. 只输出核验账号的公开结构化内容；
3. 使用原始 JSON 字节 HMAC 签名；
4. 发送到 `POST /api/ingest/v1/creator-bridge`；
5. AyaNews 只保存 allowlist 字段，不保存 Cookie 或请求头。

协议、大小限制、nonce 和验收步骤见 [CREATOR_SIDECAR.md](./CREATOR_SIDECAR.md)。

## 6. 热点与推荐如何判断

- Signal Topic 使用 `trend-v1`，综合新鲜度、速度、多来源、多平台和证据强度。
- Creator Post 使用 `creator-hotness-v1`，结合相同平台/垂类/年龄桶 peer 分位数与博主自身 30 天基线。
- 未公开的互动指标保存为 `null`，不会补成 0。
- 广告、转发、旧帖回流、低可信来源和证据缺失会留下可解释扣分。
- 多博主共题会按 canonical creator 去重；跨平台同步和转载网络不会被当成多个独立观点。
- 单来源或抽象、无法验证的题目会返回证据不足或低优先级，不会描述成“全网爆火”。

推荐效果的人工验收不是只看分数高低，还应抽查：对象是否具体、原链是否可打开、是否真的处于所选窗口、独立博主/平台计数是否成立，以及题目能否在目标内容形式中完成。

## 7. 开放 API 与 Agent 使用

### 7.1 发现入口

- OpenAPI：`/openapi.json`
- 网页 Skill：`/skill.md`
- Topic JSON Feed：`/topics/feed.json`
- Topic RSS：`/topics/rss.xml`
- 独立 Skill 仓库：[MarcusDog/AyaNewsSkill](https://github.com/MarcusDog/AyaNewsSkill)

MCP 与 A2A 当前没有上线，不得把规划能力描述成可用接口。

### 7.2 常用只读请求

```bash
curl 'http://localhost:3002/api/signals/v1/topics?window=72h'
curl 'http://localhost:3002/api/signals/v1/opportunities?window=48h&profile=tool-review'
curl 'http://localhost:3002/api/news/hot-rank?window=24h'
curl 'http://localhost:3002/api/news/discover?window=48h&profile=short-video'
curl 'http://localhost:3002/api/creators/v1/posts?q=Agent&vertical=ai-tech'
curl 'http://localhost:3002/api/creators/v1/hot?window=24h&type=cross_platform'
curl 'http://localhost:3002/api/creators/v1/topics?window=72h&vertical=beauty'
curl 'http://localhost:3002/api/creators/v1/changes?since=0'
```

Agent 应先检索再下结论，为关键事实保留原始 URL，区分发布时间与抓取时间；收到 410 时按响应中的 `resync` 重新读取列表，再从 `latest_cursor` 续读。

## 8. 推送、SSE 与 Webhook

订阅和端点要求登录。API 认证流程由 `/api/auth/register`、`/api/auth/login` 获取当前系统支持的会话/令牌；最简单的方式是直接在 `/alerts` 页面操作。

Webhook 必须：

- 使用 HTTPS；
- Secret 仅以 `secretRef` 保存，真实值来自服务端环境变量；
- 按 `timestamp + "." + raw_body` 验证 HMAC-SHA256；
- 对 `x-aya-delivery-id` 做幂等处理；
- 正确处理重试和乱序，不依赖“只投递一次”。

SSE `/api/creators/v1/stream` 首次连接只追踪当前末尾后的新事件；只有显式 `since` 或 `Last-Event-ID` 才回放。Nginx 必须对该精确路由关闭 buffering、cache 和 gzip。完整方案见 [CREATOR_ALERTS.md](./CREATOR_ALERTS.md)。

## 9. 数据、备份与维护

SQLite 默认路径由 `AINEWS_DB_PATH` 控制。不要通过删除生产数据库来解决抓取或页面问题。

维护使用 preview-first：

```bash
cd server
node scripts/creator-maintenance.js preview
node scripts/creator-maintenance.js execute PREVIEW_TOKEN
node scripts/creator-maintenance.js backup
node scripts/creator-maintenance.js export
```

建议：

1. 在维护前执行 online backup 并保存到独立目录；
2. 定期复制到加密的异机存储；
3. 做真实恢复演练和 SQLite `integrity_check`；
4. 只使用预览返回的单次 token 清理冻结范围；
5. 不把数据库、导出文件、生产观察名单或 Secret 提交到 Git。

人工执行完整每日刷新：

```bash
cd server
AINEWS_DB_PATH=./data/ainews.db npm run refresh:daily
```

刷新报告会分别记录 News、Signal 和 Creator 阶段；News 某个来源失败时仍继续构建热点与博主选题。`readiness` 必须至少包含 Signal Opportunity 或 Creator Topic，否则整轮标记为 `degraded`。同一进程内的重叠刷新返回 `refresh_in_progress`，不会并发写同一批数据。

## 10. 真实来源 Canary

上线或修改 Connector 后，用独立临时数据库运行：

```bash
node server/scripts/canary-creator-sources.js \
  --database /tmp/aya-creator-canary.db \
  --report /tmp/aya-creator-canary-report.json \
  --history-pages 3 \
  --verify-urls 20 \
  --request-budget 100
```

不要把 Canary 指向生产数据库，除非你明确希望它写入生产数据。验收至少检查：首次写入数、重复运行新增数、回填状态、HTTPS 原链可达率、来源失败原因和垂类分类。

## 11. 生产部署与上线验收

当前标准更新链路不再要求生产服务器连接 GitHub：

```bash
# 在开发/采集控制机执行
archive="$(./scripts/build-release.sh | tail -n 1)"
AYA_DEPLOY_HOST=YOUR_SERVER_IP \
AYA_DEPLOY_USER=YOUR_SSH_USER \
AYA_DEPLOY_KEY=/absolute/path/to/key \
AYA_DEPLOY_ROOT=/srv/ainews \
./scripts/upload-release.sh "$archive"

# 源码健康检查通过后，再合并本地内容数据
AYA_DEPLOY_HOST=YOUR_SERVER_IP \
AYA_DEPLOY_USER=YOUR_SSH_USER \
AYA_DEPLOY_KEY=/absolute/path/to/key \
AYA_DEPLOY_ROOT=/srv/ainews \
./scripts/upload-data-snapshot.sh server/data/local-production-ready.db
```

源码上传会先校验压缩包 SHA256 和逐文件清单，再解压到版本目录，通过 `current` 符号链接原子切换。`.env`、数据库、日志和缓存位于 `shared/server`，不随源码覆盖；健康检查失败时恢复上一个链接并重启旧版本。数据上传再次校验 SQLite SHA256，在容器内执行在线备份后只 UPSERT 内容表，明确保留用户、会话、订阅、事件与投递队列。服务器若暂时没有可用 SSH 身份，先在本机完成 `package`、假服务器激活和临时数据库合并验收，不能把“生成成功”误报为“已上传”。

```bash
cd client && npm ci && npm run build && cd ..
docker-compose up -d
```

生产必须配置 HTTPS、持久化 SQLite 卷、备份目录、`ADMIN_API_KEY`、允许的 CORS 域名以及实际启用来源的 Secret。Nginx 要对 `/openapi.json`、`/skill.md`、Feed、API 和 SSE 使用正确的精确代理规则。

上线后检查：

```bash
curl -fsS https://YOUR_DOMAIN/health
curl -fsS https://YOUR_DOMAIN/openapi.json
curl -fsS 'https://YOUR_DOMAIN/api/signals/v1/topics?window=24h'
curl -fsS 'https://YOUR_DOMAIN/api/creators/v1/hot?window=24h&type=post'
curl -fsS https://YOUR_DOMAIN/api/creators/v1/sources
```

再用桌面和移动浏览器手工完成：首页三窗口、随机换题、选题画像、研究反馈、垂类切换、原帖跳转、登录订阅、端点测试、错误态和空态。

## 12. 常见问题

| 现象 | 优先检查 |
|---|---|
| 24/48/72 看起来一样 | 对比每条 Topic 的证据数量与发布时间；确认已运行新采集和 Topic 重建 |
| 来源 `unconfigured` | 补充 API Key/OAuth/Bridge 地址或保留诚实未配置状态 |
| 来源 `rate_limited` | 等待限流恢复、降低请求预算、配置官方 Token；不要伪造在线 |
| 来源 `blocked` / `auth_expired` | 人工更新授权或 Sidecar 登录态，确认账号仍在核验名单 |
| 没有垂类热点 | 检查该垂类已启用账号数、最新成功时间、回填状态与分类证据 |
| 随机选题重复 | 确认前端与服务端都为当前版本，检查随机接口是否传递 `exclude` |
| 研究页证据不足 | 返回 Topic 补充独立来源，不用模型记忆补写事实 |
| 推送没有到达 | 检查端点 `unconfigured`、outbox、attempt、HTTP 状态、dead letter 和静默时段 |
| SSE 没有历史事件 | 首次连接设计为只追新；使用合法 `Last-Event-ID` 恢复 |
| 数据库异常 | 先备份、查看日志并运行完整性检查；不要直接删除数据库 |

## 13. 发布验收清单

- [ ] 服务端、客户端与 AyaNewsSkill 自动化测试通过
- [ ] 客户端生产构建通过
- [ ] `/openapi.json`、`/skill.md`、JSON Feed、RSS 返回 200
- [ ] 24/48/72 窗口按真实证据重算
- [ ] 主要 Signal 和 Creator 来源状态诚实、错误可解释
- [ ] 随机换题排除上一题，研究页有成功/不足/失败反馈
- [ ] 四垂类页面能显示真实帖子或明确空态
- [ ] 原始证据 URL 抽查可打开
- [ ] Webhook 签名、幂等、重试和 SSE 恢复已验收
- [ ] 备份、导出、保留清理和恢复演练已完成
- [ ] 仓库没有 Token、Cookie、测试密码、数据库或生产观察名单

本版本的完整交付证据见 [2026-08-29 Creator Intelligence 最终验证报告](./verification/2026-08-29-creator-intelligence-final-verification.md)。
