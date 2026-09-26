export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { city } = req.body;

  if (!city || typeof city !== 'string') {
    return res.status(400).json({ error: 'Missing city name' });
  }

  const url = new URL('https://api.geoapify.com/v1/geocode/search');
  url.searchParams.set('text', city);
  url.searchParams.set('limit', '1');
  url.searchParams.set('apiKey', process.env.GEOAPIFY_KEY);

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      const errText = await response.text();
      console.log('Geocode rejected with:', errText);
      throw new Error(`Geocode error ${response.status}`);
    }

    const data = await response.json();
    const result = data.features?.[0];

    if (!result) {
      return res.status(404).json({ error: 'City not found' });
    }

    const [lng, lat] = result.geometry.coordinates;
    res.status(200).json({ lat, lng, formatted: result.properties.formatted });
  } catch (err) {
    console.log('Caught error:', err.message);
    res.status(500).json({ error: err.message });
  }
}