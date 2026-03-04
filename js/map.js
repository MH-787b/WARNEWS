/* ============================================================
   map.js — Map rendering module

   Handles all SVG map rendering, zoom/pan, hover labels,
   country highlighting, and invasion connection lines.

   Depends on D3.js (v7) loaded globally.
   ============================================================ */

const MapRenderer = (() => {

  // GeoJSON source — Natural Earth 110m countries (public domain)
  const GEOJSON_URL =
    'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

  // Country name lookup (ISO numeric → display name)
  // Sourced from Natural Earth. Keyed by zero-padded ISO numeric code.
  const COUNTRY_NAMES = {
    '004':'Afghanistan','008':'Albania','012':'Algeria','016':'American Samoa',
    '024':'Angola','032':'Argentina','036':'Australia','040':'Austria',
    '050':'Bangladesh','056':'Belgium','070':'Bosnia and Herzegovina',
    '076':'Brazil','100':'Bulgaria','104':'Myanmar','116':'Cambodia',
    '120':'Cameroon','124':'Canada','144':'Sri Lanka','148':'Chad',
    '156':'China','170':'Colombia','180':'DR Congo','188':'Costa Rica',
    '191':'Croatia','192':'Cuba','196':'Cyprus','203':'Czechia',
    '208':'Denmark','218':'Ecuador','818':'Egypt','222':'El Salvador',
    '226':'Equatorial Guinea','232':'Eritrea','233':'Estonia','231':'Ethiopia',
    '242':'Fiji','246':'Finland','250':'France','266':'Gabon','268':'Georgia',
    '276':'Germany','288':'Ghana','300':'Greece','320':'Guatemala',
    '324':'Guinea','328':'Guyana','332':'Haiti','340':'Honduras',
    '348':'Hungary','352':'Iceland','356':'India','360':'Indonesia',
    '364':'Iran','368':'Iraq','372':'Ireland','376':'Israel','380':'Italy',
    '384':"Côte d'Ivoire",'388':'Jamaica','392':'Japan','400':'Jordan',
    '398':'Kazakhstan','404':'Kenya','408':'North Korea','410':'South Korea',
    '414':'Kuwait','417':'Kyrgyzstan','418':'Laos','422':'Lebanon',
    '426':'Lesotho','430':'Liberia','434':'Libya','440':'Lithuania',
    '442':'Luxembourg','450':'Madagascar','454':'Malawi','458':'Malaysia',
    '466':'Mali','478':'Mauritania','484':'Mexico','496':'Mongolia',
    '499':'Montenegro','504':'Morocco','508':'Mozambique','516':'Namibia',
    '524':'Nepal','528':'Netherlands','540':'New Caledonia','554':'New Zealand',
    '558':'Nicaragua','562':'Niger','566':'Nigeria','578':'Norway',
    '512':'Oman','586':'Pakistan','591':'Panama','598':'Papua New Guinea',
    '600':'Paraguay','604':'Peru','608':'Philippines','616':'Poland',
    '620':'Portugal','630':'Puerto Rico','634':'Qatar','642':'Romania',
    '643':'Russia','646':'Rwanda','682':'Saudi Arabia','686':'Senegal',
    '688':'Serbia','694':'Sierra Leone','702':'Singapore','703':'Slovakia',
    '704':'Vietnam','705':'Slovenia','706':'Somalia','710':'South Africa',
    '716':'Zimbabwe','724':'Spain','728':'South Sudan','729':'Sudan',
    '740':'Suriname','748':'Eswatini','752':'Sweden','756':'Switzerland',
    '760':'Syria','762':'Tajikistan','764':'Thailand','768':'Togo',
    '780':'Trinidad and Tobago','788':'Tunisia','792':'Turkey',
    '795':'Turkmenistan','800':'Uganda','804':'Ukraine','784':'UAE',
    '826':'United Kingdom','834':'Tanzania','840':'United States',
    '854':'Burkina Faso','858':'Uruguay','860':'Uzbekistan','862':'Venezuela',
    '887':'Yemen','894':'Zambia','010':'Antarctica','-99':'Kosovo',
    '807':'North Macedonia','158':'Taiwan'
  };

  // DOM references
  let _svg, _g, _projection, _path, _zoom;
  let _invasionLayer, _countryLayer;

  // State
  let _selectedIso = null;
  let _onCountryClick = null;

  /** Initialise the map inside `containerSelector` */
  async function init(containerSelector, onCountryClick) {
    _onCountryClick = onCountryClick;

    const container = document.querySelector(containerSelector);
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Projection — Equirectangular is clean and tactical-looking
    _projection = d3.geoNaturalEarth1()
      .scale(width / 5.8)
      .translate([width / 2, height / 2]);

    _path = d3.geoPath().projection(_projection);

    // Zoom behaviour
    _zoom = d3.zoom()
      .scaleExtent([1, 12])
      .on('zoom', (event) => {
        _g.attr('transform', event.transform);
      });

    // Create SVG
    _svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .call(_zoom);

    _g = _svg.append('g');

    // Layer order: countries first, then invasion lines on top
    _countryLayer = _g.append('g').attr('class', 'layer-countries');
    _invasionLayer = _g.append('g').attr('class', 'layer-invasions');

    // Load map data
    const topo = await d3.json(GEOJSON_URL);
    const countries = topojson.feature(topo, topo.objects.countries);

    // Draw countries
    _countryLayer.selectAll('path')
      .data(countries.features)
      .enter()
      .append('path')
      .attr('d', _path)
      .attr('class', 'country')
      .attr('data-id', d => d.id)
      .attr('data-name', d => d.properties.name)
      .on('mouseenter', handleMouseEnter)
      .on('mousemove', handleMouseMove)
      .on('mouseleave', handleMouseLeave)
      .on('click', handleClick);

    // Handle window resize
    window.addEventListener('resize', handleResize);
  }

  // ---- Interaction handlers ----

  function handleMouseEnter(event, d) {
    const label = document.getElementById('country-label');
    const key = String(d.id).padStart(3, '0');
    label.textContent = COUNTRY_NAMES[key] || d.properties.name || 'Unknown';
    label.classList.add('country-label--visible');
  }

  function handleMouseMove(event) {
    const label = document.getElementById('country-label');
    label.style.left = (event.clientX + 14) + 'px';
    label.style.top = (event.clientY - 28) + 'px';
  }

  function handleMouseLeave() {
    const label = document.getElementById('country-label');
    label.classList.remove('country-label--visible');
  }

  function handleClick(event, d) {
    const key = String(d.id).padStart(3, '0');
    const name = COUNTRY_NAMES[key] || d.properties.name || 'Unknown';
    const numericId = d.id;

    // Resolve ISO alpha-3 from numeric ID
    const iso3 = numericToIso3(numericId);

    // Visual selection — raise active countries so borders aren't clipped
    _countryLayer.selectAll('.country').classed('country--active', false);
    d3.select(event.currentTarget).classed('country--active', true);
    _countryLayer.selectAll('.country--active').raise();
    _selectedIso = iso3;

    if (_onCountryClick) {
      _onCountryClick(iso3, name);
    }
  }

  function handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    _svg.attr('width', width).attr('height', height);
    _projection.scale(width / 5.8).translate([width / 2, height / 2]);
    _countryLayer.selectAll('path').attr('d', _path);

    // Redraw invasion lines after resize
    // (they'll be redrawn via the event system)
  }

  // ---- Invasion lines ----

  /**
   * Draw curved dashed arcs between invading and target countries.
   * Uses a quadratic Bézier with the control point offset upward
   * to simulate a ballistic / missile flight path.
   * @param {Array} invasions — invasion events from EventStore
   */
  function drawInvasionLines(invasions) {
    _invasionLayer.selectAll('.invasion-line, .invasion-line-bg, .invasion-node').remove();

    invasions.forEach(evt => {
      const from = getCountryCentroid(evt.country);
      const to = getCountryCentroid(evt.target);

      if (!from || !to) return;

      // Compute a control point above the midpoint for an arc effect.
      // Height scales with distance so short links still curve visibly.
      const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      const arcHeight = Math.max(dist * 0.25, 30);

      // Offset perpendicular to the line (upward bias)
      const cp = [mid[0], mid[1] - arcHeight];

      const pathData = `M ${from[0]},${from[1]} Q ${cp[0]},${cp[1]} ${to[0]},${to[1]}`;

      // Background static arc (faint, gives depth)
      _invasionLayer.append('path')
        .attr('class', 'invasion-line-bg')
        .attr('d', pathData);

      // Foreground animated dashed arc
      _invasionLayer.append('path')
        .attr('class', 'invasion-line')
        .attr('d', pathData);

      // Endpoint nodes
      _invasionLayer.append('circle')
        .attr('class', 'invasion-node')
        .attr('cx', from[0])
        .attr('cy', from[1])
        .attr('r', 3);

      _invasionLayer.append('circle')
        .attr('class', 'invasion-node')
        .attr('cx', to[0])
        .attr('cy', to[1])
        .attr('r', 3);
    });
  }

  /**
   * Draw curved dashed arcs for trade routes (blue).
   * @param {Array} trades — trade events from EventStore
   */
  function drawTradeLines(trades) {
    _invasionLayer.selectAll('.trade-line, .trade-line-bg, .trade-node').remove();

    trades.forEach(evt => {
      const from = getCountryCentroid(evt.country);
      const to = getCountryCentroid(evt.target);

      if (!from || !to) return;

      const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      const arcHeight = Math.max(dist * 0.25, 30);

      const cp = [mid[0], mid[1] - arcHeight];
      const pathData = `M ${from[0]},${from[1]} Q ${cp[0]},${cp[1]} ${to[0]},${to[1]}`;

      _invasionLayer.append('path')
        .attr('class', 'trade-line-bg')
        .attr('d', pathData);

      _invasionLayer.append('path')
        .attr('class', 'trade-line')
        .attr('d', pathData);

      _invasionLayer.append('circle')
        .attr('class', 'trade-node')
        .attr('cx', from[0])
        .attr('cy', from[1])
        .attr('r', 3);

      _invasionLayer.append('circle')
        .attr('class', 'trade-node')
        .attr('cx', to[0])
        .attr('cy', to[1])
        .attr('r', 3);
    });
  }

  /**
   * Draw pin markers on countries with political events
   * (leadership changes, diplomacy, etc.)
   * @param {Array} events — political events from EventStore
   */
  function drawPins(events) {
    _invasionLayer.selectAll('.pin-marker, .pin-dot, .pin-pulse').remove();

    // Deduplicate by country so we don't stack pins
    const seen = new Set();
    events.forEach(evt => {
      if (seen.has(evt.country)) return;
      seen.add(evt.country);

      const pos = getCountryCentroid(evt.country);
      if (!pos) return;

      // Pulsing ring (behind everything)
      _invasionLayer.append('circle')
        .attr('class', 'pin-pulse')
        .attr('cx', pos[0])
        .attr('cy', pos[1])
        .attr('r', 4);

      // Diamond shape pin marker
      const s = 8; // half-size
      const diamond = `M ${pos[0]},${pos[1] - s} L ${pos[0] + s},${pos[1]} L ${pos[0]},${pos[1] + s} L ${pos[0] - s},${pos[1]} Z`;

      _invasionLayer.append('path')
        .attr('class', 'pin-marker')
        .attr('d', diamond);

      // Inner dot
      _invasionLayer.append('circle')
        .attr('class', 'pin-dot')
        .attr('cx', pos[0])
        .attr('cy', pos[1])
        .attr('r', 3);
    });
  }

  /**
   * Highlight countries that have active events
   * @param {Array} countryIsos — ISO alpha-3 codes with events
   */
  function highlightActiveCountries(countryIsos) {
    const paddedKeys = countryIsos.map(iso => iso3ToNumeric(iso)).filter(Boolean);

    _countryLayer.selectAll('.country')
      .classed('country--active', d =>
        paddedKeys.some(key => featureMatchesNumeric(d.id, key))
      );

    // Raise active countries to top of layer so borders aren't clipped
    // by neighboring countries drawing over them
    _countryLayer.selectAll('.country--active').raise();
  }

  /** Clear selection state */
  function clearSelection() {
    _selectedIso = null;
    _countryLayer.selectAll('.country').classed('country--active', false);
  }

  // ---- Utilities ----

  /** Get projected centroid [x, y] for a country by ISO alpha-3 */
  function getCountryCentroid(iso3) {
    const paddedKey = iso3ToNumeric(iso3);
    if (!paddedKey) return null;

    const feature = _countryLayer.selectAll('.country')
      .data()
      .find(d => featureMatchesNumeric(d.id, paddedKey));

    if (!feature) return null;
    return _path.centroid(feature);
  }

  // ---- ISO 3166 numeric ↔ alpha-3 mapping ----
  // Subset covering countries referenced in mock events + major nations.
  // Expand as needed or replace with a full lookup library.

  const ISO_MAP = {
    '004': 'AFG', '008': 'ALB', '012': 'DZA', '024': 'AGO', '032': 'ARG',
    '036': 'AUS', '040': 'AUT', '050': 'BGD', '056': 'BEL', '076': 'BRA',
    '100': 'BGR', '104': 'MMR', '116': 'KHM', '120': 'CMR', '124': 'CAN',
    '144': 'LKA', '148': 'TCD', '156': 'CHN', '170': 'COL', '180': 'COD',
    '188': 'CRI', '191': 'HRV', '192': 'CUB', '196': 'CYP', '203': 'CZE',
    '208': 'DNK', '218': 'ECU', '818': 'EGY', '222': 'SLV', '226': 'GNQ',
    '232': 'ERI', '233': 'EST', '231': 'ETH', '246': 'FIN', '250': 'FRA',
    '266': 'GAB', '268': 'GEO', '276': 'DEU', '288': 'GHA', '300': 'GRC',
    '320': 'GTM', '324': 'GIN', '328': 'GUY', '332': 'HTI', '340': 'HND',
    '348': 'HUN', '352': 'ISL', '356': 'IND', '360': 'IDN', '364': 'IRN',
    '368': 'IRQ', '372': 'IRL', '376': 'ISR', '380': 'ITA', '384': 'CIV',
    '388': 'JAM', '392': 'JPN', '400': 'JOR', '398': 'KAZ', '404': 'KEN',
    '408': 'PRK', '410': 'KOR', '414': 'KWT', '417': 'KGZ', '418': 'LAO',
    '422': 'LBN', '426': 'LSO', '430': 'LBR', '434': 'LBY', '440': 'LTU',
    '442': 'LUX', '450': 'MDG', '454': 'MWI', '458': 'MYS', '466': 'MLI',
    '478': 'MRT', '484': 'MEX', '496': 'MNG', '504': 'MAR', '508': 'MOZ',
    '516': 'NAM', '524': 'NPL', '528': 'NLD', '540': 'NCL', '554': 'NZL',
    '558': 'NIC', '562': 'NER', '566': 'NGA', '578': 'NOR', '512': 'OMN',
    '586': 'PAK', '591': 'PAN', '598': 'PNG', '600': 'PRY', '604': 'PER',
    '608': 'PHL', '616': 'POL', '620': 'PRT', '630': 'PRI', '634': 'QAT',
    '642': 'ROU', '643': 'RUS', '646': 'RWA', '682': 'SAU', '686': 'SEN',
    '694': 'SLE', '702': 'SGP', '703': 'SVK', '704': 'VNM', '705': 'SVN',
    '706': 'SOM', '710': 'ZAF', '716': 'ZWE', '724': 'ESP', '728': 'SSD',
    '729': 'SDN', '740': 'SUR', '748': 'SWZ', '752': 'SWE', '756': 'CHE',
    '760': 'SYR', '762': 'TJK', '764': 'THA', '768': 'TGO', '780': 'TTO',
    '788': 'TUN', '792': 'TUR', '795': 'TKM', '800': 'UGA', '804': 'UKR',
    '784': 'ARE', '826': 'GBR', '834': 'TZA', '840': 'USA', '854': 'BFA',
    '858': 'URY', '860': 'UZB', '862': 'VEN', '887': 'YEM', '894': 'ZMB',
    // Kosovo and other special cases
    '-99': 'XKX', '070': 'BIH', '688': 'SRB', '499': 'MNE', '807': 'MKD',
    '010': 'ATA',
  };

  // Reverse map
  const ISO_REVERSE = {};
  for (const [num, alpha] of Object.entries(ISO_MAP)) {
    ISO_REVERSE[alpha] = num;
  }

  function numericToIso3(numericId) {
    // TopoJSON IDs may be numeric strings or numbers
    const key = String(numericId).padStart(3, '0');
    return ISO_MAP[key] || null;
  }

  function iso3ToNumeric(iso3) {
    // Returns the raw string as stored in the TopoJSON (unpadded)
    const padded = ISO_REVERSE[iso3];
    return padded || null;
  }

  /** Compare a TopoJSON feature ID against our padded ISO key */
  function featureMatchesNumeric(featureId, paddedKey) {
    return String(featureId).padStart(3, '0') === paddedKey;
  }

  return {
    init,
    drawInvasionLines,
    drawTradeLines,
    drawPins,
    highlightActiveCountries,
    clearSelection
  };
})();
