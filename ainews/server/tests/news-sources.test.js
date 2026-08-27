const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CANONICAL_CATEGORIES,
  NEWS_SOURCES,
  getActiveNewsSources,
  validateSourceCatalog
} = require('../config/newsSources');

test('active source catalog is unique, normalized, and https-only', () => {
  const activeSources = getActiveNewsSources();
  const names = activeSources.map((source) => source.name);
  const urls = activeSources.map((source) => source.url);

  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(urls).size, urls.length);
  assert(activeSources.length >= 140);
  assert(activeSources.every((source) => source.url.startsWith('https://')));
  assert(activeSources.every((source) => CANONICAL_CATEGORIES.includes(source.category)));
  assert(activeSources.every((source) => source.verifiedAt === '2026-08-08'));
  assert.deepEqual(validateSourceCatalog(NEWS_SOURCES), []);
});

test('catalog contains at least 100 newly verified feeds across regions and evidence groups', () => {
  const expandedSources = getActiveNewsSources().filter((source) => source.catalogTier === 'expanded');
  const groups = new Set(expandedSources.map((source) => source.sourceGroup));

  assert(expandedSources.length >= 100);
  assert(expandedSources.filter((source) => source.region === 'cn').length >= 25);
  assert(groups.has('research'));
  assert(groups.has('engineering'));
  assert(groups.has('product'));
  assert(groups.has('investment'));
});

test('catalog adds broad Chinese coverage from media and official projects', () => {
  const domesticSources = getActiveNewsSources().filter((source) => source.region === 'cn');
  const domesticNames = new Set(domesticSources.map((source) => source.name));

  assert(domesticSources.length >= 15);
  assert(domesticSources.every((source) => ['zh', 'multi'].includes(source.language)));
  assert(domesticNames.has('量子位'));
  assert(domesticNames.has('Qwen 官方博客'));
  assert(domesticNames.has('DeepSeek 官方发布'));
  assert(domesticNames.has('阿里 MNN 官方发布'));
  assert(domesticNames.has('腾讯 ncnn 官方发布'));
  assert(domesticNames.has('飞桨 PaddlePaddle 官方发布'));
});

test('catalog replaces or disables known retired feed addresses', () => {
  const activeSources = getActiveNewsSources();
  const urls = new Set(activeSources.map((source) => source.url));

  assert(urls.has('https://openai.com/news/rss.xml'));
  assert(!urls.has('https://openai.com/blog/rss.xml'));
  assert(!urls.has('https://blogs.microsoft.com/ai/feed/'));
  assert(!urls.has('https://www.jiqizhixin.com/rss'));
  assert(!urls.has('https://blog.langchain.dev/rss/'));
  assert(!urls.has('https://www.aigc.cn/feed'));
  assert(!urls.has('https://www.infoq.cn/feed'));
  assert(!urls.has('https://github.com/zai-org/GLM-4.5/releases.atom'));
  assert(urls.has('https://docs.langchain.com/oss/python/releases/changelog/rss.xml'));
  assert(urls.has('https://github.com/FlagOpen/FlagEmbedding/releases.atom'));
  assert(urls.has('https://github.com/PaddlePaddle/PaddleNLP/releases.atom'));
  assert(!urls.has('https://github.com/zai-org/GLM-4.5/commits/main.atom'));
});

test('public news catalog excludes raw GitHub commit activity feeds', () => {
  const activeSources = getActiveNewsSources();

  assert.equal(activeSources.some((source) => source.url.includes('/commits/')), false);
});
