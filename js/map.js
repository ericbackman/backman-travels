const TravelMap = (() => {
  let map;
  let tripLayers = {};
  let allLayers = [];

  const TILES = {
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
    },
    warm: {
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
    }
  };

  let currentTileLayer;

  function init() {
    map = L.map('map', {
      center: [30, 0],
      zoom: 2,
      zoomControl: true,
      maxBoundsViscosity: 1.0
    });

    const theme = document.body.dataset.theme || 'dark';
    currentTileLayer = L.tileLayer(TILES[theme].url, {
      attribution: TILES[theme].attribution,
      maxZoom: 18
    }).addTo(map);

    return map;
  }

  function switchTheme(theme) {
    if (currentTileLayer) {
      map.removeLayer(currentTileLayer);
    }
    const tileKey = theme === 'warm' ? 'warm' : 'dark';
    currentTileLayer = L.tileLayer(TILES[tileKey].url, {
      attribution: TILES[tileKey].attribution,
      maxZoom: 18
    }).addTo(map);
  }

  function renderTrips(trips) {
    clearAll();
    trips.forEach(trip => renderTrip(trip));
    fitAll();
  }

  function renderTrip(trip) {
    if (tripLayers[trip.key]) return; // already on map, skip duplicate render
    if (trip.mode === 'linear') {
      const layers = renderLinear(trip);
      const group = L.layerGroup(layers).addTo(map);
      tripLayers[trip.key] = group;
      allLayers.push(group);
    } else if (trip.mode === 'hub-spoke') {
      const layers = renderHubSpoke(trip);
      const group = L.layerGroup(layers).addTo(map);
      tripLayers[trip.key] = group;
      allLayers.push(group);
    } else if (trip.mode === 'pins') {
      const group = renderPinsClustered(trip);
      group.addTo(map);
      tripLayers[trip.key] = group;
      allLayers.push(group);
    }
  }

  function renderLinear(trip) {
    const layers = [];
    const coords = trip.stops.map(s => [s.lat, s.lng]);

    const antPath = L.polyline.antPath(coords, {
      color: trip.pathColor || trip.color,
      weight: 3,
      opacity: 0.8,
      pulseColor: trip.color,
      delay: 2000,
      dashArray: [12, 20]
    });
    layers.push(antPath);

    trip.stops.forEach(stop => {
      const marker = createStopMarker(stop, trip.color);
      marker.bindTooltip(stop.name, { direction: 'top', offset: [0, -36] });
      marker.bindPopup(buildPopup(stop, trip));
      layers.push(marker);
    });

    return layers;
  }

  function renderHubSpoke(trip) {
    const layers = [];
    const hub = trip.hub;

    const hubIcon = L.divIcon({
      className: 'hub-marker',
      html: hub.emoji || trip.icon,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    const hubMarker = L.marker([hub.lat, hub.lng], { icon: hubIcon });
    hubMarker.bindTooltip(hub.name, { direction: 'top', offset: [0, -16] });
    layers.push(hubMarker);

    trip.spokes.forEach(spoke => {
      if (spoke.chain) {
        const chainCoords = [[hub.lat, hub.lng], ...spoke.chain.map(c => [c.lat, c.lng])];
        const path = L.polyline.antPath(chainCoords, {
          color: trip.pathColor || trip.color,
          weight: 2,
          opacity: 0.6,
          delay: 3000,
          dashArray: [8, 16]
        });
        layers.push(path);

        spoke.chain.forEach(city => {
          const m = createCityMarker(city, trip.color);
          m.bindTooltip(city.name, { direction: 'top', offset: [0, -20] });
          layers.push(m);
        });
      } else {
        const line = L.polyline([[hub.lat, hub.lng], [spoke.lat, spoke.lng]], {
          color: trip.color,
          weight: 1.5,
          opacity: 0.4,
          dashArray: '6, 8'
        });
        layers.push(line);

        const m = createCityMarker(spoke, trip.color);
        m.bindTooltip(`${spoke.name}${spoke.note ? ' — ' + spoke.note : ''}`, {
          direction: 'top', offset: [0, -20]
        });
        layers.push(m);
      }
    });

    return layers;
  }

  function renderPinsClustered(trip) {
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 40,
      iconCreateFunction: (c) => {
        const count = c.getChildCount();
        return L.divIcon({
          className: '',
          html: `<div class="cluster-marker" style="background:${trip.color}">${count}</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18]
        });
      },
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false
    });

    trip.cities.forEach(city => {
      const m = createFamilyPinMarker(city, trip.color);
      const tooltip = city.note ? `${city.name} — ${city.note}` : city.name;
      m.bindTooltip(tooltip, { direction: 'top', offset: [0, -28] });
      m.bindPopup(buildCityPopup(city, trip));
      cluster.addLayer(m);
    });

    return cluster;
  }

  function createFamilyPinMarker(city, color) {
    const icon = L.divIcon({
      className: 'map-tack',
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="28" viewBox="0 0 18 28">
        <ellipse cx="9.5" cy="8.5" rx="8" ry="6.5" fill="rgba(0,0,0,0.22)"/>
        <ellipse cx="9" cy="8" rx="8" ry="6.5" fill="${color}" stroke="rgba(255,255,255,0.82)" stroke-width="1.5"/>
        <ellipse cx="6.5" cy="5.5" rx="2.5" ry="1.8" fill="rgba(255,255,255,0.38)"/>
        <polygon points="9,17 7.5,14.5 10.5,14.5" fill="rgba(0,0,0,0.52)"/>
        <line x1="9" y1="16.5" x2="9" y2="27.5" stroke="rgba(0,0,0,0.65)" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`,
      iconSize: [18, 28],
      iconAnchor: [9, 28]
    });
    return L.marker([city.lat, city.lng], { icon });
  }

  function createStopMarker(stop, color) {
    const bgColor = getStopColor(stop.type, color);
    const icon = L.divIcon({
      className: 'map-tack',
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="36" viewBox="0 0 26 36">
        <ellipse cx="13.5" cy="11.5" rx="11" ry="8.5" fill="rgba(0,0,0,0.22)"/>
        <ellipse cx="13" cy="11" rx="11" ry="8.5" fill="${bgColor}" stroke="rgba(255,255,255,0.82)" stroke-width="1.5"/>
        <text x="13" y="11" text-anchor="middle" dominant-baseline="central" fill="white" font-size="9" font-weight="700" font-family="DM Sans,sans-serif">${stop.num || ''}</text>
        <polygon points="13,24 11,19.5 15,19.5" fill="rgba(0,0,0,0.52)"/>
        <line x1="13" y1="23" x2="13" y2="35" stroke="rgba(0,0,0,0.65)" stroke-width="1.8" stroke-linecap="round"/>
      </svg>`,
      iconSize: [26, 36],
      iconAnchor: [13, 36]
    });
    return L.marker([stop.lat, stop.lng], { icon });
  }

  function createCityMarker(city, color) {
    const icon = L.divIcon({
      className: 'map-tack',
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="20" viewBox="0 0 14 20">
        <ellipse cx="7.5" cy="6.5" rx="5.5" ry="4" fill="rgba(0,0,0,0.22)"/>
        <ellipse cx="7" cy="6" rx="5.5" ry="4" fill="${color}" stroke="rgba(255,255,255,0.75)" stroke-width="1.2"/>
        <ellipse cx="5.5" cy="4.5" rx="1.8" ry="1.2" fill="rgba(255,255,255,0.38)"/>
        <line x1="7" y1="10" x2="7" y2="19" stroke="rgba(0,0,0,0.6)" stroke-width="1.2" stroke-linecap="round"/>
      </svg>`,
      iconSize: [14, 20],
      iconAnchor: [7, 20]
    });
    return L.marker([city.lat, city.lng], { icon });
  }

  function getStopColor(type, fallback) {
    const colors = {
      home: '#ef5350',
      hub: '#ffa726',
      dive: '#26c6da',
      transit: '#78909c',
      stop: fallback
    };
    return colors[type] || fallback;
  }

  function buildPopup(stop, trip) {
    return `
      <div class="popup-title">${stop.name}</div>
      <div class="popup-meta">${trip.icon} ${trip.name} (${trip.year})</div>
      ${stop.note ? `<div class="popup-meta" style="margin-top:4px">${stop.note}</div>` : ''}
    `;
  }

  function buildCityPopup(city, trip) {
    return `
      <div class="popup-title">${city.name}</div>
      ${city.note ? `<div class="popup-meta">${city.note}</div>` : ''}
      <div class="popup-meta">${trip.icon} ${trip.name}</div>
    `;
  }

  function renderMemberPins(memberId, color, cities) {
    const key = `member-${memberId}`;
    if (tripLayers[key]) return;

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 40,
      iconCreateFunction: (c) => {
        const count = c.getChildCount();
        return L.divIcon({
          className: '',
          html: `<div class="cluster-marker" style="background:${color}">${count}</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18]
        });
      },
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false
    });

    cities.forEach(city => {
      const m = createFamilyPinMarker(city, color);
      m.bindTooltip(city.name, { direction: 'top', offset: [0, -28] });
      cluster.addLayer(m);
    });

    cluster.addTo(map);
    tripLayers[key] = cluster;
    allLayers.push(cluster);
  }

  function hideMemberPins(memberId) {
    const key = `member-${memberId}`;
    if (tripLayers[key]) {
      map.removeLayer(tripLayers[key]);
      delete tripLayers[key];
    }
  }

  function showTrip(key) {
    if (tripLayers[key]) {
      tripLayers[key].addTo(map);
    }
  }

  function hideTrip(key) {
    if (tripLayers[key]) {
      map.removeLayer(tripLayers[key]);
      delete tripLayers[key]; // clear reference so renderTrip can re-add it
    }
  }

  function flyToTrip(trip) {
    if (trip.mode === 'hub-spoke' && trip.hub) {
      map.flyTo([trip.hub.lat, trip.hub.lng], 5, { duration: 1 });
    } else if (trip.mode === 'pins' && trip.cities.length) {
      const bounds = L.latLngBounds(trip.cities.map(c => [c.lat, c.lng]));
      map.flyToBounds(bounds, { padding: [50, 50], duration: 1 });
    } else if (trip.stops && trip.stops.length) {
      const bounds = L.latLngBounds(trip.stops.map(s => [s.lat, s.lng]));
      map.flyToBounds(bounds, { padding: [50, 50], duration: 1 });
    }
  }

  function fitAll() {
    const allCoords = [];
    Object.values(tripLayers).forEach(group => {
      if (group.getLayers) {
        group.getLayers().forEach(layer => {
          if (layer.getLatLng) allCoords.push(layer.getLatLng());
        });
      }
      if (group.eachLayer) {
        group.eachLayer(layer => {
          if (layer.getLatLng) allCoords.push(layer.getLatLng());
        });
      }
    });
    if (allCoords.length) {
      map.fitBounds(L.latLngBounds(allCoords), { padding: [40, 40] });
    }
  }

  function clearAll() {
    Object.values(tripLayers).forEach(group => map.removeLayer(group));
    tripLayers = {};
    allLayers = [];
  }

  return { init, switchTheme, renderTrips, renderTrip, showTrip, hideTrip, renderMemberPins, hideMemberPins, flyToTrip, fitAll, clearAll };
})();
