import { buildAdminHeaders } from './admin';

test('admin requests use an explicit in-memory credential header', () => {
  expect(buildAdminHeaders('only-in-memory')).toEqual({
    'Content-Type': 'application/json',
    'x-admin-api-key': 'only-in-memory'
  });
});
