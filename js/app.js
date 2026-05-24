document.addEventListener('DOMContentLoaded', async () => {
  const map = TravelMap.init();

  const data = await fetch('data/travels.json').then(r => r.json());
  const { travelers, trips } = data;

  const familyTrips = trips.filter(t => t.travelers.includes('family'));
  const ericTrips = trips.filter(t => t.travelers.includes('eric') && !t.travelers.includes('family'));

  initThemeToggle();
  initTabs();
  addTripsControl(map, familyTrips, ericTrips);
  updateStats(familyTrips);
  renderTripsPage(trips);
  renderStatsPage(travelers, trips);

  function initThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    const saved = localStorage.getItem('backman-theme') || 'dark';
    setTheme(saved);

    btn.addEventListener('click', () => {
      const current = document.body.dataset.theme;
      const next = current === 'dark' ? 'warm' : 'dark';
      setTheme(next);
      localStorage.setItem('backman-theme', next);
    });
  }

  function setTheme(theme) {
    document.body.dataset.theme = theme;
    document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
    TravelMap.switchTheme(theme);
  }

  function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const pages = document.querySelectorAll('.page');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        pages.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`page-${tab.dataset.tab}`).classList.add('active');
        if (tab.dataset.tab === 'map') {
          map.invalidateSize();
        }
      });
    });
  }

  function addTripsControl(leafletMap, familyTrips, ericTrips) {
    const tripState = new Map();
    familyTrips.forEach(t => tripState.set(t.key, true));
    ericTrips.forEach(t => tripState.set(t.key, false));

    const Control = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        const container = L.DomUtil.create('div', 'leaflet-bar trips-panel expanded');
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        const header = L.DomUtil.create('div', 'trips-panel-header', container);
        const label = document.createElement('span');
        label.className = 'trips-panel-header-label';
        label.textContent = '🗺️ Trips';
        const chevron = document.createElement('span');
        chevron.className = 'trips-panel-chevron';
        chevron.textContent = '▾';
        header.append(label, chevron);

        const body = L.DomUtil.create('div', 'trips-panel-body', container);

        // ── Family Trips section ─────────────────────
        const familySection = L.DomUtil.create('div', 'panel-section', body);

        const familyHeader = L.DomUtil.create('div', 'section-toggle', familySection);
        const familyIcon = document.createElement('span');
        familyIcon.className = 'section-icon';
        familyIcon.textContent = '👨‍👩‍👧‍👦';
        const familyLabel = document.createElement('span');
        familyLabel.className = 'section-label';
        familyLabel.textContent = 'Family Trips';
        const familySwitch = document.createElement('div');
        familySwitch.className = 'toggle-switch on';
        familyHeader.append(familyIcon, familyLabel, familySwitch);

        let familyVisible = true;

        L.DomEvent.on(familyHeader, 'click', (e) => {
          L.DomEvent.preventDefault(e);
          familyVisible = !familyVisible;
          familySwitch.classList.toggle('on', familyVisible);
          familyTrips.forEach(trip => {
            tripState.set(trip.key, familyVisible);
            if (familyVisible) {
              TravelMap.renderTrip(trip);
            } else {
              TravelMap.hideTrip(trip.key);
            }
          });
          recalcStats();
        });

        // ── Eric's Trips section ─────────────────────
        const ericSection = L.DomUtil.create('div', 'panel-section', body);

        const ericHeader = L.DomUtil.create('div', 'section-toggle', ericSection);
        const ericIcon = document.createElement('span');
        ericIcon.className = 'section-icon';
        ericIcon.textContent = '🗺️';
        const ericLabel = document.createElement('span');
        ericLabel.className = 'section-label';
        ericLabel.textContent = "Eric's Trips";
        const ericChevron = document.createElement('span');
        ericChevron.className = 'section-chevron';
        ericChevron.textContent = '▸';
        ericHeader.append(ericIcon, ericLabel, ericChevron);

        const ericList = L.DomUtil.create('div', 'section-list collapsed', ericSection);

        ericTrips.forEach(trip => {
          const btn = document.createElement('a');
          btn.className = 'trip-toggle-btn';
          btn.href = '#';

          const icon = document.createElement('span');
          icon.className = 'trip-toggle-icon';
          icon.textContent = trip.icon;

          const name = document.createElement('span');
          name.className = 'trip-toggle-name';
          name.textContent = trip.name;

          const year = document.createElement('span');
          year.className = 'trip-toggle-year';
          year.textContent = trip.year;

          btn.append(icon, name, year);

          L.DomEvent.on(btn, 'click', (e) => {
            L.DomEvent.preventDefault(e);
            const on = tripState.get(trip.key);
            tripState.set(trip.key, !on);
            btn.classList.toggle('active', !on);
            if (!on) {
              TravelMap.renderTrip(trip);
            } else {
              TravelMap.hideTrip(trip.key);
            }
            recalcStats();
          });

          ericList.appendChild(btn);
        });

        L.DomEvent.on(ericHeader, 'click', () => {
          ericList.classList.toggle('collapsed');
          ericChevron.textContent = ericList.classList.contains('collapsed') ? '▸' : '▾';
        });

        // ── Main panel collapse ──────────────────────
        L.DomEvent.on(header, 'click', () => {
          container.classList.toggle('expanded');
        });

        return container;
      }
    });

    new Control().addTo(leafletMap);

    familyTrips.forEach(trip => TravelMap.renderTrip(trip));
    TravelMap.fitAll();

    function recalcStats() {
      const allTrips = [...familyTrips, ...ericTrips];
      const visible = allTrips.filter(t => tripState.get(t.key));
      updateStats(visible);
    }
  }

  function updateStats(visibleTrips) {
    const countries = new Set();
    const cities = new Set();

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

    document.getElementById('stat-trips').querySelector('strong').textContent = visibleTrips.length;
    document.getElementById('stat-countries').querySelector('strong').textContent = countries.size;
    document.getElementById('stat-cities').querySelector('strong').textContent = cities.size;
  }

  function renderTripsPage(trips) {
    const container = document.getElementById('trips-container');
    const heading = document.createElement('h2');
    heading.textContent = 'All Trips';
    container.replaceChildren(heading);

    trips.forEach(trip => {
      const el = document.createElement('div');
      el.className = 'trip-detail';

      const stops = trip.mode === 'pins'
        ? trip.cities.map(c => c.name)
        : trip.mode === 'hub-spoke'
          ? [trip.hub.name, ...trip.spokes.map(s => s.chain ? s.chain.map(c => c.name).join(' → ') : s.name)]
          : (trip.stops || []).map(s => s.name);

      const header = document.createElement('div');
      header.className = 'trip-detail-header';

      const iconEl = document.createElement('span');
      iconEl.className = 'trip-detail-icon';
      iconEl.textContent = trip.icon;

      const info = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'trip-detail-title';
      title.textContent = trip.name;
      const subtitle = document.createElement('div');
      subtitle.className = 'trip-detail-subtitle';
      subtitle.textContent = `${trip.year} · ${stops.length} stops`;
      info.append(title, subtitle);
      header.append(iconEl, info);

      const stopsEl = document.createElement('div');
      stopsEl.className = 'trip-stops';
      stops.forEach(s => {
        const span = document.createElement('span');
        span.className = 'trip-stop';
        span.textContent = s;
        stopsEl.appendChild(span);
      });

      el.append(header, stopsEl);
      container.appendChild(el);
    });
  }

  function renderStatsPage(travelers, trips) {
    const container = document.getElementById('stats-container');
    container.replaceChildren();

    const allCountries = new Set();
    const allCities = new Set();
    trips.forEach(trip => {
      if (trip.countries) trip.countries.forEach(c => allCountries.add(c));
      if (trip.mode === 'pins') trip.cities.forEach(c => allCities.add(c.name));
      else if (trip.stops) trip.stops.forEach(s => allCities.add(s.name));
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
      { value: trips.length, label: 'Total Trips' },
      { value: allCountries.size, label: 'Countries Visited' },
      { value: allCities.size, label: 'Cities Visited' },
      { value: travelers.length, label: 'Travelers' }
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
      barFill.style.cssText = `height:100%;width:${(count/trips.length)*100}%;background:${t.color || 'var(--accent)'};border-radius:10px;transition:0.3s`;
      barBg.appendChild(barFill);

      const countEl = document.createElement('span');
      countEl.style.cssText = 'font-size:0.82rem;color:var(--text-muted)';
      countEl.textContent = count;

      row.append(nameEl, barBg, countEl);
      container.appendChild(row);
    });
  }
});
