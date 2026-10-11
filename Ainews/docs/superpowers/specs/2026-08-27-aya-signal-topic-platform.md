# Aya Signal / Topic / Creator Intelligence 规格

## 产品目标

把 AyaNews 从 RSS 新闻聚合站升级为面向 AI 小白、自媒体创作者和研究者的多源热点发现与选题平台。核心对象从 News 迁移为 Topic，但保留现有 News API 兼容性。

## 必须完成

1. 建立统一 Signal 数据模型、持久化、去重和来源健康状态。
2. 默认采集现有新闻 RSS，以及 HN、GitHub、Mastodon、Reddit RSS、Hugging Face、Bilibili 的真实公开数据。
3. 为 YouTube、X、RSSHub、NewsNow、MediaCrawler/自定义服务提供显式可选连接器；没有凭据或桥接地址时显示未配置，不报成在线。
4. 将 Signal 聚类为 Topic，输出 24/48/72h 趋势、证据强度、评分明细和变化摘要。
5. 输出创作者机会：适合受众、内容角度、为什么现在做、风险/不确定性、原始证据。
6. 提供热点、Topic 详情、随机选题、来源目录/健康、增量变化、OpenAPI、JSON Feed/RSS 等真实开放接口。
7. 在现有电影感首页后增加“视野监测台”，展示真实热点、升温项、GitHub 项目、国内/国外信号、来源状态和随机选题。
8. 更新 AyaNewsSkill 文档，使 Agent 明确证据约束、来源边界和接口用法。
9. 使用测试优先实现，并完成单元、路由、数据库、构建、真实端点探测和 Chrome QA。

## 不得伪造

- 不把演示数据或固定文案用于公开热点 API。
- 不生成不存在的 views、likes、stars、平台数或热度变化。
- 单来源 Topic 必须标记证据较弱。
- 未配置的密钥/桥接源必须报告 `unconfigured`。
- 某次抓取失败不能抹去历史成功数据，但必须更新 `last_error`。

## 来源分层

- L1 默认主干：现有 RSS、HN、GitHub、Mastodon、Reddit RSS、Hugging Face、Bilibili。
- L2 可选官方 API：YouTube、X、GitHub Token。
- L3 自托管桥接：RSSHub、NewsNow、通用 JSON Bridge。
- L4 深挖 Sidecar：MediaCrawler、Agent-Reach/OpenCLI；默认关闭，不存 Cookie。

完整来源依据见 `docs/research/2026-08-27-ai-signal-source-audit.md`。

## 兼容性与安全

- 不破坏 `/api/news/*`、`/api/content/v1/*`、`/skill.md`、`/openapi.json`、`/feed.json`、`/rss.xml`。
- 新接口位于 `/api/signals/v1`。
- 仅管理端刷新接口允许写入，受现有管理密钥保护；公开接口只读。
- 用户现有未提交工作全部保留，不自动提交 Git。
- 所有外部请求必须有超时、User-Agent、有限并发、错误隔离和来源级健康记录。

## 完成定义

- 空库能够初始化并完成一次 L1 抓取；失败源不会阻塞成功源。
- 至少一个真实来源产生 Signal 时，Topic/机会/API/前端能端到端显示真实 URL 和时间。
- 没有可用源时返回诚实空状态，不返回演示热点。
- 新老测试、TypeScript、Vite build、静态安全与浏览器 QA 全部通过。
