const test = require('node:test');
const assert = require('node:assert/strict');

const NewsServiceModule = require('../services/NewsService');
const { NewsService } = NewsServiceModule;
const DatabaseService = require('../services/DatabaseService');

test('getActiveRssSources excludes disabled feeds from update scheduling', () => {
  const service = new NewsService();

  const activeSources = service.getActiveRssSources();

  assert(activeSources.length > 0);
  assert(activeSources.every((source) => source.enabled !== false));
  assert(activeSources.some((source) => source.name === 'OpenAI News'));
  assert(activeSources.some((source) => source.name === 'Google DeepMind'));
});

test('validateFeedHttpResponse rejects upstream 404 responses', () => {
  const service = new NewsService();

  assert.throws(
    () =>
      service.validateFeedHttpResponse({
        status: 404,
        data: '<html><body>not found</body></html>',
        headers: { 'content-type': 'text/html; charset=utf-8' }
      }),
    /HTTP 404/
  );
});

test('validateFeedHttpResponse rejects html pages that are not feeds', () => {
  const service = new NewsService();

  assert.throws(
    () =>
      service.validateFeedHttpResponse({
        status: 200,
        data: '<!DOCTYPE html><html><head><title>Landing page</title></head><body>Hello</body></html>',
        headers: { 'content-type': 'text/html; charset=utf-8' }
      }),
    /不是有效的RSS或Atom feed/
  );
});

test('validateFeedHttpResponse accepts xml feeds', () => {
  const service = new NewsService();

  assert.doesNotThrow(() =>
    service.validateFeedHttpResponse({
      status: 200,
      data: '<?xml version="1.0"?><rss><channel><title>Feed</title></channel></rss>',
      headers: { 'content-type': 'application/rss+xml; charset=utf-8' }
    })
  );
});

test('extractAuthorName normalizes structured atom author objects', () => {
  const service = new NewsService();

  const author = service.extractAuthorName(
    {
      author: {
        name: ['Lucia Loher'],
        title: ['Product Manager']
      }
    },
    'Google AI Blog'
  );

  assert.equal(author, 'Lucia Loher');
});

test('normalizeArticleUrl removes tracking noise while preserving meaningful parameters', () => {
  const service = new NewsService();

  assert.equal(
    service.normalizeArticleUrl('https://Example.com/story/?utm_source=rss&ref=homepage&id=42#comments'),
    'https://example.com/story?id=42'
  );
});

test('generateArticleId deduplicates the same canonical URL across sources', () => {
  const service = new NewsService();
  const itemA = { link: 'https://example.com/story?utm_medium=rss' };
  const itemB = { link: 'https://example.com/story?utm_campaign=daily' };

  assert.equal(
    service.generateArticleId(itemA, { name: 'Source A' }),
    service.generateArticleId(itemB, { name: 'Source B' })
  );
});

test('getDuplicateArticleIds collapses legacy URL identities and keeps the canonical rich record', () => {
  const service = new NewsService();
  const duplicates = service.getDuplicateArticleIds([
    {
      id: 'PyTorch_Blog_legacy',
      title: 'Triton Plugin Extensions',
      url: 'https://pytorch.org/blog/triton-plugin-extensions/',
      description: 'Short.'
    },
    {
      id: 'article_canonical',
      title: 'Triton Plugin Extensions',
      url: 'https://pytorch.org/blog/triton-plugin-extensions',
      description: 'A substantially more complete description of the same article.',
      image_url: 'https://pytorch.org/image.png'
    }
  ]);

  assert.deepEqual(duplicates, ['PyTorch_Blog_legacy']);
});

test('normalizeCachedArticles reapplies current relevance and classification rules before database writes', () => {
  const service = new NewsService();
  const source = service.getActiveRssSources().find((item) => item.name === '开源中国');
  const cached = service.normalizeCachedArticles([
    {
      id: 'legacy_finance_id',
      title: '宇树科技 IPO 战略配售曝光：DeepSeek 获配 93.3 万股',
      url: 'https://example.com/ipo/?utm_source=cache',
      category: '新工具'
    },
    {
      id: 'legacy_shop_id',
      title: 'ShopXO 免费开源商城系统 v6.9.1 版本已发布',
      url: 'https://example.com/shopxo',
      category: '新工具'
    }
  ], source);

  assert.equal(cached.length, 1);
  assert.equal(cached[0].category, 'AI新闻');
  assert.equal(cached[0].url, 'https://example.com/ipo');
  assert.match(cached[0].id, /^article_[a-f0-9]{20}$/);
});

test('normalizeCachedArticles applies the same per-project release limit as live feeds', () => {
  const service = new NewsService();
  const source = service.getActiveRssSources().find((item) => item.name === 'Anthropic TypeScript SDK 发布');
  const cached = Array.from({ length: 7 }, (_, index) => ({
    title: `v1.${index}.0`,
    url: `https://github.com/anthropics/anthropic-sdk-typescript/releases/tag/v1.${index}.0`
  }));

  assert.equal(service.normalizeCachedArticles(cached, source).length, 3);
});

test('public news quality gate rejects commit hashes, nightly tags and automated maintenance', () => {
  const service = new NewsService();
  const releaseSource = {
    name: 'PyTorch 官方发布',
    url: 'https://github.com/pytorch/pytorch/releases.atom',
    category: 'AI框架',
    sourceGroup: 'engineering'
  };

  assert.equal(service.isPublicNewsItem({ title: 'trunk/80a802e49932d20c6b2539dc6cab6cc8d0dd04cc' }, releaseSource), false);
  assert.equal(service.isPublicNewsItem({ title: 'trunk/80a802e49932d20c6b2539dc6cab6cc8d0dd04cc: Fix allocator' }, releaseSource), false);
  assert.equal(service.isPublicNewsItem({ title: 'Bump gitpython from 3.1.54 to 3.1.58' }, releaseSource), false);
  assert.equal(service.isPublicNewsItem({ title: 'b10329' }, releaseSource), false);
  assert.equal(service.isPublicNewsItem({ title: 'v2.7.0' }, releaseSource), true);
  assert.equal(
    service.isPublicNewsItem(
      { title: 'Improve distributed inference scheduling' },
      { ...releaseSource, url: 'https://github.com/pytorch/torchchat/commits/main.atom' }
    ),
    false
  );
});

test('release titles are normalized into readable project announcements', () => {
  const service = new NewsService();

  assert.equal(
    service.normalizePublicNewsTitle('v1.94.2', { name: 'LiteLLM 官方发布' }),
    'LiteLLM 发布 v1.94.2'
  );
  assert.equal(
    service.normalizePublicNewsTitle('aws-sdk: v0.6.2', { name: 'Anthropic TypeScript SDK 发布' }),
    'Anthropic TypeScript SDK 发布 aws-sdk v0.6.2'
  );
  assert.equal(
    service.normalizePublicNewsTitle('v1.3.0rc23', { name: 'TensorRT-LLM 官方发布' }),
    'TensorRT-LLM 发布 v1.3.0rc23'
  );
  assert.equal(
    service.normalizePublicNewsTitle('v0.25.0.post1', { name: 'Apache TVM 发布' }),
    'Apache TVM 发布 v0.25.0.post1'
  );
  assert.equal(
    service.normalizePublicNewsTitle('v2.2.0:', { name: 'ChatDev 官方发布' }),
    'ChatDev 发布 v2.2.0'
  );
  assert.equal(
    service.normalizePublicNewsTitle('v1.1.0(12/10/2023)', { name: 'OpenMMLab MMPreTrain 发布' }),
    'OpenMMLab MMPreTrain 发布 v1.1.0'
  );
  assert.equal(
    service.normalizePublicNewsTitle('Firebird launches a new AI factory', { name: 'TechCrunch AI' }),
    'Firebird launches a new AI factory'
  );
});

test('release feeds cannot flood the public stream with one project', () => {
  const service = new NewsService();
  const items = [
    { title: 'trunk/80a802e49932d20c6b2539dc6cab6cc8d0dd04cc' },
    ...Array.from({ length: 8 }, (_, index) => ({ title: `v1.${index}.0` }))
  ];
  const releaseSource = { url: 'https://github.com/example/project/releases.atom' };

  assert.deepEqual(service.selectPublicFeedItems(items, releaseSource).map((item) => item.title), [
    'v1.0.0',
    'v1.1.0',
    'v1.2.0'
  ]);
  assert.equal(
    service.selectPublicFeedItems(items, { url: 'https://example.com/editorial.xml' }).length,
    8
  );
});

test('stored news quality plan removes raw engineering activity and repairs formal release titles', () => {
  const service = new NewsService();
  const plan = service.getStoredNewsQualityPlan([
    {
      id: 'raw-commit',
      title: 'trunk/58766245fc08f235d8959f6e533e9bc7adbd223a',
      source: 'PyTorch 官方发布',
      url: 'https://github.com/pytorch/pytorch/releases/tag/trunk%2F58766245fc08f235d8959f6e533e9bc7adbd223a'
    },
    {
      id: 'release',
      title: 'v1.94.2',
      source: 'LiteLLM 官方发布',
      url: 'https://github.com/BerriAI/litellm/releases/tag/v1.94.2'
    }
  ]);

  assert.deepEqual(plan.removeIds, ['raw-commit']);
  assert.deepEqual(plan.titleUpdates, [{ id: 'release', title: 'LiteLLM 发布 v1.94.2' }]);
});

test('stored news quality plan retains at most three releases per project', () => {
  const service = new NewsService();
  const releases = Array.from({ length: 5 }, (_, index) => ({
    id: `release-${index}`,
    title: `v1.${index}.0`,
    source: 'LiteLLM 官方发布',
    url: `https://github.com/BerriAI/litellm/releases/tag/v1.${index}.0`
  }));

  const plan = service.getStoredNewsQualityPlan(releases);

  assert.deepEqual(plan.removeIds, ['release-3', 'release-4']);
});

test('source keyword filters reject unrelated stories without hiding AI coverage', () => {
  const service = new NewsService();
  const source = { filterKeywords: ['AI', '人工智能', '大模型'] };
  const oschinaSource = service.getActiveRssSources().find((item) => item.name === '开源中国');

  assert.equal(service.isSourceItemRelevant({ title: '一家咖啡店的设计更新' }, source), false);
  assert.equal(service.isSourceItemRelevant({ title: 'Notepad 发布', description: 'Baidu download mirror' }, source), false);
  assert.equal(service.isSourceItemRelevant({ title: 'PostgreSQL 19 新特性', description: '作者使用 AI 工具总结更新日志' }, source), false);
  assert.equal(service.isSourceItemRelevant({ title: 'ShopXO 免费开源商城系统 v6.9.1 版本已发布' }, oschinaSource), false);
  assert.equal(service.isSourceItemRelevant({ title: '国产大模型发布新版本' }, source), true);
  assert.equal(service.isSourceItemRelevant({ title: 'AI coding platform launches' }, source), true);
});

test('source keyword filters keep autonomous-driving AI coverage in broad Chinese feeds', () => {
  const service = new NewsService();
  const source = service.getActiveRssSources().find((item) => item.name === '雷峰网');

  assert.equal(
    service.isSourceItemRelevant({ title: '特斯拉 FSD 升级事故，看清中美智驾监管差异' }, source),
    true
  );
});

test('classifyArticle normalizes legacy categories and recognizes developer tooling', () => {
  const service = new NewsService();

  assert.equal(
    service.classifyArticle(
      { title: 'New inference SDK and API for developers', description: 'Open source framework' },
      { category: 'AI 新闻' }
    ),
    'AI框架'
  );
  assert.equal(service.classifyArticle({ title: 'Industry funding update' }, { category: 'AI 新闻' }), 'AI新闻');
  assert.equal(
    service.classifyArticle({ title: 'AI testing framework remains vague' }, { category: 'AI新闻', sourceGroup: 'investment' }),
    'AI新闻'
  );
  assert.equal(
    service.classifyArticle({ title: '算法工程师误删业务数据' }, { category: '新工具', sourceGroup: 'engineering' }),
    'AI新闻'
  );
  assert.equal(
    service.classifyArticle({ title: 'Capital investment rises for robotics companies' }, { category: 'AI新闻', sourceGroup: 'investment' }),
    'AI新闻'
  );
  assert.equal(
    service.classifyArticle({ title: 'An API framework for embodied reasoning' }, { category: '新算法', sourceGroup: 'research' }),
    'AI框架'
  );
});

test('classifyArticle uses article evidence instead of blindly trusting the source category', () => {
  const service = new NewsService();

  assert.equal(
    service.classifyArticle(
      { title: '频发高温故障！特斯拉 FSD 升级事故，看清中美智驾监管差异' },
      { name: '研究型媒体', category: '新算法', sourceGroup: 'research' }
    ),
    'AI新闻'
  );
  assert.equal(
    service.classifyArticle(
      { title: 'Google Maps launches new AI features for travelers' },
      { name: 'TechCrunch AI', category: 'AI新闻', sourceGroup: 'media' }
    ),
    'AI新闻'
  );
  assert.equal(
    service.classifyArticle(
      { title: 'Company releases quarterly product update after earnings call' },
      { name: 'Industry Wire', category: 'AI新闻', sourceGroup: 'media' }
    ),
    'AI新闻'
  );
  assert.equal(
    service.classifyArticle(
      { title: "SoftBank donated to a presidential library", description: 'The company will also build a data center.' },
      { name: 'The Verge AI', category: 'AI新闻', sourceGroup: 'media' }
    ),
    'AI新闻'
  );
  assert.equal(
    service.classifyArticle(
      { title: 'DeepSeek 将上调 API 定价', description: '官方服务价格即将变化。' },
      { name: '开源中国', category: '新工具', sourceGroup: 'engineering' }
    ),
    'AI新闻'
  );
  assert.equal(
    service.classifyArticle(
      { title: '宇树科技 IPO 战略配售曝光：DeepSeek 获配 93.3 万股，锁定 36 个月' },
      { name: '开源中国', category: '新工具', sourceGroup: 'engineering' }
    ),
    'AI新闻'
  );
  assert.equal(
    service.classifyArticle(
      { title: 'PyTorch Conference North America Announces 2026 Keynotes' },
      { name: 'PyTorch Blog', category: 'AI框架', sourceGroup: 'engineering' }
    ),
    'AI新闻'
  );
  assert.equal(
    service.classifyArticle(
      { title: 'MiniMax H3 视频模型登顶评测榜', description: '合作伙伴正在增加推理框架支持。' },
      { name: '雷峰网', category: 'AI新闻', sourceGroup: 'media' }
    ),
    'AI新闻'
  );
});

test('classifyArticle requires concrete academic or usable-product signals for specialist tabs', () => {
  const service = new NewsService();

  assert.equal(
    service.classifyArticle(
      { title: 'Paper proposes a sparse attention algorithm and reports a new benchmark' },
      { name: 'arXiv Artificial Intelligence', category: '新算法', sourceGroup: 'research' }
    ),
    '新算法'
  );
  assert.equal(
    service.classifyArticle(
      { title: 'SafeCommit: Certifying When Agents May Safely Act', description: 'We study failure detection and accident prevention.' },
      { name: 'arXiv Artificial Intelligence', category: '新算法', sourceGroup: 'research' }
    ),
    '新算法'
  );
  assert.equal(
    service.classifyArticle(
      { title: 'Acme Studio is now available as an open-source desktop app' },
      { name: 'Acme Blog', category: 'AI新闻', sourceGroup: 'official' }
    ),
    '新工具'
  );
  assert.equal(
    service.classifyArticle(
      { title: 'Acme releases its annual AI safety and governance report' },
      { name: 'Acme Blog', category: '新工具', sourceGroup: 'official' }
    ),
    '新思路'
  );
  assert.equal(
    service.classifyArticle(
      { title: 'v1.39.1' },
      { name: 'ModelScope 官方发布', category: 'AI框架', sourceGroup: 'engineering' }
    ),
    'AI框架'
  );
  assert.equal(
    service.classifyArticle(
      { title: 'MateClaw 2.0.0 发布：Agent 团队与共享任务板' },
      { name: '开源中国', category: '新工具', sourceGroup: 'engineering' }
    ),
    '新工具'
  );
  assert.equal(
    service.classifyArticle(
      { title: 'SkillOpt: Agent skills as trainable parameters' },
      { name: 'Microsoft Research', category: '新思路', sourceGroup: 'research' }
    ),
    '新算法'
  );
  assert.equal(
    service.classifyArticle(
      { title: 'Triton Plugin Extensions: Enabling TLX and Custom Compiler Passes Out of the Box' },
      { name: 'PyTorch Blog', category: 'AI框架', sourceGroup: 'engineering' }
    ),
    'AI框架'
  );
});

test('normalizePagination clamps invalid and oversized requests', () => {
  const service = new NewsService();

  assert.deepEqual(service.normalizePagination({ page: '-3', limit: '1000' }), { page: 1, limit: 100 });
  assert.deepEqual(service.normalizePagination({ page: '2', limit: '24' }), { page: 2, limit: 24 });
});

test('database-disabled sources are excluded while new configured sources still run', () => {
  const service = new NewsService();
  const sources = service.getSchedulableSources([
    { name: 'OpenAI News', is_active: 0 },
    { name: 'Google Research', is_active: 1 }
  ]);

  assert(!sources.some((source) => source.name === 'OpenAI News'));
  assert(sources.some((source) => source.name === 'Google Research'));
  assert(sources.some((source) => source.name === '量子位'));
});

test('source metadata marks domestic articles without changing the database schema', () => {
  const service = new NewsService();
  const article = service.enrichArticleSourceMetadata({ id: 'one', source: '量子位' });

  assert.equal(article.region, 'cn');
  assert.equal(article.language, 'zh');
  assert.equal(article.sourceGroupLabel, '投资');
});

test('NewsAPI is optional and never falls back to an embedded key', async () => {
  const previousKey = process.env.NEWSAPI_KEY;
  delete process.env.NEWSAPI_KEY;

  try {
    const service = new NewsService();
    assert.equal(service.apiSources.newsapi.params.apiKey, null);
    assert.deepEqual(await service.fetchNewsAPI(), {
      articles: [],
      skipped: true,
      reason: 'NEWSAPI_KEY 未配置'
    });
  } finally {
    if (previousKey) process.env.NEWSAPI_KEY = previousKey;
  }
});

test('NewsAPI results are filtered for AI relevance and use stable URL identities', () => {
  const service = new NewsService();
  const input = [
    {
      title: 'New AI inference model cuts serving costs',
      description: 'A machine learning release for developers',
      url: 'https://example.com/ai-model?utm_source=newsapi',
      publishedAt: '2026-08-05T00:00:00Z',
      source: { name: 'Example Tech' }
    },
    {
      title: 'Clinical infrared imaging academy launches',
      description: 'A new course for medical staff',
      url: 'https://example.com/infrared',
      publishedAt: '2026-08-05T00:00:00Z',
      source: { name: 'Newswire' }
    }
  ];

  const first = service.normalizeNewsApiArticles(input);
  const second = service.normalizeNewsApiArticles(input);

  assert.equal(first.length, 1);
  assert.equal(first[0].url, 'https://example.com/ai-model');
  assert.equal(first[0].id, second[0].id);
});

test('empty feeds return a transparent syncing state instead of fabricated news', () => {
  const service = new NewsService();

  assert.deepEqual(service.createEmptyNewsResult({ page: 2, limit: 24 }), {
    data: [],
    total: 0,
    page: 2,
    limit: 24,
    isDemo: false,
    syncing: true
  });
});

test('findIrrelevantArticleIds identifies stale false positives from broad feeds', () => {
  const service = new NewsService();
  const source = { filterKeywords: ['AI', '人工智能', '大模型'] };
  const ids = service.findIrrelevantArticleIds([
    { id: 'notepad', title: 'Notepad 发布', description: 'Baidu download mirror' },
    { id: 'model', title: '国产大模型发布', description: 'AI inference update' }
  ], source);

  assert.deepEqual(ids, ['notepad']);
});

test('getQualityAnalysis returns database-backed content completeness metrics', async () => {
  const originalInitialize = DatabaseService.initialize;
  const originalGet = DatabaseService.get;

  DatabaseService.initialize = async () => {};
  DatabaseService.get = async (sql) => {
    assert.match(sql, /COUNT\(\*\)/);
    return {
      totalArticles: 12,
      withImages: 9,
      withDescriptions: 10,
      avgDescriptionLength: 84.6
    };
  };

  try {
    const service = new NewsService();
    assert.deepEqual(await service.getQualityAnalysis(), {
      totalArticles: 12,
      withImages: 9,
      withDescriptions: 10,
      avgDescriptionLength: 85
    });
  } finally {
    DatabaseService.initialize = originalInitialize;
    DatabaseService.get = originalGet;
  }
});

test('getArticleCategoryUpdates repairs categories produced by legacy rules', () => {
  const service = new NewsService();
  const updates = service.getArticleCategoryUpdates([
    {
      id: 'policy',
      title: 'A new AI testing framework remains limited under federal policy',
      description: '',
      category: 'AI框架',
      source: 'The Verge AI'
    },
    {
      id: 'engineer',
      title: '算法工程师误删业务数据',
      description: '',
      category: '新算法',
      source: '开源中国'
    },
    {
      id: 'paper',
      title: 'A new benchmark for visual reasoning',
      description: '',
      category: '新算法',
      source: 'arXiv Artificial Intelligence'
    },
    {
      id: 'legacy-label',
      title: 'Industry funding update',
      description: '',
      category: 'AI 新闻',
      source: 'Legacy Feed'
    }
  ]);

  assert.deepEqual(updates, [
    { id: 'policy', category: '新思路' },
    { id: 'engineer', category: 'AI新闻' },
    { id: 'legacy-label', category: 'AI新闻' }
  ]);
});
