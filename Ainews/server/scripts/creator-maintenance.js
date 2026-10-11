#!/usr/bin/env node
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const CreatorStore = require('../services/creators/creator-store');
const CreatorMaintenance = require('../services/creators/creator-maintenance');

async function main() {
  const [command, argument] = process.argv.slice(2);
  const store = new CreatorStore().initialize();
  const maintenance = new CreatorMaintenance({ store });
  try {
    let result;
    if (command === 'preview') result = maintenance.previewCleanup('operator-cli');
    else if (command === 'execute') result = maintenance.executeCleanup('operator-cli', argument);
    else if (command === 'backup') result = await maintenance.backup('operator-cli', { fileName: argument });
    else if (command === 'export') result = maintenance.exportJsonl('operator-cli', { fileName: argument });
    else throw new Error('usage: creator-maintenance <preview|execute TOKEN|backup [FILE.db]|export [FILE.jsonl]>');
    const publicResult = result?.path ? { ...result, file: path.basename(result.path), path: undefined } : result;
    process.stdout.write(`${JSON.stringify(publicResult, null, 2)}\n`);
  } finally {
    store.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
