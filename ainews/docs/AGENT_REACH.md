# Agent-Reach Integration

AyaNews 把 [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) 当作 L4 信号源。

## 仓库

- **GitHub**: https://github.com/Panniantong/Agent-Reach
- **本地 clone**: `/opt/Agent-Reach`
- **CLI**: `agent-reach` (pip3 install -e /opt/Agent-Reach)

## 接入点

ainews 在 `/api/agent-reach/*` 下提供 HTTP adapter：

| Endpoint | 说明 |
|---|---|
| `GET /api/agent-reach/version` | 显示安装版本 |
| `GET /api/agent-reach/doctor` | 跑 `agent-reach doctor`，返回 15 渠道状态 |
| `GET /api/agent-reach/youtube-search?q=...` | yt-dlp `ytsearch10:`，返回 JSON 列表，**自动写入 creator_posts 表** |
| `GET /api/agent-reach/web-read?url=...` | Jina Reader 读任意网页 |
| `GET /api/agent-reach/rss?url=...` | feedparser 读 RSS/Atom，**自动写入 creator_posts 表** |

## 当前能力（2026-08-29）

```
状态：3/15 个渠道可用
✅ 装好即用：
  - GitHub 仓库和代码 (gh CLI 缺失 → warn)
  - YouTube 视频和字幕 (yt-dlp 已安装，缺 JS runtime → warn)
  - RSS/Atom 订阅源
  - 任意网页 (Jina Reader)
  - B站搜索 API
可选渠道：
  - Twitter/X · Reddit · Facebook · Instagram · 小红书 · 小宇宙 · 雪球 · LinkedIn
```

## 数据持久化

每次调用 `/api/agent-reach/youtube-search` 或 `/api/agent-reach/rss` 都会自动：

1. 创建或复用 `creator_agentreach_youtube` / `creator_agentreach_rss` creator 行
2. 创建或复用对应 GitHub tier 的 account 行（`source_tier: 'L1'`）
3. 调 `store.commitPage` 把 records 写入 `creator_posts`，`source_confidence: 'agent-reach'`
4. `wal_checkpoint(FULL)` 保证数据落盘

写入的数据可以通过现有接口查询：
- `GET /api/creators/v1/creators?status=verified` (会看到 agent-reach 创建的 creator)
- `GET /api/creators/v1/posts?hot=true&since=...`
- `GET /api/creators/v1/creators/creator_agentreach_youtube/posts`

## 长期记忆

Agent-Reach 配置已写入 mempalace（跨项目知识），可被任何后续 session 调用：

- wing: `external-services` → room: `agent-reach`
- 含: GitHub URL、版本、接入命令、可用 channels、写入数据流的策略