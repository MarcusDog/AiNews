const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // 代理API请求到后端服务器
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:3002',
      changeOrigin: true,
      // 不重写路径，保留 /api 前缀，因为后端路由使用 /api/news
      onError: (err, req, res) => {
        console.error('代理错误:', err.message);
        res.status(500).json({ error: '无法连接到后端服务器' });
      },
      onProxyReq: (proxyReq, req, res) => {
        console.log(`[代理] ${req.method} ${req.url} -> http://localhost:3002${req.url}`);
      },
    })
  );
};