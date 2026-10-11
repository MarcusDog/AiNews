#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { assertDatasetGates, datasetReport } = require('./build-local-dataset');

const databasePath = path.resolve(process.argv[2] || process.env.AINEWS_DB_PATH || path.join(__dirname, '../data/local-production-ready.db'));
const database = new Database(databasePath, { readonly: true, fileMustExist: true });
try {
  const report = datasetReport(database, { databasePath });
  assertDatasetGates(report);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (process.env.AYA_DATASET_REPORT) {
    const reportPath = path.resolve(process.env.AYA_DATASET_REPORT);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, serialized);
  }
  process.stdout.write(serialized);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  database.close();
}
