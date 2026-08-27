#!/bin/bash
# AInews Docker 管理脚本

set -e

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目目录
PROJECT_DIR="/home/tian/clawdbot/work/Ainews"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"

# 显示帮助信息
show_help() {
    echo "AInews Docker 管理脚本"
    echo ""
    echo "用法: ./docker-manage.sh [命令]"
    echo ""
    echo "命令:"
    echo "  start      启动所有服务"
    echo "  stop       停止所有服务"
    echo "  restart    重启所有服务"
    echo "  status     查看服务状态"
    echo "  logs       查看日志"
    echo "  build      重新构建镜像"
    echo "  check      健康检查"
    echo "  clean      清理未使用的资源"
    echo "  update     更新并重启（拉取最新代码后使用）"
    echo ""
    echo "日志命令:"
    echo "  logs server    查看服务器日志"
    echo "  logs client    查看客户端日志"
    echo "  logs -f        实时跟踪日志"
}

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker 未安装${NC}"
        echo "请先安装 Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo -e "${RED}❌ Docker Compose 未安装${NC}"
        echo "请先安装 Docker Compose"
        exit 1
    fi
}

# 获取 docker compose 命令
get_compose_cmd() {
    if docker compose version &> /dev/null; then
        echo "docker compose"
    else
        echo "docker-compose"
    fi
}

COMPOSE_CMD=$(get_compose_cmd)

# 启动服务
start_services() {
    echo -e "${BLUE}🚀 正在启动 AInews 服务...${NC}"
    cd $PROJECT_DIR
    
    # 检查是否有旧容器在运行
    if [ "$($COMPOSE_CMD ps -q)" ]; then
        echo -e "${YELLOW}⚠️  发现旧容器，正在停止...${NC}"
        $COMPOSE_CMD down
    fi
    
    # 构建并启动
    $COMPOSE_CMD up -d --build
    
    echo ""
    echo -e "${GREEN}✅ 服务已启动！${NC}"
    echo ""
    echo "📊 服务器: http://localhost:3002"
    echo "🌐 客户端: http://localhost:3003"
    echo ""
    echo "等待服务启动中..."
    sleep 5
    
    # 执行健康检查
    check_health
}

# 停止服务
stop_services() {
    echo -e "${BLUE}🛑 正在停止服务...${NC}"
    cd $PROJECT_DIR
    $COMPOSE_CMD down
    echo -e "${GREEN}✅ 服务已停止${NC}"
}

# 重启服务
restart_services() {
    echo -e "${BLUE}🔄 正在重启服务...${NC}"
    cd $PROJECT_DIR
    $COMPOSE_CMD restart
    echo -e "${GREEN}✅ 服务已重启${NC}"
    sleep 3
    check_health
}

# 查看状态
show_status() {
    echo -e "${BLUE}📊 服务状态${NC}"
    echo ""
    cd $PROJECT_DIR
    $COMPOSE_CMD ps
    echo ""
    
    # 检查健康状态
    echo -e "${BLUE}🏥 健康检查${NC}"
    echo ""
    
    # 检查服务器
    if curl -s http://localhost:3002/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 服务器 (3002): 正常${NC}"
        curl -s http://localhost:3002/health | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"   新闻数: {d.get('newsCount', 0)} | 状态: {d.get('status', 'unknown')}\")" 2>/dev/null || echo "   无法获取详细信息"
    else
        echo -e "${RED}❌ 服务器 (3002): 无法连接${NC}"
    fi
    
    # 检查客户端
    if curl -s http://localhost:3003 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 客户端 (3003): 正常${NC}"
    else
        echo -e "${RED}❌ 客户端 (3003): 无法连接${NC}"
    fi
}

# 查看日志
show_logs() {
    cd $PROJECT_DIR
    
    if [ -z "$2" ]; then
        echo -e "${BLUE}📋 查看所有日志${NC}"
        $COMPOSE_CMD logs --tail=100 -f
    elif [ "$2" = "server" ]; then
        echo -e "${BLUE}📋 查看服务器日志${NC}"
        $COMPOSE_CMD logs --tail=100 -f ainews-server
    elif [ "$2" = "client" ]; then
        echo -e "${BLUE}📋 查看客户端日志${NC}"
        $COMPOSE_CMD logs --tail=100 -f ainews-client
    else
        echo -e "${YELLOW}未知的服务: $2${NC}"
        echo "可用选项: server, client"
    fi
}

# 重新构建
build_services() {
    echo -e "${BLUE}🔨 正在重新构建镜像...${NC}"
    cd $PROJECT_DIR
    $COMPOSE_CMD build --no-cache
    echo -e "${GREEN}✅ 构建完成${NC}"
}

# 健康检查
check_health() {
    echo -e "${BLUE}🏥 执行健康检查...${NC}"
    echo ""
    
    cd $PROJECT_DIR
    
    # 获取容器状态
    SERVER_STATUS=$($COMPOSE_CMD ps ainews-server --format "{{.State}}" 2>/dev/null || echo "not found")
    CLIENT_STATUS=$($COMPOSE_CMD ps ainews-client --format "{{.State}}" 2>/dev/null || echo "not found")
    
    echo -e "容器状态:"
    echo -e "  服务器: ${BLUE}$SERVER_STATUS${NC}"
    echo -e "  客户端: ${BLUE}$CLIENT_STATUS${NC}"
    echo ""
    
    # 检查服务器
    echo -n "检查服务器健康... "
    for i in {1..10}; do
        if curl -s http://localhost:3002/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ 通过${NC}"
            curl -s http://localhost:3002/health | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"  新闻数: {d.get('newsCount', 0)}\")" 2>/dev/null || true
            break
        else
            echo -n "."
            sleep 2
        fi
        
        if [ $i -eq 10 ]; then
            echo ""
            echo -e "${RED}❌ 服务器健康检查失败${NC}"
            echo "查看日志: ./docker-manage.sh logs server"
            return 1
        fi
    done
    
    # 检查客户端
    echo -n "检查客户端健康... "
    for i in {1..5}; do
        if curl -s http://localhost:3003 > /dev/null 2>&1; then
            echo -e "${GREEN}✅ 通过${NC}"
            break
        else
            echo -n "."
            sleep 1
        fi
        
        if [ $i -eq 5 ]; then
            echo ""
            echo -e "${RED}❌ 客户端健康检查失败${NC}"
            return 1
        fi
    done
    
    echo ""
    echo -e "${GREEN}✅ 所有服务健康运行！${NC}"
}

# 清理资源
clean_resources() {
    echo -e "${YELLOW}🧹 正在清理资源...${NC}"
    docker system prune -f
    echo -e "${GREEN}✅ 清理完成${NC}"
}

# 更新服务
update_services() {
    echo -e "${BLUE}🔄 正在更新服务...${NC}"
    cd $PROJECT_DIR
    
    # 重建客户端（如果有新代码）
    echo "重新构建客户端..."
    cd client
    npm run build
    cd ..
    
    # 重启服务
    $COMPOSE_CMD up -d --build
    
    echo -e "${GREEN}✅ 更新完成${NC}"
    sleep 3
    check_health
}

# 主逻辑
case "${1:-status}" in
    start)
        check_docker
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "$@"
        ;;
    build)
        build_services
        ;;
    check)
        check_health
        ;;
    clean)
        clean_resources
        ;;
    update)
        update_services
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}未知命令: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac
