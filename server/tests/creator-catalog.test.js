const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const verticalsPath = path.join(__dirname, '../config/creatorVerticals.js');
const catalogPath = path.join(__dirname, '../services/creators/creator-catalog.js');
const examplePath = path.join(__dirname, '../config/creatorSeeds.example.json');

function loadModules() {
  return {
    verticals: require(verticalsPath),
    catalog: require(catalogPath)
  };
}

function validSeed(overrides = {}) {
  return {
    id: 'creator-example',
    displayName: 'Example Creator',
    kind: 'person',
    reviewStatus: 'verified',
    reviewedAt: '2026-08-28T00:00:00.000Z',
    verticalIds: ['ai-tech'],
    accounts: [{
      id: 'youtube:UC_stable_example',
      platform: 'youtube',
      externalAccountId: 'UC_stable_example',
      handle: '@example',
      profileUrl: 'https://www.youtube.com/channel/UC_stable_example',
      region: 'global',
      sourceTier: 'L1',
      enabled: true,
      visibility: 'public',
      lastVerifiedAt: '2026-08-28T00:00:00.000Z',
      authState: 'not_required',
      backfillState: 'pending'
    }],
    ...overrides
  };
}

test('four versioned vertical definitions include classification and audience fields', () => {
  const { verticals } = loadModules();
  assert.equal(verticals.VERTICAL_VERSION, 'vertical-v1');
  assert.deepEqual(verticals.CREATOR_VERTICALS.map((item) => item.id), [
    'beauty', 'fashion', 'ai-tech', 'entertainment'
  ]);

  for (const vertical of verticals.CREATOR_VERTICALS) {
    assert.equal(vertical.version, 'vertical-v1');
    assert.equal(vertical.enabled, true);
    assert(vertical.keywords.length >= 4);
    assert(vertical.negativeKeywords.length >= 1);
    assert(vertical.contentTypes.length >= 2);
    assert(vertical.audienceIntents.length >= 2);
  }
});

test('validated catalog requires stable account identity and canonical public profiles', () => {
  const { catalog, verticals } = loadModules();
  const result = catalog.validateCreatorCatalog({ version: 'creator-seeds-v1', creators: [validSeed()] }, {
    verticals: verticals.CREATOR_VERTICALS
  });

  assert.equal(result.creators[0].accounts[0].externalAccountId, 'UC_stable_example');
  assert.equal(result.creators[0].accounts[0].profileUrl, 'https://www.youtube.com/channel/UC_stable_example');
  assert.equal(result.creators[0].accounts[0].enabled, true);
  assert.equal(result.creators[0].reviewStatus, 'verified');
});

test('catalog rejects nickname-only, duplicate, unknown, private and unreviewed enabled entries', () => {
  const { catalog, verticals } = loadModules();
  const validate = (creators) => catalog.validateCreatorCatalog({
    version: 'creator-seeds-v1',
    creators
  }, { verticals: verticals.CREATOR_VERTICALS });

  const nicknameOnly = validSeed();
  delete nicknameOnly.accounts[0].externalAccountId;
  assert.throws(() => validate([nicknameOnly]), /externalAccountId/);

  const duplicate = validSeed({
    id: 'creator-duplicate',
    accounts: [{ ...validSeed().accounts[0], id: 'youtube:another-local-id' }]
  });
  assert.throws(() => validate([validSeed(), duplicate]), /duplicate platform account/i);

  assert.throws(() => validate([validSeed({ verticalIds: ['unknown'] })]), /unknown vertical/i);

  const privateSeed = validSeed();
  privateSeed.accounts[0].visibility = 'private';
  assert.throws(() => validate([privateSeed]), /public/);

  const candidate = validSeed({ reviewStatus: 'candidate', reviewedAt: null });
  assert.throws(() => validate([candidate]), /candidate.*enabled|verified/i);
});

test('candidate accounts remain disabled until an operator verifies them', () => {
  const { catalog, verticals } = loadModules();
  const candidate = validSeed({ reviewStatus: 'candidate', reviewedAt: null });
  candidate.accounts[0].enabled = false;
  candidate.accounts[0].lastVerifiedAt = null;

  const result = catalog.validateCreatorCatalog({ version: 'creator-seeds-v1', creators: [candidate] }, {
    verticals: verticals.CREATOR_VERTICALS
  });
  assert.equal(result.creators[0].reviewStatus, 'candidate');
  assert.equal(result.creators[0].accounts[0].enabled, false);
});

test('operator seed path is loaded explicitly and converted into store records', () => {
  const { catalog, verticals } = loadModules();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-creator-catalog-'));
  const seedPath = path.join(directory, 'watchlist.json');
  fs.writeFileSync(seedPath, JSON.stringify({ version: 'creator-seeds-v1', creators: [validSeed()] }));

  const loaded = catalog.loadCreatorCatalog({
    env: { AYA_CREATOR_SEEDS_PATH: seedPath },
    verticals: verticals.CREATOR_VERTICALS
  });
  const records = catalog.toStoreRecords(loaded);

  assert.equal(loaded.sourcePath, seedPath);
  assert.equal(records.creators.length, 1);
  assert.equal(records.accounts.length, 1);
  assert.equal(records.creators[0].verticalIds[0], 'ai-tech');
  assert.equal(records.accounts[0].creatorId, 'creator-example');
});

test('missing operator path fails closed instead of silently using guessed accounts', () => {
  const { catalog, verticals } = loadModules();
  assert.throws(() => catalog.loadCreatorCatalog({
    env: { AYA_CREATOR_SEEDS_PATH: '/definitely/missing/creator-seeds.json' },
    verticals: verticals.CREATOR_VERTICALS
  }), /not found/i);
});

test('committed example contains two reviewed public canaries per vertical', () => {
  const { catalog, verticals } = loadModules();
  const example = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
  const result = catalog.validateCreatorCatalog(example, { verticals: verticals.CREATOR_VERTICALS });
  const counts = new Map(verticals.CREATOR_VERTICALS.map((vertical) => [vertical.id, 0]));
  const platforms = new Set();

  for (const creator of result.creators) {
    for (const verticalId of creator.verticalIds) counts.set(verticalId, counts.get(verticalId) + 1);
    for (const account of creator.accounts) {
      platforms.add(account.platform);
      assert.equal(account.visibility, 'public');
      assert.equal(account.enabled, true);
      assert.equal(account.sourceTier, 'L1');
      assert.match(account.profileUrl, /^https:\/\//);
    }
  }

  for (const [verticalId, count] of counts) {
    assert(count >= 2, `${verticalId} must include at least two verified canaries`);
  }
  assert(platforms.size >= 3, 'canaries should exercise multiple public connector types');
  assert([...platforms].every((platform) => ['youtube', 'rss', 'bluesky', 'mastodon', 'github'].includes(platform)));
});
