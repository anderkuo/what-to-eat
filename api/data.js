export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { lat, lng, radius, types } = req.body;

  if (!lat || !lng || !radius || !types?.length) {
    return res.status(400).json({ error: 'Missing lat, lng, radius, or types' });
  }

  const categoryMap = {
    restaurant: 'catering.restaurant',
    fast_food: 'catering.fast_food',
    cafe: 'catering.cafe',
  };
  const categories = types.map(t => categoryMap[t]).filter(Boolean).join(',');

  const url = new URL('https://api.geoapify.com/v2/places');
  url.searchParams.set('categories', categories);
  url.searchParams.set('filter', `circle:${lng},${lat},${radius}`);
  url.searchParams.set('bias', `proximity:${lng},${lat}`);
  url.searchParams.set('limit', '100');
  url.searchParams.set('apiKey', process.env.GEOAPIFY_KEY);

  try {
    console.log('Using key:', process.env.GEOAPIFY_KEY ? 'Key found (length ' + process.env.GEOAPIFY_KEY.length + ')' : 'KEY MISSING');
    const response = await fetch(url.toString());

    if (!response.ok) {
      const errText = await response.text();
      console.log('Geoapify rejected with:', errText);
      throw new Error(`Geoapify error ${response.status}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    console.log('Caught error:', err.message);
    res.status(500).json({ error: err.message });
  }
}