const MILES_TO_METERS = 1609.34;
const SEARCH_COOLDOWN_MS = 10000;
const VOLUME_KEY = 'whatToEat.volume';

const statusEl = document.getElementById('restaurants-status');
const listEl = document.getElementById('restaurants-list');
const emptyEl = document.getElementById('restaurants-empty');
const radiusSlider = document.getElementById('radius-slider');
const radiusValueEl = document.getElementById('radius-value');
const radiusUnitEl = document.getElementById('radius-unit');
const searchBtn = document.getElementById('search-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsDialog = document.getElementById('settings-dialog');
const settingsClose = document.getElementById('settings-close');
const volumeSlider = document.getElementById('volume-slider');
const volumeValueEl = document.getElementById('volume-value');

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

function formatLabel(str) {
  if (!str) return '';
  return str
    .replace(/_/g, ' ')
    .split(/[;,]/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(', ');
}

function renderRestaurants(places, options = {}) {
  const { hideDistance = false } = options;

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
      place.amenity ? formatLabel(place.amenity) : null,
      place.cuisine ? formatLabel(place.cuisine) : null,
      place.address,
      hideDistance ? null : metersToText(place.distance)
    ].filter(Boolean).join(' · ');

    if (details) {
      const meta = document.createElement('p');
      meta.textContent = details;
      li.appendChild(meta);
    }

    listEl.appendChild(li);
  });
}

let currentResults = [];
let userCoords = null;
const locationInput = document.getElementById('location-input');
const useMyLocationBtn = document.getElementById('use-my-location-btn');

async function geocodeCity(city) {
  const res = await fetch('/api/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Geocode error ${res.status}`);
  }

  return res.json();
}

function runSearch() {
  const types = getSelectedTypes();
  if (!types.length) {
    setStatus('Select at least one place type.');
    listEl.innerHTML = '';
    emptyEl.hidden = true;
    return;
  }

  const cityValue = locationInput.value.trim();
  searchBtn.disabled = true;
  useMyLocationBtn.disabled = true;
  randomizeBtn.disabled = true;

  if (cityValue) {
    searchByCity(cityValue, types);
  } else if (userCoords) {
    searchByCoords(userCoords.lat, userCoords.lng, types);
  } else {
    setStatus('Enter a city or use your location first.');
    searchBtn.disabled = false;
    useMyLocationBtn.disabled = false;
    return;
  }
}

async function searchByCoords(lat, lng, types, options = {}) {
  setStatus('Searching nearby…');
  const radiusMeters = Number(radiusSlider.value) * MILES_TO_METERS;

  try {
    const places = await fetchRestaurants(lat, lng, radiusMeters, types);
    currentResults = places;
    updateRandomizeBtnState();
    setStatus(places.length ? `${places.length} found` : '');
    renderRestaurants(places, options);
  } catch (err) {
    console.error(err);
    setStatus('Could not load restaurants. Please try again.');
  }

  startCooldown();
}

async function searchByCity(city, types) {
  setStatus('Looking up city…');

  try {
    const { lat, lng } = await geocodeCity(city);
    await searchByCoords(lat, lng, types, { hideDistance: true });
    userCoords = null;
    useMyLocationBtn.disabled = false;
    useMyLocationBtn.textContent = 'Use my location';
  } catch (err) {
    console.error(err);
    setStatus(err.message === 'City not found' ? 'City not found. Try another search.' : 'Could not load restaurants. Please try again.');
    startCooldown();
  }
}

useMyLocationBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    setStatus('Geolocation is not supported in this browser.');
    return;
  }

  useMyLocationBtn.disabled = true;
  useMyLocationBtn.textContent = 'Getting location…';
  randomizeBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      locationInput.value = '';
      useMyLocationBtn.textContent = 'Location used';
      updateRandomizeBtnState();
    },
    (err) => {
      setStatus('Could not get your location: ' + err.message);
      useMyLocationBtn.disabled = false;
      useMyLocationBtn.textContent = 'Use my location';
      updateRandomizeBtnState();
    }
  );
});
const randomizeBtn = document.getElementById('randomize-btn');

function pickRandom() {
  if (!currentResults.length) {
    setStatus('Search first, then I can pick one for you.');
    return;
  }

  const choice = currentResults[Math.floor(Math.random() * currentResults.length)];
  highlightPick(choice);
}

function highlightPick(place) {
  listEl.querySelectorAll('li').forEach(li => li.classList.remove('picked'));

  const items = Array.from(listEl.querySelectorAll('li'));
  const match = items.find(li => li.querySelector('strong')?.textContent === place.name);

  if (match) {
    match.classList.add('picked');
    match.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  setStatus(`Today's pick: ${place.name}`);
}

randomizeBtn.addEventListener('click', pickRandom);

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


/* Settings menu */

function loadVolume() {
  try {
    const saved = localStorage.getItem(VOLUME_KEY);
    if (saved !== null) return Math.min(100, Math.max(0, Number(saved) || 0));
  } catch {
    // Storage can be blocked; fall back to the default.
  }
  return 50;
}

// Rounds to the nearest step and keeps the result inside [min, max]. Does
// not handle invalid input - the caller checks for that first.
function clampToStep(value, min, max, step) {
  const snapped = Math.round((value - min) / step) * step + min;
  return Math.min(max, Math.max(min, snapped));
}

// Keeps a <input type="range"> and a <input type="number"> showing the same
// value. Dragging the slider updates the number box immediately. Typing in
// the number box is left alone until the user commits it (blur or Enter).
// A committed value that's a real number gets clamped to min/max/step; an
// empty box or something unparseable falls back to the last valid value
// instead of snapping to the minimum.
function linkSliderAndNumber(slider, numberInput, onChange) {
  const min = Number(slider.min);
  const max = Number(slider.max);
  const step = Number(slider.step) || 1;
  let lastValid = Number(slider.value);

  function setValue(v) {
    lastValid = v;
    slider.value = v;
    numberInput.value = v;
    if (onChange) onChange(v);
  }

  slider.addEventListener('input', () => setValue(Number(slider.value)));

  function commit() {
    const typed = numberInput.value.trim();
    const parsed = Number(typed);
    const value = typed === '' || Number.isNaN(parsed)
      ? lastValid
      : clampToStep(parsed, min, max, step);
    setValue(value);
  }

  numberInput.addEventListener('change', commit);
  numberInput.addEventListener('blur', commit);
  numberInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') numberInput.blur();
  });
}

function updateRadiusUnit(v) {
  radiusUnitEl.textContent = v === 1 ? 'mile' : 'miles';
}

linkSliderAndNumber(radiusSlider, radiusValueEl, updateRadiusUnit);

radiusSlider.value = radiusValueEl.value;
updateRadiusUnit(Number(radiusSlider.value));

linkSliderAndNumber(volumeSlider, volumeValueEl, (v) => {
  try {
    localStorage.setItem(VOLUME_KEY, v);
  } catch {
    // Not saving is fine; the slider still works for this visit.
  }
});

volumeSlider.value = loadVolume();
volumeValueEl.value = volumeSlider.value;

settingsBtn.addEventListener('click', () => settingsDialog.showModal());
settingsClose.addEventListener('click', () => settingsDialog.close());

// A click on the dimmed area outside the box lands on the <dialog> itself
settingsDialog.addEventListener('click', (e) => {
  if (e.target === settingsDialog) settingsDialog.close();
});

// Stop wheel and touch scrolling behind the open menu. The scrollbar itself stays
// in place, so the page doesn't shift when the menu opens.
function blockScrollWhileOpen(e) {
  if (settingsDialog.open && !e.target.closest('.settings-box')) e.preventDefault();
}
document.addEventListener('wheel', blockScrollWhileOpen, { passive: false });
document.addEventListener('touchmove', blockScrollWhileOpen, { passive: false });

radiusSlider.addEventListener('input', () => {
  radiusValueEl.textContent = radiusSlider.value;
});

searchBtn.addEventListener('click', runSearch);

function updateRandomizeBtnState() {
  randomizeBtn.disabled = currentResults.length === 0;
}

updateRandomizeBtnState();
