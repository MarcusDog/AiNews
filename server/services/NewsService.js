const RSSParser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');
const DatabaseService = require('./DatabaseService');
const { AI_FILTER_KEYWORDS, NEWS_SOURCES, normalizeCategory } = require('../config/newsSources');

// 代理配置 - 从环境变量读取
const PROXY_URL = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
const proxyAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : null;
if (proxyAgent) {
  console.log(`[Proxy] 使用代理: ${PROXY_URL}`);
}

// 备用RSS解析器（使用cheerio手动解析）
const fallbackRSSParser = {
  parseString: async (xmlString) => {
    try {
      const $ = cheerio.load(xmlString, { xmlMode: true });
      const items = [];
      
      $('item').each((i, elem) => {
        const $item = $(elem);
        items.push({
          title: $item.find('title').text().trim(),
          link: $item.find('link').text().trim(),
          description: $item.find('description').text().trim(),
          pubDate: $item.find('pubDate').text().trim(),
          guid: $item.find('guid').text().trim()
        });
      });
      
      // Atom格式支持
      if (items.length === 0) {
        $('entry').each((i, elem) => {
          const $item = $(elem);
          items.push({
            title: $item.find('title').text().trim(),
            link: $item.find('link').attr('href') || $item.find('link').text().trim(),
            description: $item.find('summary, content').text().trim(),
            pubDate: $item.find('published, updated').text().trim(),
            guid: $item.find('id').text().trim()
          });
        });
      }
      
      return {
        items: items,
        title: $('channel > title, feed > title').text().trim(),
        description: $('channel > description, feed > subtitle').text().trim()
      };
    } catch (error) {
      throw new Error(`备用解析器失败: ${error.message}`);
    }
  }
};

class NewsService {
  constructor() {
    // 配置更宽松的RSS解析器
    this.rssParser = new RSSParser({
      customFields: {
        item: ['content:encoded', 'dc:creator', 'category', 'enclosure', 'media:content']
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 20000,
      maxRedirects: 5
    });
    
    // 内存缓存（用于快速访问）
    this.newsCache = new Map();
    this.categories = new Set();
    this.updateTime = null;
    this.isUpdating = false;
    this.hasPrunedIrrelevantNews = false;
    this.hasPrunedLowQualityNews = false;
    this.hasPrunedDuplicateNews = false;
    this.hasReclassifiedStoredNews = false;
    
    // 缓存配置
    this.MEMORY_CACHE_DURATION = 5 * 60 * 1000; // 5分钟内存缓存
    this.FILE_CACHE_DURATION = 30 * 60 * 1000; // 30分钟文件缓存
    this.REQUEST_INTERVAL = 2000; // 请求间隔2秒
    this.MAX_CONCURRENT_REQUESTS = 2; // 最大并发数
    
    // 限流计数器
    this.requestCounts = new Map();
    this.lastRequestTime = new Map();
    
    // 缓存目录
    this.persistentCacheDir = path.join(__dirname, '../cache');
    if (!fs.existsSync(this.persistentCacheDir)) {
      fs.mkdirSync(this.persistentCacheDir, { recursive: true });
    }
    
    // WebSocket实例（将在index.js中设置）
    this.io = null;
    
    // 扩展的RSS源配置 - 包含更多中英文源
    this.rssSources = [
      // ========== 高优先级源（最稳定）==========
      {
        name: 'arXiv AI',
        url: 'https://arxiv.org/rss/cs.AI',
        category: '新算法',
        priority: 1,
        timeout: 30000,
        rateLimit: 10
      },
      {
        name: 'arXiv Computation and Language',
        url: 'https://arxiv.org/rss/cs.CL',
        category: '新算法',
        priority: 1,
        timeout: 30000,
        rateLimit: 10
      },
      {
        name: 'arXiv Computer Vision',
        url: 'https://arxiv.org/rss/cs.CV',
        category: '新算法',
        priority: 1,
        timeout: 30000,
        rateLimit: 10
      },
      {
        name: 'arXiv Machine Learning',
        url: 'https://arxiv.org/rss/cs.LG',
        category: '新算法',
        priority: 1,
        timeout: 30000,
        rateLimit: 10
      },
      {
        name: 'Hugging Face Blog',
        url: 'https://huggingface.co/blog/feed.xml',
        category: 'AI框架',
        priority: 1,
        timeout: 25000,
        rateLimit: 20,
        enabled: false
      },

      // ========== 大厂AI博客（中优先级）==========
      {
        name: 'OpenAI Blog',
        url: 'https://openai.com/blog/rss.xml',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Google AI Blog',
        url: 'https://blog.google/technology/ai/rss/',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'DeepMind Blog',
        url: 'https://deepmind.google/discover/blog/rss.xml',
        category: '新思路',
        priority: 2,
        timeout: 25000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Meta AI Blog',
        url: 'https://ai.meta.com/blog/rss/',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Microsoft AI Blog',
        url: 'https://blogs.microsoft.com/ai/feed/',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'NVIDIA Blog',
        url: 'https://blogs.nvidia.com/feed/',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Amazon AWS AI Blog',
        url: 'https://aws.amazon.com/blogs/machine-learning/feed/',
        category: 'AI框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Anthropic Research',
        url: 'https://www.anthropic.com/research/rss.xml',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },

      // ========== 科技媒体 ==========
      {
        name: 'MIT Tech Review AI',
        url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'WIRED AI',
        url: 'https://www.wired.com/feed/tag/ai/latest/rss',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Ars Technica AI',
        url: 'https://feeds.arstechnica.com/arstechnica/technology-lab',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'VentureBeat AI',
        url: 'https://venturebeat.com/category/ai/feed/',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'TechCrunch AI',
        url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'The Verge AI',
        url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },

      // ========== 中文RSS源 ==========
      {
        name: '机器之心',
        url: 'https://www.jiqizhixin.com/rss',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        language: 'zh',
        enabled: false
      },
      {
        name: '量子位',
        url: 'https://www.qbitai.com/feed',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        language: 'zh',
        enabled: false
      },
      {
        name: 'PaperWeekly',
        url: 'https://www.paperweekly.site/rss',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        language: 'zh',
        enabled: false
      },
      {
        name: 'AI科技大本营',
        url: 'https://blog.csdn.net/dQCFKyQDXYm3F8rB0/rss/list',
        category: 'AI新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        language: 'zh',
        enabled: false
      },
      
      // ========== 学习资源 ==========
      {
        name: 'Towards Data Science',
        url: 'https://towardsdatascience.com/feed',
        category: '新算法',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Machine Learning Mastery',
        url: 'https://machinelearningmastery.com/feed/',
        category: '新思路',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'The Batch (deeplearning.ai)',
        url: 'https://charonhub.deeplearning.ai/rss/',
        category: '新思路',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Analytics Vidhya',
        url: 'https://www.analyticsvidhya.com/feed/',
        category: '新算法',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'KDnuggets',
        url: 'https://www.kdnuggets.com/feed',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Distill.pub',
        url: 'https://distill.pub/rss.xml',
        category: '新算法',
        priority: 3,
        timeout: 20000,
        rateLimit: 60
      },
      
      // ========== 框架和工具 ==========
      {
        name: 'PyTorch Blog',
        url: 'https://pytorch.org/blog/feed.xml',
        category: 'AI框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'TensorFlow Blog',
        url: 'https://blog.tensorflow.org/feeds/posts/default?alt=rss',
        category: 'AI框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'LangChain Blog',
        url: 'https://blog.langchain.dev/rss/',
        category: 'AI框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'OpenCV Blog',
        url: 'https://opencv.org/feed/',
        category: 'AI框架',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      
      // ========== AI工具和产品 ==========
      {
        name: 'Product Hunt AI',
        url: 'https://www.producthunt.com/feed?category=artificial-intelligence',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'AI Tools Weekly',
        url: 'https://aitoolsweekly.com/feed',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 60,
        enabled: false
      },
      
      // ========== 研究机构 ==========
      {
        name: 'Stanford AI Lab',
        url: 'https://ai.stanford.edu/blog/feed.xml',
        category: '新思路',
        priority: 2,
        timeout: 25000,
        rateLimit: 30
      },
      {
        name: 'Berkeley AI Research',
        url: 'https://bair.berkeley.edu/blog/feed.xml',
        category: '新思路',
        priority: 2,
        timeout: 25000,
        rateLimit: 30
      },
      {
        name: 'CMU Machine Learning',
        url: 'https://blog.ml.cmu.edu/feed/',
        category: '新算法',
        priority: 2,
        timeout: 25000,
        rateLimit: 30
      },
      
      // ========== 通讯和周刊 ==========
      {
        name: 'AI Weekly',
        url: 'http://aiweekly.co/issues.rss',
        category: 'AI新闻',
        priority: 3,
        timeout: 15000,
        rateLimit: 60
      },
      {
        name: 'Last Week in AI',
        url: 'https://lastweekin.ai/feed',
        category: 'AI新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 60
      },
      {
        name: 'Import AI',
        url: 'https://jack-clark.net/feed/',
        category: '新思路',
        priority: 3,
        timeout: 20000,
        rateLimit: 60
      },
      
      // ========== 更多数据源（2026年扩充）==========
      {
        name: 'Cohere Blog',
        url: 'https://cohere.com/blog/rss',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false,
        enabled: false
      },
      {
        name: 'Mistral AI Blog',
        url: 'https://mistral.ai/news/rss.xml',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false,
        enabled: false
      },
      {
        name: 'Stability AI Blog',
        url: 'https://stability.ai/blog/rss',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false,
        enabled: false
      },
      {
        name: 'Apple Machine Learning',
        url: 'https://machinelearning.apple.com/rss',
        category: '新算法',
        priority: 2,
        timeout: 25000,
        rateLimit: 30,
        enabled: false,
        enabled: false
      },
      {
        name: 'Salesforce AI Research',
        url: 'https://blog.salesforceairesearch.com/rss/',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false,
        enabled: false
      },
      {
        name: 'AI2 Blog',
        url: 'https://blog.allenai.org/feed',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false,
        enabled: false
      },
      {
        name: 'EleutherAI Blog',
        url: 'https://blog.eleuther.ai/rss.xml',
        category: 'AI框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false,
        enabled: false
      },
      {
        name: 'Replicate Blog',
        url: 'https://replicate.com/blog/rss',
        category: '新工具',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Weights & Biases',
        url: 'https://wandb.ai/site/rss',
        category: 'AI框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false,
        enabled: false
      },
      {
        name: 'Pinecone Blog',
        url: 'https://pinecone.io/blog/rss',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false,
        enabled: false
      },
      {
        name: 'Chroma Blog',
        url: 'https://trychroma.com/blog/rss',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false,
        enabled: false
      },
      {
        name: 'LlamaIndex Blog',
        url: 'https://blog.llamaindex.ai/rss',
        category: 'AI框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false,
        enabled: false
      },
      {
        name: 'Ollama Blog',
        url: 'https://ollama.ai/blog/rss',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false,
        enabled: false
      },
      {
        name: 'AI Tool Report',
        url: 'https://aitoolreport.com/feed/',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Ben’s Bites AI',
        url: 'https://www.bensbites.com/feed',
        category: 'AI新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'FutureTools AI',
        url: 'https://futuretools.io/news/rss',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'MIT CSAIL',
        url: 'https://www.csail.mit.edu/research/rss',
        category: '新算法',
        priority: 2,
        timeout: 25000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Oxford AI Research',
        url: 'https://www.oxford.ai/news/rss',
        category: '新思路',
        priority: 2,
        timeout: 25000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Google DeepMind Safety',
        url: 'https://deepmind.google/discover/blog/safety/rss.xml',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },

      // ========== 2026-04 最新联网核验新增源 ==========
      {
        name: 'arXiv Neural and Evolutionary Computing',
        url: 'https://arxiv.org/rss/cs.NE',
        category: '新算法',
        priority: 1,
        timeout: 30000,
        rateLimit: 10
      },
      {
        name: 'arXiv Robotics',
        url: 'https://arxiv.org/rss/cs.RO',
        category: '新算法',
        priority: 1,
        timeout: 30000,
        rateLimit: 10
      },
      {
        name: 'arXiv Information Retrieval',
        url: 'https://arxiv.org/rss/cs.IR',
        category: '新算法',
        priority: 1,
        timeout: 30000,
        rateLimit: 10
      },
      {
        name: 'arXiv Statistical Machine Learning',
        url: 'https://arxiv.org/rss/stat.ML',
        category: '新算法',
        priority: 1,
        timeout: 30000,
        rateLimit: 10
      },
      {
        name: 'arXiv Audio and Speech Processing',
        url: 'https://arxiv.org/rss/eess.AS',
        category: '新算法',
        priority: 1,
        timeout: 30000,
        rateLimit: 10
      },
      {
        name: 'arXiv Human-Computer Interaction',
        url: 'https://arxiv.org/rss/cs.HC',
        category: '新思路',
        priority: 2,
        timeout: 30000,
        rateLimit: 10
      },
      {
        name: 'arXiv Multiagent Systems',
        url: 'https://arxiv.org/rss/cs.MA',
        category: '新思路',
        priority: 2,
        timeout: 30000,
        rateLimit: 10
      },
      {
        name: 'Google Research Blog',
        url: 'https://research.google/blog/rss/',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'GitHub AI Tag',
        url: 'https://github.blog/tag/ai/feed/',
        category: '新工具',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Together AI Blog',
        url: 'https://www.together.ai/blog/rss.xml',
        category: 'AI框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Weaviate Blog',
        url: 'https://weaviate.io/blog/rss.xml',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'MIT News AI',
        url: 'https://news.mit.edu/rss/topic/artificial-intelligence2',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Google Developers AI Tools',
        url: 'https://blog.google/innovation-and-ai/technology/developers-tools/rss/',
        category: 'AI框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'JetBrains AI Blog',
        url: 'https://blog.jetbrains.com/ai/feed/',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Lilian Weng Blog',
        url: 'https://lilianweng.github.io/index.xml',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Modal Blog',
        url: 'https://modal.com/blog/atom.xml',
        category: 'AI框架',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Answer.AI Blog',
        url: 'https://www.answer.ai/index.xml',
        category: '新思路',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'The Register AI',
        url: 'https://www.theregister.com/software/ai_ml/headlines.atom',
        category: 'AI新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'InfoQ AI ML Data Engineering',
        url: 'https://feed.infoq.com/ai-ml-data-eng',
        category: 'AI新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Roboflow Blog',
        url: 'https://blog.roboflow.com/rss/',
        category: 'AI框架',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Adept Blog',
        url: 'https://www.adept.ai/blog/rss.xml',
        category: 'AI新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },

      // ========== 2026-04 第二批联网核验新增源 ==========
      {
        name: 'The Gradient',
        url: 'https://thegradient.pub/rss/',
        category: '新思路',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        sourceGroup: 'research'
      },
      {
        name: 'Chip Huyen',
        url: 'https://huyenchip.com/feed.xml',
        category: '新思路',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        sourceGroup: 'research'
      },
      {
        name: 'Tom Tunguz',
        url: 'https://tomtunguz.com/index.xml',
        category: 'AI新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        sourceGroup: 'investment'
      },
      {
        name: 'Latent Space',
        url: 'https://www.latent.space/feed',
        category: 'AI框架',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        sourceGroup: 'engineering'
      },
      {
        name: 'Simon Willison',
        url: 'https://simonwillison.net/atom/everything/',
        category: 'AI框架',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        sourceGroup: 'engineering'
      },
      {
        name: 'Runpod Blog',
        url: 'https://www.runpod.io/blog/rss.xml',
        category: 'AI框架',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false,
        sourceGroup: 'engineering'
      },
      {
        name: 'The Sequence',
        url: 'https://thesequence.substack.com/feed',
        category: 'AI新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false,
        sourceGroup: 'investment'
      },
      {
        name: 'AI Snake Oil',
        url: 'https://www.normaltech.ai/feed',
        category: '新思路',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        sourceGroup: 'research'
      },

      // ========== 2026-04-18 新增稳定源（替代 arXiv 周末停用）==========
      {
        name: 'Assembly AI Blog',
        url: 'https://www.assemblyai.com/blog/feed/',
        category: 'AI 框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Hugging Face Papers',
        url: 'https://huggingface.co/papers/rss',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'AlphaSignal AI',
        url: 'https://alphasignal.ai/newsletter/archive/rss',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Dair AI',
        url: 'https://www.dair.ai/feed',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Sebastian Raschka Blog',
        url: 'https://sebastianraschka.com/rss.xml',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Jay Alammar Blog',
        url: 'https://jalammar.github.io/feed.xml',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'MLOps Community',
        url: 'https://mlops.community/rss/',
        category: 'AI 框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'DeepLearning.AI News',
        url: 'https://www.deeplearning.ai/newsletter/rss/',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'FAIR Blog',
        url: 'https://ai.facebook.com/blog/feed/',
        category: 'AI 新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'IBM Research AI',
        url: 'https://research.ibm.com/blog/rss',
        category: 'AI 新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Element AI Blog',
        url: 'https://www.elementai.com/news/rss',
        category: 'AI 新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Papers With Code',
        url: 'https://paperswithcode.com/api/v1/latest/',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },

      // ========== 2026-04-18 第二轮新增（高稳定性源）==========
      {
        name: 'Andrej Karpathy Blog',
        url: 'https://karpathy.ai/feed.xml',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Yann LeCun Blog',
        url: 'https://yann.lecun.com/rss',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Andrew Ng Blog',
        url: 'https://www.andrewng.org/feed/',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Fast.ai Blog',
        url: 'https://www.fast.ai/posts.xml',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Colah Blog',
        url: 'https://colah.github.io/rss.xml',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Distill.pub',
        url: 'https://distill.pub/rss.xml',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },

      // ========== 2026-04-18 第三轮新增（高稳定性源）==========
      {
        name: 'MIT CSAIL News',
        url: 'https://www.csail.mit.edu/news/rss',
        category: 'AI 新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Cornell AI Research',
        url: 'https://cornell.edu/rss',
        category: '新算法',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Princeton AI Lab',
        url: 'https://ai.princeton.edu/rss',
        category: '新思路',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'CMU AI Blog',
        url: 'https://www.cs.cmu.edu/~ai-blog/rss.xml',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'UCLA AI',
        url: 'https://ucla.ai/rss',
        category: '新算法',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Google AI Blog',
        url: 'https://ai.google/blog/rss/',
        category: 'AI 新闻',
        priority: 1,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'OpenAI Research',
        url: 'https://openai.com/research/rss',
        category: '新算法',
        priority: 1,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Anthropic Blog',
        url: 'https://www.anthropic.com/blog/rss',
        category: 'AI 新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Cohere Blog',
        url: 'https://cohere.com/blog/rss',
        category: 'AI 框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Mistral AI Blog',
        url: 'https://mistral.ai/news/rss.xml',
        category: 'AI 新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Stability AI Blog',
        url: 'https://stability.ai/blog/rss',
        category: 'AI 新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Character.AI Blog',
        url: 'https://blog.character.ai/rss',
        category: 'AI 新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Inflection AI Blog',
        url: 'https://inflection.ai/blog/rss',
        category: 'AI 新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Adept AI Blog',
        url: 'https://www.adept.ai/blog/rss.xml',
        category: 'AI 新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'DeepMind Safety',
        url: 'https://deepmind.google/discover/blog/safety/rss.xml',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Apple Machine Learning',
        url: 'https://machinelearning.apple.com/rss',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Salesforce AI Research',
        url: 'https://blog.salesforceairesearch.com/rss/',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'AI2 Blog',
        url: 'https://blog.allenai.org/feed',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'EleutherAI Blog',
        url: 'https://blog.eleuther.ai/rss.xml',
        category: 'AI 框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Weights & Biases',
        url: 'https://wandb.ai/site/rss',
        category: 'AI 框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Pinecone Blog',
        url: 'https://pinecone.io/blog/rss',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Chroma Blog',
        url: 'https://trychroma.com/blog/rss',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'LlamaIndex Blog',
        url: 'https://blog.llamaindex.ai/rss',
        category: 'AI 框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Ollama Blog',
        url: 'https://ollama.ai/blog/rss',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Hugging Face Daily Papers',
        url: 'https://huggingface.co/papers',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'AI Breakdown',
        url: 'https://aibreakdown.substack.com/feed',
        category: 'AI 新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'The Batch AI',
        url: 'https://www.deeplearning.ai/the-batch/rss/',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'NVIDIA Research',
        url: 'https://nvlabs.github.io/rss.xml',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'Intel AI Blog',
        url: 'https://www.intel.com/content/www/us/en/developer/tools/oneapi/ai-analytics-toolkit.html/rss',
        category: 'AI 框架',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        enabled: false
      },
      {
        name: 'AWS Machine Learning',
        url: 'https://aws.amazon.com/blogs/machine-learning/feed/',
        category: 'AI 框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      // ========== 新增源（2026扩充，每2小时抓取）==========
      // 中文AI媒体
      {
        name: '机器之心',
        url: 'https://www.jiqizhixin.com/rss',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        language: 'zh',
        source_group: 'research'
      },
      {
        name: '量子位',
        url: 'https://www.qbitai.com/feed',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        language: 'zh',
        source_group: 'product'
      },
      {
        name: 'AI新智讯',
        url: 'https://www.aixinzhixun.com/rss',
        category: 'AI新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        language: 'zh',
        source_group: 'product'
      },
      {
        name: '36氪AI',
        url: 'https://36kr.com/feed',
        category: 'AI新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        language: 'zh',
        source_group: 'investment'
      },
      {
        name: 'InfoQ AI',
        url: 'https://www.infoq.cn/feed',
        category: 'AI新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        language: 'zh',
        source_group: 'engineering'
      },
      {
        name: 'CSDN AI',
        url: 'https://blog.csdn.net/nav/ai/rss',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        language: 'zh',
        source_group: 'engineering'
      },
      // 国际AI媒体
      {
        name: 'VentureBeat AI',
        url: 'https://venturebeat.com/category/ai/feed/',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'The Verge AI',
        url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Ars Technica AI',
        url: 'https://feeds.arstechnica.com/arstechnica/features',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'ZDNET AI',
        url: 'https://www.zdnet.com/topic/artificial-intelligence/rss.xml',
        category: 'AI新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'AI News',
        url: 'https://www.artificialintelligence-news.com/feed/',
        category: 'AI新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      // AI工具与产品
      {
        name: 'Product Hunt AI',
        url: 'https://www.producthunt.com/feed?category=artificial-intelligence',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'There Is An AI For That',
        url: 'https://theresanaiforthat.com/rss/',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      // 研究机构
      {
        name: 'Stanford AI Lab',
        url: 'https://ai.stanford.edu/blog/feed.xml',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Berkeley AI Research',
        url: 'https://bair.berkeley.edu/blog/feed.xml',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'CMU Machine Learning',
        url: 'https://blog.ml.cmu.edu/feed/',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'MIT CSAIL',
        url: 'https://www.csail.mit.edu/rss.xml',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      // AI周报与通讯
      {
        name: 'Last Week in AI',
        url: 'https://lastweekin.ai/feed',
        category: 'AI新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Import AI',
        url: 'https://importai.net/feed',
        category: '新思路',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Ben\'s Bites',
        url: 'https://bensbites.com/feed',
        category: 'AI新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      }
    ];

    this.rssSources = NEWS_SOURCES.map((source) => ({
      ...source,
      category: normalizeCategory(source.category),
      sourceGroup: this.inferSourceGroup(source)
    }));

    // API配置
    this.apiSources = {
      newsapi: {
        name: 'NewsAPI',
        url: 'https://newsapi.org/v2/everything',
        params: {
          q: 'artificial intelligence OR machine learning OR deep learning',
          sortBy: 'publishedAt',
          language: 'en',
          pageSize: 20,
          apiKey: process.env.NEWSAPI_KEY || null
        },
        rateLimit: 100, // 每天100次（免费版）
        dailyLimit: true
      }
    };
    
    // 日请求计数（用于NewsAPI限制）
    this.dailyRequestCount = 0;
    this.lastResetDate = new Date().toDateString();
  }

  inferSourceGroup(source = {}) {
    if (source.sourceGroup) {
      return source.sourceGroup;
    }

    const text = `${source.name || ''} ${source.category || ''} ${source.url || ''}`.toLowerCase();
    const hasAny = (keywords) => keywords.some((keyword) => text.includes(keyword));

    if (hasAny([
      'arxiv',
      'research',
      'stanford',
      'berkeley',
      'cmu',
      'csail',
      'oxford',
      'distill',
      'lilian weng',
      'chip huyen',
      'the gradient',
      'ai snake oil',
      'apple machine learning',
      'safety'
    ])) {
      return 'research';
    }

    if (hasAny([
      'hugging face',
      'pytorch',
      'tensorflow',
      'langchain',
      'aws',
      'nvidia',
      'opencv',
      'weights & biases',
      'pinecone',
      'chroma',
      'llamaindex',
      'ollama',
      'replicate',
      'modal',
      'infoq',
      'jetbrains',
      'github',
      'weaviate',
      'roboflow',
      'google developers',
      'runpod',
      'latent space',
      'simon willison'
    ])) {
      return 'engineering';
    }

    if (hasAny([
      'venturebeat',
      'techcrunch',
      'mit tech review',
      'wired',
      'the verge',
      'product hunt',
      'ai tools weekly',
      'ai tool report',
      'ben’s bites',
      'ben\'s bites',
      'futuretools',
      'ai weekly',
      'last week in ai',
      'import ai',
      'tom tunguz',
      'the sequence'
    ])) {
      return 'investment';
    }

    return 'product';
  }

  getSourceGroupLabel(group) {
    const labels = {
      research: '研究',
      product: '产品',
      engineering: '工程',
      investment: '投资'
    };
    return labels[group] || '产品';
  }

  getSourceGroupOrder(group) {
    const order = {
      research: 0,
      product: 1,
      engineering: 2,
      investment: 3
    };
    return order[group] ?? 99;
  }

  getSourceMetadataMap() {
    return new Map(
      this.rssSources.map((source) => [
        source.name,
        {
          ...source,
          sourceGroup: this.inferSourceGroup(source),
          sourceGroupLabel: this.getSourceGroupLabel(this.inferSourceGroup(source))
        }
      ])
    );
  }

  getActiveRssSources() {
    return this.rssSources.filter((source) => source.enabled !== false);
  }

  getSchedulableSources(statusRows = []) {
    const disabledNames = new Set(
      statusRows
        .filter((row) => Number(row.is_active) === 0)
        .map((row) => row.name)
    );
    return this.getActiveRssSources().filter((source) => !disabledNames.has(source.name));
  }

  normalizePagination({ page = 1, limit = 20 } = {}) {
    const parsedPage = Number.parseInt(page, 10);
    const parsedLimit = Number.parseInt(limit, 10);
    return {
      page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      limit: Math.min(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20, 100)
    };
  }

  createEmptyNewsResult({ page = 1, limit = 20 } = {}) {
    return {
      data: [],
      total: 0,
      page,
      limit,
      isDemo: false,
      syncing: true
    };
  }

  enrichArticleSourceMetadata(article = {}) {
    const metadata = this.getSourceMetadataMap().get(article.source) || {};
    const sourceGroup = metadata.sourceGroup || this.inferSourceGroup({ name: article.source });
    return {
      ...article,
      language: article.language || metadata.language || 'en',
      region: article.region || metadata.region || 'global',
      sourceGroup,
      sourceGroupLabel: this.getSourceGroupLabel(sourceGroup)
    };
  }

  normalizeArticleUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';

    try {
      const url = new URL(rawUrl.trim());
      const removableParams = new Set([
        'ref', 'source', 'from', 'spm', 'campaign', 'mc_cid', 'mc_eid'
      ]);

      url.hash = '';
      url.hostname = url.hostname.toLowerCase();
      [...url.searchParams.keys()].forEach((key) => {
        const normalizedKey = key.toLowerCase();
        if (normalizedKey.startsWith('utm_') || removableParams.has(normalizedKey)) {
          url.searchParams.delete(key);
        }
      });
      url.searchParams.sort();
      if (url.pathname !== '/') {
        url.pathname = url.pathname.replace(/\/+$/, '');
      }

      return url.toString().replace(/\/$/, '');
    } catch {
      return rawUrl.trim();
    }
  }

  getDuplicateArticleIds(articles = []) {
    const retainedByUrl = new Map();
    const duplicateIds = [];
    const qualityScore = (article) => {
      const canonicalIdentity = String(article.id || '').startsWith('article_') ? 100000 : 0;
      const imageQuality = article.image_url ? 10000 : 0;
      const descriptionQuality = Math.min(String(article.description || '').trim().length, 5000);
      return canonicalIdentity + imageQuality + descriptionQuality;
    };

    for (const article of articles) {
      if (!article?.id) continue;
      const canonicalUrl = this.normalizeArticleUrl(article.url);
      if (!canonicalUrl) continue;

      const retained = retainedByUrl.get(canonicalUrl);
      if (!retained) {
        retainedByUrl.set(canonicalUrl, article);
        continue;
      }

      if (qualityScore(article) > qualityScore(retained)) {
        duplicateIds.push(retained.id);
        retainedByUrl.set(canonicalUrl, article);
      } else {
        duplicateIds.push(article.id);
      }
    }

    return [...new Set(duplicateIds)];
  }

  async pruneDuplicateStoredNews() {
    if (this.hasPrunedDuplicateNews) return 0;

    const articles = await DatabaseService.all(
      'SELECT id, title, description, url, image_url FROM news'
    );
    const duplicateIds = this.getDuplicateArticleIds(articles);
    let removed = 0;

    for (let index = 0; index < duplicateIds.length; index += 200) {
      const batch = duplicateIds.slice(index, index + 200);
      const placeholders = batch.map(() => '?').join(',');
      const result = await DatabaseService.run(
        `DELETE FROM news WHERE id IN (${placeholders})`,
        batch
      );
      removed += result.changes || 0;
    }

    this.hasPrunedDuplicateNews = true;
    return removed;
  }

  normalizeCachedArticles(articles = [], source = {}) {
    const relevantArticles = articles.filter(
      (article) => article && this.isSourceItemRelevant(article, source)
    );
    return this.selectPublicFeedItems(relevantArticles, source)
      .map((article) => {
        const url = this.normalizeArticleUrl(article.url || article.link || '');
        const title = this.normalizePublicNewsTitle(article.title, source);
        const normalizedArticle = { ...article, title, url };
        return {
          ...normalizedArticle,
          id: this.generateArticleId({ ...normalizedArticle, link: url }, source),
          url,
          publishedAt: article.publishedAt || article.published_at || new Date(),
          category: this.classifyArticle(normalizedArticle, source),
          source: source.name || article.source,
          imageUrl: article.imageUrl || article.image_url || null,
          language: source.language || article.language || 'en',
          region: source.region || article.region || 'global'
        };
      });
  }

  isPublicNewsItem(item = {}, source = {}) {
    const title = String(item.title || '').replace(/\s+/g, ' ').trim();
    const sourceUrl = String(source.url || '');
    const itemUrl = String(item.url || item.link || '');
    if (!title) return false;

    // Git commit Atom 记录、提交详情和夜间构建标签属于工程流水，不进入公开新闻流。
    if (sourceUrl.includes('/commits/') || /github\.com\/[^/]+\/[^/]+\/commit\/[0-9a-f]{7,40}/i.test(itemUrl)) {
      return false;
    }
    if (/^(?:trunk|nightly|main|master|dev|canary)[/:_-][0-9a-f]{7,40}(?::|$)/i.test(title)) {
      return false;
    }
    if (/^[0-9a-f]{32,40}(?::|$)/i.test(title)) {
      return false;
    }
    if (sourceUrl.includes('/releases.atom') && /^b\d{4,}$/i.test(title)) {
      return false;
    }

    // 自动依赖升级和维护提交没有独立新闻价值。
    if (/^(?:bump|chore(?:\([^)]*\))?\s*:|dependabot\b|merge (?:branch|pull request)\b)/i.test(title)) {
      return false;
    }

    return true;
  }

  normalizePublicNewsTitle(rawTitle, source = {}) {
    const title = String(rawTitle || '').replace(/\s+/g, ' ').trim();
    if (!title) return '无标题';

    const releaseLike = String(source.url || '').includes('/releases.atom') || /(?:官方)?发布$/.test(String(source.name || ''));
    if (!releaseLike) return title;

    const projectName = String(source.name || '项目')
      .replace(/\s*(?:官方)?(?:发布|动态)$/u, '')
      .trim() || '项目';
    const cleanedReleaseTitle = title.replace(/[:：]$/u, '').trim();
    const versionPattern = 'v?\\d+(?:\\.\\d+)+(?:[.-]?(?:a|b|rc|dev|post)\\d+)*(?:[-+][0-9a-z.-]+)?';
    const datedVersion = cleanedReleaseTitle.match(new RegExp(`^(${versionPattern})\\s*\\(\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\)$`, 'i'));
    if (datedVersion) {
      return `${projectName} 发布 ${datedVersion[1]}`;
    }
    if (new RegExp(`^${versionPattern}$`, 'i').test(cleanedReleaseTitle)) {
      return `${projectName} 发布 ${cleanedReleaseTitle}`;
    }

    const packageVersion = cleanedReleaseTitle.match(new RegExp(`^([@a-z0-9._/-]+)\\s*:\\s*(${versionPattern})$`, 'i'));
    if (packageVersion) {
      return `${projectName} 发布 ${packageVersion[1]} ${packageVersion[2]}`;
    }

    return title;
  }

  selectPublicFeedItems(items = [], source = {}) {
    const limit = String(source.url || '').includes('/releases.atom') ? 3 : items.length;
    return items.filter((item) => this.isPublicNewsItem(item, source)).slice(0, limit);
  }

  getStoredNewsQualityPlan(articles = []) {
    const metadataMap = this.getSourceMetadataMap();
    const removeIds = [];
    const titleUpdates = [];
    const releaseCounts = new Map();

    for (const article of articles) {
      if (!article?.id) continue;
      const source = metadataMap.get(article.source) || {
        name: article.source,
        url: /github\.com\/[^/]+\/[^/]+\/commit\//i.test(String(article.url || '')) ? article.url : ''
      };
      if (!this.isPublicNewsItem(article, source)) {
        removeIds.push(article.id);
        continue;
      }

      const isReleaseStream = String(source.url || '').includes('/releases.atom')
        || /github\.com\/[^/]+\/[^/]+\/releases\/tag\//i.test(String(article.url || ''));
      if (isReleaseStream) {
        const releaseKey = article.source || source.name || source.url;
        const seen = releaseCounts.get(releaseKey) || 0;
        if (seen >= 3) {
          removeIds.push(article.id);
          continue;
        }
        releaseCounts.set(releaseKey, seen + 1);
      }

      const title = this.normalizePublicNewsTitle(article.title, source);
      if (title !== article.title) titleUpdates.push({ id: article.id, title });
    }

    return { removeIds, titleUpdates };
  }

  async pruneLowQualityStoredNews() {
    if (this.hasPrunedLowQualityNews) return { removed: 0, renamed: 0 };

    const articles = await DatabaseService.all(
      'SELECT id, title, source, url FROM news ORDER BY published_at DESC, created_at DESC'
    );
    const plan = this.getStoredNewsQualityPlan(articles);
    let removed = 0;

    for (let index = 0; index < plan.removeIds.length; index += 200) {
      const batch = plan.removeIds.slice(index, index + 200);
      const placeholders = batch.map(() => '?').join(',');
      const result = await DatabaseService.run(`DELETE FROM news WHERE id IN (${placeholders})`, batch);
      removed += result.changes || 0;
      batch.forEach((id) => this.newsCache.delete(id));
    }

    for (const update of plan.titleUpdates) {
      await DatabaseService.run(
        "UPDATE news SET title = ?, updated_at = datetime('now') WHERE id = ?",
        [update.title, update.id]
      );
      const cached = this.newsCache.get(update.id);
      if (cached) this.newsCache.set(update.id, { ...cached, title: update.title });
    }

    this.hasPrunedLowQualityNews = true;
    return { removed, renamed: plan.titleUpdates.length };
  }

  isSourceItemRelevant(item, source = {}) {
    if (!Array.isArray(source.filterKeywords) || source.filterKeywords.length === 0) {
      return true;
    }

    // 综合科技源的正文常会顺带提到 AI；以标题和上游标签为准，避免把 PostgreSQL、FFmpeg 等普通更新误收进 AI 栏目。
    const haystack = [
      item?.title,
      ...(Array.isArray(item?.categories) ? item.categories : [])
    ].filter(Boolean).join(' ').toLowerCase();

    return source.filterKeywords.some((keyword) => {
      const normalizedKeyword = String(keyword).toLowerCase();
      if (/^[a-z0-9]+$/.test(normalizedKeyword) && normalizedKeyword.length <= 2) {
        const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
      }
      return haystack.includes(normalizedKeyword);
    });
  }

  findIrrelevantArticleIds(articles = [], source = {}) {
    return articles
      .filter((article) => !this.isSourceItemRelevant(article, source))
      .map((article) => article.id)
      .filter(Boolean);
  }

  async pruneIrrelevantStoredNews() {
    if (this.hasPrunedIrrelevantNews) return 0;

    let removed = 0;
    const removeIds = async (ids) => {
      for (let index = 0; index < ids.length; index += 200) {
        const batch = ids.slice(index, index + 200);
        const placeholders = batch.map(() => '?').join(',');
        const result = await DatabaseService.run(
          `DELETE FROM news WHERE id IN (${placeholders})`,
          batch
        );
        removed += result.changes || 0;
      }
    };
    const filterableSources = this.getActiveRssSources().filter(
      (source) => Array.isArray(source.filterKeywords) && source.filterKeywords.length > 0
    );

    for (const source of filterableSources) {
      const articles = await DatabaseService.all(
        'SELECT id, title, description FROM news WHERE source = ?',
        [source.name]
      );
      const irrelevantIds = this.findIrrelevantArticleIds(articles, source);
      await removeIds(irrelevantIds);
    }

    // 旧版 NewsAPI ID 可被可靠识别；按同一关键词规则清掉历史误收录。
    const legacyNewsApiArticles = await DatabaseService.all(
      "SELECT id, title, description FROM news WHERE id LIKE 'newsapi_%'"
    );
    await removeIds(this.findIrrelevantArticleIds(legacyNewsApiArticles, {
      filterKeywords: AI_FILTER_KEYWORDS
    }));

    this.hasPrunedIrrelevantNews = true;
    return removed;
  }

  getArticleCategoryUpdates(articles = []) {
    const metadataMap = this.getSourceMetadataMap();

    return articles.reduce((updates, article) => {
      const rawCategory = typeof article.category === 'string' ? article.category.trim() : '';
      const currentCategory = normalizeCategory(rawCategory);
      const configuredSource = metadataMap.get(article.source);
      const source = configuredSource || {
        name: article.source,
        category: currentCategory,
        sourceGroup: this.inferSourceGroup({ name: article.source })
      };
      const nextCategory = this.classifyArticle(article, source);

      if (nextCategory !== rawCategory) {
        updates.push({ id: article.id, category: nextCategory });
      }
      return updates;
    }, []);
  }

  async reclassifyStoredNews() {
    if (this.hasReclassifiedStoredNews) return 0;

    const articles = await DatabaseService.all(
      'SELECT id, title, description, category, source FROM news'
    );
    const updates = this.getArticleCategoryUpdates(articles);

    for (const update of updates) {
      await DatabaseService.run(
        "UPDATE news SET category = ?, updated_at = datetime('now') WHERE id = ?",
        [update.category, update.id]
      );
    }

    this.hasReclassifiedStoredNews = true;
    return updates.length;
  }

  matchesArticleKeyword(text, keyword) {
    const normalizedKeyword = String(keyword || '').toLowerCase();
    if (!normalizedKeyword) return false;

    if (/^[a-z0-9][a-z0-9 .+/-]*$/.test(normalizedKeyword)) {
      const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
    }

    return text.includes(normalizedKeyword);
  }

  classifyArticle(item = {}, source = {}) {
    const text = `${item.title || ''} ${item.description || ''} ${item.contentSnippet || ''} ${item.content || ''}`.toLowerCase();
    const includesAny = (keywords) => keywords.some((keyword) => this.matchesArticleKeyword(text, keyword));
    const titleText = String(item.title || '').toLowerCase();
    const titleIncludesAny = (keywords) => keywords.some((keyword) => this.matchesArticleKeyword(titleText, keyword));
    const sourceCategory = normalizeCategory(source.category);
    const sourceName = String(source.name || '').toLowerCase();
    const isEngineeringSource = source.sourceGroup === 'engineering' || sourceCategory === 'AI框架';
    const isResearchSource = source.sourceGroup === 'research';
    const isScholarlySource = [
      'arxiv', 'proceedings', 'journal', 'acl anthology', 'papers with code', 'apple machine learning'
    ].some((marker) => sourceName.includes(marker));

    // 论文聚合源的每条记录本身就是论文；摘要里的 failure / safety 等词不能把它降成事件新闻。
    if (isScholarlySource) return '新算法';

    // 事故、融资、诉讼、财报等是事件新闻。先锁定新闻边界，防止“算法工程师”或“产品发布”之类的词被误收进专题栏目。
    if (includesAny([
      'accident', 'outage', 'failure', 'recall', 'lawsuit', 'funding', 'acquisition',
      'earnings', 'quarterly results', 'layoff', 'data breach', '故障', '事故', '召回',
      'initial public offering', 'ipo', 'strategic placement', 'share allotment',
      'price cut', 'pricing', 'conference', 'meetup', 'contest', 'keynote',
      '起诉', '融资', '收购', '财报', '裁员', '误删', '宕机', '监管处罚',
      '战略配售', '获配', '持股', '上市', '定价', '涨价', '降价', '价格调整',
      '会议', '大会', '峰会', '竞赛', '比赛'
    ])) return 'AI新闻';

    // 论文算法需要可验证的学术信号；只有明确的论文聚合源可以直接采用来源边界。
    if (titleIncludesAny([
      'paper', 'preprint', 'arxiv', 'benchmark', 'dataset', 'novel algorithm', 'new algorithm',
      'we propose', 'state-of-the-art', 'sota', '论文', '预印本', '新算法', '基准', '数据集',
      'trainable parameters', '提出一种算法', '提出新方法', '神经网络架构', '实验结果', '消融实验'
    ])) return '新算法';

    if (titleIncludesAny([
      'policy analysis', 'federal policy', 'regulatory analysis', 'industry analysis',
      '研究报告', '政策分析', '监管分析', '行业分析', '趋势研判', '方法论', '复盘',
      '深度解析', '底层拆解', '技术取舍', '为什么'
    ])) return '新思路';

    if (titleIncludesAny([
      'sdk', 'api framework', 'developer framework', 'software framework', 'software library',
      'python library', 'javascript library', 'developer tool',
      'inference engine', 'runtime', 'orchestration', 'serving stack', 'compiler pass',
      'compiler extension', 'triton plugin', '开发套件', '代码库', '框架', '开发者工具',
      '推理引擎', '训练框架', '部署框架', '编排框架'
    ]) || (isEngineeringSource && this.matchesArticleKeyword(titleText, 'framework'))) return 'AI框架';

    // “发布/上线/产品”本身不是工具证据，必须同时能看出用户实际可使用的软件形态。
    if (titleIncludesAny([
      'desktop app', 'mobile app', 'browser extension', 'command-line tool', 'cli tool',
      'copilot', 'agent platform', 'developer console', 'plugin', 'download now',
      'open-source platform', 'open source platform', 'ai workstation', 'coding agent', 'agent skills',
      '桌面应用', '移动应用', '浏览器扩展', '命令行工具', '插件', '智能体平台',
      '开发者控制台', '开放下载', '正式可用', '工具箱', 'ai 工作站', '编程 agent',
      '开源平台', '自托管平台'
    ])) return '新工具';

    if (titleIncludesAny([
      'research report', 'technical report', 'white paper', 'alignment', 'ai safety',
      'ethics', 'policy analysis', 'industry analysis', 'outlook', '观点', '洞察',
      '研究报告', '技术报告', '白皮书', '对齐', '伦理', '政策分析', '行业分析',
      '趋势研判', '方法论', '复盘', '深度解析', '底层拆解', '技术取舍', '为什么'
    ])) return '新思路';

    // 工程来源仍须出现真实的版本或变更日志信号；普通小数（价格、股数、指标）不能冒充版本号。
    const hasVersionToken = /(?:\bv\d+\.\d+(?:\.\d+)?\b|(?:release|version|版本|更新至|升级至)\s*[:：]?\s*v?\d+\.\d+(?:\.\d+)?\b|\bv?\d+\.\d+(?:\.\d+)?\s*(?:release|released|发布|版本|更新|升级))/i.test(titleText);
    if (isEngineeringSource && (hasVersionToken || titleIncludesAny(['release notes', 'changelog', 'version', '版本', '更新日志']))) {
      return sourceCategory === '新工具' ? '新工具' : 'AI框架';
    }
    if (isResearchSource) return '新思路';

    return 'AI新闻';
  }

  validateFeedHttpResponse(response) {
    if (!response) {
      throw new Error('RSS响应为空');
    }

    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}: 上游RSS地址不可用`);
    }

    const rawBody = typeof response.data === 'string' ? response.data.trim() : '';
    if (!rawBody || rawBody.length < 32) {
      throw new Error('RSS内容过短或为空');
    }

    const contentType = (response.headers?.['content-type'] || '').toLowerCase();
    const sample = rawBody.slice(0, 512).toLowerCase();
    const looksLikeFeed =
      sample.includes('<?xml') ||
      sample.includes('<rss') ||
      sample.includes('<feed') ||
      sample.includes('<rdf:rdf');

    if (!looksLikeFeed && contentType.includes('text/html')) {
      throw new Error('响应不是有效的RSS或Atom feed');
    }
  }

  isPermanentFeedError(error) {
    return /HTTP 4\d\d|不是有效的RSS或Atom feed/.test(error.message || '');
  }

  // 设置WebSocket实例
  setSocketIO(io) {
    this.io = io;
    console.log('WebSocket已连接到NewsService');
  }

  // 广播新闻更新
  broadcastNewsUpdate(type, data) {
    if (this.io) {
      this.io.emit('news-update', { type, data, timestamp: new Date().toISOString() });
    }
  }

  // 检查是否应该限流
  shouldThrottle(sourceName, rateLimit = 30) {
    const now = Date.now();
    const lastTime = this.lastRequestTime.get(sourceName) || 0;
    const count = this.requestCounts.get(sourceName) || 0;
    
    // 如果距离上次请求不到间隔时间
    if (now - lastTime < this.REQUEST_INTERVAL) {
      return true;
    }
    
    // 如果一分钟内请求次数超过限制
    const oneMinuteAgo = now - 60000;
    if (lastTime > oneMinuteAgo && count >= rateLimit) {
      return true;
    }
    
    return false;
  }

  // 更新请求计数
  updateRequestCount(sourceName) {
    const now = Date.now();
    const lastTime = this.lastRequestTime.get(sourceName) || 0;
    
    // 如果超过一分钟，重置计数
    if (now - lastTime > 60000) {
      this.requestCounts.set(sourceName, 1);
    } else {
      this.requestCounts.set(sourceName, (this.requestCounts.get(sourceName) || 0) + 1);
    }
    
    this.lastRequestTime.set(sourceName, now);
  }

  // 重置日计数（用于NewsAPI）
  checkDailyReset() {
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.dailyRequestCount = 0;
      this.lastResetDate = today;
    }
  }

  // 更新所有新闻源（带限流和自动恢复）
  async updateAllNews() {
    if (this.isUpdating) {
      console.log('更新正在进行中，跳过此次请求');
      return { skipped: true, reason: '更新正在进行中' };
    }
    
    this.isUpdating = true;
    console.log('开始更新新闻...');
    
    const results = {
      rss: [],
      api: [],
      errors: [],
      totalSaved: 0
    };

    try {
      // 初始化数据库
      await DatabaseService.initialize();
      
      // 数据库中连续失败停用的源不会继续占用抓取配额；新配置源仍会正常加入。
      const sourceStatuses = await DatabaseService.all('SELECT name, is_active FROM rss_sources');
      const sortedSources = this.getSchedulableSources(sourceStatuses).sort((a, b) =>
        (a.priority || 3) - (b.priority || 3)
      );
      
      // 分批处理RSS源（控制并发）
      for (let i = 0; i < sortedSources.length; i += this.MAX_CONCURRENT_REQUESTS) {
        const batch = sortedSources.slice(i, i + this.MAX_CONCURRENT_REQUESTS);
        
        const batchPromises = batch.map(async (source) => {
          // 检查限流
          if (this.shouldThrottle(source.name, source.rateLimit || 30)) {
            console.log(`[限流] ${source.name} 请求过于频繁，跳过`);
            return {
              source: source.name,
              skipped: true,
              reason: '限流'
            };
          }
          
          try {
            this.updateRequestCount(source.name);
            const startTime = Date.now();
            const articles = await this.fetchRSSFeed(source);
            const responseTime = Date.now() - startTime;
            
            // 记录成功
            await DatabaseService.logRequest(source.name, true, responseTime);
            await DatabaseService.updateRssSourceStatus(source.name, source.url, source.category, true);
            
            return {
              source: source.name,
              count: articles.length,
              articles,
              success: true,
              responseTime
            };
          } catch (error) {
            // 记录失败
            await DatabaseService.logRequest(source.name, false, 0, error.message);
            await DatabaseService.updateRssSourceStatus(source.name, source.url, source.category, false, error.message);
            
            console.error(`RSS源 ${source.name} 更新失败:`, error.message);
            return {
              source: source.name,
              error: error.message,
              success: false
            };
          }
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            const sourceResult = result.value;
            if (sourceResult.success) {
              results.rss.push({
                source: sourceResult.source,
                count: sourceResult.count
              });
              
              // 保存到数据库
              if (sourceResult.articles && sourceResult.articles.length > 0) {
                const saved = await DatabaseService.saveNews(sourceResult.articles);
                results.totalSaved += saved;
                
                // 更新内存缓存
                sourceResult.articles.forEach(article => {
                  this.newsCache.set(article.id, article);
                  this.categories.add(article.category);
                });
              }
            } else if (!sourceResult.skipped) {
              results.errors.push(`${sourceResult.source}: ${sourceResult.error}`);
            }
          } else {
            results.errors.push(`批次处理失败: ${result.reason?.message || '未知错误'}`);
          }
        }
        
        // 批次间延迟，避免请求过快
        if (i + this.MAX_CONCURRENT_REQUESTS < sortedSources.length) {
          await this.delay(this.REQUEST_INTERVAL);
        }
      }

      // 更新NewsAPI（检查日限制）
      this.checkDailyReset();
      if (this.dailyRequestCount < 100) {
        try {
          const apiResult = await this.fetchNewsAPI();
          if (apiResult.articles && apiResult.articles.length > 0) {
            results.api.push({
              source: 'NewsAPI',
              count: apiResult.articles.length
            });
            
            const saved = await DatabaseService.saveNews(apiResult.articles);
            results.totalSaved += saved;
            
            apiResult.articles.forEach(article => {
              this.newsCache.set(article.id, article);
              this.categories.add(article.category);
            });
          }
          if (!apiResult.skipped) this.dailyRequestCount++;
        } catch (error) {
          results.errors.push(`NewsAPI: ${error.message}`);
        }
      } else {
        console.log('NewsAPI日限制已达到，跳过');
      }

      results.prunedIrrelevant = await this.pruneIrrelevantStoredNews();
      results.prunedLowQuality = await this.pruneLowQualityStoredNews();
      results.prunedDuplicates = await this.pruneDuplicateStoredNews();
      results.reclassified = await this.reclassifyStoredNews();

      this.updateTime = new Date();
      
      // 广播更新完成
      this.broadcastNewsUpdate('update-complete', {
        totalSources: results.rss.length + results.api.length,
        totalSaved: results.totalSaved,
        errors: results.errors.length
      });
      
      console.log(`新闻更新完成: ${results.rss.length + results.api.length}个源成功, 保存${results.totalSaved}条, ${results.errors.length}个错误`);
      
      return results;

    } catch (error) {
      console.error('更新新闻时发生严重错误:', error);
      results.errors.push(`系统错误: ${error.message}`);
      
      // 触发自动恢复
      this.scheduleRecovery();
      
      throw error;
    } finally {
      this.isUpdating = false;
    }
  }

  // 自动恢复调度
  scheduleRecovery() {
    console.log('调度自动恢复，5分钟后重试...');
    setTimeout(async () => {
      try {
        console.log('执行自动恢复...');
        await DatabaseService.resetFailedSources();
        await this.updateAllNews();
      } catch (error) {
        console.error('自动恢复失败:', error);
      }
    }, 5 * 60 * 1000);
  }

  // 延迟函数
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 获取RSS feeds（带重试和缓存）
  async fetchRSSFeed(source, maxRetries = 2) {
    // 检查文件缓存
    const cacheFile = path.join(
      this.persistentCacheDir, 
      `${source.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`
    );
    
    try {
      if (fs.existsSync(cacheFile)) {
        const stats = fs.statSync(cacheFile);
        const age = Date.now() - stats.mtime.getTime();
        
        if (age < this.FILE_CACHE_DURATION) {
          const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
          console.log(`[缓存命中] ${source.name} (${age / 1000}秒前)`);
          return this.normalizeCachedArticles(cached, source);
        }
      }
    } catch (err) {
      console.warn(`读取缓存失败: ${source.name}`, err.message);
    }
    
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`获取RSS: ${source.name} (第${attempt}次尝试)`);
        
        const response = await axios.get(source.url, {
          timeout: source.timeout || 20000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AInewsBot/2.0; +http://localhost)',
            'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
            'Cache-Control': 'no-cache'
          },
          maxRedirects: 5,
          validateStatus: status => status < 500,
          httpsAgent: proxyAgent,
          httpAgent: proxyAgent,
          proxy: false
        });
        
        if (response.status === 429) {
          throw new Error('HTTP 429: Too Many Requests - 请求过于频繁');
        }

        this.validateFeedHttpResponse(response);
        
        let feed;
        try {
          feed = await this.rssParser.parseString(response.data);
        } catch (parseError) {
          console.warn(`主解析器失败，尝试备用: ${source.name}`);
          feed = await fallbackRSSParser.parseString(response.data);
        }
        
      if (!feed.items || feed.items.length === 0) {
        throw new Error('RSS feed为空');
      }

      // 过滤无效项并验证结构
      const validItems = this.selectPublicFeedItems(feed.items.filter(item => {
        return item && typeof item === 'object' && (item.title || item.link) && this.isSourceItemRelevant(item, source);
      }), source).filter((item) => this.isPublicNewsItem(item, source));

      if (validItems.length === 0) {
        throw new Error('RSS feed中没有有效的文章项');
      }
        
      const articles = validItems
        .map(item => {
          try {
            const rawUrl = item.link || item.guid || '';
            const title = this.normalizePublicNewsTitle(item.title, source);
            const normalizedItem = { ...item, title };
            return {
              id: this.generateArticleId(normalizedItem, source),
              title,
              description: this.cleanText(item.contentSnippet || item.description || item.content || ''),
              url: this.normalizeArticleUrl(rawUrl),
              publishedAt: new Date(item.pubDate || item.isoDate || Date.now()),
              category: this.classifyArticle(normalizedItem, source),
              source: source.name,
              imageUrl: this.extractImageUrl(item),
              author: this.extractAuthorName(item, source.name),
              language: source.language || 'en',
              region: source.region || 'global'
            };
          } catch (itemError) {
            console.warn(`处理RSS项失败: ${source.name}`, itemError.message);
            return null;
          }
        })
        .filter(item => item !== null); // 过滤掉处理失败的项
        
        // 保存到文件缓存
        try {
          fs.writeFileSync(cacheFile, JSON.stringify(articles, null, 2));
        } catch (err) {
          console.warn(`写入缓存失败: ${source.name}`, err.message);
        }
        
        return articles;
        
      } catch (error) {
        lastError = error;
        console.warn(`${source.name} 第${attempt}次失败:`, error.message);

        if (this.isPermanentFeedError(error)) {
          break;
        }
        
        if (attempt < maxRetries) {
          const delay = Math.min(attempt * 3000, 10000);
          await this.delay(delay);
        }
      }
    }
    
    throw lastError;
  }

  // 生成文章ID - 基于内容哈希，确保同一文章始终有相同ID
  generateArticleId(item, source) {
    const canonicalUrl = this.normalizeArticleUrl(item.link || '');
    const base = canonicalUrl || item.guid || `${source.name}:${item.title || ''}`;
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(base).digest('hex').slice(0, 20);
    return `article_${hash}`;
  }

  // 提取图片URL
  extractImageUrl(item) {
    if (!item) return null;
    
    try {
      // 尝试多种图片来源
      if (item.enclosure?.url) return item.enclosure.url;
      if (item['media:content']?.$?.url) return item['media:content'].$.url;
      
      // 从content中提取img标签
      const content = item['content:encoded'] || item.content || item.description || '';
      if (content && typeof content === 'string') {
        const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) return imgMatch[1];
      }
    } catch (error) {
      // 忽略图片提取错误
    }
    
    return null;
  }

  extractAuthorName(item, fallbackAuthor) {
    const rawAuthor = item?.creator || item?.author;

    if (!rawAuthor) {
      return fallbackAuthor;
    }

    if (typeof rawAuthor === 'string') {
      return rawAuthor;
    }

    if (Array.isArray(rawAuthor)) {
      const first = rawAuthor.find((value) => typeof value === 'string' && value.trim());
      return first || fallbackAuthor;
    }

    if (typeof rawAuthor === 'object') {
      const candidates = [rawAuthor.name, rawAuthor.title, rawAuthor.value, rawAuthor.text];
      for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
          return candidate;
        }

        if (Array.isArray(candidate)) {
          const first = candidate.find((value) => typeof value === 'string' && value.trim());
          if (first) return first;
        }
      }
    }

    return fallbackAuthor;
  }

  // 获取NewsAPI数据
  normalizeNewsApiArticles(rawArticles = []) {
    const relevanceFilter = { filterKeywords: AI_FILTER_KEYWORDS };

    return rawArticles
      .filter((article) => article?.url && this.isSourceItemRelevant(article, relevanceFilter))
      .map((article) => {
        const url = this.normalizeArticleUrl(article.url);
        const source = article.source?.name || 'NewsAPI';
        const normalized = {
          id: this.generateArticleId({ link: url }, { name: 'NewsAPI' }),
          title: article.title,
          description: this.cleanText(article.description || ''),
          url,
          publishedAt: new Date(article.publishedAt),
          category: 'AI新闻',
          source,
          imageUrl: article.urlToImage,
          author: article.author || source
        };

        normalized.category = this.classifyArticle(normalized, {
          category: 'AI新闻',
          sourceGroup: 'investment'
        });
        return normalized;
      });
  }

  async fetchNewsAPI() {
    const apiConfig = this.apiSources.newsapi;

    if (!apiConfig.params.apiKey) {
      return {
        articles: [],
        skipped: true,
        reason: 'NEWSAPI_KEY 未配置'
      };
    }
    
    try {
      const response = await axios.get(apiConfig.url, {
        params: apiConfig.params,
        timeout: 15000,
        httpsAgent: proxyAgent,
        httpAgent: proxyAgent,
        proxy: false
      });
      
      if (response.data.status !== 'ok') {
        throw new Error(response.data.message || 'API返回错误');
      }
      
      const articles = this.normalizeNewsApiArticles(response.data.articles);
      
      return { articles };
      
    } catch (error) {
      if (error.response?.status === 429) {
        console.error('NewsAPI: 达到请求限制');
        this.dailyRequestCount = 100; // 标记为已达限制
      }
      throw error;
    }
  }

  // 获取最新新闻（优先从数据库）
  async getLatestNews({ page = 1, limit = 20, category, search } = {}) {
    try {
      await DatabaseService.initialize();
      const pagination = this.normalizePagination({ page, limit });
      const normalizedCategory = category && category !== '全部' ? normalizeCategory(category) : category;
      
      // 从数据库获取
      const result = await DatabaseService.getNews({
        ...pagination,
        category: normalizedCategory,
        search
      });
      
      if (result.data.length > 0) {
        return {
          ...result,
          data: result.data.map((article) => this.enrichArticleSourceMetadata(article))
        };
      }
      
      console.log('数据库暂无新闻，等待真实来源同步');
      return this.createEmptyNewsResult(pagination);
      
    } catch (error) {
      console.error('获取新闻失败:', error);
      // 降级到内存缓存
      return this.getNewsFromCache({ page, limit, category, search });
    }
  }

  // 从内存缓存获取新闻
  getNewsFromCache({ page = 1, limit = 20, category, search }) {
    let news = Array.from(this.newsCache.values());
    
    if (category && category !== '全部') {
      news = news.filter(item => item.category === category);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      news = news.filter(item =>
        item.title.toLowerCase().includes(searchLower) ||
        (item.description && item.description.toLowerCase().includes(searchLower))
      );
    }
    
    news.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    
    const startIndex = (page - 1) * limit;
    const data = news.slice(startIndex, startIndex + limit);
    
    return { data, total: news.length, page, limit };
  }

  // 获取演示新闻数据 - 丰富的备用数据
  getDemoNews({ page = 1, limit = 10, category, search }) {
    const mockNews = [
      // ===== AI新闻 =====
      {
        id: 'demo_1',
        title: 'GPT-5即将发布：OpenAI宣布重大突破，推理能力超越人类专家',
        description: 'OpenAI宣布其下一代语言模型GPT-5在推理能力、多模态处理和代码生成方面实现了革命性突破。新模型在数学推理、科学问题解决等领域表现超越人类专家水平，引发AI行业广泛关注。',
        url: 'https://openai.com/blog/gpt5',
        publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        category: 'AI新闻',
        source: 'OpenAI官方',
        imageUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800',
        author: 'OpenAI Team'
      },
      {
        id: 'demo_2',
        title: 'Claude 4发布：Anthropic推出最安全的AI助手',
        description: 'Anthropic发布Claude 4，在保持强大能力的同时大幅提升安全性。新模型采用宪法AI训练方法，能够更好地理解和遵循人类价值观，减少有害输出。',
        url: 'https://anthropic.com/claude4',
        publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        category: 'AI新闻',
        source: 'Anthropic',
        imageUrl: 'https://images.unsplash.com/photo-1676299081847-5c508e91ab6c?w=800',
        author: 'Anthropic Team'
      },
      {
        id: 'demo_3',
        title: 'Google Gemini 2.0：多模态AI的新里程碑',
        description: 'Google发布Gemini 2.0，这是一个原生多模态AI模型，能够无缝处理文本、图像、音频和视频。在多项基准测试中超越GPT-4，展示了强大的跨模态理解能力。',
        url: 'https://blog.google/gemini2',
        publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
        category: 'AI新闻',
        source: 'Google AI',
        imageUrl: 'https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?w=800',
        author: 'Google AI Team'
      },
      {
        id: 'demo_4',
        title: 'Meta发布LLaMA 4：开源大模型新标杆',
        description: 'Meta正式发布LLaMA 4系列开源大语言模型，包含7B到400B多个规格。新模型采用改进的训练方法，在保持开源的同时达到了商业模型的性能水平。',
        url: 'https://ai.meta.com/llama4',
        publishedAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
        category: 'AI新闻',
        source: 'Meta AI',
        imageUrl: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800',
        author: 'Meta AI Team'
      },
      {
        id: 'demo_5',
        title: '中国AI芯片取得重大突破，算力提升10倍',
        description: '国产AI芯片研发取得重大进展，新一代芯片算力较上一代提升10倍，能效比达到国际领先水平。这标志着中国在AI硬件领域迈出了重要一步。',
        url: 'https://example.com/china-ai-chip',
        publishedAt: new Date(Date.now() - 9 * 60 * 60 * 1000),
        category: 'AI新闻',
        source: '机器之心',
        imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800',
        author: '机器之心编辑部'
      },
      {
        id: 'demo_6',
        title: 'NVIDIA发布H200 GPU：AI训练速度提升2倍',
        description: 'NVIDIA正式发布H200 GPU，采用最新HBM3e内存技术，AI训练和推理速度较H100提升约2倍。新GPU将于下季度开始量产，预计将大幅降低大模型训练成本。',
        url: 'https://blogs.nvidia.com/h200',
        publishedAt: new Date(Date.now() - 11 * 60 * 60 * 1000),
        category: 'AI新闻',
        source: 'NVIDIA Blog',
        imageUrl: 'https://images.unsplash.com/photo-1591488320449-011701bb6704?w=800',
        author: 'NVIDIA'
      },
      
      // ===== AI框架 =====
      {
        id: 'demo_7',
        title: 'PyTorch 3.0发布：AI开发新标准，性能大幅提升',
        description: 'PyTorch团队宣布推出PyTorch 3.0，引入全新的动态图优化和分布式训练增强功能。新版本支持更高效的内存管理，训练速度提升40%，并引入原生对大模型的支持。',
        url: 'https://pytorch.org/blog/pytorch3',
        publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
        category: 'AI框架',
        source: 'PyTorch Foundation',
        imageUrl: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=800',
        author: 'PyTorch Team'
      },
      {
        id: 'demo_8',
        title: 'TensorFlow 3.0：统一机器学习开发体验',
        description: 'Google发布TensorFlow 3.0，重新设计API以提供更简洁的开发体验。新版本与JAX深度整合，支持更灵活的自动微分，并优化了TPU训练性能。',
        url: 'https://blog.tensorflow.org/tf3',
        publishedAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
        category: 'AI框架',
        source: 'TensorFlow Blog',
        imageUrl: 'https://images.unsplash.com/photo-1516116216624-53e697fedbea?w=800',
        author: 'TensorFlow Team'
      },
      {
        id: 'demo_9',
        title: 'Hugging Face发布Transformers 5.0：更快更简单',
        description: 'Hugging Face发布Transformers库5.0版本，引入新的模型并行化策略和量化支持。用户可以用更少的代码加载和使用最新的大语言模型。',
        url: 'https://huggingface.co/blog/transformers5',
        publishedAt: new Date(Date.now() - 15 * 60 * 60 * 1000),
        category: 'AI框架',
        source: 'Hugging Face',
        imageUrl: 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=800',
        author: 'Hugging Face Team'
      },
      {
        id: 'demo_10',
        title: 'LangChain 1.0稳定版发布：构建LLM应用的标准框架',
        description: 'LangChain正式发布1.0稳定版，提供完整的工具链用于构建基于大语言模型的应用。新版本包含改进的Agent系统、更好的Memory管理和企业级功能。',
        url: 'https://blog.langchain.dev/v1',
        publishedAt: new Date(Date.now() - 17 * 60 * 60 * 1000),
        category: 'AI框架',
        source: 'LangChain',
        imageUrl: 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=800',
        author: 'LangChain Team'
      },
      {
        id: 'demo_11',
        title: 'vLLM 2.0：大模型推理速度提升5倍',
        description: 'vLLM团队发布2.0版本，通过改进的PagedAttention和连续批处理技术，将大模型推理速度提升5倍。支持更多模型架构，内存使用更加高效。',
        url: 'https://vllm.ai/blog/v2',
        publishedAt: new Date(Date.now() - 19 * 60 * 60 * 1000),
        category: 'AI框架',
        source: 'vLLM',
        imageUrl: 'https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=800',
        author: 'vLLM Team'
      },
      
      // ===== 新算法 =====
      {
        id: 'demo_12',
        title: '新型Transformer架构：效率提升300%，内存占用减半',
        description: '研究团队提出全新注意力机制设计FlashAttention-3，将Transformer模型计算效率提升300%，同时内存占用减少50%。该技术已被PyTorch和JAX采纳。',
        url: 'https://arxiv.org/flash-attention-3',
        publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
        category: '新算法',
        source: 'arXiv',
        imageUrl: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800',
        author: 'Stanford Research'
      },
      {
        id: 'demo_13',
        title: 'Mamba-2：状态空间模型超越Transformer',
        description: '最新研究表明，改进的状态空间模型Mamba-2在长序列建模任务上显著超越Transformer，同时保持线性时间复杂度。这可能改变AI模型架构的未来方向。',
        url: 'https://arxiv.org/mamba2',
        publishedAt: new Date(Date.now() - 21 * 60 * 60 * 1000),
        category: '新算法',
        source: 'arXiv',
        imageUrl: 'https://images.unsplash.com/photo-1507146153580-69a1fe6d8aa1?w=800',
        author: 'CMU Research'
      },
      {
        id: 'demo_14',
        title: '强化学习新突破：AI在复杂博弈中达到超人水平',
        description: '研究人员开发出新的强化学习算法，使AI在多人不完全信息博弈中达到超人水平。该方法结合了自我对弈和人类反馈，展示了通用游戏AI的潜力。',
        url: 'https://arxiv.org/rl-superhuman',
        publishedAt: new Date(Date.now() - 23 * 60 * 60 * 1000),
        category: '新算法',
        source: 'DeepMind',
        imageUrl: 'https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=800',
        author: 'DeepMind Research'
      },
      {
        id: 'demo_15',
        title: '扩散模型新进展：图像生成速度提升20倍',
        description: '新型一致性蒸馏技术使扩散模型图像生成速度提升20倍，同时保持高质量输出。这使得实时图像生成在消费级设备上成为可能。',
        url: 'https://arxiv.org/fast-diffusion',
        publishedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        category: '新算法',
        source: 'Stability AI',
        imageUrl: 'https://images.unsplash.com/photo-1547954575-855750c57bd3?w=800',
        author: 'Stability AI Research'
      },
      {
        id: 'demo_16',
        title: '知识蒸馏新方法：小模型获得大模型90%能力',
        description: '研究人员提出新的知识蒸馏方法，能够将大语言模型的知识高效转移到小模型。7B参数模型可获得70B模型90%的能力，大幅降低部署成本。',
        url: 'https://arxiv.org/distillation',
        publishedAt: new Date(Date.now() - 27 * 60 * 60 * 1000),
        category: '新算法',
        source: 'Microsoft Research',
        imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800',
        author: 'Microsoft Research'
      },
      
      // ===== 新思路 =====
      {
        id: 'demo_17',
        title: '多模态AI：统一理解文本、图像、音频、视频',
        description: '最新研究展示能同时处理文本、图像、音频和视频的统一AI模型。这种多模态理解能力使AI能够更全面地理解真实世界，为AGI铺平道路。',
        url: 'https://research.google/multimodal',
        publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
        category: '新思路',
        source: 'Google Research',
        imageUrl: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800',
        author: 'Google AI Team'
      },
      {
        id: 'demo_18',
        title: 'AI Agent新范式：自主完成复杂任务的智能体',
        description: '研究人员提出AI Agent新框架，使大语言模型能够自主规划、执行和反思复杂任务。这标志着从简单问答到自主行动的重要转变。',
        url: 'https://anthropic.com/agents',
        publishedAt: new Date(Date.now() - 29 * 60 * 60 * 1000),
        category: '新思路',
        source: 'Anthropic Research',
        imageUrl: 'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=800',
        author: 'Anthropic'
      },
      {
        id: 'demo_19',
        title: 'AI安全新进展：可解释性研究取得突破',
        description: '研究团队在AI可解释性方面取得重要进展，能够可视化和理解大语言模型内部的决策过程。这对于建立可信赖的AI系统至关重要。',
        url: 'https://openai.com/interpretability',
        publishedAt: new Date(Date.now() - 31 * 60 * 60 * 1000),
        category: '新思路',
        source: 'OpenAI Research',
        imageUrl: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800',
        author: 'OpenAI Safety Team'
      },
      {
        id: 'demo_20',
        title: 'AI与科学发现：机器学习加速药物研发',
        description: '深度学习在药物发现领域展现巨大潜力，新的分子生成模型能够设计出具有特定性质的候选药物分子，将药物研发周期缩短50%。',
        url: 'https://deepmind.com/drug-discovery',
        publishedAt: new Date(Date.now() - 33 * 60 * 60 * 1000),
        category: '新思路',
        source: 'DeepMind',
        imageUrl: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=800',
        author: 'DeepMind Health'
      },
      {
        id: 'demo_21',
        title: '世界模型：AI理解物理世界的新方法',
        description: '研究人员开发出能够学习和模拟物理世界的AI世界模型。这种模型可以预测物体的运动和交互，为机器人和自动驾驶提供更强的环境理解能力。',
        url: 'https://research.meta.com/world-models',
        publishedAt: new Date(Date.now() - 35 * 60 * 60 * 1000),
        category: '新思路',
        source: 'Meta AI Research',
        imageUrl: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800',
        author: 'Meta FAIR'
      },
      
      // ===== 新工具 =====
      {
        id: 'demo_22',
        title: 'AI编程助手支持全栈开发：GitHub Copilot X发布',
        description: 'GitHub发布新版AI编程助手Copilot X，支持前端、后端、数据库设计全流程。新版本可以理解整个代码库上下文，提供更精准的代码建议和自动重构。',
        url: 'https://github.com/copilot-x',
        publishedAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
        category: '新工具',
        source: 'GitHub',
        imageUrl: 'https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?w=800',
        author: 'GitHub Team'
      },
      {
        id: 'demo_23',
        title: 'Cursor 2.0：AI原生代码编辑器重新定义编程',
        description: 'Cursor发布2.0版本，将AI深度集成到代码编辑的每个环节。支持自然语言描述需求自动生成代码，智能调试和代码重构，显著提升开发效率。',
        url: 'https://cursor.sh/v2',
        publishedAt: new Date(Date.now() - 37 * 60 * 60 * 1000),
        category: '新工具',
        source: 'Cursor',
        imageUrl: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=800',
        author: 'Cursor Team'
      },
      {
        id: 'demo_24',
        title: 'Midjourney V7：AI图像生成达到照片级真实感',
        description: 'Midjourney发布V7版本，图像生成质量达到照片级别。新模型在人物、光影和材质渲染方面实现重大突破，几乎无法区分AI生成和真实照片。',
        url: 'https://midjourney.com/v7',
        publishedAt: new Date(Date.now() - 39 * 60 * 60 * 1000),
        category: '新工具',
        source: 'Midjourney',
        imageUrl: 'https://images.unsplash.com/photo-1547954575-855750c57bd3?w=800',
        author: 'Midjourney'
      },
      {
        id: 'demo_25',
        title: 'Suno AI 4.0：AI音乐创作达到专业水准',
        description: 'Suno发布4.0版本，AI音乐生成质量大幅提升。用户只需输入文字描述即可生成高质量的完整歌曲，包括人声、乐器和混音，已被多位职业音乐人采用。',
        url: 'https://suno.ai/v4',
        publishedAt: new Date(Date.now() - 41 * 60 * 60 * 1000),
        category: '新工具',
        source: 'Suno AI',
        imageUrl: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=800',
        author: 'Suno Team'
      },
      {
        id: 'demo_26',
        title: 'Runway Gen-3：AI视频生成进入新时代',
        description: 'Runway发布Gen-3视频生成模型，能够根据文字描述生成高质量、时长更长的视频。新模型在物理一致性和时间连贯性方面实现重大进步。',
        url: 'https://runway.ml/gen3',
        publishedAt: new Date(Date.now() - 43 * 60 * 60 * 1000),
        category: '新工具',
        source: 'Runway',
        imageUrl: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=800',
        author: 'Runway'
      },
      {
        id: 'demo_27',
        title: 'Notion AI 3.0：智能文档助手全面升级',
        description: 'Notion发布AI 3.0版本，提供更强大的文档理解和生成能力。可以自动总结长文档、生成报告、创建数据库视图，成为知识工作者的得力助手。',
        url: 'https://notion.so/ai3',
        publishedAt: new Date(Date.now() - 45 * 60 * 60 * 1000),
        category: '新工具',
        source: 'Notion',
        imageUrl: 'https://images.unsplash.com/photo-1512314889357-e157c22f938d?w=800',
        author: 'Notion Team'
      },
      {
        id: 'demo_28',
        title: 'Perplexity Pro：AI搜索引擎挑战Google',
        description: 'Perplexity推出Pro版本，提供更准确的实时搜索和深度研究功能。用户可以获得带有来源引用的综合答案，正在改变人们获取信息的方式。',
        url: 'https://perplexity.ai/pro',
        publishedAt: new Date(Date.now() - 47 * 60 * 60 * 1000),
        category: '新工具',
        source: 'Perplexity',
        imageUrl: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800',
        author: 'Perplexity Team'
      }
    ];

    let filteredNews = mockNews;

    if (category && category !== '全部') {
      filteredNews = mockNews.filter(news => news.category === category);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filteredNews = filteredNews.filter(item =>
        item.title.toLowerCase().includes(searchLower) ||
        item.description.toLowerCase().includes(searchLower)
      );
    }

    const startIndex = (page - 1) * limit;
    return {
      data: filteredNews.slice(startIndex, startIndex + limit),
      total: filteredNews.length,
      page,
      limit,
      isDemo: true
    };
  }

  // 获取新闻详情
  async getNewsById(id) {
    try {
      await DatabaseService.initialize();
      const row = await DatabaseService.get('SELECT * FROM news WHERE id = ?', [id]);
      if (row) {
        return {
          id: row.id,
          title: row.title,
          description: row.description,
          url: row.url,
          publishedAt: row.published_at,
          category: row.category,
          source: row.source,
          imageUrl: row.image_url,
          author: row.author
        };
      }
    } catch (error) {
      console.error('获取新闻详情失败:', error);
    }
    return this.newsCache.get(id);
  }

  // 获取分类列表
  async getCategories() {
    try {
      await DatabaseService.initialize();
      const stats = await DatabaseService.getCategoryStats();
      return stats.map(row => ({ name: row.category, count: row.count }));
    } catch (error) {
      console.error('获取分类失败:', error);
      return Array.from(this.categories).map(category => ({
        name: category,
        count: Array.from(this.newsCache.values()).filter(n => n.category === category).length
      }));
    }
  }

  // 搜索新闻
  async searchNews(query, { page = 1, limit = 20 } = {}) {
    return this.getLatestNews({ page, limit, search: query });
  }

  // 高级搜索
  async advancedSearch(query, options = {}) {
    const { 
      page = 1, 
      limit = 20, 
      category, 
      source, 
      startDate, 
      endDate,
      sortBy = 'publishedAt',
      sortOrder = 'desc'
    } = options;
    
    try {
      await DatabaseService.initialize();
      
      // 构建SQL查询
      let sql = `SELECT * FROM news WHERE (title LIKE ? OR description LIKE ?)`;
      const params = [`%${query}%`, `%${query}%`];
      
      if (category && category !== '全部') {
        sql += ` AND category = ?`;
        params.push(category);
      }
      
      if (source && source !== '全部') {
        sql += ` AND source = ?`;
        params.push(source);
      }
      
      if (startDate) {
        sql += ` AND date(published_at) >= date(?)`;
        params.push(startDate);
      }
      
      if (endDate) {
        sql += ` AND date(published_at) <= date(?)`;
        params.push(endDate);
      }
      
      // 获取总数
      const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
      const countResult = await DatabaseService.get(countSql, params);
      const total = countResult?.count || 0;
      
      // 排序
      const orderColumn = sortBy === 'publishedAt' ? 'published_at' : sortBy;
      const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
      sql += ` ORDER BY ${orderColumn} ${order}`;
      
      // 分页
      const offset = (page - 1) * limit;
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);
      
      const rows = await DatabaseService.all(sql, params);
      
      const data = rows.map(row => ({
        id: row.id,
        title: row.title,
        description: row.description,
        url: row.url,
        publishedAt: row.published_at,
        category: row.category,
        source: row.source,
        imageUrl: row.image_url,
        author: row.author
      }));
      
      return { data, total, page, limit };
      
    } catch (error) {
      console.error('高级搜索失败:', error);
      // 降级到基本搜索
      return this.getLatestNews({ page, limit, search: query, category });
    }
  }

  // 获取所有来源
  async getSources() {
    try {
      await DatabaseService.initialize();
      const stats = await DatabaseService.getSourceStats();
      const metadataMap = this.getSourceMetadataMap();

      return stats
        .map((row) => {
          const metadata = metadataMap.get(row.source) || {};
          const sourceGroup = metadata.sourceGroup || this.inferSourceGroup({ name: row.source });
          return {
            name: row.source,
            count: row.count,
            url: metadata.url || null,
            category: metadata.category || null,
            sourceGroup,
            sourceGroupLabel: this.getSourceGroupLabel(sourceGroup)
          };
        })
        .sort((a, b) =>
          this.getSourceGroupOrder(a.sourceGroup) - this.getSourceGroupOrder(b.sourceGroup) ||
          b.count - a.count ||
          a.name.localeCompare(b.name)
        );
    } catch (error) {
      console.error('获取来源列表失败:', error);
      return [];
    }
  }

  async getAdminSources() {
    try {
      await DatabaseService.initialize();
      const [rows, stats] = await Promise.all([
        DatabaseService.all('SELECT * FROM rss_sources'),
        DatabaseService.getSourceStats()
      ]);

      const rowMap = new Map(rows.map((row) => [row.name, row]));
      const countMap = new Map(stats.map((row) => [row.source, row.count]));

      return this.rssSources
        .map((source) => {
          const row = rowMap.get(source.name) || {};
          const sourceGroup = this.inferSourceGroup(source);
          const enabled = source.enabled !== false;
          const isActive = enabled && (row.is_active ?? 1) !== 0;
          const failCount = row.fail_count || 0;

          return {
            id: row.id || null,
            name: source.name,
            url: source.url,
            category: source.category,
            priority: row.priority ?? source.priority ?? 3,
            language: source.language || 'en',
            source_group: sourceGroup,
            source_group_label: this.getSourceGroupLabel(sourceGroup),
            configured_enabled: enabled,
            is_active: isActive ? 1 : 0,
            is_healthy: isActive && failCount < 5,
            fail_count: failCount,
            article_count: countMap.get(source.name) || 0,
            last_fetch: row.last_fetch || null,
            last_success: row.last_success || null,
            last_error: row.error_message || null,
            error_message: row.error_message || null
          };
        })
        .sort((a, b) =>
          this.getSourceGroupOrder(a.source_group) - this.getSourceGroupOrder(b.source_group) ||
          a.priority - b.priority ||
          a.fail_count - b.fail_count ||
          a.name.localeCompare(b.name)
        );
    } catch (error) {
      console.error('获取管理数据源失败:', error);
      return [];
    }
  }

  // 获取统计信息
  async getStatistics() {
    try {
      await DatabaseService.initialize();
      
      const totalCount = await DatabaseService.getNewsCount();
      const categoryStats = await DatabaseService.getCategoryStats();
      const sourceStats = await DatabaseService.getSourceStats();
      const requestStats = await DatabaseService.getRequestStats(60);
      const todayStats = await DatabaseService.getDailyStats(1);
      
      return {
        total: totalCount,
        today: Number(todayStats[0]?.count || 0),
        categories: categoryStats.reduce((acc, row) => {
          acc[row.category] = row.count;
          return acc;
        }, {}),
        sources: sourceStats.reduce((acc, row) => {
          acc[row.source] = row.count;
          return acc;
        }, {}),
        requestStats,
        lastUpdate: this.updateTime,
        isUpdating: this.isUpdating
      };
    } catch (error) {
      console.error('获取统计信息失败:', error);
      return {
        total: this.newsCache.size,
        categories: {},
        lastUpdate: this.updateTime
      };
    }
  }

  // 内容完整度指标，供分析页展示真实数据库质量而非客户端估算
  async getQualityAnalysis() {
    try {
      await DatabaseService.initialize();
      const row = await DatabaseService.get(`
        SELECT
          COUNT(*) AS totalArticles,
          SUM(CASE
            WHEN image_url IS NOT NULL
              AND TRIM(image_url) != ''
              AND image_url NOT LIKE '%placeholder%'
            THEN 1 ELSE 0
          END) AS withImages,
          SUM(CASE
            WHEN description IS NOT NULL AND LENGTH(TRIM(description)) >= 40
            THEN 1 ELSE 0
          END) AS withDescriptions,
          AVG(LENGTH(COALESCE(description, ''))) AS avgDescriptionLength
        FROM news
        WHERE id IN (
          SELECT MAX(id) FROM news
          GROUP BY COALESCE(NULLIF(TRIM(url), ''), id)
        )
      `);

      return {
        totalArticles: Number(row?.totalArticles || 0),
        withImages: Number(row?.withImages || 0),
        withDescriptions: Number(row?.withDescriptions || 0),
        avgDescriptionLength: Math.round(Number(row?.avgDescriptionLength || 0))
      };
    } catch (error) {
      console.error('获取内容质量指标失败:', error);
      const articles = Array.from(this.newsCache.values());
      const descriptions = articles.map((article) => String(article.description || ''));

      return {
        totalArticles: articles.length,
        withImages: articles.filter((article) => article.imageUrl && !article.imageUrl.includes('placeholder')).length,
        withDescriptions: descriptions.filter((description) => description.trim().length >= 40).length,
        avgDescriptionLength: articles.length
          ? Math.round(descriptions.reduce((sum, description) => sum + description.length, 0) / articles.length)
          : 0
      };
    }
  }

  // 获取热门话题
  async getTrendingTopics(limit = 10) {
    const allNews = await this.getLatestNews({ page: 1, limit: 100 });
    const keywords = new Map();
    
    allNews.data.forEach(news => {
      const words = (news.title || '').toLowerCase()
        .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !this.isStopWord(word));
      
      words.forEach(word => {
        keywords.set(word, (keywords.get(word) || 0) + 1);
      });
    });
    
    return Array.from(keywords.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([keyword, count]) => ({ keyword, count }));
  }

  async getAnalysisNews(limit = 500) {
    await DatabaseService.initialize();
    const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 500);
    const result = await DatabaseService.getNews({ page: 1, limit: safeLimit });
    return {
      ...result,
      data: result.data.map((article) => this.enrichArticleSourceMetadata(article))
    };
  }

  // 信息茧房检测
  async getDiversityAnalysis(userId = 'default') {
    try {
      const { buildDiversitySnapshot } = require('../utils/analytics');
      const latest = await this.getAnalysisNews(200);
      return { ...buildDiversitySnapshot(latest.data), analyzedScope: '最近 200 条去重资讯', userId };
    } catch (error) {
      console.error('获取多样性分析失败:', error);
      return { diversityScore: 0, error: error.message };
    }
  }

  // 计算熵
  calculateEntropy(counts, total) {
    if (total === 0) return 0;
    let entropy = 0;
    for (const count of counts) {
      if (count > 0) {
        const p = count / total;
        entropy -= p * Math.log2(p);
      }
    }
    return entropy;
  }

  // AI趋势分析
  async getTrendAnalysis() {
    const perspectives = [
      {
        id: 1,
        name: '技术突破视角',
        description: '关注AI技术的最新研究进展和算法创新',
        icon: '🔬',
        keywords: ['algorithm', 'model', 'neural', 'transformer', 'training', 'llm', 'gpt'],
        trends: [
          { title: '大模型效率优化', description: '量化、剪枝、知识蒸馏技术持续发展', relevance: 'high' },
          { title: '多模态融合', description: '文本、图像、音频统一理解成为趋势', relevance: 'high' },
          { title: '推理能力增强', description: '链式思维、自我反思技术提升', relevance: 'medium' }
        ]
      },
      {
        id: 2,
        name: '产业应用视角',
        description: '聚焦AI在各行业的落地应用',
        icon: '🏢',
        keywords: ['enterprise', 'application', 'business', 'deploy', 'agent'],
        trends: [
          { title: 'AI Agent商业化', description: '自主AI代理走向实际应用', relevance: 'high' },
          { title: '垂直领域大模型', description: '医疗、法律、金融专业AI加速落地', relevance: 'high' },
          { title: '边缘AI部署', description: '本地化AI运行需求增长', relevance: 'medium' }
        ]
      },
      {
        id: 3,
        name: '伦理治理视角',
        description: '关注AI安全性和社会影响',
        icon: '⚖️',
        keywords: ['safety', 'ethics', 'regulation', 'bias', 'alignment'],
        trends: [
          { title: 'AI安全对齐', description: '确保AI符合人类意图', relevance: 'high' },
          { title: '监管政策完善', description: '各国AI法规加速制定', relevance: 'high' },
          { title: '可解释AI', description: '黑箱模型透明度研究', relevance: 'medium' }
        ]
      }
    ];
    
    // 计算每个视角相关新闻数量
    const allNews = await this.getLatestNews({ page: 1, limit: 200 });
    
    for (const perspective of perspectives) {
      let matchCount = 0;
      for (const news of allNews.data) {
        const content = ((news.title || '') + ' ' + (news.description || '')).toLowerCase();
        if (perspective.keywords.some(kw => content.includes(kw))) {
          matchCount++;
        }
      }
      perspective.relatedNewsCount = matchCount;
      perspective.coverage = allNews.total > 0 ? Math.round(matchCount / allNews.total * 100) : 0;
    }
    
    return {
      perspectives,
      totalAnalyzedNews: allNews.total,
      lastUpdated: new Date().toISOString(),
      summary: '当前AI发展呈现技术突破加速、产业应用深化、治理框架完善三大趋势'
    };
  }

  // 获取多样化推荐
  async getDiversifiedRecommendations(userId = 'default', limit = 10) {
    const diversity = await this.getDiversityAnalysis(userId);
    const allNews = await this.getLatestNews({ page: 1, limit: 100 });
    
    if (allNews.data.length === 0) {
      return { recommendations: [], diversityScore: 0, tip: '暂无数据' };
    }
    
    const { classifyEvidenceType } = require('../utils/analytics');
    const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 30);
    const recommendations = [];
    const usedSources = new Set();
    const usedRegions = new Set();
    const usedEvidence = new Set();
    const pool = allNews.data.map((item) => ({ ...item, evidenceType: classifyEvidenceType(item) }));
    while (recommendations.length < safeLimit && pool.length) {
      pool.sort((a, b) => {
        const noveltyA = Number(!usedSources.has(a.source)) * 4 + Number(!usedRegions.has(a.region)) * 2 + Number(!usedEvidence.has(a.evidenceType)) * 3;
        const noveltyB = Number(!usedSources.has(b.source)) * 4 + Number(!usedRegions.has(b.region)) * 2 + Number(!usedEvidence.has(b.evidenceType)) * 3;
        return noveltyB - noveltyA || new Date(b.publishedAt) - new Date(a.publishedAt);
      });
      const selected = pool.shift();
      recommendations.push({
        ...selected,
        recommendationReason: `补充${usedSources.has(selected.source) ? '' : '新来源、'}${usedRegions.has(selected.region) ? '' : '新地区、'}${usedEvidence.has(selected.evidenceType) ? '' : '新证据类型'}`.replace(/、$/, '')
      });
      usedSources.add(selected.source);
      usedRegions.add(selected.region);
      usedEvidence.add(selected.evidenceType);
    }
    
    return {
      recommendations,
      diversityScore: diversity.diversityScore,
      tip: '按来源、地区和证据类型轮换，减少连续看到同质内容'
    };
  }

  // 清理文本
  cleanText(text) {
    if (!text) return '';
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);
  }

  // 停用词
  isStopWord(word) {
    const stopWords = ['the', 'and', 'for', 'are', 'with', 'this', 'that', 'from', 'they', 'have', 'been', 'will', 'were', 'said', 'which', 'their', 'about', 'would', 'there', 'could', 'other', 'into', 'more', 'some', 'can', 'has', 'was', 'but', 'not', 'what', 'all', 'your', 'when', 'use', 'how', 'each', 'she', 'two', 'way', 'its', 'see', 'now', 'find', 'day', 'get', 'come', 'made', 'may', 'part'];
    return stopWords.includes(word);
  }

  // 获取新闻数量
  async getNewsCount() {
    try {
      await DatabaseService.initialize();
      return await DatabaseService.getNewsCount();
    } catch (error) {
      return this.newsCache.size;
    }
  }

  // 获取最后更新时间
  getLastUpdateTime() {
    return this.updateTime;
  }

  // 手动触发恢复
  async manualRecovery() {
    console.log('手动触发恢复...');
    try {
      await DatabaseService.resetFailedSources();
      this.requestCounts.clear();
      this.lastRequestTime.clear();
      this.dailyRequestCount = 0;
      return await this.updateAllNews();
    } catch (error) {
      console.error('手动恢复失败:', error);
      throw error;
    }
  }

  // 健康检查
  async healthCheck() {
    const stats = await this.getStatistics();
    return {
      status: this.isUpdating ? 'updating' : 'ok',
      newsCount: stats.total,
      lastUpdate: this.updateTime,
      isUpdating: this.isUpdating,
      memoryCache: this.newsCache.size,
      categories: Object.keys(stats.categories || {}).length
    };
  }
}

const newsService = new NewsService();

module.exports = newsService;
module.exports.NewsService = NewsService;
