const CANONICAL_CATEGORIES = ['AI新闻', 'AI框架', '新算法', '新思路', '新工具'];

const CATEGORY_ALIASES = {
  'AI 新闻': 'AI新闻',
  'AI资讯': 'AI新闻',
  'AI 资讯': 'AI新闻',
  'AI 框架': 'AI框架',
  '开发框架': 'AI框架',
  '论文算法': '新算法',
  '行业洞察': '新思路',
  '工具产品': '新工具'
};

const AI_FILTER_KEYWORDS = [
  'AI', 'AIGC', '人工智能', '大模型', '模型', '智能体', 'Agent', 'LLM', 'GPT',
  'Claude', 'Gemini', 'DeepSeek', 'Qwen', '机器学习', '深度学习', '神经网络',
  '机器人', '自动驾驶', '智驾', 'FSD', 'Tesla', '特斯拉', '算力', '芯片', '推理', '训练'
];

const { EXPANDED_NEWS_SOURCES } = require('./expandedNewsSources');

const VERIFIED_AT = '2026-08-08';

const source = (config) => ({
  priority: 2,
  timeout: 20000,
  rateLimit: 30,
  language: 'en',
  region: 'global',
  sourceGroup: 'product',
  verifiedAt: VERIFIED_AT,
  ...config
});

const CORE_NEWS_SOURCES = [
  // 官方实验室、模型与工程团队
  source({ name: 'OpenAI News', url: 'https://openai.com/news/rss.xml', category: 'AI新闻' }),
  source({ name: 'Google Research', url: 'https://research.google/blog/rss/', category: '新思路', sourceGroup: 'research' }),
  source({ name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', category: '新思路', sourceGroup: 'research' }),
  source({ name: 'Microsoft Research', url: 'https://www.microsoft.com/en-us/research/feed/', category: '新思路', sourceGroup: 'research' }),
  source({ name: 'Apple Machine Learning', url: 'https://machinelearning.apple.com/rss.xml', category: '新算法', sourceGroup: 'research' }),
  source({ name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', category: 'AI框架', sourceGroup: 'engineering' }),
  source({ name: 'PyTorch Blog', url: 'https://pytorch.org/blog/feed.xml', category: 'AI框架', sourceGroup: 'engineering' }),
  source({ name: 'TensorFlow Blog', url: 'https://blog.tensorflow.org/feeds/posts/default?alt=rss', category: 'AI框架', sourceGroup: 'engineering' }),
  source({ name: 'LangChain Changelog', url: 'https://docs.langchain.com/oss/python/releases/changelog/rss.xml', category: 'AI框架', sourceGroup: 'engineering' }),
  source({ name: 'AWS Machine Learning', url: 'https://aws.amazon.com/blogs/machine-learning/feed/', category: 'AI框架', sourceGroup: 'engineering' }),
  source({ name: 'NVIDIA AI Blog', url: 'https://blogs.nvidia.com/feed/', category: 'AI新闻', sourceGroup: 'engineering', filterKeywords: AI_FILTER_KEYWORDS }),

  // 论文与学术更新
  source({ name: 'arXiv Artificial Intelligence', url: 'https://export.arxiv.org/rss/cs.AI', category: '新算法', priority: 1, sourceGroup: 'research' }),
  source({ name: 'arXiv Machine Learning', url: 'https://export.arxiv.org/rss/cs.LG', category: '新算法', priority: 1, sourceGroup: 'research' }),
  source({ name: 'arXiv Computation and Language', url: 'https://export.arxiv.org/rss/cs.CL', category: '新算法', priority: 1, sourceGroup: 'research' }),
  source({ name: 'arXiv Computer Vision', url: 'https://export.arxiv.org/rss/cs.CV', category: '新算法', priority: 1, sourceGroup: 'research' }),
  source({ name: 'arXiv Robotics', url: 'https://export.arxiv.org/rss/cs.RO', category: '新算法', priority: 1, sourceGroup: 'research' }),

  // 海外科技媒体
  source({ name: 'MIT Technology Review AI', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', category: 'AI新闻', sourceGroup: 'investment' }),
  source({ name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', category: 'AI新闻', sourceGroup: 'investment' }),
  source({ name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/', category: 'AI新闻', sourceGroup: 'investment' }),
  source({ name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', category: 'AI新闻', sourceGroup: 'investment' }),

  // 中文科技媒体与创作者（综合站点使用关键词过滤，避免混入无关内容）
  source({ name: '量子位', url: 'https://www.qbitai.com/feed', category: 'AI新闻', language: 'zh', region: 'cn', sourceGroup: 'investment' }),
  source({ name: 'FlagEmbedding 官方发布', url: 'https://github.com/FlagOpen/FlagEmbedding/releases.atom', category: 'AI框架', language: 'multi', region: 'cn', sourceGroup: 'research' }),
  source({ name: 'PaddleNLP 官方发布', url: 'https://github.com/PaddlePaddle/PaddleNLP/releases.atom', category: 'AI框架', language: 'multi', region: 'cn', sourceGroup: 'engineering' }),
  source({ name: '开源中国', url: 'https://www.oschina.net/news/rss', category: '新工具', language: 'zh', region: 'cn', sourceGroup: 'engineering', filterKeywords: AI_FILTER_KEYWORDS }),
  source({ name: '雷峰网', url: 'https://www.leiphone.com/feed', category: 'AI新闻', language: 'zh', region: 'cn', sourceGroup: 'investment', filterKeywords: AI_FILTER_KEYWORDS }),
  source({ name: '极客公园', url: 'https://www.geekpark.net/rss', category: 'AI新闻', language: 'zh', region: 'cn', sourceGroup: 'investment', filterKeywords: AI_FILTER_KEYWORDS }),
  source({ name: '爱范儿', url: 'https://www.ifanr.com/feed', category: 'AI新闻', language: 'zh', region: 'cn', sourceGroup: 'investment', filterKeywords: AI_FILTER_KEYWORDS }),
  source({ name: '少数派', url: 'https://sspai.com/feed', category: '新工具', language: 'zh', region: 'cn', sourceGroup: 'product', filterKeywords: AI_FILTER_KEYWORDS }),
  source({ name: '钛媒体', url: 'https://www.tmtpost.com/rss', category: 'AI新闻', language: 'zh', region: 'cn', sourceGroup: 'investment', filterKeywords: AI_FILTER_KEYWORDS }),
  source({ name: '阮一峰科技爱好者周刊', url: 'https://www.ruanyifeng.com/blog/atom.xml', category: '新工具', language: 'zh', region: 'cn', sourceGroup: 'engineering', filterKeywords: AI_FILTER_KEYWORDS }),

  // 国内模型、框架与开源项目官方更新
  source({ name: 'Qwen 官方博客', url: 'https://qwenlm.github.io/blog/index.xml', category: 'AI新闻', language: 'multi', region: 'cn', sourceGroup: 'product', priority: 1 }),
  source({ name: 'Qwen 官方发布', url: 'https://github.com/QwenLM/Qwen3/releases.atom', category: '新工具', language: 'multi', region: 'cn', sourceGroup: 'engineering', priority: 1, enabled: false, disabledReason: 'upstream_repository_has_no_release_entries_use_qwen_blog' }),
  source({ name: 'DeepSeek 官方发布', url: 'https://github.com/deepseek-ai/DeepSeek-V3/releases.atom', category: '新工具', language: 'multi', region: 'cn', sourceGroup: 'engineering', priority: 1 }),
  source({ name: 'InternLM 官方发布', url: 'https://github.com/InternLM/InternLM/releases.atom', category: '新工具', language: 'multi', region: 'cn', sourceGroup: 'engineering' }),
  source({ name: '智谱 GLM 官方动态', url: 'https://github.com/zai-org/GLM-4.5/commits/main.atom', category: '新工具', language: 'multi', region: 'cn', sourceGroup: 'engineering', enabled: false }),
  source({ name: 'MiniCPM 官方发布', url: 'https://github.com/OpenBMB/MiniCPM-V/releases.atom', category: '新工具', language: 'multi', region: 'cn', sourceGroup: 'engineering' }),
  source({ name: '飞桨 PaddlePaddle 官方发布', url: 'https://github.com/PaddlePaddle/Paddle/releases.atom', category: 'AI框架', language: 'multi', region: 'cn', sourceGroup: 'engineering' }),
  source({ name: 'ModelScope 官方发布', url: 'https://github.com/modelscope/modelscope/releases.atom', category: 'AI框架', language: 'multi', region: 'cn', sourceGroup: 'engineering' }),
  source({ name: 'LLaMA Factory 官方发布', url: 'https://github.com/hiyouga/LlamaFactory/releases.atom', category: 'AI框架', language: 'multi', region: 'cn', sourceGroup: 'engineering' }),
  source({ name: 'MindSpore 官方发布', url: 'https://github.com/mindspore-ai/mindspore/releases.atom', category: 'AI框架', language: 'multi', region: 'cn', sourceGroup: 'engineering' }),
  source({ name: 'OpenCompass 官方发布', url: 'https://github.com/open-compass/opencompass/releases.atom', category: 'AI框架', language: 'multi', region: 'cn', sourceGroup: 'research' })
];

const NEWS_SOURCES = [...CORE_NEWS_SOURCES, ...EXPANDED_NEWS_SOURCES].map(source);

function normalizeCategory(category) {
  const normalized = typeof category === 'string' ? category.trim() : '';
  const canonical = CATEGORY_ALIASES[normalized] || normalized;
  return CANONICAL_CATEGORIES.includes(canonical) ? canonical : 'AI新闻';
}

function getActiveNewsSources() {
  return NEWS_SOURCES.filter((item) => item.enabled !== false);
}

function validateSourceCatalog(sources = NEWS_SOURCES) {
  const errors = [];
  const names = new Set();
  const urls = new Set();

  sources.forEach((item, index) => {
    const label = item?.name || `#${index + 1}`;
    if (!item?.name) errors.push(`${label}: 缺少名称`);
    if (!item?.url?.startsWith('https://')) errors.push(`${label}: URL 必须使用 HTTPS`);
    if (names.has(item?.name)) errors.push(`${label}: 名称重复`);
    if (urls.has(item?.url)) errors.push(`${label}: URL 重复`);
    if (!CANONICAL_CATEGORIES.includes(item?.category)) errors.push(`${label}: 分类不规范`);
    if (!['cn', 'global'].includes(item?.region)) errors.push(`${label}: 地区不规范`);
    if (!['zh', 'en', 'multi'].includes(item?.language)) errors.push(`${label}: 语言不规范`);
    names.add(item?.name);
    urls.add(item?.url);
  });

  return errors;
}

module.exports = {
  AI_FILTER_KEYWORDS,
  CANONICAL_CATEGORIES,
  NEWS_SOURCES,
  getActiveNewsSources,
  normalizeCategory,
  validateSourceCatalog
};
