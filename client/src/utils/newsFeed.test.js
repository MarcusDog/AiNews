import {
  ITEMS_PER_PAGE,
  getCategoryLabel,
  hasNextPage,
  mergeNewsItems,
  shouldDebounceNewsRequest,
  selectLeadStory,
  selectDistinctSourceStories
} from './newsFeed';

test('news feed uses a compact page size and total-aware pagination', () => {
  expect(ITEMS_PER_PAGE).toBe(24);
  expect(hasNextPage({ page: 1, pageSize: 24, total: 25 })).toBe(true);
  expect(hasNextPage({ page: 1, pageSize: 24, total: 24 })).toBe(false);
  expect(hasNextPage({ page: 2, pageSize: 24, total: 47 })).toBe(false);
});

test('mergeNewsItems removes duplicates by id and canonical URL', () => {
  const merged = mergeNewsItems(
    [{ id: 'one', url: 'https://example.com/story?utm_source=old' }],
    [
      { id: 'two', url: 'https://example.com/story?utm_source=new' },
      { id: 'three', url: 'https://example.com/another' }
    ]
  );

  expect(merged.map((item) => item.id)).toEqual(['one', 'three']);
});

test('editorial helpers prefer an image-led lead story and readable labels', () => {
  const stories = [
    { id: 'one', title: 'No image' },
    { id: 'two', title: 'Visual story', imageUrl: 'https://example.com/image.jpg' }
  ];

  expect(selectLeadStory(stories).id).toBe('two');
  expect(getCategoryLabel('新算法')).toBe('论文算法');
  expect(getCategoryLabel('AI新闻')).toBe('AI 快讯');
});

test('breaking-news rail prefers different publishers before repeating a source', () => {
  const stories = [
    { id: 'lead', source: 'Source A' },
    { id: 'a1', source: 'Source A' },
    { id: 'a2', source: 'Source A' },
    { id: 'b1', source: 'Source B' },
    { id: 'c1', source: 'Source C' }
  ];

  expect(selectDistinctSourceStories(stories, { excludeId: 'lead', limit: 3 }).map((item) => item.id))
    .toEqual(['a1', 'b1', 'c1']);
});

test('initial page requests bypass debounce so React Strict Mode can remount safely', () => {
  expect(shouldDebounceNewsRequest({ page: 1, force: false, elapsed: 20 })).toBe(false);
  expect(shouldDebounceNewsRequest({ page: 2, force: false, elapsed: 20 })).toBe(true);
  expect(shouldDebounceNewsRequest({ page: 2, force: true, elapsed: 20 })).toBe(false);
});
