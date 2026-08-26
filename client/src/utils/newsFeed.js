export const ITEMS_PER_PAGE = 24;

const TRACKING_PARAMS = new Set([
  'ref', 'source', 'from', 'spm', 'campaign', 'mc_cid', 'mc_eid'
]);

export const canonicalizeNewsUrl = (rawUrl = '') => {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    [...url.searchParams.keys()].forEach((key) => {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    });
    url.pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return rawUrl.trim();
  }
};

export const hasNextPage = ({ page, pageSize, total }) => page * pageSize < total;

export const shouldDebounceNewsRequest = ({ page, force, elapsed, threshold = 600 }) => (
  !force && page > 1 && elapsed < threshold
);

export const mergeNewsItems = (current = [], incoming = []) => {
  const seenIds = new Set();
  const seenUrls = new Set();

  return [...current, ...incoming].filter((item) => {
    const canonicalUrl = canonicalizeNewsUrl(item?.url || '');
    if ((item?.id && seenIds.has(item.id)) || (canonicalUrl && seenUrls.has(canonicalUrl))) {
      return false;
    }
    if (item?.id) seenIds.add(item.id);
    if (canonicalUrl) seenUrls.add(canonicalUrl);
    return true;
  });
};

export const selectLeadStory = (stories = []) => (
  stories.find((story) => Boolean(story?.imageUrl)) || stories[0] || null
);

export const selectDistinctSourceStories = (stories = [], { excludeId = null, limit = 3 } = {}) => {
  const eligible = stories.filter((story) => story?.id !== excludeId);
  const selected = [];
  const repeated = [];
  const seenSources = new Set();

  eligible.forEach((story, index) => {
    const sourceKey = String(story?.source || `unknown-${story?.id || index}`).trim();
    if (seenSources.has(sourceKey)) repeated.push(story);
    else {
      seenSources.add(sourceKey);
      selected.push(story);
    }
  });

  return [...selected, ...repeated].slice(0, limit);
};

const CATEGORY_LABELS = {
  '全部': '全部资讯',
  'AI新闻': 'AI 快讯',
  'AI框架': '开发框架',
  '新算法': '论文算法',
  '新思路': '行业洞察',
  '新工具': '工具产品'
};

export const getCategoryLabel = (category) => CATEGORY_LABELS[category] || category;
