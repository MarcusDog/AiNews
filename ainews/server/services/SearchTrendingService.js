// 搜索热词服务 - 从最近新闻标题里挖掘真实热门关键词
const db = require('better-sqlite3');

const STOP_WORDS = new Set([
  // 英文常用
  'the','a','an','in','on','of','to','for','with','and','or','is','are','be','by','from','as','it','this','that','at','&','via','how','what','why','when','where','who','which','than','then','we','our','your','their','you','they','us','i','my',
  'have','has','had','do','does','did','will','would','could','should','may','can','new','more','most','some','all','any','one','two','use','using','based','via','using',
  // 中文常用
  '的','了','在','是','和','与','等','用','为','对','从','不','也','都','我们','你','我','他','她','它','一个','一种','一些','这个','那个','将','可以','使','让','成为','这种','那种','了','啊','吗','呢','吧','其','而','并','及','或','并','还','但','只','已经','进行','基于','通过','关于','之间','其中','更多','需要','如何','为什么','怎么','哪些','什么',
  'AI','ai', // 太泛，不让单字成热词
  '发布','上线','推出','更新','来了','看看','介绍','使用','方法','如何','新','这款','这个','新一','近日','宣布','升级','正式','支持','功能',
]);

// 已知短语白名单（始终保留）
const PHRASE_PATTERNS = [
  /\bGPT-?4o?\b/gi, /\bGPT-?5\b/gi, /\bClaude\b/gi, /\bClaude\s*(3|3\.5|4|Sonnet|Opus|Haiku)/gi,
  /\bGemini\b/gi, /\bLlama\s*\d*/gi, /\bQwen\s*\d*/gi, /\bDeepSeek\s*[-V]?\d*/gi,
  /\bGLM[-\s]?\d*/gi, /\bMistral\s*\w*/gi, /\bSora\b/gi,
  /\bRAG\b/g, /\bLLM\b/g, /\bMCP\b/g, /\bA2A\b/g,
  /\bAI\s*Agent/gi, /\bAI\s*Agents/gi, /\bAgentic\s*\w*/gi,
  /\bMulti-?agent/gi, /\bMultimodal/gi, /\bFine-?tuning/gi,
  /\bPrompt\s*Engineering/gi, /\bVector\s*\w*/gi, /\bEmbedding/gi,
  /\bKnowledge\s*Graph/gi, /\bContext\s*Engineering/gi,
  /\bDiffusion\s*\w*/gi, /\bTransformer/gi,
  /\bPyTorch\b/g, /\bTensorFlow\b/g, /\bLangChain\b/g, /\bLlamaIndex\b/g, /\bHugging\s*Face/gi,
  /\bvLLM\b/g, /\bOllama\b/g, /\bRunpod\b/gi, /\bModal\b/gi,
  /\bOpenAI\b/g, /\bAnthropic\b/g, /\bNVIDIA\b/g,
  /\bVoice\s*Agent/gi, /\bComputer\s*Use/gi, /\bGUI\s*Agent/gi,
  /\bVibe\s*Coding/gi, /\bMCP\s*Server/gi, /\bClaude\s*Code/gi, /\bCursor\b/g,
  /\bSuno\b/g, /\bMidjourney\b/g, /\bStable\s*Diffusion/gi,
  /\bR1\b/g, /\bo\d\b/gi, /\bo3\b/g, /\bo1\b/gi,
];

class SearchTrendingService {
  constructor(dbPath) {
    this.dbPath = dbPath || '/root/website/ainews/server/data/ainews.db';
    this.db = null;
  }

  init() {
    if (!this.db) this.db = new (require('better-sqlite3'))(this.dbPath);
  }

  // 主入口：返回热词 + 热门分类 + 搜索提示
  getTrending(opts = {}) {
    this.init();
    const days = opts.days || 7;
    const limit = opts.limit || 20;
    const minCount = opts.minCount || 3;

    // 最近 N 天新闻
    const titles = this.db.prepare(
      `SELECT title, source, published_at, category FROM news 
       WHERE published_at > datetime('now', '-' || ? || ' day') AND title IS NOT NULL`
    ).all(days);
    
    // 同时取总库热门分类 + 趋势分类
    const hotCategories = this.db.prepare(
      `SELECT category, COUNT(*) AS c FROM news 
       WHERE published_at > datetime('now', '-' || ? || ' day') 
       GROUP BY category ORDER BY c DESC LIMIT 5`
    ).all(days);

    const phrases = this._extractPhrases(titles);
    const filtered = phrases
      .filter(p => p.count >= minCount && !STOP_WORDS.has(p.text.toLowerCase()))
      .slice(0, limit);

    // 搜索提示（基于最近真实高频主题）
    const topSources = this.db.prepare(
      `SELECT source, COUNT(*) AS c FROM news 
       WHERE published_at > datetime('now', '-' || ? || ' day') 
       GROUP BY source ORDER BY c DESC LIMIT 5`
    ).all(days);

    // 关键词 → 关联文章数（用于前端显示"X 篇文章"）
    const keywordStats = filtered.map(p => {
      const articleCount = this.db.prepare(
        `SELECT COUNT(*) AS c FROM news 
         WHERE published_at > datetime('now', '-' || ? || ' day') AND title LIKE ?`
      ).get(days, '%' + p.text + '%').c;
      return {
        keyword: p.text,
        titleHits: p.count,
        articleCount,
        // 用最近一篇标题做 sample
        sample: p.sample
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      windowDays: days,
      totalTitles: titles.length,
      hotKeywords: keywordStats,
      hotCategories: hotCategories.map(c => ({ category: c.category, count: c.c })),
      hotSources: topSources.map(s => ({ source: s.source, count: s.c })),
      searchTips: this._buildSearchTips(hotCategories, topSources, keywordStats)
    };
  }

  _extractPhrases(titles) {
    const counts = new Map();
    const samples = new Map();
    titles.forEach(t => {
      const text = t.title || '';
      // 1. 先抽模式匹配短语（GPT-4、Claude Code 等）
      const seenInTitle = new Set();
      PHRASE_PATTERNS.forEach(rx => {
        const matches = text.match(rx);
        if (matches) {
          matches.forEach(m => {
            const key = m.trim();
            if (!seenInTitle.has(key.toLowerCase())) {
              seenInTitle.add(key.toLowerCase());
              counts.set(key, (counts.get(key) || 0) + 1);
              if (!samples.has(key)) samples.set(key, { title: text, source: t.source });
            }
          });
        }
      });
      // 2. 抽大写词组（专有名词识别）
      const camelCases = text.match(/\b[A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*\b/g) || [];
      camelCases.forEach(w => {
        if (w.length >= 3 && w.length <= 30 && !STOP_WORDS.has(w)) {
          const key = w.trim();
          if (!seenInTitle.has(key.toLowerCase())) {
            seenInTitle.add(key.toLowerCase());
            counts.set(key, (counts.get(key) || 0) + 1);
            if (!samples.has(key)) samples.set(key, { title: text, source: t.source });
          }
        }
      });
      // 3. 抽中文短语（2-8字连续中文）
      const cnPhrases = [];
      const cnRegex = /[\u4e00-\u9fa5]{2,8}/g;
      const allCn = text.match(cnRegex) || [];
      allCn.forEach(w => {
        if (!STOP_WORDS.has(w)) {
          counts.set(w, (counts.get(w) || 0) + 1);
          if (!samples.has(w)) samples.set(w, { title: text, source: t.source });
        }
      });
    });

    return [...counts.entries()]
      .map(([text, count]) => ({ text, count, sample: samples.get(text) }))
      .sort((a, b) => b.count - a.count);
  }

  _buildSearchTips(categories, sources, keywords) {
    const tips = [];
    // 头部：分类建议
    if (categories[0]) tips.push(`最热分类：${categories[0].category}（${categories[0].c} 篇）`);
    // 来源建议
    if (sources[0]) tips.push(`关注源：${sources[0].source}`);
    // 关键词建议
    if (keywords.length > 0) {
      const top3 = keywords.slice(0, 3).map(k => k.keyword).join('、');
      tips.push(`搜索试试：${top3}`);
    }
    tips.push('用英文关键词往往能搜到更多 arXiv 论文');
    return tips;
  }
}

module.exports = { SearchTrendingService };