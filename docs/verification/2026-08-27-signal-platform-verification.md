# Aya Signal / Topic Platform 最终验证报告

验证日期：2026-08-27（Asia/Shanghai）

验证对象：多源 Signal 采集、Topic 聚类、Trend / Creator Opportunity、开放 REST / Feed / Skill、首页视野监测台与上线配置。

## 结论

第二阶段的本地交付验收通过。系统能够从真实公开来源采集并持久化 Signal，在单源失败时继续运行，构建可解释 Topic 与 Creator Opportunity，并通过网页、REST、OpenAPI、JSON Feed、RSS 和 AyaNewsSkill 暴露真实数据。

未声称已实现的能力：MCP Server、A2A Agent Card、Webhook 推送。YouTube、X、RSSHub、NewsNow、JSON Bridge 和 L4 Sidecar 只有在运营方提供凭据或自托管地址后才会启用。

## 自动化与构建

| 项目 | 结果 |
|---|---|
| 服务端 `npm test` | 147 / 147 通过 |
| 客户端 `npm test -- --run` | 6 个文件，32 / 32 通过 |
| 客户端 `tsc -b && vite build` | 通过；CSS 21.91 kB（gzip 5.55 kB），JS 244.14 kB（gzip 80.30 kB） |
| 客户端生产依赖审计 | 0 漏洞 |
| Shell / Compose | `bash -n` 与 `docker-compose config --quiet` 通过 |
| Nginx | 1.29.7 本机路径替换后语法通过；临时 Nginx 实际代理 Topic Feed 成功 |
| Git whitespace | `git diff --check` 通过 |
| 严格密钥格式扫描 | OpenAI / GitHub / Google / AWS / 私钥文件命中 0 |
| Skill 发布包 | `AyaNewsSkill.zip`、`.tar.gz` 均通过 `SHA256SUMS` |

## 干净数据库真实采集

使用全新的临时 SQLite 数据库、并发 3、8 个 L1 来源、每源最多 4 条执行有界刷新。

- 采集状态：success；收到 14 条，保存 14 条；两个来源失败但没有阻断其他来源。
- 72 小时有效数据：8 条 Signal，形成 8 个 Topic。
- 在线：legacy News、GitHub、Hacker News、Hugging Face、Mastodon、Reddit LocalLLaMA。
- 降级：Reddit MachineLearning、Reddit artificial；均为本轮 0 写入、失败计数 1，状态未伪装为在线。
- 真实性检查：非法或示例 URL 0、缺失时间 0、无证据 Topic 0、Trend 分解不一致 0、无关 Mastodon 趋势 0。

真实采集首次暴露 Mastodon 全站趋势会混入非 AI 内容。根因是适配器只有映射、没有相关性边界；已增加中英文 AI 术语过滤及失败回归测试，普通旅行、风景内容不会进入 Signal。

## Live API 与 Nginx

以 `AINEWS_DISABLE_CRON=1`、`AINEWS_SKIP_STARTUP_REFRESH=1` 启动测试安全服务器，读取预先采集的临时数据库。下列端点均返回 200 和正确内容类型：

- `/health`
- `/api/signals/v1/health`
- `/api/signals/v1/topics?window=72h`
- `/api/signals/v1/topics/{id}`（详情含真实原始证据）
- `/api/signals/v1/opportunities`
- `/api/signals/v1/opportunities/random`
- `/api/signals/v1/sources`
- `/api/signals/v1/changes`
- `/skill.md`
- `/openapi.json`
- `/topics/feed.json`
- `/topics/rss.xml`

临时 Nginx 监听本机 18081 并代理同一后端：Topic JSON Feed 返回 `application/feed+json`、24,980 bytes；Topic RSS 返回 `application/rss+xml`、15,169 bytes，均未落入 SPA HTML fallback。

## Chrome / Playwright QA

真实 Chrome 页面使用有数据的测试安全后端验证：

- 桌面 1440×960：视频 `readyState=4`，页面宽度 1440/1440，无水平溢出；评分展开、24/48/72h 切换、导航 `#radar`、来源状态正常。
- 移动 390×844：页面宽度不超过视口；标题、监测台和时间窗正常换行；随机选题 Dialog 为 358×759.6，完整位于视口内。
- 随机选题：显示真实“机会选题”、Creator / 趋势分、风险提示和原始证据链接；焦点进入关闭按钮，Escape 可关闭。
- 故障态：拦截 Signal API 返回 503 后，只显示“视野监测暂时不可用”和重试按钮，不保留或注入示例 Topic。
- 正常网络状态下控制台错误/警告为 0；模拟 503 时只出现预期的失败请求记录。
- QA 修正：长社区摘要限制为 3 行；变化 Topic 离开当前窗口后显示可理解文案，不暴露内部 ID。

截图：`output/playwright/aya-signals-desktop.png`、`output/playwright/aya-signals-mobile.png`（本地 QA 产物，不参与生产构建）。

## 脏工作树保护审查

第二阶段基线目录：`/tmp/aya-phase2-baseline-20260827`。`SHA256SUMS.txt` 聚合哈希复算仍为：

`c6b637bd744f3c7a49494eeb1bc4d99e880f1906e85014315d9580f40b8b2aa8`

| 目标 | HEAD → 基线 | 基线 → 最终 | 保留结论 |
|---|---|---|---|
| `server/index.js` | 已保存在 `server-index.diff` | Signal 路由、显式生命周期、调度与清理 | 原公开路由、Socket.IO、News 初始化语义保留；生命周期测试覆盖 |
| `server/routes/content.js` | 已保存在 `server-routes-content.diff` | 仅增加 6 个真实 Signal / Topic capability | 原证据与管理边界保留 |
| `PublicDiscoveryService.js` | 基线无 HEAD diff | 新增 Topic OpenAPI、Feed、Skill 说明 | 原 News API / Feed 保留；发现面测试覆盖 |
| AyaNewsSkill `SKILL.md` / `api.md` | 文件快照已校验 | 扩展 Signal / Topic / changes，修正已实现边界 | 原 News 兼容和证据规则保留；安装包测试覆盖 |
| `nginx/nginx.conf` | 已保存在 `nginx-nginx.diff` | 仅新增 24 行 Topic Feed 精确代理 | SPA、静态缓存和原机器入口保留 |
| `docker-compose.yml` | 已保存在 `docker-compose.diff` | 仅增加 env 透传说明注释 | `client/dist` 与后端挂载路径不变 |
| README / QUICKSTART / DEPLOY | 各自 HEAD diff 已保存 | 增加第二阶段能力、来源和运维说明 | 第一阶段 Vite 发布说明保留 |

三层差异均已检查：HEAD → 基线使用保存的 `.diff`；基线 → 最终使用逐文件 `git diff --no-index`；HEAD → 最终使用仓库 `git diff` 与全量回归。没有重置、暂存或覆盖用户原有未提交改动。

## 环境限制与上线动作

- 本机 Docker daemon 未运行（Colima socket 不存在），因此未执行 Compose 容器启动；Compose 解析和真实本机 Nginx 代理已经验证。
- L2 / L3 / L4 可选来源没有真实凭据或自托管服务，验收只确认它们保持 `unconfigured` / `disabled` 且零网络调用。
- 正式上线后仍需用生产域名复核首页、Signal API、OpenAPI、Skill、Topic JSON/RSS，并观察首轮完整来源健康状态与限流。

