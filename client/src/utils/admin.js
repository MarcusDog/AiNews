export function buildAdminHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-admin-api-key': apiKey
  };
}
