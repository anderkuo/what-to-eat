const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const MILES_TO_METERS = 1609.34;
const SEARCH_COOLDOWN_MS = 10000;

const statusEl = document.getElementById('restaurants-status');
const listEl = document.getElementById('restaurants-list');
const emptyEl = document.getElementById('restaurants-empty');
const radiusSlider = document.getElementById('radius-slider');
const radiusValueEl = document.getElementById('radius-value');
const searchBtn = document.getElementById('search-btn');

function setStatus(msg) {
  statusEl.textContent = msg;
}

function metersToText(m) {
  if (m == null) return '';
  const miles = m / MILES_TO_METERS;
  return miles < 0.1 ? Math.round(m) + ' m' : miles.toFixed(1) + ' mi';
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getSelectedTypes() {
  return Array.from(document.querySelectorAll('input[name="place-type"]:checked'))
    .map(el => el.value);
}

function buildQuery(lat, lng, radius, types) {
  const clauses = types.map(type =>
    `node["amenity"="${type}"](around:${radius},${lat},${lng});
     way["amenity"="${type}"](around:${radius},${lat},${lng});`
  ).join('\n');

  return `[out:json][timeout:25];
(
${clauses}
);
out center tags;`;
}

async function fetchRestaurants(lat, lng, radius, types) {
  const res = await fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, radius, types })
  });

  if (!res.ok) {
    throw new Error(`Places error ${res.status}`);
  }

  const data = await res.json();

  return (data.features || [])
    .map(f => {
      const props = f.properties;
      if (!props?.name) return null;
      return {
        name: props.name,
        amenity: props.categories?.find(c => c.startsWith('catering.'))?.split('.')[1],
        cuisine: props.catering?.cuisine,
        address: props.address_line2 || props.formatted,
        distance: props.distance
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);
}
function renderRestaurants(places) {
  listEl.innerHTML = '';

  if (!places.length) {
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;

  places.forEach(place => {
    const li = document.createElement('li');

    const name = document.createElement('strong');
    name.textContent = place.name;
    li.appendChild(name);

    const details = [
      place.amenity ? place.amenity.replace('_', ' ') : null,
      place.cuisine,
      place.address,
      metersToText(place.distance)
    ].filter(Boolean).join(' · ');

    if (details) {
      const meta = document.createElement('p');
      meta.textContent = details;
      li.appendChild(meta);
    }

    listEl.appendChild(li);
  });
}

function runSearch() {
  const types = getSelectedTypes();
  if (!types.length) {
    setStatus('Select at least one place type.');
    listEl.innerHTML = '';
    emptyEl.hidden = true;
    return;
  }

  if (!navigator.geolocation) {
    setStatus('Geolocation is not supported in this browser.');
    return;
  }

  setStatus('Getting your location…');
  searchBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      setStatus('Searching nearby…');
      const radiusMeters = Number(radiusSlider.value) * MILES_TO_METERS;

      try {
        const places = await fetchRestaurants(
          pos.coords.latitude,
          pos.coords.longitude,
          radiusMeters,
          types
        );
        setStatus(places.length ? `${places.length} found` : '');
        renderRestaurants(places);
      } catch (err) {
        console.error(err);
        setStatus('Could not load restaurants. Please try again.');
      }

      startCooldown();
    },
    (err) => {
      setStatus('Could not get your location: ' + err.message);
      startCooldown();
    }
  );
}
 
function startCooldown() {
  let secondsLeft = SEARCH_COOLDOWN_MS / 1000;
  searchBtn.textContent = `Wait ${secondsLeft}s`;
 
  const interval = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      clearInterval(interval);
      searchBtn.disabled = false;
      searchBtn.textContent = 'Search';
    } else {
      searchBtn.textContent = `Wait ${secondsLeft}s`;
    }
  }, 1000);
}

radiusSlider.addEventListener('input', () => {
  radiusValueEl.textContent = radiusSlider.value;
});

searchBtn.addEventListener('click', runSearch);