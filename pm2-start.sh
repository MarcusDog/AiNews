#!/bin/bash
# AInews PM2 启动脚本

echo "🚀 正在启动 AInews 服务..."
cd /home/tian/clawdbot/work/Ainews

# 检查PM2是否安装
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 未安装，请先安装: npm install -g pm2"
    exit 1
fi

# 启动服务
pm2 start ecosystem.config.js

# 保存配置
pm2 save

echo ""
echo "✅ 服务已启动！"
echo "📊 服务器: http://localhost:3002"
echo "🌐 客户端: http://localhost:3003"
echo ""
echo "查看状态: pm2 status"
echo "查看日志: pm2 logs"
echo "重启服务: pm2 restart all"
echo "停止服务: pm2 stop all"
