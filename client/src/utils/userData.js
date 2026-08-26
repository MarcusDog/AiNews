export const MAX_READ_HISTORY = 500;

export function createFavoriteSnapshot(news, now = Date.now()) {
  return {
    id: String(news?.id || ''),
    title: String(news?.title || ''),
    description: String(news?.description || ''),
    url: String(news?.url || ''),
    publishedAt: news?.publishedAt || null,
    category: String(news?.category || 'AI新闻'),
    source: String(news?.source || ''),
    imageUrl: news?.imageUrl || null,
    favoritedAt: Number(news?.favoritedAt) || now
  };
}

export function updateReadHistory(history, newsId, readAt = Date.now()) {
  const id = String(newsId || '');
  if (!id) return history;
  const existing = history.find((record) => record.id === id);
  const next = existing
    ? history.map((record) => record.id === id ? { ...record, readAt } : record)
    : [{ id, readAt }, ...history];
  return next
    .sort((a, b) => Number(b.readAt) - Number(a.readAt))
    .slice(0, MAX_READ_HISTORY);
}

export function readStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
