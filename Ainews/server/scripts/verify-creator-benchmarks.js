#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { CREATOR_VERTICALS } = require('../config/creatorVerticals');
const { validateCreatorCatalog } = require('../services/creators/creator-catalog');
const { createConnectorFetch } = require('../services/creators/connectors/connector-utils');

async function mapLimit(items, concurrency, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index]);
    }
  }));
  return output;
}

async function main() {
  const catalogPath = path.resolve(process.argv[2] || path.join(__dirname, '../config/creatorBenchmarks.json'));
  const catalog = validateCreatorCatalog(JSON.parse(fs.readFileSync(catalogPath, 'utf8')), {
    verticals: CREATOR_VERTICALS
  });
  const accounts = catalog.creators.flatMap((creator) => creator.accounts.map((account) => ({
    ...account,
    creatorId: creator.id,
    verticalIds: creator.verticalIds
  })));
  const maximum = Math.max(0, Math.min(Number(process.env.AYA_CREATOR_VERIFY_LIMIT) || accounts.length, accounts.length));
  const fetchImpl = createConnectorFetch();
  const probes = await mapLimit(accounts.slice(0, maximum), 6, async (account) => {
    const started = Date.now();
    try {
      const response = await fetchImpl(account.feedUrl || account.profileUrl, {
        redirect: 'follow',
        headers: { 'user-agent': 'AyaNews-Creator-Benchmark-Validator/1.0' },
        signal: AbortSignal.timeout(15000)
      });
      const body = (await response.text()).slice(0, 512 * 1024);
      const identityMatched = account.platform !== 'youtube'
        || (body.includes(account.externalAccountId) && /<feed[\s>]/i.test(body));
      return {
        accountId: account.id,
        status: response.status,
        reachable: response.ok,
        identityMatched,
        latencyMs: Date.now() - started
      };
    } catch (error) {
      return {
        accountId: account.id,
        status: null,
        reachable: false,
        identityMatched: false,
        reason: String(error.message || error).slice(0, 160),
        latencyMs: Date.now() - started
      };
    }
  });
  const byVertical = Object.fromEntries(CREATOR_VERTICALS.map((vertical) => [
    vertical.id,
    catalog.creators.filter((creator) => creator.verticalIds.includes(vertical.id)).length
  ]));
  const report = {
    generatedAt: new Date().toISOString(),
    catalog: catalogPath,
    creators: catalog.creators.length,
    accounts: accounts.length,
    byVertical,
    liveProbe: {
      checked: probes.length,
      reachable: probes.filter((item) => item.reachable).length,
      identityMatched: probes.filter((item) => item.identityMatched).length,
      failures: probes.filter((item) => !item.reachable || !item.identityMatched)
    }
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (catalog.creators.length < 100 || Object.values(byVertical).some((count) => count < 20)) process.exitCode = 1;
  if (probes.length && probes.filter((item) => item.identityMatched).length / probes.length < 0.9) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
