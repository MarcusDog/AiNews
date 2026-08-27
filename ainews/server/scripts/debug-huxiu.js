const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');

// 复制 HTMLFeedService 内嵌逻辑
const SITE_CONFIGS = {
  '虎嗅': {
    url: 'https://www.huxiu.com',
    listSelector: 'a[href*="huxiu.com/article/"]',
    linkBase: 'https://www.huxiu.com',
    requireHref: /huxiu\.com\/article\/\d+\.html$/,
    excludeTitle: /(首页|登录|注册|订阅|下载|客户端|更多|关于|App|微博)/,
  },
};

(async () => {
  const cfg = SITE_CONFIGS['虎嗅'];
  const resp = await axios.get(cfg.url, {
    timeout: 12000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
    httpsAgent: new https.Agent({ rejectUnauthorized: false })
  });
  const $ = cheerio.load(resp.data);
  const items = [];
  let nodes = $(cfg.listSelector);
  console.log('nodes count:', nodes.length);
  nodes.each((_, el) => {
    let titleText = el.tagName === 'a' ? $(el).text().trim() : '';
    let href = el.tagName === 'a' ? $(el).attr('href') || '' : '';
    titleText = titleText.replace(/\s+/g, ' ').trim();
    if (!titleText || titleText.length < 8 || titleText.length > 200) return;
    if (!href) return;
    if (cfg.requireHref && !cfg.requireHref.test(href)) return;
    if (cfg.excludeTitle && cfg.excludeTitle.test(titleText)) return;
    items.push({ title: titleText, href });
  });
  console.log('items count:', items.length);
  items.slice(0, 5).forEach(i => console.log(' •', i.title.slice(0, 50), '→', i.href));
})();
