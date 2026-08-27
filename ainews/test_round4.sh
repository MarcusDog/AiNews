#!/bin/bash

echo "=== 第4轮优化测试脚本 ==="
echo "工作目录: /home/tian/clawdbot/work/Ainews"
echo ""

# 检查服务器状态
echo "1. 检查服务器健康状态..."
curl -s http://localhost:3002/health | jq .

# 检查新闻API
echo ""
echo "2. 检查新闻API..."
curl -s http://localhost:3002/api/news/latest | jq '.success'

# 检查状态端点
echo ""
echo "3. 检查系统状态端点..."
curl -s http://localhost:3002/api/news/status || echo "状态端点可能有问题"

# 手动更新新闻
echo ""
echo "4. 手动更新新闻数据..."
curl -s -X POST http://localhost:3002/api/news/update | jq '.success'

# 检查前端
echo ""
echo "5. 检查前端状态..."
curl -s http://localhost:3000 | grep -q "AI资讯平台" && echo "✅ 前端正常访问" || echo "❌ 前端无法访问"

echo ""
echo "=== 测试完成 ==="
