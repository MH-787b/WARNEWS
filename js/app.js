/* ============================================================
   app.js — Application entry point

   Wires together MapRenderer and EventStore.
   Handles the event detail panel.

   *** TO CONNECT LIVE DATA ***
   See events.js for instructions. The only change needed is
   inside EventStore.fetchEvents(). Everything else adapts
   automatically via the EventStore.onChange() listener.

   For periodic polling, add:
     setInterval(() => EventStore.load(), 60000);
   ============================================================ */

(async function main() {

  // ---- Panel DOM refs ----
  const panel        = document.getElementById('event-panel');
  const panelName    = document.getElementById('panel-country-name');
  const panelEvents  = document.getElementById('panel-events');
  const panelClose   = document.getElementById('panel-close');

  // ---- Panel: open / close ----

  function openPanel(iso3, countryName) {
    panelName.textContent = countryName;
    panelEvents.innerHTML = '';

    const events = EventStore.getByCountry(iso3);

    if (events.length === 0) {
      panelEvents.innerHTML =
        '<p class="panel-no-events">No active events for this region.</p>';
    } else {
      events.forEach(evt => {
        const card = document.createElement('div');
        // Add modifier class based on event category
        const isPolitical = evt.type === 'leadership_change' || evt.type === 'diplomacy';
        const isTrade = evt.type === 'trade';
        card.className = 'event-card'
          + (isPolitical ? ' event-card--political' : '')
          + (isTrade ? ' event-card--trade' : '');

        // Map indicator label
        const indicator = isPolitical ? '\u25C7 PIN' : isTrade ? '\u2014 ROUTE' : '\u2014 ARC';

        card.innerHTML = `
          <div class="event-card__header">
            <span class="event-card__type">${EventStore.formatType(evt.type)}</span>
            <span class="event-card__indicator">${indicator}</span>
          </div>
          <p class="event-card__headline">${escapeHtml(evt.headline)}</p>
          <span class="event-card__timestamp">${EventStore.formatTimestamp(evt.timestamp)}</span>
        `;
        panelEvents.appendChild(card);
      });
    }

    panel.classList.add('event-panel--open');
  }

  function closePanel() {
    panel.classList.remove('event-panel--open');
    MapRenderer.clearSelection();
  }

  panelClose.addEventListener('click', closePanel);

  // Close panel on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });

  // ---- Initialise map ----
  await MapRenderer.init('#map-container', openPanel);

  // ---- Load events and render overlays ----

  /**
   * loadEvents — Main entry point for event data.
   *
   * Call this function with new data to update the map.
   * When connecting live APIs, you can call this directly:
   *
   *   const data = await fetch('/api/events').then(r => r.json());
   *   loadEvents(data);
   *
   * Or use EventStore.load() which handles fetching internally.
   */
  function loadEvents(events) {
    // Draw conflict connection lines (red) — invasion + military_mobilisation
    const conflicts = events.filter(e =>
      (e.type === 'invasion' || e.type === 'military_mobilisation') && e.target
    );
    MapRenderer.drawInvasionLines(conflicts);

    // Draw trade route lines (blue)
    const trades = events.filter(e => e.type === 'trade' && e.target);
    MapRenderer.drawTradeLines(trades);

    // Draw pins for political events (only live data, not known pairs)
    const political = events.filter(e =>
      (e.type === 'leadership_change' || e.type === 'diplomacy') &&
      !String(e.id).startsWith('known-')
    );
    MapRenderer.drawPins(political);

    // Highlight countries with active events
    const activeCodes = new Set();
    events.forEach(e => {
      activeCodes.add(e.country);
      if (e.target) activeCodes.add(e.target);
    });
    MapRenderer.highlightActiveCountries([...activeCodes]);
  }

  // Subscribe to event store updates
  EventStore.onChange(loadEvents);

  // Initial load
  await EventStore.load();

  // Auto-refresh every 10 minutes (stays well within 200 req/day free tier)
  setInterval(() => EventStore.load(), 10 * 60 * 1000);

  // ---- Utility ----

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
