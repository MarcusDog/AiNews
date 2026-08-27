#!/bin/bash

# AI News Platform Docker 部署脚本
# 用法: ./docker-deploy.sh [command]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi

    print_success "Docker 环境检查通过"
}

# 检查必要的文件
check_files() {
    print_info "检查必要的文件..."

    if [ ! -f "server/.env" ]; then
        print_warning "server/.env 文件不存在，将使用 .env.example 创建"
        if [ -f "server/.env.example" ]; then
            cp server/.env.example server/.env
            print_success "已创建 server/.env 文件"
        else
            print_error "server/.env.example 文件也不存在，请手动创建 server/.env 文件"
            exit 1
        fi
    fi

    if [ ! -f "client/build/index.html" ]; then
        print_warning "client/build/index.html 不存在"
        print_info "请先构建前端应用: cd client && npm run build"
    fi

    if [ ! -f "server/data/ainews.db" ]; then
        print_warning "server/data/ainews.db 不存在，将创建空数据库"
        mkdir -p server/data
        touch server/data/ainews.db
    fi

    print_success "文件检查完成"
}

# 构建镜像
build() {
    print_info "开始构建 Docker 镜像..."

    # 检查前端构建
    if [ ! -f "client/build/index.html" ]; then
        print_error "请先构建前端应用: cd client && npm run build"
        exit 1
    fi

    # 构建镜像
    docker-compose build --no-cache

    print_success "Docker 镜像构建完成"
}

# 启动服务
start() {
    print_info "启动 AI News Platform 服务..."

    # 创建必要的目录
    mkdir -p server/data server/logs server/cache

    # 启动服务
    docker-compose up -d

    print_success "服务已启动"
    print_info "前端访问: http://localhost:3003"
    print_info "后端 API: http://localhost:3002"
}

# 停止服务
stop() {
    print_info "停止 AI News Platform 服务..."
    docker-compose down
    print_success "服务已停止"
}

# 重启服务
restart() {
    stop
    start
}

# 查看日志
logs() {
    docker-compose logs -f --tail=100
}

# 查看特定服务日志
logs-server() {
    docker-compose logs -f --tail=100 ainews-server
}

logs-client() {
    docker-compose logs -f --tail=100 ainews-client
}

# 进入容器 shell
shell-server() {
    docker-compose exec ainews-server sh
}

shell-client() {
    docker-compose exec ainews-client sh
}

# 查看服务状态
status() {
    print_info "服务状态:"
    docker-compose ps
    print_info "\n资源使用:"
    docker-compose top
}

# 清理
 clean() {
    print_warning "这将删除所有容器、镜像和数据，是否继续? [y/N]"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        docker-compose down -v --rmi all
        print_success "清理完成"
    else
        print_info "已取消清理"
    fi
}

# 更新（拉取最新代码并重启）
update() {
    print_info "更新服务..."
    git pull origin main
    docker-compose build --no-cache
    docker-compose up -d
    print_success "更新完成"
}

# 备份数据
backup() {
    print_info "备份数据库..."
    backup_dir="backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    if [ -f "server/data/ainews.db" ]; then
        cp server/data/ainews.db "$backup_dir/"
        print_success "数据库已备份到: $backup_dir/ainews.db"
    else
        print_warning "数据库文件不存在"
    fi
    
    # 备份配置
    cp server/.env "$backup_dir/" 2>/dev/null || print_warning "环境文件备份失败"
    print_success "备份完成: $backup_dir"
}

# 主命令处理
case "${1:-start}" in
    build)
        check_docker
        check_files
        build
        ;;
    start)
        check_docker
        check_files
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    logs)
        logs
        ;;
    logs-server)
        logs-server
        ;;
    logs-client)
        logs-client
        ;;
    shell-server)
        shell-server
        ;;
    shell-client)
        shell-client
        ;;
    status)
        status
        ;;
    clean)
        clean
        ;;
    update)
        update
        ;;
    backup)
        backup
        ;;
    *)
        echo "用法: $0 {build|start|stop|restart|logs|logs-server|logs-client|shell-server|shell-client|status|clean|update|backup}"
        echo ""
        echo "命令说明:"
        echo "  build         - 构建 Docker 镜像"
        echo "  start         - 启动服务（默认）"
        echo "  stop          - 停止服务"
        echo "  restart       - 重启服务"
        echo "  logs          - 查看所有服务日志"
        echo "  logs-server   - 查看后端服务日志"
        echo "  logs-client   - 查看前端服务日志"
        echo "  shell-server  - 进入后端容器 shell"
        echo "  shell-client  - 进入前端容器 shell"
        echo "  status        - 查看服务状态"
        echo "  clean         - 清理所有容器、镜像和数据"
        echo "  update        - 更新代码并重启"
        echo "  backup        - 备份数据库"
        exit 1
        ;;
esac