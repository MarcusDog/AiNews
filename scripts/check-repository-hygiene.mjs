#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Inspect names and policy files only; never open a tracked secret or runtime file.
export function classifyPath(file) {
  const parts = file.split('/');
  const name = parts.at(-1);
  if (name !== '.env.example' && (/^\.env(?:\.|$)/.test(name) || /\.local\.env$/.test(name))) return 'secret';
  if (/\.(?:db|sqlite|sqlite3)(?:$|[-.])/.test(name)) return 'sqlite';
  if (/\.log(?:$|\.)/.test(name) || parts.slice(0, -1).includes('logs')) return 'log';
  if (parts.slice(0, -1).some((part) => /^(?:backup|backups)$/.test(part)) || /\.(?:bak|backup|dump)$/.test(name)) return 'backup';
  if (parts.slice(0, -1).some((part) => /^(?:report|reports)$/.test(part))) return 'report';
  if (parts.slice(0, -1).includes('exports') || /^aya-creator-.+\.jsonl(?:\.tmp-.+)?$/.test(name)) return 'export';
  if (parts.slice(0, -1).some((part) => /^(?:\.cache|cache|caches)$/.test(part))) return 'cache';
  return null;
}

const policySamples = [
  '.env', '.env.production', 'token.local.env', 'data.db', 'data.db-wal', 'data.db-shm',
  'data.db.previous-1', 'data.sqlite', 'data.sqlite-shm', 'data.sqlite3', 'data.sqlite3-wal',
  'output.log', 'output.log.1', 'logs/output.txt', 'backup/state.json', 'backups/state.json',
  'state.bak', 'state.backup', 'state.dump', 'report/result.json', 'reports/result.json',
  '.cache/value.json', 'cache/value.json', 'caches/value.json', 'exports/custom.jsonl',
  'exports/aya-creator-2026-10-12T00-00-00-000Z.jsonl',
  'exports/aya-creator-2026-10-12T00-00-00-000Z.jsonl.tmp-1234',
  'aya-creator-2026-10-12T00-00-00-000Z.jsonl',
  'aya-creator-2026-10-12T00-00-00-000Z.jsonl.tmp-1234'
].flatMap((file) => [file, `nested/${file}`]);

// rsync slashless patterns match basenames at every depth; Docker patterns are
// relative to the context root. Keep their anchoring and parent matching separate.
function rsyncMatches(pattern, file) {
  const directory = pattern.endsWith('/');
  pattern = pattern.replace(/^\//, '').replace(/\/$/, '');
  const hasSlash = pattern.includes('/');
  let expression = '';
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern.slice(i, i + 3) === '**/') { expression += '(?:.*/)?'; i += 2; }
    else if (pattern[i] === '*') expression += '[^/]*';
    else expression += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${hasSlash ? '^' : '(?:^|/)'}${expression}${directory ? '(?:/|$)' : '$'}`).test(file);
}

function dockerMatches(pattern, file) {
  // https://docs.docker.com/build/concepts/context/#dockerignore-files
  // This policy uses literals, *, ** and ?. Reject unsupported syntax rather than
  // certifying exclusions whose behavior we cannot validate without the daemon.
  if (/[\[\]\\]/.test(pattern)) throw new Error('unsupported Docker glob syntax');
  pattern = path.posix.normalize(pattern.trim()).replace(/^\/+|\/+$/g, '');
  if (!pattern || pattern === '.') return false;
  let expression = '';
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern.slice(i, i + 3) === '**/') { expression += '(?:.*/)?'; i += 2; }
    else if (pattern.slice(i, i + 2) === '**') { expression += '.*'; i += 1; }
    else if (pattern[i] === '*') expression += '[^/]*';
    else if (pattern[i] === '?') expression += '[^/]';
    else expression += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  // An excluded directory also excludes descendants, even without a trailing /.
  return new RegExp(`^${expression}(?:/|$)`).test(file);
}

export function dockerExcludes(rules, file) {
  let excluded = false;
  for (const rule of rules) {
    const include = rule.startsWith('!');
    if (dockerMatches(include ? rule.slice(1) : rule, file)) excluded = !include;
  }
  return excluded;
}

export function checkRepository(root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()) {
  const findings = [];
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const file of tracked) {
    const category = classifyPath(file);
    if (category) findings.push({ category, path: file });
  }
  const ignored = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {
    cwd: root, input: policySamples.join('\n') + '\n', encoding: 'utf8'
  });
  const ignoredPaths = new Set(ignored.stdout?.trim().split('\n'));
  for (const file of policySamples) {
    if (!ignoredPaths.has(file)) findings.push({ category: `git-ignore:${classifyPath(file)}`, path: file });
  }
  const templates = ['.env.example', 'server/.env.example'];
  for (const file of templates) {
    if (spawnSync('git', ['check-ignore', '--no-index', file], { cwd: root }).status !== 1) {
      findings.push({ category: 'git-ignore:template', path: file });
    }
  }
  const dockerRules = fs.readFileSync(path.join(root, 'server/.dockerignore'), 'utf8')
    .split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const releaseScript = fs.readFileSync(path.join(root, 'scripts/build-release.sh'), 'utf8');
  const releaseRules = [...releaseScript.matchAll(/--(exclude|include)='([^']+)'/g)];
  function releaseExcludes(file) {
    // rsync uses the first matching include/exclude rule.
    for (const [, action, pattern] of releaseRules) if (rsyncMatches(pattern, file)) return action === 'exclude';
    return false;
  }
  for (const [policy, excludes] of [['docker-ignore', (file) => dockerExcludes(dockerRules, file)], ['release-exclude', releaseExcludes]]) {
    for (const file of policySamples) {
      if (!excludes(file)) findings.push({ category: `${policy}:${classifyPath(file)}`, path: file });
    }
    for (const file of templates) if (excludes(file)) findings.push({ category: `${policy}:template`, path: file });
  }
  return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const findings = checkRepository();
    for (const finding of findings) process.stdout.write(`${JSON.stringify(finding)}\n`);
    process.exitCode = findings.length ? 1 : 0;
  } catch {
    process.stdout.write(`${JSON.stringify({ category: 'checker:unavailable', path: '.' })}\n`);
    process.exitCode = 1;
  }
}
