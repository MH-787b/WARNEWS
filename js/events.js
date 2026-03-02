/* ============================================================
   events.js — Event data layer

   LIVE DATA SOURCE: NewsData.io (free tier, no credit card)
   - 200 requests/day, 2000 articles/day
   - Sign up: https://newsdata.io/register
   - Paste your API key into NEWSDATA_API_KEY below

   Fallback: hardcoded mock data if API fails or key missing.

   Event shape:
   {
     id:        string,
     type:      'invasion' | 'leadership_change' | 'military_mobilisation' | 'diplomacy' | 'trade',
     headline:  string,
     country:   string,           // ISO 3166-1 alpha-3 (e.g. "UKR")
     target:    string | null,    // ISO alpha-3 — for invasion and trade types
     timestamp: string,           // ISO 8601
     severity:  'critical' | 'high' | 'medium' | 'low'
   }
   ============================================================ */

const EventStore = (() => {

  // ============================================================
  // PASTE YOUR FREE API KEY HERE (from https://newsdata.io)
  // ============================================================
  const NEWSDATA_API_KEY = '';
  // ============================================================

  // ---- Country name → ISO alpha-3 mapping for extraction ----
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

  // Keywords that indicate event types
  const TYPE_KEYWORDS = {
    invasion:                ['invasion', 'invade', 'invaded', 'incursion', 'annex'],
    military_mobilisation:   ['military', 'troops', 'deploy', 'mobilise', 'mobilize', 'naval', 'army', 'missile', 'airstrike', 'bombing', 'offensive', 'drone'],
    leadership_change:       ['president', 'prime minister', 'election', 'coup', 'resign', 'inaugurate', 'leadership', 'appointed'],
    trade:                   ['trade', 'tariff', 'sanctions', 'export', 'import', 'economic', 'deal', 'agreement'],
    diplomacy:               ['diplomat', 'summit', 'treaty', 'UN', 'NATO', 'ceasefire', 'peace', 'negotiate', 'talks']
  };

  // Severity keywords
  const SEVERITY_KEYWORDS = {
    critical: ['war', 'invasion', 'attack', 'killed', 'bomb', 'airstrike', 'massacre', 'genocide'],
    high:     ['military', 'troops', 'missile', 'nuclear', 'crisis', 'escalat', 'offensive'],
    medium:   ['sanctions', 'deploy', 'tension', 'protest', 'election', 'coup'],
    low:      ['trade', 'talks', 'agreement', 'summit', 'diplomat']
  };

  // ---- Mock data (fallback when API unavailable) ----

  const MOCK_EVENTS = [
    {
      id: 'evt-001',
      type: 'invasion',
      headline: 'Country A initiated full-scale military invasion of Country B',
      country: 'RUS',
      target: 'UKR',
      timestamp: '2026-03-01T06:00:00Z',
      severity: 'critical'
    },
    {
      id: 'evt-002',
      type: 'leadership_change',
      headline: 'Emergency transfer of executive power following contested election results',
      country: 'VEN',
      target: null,
      timestamp: '2026-02-28T14:30:00Z',
      severity: 'high'
    },
    {
      id: 'evt-003',
      type: 'military_mobilisation',
      headline: 'Large-scale troop deployment along northern border region',
      country: 'CHN',
      target: null,
      timestamp: '2026-02-27T09:15:00Z',
      severity: 'high'
    },
    {
      id: 'evt-004',
      type: 'invasion',
      headline: 'Cross-border incursion reported in disputed territory',
      country: 'ETH',
      target: 'ERI',
      timestamp: '2026-02-26T18:45:00Z',
      severity: 'critical'
    },
    {
      id: 'evt-005',
      type: 'military_mobilisation',
      headline: 'Naval fleet repositioned to strategic maritime corridor',
      country: 'IRN',
      target: null,
      timestamp: '2026-02-25T11:00:00Z',
      severity: 'medium'
    },
    {
      id: 'evt-006',
      type: 'diplomacy',
      headline: 'Emergency UN Security Council session convened over regional escalation',
      country: 'USA',
      target: null,
      timestamp: '2026-03-01T20:00:00Z',
      severity: 'medium'
    },
    {
      id: 'evt-007',
      type: 'trade',
      headline: 'Bilateral trade agreement signed expanding commodity exports',
      country: 'BRA',
      target: 'CHN',
      timestamp: '2026-02-24T08:00:00Z',
      severity: 'low'
    },
    {
      id: 'evt-008',
      type: 'trade',
      headline: 'New energy corridor deal formalised between European partners',
      country: 'DEU',
      target: 'NOR',
      timestamp: '2026-02-23T12:00:00Z',
      severity: 'low'
    },
    {
      id: 'evt-009',
      type: 'trade',
      headline: 'Major semiconductor supply chain agreement ratified',
      country: 'JPN',
      target: 'USA',
      timestamp: '2026-02-22T16:30:00Z',
      severity: 'medium'
    }
  ];

  let _events = [];
  let _listeners = [];

  // ---- NLP helpers ----

  /** Extract the most likely ISO alpha-3 country code from text */
  function extractCountry(text) {
    if (!text) return null;
    const lower = text.toLowerCase();

    // Check longest names first to avoid partial matches (e.g. "south korea" before "korea")
    const sorted = Object.entries(COUNTRY_TO_ISO)
      .sort((a, b) => b[0].length - a[0].length);

    for (const [name, iso] of sorted) {
      if (lower.includes(name)) return iso;
    }
    return null;
  }

  /** Extract a second country (target) from text, excluding the primary */
  function extractTarget(text, primaryIso) {
    if (!text) return null;
    const lower = text.toLowerCase();

    const sorted = Object.entries(COUNTRY_TO_ISO)
      .sort((a, b) => b[0].length - a[0].length);

    for (const [name, iso] of sorted) {
      if (iso !== primaryIso && lower.includes(name)) return iso;
    }
    return null;
  }

  /** Classify event type from headline text */
  function classifyType(text) {
    if (!text) return 'diplomacy';
    const lower = text.toLowerCase();

    // Check in priority order
    for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
      if (keywords.some(kw => lower.includes(kw))) return type;
    }
    return 'diplomacy';
  }

  /** Classify severity from headline text */
  function classifySeverity(text) {
    if (!text) return 'medium';
    const lower = text.toLowerCase();

    for (const [level, keywords] of Object.entries(SEVERITY_KEYWORDS)) {
      if (keywords.some(kw => lower.includes(kw))) return level;
    }
    return 'medium';
  }

  // ---- API ----

  /** Fetch live events from NewsData.io */
  async function fetchLiveEvents() {
    const url =
      'https://newsdata.io/api/1/latest' +
      '?apikey=' + NEWSDATA_API_KEY +
      '&q=war OR military OR conflict OR invasion OR troops OR sanctions' +
      '&language=en' +
      '&category=politics,world';

    const res = await fetch(url);
    if (!res.ok) throw new Error(`API ${res.status}`);

    const data = await res.json();
    if (data.status !== 'success' || !data.results) {
      throw new Error(data.results?.message || 'Bad response');
    }

    // Deduplicate by title (API returns many syndicated copies)
    const seen = new Set();
    const unique = data.results.filter(a => {
      if (!a.title || a.duplicate || seen.has(a.title)) return false;
      seen.add(a.title);
      return true;
    });

    return unique
      .map((article, i) => {
        const text = (article.title || '') + ' ' + (article.description || '');

        // Try the API's country field first, then parse from text
        let country = null;
        if (article.country && article.country.length) {
          country = COUNTRY_TO_ISO[article.country[0].toLowerCase()] || null;
        }
        if (!country) country = extractCountry(text);

        // Skip articles where we can't identify a country
        if (!country) return null;

        const type = classifyType(text);
        const target = extractTarget(text, country);

        return {
          id: article.article_id || `live-${i}`,
          type,
          headline: article.title || 'Untitled',
          country,
          target,
          timestamp: article.pubDate || new Date().toISOString(),
          severity: classifySeverity(text)
        };
      })
      .filter(Boolean);
  }

  /**
   * Fetch events — tries live API first, falls back to mock data.
   * Console logs the data source so you can confirm what's active.
   */
  async function fetchEvents() {
    if (!NEWSDATA_API_KEY) {
      console.log('[CONTRACKER] No API key set — using mock data');
      return MOCK_EVENTS;
    }

    try {
      const events = await fetchLiveEvents();
      console.log(`[CONTRACKER] Loaded ${events.length} live events from NewsData.io`);
      return events.length > 0 ? events : MOCK_EVENTS;
    } catch (err) {
      console.warn('[CONTRACKER] API error, falling back to mock data:', err.message);
      return MOCK_EVENTS;
    }
  }

  /** Load (or reload) events and notify listeners */
  async function load() {
    _events = await fetchEvents();
    _listeners.forEach(fn => fn(_events));
    return _events;
  }

  /** Subscribe to event updates */
  function onChange(fn) {
    _listeners.push(fn);
  }

  /** Get all loaded events */
  function getAll() {
    return _events;
  }

  /** Get events for a specific country (as actor OR target) */
  function getByCountry(iso3) {
    return _events.filter(
      e => e.country === iso3 || e.target === iso3
    );
  }

  /** Get invasion-type events (need line rendering) */
  function getInvasions() {
    return _events.filter(e => e.type === 'invasion' && e.target);
  }

  /** Get trade-type events (need line rendering) */
  function getTradeRoutes() {
    return _events.filter(e => e.type === 'trade' && e.target);
  }

  /** Format event type for display */
  function formatType(type) {
    return type.replace(/_/g, ' ');
  }

  /** Format ISO timestamp for display */
  function formatTimestamp(iso) {
    const d = new Date(iso);
    return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  }

  return { load, onChange, getAll, getByCountry, getInvasions, getTradeRoutes, formatType, formatTimestamp };
})();
