const test = require('node:test');
const assert = require('node:assert/strict');

const glossaryRouter = require('../routes/glossary');

test('AI glossary exposes more than 1000 unique, substantial knowledge entries', () => {
  const catalog = glossaryRouter.catalog;

  assert.ok(Array.isArray(catalog));
  assert.ok(catalog.length >= 1000, `expected at least 1000 terms, got ${catalog?.length || 0}`);
  assert.equal(new Set(catalog.map((item) => item.term.toLowerCase())).size, catalog.length);

  for (const item of catalog.slice(0, 30)) {
    assert.ok(item.definition.length >= 60, `${item.term} definition is too short`);
    assert.ok(item.whyItMatters);
    assert.ok(item.howItWorks);
    assert.ok(item.limitations);
  }
});
