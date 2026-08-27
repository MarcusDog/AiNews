# AyaNews 热点采集与创作者工作流验证

日期：2026-08-28（Asia/Shanghai）

## 验证范围

- 默认免凭据国内外 Signal 来源的真实采集与来源健康；
- 24 / 48 / 72 小时证据裁剪与评分重算；
- 6 个 News 聚合路由；
- 五类 AI 博主画像与不重复随机选题；
- 独立选题、研究、Skill 页面；
- OpenAPI、Topic Feed、AyaNewsSkill 2.3 与发布包。

## 真实采集

使用全新临时 SQLite 数据库执行一次默认 L1 网络刷新，未修改生产历史库：

- 收到并保存 `132 / 132` 条，来源错误 `0`；
- Hacker News `1`、GitHub `40`、Mastodon `4`、Reddit `67`、Hugging Face `20`；
- 重建 `72` 个 72 小时 Topic；
- 头部出现 Qwen3.8 Flash Next、GLM-5.3 Flash、LTX-2.5；
- `r/artificial` 泛哲学 Topic 数为 `0`；
- Bilibili 全站热门本轮成功请求但没有符合 AI 规则的内容，因此保留 online + 0，而不生成假热点。

修复内容包括 Hugging Face 的真实 `limit=20` 契约、Reddit 多社区单请求缓存拆分、Mastodon 部分端点成功保留，以及广泛 Reddit 社区的显式 AI 相关性门槛。

## Live HTTP

使用上述真实采集库启动当前后端代码并逐项请求：

| 接口 | 结果 |
|---|---|
| `/api/news/feed` | HTTP 200；临时库无 legacy News，因此 items 为空；历史总数契约由 12,474 fixture 路由测试覆盖 |
| `/api/news/domestic` | HTTP 200；临时库 Bilibili 本轮无 AI 项，诚实返回空 |
| `/api/news/hot-rank` | HTTP 200，返回真实窗口 Topic |
| `/api/news/discover?profile=tool-review` | HTTP 200，返回五条工具实测机会 |
| `/api/news/dashboard` | HTTP 200，聚合 Topic 与来源健康 |
| `/api/news/by-source` | HTTP 200，返回 News + Signal 两组来源 |
| `/api/content/v1/brief?...&topicId=...` | HTTP 200、`ready`，返回 4 条 Hugging Face / Reddit 原始证据 URL |
| `/openapi.json` | HTTP 200，版本 2.3.0，包含 6 个 News 路由 |
| `/skill.md` | HTTP 200，包含 5 个创作者画像与真实边界 |
| `/topics/feed.json` | HTTP 200，返回 50 个真实 Topic Feed item |

真实窗口前十项中，Qwen Topic 的 evidenceCount 为：24h `5`、48h `6`、72h `6`。24h 与 48h 响应不再相同；48h 与 72h 在没有额外 48–72 小时证据时允许相同，不制造虚假差异。

随机机会接口同时返回稳定 `id` 与兼容 `topic_id`。第一次选中 `b69c697acf8f92accaa6d62b` 后携带 `exclude`，第二次返回 `26b21a09f98a339752a78d92`，验证为不同 Topic。

## 浏览器验收

使用系统 Chrome 和真实本地 API 完成桌面与 390×844 移动端检查：

- `/topics` 加载真实机会；“随机给我一题”从 life-ipo 切换到 GLM；
- 切换 `tool-review` + `24h` 后生成 Qwen3.8 Flash Next 工具实测题；
- 从选题进入 `/research?...&topicId=...`，点击“开始研究”后显示 4 条证据、引用边界和多样性统计；
- `/skills` 显示人类可读说明及 API、OpenAPI、Feed、原始 Skill Markdown 入口；
- 桌面/移动页面均无阻断布局问题，浏览器控制台只有 React 开发工具提示，无错误。

截图保存在本地忽略目录 `output/playwright/`，不进入生产提交。

## 自动化验证

- 后端：`npm test`，159 个测试；
- 前端：`npm test`，34 个测试；
- 前端生产构建：`npm run build`；
- 客户端生产依赖：`npm audit --omit=dev`，0 vulnerabilities；
- AyaNewsSkill 2.3：`npm test`，15 个测试；
- Skill 发布包：ZIP / TAR.GZ / SHA256 重新生成，并在 `dist/` 中通过 `shasum -a 256 -c SHA256SUMS`。
- `git diff --check`：AI News 与 AyaNewsSkill 两个工作树均通过。

以上为包含随机接口稳定 `id` / `topic_id` 兼容字段修复后的最终完整验证结果。

## 发布边界

本次没有删除、重建或覆盖线上 12,474 条历史 News。生产域名仍需合并并部署当前 GitHub PR 后才会获得这些修复；验证结论只针对当前提交候选代码与真实临时采集库。

## GitHub 发布

- AI News：代码提交 `dc56dc9a` 已推送至 [AiNews PR #1](https://github.com/MarcusDog/AiNews/pull/1)。
- AyaNewsSkill 2.3：代码提交 `33b6e73` 已推送至 [AyaNewsSkill PR #1](https://github.com/MarcusDog/AyaNewsSkill/pull/1)。
- AyaNewsSkill GitHub Actions 未执行测试步骤；GitHub annotation 明确为账号因 billing 问题被锁定。该外部失败不替代本报告记录的本地 `15/15`、打包与 SHA256 结果，账号恢复后应重新运行检查。
