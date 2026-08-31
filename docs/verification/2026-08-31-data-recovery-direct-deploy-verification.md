# 2026-08-31 数据恢复、持续采集与直接上传验收

## 结论

本地生产候选已达到数据门槛并可持续刷新：News 超过 10,000 条、已核验博主超过 100 位；Signal、Creator 帖子、热点 Topic、随机选题、研究证据包和开放接口均由真实持久化数据驱动。生产更新链路已改为“本地构建与校验 → SHA256 源码包/数据快照 → SSH/rsync 直接上传 → 原子切换 → 健康失败自动回滚”，不再要求服务器从 GitHub 拉取。

服务器当前仍拒绝本机已有 SSH 身份，因此本报告不把“代码已上线”列为完成。拿到可用的 SSH 用户/私钥后，使用 `scripts/upload-release.sh` 与 `scripts/upload-data-snapshot.sh` 即可执行同一套已测试流程。

## 当前数据快照

数据文件：`server/data/local-production-ready.db`（运行产物，不提交 Git）。

| 数据 | 实际数量 |
|---|---:|
| News | 10,620 |
| 有效 News | 10,596 |
| Signal | 341 |
| Signal Topic | 273 |
| Creator | 121 |
| Creator Account | 121 |
| Creator Post | 1,809 |
| Creator Score | 1,084 |
| Creator Topic | 229 |

四垂类覆盖：AI 科技 32 位/413 帖，美妆 29 位/234 帖，娱乐 31 位/438 帖，穿搭 29 位/324 帖。最新抽查 100 条 News 均为安全 HTTP(S) 原链，其中 99 条 HTTPS；最新 100 条 Creator Post 为 100/100 HTTPS 原链。SQLite 报告 SHA256 为 `e92c3b23f8536e87e66b1ffb1f90f518a55b673002733a2b7044032c77db1eec`。

## 真实刷新结果

2026-08-30/31 完整刷新：

- News：154 个调度来源成功，0 个错误；
- Signal：收到并写入/更新 176 条，0 个来源错误，重建 265 个当次 Topic；
- Creator：100 个到期账号增量采集全部成功；
- 推荐门禁：9 个 Signal Opportunity、229 个 Creator Topic，可继续生成真实选题；
- 国内 Signal：修复元数据后由 0 恢复为 13；国内接口返回 24h 3 条、48h/72h 至少 10 条。

Signal 来源目录实测为 20 项：9 online、9 unconfigured、2 disabled。online 包括 legacy News、Bilibili（接口在线但当前 AI 过滤结果为 0）、GitHub、Hacker News、Hugging Face、Mastodon 与 3 个 Reddit 社区。X、YouTube Search、RSSHub/NewsNow/JSON Bridge 等缺少 Token 或自托管地址时保持 unconfigured；登录态 Sidecar 保持 disabled，不伪装成在线。

Creator 来源目录为 10 类：YouTube Atom 为 online（121 账号、1,809 帖）；Bluesky、Mastodon、GitHub、RSS 连接器已实现但本快照没有绑定观察账号；Reddit、X、Instagram、抖音官方 Connector 缺授权时为 unconfigured；TikTok Research API 明确标记 eligibility required。

## 本轮修复

1. 发布输入改用官方 npm registry；Compose 镜像在构建期安装依赖，不在生产启动时联网安装。
2. 新增可校验源码发布包、直接上传、原子激活、数据快照 SHA 校验合并与回滚脚本。
3. News、Signal、Creator 公共连接器统一支持显式代理/直连策略、有界重试、错误分类和脱敏诊断；修复 Reddit 适配器未复用导致的匿名 429。
4. 121 位 YouTube 观察账号逐一核验稳定频道 ID；修复 Daniel Simmons 同名错误频道。
5. 新增隔离式 Daily Refresh 与推荐就绪门禁，阶段失败互不阻断；修复 Creator 同日重复追加评分。
6. legacy News 导入 Signal 时保留可信的 `region/language`，并允许后续采集修正已存在 Signal 的 region。
7. `/api/news/domestic` 先扫描完整 Topic 再筛选国内证据，避免全球前 100 项挤掉国内结果。
8. 全局 API 限流由固定 60/min 改为可配置的默认 300/min；内容生成继续保留 8/10min 的独立严格限流。80 个连续只读请求全部返回 200，随后研究请求返回证据不足 422 而不是错误 429。
9. Vite 开发代理支持 `AINEWS_DEV_API_ORIGIN`，便于在不占用用户现有 3002 端口的情况下做隔离 QA。

## 页面与接口验收

桌面浏览器真实打开：首页、`/topics`、`/research`、`/creators`、四个 `/verticals/*`、`/sources`、`/alerts`、`/skills`。随机换题两次 Topic ID 不同；研究页能显示原始证据及证据不足边界；来源页区分 online/configured/unconfigured/disabled；推送页未登录时显示真实认证入口。

公开接口实测 HTTP 200：`/api/news/latest`、六个 News 聚合路由、Signal Topic/Opportunity、Creator/帖子/Topic、`/openapi.json`、`/topics/feed.json`、`/skill.md`。研究证据不足按契约返回 422，不伪造多来源结论。

## 自动化与安全

- Server：346/346；
- Client：48/48；
- TypeScript + Vite：通过，JS 292.94 kB（gzip 91.17 kB）；
- Client production audit：0 漏洞；
- Server production audit：非破坏性更新后由 5 high + 7 moderate 降为 0 high + 2 moderate；剩余项来自 `node-cron@3` 间接依赖 `uuid`，只有 `--force` 主版本升级路径，本轮不强制破坏调度兼容性；
- `docker-compose config --quiet`、全部 Shell `bash -n`、`git diff --check`：通过。

## 尚需外部配置的边界

- 生产服务器 SSH：当前 `root@124.223.85.195` 返回 `Permission denied (publickey,password)`；需要可用用户与私钥才能执行直接上传。
- X、Reddit 用户级、Instagram、抖音、YouTube Data：需要各平台官方凭据/授权；未配置时零网络调用。
- RSSHub/NewsNow：需要运营方提供自托管 HTTPS 地址。
- 小红书、微博、任意抖音/B站深挖：只能由运营方维护登录态 Sidecar，经 HMAC Bridge 接入；Cookie/Token 不进入本仓库。
- MCP/A2A 仍未实现；REST、OpenAPI、JSON/RSS Feed、Webhook/SSE 为当前真实开放面。

## 发布结果

- 源提交：`08c84a8c83e674768ad2d5a519bc9cfe31d2ce5d`；
- 源码包：`aya-20260831T120929Z-08c84a8c83e6-20862.tar.gz`，954 KB；
- 源码包 SHA256：`ab2270e08cfa75a1ef7b78332c8283b1c44e0770bc19a3276927021e08b0aa47`，本地复核通过；
- GitHub：[AiNews PR #2](https://github.com/MarcusDog/AiNews/pull/2) 已合并；代码合并提交为 `95b5d63ae78a06be70822c4426c5d6b19eef64f7`；
- 服务器：`root`、`ubuntu`、`lighthouse` 三个候选用户均被 `124.223.85.195` 拒绝现有 SSH 身份，源码包和数据快照尚未上传。
