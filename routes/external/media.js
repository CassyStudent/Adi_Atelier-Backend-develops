const { Router } = require('express');

const router = Router();

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

// middleware to check Unsplash key is set before hitting those endpoints
function ensureUnsplashKey(req, res, next) {
  if (!UNSPLASH_ACCESS_KEY) {
    return res.status(500).json({
      error: 'UNSPLASH_ACCESS_KEY is not configured on the backend'
    });
  }
  next();
}

// GET /api/songs?search=TERM
// Searches iTunes for songs matching the search term
router.get('/songs', async (req, res, next) => {
  try {
    const searchTerm = req.query.search || 'popular';

    console.log(`Fetching songs for: ${searchTerm}`);

    const response = await fetch(
      `https://itunes.apple.com/search?term=${searchTerm}&media=music&entity=song&limit=12`
    );

    if (!response.ok) {
      throw new Error('iTunes API error');
    }

    const data = await response.json();

    const songs = data.results.map((song, index) => ({
      id: song.trackId || index,
      title: song.trackName || 'Unknown',
      artists: song.artistName || 'Unknown Artist',
      albumCover: song.artworkUrl100 || ''
    }));

    res.json(songs);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch songs' });
  }
});

// GET /api/photos?query=portrait&page=1&perPage=20
// Searches Unsplash for photos matching the query
router.get('/photos', ensureUnsplashKey, async (req, res, next) => {
  try {
    const query = (req.query.query || 'portrait').toString();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const perPage = Math.min(Math.max(parseInt(req.query.perPage, 10) || 20, 1), 30);

    const unsplashUrl = new URL('https://api.unsplash.com/search/photos');
    unsplashUrl.searchParams.set('query', query);
    unsplashUrl.searchParams.set('page', page.toString());
    unsplashUrl.searchParams.set('per_page', perPage.toString());
    unsplashUrl.searchParams.set('orientation', 'portrait');

    const response = await fetch(unsplashUrl, {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Unsplash API error:', response.status, text);
      return res.status(response.status).json({ error: 'Unsplash API error' });
    }

    const data = await response.json();

    const photos = (data.results || []).map((photo) => ({
      id: photo.id,
      description: photo.description || photo.alt_description || '',
      thumb: photo.urls?.small || '',
      regular: photo.urls?.regular || '',
      full: photo.urls?.full || '',
      photographer: photo.user?.name || 'Unknown',
      sourceLink: photo.links?.html || ''
    }));

    res.json({
      total: data.total || 0,
      page,
      perPage,
      photos
    });
  } catch (error) {
    console.error('Error fetching Unsplash photos:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

module.exports = router;