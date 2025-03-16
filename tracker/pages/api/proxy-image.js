import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    console.error('No URL provided in proxy-image request');
    return res.status(400).json({ error: 'Image URL is required' });
  }

  try {
    console.log(`Proxying image from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch image: ${response.statusText}`);
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const buffer = await response.buffer();
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(buffer);
  } catch (error) {
    console.error(`Error proxying image ${url}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch image', details: error.message });
  }
}