/* ============================================================
   events.js — Event data layer

   Live data is fetched server-side by GitHub Actions every 10 min
   and written to data/events.json. The frontend reads that file.
   Falls back to mock data if the JSON isn't available yet.

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

  // Data is now fetched server-side by GitHub Actions.
  // The frontend reads from data/events.json (no API key needed).

  // ---- Known active conflict/trade pairs ----
  // These ensure arc lines always appear on the map, even when
  // live headlines don't mention two countries in the same article.
  // Update these periodically to reflect current geopolitics.

  const KNOWN_PAIRS = [
    // --- Active wars / armed conflicts ---
    { type: 'invasion',              country: 'RUS', target: 'UKR', severity: 'critical', headline: 'Ongoing Russia–Ukraine armed conflict' },
    { type: 'military_mobilisation', country: 'ISR', target: 'PSE', severity: 'critical', headline: 'Israel–Palestine military operations in Gaza' },
    { type: 'military_mobilisation', country: 'ISR', target: 'LBN', severity: 'high',     headline: 'Israel–Hezbollah cross-border conflict in Lebanon' },
    { type: 'military_mobilisation', country: 'ISR', target: 'SYR', severity: 'high',     headline: 'Israeli military strikes on targets in Syria' },
    { type: 'military_mobilisation', country: 'ISR', target: 'YEM', severity: 'high',     headline: 'Israel–Houthi exchange of strikes via Yemen' },
    { type: 'military_mobilisation', country: 'IRN', target: 'ISR', severity: 'high',     headline: 'Iran–Israel strategic military confrontation' },
    { type: 'military_mobilisation', country: 'USA', target: 'IRN', severity: 'high',     headline: 'US military operations and sanctions against Iran' },
    { type: 'military_mobilisation', country: 'USA', target: 'YEM', severity: 'high',     headline: 'US airstrikes on Houthi positions in Yemen' },
    { type: 'invasion',              country: 'SDN', target: 'SSD', severity: 'critical', headline: 'Sudan civil war — RSF vs SAF armed conflict' },
    { type: 'invasion',              country: 'MMR', target: 'MMR', severity: 'critical', headline: 'Myanmar civil war — junta vs resistance forces' },
    { type: 'military_mobilisation', country: 'ETH', target: 'ERI', severity: 'high',     headline: 'Ethiopia–Eritrea border tensions persist' },
    { type: 'military_mobilisation', country: 'SOM', target: 'ETH', severity: 'high',     headline: 'Somalia–Ethiopia tensions over Somaliland port deal' },
    { type: 'military_mobilisation', country: 'COD', target: 'RWA', severity: 'high',     headline: 'DR Congo–Rwanda conflict over M23 militia in eastern DRC' },
    { type: 'military_mobilisation', country: 'PAK', target: 'AFG', severity: 'medium',   headline: 'Pakistan–Afghanistan cross-border military operations' },

    // --- Military standoffs / high tension ---
    { type: 'military_mobilisation', country: 'CHN', target: 'TWN', severity: 'high',     headline: 'China–Taiwan strait military posturing' },
    { type: 'military_mobilisation', country: 'CHN', target: 'PHL', severity: 'medium',   headline: 'China–Philippines South China Sea territorial disputes' },
    { type: 'military_mobilisation', country: 'PRK', target: 'KOR', severity: 'medium',   headline: 'North Korea–South Korea military standoff' },
    { type: 'military_mobilisation', country: 'IND', target: 'PAK', severity: 'medium',   headline: 'India–Pakistan border tensions in Kashmir' },
    { type: 'military_mobilisation', country: 'RUS', target: 'GEO', severity: 'medium',   headline: 'Russia–Georgia tensions over occupied territories' },

    // --- Trade / economic ---
    { type: 'trade',                 country: 'CHN', target: 'USA', severity: 'medium',   headline: 'US–China trade war and tariff escalation' },
    { type: 'trade',                 country: 'USA', target: 'RUS', severity: 'medium',   headline: 'US-led economic sanctions on Russia' },
    { type: 'trade',                 country: 'DEU', target: 'NOR', severity: 'low',      headline: 'Germany–Norway energy corridor partnership' },
    { type: 'trade',                 country: 'JPN', target: 'USA', severity: 'low',      headline: 'Japan–US semiconductor supply chain agreement' },
    { type: 'trade',                 country: 'IND', target: 'RUS', severity: 'medium',   headline: 'India–Russia oil and energy trade partnership' },
    { type: 'trade',                 country: 'AUS', target: 'CHN', severity: 'medium',   headline: 'Australia–China trade disputes over critical minerals' },
    { type: 'trade',                 country: 'GBR', target: 'FRA', severity: 'low',      headline: 'UK–EU post-Brexit trade friction' },
    { type: 'trade',                 country: 'KOR', target: 'JPN', severity: 'low',      headline: 'South Korea–Japan semiconductor export controls' },
    { type: 'trade',                 country: 'BRA', target: 'CHN', severity: 'low',      headline: 'Brazil–China commodity export corridor' },
    { type: 'trade',                 country: 'SAU', target: 'IND', severity: 'low',      headline: 'Saudi Arabia–India oil supply agreement' },
    { type: 'trade',                 country: 'TUR', target: 'RUS', severity: 'medium',   headline: 'Turkey–Russia energy and trade corridor' },
  ];

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

  // ---- Data fetching ----

  /**
   * Merge known conflict/trade pairs into event list.
   * Avoids duplicates: if live data already has an event linking the
   * same country→target pair, the known pair is skipped.
   */
  function mergeKnownPairs(events) {
    const existingPairs = new Set(
      events
        .filter(e => e.target)
        .map(e => `${e.country}-${e.target}`)
    );

    const extras = KNOWN_PAIRS
      .filter(kp => !existingPairs.has(`${kp.country}-${kp.target}`))
      .map((kp, i) => ({
        ...kp,
        id: `known-${i}`,
        timestamp: new Date().toISOString()
      }));

    return [...events, ...extras];
  }

  /**
   * Fetch events from the static data/events.json file
   * (generated by GitHub Actions every 10 min).
   * Falls back to mock data if the file doesn't exist yet.
   */
  /** Remove events older than maxAge ms (default 48 hours) */
  function filterStale(events, maxAge = 48 * 60 * 60 * 1000) {
    const cutoff = Date.now() - maxAge;
    return events.filter(e => {
      const ts = new Date(e.timestamp).getTime();
      return !isNaN(ts) && ts > cutoff;
    });
  }

  async function fetchEvents() {
    try {
      const res = await fetch('data/events.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const fresh = filterStale(data.events);
      console.log(`[CONTRACKER] Loaded ${fresh.length} live events (${data.count - fresh.length} stale removed, updated ${data.updated})`);
      return mergeKnownPairs(fresh);
    } catch (err) {
      console.warn('[CONTRACKER] No live data available, using mock data:', err.message);
      return mergeKnownPairs(MOCK_EVENTS);
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
