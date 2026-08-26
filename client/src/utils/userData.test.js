import { createFavoriteSnapshot, updateReadHistory } from './userData';

test('createFavoriteSnapshot keeps a durable article snapshot without unrelated fields', () => {
  expect(createFavoriteSnapshot({
    id: 'one',
    title: 'Story',
    description: 'Summary',
    source: 'Source',
    category: 'AI新闻',
    secret: 'do-not-copy'
  }, 123)).toEqual({
    id: 'one',
    title: 'Story',
    description: 'Summary',
    url: '',
    publishedAt: null,
    category: 'AI新闻',
    source: 'Source',
    imageUrl: null,
    favoritedAt: 123
  });
});

test('updateReadHistory refreshes an existing item and keeps histories bounded', () => {
  const history = Array.from({ length: 500 }, (_, index) => ({ id: `item-${index}`, readAt: index }));
  const updated = updateReadHistory(history, 'item-200', 9999);
  const added = updateReadHistory(updated, 'new-item', 10000);

  expect(updated.find((item) => item.id === 'item-200').readAt).toBe(9999);
  expect(added).toHaveLength(500);
  expect(added[0]).toEqual({ id: 'new-item', readAt: 10000 });
});
