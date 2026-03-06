# 客户端 Dockerfile - 静态文件服务
FROM node:20-alpine

# 安装 serve 用于静态文件服务
RUN npm install -g serve@14.2.4

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001 -G nodejs

# 设置工作目录
WORKDIR /app

# 复制构建好的静态文件
COPY --chown=nodeuser:nodejs build ./build

# 复制健康检查脚本
COPY --chown=nodeuser:nodejs healthcheck.js .

# 切换到非 root 用户
USER nodeuser

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node healthcheck.js || exit 1

# 暴露端口
EXPOSE 3003

# 启动命令（单页应用模式）
CMD ["serve", "-s", "build", "-l", "3003", "--cors"]