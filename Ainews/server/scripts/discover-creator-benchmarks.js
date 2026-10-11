#!/usr/bin/env node

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const PERSON = 'person';
const MEDIA = 'media';
const candidates = {
  beauty: [
    ['LabMuffinBeautyScience', PERSON], ['Hyram', PERSON], ['JamesWelsh', PERSON],
    ['RobertWelshMUA', PERSON], ['Doctorly', MEDIA], ['DrDrayzday', PERSON],
    ['CassandraBankson', PERSON], ['MixedMakeup', MEDIA], ['SusanYara', PERSON],
    ['Gothamista', PERSON], ['LiahYoo', PERSON], ['CarolineHironsOfficial', PERSON],
    ['WayneGoss', PERSON], ['LisaEldridge', PERSON], ['NikkieTutorials', PERSON],
    ['JackieAina', PERSON], ['Hindash', PERSON], ['HungVanngo', PERSON],
    ['AlexandraAnele', PERSON], ['KellyGooch', PERSON], ['JenPhelpsBeauty', PERSON],
    ['HotandFlashy', PERSON], ['TheBudgetDermatologist', PERSON], ['ShereeneIdriss', PERSON],
    ['AbbeyYung', PERSON], ['MakeupByNikkiLaRose', PERSON], ['emilynoel83', PERSON],
    ['AngelicaNyqvist', PERSON], ['BeautyWithin', MEDIA], ['TheBeautyBreakdown', PERSON],
    ['TinaYong', PERSON], ['christendominique', PERSON], ['PONYMakeup', PERSON],
    ['HaleyKimaking', PERSON], ['dearpeachie', MEDIA]
  ],
  fashion: [
    ['AudreyCoyne', PERSON], ['Justineleconte', PERSON], ['AlyssaBeltempo', PERSON],
    ['DearlyBethany', PERSON], ['mademoisellejaime', PERSON], ['UseLess_dk', PERSON],
    ['TheAnnaEdit', PERSON], ['EmmaHill', PERSON], ['LydiaTomlinson', PERSON],
    ['BrittanyBathgate', PERSON], ['KarenBritChick', PERSON], ['HauteLeMode', PERSON],
    ['TimDessaint', PERSON], ['HarryHas', PERSON], ['imdanielsimmons', PERSON],
    ['FrugalAesthetic', PERSON], ['BlissFoster', PERSON], ['Threaducation', MEDIA],
    ['KarolinaZebrowskax', PERSON], ['MinaLe', PERSON], ['ModernGurlz', MEDIA],
    ['TheCasualco', MEDIA], ['TrinnyLondon', MEDIA], ['TheStyleInsider', PERSON],
    ['BusbeeStyle', PERSON], ['SheaWhitney', PERSON], ['FashionElitist', PERSON],
    ['ColourfulNoir', PERSON], ['ASmallWardrobe', PERSON], ['GentlemansGazette', MEDIA],
    ['KirbyAllison', PERSON], ['PermanentStyleLondon', MEDIA], ['Vogue', MEDIA],
    ['GQ', MEDIA], ['TheBusinessofFashion', MEDIA]
  ],
  'ai-tech': [
    ['Fireship', MEDIA], ['TwoMinutePapers', PERSON], ['AIExplainedOfficial', PERSON],
    ['MattVidProAI', PERSON], ['WesRoth', PERSON], ['MatthewBerman', PERSON],
    ['AllAboutAI', PERSON], ['TheAIGRID', MEDIA], ['WorldofAI', PERSON],
    ['YannicKilcher', PERSON], ['sentdex', PERSON], ['lexfridman', PERSON],
    ['Computerphile', MEDIA], ['stanfordonline', MEDIA], ['DeepLearningAI', MEDIA],
    ['freecodecamp', MEDIA], ['OpenAI', MEDIA], ['GoogleDeepMind', MEDIA],
    ['anthropic-ai', MEDIA], ['HuggingFace', MEDIA], ['IBMTechnology', MEDIA],
    ['MicrosoftDeveloper', MEDIA], ['NVIDIADeveloper', MEDIA], ['AssemblyAI', MEDIA],
    ['t3dotgg', PERSON], ['NetworkChuck', PERSON], ['ColdFusion', MEDIA],
    ['mkbhd', PERSON], ['LinusTechTips', MEDIA], ['ThePrimeTimeagen', PERSON],
    ['AIJasonZ', PERSON], ['bycloudAI', PERSON], ['DaveEbbelaar', PERSON],
    ['SebastianRaschka', PERSON], ['AndrejKarpathy', PERSON]
  ],
  entertainment: [
    ['Variety', MEDIA], ['hollywoodreporter', MEDIA], ['DeadlineHollywood', MEDIA],
    ['EntertainmentTonight', MEDIA], ['AccessHollywood', MEDIA], ['Enews', MEDIA],
    ['People', MEDIA], ['VanityFair', MEDIA], ['FirstWeFeast', MEDIA],
    ['JimmyKimmelLive', MEDIA], ['fallontonight', MEDIA], ['ColbertLateShow', MEDIA],
    ['TeamCoco', MEDIA], ['SNL', MEDIA], ['Netflix', MEDIA], ['PrimeVideo', MEDIA],
    ['StreamOnMax', MEDIA], ['DisneyPlus', MEDIA], ['marvel', MEDIA],
    ['RottenTomatoesTRAILERS', MEDIA], ['MOVIECLIPS', MEDIA], ['ScreenRant', MEDIA],
    ['WatchMojo', MEDIA], ['IGN', MEDIA], ['OfficialGrahamNorton', MEDIA],
    ['LADbible', MEDIA], ['Complex', MEDIA], ['TheDailyShow', MEDIA], ['TMZ', MEDIA],
    ['BeyondTheTrailer', PERSON], ['NewRockstars', MEDIA], ['TheFilmTheorists', MEDIA],
    ['CinemaSins', MEDIA], ['ChrisStuckmann', PERSON], ['JeremyJahns', PERSON]
  ]
};

function slug(value) {
  return String(value).toLowerCase().replace(/^@/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function mapLimit(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

async function resolveYouTube(candidate) {
  const { stdout } = await execFileAsync('yt-dlp', [
    '--flat-playlist', '--playlist-items', '1', '--dump-single-json', '--no-warnings',
    `https://www.youtube.com/@${candidate.handle}/videos`
  ], { maxBuffer: 5 * 1024 * 1024, timeout: 30000 });
  const payload = JSON.parse(stdout);
  const channelId = payload.channel_id;
  if (!/^UC[A-Za-z0-9_-]{20,30}$/.test(channelId || '')) throw new Error('stable channel id missing');
  return {
    channelId,
    displayName: String(payload.channel || payload.uploader || candidate.handle).trim(),
    canonicalHandle: String(payload.uploader_id || `@${candidate.handle}`).replace(/^@/, '')
  };
}

async function main() {
  const outputIndex = process.argv.indexOf('--output');
  const output = path.resolve(outputIndex >= 0 ? process.argv[outputIndex + 1] : path.join(__dirname, '../config/creatorBenchmarks.json'));
  const concurrency = Math.max(1, Math.min(Number(process.env.AYA_CREATOR_DISCOVERY_CONCURRENCY) || 4, 8));
  const requested = Object.entries(candidates).flatMap(([verticalId, entries]) => entries.map(([handle, kind]) => ({ verticalId, handle, kind })));
  const resolved = await mapLimit(requested, concurrency, async (candidate) => {
    try {
      return { ...candidate, ...(await resolveYouTube(candidate)), status: 'verified' };
    } catch (error) {
      return { ...candidate, status: 'failed', reason: String(error.message || error).slice(0, 180) };
    }
  });
  const now = new Date().toISOString();
  const verified = resolved.filter((item) => item.status === 'verified');
  const seenChannels = new Set();
  const creators = verified.filter((item) => {
    if (seenChannels.has(item.channelId)) return false;
    seenChannels.add(item.channelId);
    return true;
  }).map((item) => ({
    id: `${item.verticalId}-${slug(item.canonicalHandle)}`,
    displayName: item.displayName,
    kind: item.kind,
    reviewStatus: 'verified',
    reviewedAt: now,
    verticalIds: [item.verticalId],
    accounts: [{
      id: `youtube:${item.channelId}`,
      platform: 'youtube',
      externalAccountId: item.channelId,
      handle: `@${item.canonicalHandle}`,
      profileUrl: `https://www.youtube.com/channel/${item.channelId}`,
      feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${item.channelId}`,
      verificationEvidence: `https://www.youtube.com/@${item.canonicalHandle}`,
      region: 'global',
      sourceTier: 'L1',
      enabled: true,
      visibility: 'public',
      lastVerifiedAt: now,
      authState: 'not_required',
      backfillState: 'pending'
    }]
  }));
  const byVertical = Object.fromEntries(Object.keys(candidates).map((vertical) => [vertical, creators.filter((creator) => creator.verticalIds.includes(vertical)).length]));
  const report = {
    requested: requested.length,
    verified: creators.length,
    failed: resolved.length - verified.length,
    duplicatesRemoved: verified.length - creators.length,
    byVertical,
    failures: resolved.filter((item) => item.status === 'failed').map(({ verticalId, handle, reason }) => ({ verticalId, handle, reason }))
  };
  if (creators.length < 100 || Object.values(byVertical).some((count) => count < 20)) {
    process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify({ version: 'creator-seeds-v1', generatedAt: now, creators }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output, ...report }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
