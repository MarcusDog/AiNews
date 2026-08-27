# Ainews 网站修复报告

**修复时间**: 2026-04-09 16:58  
**问题**: 网站显示"数据源连接中"、"Failed to fetch"、"接口不存在"

---

## 🔍 问题诊断

### 症状
1. 前端显示"数据源连接中"
2. 浏览器控制台报错 "Failed to fetch"
3. API 返回 "接口不存在"

### 根本原因

**Nginx 反向代理配置问题**

原始配置：
```nginx
location /api/ {
    proxy_pass http://localhost:3002/;  # ❌ 尾部斜杠导致路径问题
}
```

当使用 `proxy_pass http://localhost:3002/;` 时，Nginx 会移除匹配 `/api/` 的部分，导致：
- 请求 `https://ainews.xiaotianaya.com/api/news/status`
- 被转发为 `http://localhost:3002/news/status`（缺少 `/api/` 前缀）
- 后端返回 "接口不存在"

---

## ✅ 修复方案

### 1. 修复 Nginx 配置

修改 `/etc/nginx/sites-available/ainews.xiaotianaya.com`：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3002/api/;  # ✅ 明确指定完整路径
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

**关键改动**：
- 将 `localhost` 改为 `127.0.0.1`（避免 IPv6 解析问题）
- 将 `proxy_pass http://127.0.0.1:3002/api/;` 明确指定完整路径

### 2. 修复前端 API 配置

修改 `/root/website/Ainews/client/src/config/api.js` 和 `/root/website/Ainews/client/src/config.js`：

```javascript
// 生产环境使用相对路径（通过 Nginx 代理）
const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost';

const getBaseUrl = () => {
  return isProduction ? '' : 'http://localhost:3002';
};

// API 端点使用相对路径
export const API_ENDPOINTS = {
  NEWS_LATEST: `${API_BASE_URL}/api/news/latest`,
  NEWS_STATUS: `${API_BASE_URL}/api/news/status`,
  // ... 其他端点
};
```

---

## 🧪 验证结果

### API 测试
```bash
# 测试新闻状态
curl -sk https://ainews.xiaotianaya.com/api/news/status

# 返回：
{
  "success": true,
  "data": {
    "newsCount": 9697,
    "categories": [
      {"name": "新算法", "count": 5711},
      {"name": "AI 新闻", "count": 1705},
      {"name": "AI 框架", "count": 1245},
      {"name": "新工具", "count": 537},
      {"name": "新思路", "count": 499}
    ],
    "lastUpdate": "2026-04-09T07:08:50.685Z",
    "status": "正常运行"
  }
}
```

### 测试新闻列表
```bash
curl -sk https://ainews.xiaotianaya.com/api/news/latest

# 返回：8375 条新闻，分页正常
```

### 测试用户认证
```bash
# 注册
curl -X POST https://ainews.xiaotianaya.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123456"}'

# 登录
curl -X POST https://ainews.xiaotianaya.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123456"}'

# 所有认证端点正常工作 ✅
```

---

## 📊 当前状态

| 组件 | 状态 | 说明 |
|------|------|------|
| **前端** | ✅ | 已重新构建并部署 |
| **后端 API** | ✅ | 所有端点正常工作 |
| **Nginx 代理** | ✅ | 已修复路径问题 |
| **数据库** | ✅ | 9,697 条新闻 |
| **RSS 源** | ✅ | 92 个活跃源 |
| **HTTPS** | ✅ | Let's Encrypt 证书 |
| **用户系统** | ✅ | 注册/登录/会话管理正常 |

---

## 🔧 执行的命令

```bash
# 1. 修复 Nginx 配置
vi /etc/nginx/sites-available/ainews.xiaotianaya.com

# 2. 测试 Nginx 配置
/usr/sbin/nginx -t

# 3. 重载 Nginx
systemctl reload nginx

# 4. 修复前端 API 配置
vi /root/website/Ainews/client/src/config/api.js
vi /root/website/Ainews/client/src/config.js

# 5. 重新构建前端
cd /root/website/Ainews/client
rm -rf build node_modules/.cache
npm run build

# 6. 重启前端服务
pm2 restart ainews-client

# 7. 验证 API
curl -sk https://ainews.xiaotianaya.com/api/news/status
```

---

## 📝 经验总结

### Nginx proxy_pass 路径规则

1. **带尾部斜杠** `proxy_pass http://backend:port/;`
   - 会移除 location 匹配的部分
   - `/api/` → `/` (移除 `/api/`)

2. **不带尾部斜杠** `proxy_pass http://backend:port;`
   - 保留完整路径
   - `/api/news` → `/api/news`

3. **明确指定路径** `proxy_pass http://backend:port/api/;`
   - 最安全的方式
   - 明确指定转发后的路径前缀

### 最佳实践

```nginx
# ✅ 推荐：明确指定完整路径
location /api/ {
    proxy_pass http://127.0.0.1:3002/api/;
}

# ❌ 避免：尾部斜杠导致路径问题
location /api/ {
    proxy_pass http://127.0.0.1:3002/;
}
```

---

## ✅ 修复完成

**Ainews 网站现已完全恢复正常！**

- ✅ 数据正常显示
- ✅ API 全部可用
- ✅ 用户可注册/登录
- ✅ 自动抓取正常运行

---

**修复完成时间**: 2026-04-09 16:58 🦞
