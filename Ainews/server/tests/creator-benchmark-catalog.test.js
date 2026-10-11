const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { CREATOR_VERTICALS } = require('../config/creatorVerticals');
const { validateCreatorCatalog } = require('../services/creators/creator-catalog');

const catalogPath = path.join(__dirname, '..', 'config', 'creatorBenchmarks.json');

test('benchmark catalog contains 100 distinct verified creators with balanced launch verticals', () => {
  assert.ok(fs.existsSync(catalogPath), 'creatorBenchmarks.json is required');
  const catalog = validateCreatorCatalog(JSON.parse(fs.readFileSync(catalogPath, 'utf8')), {
    verticals: CREATOR_VERTICALS
  });
  const verified = catalog.creators.filter((creator) => creator.reviewStatus === 'verified');
  assert.ok(verified.length >= 100, `expected at least 100 verified creators, received ${verified.length}`);

  for (const vertical of CREATOR_VERTICALS) {
    const count = verified.filter((creator) => creator.verticalIds.includes(vertical.id)).length;
    assert.ok(count >= 20, `${vertical.id} requires at least 20 verified creators, received ${count}`);
  }

  const accounts = verified.flatMap((creator) => creator.accounts);
  assert.equal(new Set(accounts.map((account) => account.id)).size, accounts.length);
  assert.ok(accounts.every((account) => account.enabled));
  assert.ok(accounts.every((account) => /^https:\/\//.test(account.profileUrl)));
  assert.ok(accounts.every((account) => /^https:\/\//.test(account.verificationEvidence)));
  assert.ok(accounts.every((account) => account.lastVerifiedAt));
  assert.ok(accounts.filter((account) => account.platform === 'youtube')
    .every((account) => /^UC[A-Za-z0-9_-]{20,30}$/.test(account.externalAccountId)));
  assert.ok(verified.some((creator) => creator.kind === 'person'));
  assert.ok(verified.some((creator) => creator.kind === 'media'));

  const danielSimmons = verified.find((creator) => creator.id === 'fashion-imdanielsimmons');
  assert.equal(danielSimmons?.accounts[0]?.externalAccountId, 'UCOgz_YflAsYnGbdvzXuKNCA',
    'common-name handle collision must not map Daniel Simmons to an unrelated channel');
});
