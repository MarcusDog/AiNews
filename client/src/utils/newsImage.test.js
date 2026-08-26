import { hasUsableNewsImage } from './newsImage';

test('news cards reserve image space only for usable remote images', () => {
  expect(hasUsableNewsImage({})).toBe(false);
  expect(hasUsableNewsImage({ imageUrl: '  ' })).toBe(false);
  expect(hasUsableNewsImage({ imageUrl: '/placeholder-image.svg' })).toBe(false);
  expect(hasUsableNewsImage({ imageUrl: 'data:image/svg+xml;base64,PHN2Zz4=' })).toBe(false);
  expect(hasUsableNewsImage({ imageUrl: 'https://example.com/story.jpg' })).toBe(true);
});
