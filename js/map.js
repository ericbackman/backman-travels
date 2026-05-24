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
    const layers = [];

    if (trip.mode === 'linear') {
      layers.push(...renderLinear(trip));
    } else if (trip.mode === 'hub-spoke') {
      layers.push(...renderHubSpoke(trip));
    } else if (trip.mode === 'pins') {
      layers.push(...renderPins(trip));
    }

    const group = L.layerGroup(layers).addTo(map);
    tripLayers[trip.key] = group;
    allLayers.push(group);
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
      marker.bindTooltip(stop.name, { direction: 'top', offset: [0, -12] });
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
          m.bindTooltip(city.name, { direction: 'top', offset: [0, -8] });
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
          direction: 'top', offset: [0, -8]
        });
        layers.push(m);
      }
    });

    return layers;
  }

  function renderPins(trip) {
    const layers = [];

    trip.cities.forEach(city => {
      const m = createCityMarker(city, trip.color);
      const tooltip = city.note ? `${city.name} — ${city.note}` : city.name;
      m.bindTooltip(tooltip, { direction: 'top', offset: [0, -8] });
      m.bindPopup(`<div class="popup-title">${city.name}</div>${city.note ? `<div class="popup-meta">${city.note}</div>` : ''}`);
      layers.push(m);
    });

    return layers;
  }

  function createStopMarker(stop, color) {
    const bgColor = getStopColor(stop.type, color);
    const icon = L.divIcon({
      className: '',
      html: `<div class="stop-marker" style="background:${bgColor}">${stop.num || ''}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    return L.marker([stop.lat, stop.lng], { icon });
  }

  function createCityMarker(city, color) {
    const icon = L.divIcon({
      className: '',
      html: `<div class="city-marker" style="background:${color}"></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5]
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

  function showTrip(key) {
    if (tripLayers[key]) {
      tripLayers[key].addTo(map);
    }
  }

  function hideTrip(key) {
    if (tripLayers[key]) {
      map.removeLayer(tripLayers[key]);
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
      group.eachLayer(layer => {
        if (layer.getLatLng) allCoords.push(layer.getLatLng());
      });
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

  return { init, switchTheme, renderTrips, renderTrip, showTrip, hideTrip, flyToTrip, fitAll, clearAll };
})();
