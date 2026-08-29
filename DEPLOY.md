# Aya Signals Docker 部署指南

> 从安装到来源、观察名单、选题、推送、维护和验收的完整流程见 [整个系统使用方案](./docs/SYSTEM_USAGE_GUIDE.md)。

## 快速开始

```bash
# 1. 确保前端已构建
cd client && npm run build && cd ..

# 2. 启动服务
./docker-deploy.sh start

# 3. 访问应用
# 网站: http://localhost:8080
# 后端 API: http://localhost:8080/api
```

## 部署要求

- Docker 20.10+
- Docker Compose 1.29+
- Node.js 20.19+ 和 npm（用于在宿主机/CI 构建 `client/dist`）
- 至少 2GB 内存
- 至少 5GB 磁盘空间

## 部署选项

### 选项 1：Compose 部署（推荐）

```bash
# 先构建 Vite 静态产物，再启动 Nginx + 后端
cd client && npm ci && npm run build && cd ..
docker-compose up -d
```

### 选项 2：独立前端镜像

```bash
# client/Dockerfile 是可选的独立静态服务镜像
docker build -t aya-signals-client ./client
docker run --rm -p 3003:3003 aya-signals-client
```

### 选项 3：生产部署（使用部署脚本）

```bash
# 完整流程：检查、构建、启动
./docker-deploy.sh start

# 或分步执行
./docker-deploy.sh build    # 构建镜像
./docker-deploy.sh start     # 启动服务
```

## 常用命令

```bash
# 查看日志
./docker-deploy.sh logs           # 所有服务
./docker-deploy.sh logs-server    # 仅后端
./docker-deploy.sh logs-client    # 前端 Nginx

# 管理服务
./docker-deploy.sh stop           # 停止
./docker-deploy.sh restart        # 重启
./docker-deploy.sh status         # 查看状态

# 进入容器
./docker-deploy.sh shell-server   # 进入后端容器
./docker-deploy.sh shell-client   # 进入 Nginx 容器

# 备份和清理
./docker-deploy.sh backup         # 备份数据库
./docker-deploy.sh clean          # 清理所有资源
```

## 文件结构

```
.
├── server/
│   ├── Dockerfile          # 后端 Dockerfile
│   ├── .dockerignore       # 后端 Docker 忽略文件
│   ├── package.json        # 后端依赖
│   └── ...
├── client/
│   ├── Dockerfile          # 前端 Dockerfile
│   ├── .dockerignore       # 前端 Docker 忽略文件
│   ├── dist/               # Vite 前端构建输出
│   └── ...
├── docker-compose.yml      # Docker Compose 配置
├── docker-deploy.sh        # 部署脚本
├── nginx/
│   └── nginx.conf          # Nginx 配置（可选）
├── .dockerignore           # 全局 Docker 忽略文件
└── DEPLOY.md              # 本文档
```

## 环境配置

### 1. 后端环境变量 (server/.env)

```bash
NODE_ENV=production
PORT=3002
AINEWS_DB_PATH=./data/ainews.db
MINIMAX_API_KEY=replace_with_a_new_server_side_key
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic
MINIMAX_MODEL=MiniMax-M2.5
AYA_NEWS_SKILL_PATH=/opt/aya-news-skill/SKILL.md
ADMIN_API_KEY=replace_with_a_long_random_admin_key
GITHUB_TOKEN=
MASTODON_INSTANCES=https://mastodon.social
REDDIT_COMMUNITIES=LocalLLaMA,MachineLearning,artificial
YOUTUBE_API_KEY=
X_BEARER_TOKEN=
RSSHUB_BASE_URL=
NEWSNOW_BASE_URL=
SIGNAL_BRIDGES_JSON=[]
AINEWS_SIGNAL_CONCURRENCY=4
AYA_CREATOR_SEEDS_PATH=./config/creatorSeeds.local.json
AYA_DISABLE_CREATOR_SCHEDULER=0
AYA_CREATOR_CONCURRENCY=4
AYA_CREATOR_REQUEST_BUDGET=100
AYA_CREATOR_BRIDGES_JSON=[]
AYA_YOUTUBE_WEBSUB_SECRET=
AYA_CREATOR_WEBHOOK_DEFAULT_SECRET=
AYA_CREATOR_BACKUP_DIR=./data/backups
AYA_CREATOR_EXPORT_DIR=./data/exports
```

`MINIMAX_API_KEY` 只保存在服务器环境变量或部署平台的 Secret 中，不要写入前端、镜像或 Git。MiniMax Agent 使用 Anthropic 兼容接口；网站在每天 08:30（Asia/Shanghai）生成一次带来源的信息茧房复核。

`ADMIN_API_KEY` 只配置在服务端。管理页位于 `/#/admin`，密钥仅保存在浏览器当前页面内存中，不写入 LocalStorage、SessionStorage 或 URL。

Compose 会把 `server/.env` 整体传入后端，可选 Signal 变量保持为空即可，不会阻止启动。RSSHub、NewsNow 与 JSON Bridge 只接受 HTTPS 地址；MediaCrawler、Agent-Reach 必须作为独立 Sidecar 运行，不能把 Cookie 或登录态放进本仓库。

Creator 观察名单应使用 Git 忽略的运营文件。X、Reddit、Instagram、抖音、YouTube Data 和消息通道缺少授权时会显示 `unconfigured`；小红书/微博/任意抖音或 B 站深挖只允许独立 Sidecar 经原始字节 HMAC Bridge 接入。完整配置见 [docs/CREATOR_SOURCES.md](./docs/CREATOR_SOURCES.md)、[docs/CREATOR_SIDECAR.md](./docs/CREATOR_SIDECAR.md) 与 [docs/CREATOR_ALERTS.md](./docs/CREATOR_ALERTS.md)。

默认每 30 分钟刷新 Signal/Topic、每日 02:00 清理并保留 45 天。部署后的运维检查：

```bash
curl http://localhost:8080/api/signals/v1/health
curl http://localhost:8080/api/signals/v1/sources
curl 'http://localhost:8080/api/signals/v1/topics?window=72h'
curl 'http://localhost:8080/api/news/hot-rank?window=24h'
curl 'http://localhost:8080/api/news/discover?window=48h&profile=tool-review'
curl 'http://localhost:8080/api/news/dashboard?window=72h'
curl -I http://localhost:8080/topics/feed.json
curl -I http://localhost:8080/topics/rss.xml
curl -I http://localhost:8080/topics
curl -I http://localhost:8080/research
curl -I http://localhost:8080/skills
curl http://localhost:8080/api/creators/v1/sources
curl 'http://localhost:8080/api/creators/v1/creators?status=verified&limit=20'
curl 'http://localhost:8080/api/creators/v1/posts?vertical=ai-tech&limit=20'
curl -I http://localhost:8080/creators
curl -I http://localhost:8080/sources
curl -I http://localhost:8080/alerts
```

Topic Feed 在 Nginx 中使用精确匹配代理，位于 SPA fallback 之前。JSON 应返回 `application/feed+json`，RSS 应返回 XML 内容类型；若返回 HTML，说明仍在使用旧 Nginx 配置。

### 2. 前端 API 路径

前端使用同源 `/api` 路径。开发环境由 Vite 代理到 `localhost:3002`，生产环境由 Nginx 代理，不向浏览器注入服务端密钥。

## 数据持久化

数据库和日志通过 volume 映射持久化到宿主机：

- `./server/data:/app/data` - SQLite 数据库
- `./server/logs:/app/logs` - 日志文件
- `./server/cache:/app/cache` - 缓存文件
- `./server/data/backups:/app/data/backups` - Creator online backup
- `./server/data/exports:/app/data/exports` - 校验和 JSONL 导出

## 健康检查

所有服务都配置了健康检查：

- **后端（经 Nginx）**: `http://localhost:8080/health`
- **前端**: `http://localhost:8080/`

## 故障排查

### 容器无法启动

```bash
# 查看详细日志
docker-compose logs -f

# 检查依赖服务状态
docker-compose ps

# 重启服务
docker-compose restart
```

### 数据库问题

```bash
# 检查数据库文件权限
ls -la server/data/

# 进入容器检查
docker-compose exec ainews-server sh
ls -la data/
```

### 端口冲突

如果 8080 端口被占用，修改 `docker-compose.yml`：

```yaml
ports:
  - "8081:80"  # 将宿主机的 8081 映射到 Nginx 80
```

## 生产环境建议

1. **使用 HTTPS**: 配置 SSL 证书并启用 HTTPS
2. **限制资源**: 根据需要调整 `docker-compose.yml` 中的资源限制
3. **定期备份**: 使用 `./docker-deploy.sh backup` 定期备份
4. **监控日志**: 配置日志收集系统（如 ELK）
5. **使用反向代理**: 启用 Nginx 配置进行负载均衡

## 更新部署

```bash
# 拉取最新代码
git pull origin main

# 重新构建并启动
./docker-deploy.sh update

# 或手动执行
cd client && npm ci && npm run build && cd ..
docker-compose build --no-cache
docker-compose up -d
```

## 安全建议

1. 修改默认的数据库文件权限
2. 使用非 root 用户运行容器（已实现）
3. 定期更新基础镜像
4. 在防火墙中限制端口访问
5. 配置 fail2ban 防止暴力破解

## 联系支持

如有问题，请查看日志文件或联系开发团队。
