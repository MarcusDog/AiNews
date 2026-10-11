# AyaNews 跨垂类创作者情报规格

日期：2026-08-28

## 产品定义

AyaNews 从“AI 新闻与热点站”扩展为“跨垂类创作者情报站”。用户选择美妆、穿搭、AI 科技、娱乐等板块后，可以看到：观察名单博主今天发了什么、哪条内容相对其自身表现正在爆发、哪些问题被多位博主同时讨论、主题如何跨平台扩散，以及可以立刻制作的带证据选题。

系统只展示已经成功采集并可回查的公开内容。平台能力、登录状态、配额与失败必须真实可见。

这里的“全部博主内容”限定为：观察名单中已核验账号在平台/API/Bridge 当前可访问范围内的全部公开历史，以及之后持续发布的公开内容。系统不宣称覆盖平台上的所有账号，也不宣称能够恢复私人、付费、已删除或超出平台历史窗口的内容。

## 用户故事

1. 作为创作者，我可以选择一个垂类，查看最近 24/48/72 小时的博主帖子和热点主题。
2. 我可以查看某个博主在各平台的稳定账号、最新内容和相对其自身基线的爆款。
3. 我可以看到“单博主爆款”“多博主共题”“跨平台扩散”三种不同信号。
4. 我可以把主题转为选题，查看原帖证据、目标受众、内容形式、切口和风险。
5. 我可以订阅一个垂类、平台、博主或最低热度阈值，并通过站内、Webhook 或消息渠道收到不重复通知。
6. 作为运营者，我可以导入/审核博主名单、触发回填、检查来源健康、登录过期、配额和投递失败。

## 非目标

- 不承诺访问任何私人、好友可见、付费或被删除内容；
- 不自动绕过验证码、不自动取得 Cookie、不使用主账号做登录态采集；
- 不默认保存或再次分发完整图片、视频和受版权保护的全文；
- 不把一次能运行的非官方爬虫称为生产级官方接口；
- 不在第四阶段同时迁移 PostgreSQL；MVP 保持单机 SQLite。

## 领域模型

### Vertical

```json
{
  "id": "beauty",
  "name": "美妆",
  "enabled": true,
  "keywords": ["护肤", "彩妆"],
  "negativeKeywords": ["游戏皮肤"],
  "createdAt": "ISO-8601"
}
```

### Creator

```json
{
  "id": "stable-local-id",
  "displayName": "博主名称",
  "kind": "person|brand|media",
  "verticalIds": ["beauty"],
  "reviewStatus": "verified|candidate|rejected",
  "reviewedAt": "ISO-8601|null"
}
```

### CreatorAccount

```json
{
  "id": "stable-account-id",
  "creatorId": "stable-local-id",
  "platform": "youtube",
  "externalAccountId": "UC...",
  "handle": "@creator",
  "profileUrl": "https://...",
  "region": "cn|global",
  "sourceTier": "L1|L2|L3|L4",
  "enabled": true,
  "lastVerifiedAt": "ISO-8601",
  "authState": "not_required|ready|expired|unconfigured",
  "backfillState": "pending|running|complete|partial|blocked",
  "oldestFetchedAt": "ISO-8601|null",
  "newestFetchedAt": "ISO-8601|null",
  "lastReconciledAt": "ISO-8601|null",
  "nextCursor": "opaque|null",
  "historyLimitReason": "string|null"
}
```

### CreatorPost

```json
{
  "id": "stable-post-id",
  "accountId": "stable-account-id",
  "platform": "youtube",
  "externalPostId": "video-id",
  "url": "https://...",
  "title": "原始标题",
  "text": "允许保存的正文或摘要",
  "contentType": "video|image|article|short|thread|repository",
  "publishedAt": "ISO-8601",
  "collectedAt": "ISO-8601",
  "editedAt": null,
  "deletedAt": null,
  "language": "zh-CN",
  "verticalIds": ["ai-tech"],
  "sourceConfidence": "official|public|bridge",
  "provenanceUrl": "https://..."
}
```

### MetricSnapshot

```json
{
  "postId": "stable-post-id",
  "capturedAt": "ISO-8601",
  "views": null,
  "likes": 1200,
  "comments": 88,
  "shares": null,
  "bookmarks": null,
  "platformRank": null,
  "followersAtCapture": 42000
}
```

缺失值必须是 `null`。平台未公开的转发数不能写成 0。

## 来源等级

- L1：无需凭据的官方公开协议/API/RSS；默认调度。
- L2：官方 API Key/OAuth/付费计划；配置后调度。
- L3：自托管 RSSHub、NewsNow 或签名 JSON Bridge；配置后调度。
- L4：登录态浏览器/MCP/CLI Sidecar；主服务绝不启动，只接收签名结果。

L4 请求必须包含 `x-aya-source-id`、`x-aya-timestamp`、`x-aya-nonce` 和 `x-aya-signature`。签名内容是 `timestamp + '.' + nonce + '.' + sha256(body)`，服务器拒绝超过五分钟、重复 nonce、未知 source ID、无效 schema 或无效 HMAC 的请求。

Bridge 必须在全局 JSON parser 之前以 `express.raw({ type: 'application/json' })` 读取原始字节，签名验证成功后才允许 JSON 解码；摘要基于原始字节而不是重新序列化后的对象。HMAC 使用常量时间比较。每个 `source_id` 在来源目录中绑定允许的平台和已核验 `external_account_id` 集合，Sidecar 不得借有效密钥替其他平台或未授权账号写入数据。

签名、账号 allowlist 与 schema 全部通过后，服务器可以把**允许字段白名单化**的载荷写入 `creator_bridge_payloads`，并通过 `creator_bridge_payload_posts` 关联本次 `creator_run` 和落库帖子。该表只保存来源 ID、run ID、接收时间、原始字节 SHA256、条数和由 normalizer 重新构造的公开字段；不保存 HTTP headers、Cookie、Authorization、Token、secret、签名或未知 raw 字段。payload 默认 30 天后删除，关联表随 payload 级联删除，帖子本身按独立 365 天规则保留。

### YouTube WebSub

- `GET /api/ingest/v1/youtube/websub` 验证 hub challenge、topic 与观察名单频道；未知 topic 返回 404；
- `POST /api/ingest/v1/youtube/websub` 使用该订阅保存的 secret 校验 `X-Hub-Signature`/`X-Hub-Signature-256`，再解析 Atom；
- `(channel_id, video_id, updated_at)` 幂等，重复回调不会重复建帖或重复通知；
- 保存 lease 到期时间并在到期前续订；退订、签名失败与过期 lease 可观测；
- WebSub 用于新视频低延迟通知，Data API/Atom 轮询继续负责漏报修复、历史回填与指标补充。

## 采集流程

1. Scheduler 按 source/account cursor 选出到期任务；
2. Connector 拉取增量内容，不在网络请求阶段写数据库；
3. Normalizer 校验账号、外部帖子 ID、URL、发布时间与可空指标；
4. 同一事务 upsert post、append metric snapshot、更新 cursor 和 run；
5. Vertical classifier 输出规则证据和模型证据；模型失败回退规则；
6. Hotness engine 读取快照与博主基线，更新帖子分；
7. Topic engine 聚类同题帖子并计算独立博主/平台扩散；
8. Event detector 仅对首次跨阈值生成事件；
9. Outbox worker 过滤订阅并投递；
10. 页面和 changes/SSE 从持久化事件读取，不依赖进程内临时状态。

cursor 只在帖子和快照事务成功后前移。历史回填不触发“新帖”通知，但可以触发明确标记为 `backfill_recalculated` 的离线重算。

所有可能产生通知的状态生产者必须经 `CreatorStore.applyCreatorStateChange(...)`：同一 SQLite transaction 先读取旧状态、写入新帖子/分数/Topic 快照，再运行纯 `creator-event-detector` 比较前后状态，并插入稳定 event 与匹配订阅的 outbox。事件唯一键包含 event type、实体 ID、公式/阈值版本和 transition bucket；同一状态重试不会重复，状态写入、event 或 outbox 任一步失败则整笔回滚。采集器、Hotness 和 Creator Topic engine 不得绕开该入口直接提交可触发事件的状态。

### 历史回填状态机

```text
pending → running → complete
              ├──→ partial   （API 历史窗口、配额或权限限制）
              └──→ blocked   （登录过期、验证码、风控或连续失败）
partial/blocked → running     （限制解除后从持久 cursor 继续）
```

- `complete` 需要 cursor 耗尽、第二遍从最新页 reconciliation 完成、抽样原帖一致；
- 回填与实时增量并行时，实时任务优先，回填使用独立 cursor，最终按外部帖子 ID 合并；
- 每个账号设置平台级速率预算和最大页数，但预算耗尽只暂停本轮，不能伪装成完成；
- 管理页面展示完成比例、最早/最新帖子、最后成功页、预计剩余页和明确的限制原因；
- 每日对最新 100 条做轻量 reconciliation，识别编辑、删除或指标回补。

## 垂类规则

首发 `beauty`、`fashion`、`ai-tech`、`entertainment`。规则配置可热加载但必须版本化。分类输出：

```json
{
  "verticalId": "beauty",
  "score": 0.94,
  "version": "vertical-v1",
  "reasons": ["keyword:护肤", "creator-seed:beauty"],
  "reviewRequired": false
}
```

博主种子归属提供先验，不得覆盖明显不相关的帖子。低于 0.65 的内容进入 `uncategorized`；0.65–0.79 可显示但标记低置信；高风险误判词使用负向规则。

## Hotness v1

先在每个平台、垂类、发布时间年龄桶内计算百分位，再组合：

```text
postHotness =
  0.25 * engagementVelocityPercentile +
  0.15 * engagementAccelerationPercentile +
  0.20 * creatorRelativePerformance +
  0.15 * independentCreatorAdoption +
  0.10 * crossPlatformSpread +
  0.10 * freshness +
  0.05 * evidenceCompleteness
  - penalties
```

- `creatorRelativePerformance`：相同发布年龄下，相对该账号最近 30 天帖子中位数；
- `independentCreatorAdoption`：同垂类 6/24 小时独立 canonical creator 数；
- `crossPlatformSpread`：同题独立平台数，不把同一创作者的多平台同步当成多人采用；
- `penalties`：广告/搬运、单账号重复、缺失关键指标、低可信 Bridge 与疑似旧帖回流；
- 公式版本固定为 `creator-hotness-v1`，所有输入与分项入库。

事件阈值：

- 单博主爆款：`postHotness >= 75` 且相对自身基线 `>= 2.0x`；
- 多博主共题：6 小时 3 位或 24 小时 5 位独立博主；
- 跨平台扩散：24 小时至少 2 个平台、3 位独立博主；
- 分数跃升：同一帖子较上次快照增加至少 15 分。

## 查询 API

### 搜索与游标契约

`creator_posts_fts` 使用 FTS5 索引允许保存的 `title` 与 `text`，与 `creator_posts` 在同一事务 upsert/delete。`GET /posts` 和 `GET /topics` 接受可选 `q`（1–200 个 Unicode 字符）；输入只作为 FTS 参数绑定，不直接拼接 SQL。无 `q` 时按 `(published_at DESC, id DESC)`；有 `q` 时按 `(bm25 ASC, published_at DESC, id DESC)`。不透明 cursor 包含规范化查询 hash、最后 bm25、发布时间和 ID；换查询或过滤器复用旧 cursor 返回 400。

公开只读：

- `GET /api/creators/v1/verticals`
- `GET /api/creators/v1/creators?vertical=&platform=&status=&cursor=&limit=`
- `GET /api/creators/v1/creators/{id}`
- `GET /api/creators/v1/creators/{id}/posts?since=&cursor=&limit=`
- `GET /api/creators/v1/posts?vertical=&platform=&creator=&since=&hot=&q=&cursor=&limit=`
- `GET /api/creators/v1/hot?vertical=&window=24h|48h|72h&type=post|multi_creator|cross_platform`
- `GET /api/creators/v1/topics?vertical=&window=&q=&cursor=&limit=`
- `GET /api/creators/v1/topics/{id}`
- `GET /api/creators/v1/sources`
- `GET /api/creators/v1/changes?since=&limit=`
- `GET /api/creators/v1/stream`（SSE，认证用户）

认证用户：

- `GET/POST/PATCH/DELETE /api/creators/v1/subscriptions`
- `GET/POST/PATCH/DELETE /api/creators/v1/delivery-endpoints`
- `POST /api/creators/v1/delivery-endpoints/{id}/test`

管理/接入：

- `POST /api/creators/v1/admin/creators/import`
- `POST /api/creators/v1/admin/refresh`
- `POST /api/creators/v1/admin/backfill`
- `GET /api/creators/v1/admin/backfills?state=&platform=&cursor=&limit=`
- `POST /api/creators/v1/admin/maintenance/preview`
- `POST /api/creators/v1/admin/maintenance/execute`
- `POST /api/creators/v1/admin/export`
- `POST /api/creators/v1/admin/backup`
- `GET/POST /api/ingest/v1/youtube/websub`
- `POST /api/ingest/v1/creator-bridge`

所有列表必须 cursor 分页；响应带 `generatedAt`、`sourceCoverage`、`formulaVersion` 和证据边界。

选题画像继续使用现有公开枚举：`general`、`short-video`、`tool-review`、`news-commentary`、`deep-dive`。Creator API、旧 Signal Opportunity、前端与 AyaNewsSkill 使用同一值；不新增不兼容的 `review` 别名。

### Changes 与 SSE 恢复

`creator_events.seq` 是 SQLite `INTEGER PRIMARY KEY AUTOINCREMENT` 的单调游标，稳定事件 ID 另设唯一列。帖子/Topic 状态变化、event 和 outbox 在同一事务写入；只有事务提交后的 seq 才能对外可见。

- `GET /changes?since=<seq>` 按 seq 升序返回，meta 提供 `next_cursor`、`oldest_cursor`、`latest_cursor`；
- 请求早于保留窗口的 seq 返回 HTTP 410、`cursor_expired` 和按当前过滤器构造的 `resync` URL；
- SSE 接受 `Last-Event-ID` 或 `since`，事件的 `id:` 等于 seq，每 15 秒 heartbeat；重连先回放持久事件再切到实时通知；
- SSE 过滤器与普通查询相同，未经认证的用户不能读取私人订阅；慢客户端断开后可用最后 seq 恢复；
- change/event 游标至少保留 30 天，删除前先保证当前最小游标可见，不能静默跳过缺口。

## 推送

订阅条件：垂类、平台、博主、事件类型、最低 Hotness、静默时段、即时或日报。投递端点：

1. 站内 SSE/Socket.IO；
2. 通用签名 Webhook；
3. 邮件；
4. 飞书、企业微信、钉钉、Telegram；
5. ntfy/Bark 作为个人设备轻量推送。

Outbox 至少一次投递，`event_id + subscription_id + endpoint_id` 为幂等键。2xx 成功；429 读取 `Retry-After`；5xx/网络错误指数退避；4xx 非 429 进入 dead letter。凭据只从环境变量或加密 secret reference 读取，绝不回显。

Webhook 只允许 `https://` 且使用 443 或部署白名单端口，默认禁止重定向。每次连接（包括重试）都重新解析 DNS，并在连接前拒绝 IPv4/IPv6 loopback、RFC1918/private、link-local、ULA、multicast、保留网段和云 metadata 地址；HTTP 客户端必须把已校验 IP 固定到本次连接并校验证书 hostname，防止 DNS rebinding。响应体有严格上限，超时与最大并发可配置；IP literal、userinfo URL 与非标准 scheme 默认拒绝。

## 前端信息架构

- `/creators`：四垂类入口、今日新帖、单博主爆款、多博主共题、跨平台扩散；
- `/creators/{id}`：跨平台账号、最近帖子、基线、爆款时间线；
- `/verticals/{id}`：垂类热榜、博主矩阵、常见问题、内容形式和平台分布；
- `/alerts`：订阅规则、投递端点、最近成功/失败和测试按钮；
- `/sources`：真实账号覆盖、最后帖子、配额、auth expiry、cursor 与 canary。

每张热点卡必须能打开原帖，展开公式输入，并明确数据窗口。不能只显示 AI 摘要。

## 数据保留与备份

- 帖子公开元数据默认 365 天；
- 白名单化的 Bridge payload 默认 30 天；`creator_bridge_payloads` 删除时级联清理 `creator_bridge_payload_posts`，不影响帖子；
- 72 小时内细粒度快照，之后压缩为日快照，默认保留 180 天；
- outbox 成功记录 30 天，失败/dead letter 90 天；
- maintenance preview token 与审计记录 90 天；preview token 单次使用且过期后不可执行；
- 使用 SQLite online backup，提供 JSONL 导出；
- 清理必须先 preview，按明确表和时间范围执行，不能用宽泛路径删除。

运维动作必须写入审计记录。`maintenance/preview` 返回逐表候选行数、最早/最新时间和不可逆影响，不修改数据；`execute` 必须携带未过期的 preview token，且只删除 token 中冻结的明确表/时间边界。在线备份必须通过 SQLite backup API 生成到配置目录，随后以只读方式打开并执行 integrity check。JSONL 导出使用一致性读事务，包含 schema/version/时间范围，不导出 Cookie、Token、请求 headers 或 secret reference 的值；导出文件路径必须限定在配置的导出目录。

## 发布门槛

首个可发布版本至少完成 YouTube、Bluesky、Mastodon、GitHub、RSS、Reddit OAuth 与通用 Sidecar Bridge；X、Instagram、抖音官方连接器可以保持配置后启用。小红书/任意抖音/微博/B站登录态源必须在本机 canary 连续 24 小时后，才可在 UI 标为可用。

上线时先使用 4 个垂类、每垂类 20–30 个核验博主；只有来源成功率、身份准确率、分类准确率、重复率和推送成功率达到审计文档门槛后再扩容。
