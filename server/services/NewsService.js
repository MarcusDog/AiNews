const RSSParser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');
const DatabaseService = require('./DatabaseService');

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
        rateLimit: 20
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
        rateLimit: 30
      },
      {
        name: 'DeepMind Blog',
        url: 'https://deepmind.google/discover/blog/rss.xml',
        category: '新思路',
        priority: 2,
        timeout: 25000,
        rateLimit: 30
      },
      {
        name: 'Meta AI Blog',
        url: 'https://ai.meta.com/blog/rss/',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Microsoft AI Blog',
        url: 'https://blogs.microsoft.com/ai/feed/',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
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
        rateLimit: 30
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
        rateLimit: 30
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
        language: 'zh'
      },
      {
        name: '量子位',
        url: 'https://www.qbitai.com/feed',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        language: 'zh'
      },
      {
        name: 'PaperWeekly',
        url: 'https://www.paperweekly.site/rss',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30,
        language: 'zh'
      },
      {
        name: 'AI科技大本营',
        url: 'https://blog.csdn.net/dQCFKyQDXYm3F8rB0/rss/list',
        category: 'AI新闻',
        priority: 3,
        timeout: 20000,
        rateLimit: 30,
        language: 'zh'
      },
      
      // ========== 学习资源 ==========
      {
        name: 'Towards Data Science',
        url: 'https://towardsdatascience.com/feed',
        category: '新算法',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
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
        url: 'https://www.deeplearning.ai/the-batch/feed/',
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
        rateLimit: 30
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
        rateLimit: 30
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
        rateLimit: 60
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
        rateLimit: 30
      },
      {
        name: 'Mistral AI Blog',
        url: 'https://mistral.ai/news/rss.xml',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Stability AI Blog',
        url: 'https://stability.ai/blog/rss',
        category: 'AI新闻',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Apple Machine Learning',
        url: 'https://machinelearning.apple.com/rss',
        category: '新算法',
        priority: 2,
        timeout: 25000,
        rateLimit: 30
      },
      {
        name: 'Salesforce AI Research',
        url: 'https://blog.salesforceairesearch.com/rss/',
        category: '新算法',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'AI2 Blog',
        url: 'https://blog.allenai.org/feed',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'EleutherAI Blog',
        url: 'https://blog.eleuther.ai/rss.xml',
        category: 'AI框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
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
        rateLimit: 30
      },
      {
        name: 'Pinecone Blog',
        url: 'https://pinecone.io/blog/rss',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Chroma Blog',
        url: 'https://trychroma.com/blog/rss',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'LlamaIndex Blog',
        url: 'https://blog.llamaindex.ai/rss',
        category: 'AI框架',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'Ollama Blog',
        url: 'https://ollama.ai/blog/rss',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
      },
      {
        name: 'AI Tool Report',
        url: 'https://aitoolreport.com/feed/',
        category: '新工具',
        priority: 3,
        timeout: 20000,
        rateLimit: 30
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
        rateLimit: 30
      },
      {
        name: 'MIT CSAIL',
        url: 'https://www.csail.mit.edu/research/rss',
        category: '新算法',
        priority: 2,
        timeout: 25000,
        rateLimit: 30
      },
      {
        name: 'Oxford AI Research',
        url: 'https://www.oxford.ai/news/rss',
        category: '新思路',
        priority: 2,
        timeout: 25000,
        rateLimit: 30
      },
      {
        name: 'Google DeepMind Safety',
        url: 'https://deepmind.google/discover/blog/safety/rss.xml',
        category: '新思路',
        priority: 2,
        timeout: 20000,
        rateLimit: 30
      }
    ];

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
          apiKey: process.env.NEWSAPI_KEY || 'fae1e349d73345b2a5b8ead577c69b94'
        },
        rateLimit: 100, // 每天100次（免费版）
        dailyLimit: true
      }
    };
    
    // 日请求计数（用于NewsAPI限制）
    this.dailyRequestCount = 0;
    this.lastResetDate = new Date().toDateString();
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
      
      // 按优先级排序RSS源
      const sortedSources = [...this.rssSources].sort((a, b) => 
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
            await DatabaseService.updateRssSourceStatus(source.name, source.url, true);
            
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
            await DatabaseService.updateRssSourceStatus(source.name, source.url, false, error.message);
            
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
          this.dailyRequestCount++;
        } catch (error) {
          results.errors.push(`NewsAPI: ${error.message}`);
        }
      } else {
        console.log('NewsAPI日限制已达到，跳过');
      }

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
          return cached;
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
        
        if (!response.data || response.data.length < 100) {
          throw new Error('RSS内容过短或为空');
        }
        
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
      const validItems = feed.items.filter(item => {
        return item && typeof item === 'object' && (item.title || item.link);
      });

      if (validItems.length === 0) {
        throw new Error('RSS feed中没有有效的文章项');
      }
        
      const articles = feed.items
        .filter(item => item && (item.link || item.title)) // 过滤掉无效项
        .map(item => {
          try {
            return {
              id: this.generateArticleId(item, source),
              title: item.title || '无标题',
              description: this.cleanText(item.contentSnippet || item.description || item.content || ''),
              url: item.link || item.guid || '',
              publishedAt: new Date(item.pubDate || item.isoDate || Date.now()),
              category: source.category,
              source: source.name,
              imageUrl: this.extractImageUrl(item),
              author: item.creator || item.author || source.name
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
    // 使用稳定的唯一标识：优先使用guid或link，避免使用时间戳
    const base = item.guid || item.link || item.title || '';
    // 创建更稳定的哈希，不包含时间戳
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(base + source.name).digest('hex').slice(0, 16);
    return `${source.name.replace(/\s+/g, '_')}_${hash}`;
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

  // 获取NewsAPI数据
  async fetchNewsAPI() {
    const apiConfig = this.apiSources.newsapi;
    
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
      
      const articles = response.data.articles.map(article => ({
        id: `newsapi_${Buffer.from(article.url || '').toString('base64').slice(0, 20)}_${Date.now()}`,
        title: article.title,
        description: this.cleanText(article.description || ''),
        url: article.url,
        publishedAt: new Date(article.publishedAt),
        category: 'AI新闻',
        source: article.source?.name || 'NewsAPI',
        imageUrl: article.urlToImage,
        author: article.author || article.source?.name || 'Unknown'
      }));
      
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
      
      // 从数据库获取
      const result = await DatabaseService.getNews({ page, limit, category, search });
      
      if (result.data.length > 0) {
        return result;
      }
      
      // 如果数据库为空，返回演示数据
      console.log('数据库为空，返回演示数据');
      return this.getDemoNews({ page, limit, category, search });
      
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
      return stats.map(row => ({ name: row.source, count: row.count }));
    } catch (error) {
      console.error('获取来源列表失败:', error);
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
      
      return {
        total: totalCount,
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

  // 信息茧房检测
  async getDiversityAnalysis(userId = 'default') {
    try {
      await DatabaseService.initialize();
      
      const categoryStats = await DatabaseService.getCategoryStats();
      const sourceStats = await DatabaseService.getSourceStats();
      const total = await DatabaseService.getNewsCount();
      
      if (total === 0) {
        return {
          diversityScore: 0,
          categoryDistribution: [],
          sourceDistribution: [],
          recommendations: ['暂无足够数据进行分析'],
          status: 'insufficient_data'
        };
      }
      
      // 计算多样性评分
      const categoryEntropy = this.calculateEntropy(categoryStats.map(c => c.count), total);
      const sourceEntropy = this.calculateEntropy(sourceStats.map(s => s.count), total);
      
      const maxCategoryEntropy = Math.log2(categoryStats.length) || 1;
      const maxSourceEntropy = Math.log2(sourceStats.length) || 1;
      
      const categoryDiversity = categoryEntropy / maxCategoryEntropy;
      const sourceDiversity = sourceEntropy / maxSourceEntropy;
      
      const diversityScore = Math.round((categoryDiversity * 0.4 + sourceDiversity * 0.6) * 100);
      
      // 生成建议
      const recommendations = [];
      
      categoryStats.forEach(cat => {
        if (cat.count / total > 0.5) {
          recommendations.push(`"${cat.category}"内容占比过高(${Math.round(cat.count / total * 100)}%)，建议增加其他类型`);
        }
      });
      
      const expectedCategories = ['AI新闻', 'AI框架', '新算法', '新思路', '新工具'];
      const existingCategories = categoryStats.map(c => c.category);
      const missing = expectedCategories.filter(c => !existingCategories.includes(c));
      
      if (missing.length > 0) {
        recommendations.push(`建议增加: ${missing.join('、')}`);
      }
      
      if (recommendations.length === 0) {
        recommendations.push('内容多样性良好，继续保持！');
      }
      
      let riskLevel = 'low';
      if (diversityScore < 40) riskLevel = 'high';
      else if (diversityScore < 60) riskLevel = 'medium';
      
      return {
        diversityScore,
        categoryDistribution: categoryStats.map(c => ({
          name: c.category,
          count: c.count,
          percentage: Math.round(c.count / total * 100)
        })),
        sourceDistribution: sourceStats.map(s => ({
          name: s.source,
          count: s.count,
          percentage: Math.round(s.count / total * 100)
        })),
        recommendations,
        riskLevel,
        riskMessage: riskLevel === 'high' ? '信息茧房风险较高' : riskLevel === 'medium' ? '可适当增加多样性' : '内容多样性良好',
        totalArticles: total,
        uniqueCategories: categoryStats.length,
        uniqueSources: sourceStats.length
      };
      
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
    
    // 优先推荐低覆盖分类
    const lowCoverage = (diversity.categoryDistribution || [])
      .filter(c => c.percentage < 20)
      .map(c => c.name);
    
    let recommendations = [];
    
    for (const cat of lowCoverage) {
      const catNews = allNews.data.filter(n => n.category === cat).slice(0, 2);
      recommendations.push(...catNews);
    }
    
    // 补充其他类别
    if (recommendations.length < limit) {
      const remaining = allNews.data
        .filter(n => !recommendations.find(r => r.id === n.id))
        .slice(0, limit - recommendations.length);
      recommendations.push(...remaining);
    }
    
    return {
      recommendations: recommendations.slice(0, limit),
      diversityScore: diversity.diversityScore,
      tip: lowCoverage.length > 0 
        ? `为您推荐更多"${lowCoverage.join('、')}"类内容`
        : '根据多样性智能推荐'
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

module.exports = new NewsService();
