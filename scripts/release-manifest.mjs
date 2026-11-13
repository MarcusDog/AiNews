#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [command = 'create', rootArg, releaseIdArg] = process.argv.slice(2);
const root = path.resolve(rootArg || '.');
const ignored = new Set(['release-manifest.json', 'SHA256SUMS']);
const validReleaseId = (id) => typeof id === 'string' && /^[a-zA-Z0-9._-]{8,80}$/.test(id);

function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function listFiles(directory, prefix = '', rejectUnsafe = false) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .flatMap((entry) => {
      const relative = path.posix.join(prefix, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        if (rejectUnsafe) throw new Error(`release contains symbolic link: ${relative}`);
        return [];
      }
      if (entry.isDirectory()) return listFiles(absolute, relative, rejectUnsafe);
      if (!entry.isFile()) {
        if (rejectUnsafe) throw new Error(`release contains unsupported file type: ${relative}`);
        return [];
      }
      return ignored.has(relative) ? [] : [relative];
    });
}

function readManifest() {
  return JSON.parse(fs.readFileSync(path.join(root, 'release-manifest.json'), 'utf8'));
}

function checksumList(files) {
  return `${files.map((file) => `${file.sha256}  ${file.path}`).join('\n')}\n`;
}

if (command === 'create') {
  if (!validReleaseId(releaseIdArg)) {
    throw new Error('release id must be 8-80 safe characters');
  }
  const files = listFiles(root).map((relativePath) => ({
    path: relativePath,
    bytes: fs.statSync(path.join(root, relativePath)).size,
    sha256: digest(path.join(root, relativePath))
  }));
  const manifest = {
    schemaVersion: 1,
    releaseId: releaseIdArg,
    createdAt: new Date().toISOString(),
    fileCount: files.length,
    files
  };
  fs.writeFileSync(path.join(root, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'SHA256SUMS'), checksumList(files));
  process.stdout.write(`${releaseIdArg}\n`);
} else if (command === 'verify') {
  // Reject links (including checksum/manifest symlinks) before reading any files.
  const actualFiles = listFiles(root, '', true);
  const manifest = readManifest();
  if (manifest.schemaVersion !== 1 || !validReleaseId(manifest.releaseId) ||
      !Array.isArray(manifest.files) || manifest.fileCount !== manifest.files.length) {
    throw new Error('invalid release manifest metadata');
  }
  const expectedFiles = manifest.files.map((file) => file.path);
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error('release file list does not match manifest');
  }
  if (fs.readFileSync(path.join(root, 'SHA256SUMS'), 'utf8') !== checksumList(manifest.files)) {
    throw new Error('SHA256SUMS does not match release manifest');
  }
  for (const file of manifest.files) {
    const absolute = path.join(root, file.path);
    if (fs.statSync(absolute).size !== file.bytes || digest(absolute) !== file.sha256) {
      throw new Error(`release file verification failed: ${file.path}`);
    }
  }
  process.stdout.write(`${manifest.releaseId}\n`);
} else {
  throw new Error(`unknown command: ${command}`);
}
