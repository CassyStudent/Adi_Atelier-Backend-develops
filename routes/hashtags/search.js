const { Router } = require('express');
const sql = require('../../db');

const router = Router();

// GET /hashtags/search?q=query
// Called on every keystroke in the hashtag search input
//
// Two modes:
//   no query → return most used hashtags ordered by posts_count descending
//              acts as a "trending" list until a proper trending system is built
//   q provided → filter hashtags where text matches the search string
//
// Selected hashtags are stored locally on the client until saved via
// PATCH /contributions/:contributionId/editor — nothing is written to DB here
router.get('/search', async (req, res, next) => {
  const { q } = req.query;

  // reasonable limit — enough to fill the screen without over-fetching
  const limit = 20;

  let hashtags;

  if (!q || q.trim() === '') {
    // no query — return most used hashtags as the default trending list
    hashtags = await sql`
      SELECT id, text, posts_count
      FROM hashtag
      ORDER BY posts_count DESC
      LIMIT ${limit}
    `;
  } else {
    // search by text — ILIKE for case-insensitive matching
    // searching with # prefix and without so both "stripe" and "#stripe" work
    const searchTerm = `%${q.trim()}%`;

    hashtags = await sql`
      SELECT id, text, posts_count
      FROM hashtag
      WHERE text ILIKE ${searchTerm}
      ORDER BY posts_count DESC
      LIMIT ${limit}
    `;
  }

  res.json({
    hashtags: hashtags.map((h) => ({
      hashtagId:   h.id,
      hashtagText: h.text,
      postsCount:  h.posts_count,
    })),
  });
});

module.exports = router;