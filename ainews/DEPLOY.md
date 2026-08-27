# AI News Platform Docker 部署指南

## 快速开始

```bash
# 1. 确保前端已构建
cd client && npm run build && cd ..

# 2. 启动服务
./docker-deploy.sh start

# 3. 访问应用
# 前端: http://localhost:3003
# 后端 API: http://localhost:3002
```

## 部署要求

- Docker 20.10+
- Docker Compose 1.29+
- 至少 2GB 内存
- 至少 5GB 磁盘空间

## 部署选项

### 选项 1：基础部署（推荐用于开发/测试）

```bash
# 仅启动后端和前端服务
docker-compose up -d
```

### 选项 2：完整部署（包含 Nginx）

```bash
# 启动所有服务，包括 Nginx 反向代理
docker-compose --profile with-nginx up -d
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
./docker-deploy.sh logs-client    # 仅前端

# 管理服务
./docker-deploy.sh stop           # 停止
./docker-deploy.sh restart        # 重启
./docker-deploy.sh status         # 查看状态

# 进入容器
./docker-deploy.sh shell-server   # 进入后端容器
./docker-deploy.sh shell-client   # 进入前端容器

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
│   ├── build/              # 前端构建输出
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
DATABASE_PATH=./data/ainews.db
MINIMAX_API_KEY=replace_with_a_new_server_side_key
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic
MINIMAX_MODEL=MiniMax-M2.5
AYA_NEWS_SKILL_PATH=/opt/aya-news-skill/SKILL.md
ADMIN_API_KEY=replace_with_a_long_random_admin_key
```

`MINIMAX_API_KEY` 只保存在服务器环境变量或部署平台的 Secret 中，不要写入前端、镜像或 Git。MiniMax Agent 使用 Anthropic 兼容接口；网站在每天 08:30（Asia/Shanghai）生成一次带来源的信息茧房复核。

`ADMIN_API_KEY` 只配置在服务端。管理页位于 `/#/admin`，密钥仅保存在浏览器当前页面内存中，不写入 LocalStorage、SessionStorage 或 URL。

### 2. 前端环境变量

前端在构建时通过 `docker-compose.yml` 中的 `REACT_APP_API_URL` 环境变量配置 API 地址。

## 数据持久化

数据库和日志通过 volume 映射持久化到宿主机：

- `./server/data:/app/data` - SQLite 数据库
- `./server/logs:/app/logs` - 日志文件
- `./server/cache:/app/cache` - 缓存文件

## 健康检查

所有服务都配置了健康检查：

- **后端**: `http://localhost:3002/health`
- **前端**: `http://localhost:3003/`

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

如果 3002 或 3003 端口被占用，修改 `docker-compose.yml`：

```yaml
ports:
  - "3004:3002"  # 将宿主机的 3004 映射到容器的 3002
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
