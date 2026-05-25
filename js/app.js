document.addEventListener('DOMContentLoaded', async () => {
  const map = TravelMap.init();

  const data = await fetch('data/travels.json').then(r => r.json());
  const { travelers, trips } = data;

  const familyTrips   = trips.filter(t => t.travelers.includes('family'));
  const personalTrips = trips.filter(t => !t.travelers.includes('family'));

  initThemeToggle();
  initTabs();
  addTripsControl(map, familyTrips, personalTrips);
  updateStats(familyTrips);
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

  // ─── Aggregate all cities a member has visited (across every trip) ───
  function getMemberCities(memberId) {
    const seen   = new Set();
    const cities = [];
    trips
      .filter(t => t.travelers.includes(memberId))
      .forEach(trip => {
        const add = (name, lat, lng) => {
          if (!seen.has(name)) { seen.add(name); cities.push({ name, lat, lng }); }
        };
        if (trip.mode === 'pins') {
          trip.cities.forEach(c => add(c.name, c.lat, c.lng));
        } else if (trip.mode === 'linear' && trip.stops) {
          trip.stops.forEach(s => add(s.name, s.lat, s.lng));
        } else if (trip.mode === 'hub-spoke') {
          if (trip.hub) add(trip.hub.name, trip.hub.lat, trip.hub.lng);
          trip.spokes.forEach(s => {
            if (s.chain) s.chain.forEach(c => add(c.name, c.lat, c.lng));
            else add(s.name, s.lat, s.lng);
          });
        }
      });
    return cities;
  }

  // ─── Trips Control Panel ─────────────────────────────────────────────
  function addTripsControl(leafletMap, familyTrips, personalTrips) {
    const tripState = new Map();
    familyTrips.forEach(t   => tripState.set(t.key, true));
    personalTrips.forEach(t => tripState.set(t.key, false));

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

        buildFamilySection(body);

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
    familyTrips.forEach(trip => TravelMap.renderTrip(trip));
    TravelMap.fitAll();

    // ── Family section — individual trip toggles + bulk switch ───────────
    function buildFamilySection(body) {
      const { list, masterSwitch } = buildSectionShell(body, '👨‍👩‍👧‍👦', 'Family', false, true);
      const familyBtns = [];

      familyTrips.forEach(trip => {
        const btn = buildTripBtn(trip, true);
        L.DomEvent.on(btn, 'click', e => {
          L.DomEvent.preventDefault(e);
          const on = tripState.get(trip.key);
          tripState.set(trip.key, !on);
          btn.classList.toggle('active', !on);
          if (!on) TravelMap.renderTrip(trip);
          else     TravelMap.hideTrip(trip.key);
          recalcStats();
        });
        familyBtns.push(btn);
        list.appendChild(btn);
      });

      L.DomEvent.on(masterSwitch, 'click', e => {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        const on = masterSwitch.classList.toggle('on');
        familyTrips.forEach((trip, i) => {
          tripState.set(trip.key, on);
          familyBtns[i].classList.toggle('active', on);
          if (on) TravelMap.renderTrip(trip);
          else    TravelMap.hideTrip(trip.key);
        });
        recalcStats();
      });
    }

    // ── Member section — aggregate city pins (master) + route toggles ────
    function buildMemberSection(body, member) {
      const traveler    = travelers.find(t => t.id === member.id);
      const color       = traveler?.color || '#64b5f6';
      const memberCities = getMemberCities(member.id);
      const memberTrips = personalTrips.filter(t => t.travelers.includes(member.id));

      if (!memberCities.length) return;

      const { list, masterSwitch } = buildSectionShell(body, member.icon, member.label, true, false);

      // Individual non-family route toggles (visible in dropdown)
      memberTrips.forEach(trip => {
        const btn = buildTripBtn(trip, false);
        buttonRegistry[trip.key].push(btn);

        L.DomEvent.on(btn, 'click', e => {
          L.DomEvent.preventDefault(e);
          const on  = tripState.get(trip.key);
          const next = !on;
          tripState.set(trip.key, next);
          buttonRegistry[trip.key].forEach(b => b.classList.toggle('active', next));
          if (next) TravelMap.renderTrip(trip);
          else      TravelMap.hideTrip(trip.key);
          recalcStats();
        });

        list.appendChild(btn);
      });

      // Master switch — show/hide all cities this member has visited as pins
      L.DomEvent.on(masterSwitch, 'click', e => {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        const on = masterSwitch.classList.toggle('on');
        if (on) TravelMap.renderMemberPins(member.id, color, memberCities);
        else    TravelMap.hideMemberPins(member.id);
      });
    }

    // ── Shell builder — shared by both section types ─────────────────────
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

      // Header click expands/collapses list — master switch stops propagation
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
      info.append(title, subtitle);
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
    const container = document.getElementById('stats-container');
    container.replaceChildren();

    const allCountries = new Set();
    const allCities    = new Set();
    trips.forEach(trip => {
      if (trip.countries) trip.countries.forEach(c => allCountries.add(c));
      if (trip.mode === 'pins')           trip.cities.forEach(c => allCities.add(c.name));
      else if (trip.stops)                trip.stops.forEach(s => allCities.add(s.name));
      else if (trip.mode === 'hub-spoke') {
        trip.spokes.forEach(s => {
          if (s.chain) s.chain.forEach(c => allCities.add(c.name));
          else allCities.add(s.name);
        });
      }
    });

    const heading = document.createElement('h2');
    heading.textContent = 'Travel Stats';
    container.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'stat-grid';

    [
      { value: trips.length,      label: 'Total Trips' },
      { value: allCountries.size, label: 'Countries Visited' },
      { value: allCities.size,    label: 'Cities Visited' },
      { value: travelers.length,  label: 'Travelers' }
    ].forEach(({ value, label }) => {
      const card = document.createElement('div');
      card.className = 'stat-card';
      const v = document.createElement('div');
      v.className = 'stat-card-value';
      v.textContent = value;
      const l = document.createElement('div');
      l.className = 'stat-card-label';
      l.textContent = label;
      card.append(v, l);
      grid.appendChild(card);
    });
    container.appendChild(grid);

    const perPersonHeading = document.createElement('h3');
    perPersonHeading.textContent = 'Trips per person';
    perPersonHeading.style.marginBottom = '12px';
    container.appendChild(perPersonHeading);

    travelers.forEach(t => {
      const count = trips.filter(trip => trip.travelers.includes(t.id)).length;
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:8px;display:flex;align-items:center;gap:12px';

      const nameEl = document.createElement('span');
      nameEl.style.cssText = 'width:80px;font-size:0.85rem';
      nameEl.textContent = t.name;

      const barBg = document.createElement('div');
      barBg.style.cssText = 'flex:1;height:20px;background:var(--bg-secondary);border-radius:10px;overflow:hidden';
      const barFill = document.createElement('div');
      barFill.style.cssText = `height:100%;width:${(count / trips.length) * 100}%;background:${t.color || 'var(--accent)'};border-radius:10px;transition:0.3s`;
      barBg.appendChild(barFill);

      const countEl = document.createElement('span');
      countEl.style.cssText = 'font-size:0.82rem;color:var(--text-muted)';
      countEl.textContent = count;

      row.append(nameEl, barBg, countEl);
      container.appendChild(row);
    });
  }
});
