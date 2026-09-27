export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { lat, lng } = req.body ?? {};

  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Missing lat or lng' });
  }

  const url = new URL('https://api.geoapify.com/v1/geocode/reverse');
  url.searchParams.set('lat', lat);
  url.searchParams.set('lon', lng);
  url.searchParams.set('apiKey', process.env.GEOAPIFY_KEY);

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      const errText = await response.text();
      console.log('Reverse geocode rejected with:', errText);
      throw new Error(`Reverse geocode error ${response.status}`);
    }

    const data = await response.json();
    const result = data.features?.[0];

    if (!result) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const props = result.properties;
    // Prefer a city name; fall back to broader areas so the box is never left blank.
    const city = props.city || props.county || props.state || props.formatted;
    res.status(200).json({ city, formatted: props.formatted });
  } catch (err) {
    console.log('Caught error:', err.message);
    res.status(500).json({ error: err.message });
  }
}