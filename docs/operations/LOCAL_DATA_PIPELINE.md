# 本地采集与生产数据快照

当生产服务器 DNS、出口或平台限流导致采集不稳定时，本地工作站作为采集控制面。它从已有 SQLite 做在线备份，在副本中迁移 schema、导入核验博主、刷新公开帖子与 Signal、重建热点，然后通过单独的数据同步流程交付；不会直接修改源数据库。

```bash
export AYA_DATASET_SOURCE_DB=/absolute/path/to/ainews.db
export AYA_DATASET_TARGET_DB="$PWD/server/data/local-production-ready.db"
export AYA_DATASET_REPORT="$PWD/server/data/reports/local-production-ready.json"
export AYA_CREATOR_SEEDS_PATH="$PWD/server/config/creatorBenchmarks.json"
export AYA_SOURCE_PROXY_URL=http://127.0.0.1:7897   # 需要时设置，不要写入仓库
export AYA_SOURCE_NETWORK_MODE=proxy-only           # 代理可用时推荐

node server/scripts/build-local-dataset.js
node server/scripts/report-dataset.js "$AYA_DATASET_TARGET_DB"
```

构建门槛：News 不少于 10,000、核验 Creator/Account 均不少于 100、Creator Post 非零、四垂类均有帖子、抽样新闻原链均为无凭据安全 HTTP(S)、Creator 原链为 HTTPS、SQLite `integrity_check=ok`。失败时保留源库和现有目标库，新的工作副本不会冒充可发布数据集。

数据快照和 WAL/SHM 均在 Git 忽略范围，不能提交到 GitHub。可提交的 JSON 报告只包含聚合数量、时间范围、来源状态和数据库 SHA256，不包含 Cookie、Token、私有 cursor 或用户内容。

## 持续刷新

```bash
cd server
AINEWS_DB_PATH="$PWD/data/local-production-ready.db" \
AYA_CREATOR_SEEDS_PATH="$PWD/config/creatorBenchmarks.json" \
npm run refresh:daily
```

每日刷新对 News、Signal 和 Creator 分阶段隔离，最终检查推荐是否仍有 Signal Opportunity 或 Creator Topic。报告默认保存到 `server/logs/daily-refresh-latest.json`；可用 `AYA_DAILY_REPORT` 改到持久目录。

## 直接同步到生产

先上传并激活源码版本，确保容器内已有 `merge-content-snapshot.js`，然后在项目根目录执行：

```bash
AYA_DEPLOY_HOST=YOUR_SERVER_IP \
AYA_DEPLOY_USER=YOUR_SSH_USER \
AYA_DEPLOY_KEY=/absolute/path/to/key \
AYA_DEPLOY_ROOT=/srv/ainews \
./scripts/upload-data-snapshot.sh server/data/local-production-ready.db
```

脚本会校验上传前后的 SHA256，并在正在运行的后端容器内调用 SQLite 合并器。合并器先在线备份生产数据库，只更新内容表；`users`、登录会话、偏好/收藏/阅读记录、Creator 订阅、端点、事件、outbox、attempt 和联系方式均不从本地快照覆盖。合并报告保存在生产共享日志目录，健康检查失败时命令返回失败，备份仍保留供人工恢复。
