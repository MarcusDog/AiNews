// HTML Feed Service - HTML 列表页 → RSS 转换层
// 用于 rss-parser 无法解析的国内站（如 36氪、极客时间、掘金 等返回 HTML 的源）
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

// 通用抽取规则：每条新闻通常包含「标题 + 链接 + 时间」三要素
// 不同站结构差异大，使用通用选择器 + 站点自定义选择器
const SITE_CONFIGS = {
  // 虎嗅
  '虎嗅': {
    url: 'https://www.huxiu.com',
    listSelector: 'a[href*="huxiu.com/article/"]',
    linkBase: 'https://www.huxiu.com',
    requireHref: /huxiu\.com\/article\/\d+\.html$/,
    excludeTitle: /(首页|登录|注册|订阅|下载|客户端|更多|关于|App|微博)/,
  },

  // CSDN AI
  'CSDN AI': {
    url: 'https://blog.csdn.net/nav/ai',
    listSelector: 'a[href*="blog.csdn.net"][href*="/article/details/"]',
    linkBase: 'https://blog.csdn.net',
    requireHref: /\/article\/details\/\d+/,
    excludeTitle: /(首页|登录|注册|订阅|下载|客户端|更多)/,
  },

  // GitHub Trending
  'GitHub Trending': {
    url: 'https://github.com/trending',
    listSelector: 'article h2 a',
    linkBase: 'https://github.com',
    requireHref: /github\.com\/[^/]+\/[^/]+$/,
    excludeTitle: /^[\s\n]*$/,
  },

  // GitHub Topic AI
  'GitHub Topic AI': {
    url: 'https://github.com/topics/artificial-intelligence',
    listSelector: 'article h1 a, article h3 a',
    linkBase: 'https://github.com',
    requireHref: /github\.com\/[^/]+\/[^/]+$/,
  },

  // IndieHackers
  'IndieHackers': {
    url: 'https://www.indiehackers.com',
    listSelector: 'a[href*="/post/"]',
    linkBase: 'https://www.indiehackers.com',
    requireHref: /indiehackers\.com\/post\//,
  },

  // MiniMax 官方动态
  'MiniMax 官方': {
    url: 'https://www.minimaxi.com/news',
    listSelector: 'article, .news-item, a[href*="/news/"]',
    titleSelector: 'h1, h2, h3, .title',
    linkBase: 'https://www.minimaxi.com',
    dateSelector: 'time, .date',
  },

  // 智谱 GLM
  '智谱 GLM 官方': {
    url: 'https://www.zhipuai.cn/news',
    listSelector: 'article, .news-item, a[href*="/news/"]',
    titleSelector: 'h1, h2, h3, .title',
    linkBase: 'https://www.zhipuai.cn',
    dateSelector: 'time, .date',
  },

  // PaperWeekly 知乎专栏
  'PaperWeekly': {
    url: 'https://zhuanlan.zhihu.com/paperweekly',
    listSelector: '.PostCard, .PostList-item, article',
    titleSelector: '.PostCard-title, .ContentItem-title',
    linkBase: 'https://zhuanlan.zhihu.com',
    dateSelector: () => null,
  },
};

class HTMLFeedService {
  constructor() {
    this.cacheFile = null;  // 不缓存，每日重新抓
  }

  async fetchAsRSSItems(sourceName) {
    const cfg = SITE_CONFIGS[sourceName];
    if (!cfg) return [];

    try {
      const resp = await axios.get(cfg.url, {
        timeout: 15000,
        // 用简单 UA 避免国内站反爬（虎嗅、CSDN 等对真实浏览器 UA 返回空 challenge）
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        validateStatus: s => s < 500,
      });

      if (!resp.data || resp.status >= 400) return [];

      const $ = cheerio.load(typeof resp.data === 'string' ? resp.data : '');
      const items = [];

      // 第一轮：站点特定的 listSelector
      let nodes = $(cfg.listSelector);
      // 第二轮兜底：抓所有 <a> 含 href 且文本长度合理的链接
      if (nodes.length === 0) {
        nodes = $('a').filter((_, el) => {
          const href = $(el).attr('href') || '';
          const txt = $(el).text().trim();
          return txt.length >= 8 && txt.length <= 200 && !href.startsWith('#');
        });
      }

      const seen = new Set();
      nodes.each((_, el) => {
        let titleText = '';
        let href = '';

        // 节点本身是 <a> 还是容器？
        if (el.tagName === 'a') {
          titleText = $(el).text().trim();
          href = $(el).attr('href') || '';
        } else {
          // 容器：先按 titleSelector 找标题，再找链接
          const titleEl = cfg.titleSelector ? $(el).find(cfg.titleSelector).first() : null;
          titleText = titleEl ? titleEl.text().trim() : $(el).text().trim().split('\n')[0];
          const aEl = $(el).find('a[href]').first();
          href = aEl ? (aEl.attr('href') || '') : '';
          // 没有 titleSelector 且文本过长，尝试去内部第一个 <a>
          if (!titleText || titleText.length > 200) {
            const firstLink = $(el).find('a[href]').first();
            if (firstLink.length) {
              titleText = firstLink.text().trim();
              if (!href) href = firstLink.attr('href') || '';
            }
          }
        }

        // 清理空白
        titleText = titleText.replace(/\s+/g, ' ').trim();

        if (!titleText || titleText.length < 8 || titleText.length > 200) return;
        if (!href) return;
        if (cfg.requireHref && !cfg.requireHref.test(href)) return;
        if (cfg.excludeTitle && cfg.excludeTitle.test(titleText)) return;

        // 拼绝对 URL
        let fullUrl = href;
        if (href.startsWith('/')) fullUrl = cfg.linkBase + href;
        else if (!href.startsWith('http')) fullUrl = cfg.linkBase + '/' + href;
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);

        // 时间（尽力而为）
        let publishedAt = new Date();
        if (typeof cfg.dateSelector === 'function') {
          publishedAt = cfg.dateSelector($, el) || publishedAt;
        } else if (cfg.dateSelector) {
          const dateEl = $(el).find(cfg.dateSelector).first();
          if (dateEl.length) {
            const dt = dateEl.attr('datetime') || dateEl.text().trim();
            const parsed = Date.parse(dt);
            if (!isNaN(parsed)) publishedAt = new Date(parsed);
          }
        }

        items.push({
          id: 'html_' + Buffer.from(fullUrl).toString('base64url').slice(0, 20),
          title: titleText,
          description: '',
          url: fullUrl,
          publishedAt: publishedAt.toISOString(),
          contentSnippet: titleText,
          pubDate: publishedAt.toUTCString(),
        });
        if (items.length >= 30) return false;  // 截断
      });

      return items;
    } catch (e) {
      console.warn(`[HTMLFeed] ${sourceName} 抓取失败:`, e.message);
      return [];
    }
  }

  async isHTMLFeedSupported(sourceName) {
    return !!SITE_CONFIGS[sourceName];
  }
}

module.exports = { HTMLFeedService, SITE_CONFIGS };