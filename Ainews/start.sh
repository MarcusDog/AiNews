#!/bin/bash

# AI资讯平台启动脚本 v2.0
# 支持自动恢复和健康检查

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
SERVER_PORT="${SERVER_PORT:-3002}"
CLIENT_PORT="${CLIENT_PORT:-3000}"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 清理函数
cleanup() {
    log_info "正在停止服务..."
    
    # 停止后端
    if [ -f server/server.pid ]; then
        kill $(cat server/server.pid) 2>/dev/null || true
        rm -f server/server.pid
    fi
    
    # 停止前端
    if [ -f client/client.pid ]; then
        kill $(cat client/client.pid) 2>/dev/null || true
        rm -f client/client.pid
    fi
    
    # 停止监控进程
    if [ -f monitor.pid ]; then
        kill $(cat monitor.pid) 2>/dev/null || true
        rm -f monitor.pid
    fi
    
    log_info "服务已停止"
    exit 0
}

# 捕获退出信号
trap cleanup SIGINT SIGTERM

# 健康检查函数
health_check() {
    local url=$1
    local max_attempts=$2
    local delay=$3
    
    for i in $(seq 1 $max_attempts); do
        if curl -s "$url" > /dev/null 2>&1; then
            return 0
        fi
        sleep $delay
    done
    return 1
}

is_port_in_use() {
    local port=$1
    lsof -tiTCP:"$port" -sTCP:LISTEN > /dev/null 2>&1
}

find_available_client_port() {
    local port=$1
    while is_port_in_use "$port" || [ "$port" = "$SERVER_PORT" ]; do
        port=$((port + 1))
    done
    echo "$port"
}

# 启动后端服务
start_backend() {
    log_step "启动后端服务..."
    
    cd "$SCRIPT_DIR/server"
    
    # 检查依赖
    if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
        log_info "安装后端依赖..."
        npm install
    fi
    
    # 启动服务
    nohup node index.js > server.log 2>&1 &
    echo $! > server.pid
    
    log_info "后端进程ID: $(cat server.pid)"
    
    # 等待服务启动
    log_info "等待后端服务就绪..."
    if health_check "http://localhost:${SERVER_PORT}/health" 30 2; then
        log_info "后端服务启动成功"
        return 0
    else
        log_error "后端服务启动失败"
        return 1
    fi
}

# 启动前端服务
start_frontend() {
    log_step "启动前端服务..."
    
    cd "$SCRIPT_DIR/client"
    
    # 检查依赖
    if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
        log_info "安装前端依赖..."
        npm install
    fi
    
    # 启动服务
    nohup npm run dev -- --host 0.0.0.0 --port "$CLIENT_PORT" --strictPort > client.log 2>&1 &
    echo $! > client.pid
    
    log_info "前端进程ID: $(cat client.pid)"
    
    # 等待服务启动
    log_info "等待前端服务就绪..."
    if health_check "http://localhost:${CLIENT_PORT}" 60 3; then
        log_info "前端服务启动成功"
        return 0
    else
        log_warn "前端服务启动较慢，请稍候..."
        return 0
    fi
}

# 监控服务（自动恢复）
start_monitor() {
    log_step "启动服务监控..."
    
    (
        while true; do
            sleep 60
            
            # 检查后端健康
            if ! curl -s "http://localhost:${SERVER_PORT}/health" > /dev/null 2>&1; then
                log_warn "后端服务异常，尝试重启..."
                
                if [ -f "$SCRIPT_DIR/server/server.pid" ]; then
                    kill $(cat "$SCRIPT_DIR/server/server.pid") 2>/dev/null || true
                fi
                
                cd "$SCRIPT_DIR/server"
                nohup node index.js >> server.log 2>&1 &
                echo $! > server.pid
                
                sleep 10
                
                if curl -s "http://localhost:${SERVER_PORT}/health" > /dev/null 2>&1; then
                    log_info "后端服务已恢复"
                else
                    log_error "后端服务恢复失败"
                fi
            fi
        done
    ) &
    echo $! > "$SCRIPT_DIR/monitor.pid"
    log_info "监控进程ID: $(cat "$SCRIPT_DIR/monitor.pid")"
}

# 主函数
main() {
    echo ""
    echo "=============================================="
    echo "       AI资讯平台 v2.0 启动脚本"
    echo "=============================================="
    echo ""
    
    # 检查Node.js
    if ! command -v node &> /dev/null; then
        log_error "未找到Node.js，请先安装Node.js"
        exit 1
    fi
    
    log_info "Node.js版本: $(node -v)"
    log_info "npm版本: $(npm -v)"

    CLIENT_PORT="$(find_available_client_port "$CLIENT_PORT")"
    log_info "前端将使用端口: ${CLIENT_PORT}"
    
    # 停止已存在的服务
    if [ -f server/server.pid ]; then
        log_info "停止现有后端服务..."
        kill $(cat server/server.pid) 2>/dev/null || true
        rm -f server/server.pid
    fi
    
    if [ -f client/client.pid ]; then
        log_info "停止现有前端服务..."
        kill $(cat client/client.pid) 2>/dev/null || true
        rm -f client/client.pid
    fi
    
    if [ -f monitor.pid ]; then
        kill $(cat monitor.pid) 2>/dev/null || true
        rm -f monitor.pid
    fi
    
    # 启动服务
    if start_backend; then
        if start_frontend; then
            start_monitor
            
            echo ""
            echo "=============================================="
            echo "         服务启动成功！"
            echo "=============================================="
            echo ""
            echo "  前端地址: http://localhost:${CLIENT_PORT}"
            echo "  后端API:  http://localhost:${SERVER_PORT}"
            echo "  健康检查: http://localhost:${SERVER_PORT}/health"
            echo "  WebSocket: ws://localhost:${SERVER_PORT}"
            echo ""
            echo "  日志文件:"
            echo "    - 后端: server/server.log"
            echo "    - 前端: client/client.log"
            echo ""
            echo "  按 Ctrl+C 停止所有服务"
            echo "=============================================="
            echo ""
            
            # 保持脚本运行
            wait
        else
            log_error "前端服务启动失败"
            cleanup
        fi
    else
        log_error "后端服务启动失败"
        cleanup
    fi
}

# 运行主函数
main "$@"
