document.addEventListener('DOMContentLoaded', async () => {
  const map = TravelMap.init();

  const data = await fetch('data/travels.json').then(r => r.json());
  const { travelers, trips } = data;

  initThemeToggle();
  initTabs();
  addTripsControl(map, travelers, trips);
  updateStats(trips);
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

  function addTripsControl(leafletMap, travelers, trips) {
    let activeFilters = new Set(travelers.map(t => t.id));
    const tripState = new Map();
    trips.forEach(t => tripState.set(t.key, true));

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

        const filters = L.DomUtil.create('div', 'panel-filters', body);
        travelers.forEach(t => {
          const chip = document.createElement('button');
          chip.className = 'traveler-chip active';
          chip.textContent = t.name;
          chip.addEventListener('click', () => {
            chip.classList.toggle('active');
            if (activeFilters.has(t.id)) {
              activeFilters.delete(t.id);
            } else {
              activeFilters.add(t.id);
            }
            applyFilters();
          });
          filters.appendChild(chip);
        });

        const list = L.DomUtil.create('div', 'trips-panel-list', body);

        trips.forEach(trip => {
          const btn = L.DomUtil.create('a', 'trip-toggle-btn active', list);
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
          btn.dataset.key = trip.key;

          L.DomEvent.on(btn, 'click', (e) => {
            L.DomEvent.preventDefault(e);
            const on = tripState.get(trip.key);
            tripState.set(trip.key, !on);
            btn.classList.toggle('active', !on);
            if (!on) {
              TravelMap.showTrip(trip.key);
            } else {
              TravelMap.hideTrip(trip.key);
            }
            updateStatsFromVisible();
          });
        });

        L.DomEvent.on(header, 'click', () => {
          container.classList.toggle('expanded');
        });

        return container;
      }
    });

    new Control().addTo(leafletMap);

    function applyFilters() {
      TravelMap.clearAll();
      const btns = document.querySelectorAll('.trip-toggle-btn');

      trips.forEach((trip, i) => {
        const matchesFilter = activeFilters.size > 0 &&
          trip.travelers.some(tid => activeFilters.has(tid));

        if (matchesFilter) {
          tripState.set(trip.key, true);
          TravelMap.renderTrip(trip);
          btns[i].classList.add('active');
          btns[i].style.display = '';
        } else {
          tripState.set(trip.key, false);
          btns[i].classList.remove('active');
          btns[i].style.display = 'none';
        }
      });

      TravelMap.fitAll();
      updateStatsFromVisible();
    }

    function updateStatsFromVisible() {
      const visible = trips.filter(t => tripState.get(t.key));
      updateStats(visible);
    }

    TravelMap.renderTrips(trips);
  }

  function getStopCount(trip) {
    if (trip.mode === 'pins') return trip.cities.length;
    if (trip.mode === 'hub-spoke') return trip.spokes.length + trip.spokes.filter(s => s.chain).reduce((a, s) => a + s.chain.length, 0);
    return trip.stops ? trip.stops.length : 0;
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
