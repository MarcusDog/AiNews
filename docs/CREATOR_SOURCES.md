# Creator 来源、观察名单与历史回填

本文是 Aya Creator Intelligence 的运营手册。它只采集已人工核验观察名单账号的公开内容，不代表平台全部用户，也不会绕过私人、付费、删除、风控或平台历史窗口。

## 1. 状态含义

| 状态 | 可对外表达 | 不能表达 |
|---|---|---|
| `online` | 最近一次真实请求成功；零结果也可以是成功 | “这个平台今天一定有热点” |
| `partial` | 只取得平台允许的部分历史；响应保留原因和起止时间 | “全部历史已完成” |
| `blocked` | 权限、风控或登录态阻止继续读取 | “系统故障”或“已经在线” |
| `unconfigured` | 缺少密钥、OAuth、审批或 Bridge | “支持即在线” |
| `degraded` / `auth_expired` / `rate_limited` | 当前失败，但保留上次成功证据 | 用旧成功时间伪装本轮成功 |
| `complete` | cursor 耗尽并完成第二次 reconciliation | 只有第一页或一次 RSS 请求就写 complete |

`unknown` 互动指标保存为 `null`，不得补成 0。每条对外帖子必须有可打开的 HTTPS 原帖 URL。

## 2. 平台接入矩阵

| 层级 | 平台/方式 | 默认 | 运营输入 |
|---|---|---|---|
| L1 | YouTube Atom、Bluesky、Mastodon、GitHub、RSS | 可运行 | 核验账号 ID 与公开 profile URL |
| L2 | YouTube Data、Reddit、X、Instagram、抖音开放平台 | 未配置 | API key、OAuth、付费额度、审批或账号授权 |
| L3 | RSSHub、NewsNow | 未配置 | 自托管 HTTPS 服务与核验路由 |
| L4 | MediaCrawler、小红书 MCP、抖音/微博/B站登录态深挖 | 禁止由 Web 进程直接调度 | 独立 Sidecar、人工维护登录态和签名 Bridge |

TikTok Research API 需要单独证明研究资格，不是通用博主 Connector。没有运营授权时，来源页必须保持 `eligibility_required` 或 `unconfigured`。

## 3. 准备观察名单

复制示例到 Git 忽略的运营文件，并逐条核验：

```bash
cp server/config/creatorSeeds.example.json server/config/creatorSeeds.local.json
```

每个启用账号必须具备：

- 稳定平台账号 ID，而不是昵称搜索结果；
- 规范 HTTPS profile URL；
- `verified` 复核状态和时间；
- 至少一个垂类证据：`ai-tech`、`beauty`、`fashion`、`entertainment`；
- 明确平台、地区、来源等级和是否启用。

将 `AYA_CREATOR_SEEDS_PATH` 指向运营文件，或使用管理 API 导入。请求体就是完整 catalog JSON：

```bash
curl -X POST http://localhost:3002/api/creators/v1/admin/creators/import \
  -H 'Content-Type: application/json' \
  -H 'x-admin-api-key: YOUR_ADMIN_API_KEY' \
  --data-binary @server/config/creatorSeeds.local.json
```

禁止把 Cookie、Token、Bridge secret 或生产观察名单提交进 Git。

## 4. 来源诊断

先启动服务，再检查公开覆盖：

```bash
curl -s http://localhost:3002/api/creators/v1/sources
curl -s 'http://localhost:3002/api/creators/v1/creators?status=verified&limit=100'
curl -s 'http://localhost:3002/api/creators/v1/posts?vertical=ai-tech&limit=20'
```

逐来源核对：`configured`、`schedulable`、`status`、`lastSuccessAt`、`lastFailureCode`、已启用账号数、帖子数、最新帖子时间和回填状态。`configured=true` 不等于 `online`。

首次或人工增量刷新：

```bash
curl -X POST http://localhost:3002/api/creators/v1/admin/refresh \
  -H 'x-admin-api-key: YOUR_ADMIN_API_KEY'
```

系统默认把到期增量置于历史回填之前，并对账号加互斥锁和请求预算。一个来源失败不会取消其他来源。

## 5. 历史回填与续跑

查看状态：

```bash
curl -s 'http://localhost:3002/api/creators/v1/admin/backfills?limit=100' \
  -H 'x-admin-api-key: YOUR_ADMIN_API_KEY'
```

运行或恢复指定账号：

```bash
curl -X POST http://localhost:3002/api/creators/v1/admin/backfill \
  -H 'Content-Type: application/json' \
  -H 'x-admin-api-key: YOUR_ADMIN_API_KEY' \
  -d '{"accountId":"ACCOUNT_ID","force":false}'
```

每页帖子和 cursor 在同一 SQLite 事务提交；重启后从已提交 cursor 继续。重复页面按稳定平台帖子 ID 幂等，不重复插入。历史页不会触发“新帖”推送；只有增量或真实阈值跨越产生事件。

只有 cursor 耗尽后再次 reconciliation 仍无遗漏，状态才可进入 `complete`。RSS/Atom 没有完整分页时应是 `partial`；401/403/风控应是 `blocked` 或 `auth_expired`。

## 6. 公开查询

```bash
curl -s 'http://localhost:3002/api/creators/v1/posts?q=Agent&vertical=ai-tech&limit=20'
curl -s 'http://localhost:3002/api/creators/v1/hot?window=24h&type=post&vertical=ai-tech'
curl -s 'http://localhost:3002/api/creators/v1/topics?window=72h&vertical=beauty'
curl -s 'http://localhost:3002/api/creators/v1/changes?since=0'
```

`cursor` 是与规范化查询绑定的不透明 keyset cursor，不能解析、修改或跨筛选复用。`changes` 使用单调 `seq`；返回 410 时按响应中的 `resync` 重新读取，再从 `latest_cursor` 继续。

完整契约见 `/openapi.json`，人类页面见 `/creators`、`/verticals/:id` 与 `/sources`。
