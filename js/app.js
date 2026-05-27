document.addEventListener('DOMContentLoaded', async () => {
  const map = TravelMap.init();

  const data = await fetch('data/travels.json').then(r => r.json());
  const { travelers, trips } = data;

  const familyTrips   = trips.filter(t => t.travelers.includes('family'));
  const personalTrips = trips.filter(t => !t.travelers.includes('family'));

  initThemeToggle();
  initTabs();
  addTripsControl(map, familyTrips, personalTrips);
  updateStats(trips);
  renderTripsPage(trips);
  renderStatsPage(travelers, trips);

  // ─── Theme ───────────────────────────────────────────────────────────
  function initThemeToggle() {
    const btn   = document.getElementById('theme-toggle');
    const saved = localStorage.getItem('backman-theme') || 'dark';
    setTheme(saved);
    btn.addEventListener('click', () => {
      const next = document.body.dataset.theme === 'dark' ? 'warm' : 'dark';
      setTheme(next);
      localStorage.setItem('backman-theme', next);
    });
  }

  function setTheme(theme) {
    document.body.dataset.theme = theme;
    document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
    TravelMap.switchTheme(theme);
  }

  // ─── Tabs ────────────────────────────────────────────────────────────
  function initTabs() {
    const tabs  = document.querySelectorAll('.tab');
    const pages = document.querySelectorAll('.page');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t  => t.classList.remove('active'));
        pages.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`page-${tab.dataset.tab}`).classList.add('active');
        if (tab.dataset.tab === 'map') map.invalidateSize();
      });
    });
  }

  // ─── Trips Control Panel ─────────────────────────────────────────────
  function addTripsControl(leafletMap, familyTrips, personalTrips) {
    const tripState = new Map();
    // All trips start active — family trips are always on, personal trips default on
    [...familyTrips, ...personalTrips].forEach(t => tripState.set(t.key, true));

    // All buttons for a given trip.key — keeps cross-section state in sync
    const buttonRegistry = {};
    personalTrips.forEach(t => { buttonRegistry[t.key] = []; });

    const Control = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const container = L.DomUtil.create('div', 'leaflet-bar trips-panel expanded');
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        const header = L.DomUtil.create('div', 'trips-panel-header', container);
        const headerLabel = document.createElement('span');
        headerLabel.className = 'trips-panel-header-label';
        headerLabel.textContent = 'Trips';
        const headerChevron = document.createElement('span');
        headerChevron.className = 'trips-panel-chevron';
        headerChevron.textContent = '▾';
        header.append(headerLabel, headerChevron);
        L.DomEvent.on(header, 'click', () => container.classList.toggle('expanded'));

        const body = L.DomUtil.create('div', 'trips-panel-body', container);

        [
          { id: 'eric',     label: 'Eric',     icon: '🧭' },
          { id: 'carl',     label: 'Carl',     icon: '🎿' },
          { id: 'mika',     label: 'Mika',     icon: '🧳' },
          { id: 'marianne', label: 'Marianne', icon: '🌺' },
          { id: 'todd',     label: 'Todd',     icon: '🎒' }
        ].forEach(m => buildMemberSection(body, m));

        return container;
      }
    });

    new Control().addTo(leafletMap);

    // Render everything at start — family trips as permanent base layer, personal trips all active
    [...familyTrips, ...personalTrips].forEach(trip => TravelMap.renderTrip(trip));
    TravelMap.fitAll();

    // ── Member section — master toggle (all their trips) + individual route toggles ─
    function buildMemberSection(body, member) {
      const memberTrips = personalTrips.filter(t => t.travelers.includes(member.id));
      if (!memberTrips.length) return;

      // startCollapsed=true (list hidden until expanded), startOn=true (all active)
      const { list, masterSwitch } = buildSectionShell(body, member.icon, member.label, true, true);

      memberTrips.forEach(trip => {
        const btn = buildTripBtn(trip, true);
        buttonRegistry[trip.key].push(btn);

        L.DomEvent.on(btn, 'click', e => {
          L.DomEvent.preventDefault(e);
          const on   = tripState.get(trip.key);
          const next = !on;
          tripState.set(trip.key, next);
          buttonRegistry[trip.key].forEach(b => b.classList.toggle('active', next));
          if (next) TravelMap.renderTrip(trip);
          else      TravelMap.hideTrip(trip.key);
          syncFamilyTrips();
        });

        list.appendChild(btn);
      });

      // Master switch — show/hide all personal trips for this member at once
      L.DomEvent.on(masterSwitch, 'click', e => {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        const on = masterSwitch.classList.toggle('on');
        memberTrips.forEach(trip => {
          tripState.set(trip.key, on);
          buttonRegistry[trip.key].forEach(b => b.classList.toggle('active', on));
          if (on) TravelMap.renderTrip(trip);
          else    TravelMap.hideTrip(trip.key);
        });
        syncFamilyTrips();
      });
    }

    // ── Shell builder — shared by all sections ───────────────────────────
    function buildSectionShell(body, iconText, labelText, startCollapsed, startOn) {
      const section = L.DomUtil.create('div', 'panel-section', body);

      const hdr = L.DomUtil.create('div', 'section-toggle', section);
      const icon = document.createElement('span');
      icon.className = 'section-icon';
      icon.textContent = iconText;

      const lbl = document.createElement('span');
      lbl.className = 'section-label';
      lbl.textContent = labelText;

      const masterSwitch = document.createElement('div');
      masterSwitch.className = startOn ? 'toggle-switch on' : 'toggle-switch';

      const chev = document.createElement('span');
      chev.className = 'section-chevron';
      chev.textContent = startCollapsed ? '▸' : '▾';

      hdr.append(icon, lbl, masterSwitch, chev);

      const list = L.DomUtil.create(
        'div',
        startCollapsed ? 'section-list collapsed' : 'section-list',
        section
      );

      L.DomEvent.on(hdr, 'click', () => {
        list.classList.toggle('collapsed');
        chev.textContent = list.classList.contains('collapsed') ? '▸' : '▾';
      });

      return { section, list, masterSwitch };
    }

    // Two-line button: icon left, name + year stacked right
    function buildTripBtn(trip, active) {
      const btn = document.createElement('a');
      btn.className = active ? 'trip-toggle-btn active' : 'trip-toggle-btn';
      btn.href = '#';

      const icon = document.createElement('span');
      icon.className = 'trip-toggle-icon';
      icon.textContent = trip.icon;

      const content = document.createElement('div');
      content.className = 'trip-toggle-content';

      const name = document.createElement('span');
      name.className = 'trip-toggle-name';
      name.textContent = trip.name;

      const year = document.createElement('span');
      year.className = 'trip-toggle-year';
      year.textContent = trip.year;

      content.append(name, year);
      btn.append(icon, content);
      return btn;
    }

    function recalcStats() {
      const allTrips = [...familyTrips, ...personalTrips];
      const visible  = allTrips.filter(t => tripState.get(t.key));
      updateStats(visible);
    }

    // Family trips have no individual toggle — mirror their visibility to whether
    // any personal trip is currently active. When all travelers are off the map
    // should be completely empty; when any traveler is on, family trips show too.
    function syncFamilyTrips() {
      const anyPersonalActive = personalTrips.some(t => tripState.get(t.key));
      familyTrips.forEach(trip => {
        tripState.set(trip.key, anyPersonalActive);
        if (anyPersonalActive) TravelMap.renderTrip(trip);   // no-op if already shown
        else                   TravelMap.hideTrip(trip.key); // no-op if already hidden
      });
      recalcStats();
    }
  }

  // ─── Header stats bar ─────────────────────────────────────────────────
  function updateStats(visibleTrips) {
    const countries = new Set();
    const cities    = new Set();
    visibleTrips.forEach(trip => {
      if (trip.mode === 'pins') {
        trip.cities.forEach(c => cities.add(c.name));
      } else if (trip.mode === 'hub-spoke') {
        if (trip.hub) cities.add(trip.hub.name);
        trip.spokes.forEach(s => {
          if (s.chain) s.chain.forEach(c => cities.add(c.name));
          else cities.add(s.name);
        });
      } else if (trip.stops) {
        trip.stops.forEach(s => cities.add(s.name));
      }
      if (trip.countries) trip.countries.forEach(c => countries.add(c));
    });
    document.getElementById('stat-trips').querySelector('strong').textContent     = visibleTrips.length;
    document.getElementById('stat-countries').querySelector('strong').textContent = countries.size;
    document.getElementById('stat-cities').querySelector('strong').textContent    = cities.size;
  }

  // ─── Trips page ───────────────────────────────────────────────────────
  function renderTripsPage(trips) {
    const container = document.getElementById('trips-container');
    const heading = document.createElement('h2');
    heading.textContent = 'All Trips';
    container.replaceChildren(heading);

    trips.forEach(trip => {
      const stops = trip.mode === 'pins'
        ? trip.cities.map(c => c.name)
        : trip.mode === 'hub-spoke'
          ? [trip.hub.name, ...trip.spokes.map(s => s.chain ? s.chain.map(c => c.name).join(' → ') : s.name)]
          : (trip.stops || []).map(s => s.name);

      const el  = document.createElement('div');
      el.className = 'trip-detail';

      const hdr = document.createElement('div');
      hdr.className = 'trip-detail-header';

      const iconEl = document.createElement('span');
      iconEl.className = 'trip-detail-icon';
      iconEl.textContent = trip.icon;

      const info     = document.createElement('div');
      const title    = document.createElement('div');
      title.className = 'trip-detail-title';
      title.textContent = trip.name;
      const subtitle = document.createElement('div');
      subtitle.className = 'trip-detail-subtitle';
      subtitle.textContent = `${trip.year} · ${stops.length} stop${stops.length !== 1 ? 's' : ''}`;

      const distKm = calcTripDistanceKm(trip);
      if (distKm) {
        const distBadge = document.createElement('div');
        distBadge.className = 'trip-distance-badge';
        distBadge.textContent = formatDist(distKm);
        info.append(title, subtitle, distBadge);
      } else {
        info.append(title, subtitle);
      }
      hdr.append(iconEl, info);

      const stopsEl = document.createElement('div');
      stopsEl.className = 'trip-stops';
      stops.forEach(s => {
        const span = document.createElement('span');
        span.className = 'trip-stop';
        span.textContent = s;
        stopsEl.appendChild(span);
      });

      el.append(hdr, stopsEl);
      container.appendChild(el);
    });
  }

  // ─── Stats page ───────────────────────────────────────────────────────
  function renderStatsPage(travelers, trips) {
    // Defined inside the function to avoid TDZ: this const would be in the
    // temporal dead zone when renderStatsPage() is first called above.
    const PERSON_ICONS = { eric: '🧭', carl: '🎿', mika: '🧳', marianne: '🌺', todd: '🎒' };
    const container = document.getElementById('stats-container');
    container.replaceChildren();

    // ── Sticky page header with person selector ──────────────────────────
    const stickyHeader = document.createElement('div');
    stickyHeader.className = 'stats-sticky-header';

    const heading = document.createElement('h2');
    heading.textContent = 'Travel Stats';
    stickyHeader.appendChild(heading);

    const selectorRow = document.createElement('div');
    selectorRow.className = 'person-selector';
    stickyHeader.appendChild(selectorRow);

    // ── Scrollable content area (re-rendered on person change) ───────────
    const statsContent = document.createElement('div');
    statsContent.className = 'stats-content';

    container.append(stickyHeader, statsContent);

    // Only real travelers (not the 'family' meta-group) are selectable
    const selectable = travelers.filter(t => t.id !== 'family');
    let activeTraveler = selectable.find(t => t.id === 'eric') || selectable[0];

    function selectPerson(traveler) {
      activeTraveler = traveler;
      selectorRow.querySelectorAll('.person-btn').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.id === traveler.id)
      );
      renderPersonStats(statsContent, traveler, trips, travelers);
    }

    selectable.forEach(traveler => {
      const btn = document.createElement('button');
      btn.className = 'person-btn';
      btn.dataset.id = traveler.id;
      btn.style.setProperty('--person-color', traveler.color);
      btn.textContent = `${PERSON_ICONS[traveler.id] || ''} ${traveler.name}`;
      btn.addEventListener('click', () => selectPerson(traveler));
      selectorRow.appendChild(btn);
    });

    // Render Eric's stats on load
    selectPerson(activeTraveler);
  }

  // ── Per-person stats renderer ────────────────────────────────────────
  function renderPersonStats(container, traveler, allTrips, allTravelers) {
    const personTrips = allTrips.filter(t => t.travelers.includes(traveler.id));
    const color       = traveler.color;

    const countries    = new Set();
    const cities       = new Set();
    const numericYears = [];

    personTrips.forEach(trip => {
      if (trip.countries) trip.countries.forEach(c => countries.add(c));

      if (trip.mode === 'pins') {
        trip.cities.forEach(c => cities.add(c.name));
      } else if (trip.mode === 'hub-spoke') {
        if (trip.hub) cities.add(trip.hub.name);
        trip.spokes.forEach(s => {
          if (s.chain) s.chain.forEach(c => cities.add(c.name));
          else cities.add(s.name);
        });
      } else if (trip.stops) {
        trip.stops.forEach(s => cities.add(s.name));
      }

      const y = parseInt(trip.year);
      if (!isNaN(y)) numericYears.push(y);
    });

    const linearTrips = personTrips.filter(t => t.mode === 'linear');
    const totalKm     = linearTrips.reduce((sum, t) => sum + (calcTripDistanceKm(t) || 0), 0);
    const totalMi     = Math.round(totalKm * 0.621371);

    const yearMin   = numericYears.length ? Math.min(...numericYears) : null;
    const yearMax   = numericYears.length ? Math.max(...numericYears) : null;
    const yearRange = yearMin ? (yearMin === yearMax ? `${yearMin}` : `${yearMin}–${yearMax}`) : '—';

    container.replaceChildren();

    // ── Overview stat cards ──────────────────────────────────────────────
    const grid = document.createElement('div');
    grid.className = 'stat-grid';

    const statData = [
      { value: personTrips.length, label: 'Trips' },
      { value: countries.size,     label: 'Countries' },
      { value: cities.size,        label: 'Cities' },
      { value: yearRange,          label: 'Years Active' },
    ];
    if (totalKm > 0) {
      statData.push({
        value: Math.round(totalKm).toLocaleString(),
        label: `km routed (${totalMi.toLocaleString()} mi)`
      });
    }

    statData.forEach(({ value, label }) => {
      const card = document.createElement('div');
      card.className = 'stat-card';
      const v = document.createElement('div');
      v.className = 'stat-card-value';
      v.style.color = color;
      v.textContent = value;
      const l = document.createElement('div');
      l.className = 'stat-card-label';
      l.textContent = label;
      card.append(v, l);
      grid.appendChild(card);
    });
    container.appendChild(grid);

    // ── Countries visited chips ──────────────────────────────────────────
    if (countries.size) {
      const cHeading = document.createElement('h3');
      cHeading.className = 'stats-section-heading';
      cHeading.textContent = 'Countries Visited';
      container.appendChild(cHeading);

      const chipsRow = document.createElement('div');
      chipsRow.className = 'country-chips';
      [...countries].sort().forEach(c => {
        const chip = document.createElement('span');
        chip.className = 'country-chip';
        chip.textContent = c;
        chipsRow.appendChild(chip);
      });
      container.appendChild(chipsRow);
    }

    // ── Trip history ─────────────────────────────────────────────────────
    const tHeading = document.createElement('h3');
    tHeading.className = 'stats-section-heading';
    tHeading.textContent = `Trip History (${personTrips.length})`;
    container.appendChild(tHeading);

    const sortedTrips = [...personTrips].sort((a, b) => {
      const ay = parseInt(a.year) || 0;
      const by = parseInt(b.year) || 0;
      return by - ay;
    });

    sortedTrips.forEach(trip => {
      const stops = trip.mode === 'pins'
        ? trip.cities.map(c => c.name)
        : trip.mode === 'hub-spoke'
          ? [trip.hub.name, ...trip.spokes.map(s =>
              s.chain ? s.chain.map(c => c.name).join(' → ') : s.name)]
          : (trip.stops || []).map(s => s.name);

      const distKm = calcTripDistanceKm(trip);

      const row = document.createElement('div');
      row.className = 'stats-trip-row';

      const iconEl = document.createElement('span');
      iconEl.className = 'stats-trip-icon';
      iconEl.textContent = trip.icon;

      const info = document.createElement('div');
      info.className = 'stats-trip-info';

      const name = document.createElement('div');
      name.className = 'stats-trip-name';
      name.textContent = trip.name;

      const meta = document.createElement('div');
      meta.className = 'stats-trip-meta';
      meta.textContent = `${trip.year} · ${stops.length} stop${stops.length !== 1 ? 's' : ''}` +
        (distKm ? ` · ${distKm.toLocaleString()} km` : '');

      info.append(name, meta);
      row.append(iconEl, info);
      container.appendChild(row);
    });
  }
});
