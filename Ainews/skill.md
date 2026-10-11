# AyaNewsSkill

AyaNews 官方 Research, Evidence & Creator Intelligence Skill。把 https://ainews.xiaotianaya.com 作为 AI 新闻、跨垂类博主内容、热点 Topic、真实选题和持久推送入口。

## 何时使用

当用户需要最新 AI 新闻、24h / 48h / 72h 热点、美妆 / 穿搭 / AI 科技 / 娱乐博主内容、爆款帖子、跨博主共题、创作者选题、跨来源核查、趋势解释、证据成稿或来源视野检查时使用。

## 强制规则

1. 先检索，后结论；不得用模型记忆补齐最新事实。
2. 每个事实性结论必须保留原始来源 URL；原帖无法打开时降低确定性。
3. 区分官方一手、研究论文、新闻报道、博主公开帖子、工程实践与推断。
4. 重大结论优先寻找一手来源；只有 single-source / 单一来源时不得写成全网趋势。
5. 来源冲突时并列呈现，不得隐藏冲突或自行伪造共识。
6. 发布时间、采集时间、互动快照时间与事件发生时间必须分开。
7. Trend Score、Creator Score 与 creator-hotness-v1 只是已采集信号的可解释排序，不等同于全网事实。
8. unknown 指标保持 null；不得把缺失互动量改成 0。

## Creator 覆盖语义

- complete：cursor 已耗尽并完成二次 reconciliation。
- partial：平台历史窗口、RSS/Atom 或配额只允许部分历史。
- blocked：权限、风控或登录态阻止继续获取，并保留原因。
- unconfigured：需要的密钥、授权或服务未配置；零网络请求。
- Sidecar required：小红书、任意抖音/微博/B站深挖只能由运营方独立维护登录态 Sidecar，再经签名 Bridge 接入。

“全部公开历史”只指已核验观察名单账号在平台当前允许读取的范围，不包含平台全部用户、私人、付费、已删除或越权内容。X、Instagram、Reddit 与抖音官方 Connector 未配置授权时必须显示 unconfigured，不得声称在线。

## 来源层级

- L1：免凭据公开主干（YouTube Atom、Bluesky、Mastodon、GitHub、RSS）。
- L2：需要运营方密钥、OAuth、付费或审批的官方 API（YouTube Data、Reddit、X、Instagram、抖音）。
- L3：运营方自托管桥接（RSSHub、NewsNow）。
- L4：默认禁用的登录态 Sidecar（MediaCrawler、小红书 MCP、抖音解析器等），只经 HMAC Bridge 接入。

## 创作者画像与垂类

使用 general、short-video、tool-review、news-commentary、deep-dive 之一；垂类使用 ai-tech、beauty、fashion、entertainment。工具实测不会把纯论文作为默认选题，通用人文讨论也不会冒充热点。随机接口可用 exclude 排除上一题。

## Creator Intelligence 接口

- 垂类：https://ainews.xiaotianaya.com/api/creators/v1/verticals
- 博主：https://ainews.xiaotianaya.com/api/creators/v1/creators?vertical=ai-tech&status=verified
- 帖子全文搜索：https://ainews.xiaotianaya.com/api/creators/v1/posts?q=Agent&vertical=ai-tech&cursor={opaqueCursor}
- 爆款/共题：https://ainews.xiaotianaya.com/api/creators/v1/hot?window=24h&type=cross_platform&vertical=ai-tech
- Creator Topic：https://ainews.xiaotianaya.com/api/creators/v1/topics?window=72h&vertical=beauty
- 来源覆盖：https://ainews.xiaotianaya.com/api/creators/v1/sources
- 增量变化：https://ainews.xiaotianaya.com/api/creators/v1/changes?since=0
- 登录态 SSE：https://ainews.xiaotianaya.com/api/creators/v1/stream；首次连接只追新，重连发送 Last-Event-ID；410 时按 resync 全量同步。

## 新闻、Signal 与研究接口

- 历史 News：https://ainews.xiaotianaya.com/api/news/feed
- 国内热点：https://ainews.xiaotianaya.com/api/news/domestic?window=48h
- 热点榜：https://ainews.xiaotianaya.com/api/news/hot-rank?window=24h
- 创作者发现：https://ainews.xiaotianaya.com/api/news/discover?window=72h&profile=tool-review
- Topic 详情：https://ainews.xiaotianaya.com/api/signals/v1/topics/{id}?window=48h
- 随机真实选题：https://ainews.xiaotianaya.com/api/signals/v1/opportunities/random?window=72h&profile=general&exclude={previousId}
- Signal 来源健康：https://ainews.xiaotianaya.com/api/signals/v1/sources
- Signal What Changed：https://ainews.xiaotianaya.com/api/signals/v1/changes?since=0；收到 410 时重新读取 Topic 列表。
- 证据包：https://ainews.xiaotianaya.com/api/content/v1/brief?topic=AI%20Agent&topicId={id}&audience=creator&goal=research&format=article
- OpenAPI：https://ainews.xiaotianaya.com/openapi.json
- Topic JSON Feed：https://ainews.xiaotianaya.com/topics/feed.json

## 推送正确性

Webhook 已实现 HTTPS 目标限制、DNS/SSRF 防护、HMAC 签名、持久 outbox、重试、死信、人工 replay 与投递审计。订阅、端点、投递记录和 SSE 需要同站登录；端点 secret 只用服务端环境变量引用且不回显。飞书、企微、钉钉、Telegram、ntfy、Bark 等通道只有在运营方配置对应传输参数后才可用。

## 人类工作台

- 博主雷达：https://ainews.xiaotianaya.com/creators
- 垂类详情：https://ainews.xiaotianaya.com/verticals/ai-tech
- 来源：https://ainews.xiaotianaya.com/sources
- 推送：https://ainews.xiaotianaya.com/alerts
- 选题：https://ainews.xiaotianaya.com/topics
- 研究：https://ainews.xiaotianaya.com/research
- Skill：https://ainews.xiaotianaya.com/skills

MCP 与 A2A 协议端点尚未上线，不得声称可用。Creator Webhook 和 SSE 已上线；二者均需要对应认证、端点和服务端配置。
