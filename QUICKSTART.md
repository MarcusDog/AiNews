# 快速启动指南

## 一键启动

```bash
# 赋予执行权限（首次运行）
chmod +x start.sh

# 运行启动脚本
./start.sh
```

## 手动启动

### 1. 安装依赖

```bash
# 根目录
npm install

# 服务器
cd server && npm install

# 客户端  
cd ../client && npm install
```

### 2. 配置环境（可选）

```bash
# 复制环境变量模板
cp server/.env.example server/.env

# 编辑配置文件
vim server/.env
```

### 3. 启动服务

#### 开发模式（推荐）
```bash
# 同时启动前端和后端
npm run dev
```

#### 分别启动
```bash
# 后端服务（端口5000）
npm run server:dev

# 前端服务（端口3000，单独终端）
npm run client:dev
```

## 访问应用

- 🎯 **前端界面**: http://localhost:3000
- 🔌 **后端API**: http://localhost:3002  
- 💚 **健康检查**: http://localhost:3002/health

## 测试功能

1. **查看资讯**: 首页自动加载AI资讯
2. **分类筛选**: 左侧菜单选择不同分类
3. **搜索功能**: 顶部搜索框搜索关键词
4. **数据分析**: 访问 `/analytics` 查看统计
5. **系统设置**: 访问 `/settings` 配置参数

## 数据源说明

### 免费RSS源（默认启用）
- ✅ 机器之心
- ✅ AI科技大本营  
- ✅ ArXiv AI论文
- ✅ 其他AI技术博客

### 付费API（可选配置）
- 🔑 NewsAPI - 更多主流媒体新闻
- 🔑 OpenAI API - 智能内容分析

> **提示**: 默认配置无需任何API密钥即可使用基础功能

## 常见问题

### 端口占用
```bash
# 查看端口占用
lsof -ti:3000  # 前端端口
lsof -ti:5000  # 后端端口

# 杀死占用进程
kill $(lsof -ti:3000)
kill $(lsof -ti:5000)
```

### 依赖安装失败
```bash
# 清理npm缓存
npm cache clean --force

# 删除node_modules重新安装
rm -rf node_modules server/node_modules client/node_modules
npm install
```

### RSS源获取失败
- 检查网络连接
- 查看服务器日志: `tail -f logs/ainews.log`
- 验证RSS地址有效性

### API配置问题
- 确认API密钥正确性
- 检查API使用限制
- 验证账户余额

## 项目结构

```
ainews/
├── client/              # React前端
│   ├── src/
│   │   ├── components/  # UI组件
│   │   └── pages/       # 页面组件
│   └── package.json
├── server/              # Node.js后端
│   ├── routes/          # API路由
│   ├── services/        # 业务逻辑
│   └── index.js
├── start.sh             # 启动脚本
├── package.json         # 根配置
└── README.md            # 详细文档
```

## 下一步

1. ✅ 成功启动应用
2. 🔧 配置API密钥（可选）
3. 📊 查看数据分析
4. ⚙️ 调整个人偏好设置
5. 🚀 部署到生产环境

---

💡 **提示**: 如有问题请查看 `README.md` 获取详细文档。
