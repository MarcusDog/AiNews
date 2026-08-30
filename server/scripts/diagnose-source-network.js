#!/usr/bin/env node

const dns = require('node:dns').promises;
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { buildSignalSourceCatalog } = require('../config/signalSources');
const { NEWS_SOURCES } = require('../config/newsSources');
const {
  classifySourceError,
  createSourceTransport,
  redactNetworkText
} = require('../services/network/source-transport');

function isNonPublicAddress(address) {
  if (!net.isIP(address)) return true;
  if (net.isIPv6(address)) {
    const value = address.toLowerCase();
    return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb');
  }
  const octets = address.split('.').map(Number);
  return octets[0] === 0
    || octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
    || octets[0] >= 224;
}

function configuredTargets(env = process.env) {
  const targets = buildSignalSourceCatalog(env)
    .filter((source) => source.configured && source.schedulable && source.endpoint)
    .map((source) => ({ id: source.id, kind: 'signal', url: source.endpoint }));
  for (const source of NEWS_SOURCES || []) {
    if (source?.url) targets.push({ id: `news:${source.id || source.name}`, kind: 'news', url: source.url });
  }
  const seen = new Set();
  return targets.filter((target) => {
    try {
      const parsed = new URL(target.url);
      const key = `${target.kind}:${parsed.hostname}`;
      if (parsed.protocol !== 'https:' || seen.has(key)) return false;
      seen.add(key);
      target.origin = parsed.origin;
      target.hostname = parsed.hostname;
      delete target.url;
      return true;
    } catch {
      return false;
    }
  });
}

async function mapLimit(values, concurrency, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(values[index]);
    }
  }));
  return output;
}

async function diagnose(options = {}) {
  const env = options.env || process.env;
  const limit = Math.max(1, Math.min(Number(env.AYA_DIAGNOSTIC_SOURCE_LIMIT) || 200, 500));
  const targets = configuredTargets(env).slice(0, limit);
  const transport = createSourceTransport({ env, retries: 0 });
  const results = await mapLimit(targets, 6, async (target) => {
    const startedAt = Date.now();
    let addresses = [];
    let dnsError = null;
    try {
      addresses = (await dns.lookup(target.hostname, { all: true, verbatim: true })).map((entry) => entry.address);
    } catch (error) {
      dnsError = classifySourceError(error).code;
    }
    try {
      const response = await transport.get(target.origin, {
        timeout: Number(env.AYA_DIAGNOSTIC_TIMEOUT_MS) || 6000,
        maxContentLength: 1024 * 1024,
        validateStatus: () => true,
        headers: { 'User-Agent': 'AyaNews-Source-Diagnostic/1.0' }
      });
      return {
        ...target,
        addresses,
        nonPublicAddresses: addresses.filter(isNonPublicAddress),
        dnsStatus: dnsError || 'resolved',
        httpStatus: response.status,
        requestStatus: response.status < 500 ? 'reachable' : 'upstream_error',
        durationMs: Date.now() - startedAt
      };
    } catch (error) {
      return {
        ...target,
        addresses,
        nonPublicAddresses: addresses.filter(isNonPublicAddress),
        dnsStatus: dnsError || 'resolved',
        httpStatus: error.status || null,
        requestStatus: error.code || 'network_failure',
        safeDetail: redactNetworkText(error.safeDetail || error.message).slice(0, 240),
        durationMs: Date.now() - startedAt
      };
    }
  });

  const hostsByAddress = new Map();
  for (const result of results) {
    for (const address of result.addresses) {
      const hosts = hostsByAddress.get(address) || new Set();
      hosts.add(result.hostname);
      hostsByAddress.set(address, hosts);
    }
  }
  const suspiciousSharedAddresses = [...hostsByAddress.entries()]
    .filter(([, hosts]) => hosts.size >= 3)
    .map(([address, hosts]) => ({ address, hosts: [...hosts].sort() }));
  const report = {
    generatedAt: new Date().toISOString(),
    transport: transport.describe(),
    total: results.length,
    reachable: results.filter((item) => item.requestStatus === 'reachable').length,
    failed: results.filter((item) => item.requestStatus !== 'reachable').length,
    suspiciousSharedAddresses,
    sources: results
  };
  return report;
}

if (require.main === module) {
  diagnose().then((report) => {
    const json = `${JSON.stringify(report, null, 2)}\n`;
    const output = process.env.AYA_DIAGNOSTIC_REPORT;
    if (output) {
      const resolved = path.resolve(output);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, json);
    }
    process.stdout.write(json);
    if (report.reachable === 0) process.exitCode = 1;
  }).catch((error) => {
    process.stderr.write(`${redactNetworkText(error.stack || error.message)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { configuredTargets, diagnose, isNonPublicAddress };
