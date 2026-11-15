const { Router } = require('express');
const sql = require('../../db');

const router = Router();

// GET /search/feed
// Loads the search and discovery feed
//
// Two modes depending on whether a query is provided:
//   no query → random discovery feed (ORDER BY RANDOM())
//              trending logic is out of scope for now, random is the placeholder
//   query    → filter across contribution title, caption text, media body_text,
//              and username — anything matching the search string
//
// Each feed item represents one media item, not a full contribution
// so a contribution can appear multiple times with different images
//
// Videos are excluded for now — only image_contribution rows are returned
// When video support is ready, add a UNION with video_contribution here
router.get('/feed', async (req, res, next) => {
  const { query } = req.query;

  // pagination defaults
  const page   = Math.max(parseInt(req.query.page,  10) || 1, 1);
  const limit  = Math.max(parseInt(req.query.limit, 10) || 20, 1);
  const offset = (page - 1) * limit;

  // fetch one extra item beyond the limit so we can tell the frontend
  // whether there are more pages without a separate count query
  const fetchLimit = limit + 1;

  let rows;

  if (!query || query.trim() === '') {
    // no query — return a random discovery feed
    // DISTINCT ON (c.id) ensures only the first image per contribution
    rows = await sql`
      SELECT DISTINCT ON (c.id)
        ic.id             AS media_id,
        ic.image_url,
        ic.thumbnail_url,
        'image'           AS media_type,
        c.id              AS contribution_id,
        c.title           AS contribution_title,
        u.id              AS user_id,
        u.user_name       AS username
      FROM contribution c
      LEFT JOIN image_contribution ic ON ic.contribution_id = c.id
      JOIN profile p      ON p.id = c.profile_id
      JOIN "user" u       ON u.id = p.user_id
      ORDER BY c.id, ic.id ASC
      LIMIT ${fetchLimit} OFFSET ${offset}
    `;
  } else {
    // query provided — search across title, text, body_text, and username
    // using ILIKE for case-insensitive matching
    // DISTINCT ON (c.id) ensures only the first image per contribution
    const searchTerm = `%${query.trim()}%`;

    rows = await sql`
      SELECT DISTINCT ON (c.id)
        ic.id             AS media_id,
        ic.image_url,
        ic.thumbnail_url,
        'image'           AS media_type,
        c.id              AS contribution_id,
        c.title           AS contribution_title,
        u.id              AS user_id,
        u.user_name       AS username
      FROM contribution c
      LEFT JOIN image_contribution ic ON ic.contribution_id = c.id
      JOIN profile p      ON p.id = c.profile_id
      JOIN "user" u       ON u.id = p.user_id
      WHERE
        c.title IS NOT NULL
        AND (
          c.title      ILIKE ${searchTerm} OR
          c.text       ILIKE ${searchTerm} OR
          ic.body_text ILIKE ${searchTerm} OR
          u.user_name  ILIKE ${searchTerm}
        )
      ORDER BY c.id, c.likes_count DESC, ic.id ASC
      LIMIT ${fetchLimit} OFFSET ${offset}
    `;
  }

  // if we got more than the requested limit, there are more pages
  const hasMore = rows.length > limit;
  const feedItems = hasMore ? rows.slice(0, limit) : rows;

  res.json({
    feedItems: feedItems.map((row) => ({
      contributionId:    row.contribution_id,
      mediaId:           row.media_id,
      mediaType:         row.media_type,
      imageUrl:          row.image_url,
      thumbnailUrl:      row.thumbnail_url,
      contributionTitle: row.contribution_title,
      author: {
        userId:   row.user_id,
        username: row.username,
      },
    })),
    hasMore,
  });
});

// GET /search/suggestions?query=...&limit=10
// Called on every keystroke in the search bar
// Returns matching contribution titles for the dropdown suggestions
router.get('/suggestions', async (req, res, next) => {
  const { query } = req.query
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 20)

  if (!query || query.trim() === '') {
    return res.json({ suggestions: [] })
  }

  const searchTerm = `%${query.trim()}%`

  const results = await sql`
    SELECT DISTINCT ON (c.id)
      c.id,
      c.title,
      ic.thumbnail_url
    FROM contribution c
    LEFT JOIN image_contribution ic ON ic.contribution_id = c.id
    WHERE
      c.title IS NOT NULL
      AND (
        c.title ILIKE ${searchTerm} OR
        c.text  ILIKE ${searchTerm}
      )
    ORDER BY c.id DESC
    LIMIT ${limit}
  `

  res.json({
    suggestions: results.map((r) => ({
      id:           r.id,
      title:        r.title,
      thumbnailUrl: r.thumbnail_url || null,
    }))
  })
})

module.exports = router;