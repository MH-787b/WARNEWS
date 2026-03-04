/* ============================================================
   fetch-news.js — Serverless news fetcher for GitHub Actions

   Calls NewsData.io API with the secret key (from env var),
   processes articles, merges known conflict/trade pairs,
   and writes data/events.json for the frontend to consume.
   ============================================================ */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.NEWSDATA_API_KEY;
if (!API_KEY) {
  console.error('NEWSDATA_API_KEY env var not set');
  process.exit(1);
}

// ---- Country name → ISO alpha-3 ----
const COUNTRY_TO_ISO = {
  'afghanistan':'AFG','albania':'ALB','algeria':'DZA','angola':'AGO',
  'argentina':'ARG','armenia':'ARM','australia':'AUS','austria':'AUT',
  'azerbaijan':'AZE','bangladesh':'BGD','belarus':'BLR','belgium':'BEL',
  'bolivia':'BOL','bosnia':'BIH','brazil':'BRA','bulgaria':'BGR',
  'cambodia':'KHM','cameroon':'CMR','canada':'CAN','chad':'TCD',
  'chile':'CHL','china':'CHN','colombia':'COL','congo':'COD',
  'costa rica':'CRI','croatia':'HRV','cuba':'CUB','cyprus':'CYP',
  'czech':'CZE','denmark':'DNK','ecuador':'ECU','egypt':'EGY',
  'eritrea':'ERI','estonia':'EST','ethiopia':'ETH','finland':'FIN',
  'france':'FRA','gabon':'GAB','georgia':'GEO','germany':'DEU',
  'ghana':'GHA','greece':'GRC','guatemala':'GTM','haiti':'HTI',
  'honduras':'HND','hungary':'HUN','iceland':'ISL','india':'IND',
  'indonesia':'IDN','iran':'IRN','iraq':'IRQ','ireland':'IRL',
  'israel':'ISR','italy':'ITA','japan':'JPN','jordan':'JOR',
  'kazakhstan':'KAZ','kenya':'KEN','north korea':'PRK','south korea':'KOR',
  'korea':'KOR','kuwait':'KWT','kyrgyzstan':'KGZ','laos':'LAO',
  'latvia':'LVA','lebanon':'LBN','libya':'LBY','lithuania':'LTU',
  'malaysia':'MYS','mali':'MLI','mexico':'MEX','moldova':'MDA',
  'mongolia':'MNG','montenegro':'MNE','morocco':'MAR','mozambique':'MOZ',
  'myanmar':'MMR','burma':'MMR','namibia':'NAM','nepal':'NPL',
  'netherlands':'NLD','new zealand':'NZL','nicaragua':'NIC','niger':'NER',
  'nigeria':'NGA','norway':'NOR','oman':'OMN','pakistan':'PAK',
  'palestine':'PSE','panama':'PAN','paraguay':'PRY','peru':'PER',
  'philippines':'PHL','poland':'POL','portugal':'PRT','qatar':'QAT',
  'romania':'ROU','russia':'RUS','rwanda':'RWA','saudi arabia':'SAU',
  'saudi':'SAU','senegal':'SEN','serbia':'SRB','sierra leone':'SLE',
  'singapore':'SGP','slovakia':'SVK','slovenia':'SVN','somalia':'SOM',
  'south africa':'ZAF','south sudan':'SSD','spain':'ESP','sri lanka':'LKA',
  'sudan':'SDN','sweden':'SWE','switzerland':'CHE','syria':'SYR',
  'taiwan':'TWN','tajikistan':'TJK','tanzania':'TZA','thailand':'THA',
  'tunisia':'TUN','turkey':'TUR','turkmenistan':'TKM','uganda':'UGA',
  'ukraine':'UKR','united arab emirates':'ARE','uae':'ARE',
  'united kingdom':'GBR','uk':'GBR','britain':'GBR',
  'united states':'USA','us':'USA','usa':'USA','america':'USA',
  'uruguay':'URY','uzbekistan':'UZB','venezuela':'VEN','vietnam':'VNM',
  'yemen':'YEM','zambia':'ZMB','zimbabwe':'ZWE'
};

const TYPE_KEYWORDS = {
  invasion:              ['invasion', 'invade', 'invaded', 'incursion', 'annex'],
  military_mobilisation: ['military', 'troops', 'deploy', 'mobilise', 'mobilize', 'naval', 'army', 'missile', 'airstrike', 'bombing', 'offensive', 'drone'],
  leadership_change:     ['president', 'prime minister', 'election', 'coup', 'resign', 'inaugurate', 'leadership', 'appointed'],
  trade:                 ['trade', 'tariff', 'sanctions', 'export', 'import', 'economic', 'deal', 'agreement'],
  diplomacy:             ['diplomat', 'summit', 'treaty', 'UN', 'NATO', 'ceasefire', 'peace', 'negotiate', 'talks']
};

const SEVERITY_KEYWORDS = {
  critical: ['war', 'invasion', 'attack', 'killed', 'bomb', 'airstrike', 'massacre', 'genocide'],
  high:     ['military', 'troops', 'missile', 'nuclear', 'crisis', 'escalat', 'offensive'],
  medium:   ['sanctions', 'deploy', 'tension', 'protest', 'election', 'coup'],
  low:      ['trade', 'talks', 'agreement', 'summit', 'diplomat']
};

const KNOWN_PAIRS = [
  // --- Active wars / armed conflicts ---
  { type: 'invasion',              country: 'RUS', target: 'UKR', severity: 'critical', headline: 'Ongoing Russia\u2013Ukraine armed conflict' },
  { type: 'military_mobilisation', country: 'ISR', target: 'PSE', severity: 'critical', headline: 'Israel\u2013Palestine military operations in Gaza' },
  { type: 'military_mobilisation', country: 'ISR', target: 'LBN', severity: 'high',     headline: 'Israel\u2013Hezbollah cross-border conflict in Lebanon' },
  { type: 'military_mobilisation', country: 'ISR', target: 'SYR', severity: 'high',     headline: 'Israeli military strikes on targets in Syria' },
  { type: 'military_mobilisation', country: 'ISR', target: 'YEM', severity: 'high',     headline: 'Israel\u2013Houthi exchange of strikes via Yemen' },
  { type: 'military_mobilisation', country: 'IRN', target: 'ISR', severity: 'high',     headline: 'Iran\u2013Israel strategic military confrontation' },
  { type: 'military_mobilisation', country: 'USA', target: 'IRN', severity: 'high',     headline: 'US military operations and sanctions against Iran' },
  { type: 'military_mobilisation', country: 'USA', target: 'YEM', severity: 'high',     headline: 'US airstrikes on Houthi positions in Yemen' },
  { type: 'invasion',              country: 'SDN', target: 'SSD', severity: 'critical', headline: 'Sudan civil war \u2014 RSF vs SAF armed conflict' },
  { type: 'invasion',              country: 'MMR', target: 'MMR', severity: 'critical', headline: 'Myanmar civil war \u2014 junta vs resistance forces' },
  { type: 'military_mobilisation', country: 'ETH', target: 'ERI', severity: 'high',     headline: 'Ethiopia\u2013Eritrea border tensions persist' },
  { type: 'military_mobilisation', country: 'SOM', target: 'ETH', severity: 'high',     headline: 'Somalia\u2013Ethiopia tensions over Somaliland port deal' },
  { type: 'military_mobilisation', country: 'COD', target: 'RWA', severity: 'high',     headline: 'DR Congo\u2013Rwanda conflict over M23 militia in eastern DRC' },
  { type: 'military_mobilisation', country: 'PAK', target: 'AFG', severity: 'medium',   headline: 'Pakistan\u2013Afghanistan cross-border military operations' },

  // --- Military standoffs / high tension ---
  { type: 'military_mobilisation', country: 'CHN', target: 'TWN', severity: 'high',     headline: 'China\u2013Taiwan strait military posturing' },
  { type: 'military_mobilisation', country: 'CHN', target: 'PHL', severity: 'medium',   headline: 'China\u2013Philippines South China Sea territorial disputes' },
  { type: 'military_mobilisation', country: 'PRK', target: 'KOR', severity: 'medium',   headline: 'North Korea\u2013South Korea military standoff' },
  { type: 'military_mobilisation', country: 'IND', target: 'PAK', severity: 'medium',   headline: 'India\u2013Pakistan border tensions in Kashmir' },
  { type: 'military_mobilisation', country: 'RUS', target: 'GEO', severity: 'medium',   headline: 'Russia\u2013Georgia tensions over occupied territories' },

  // --- Trade / economic ---
  { type: 'trade',                 country: 'CHN', target: 'USA', severity: 'medium',   headline: 'US\u2013China trade war and tariff escalation' },
  { type: 'trade',                 country: 'USA', target: 'RUS', severity: 'medium',   headline: 'US-led economic sanctions on Russia' },
  { type: 'trade',                 country: 'DEU', target: 'NOR', severity: 'low',      headline: 'Germany\u2013Norway energy corridor partnership' },
  { type: 'trade',                 country: 'JPN', target: 'USA', severity: 'low',      headline: 'Japan\u2013US semiconductor supply chain agreement' },
  { type: 'trade',                 country: 'IND', target: 'RUS', severity: 'medium',   headline: 'India\u2013Russia oil and energy trade partnership' },
  { type: 'trade',                 country: 'AUS', target: 'CHN', severity: 'medium',   headline: 'Australia\u2013China trade disputes over critical minerals' },
  { type: 'trade',                 country: 'GBR', target: 'FRA', severity: 'low',      headline: 'UK\u2013EU post-Brexit trade friction' },
  { type: 'trade',                 country: 'KOR', target: 'JPN', severity: 'low',      headline: 'South Korea\u2013Japan semiconductor export controls' },
  { type: 'trade',                 country: 'BRA', target: 'CHN', severity: 'low',      headline: 'Brazil\u2013China commodity export corridor' },
  { type: 'trade',                 country: 'SAU', target: 'IND', severity: 'low',      headline: 'Saudi Arabia\u2013India oil supply agreement' },
  { type: 'trade',                 country: 'TUR', target: 'RUS', severity: 'medium',   headline: 'Turkey\u2013Russia energy and trade corridor' },
];

// ---- NLP helpers ----

function extractCountry(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const sorted = Object.entries(COUNTRY_TO_ISO).sort((a, b) => b[0].length - a[0].length);
  for (const [name, iso] of sorted) {
    if (lower.includes(name)) return iso;
  }
  return null;
}

function extractTarget(text, primaryIso) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const sorted = Object.entries(COUNTRY_TO_ISO).sort((a, b) => b[0].length - a[0].length);
  for (const [name, iso] of sorted) {
    if (iso !== primaryIso && lower.includes(name)) return iso;
  }
  return null;
}

function classifyType(text) {
  if (!text) return 'diplomacy';
  const lower = text.toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return type;
  }
  return 'diplomacy';
}

function classifySeverity(text) {
  if (!text) return 'medium';
  const lower = text.toLowerCase();
  for (const [level, keywords] of Object.entries(SEVERITY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return level;
  }
  return 'medium';
}

// ---- Fetch ----

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON')); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const url =
    'https://newsdata.io/api/1/latest' +
    '?apikey=' + API_KEY +
    '&q=war OR military OR conflict OR invasion OR troops OR sanctions' +
    '&language=en' +
    '&category=politics,world';

  console.log('[fetch-news] Fetching from NewsData.io...');
  const data = await fetchJSON(url);

  if (data.status !== 'success' || !data.results) {
    throw new Error(data.results?.message || 'Bad API response');
  }

  // Deduplicate
  const seen = new Set();
  const unique = data.results.filter(a => {
    if (!a.title || a.duplicate || seen.has(a.title)) return false;
    seen.add(a.title);
    return true;
  });

  // Process articles
  const events = unique.map((article, i) => {
    const title = article.title || '';
    const desc = article.description || '';
    const text = title + ' ' + desc;

    let country = null;
    if (article.country && article.country.length) {
      country = COUNTRY_TO_ISO[article.country[0].toLowerCase()] || null;
    }
    if (!country) country = extractCountry(text);
    if (!country) return null;

    let target = extractTarget(text, country);
    if (!target && desc) target = extractTarget(desc, country);
    if (!target && article.country && article.country.length > 1) {
      const second = COUNTRY_TO_ISO[article.country[1].toLowerCase()] || null;
      if (second && second !== country) target = second;
    }

    return {
      id: article.article_id || `live-${i}`,
      type: classifyType(text),
      headline: title || 'Untitled',
      country,
      target,
      timestamp: article.pubDate || new Date().toISOString(),
      severity: classifySeverity(text)
    };
  }).filter(Boolean);

  // Merge known pairs
  const existingPairs = new Set(
    events.filter(e => e.target).map(e => `${e.country}-${e.target}`)
  );
  const extras = KNOWN_PAIRS
    .filter(kp => !existingPairs.has(`${kp.country}-${kp.target}`))
    .map((kp, i) => ({ ...kp, id: `known-${i}`, timestamp: new Date().toISOString() }));

  const allEvents = [...events, ...extras];

  // Write output
  const outDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'events.json');
  fs.writeFileSync(outPath, JSON.stringify({
    updated: new Date().toISOString(),
    count: allEvents.length,
    events: allEvents
  }, null, 2));

  console.log(`[fetch-news] Wrote ${allEvents.length} events to data/events.json`);
}

main().catch(err => {
  console.error('[fetch-news] Error:', err.message);
  process.exit(1);
});
