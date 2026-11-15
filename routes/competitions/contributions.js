const { Router } = require('express');
const sql = require('../../db');

const router = Router({ mergeParams: true });

// GET /competitions/:competitionId/contributions
// Loads the contributions tab on the competition page
// Returns all contributions entered into this competition with author info,
// preview data, and engagement state for the requesting user
router.get('/', async (req, res, next) => {
  const { competitionId } = req.params;
  const { requestingUserId } = req.query;

  if (!requestingUserId) {
    return res.status(400).json({ error: 'requestingUserId query param is required.' });
  }

  // pagination defaults
  const page   = Math.max(parseInt(req.query.page,  10) || 1, 1);
  const limit  = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const offset = (page - 1) * limit;

  // make sure the competition exists
  const [competition] = await sql`
    SELECT id FROM competition WHERE id = ${competitionId}
  `;

  if (!competition) {
    return res.status(404).json({ error: 'Competition not found.' });
  }

  // get the requesting user's profile — needed for engagement state checks
  const [requestingProfile] = await sql`
    SELECT id FROM profile WHERE user_id = ${requestingUserId} LIMIT 1
  `;

  if (!requestingProfile) {
    return res.status(404).json({ error: 'Profile not found for this user.' });
  }

  // fetch contributions entered into this competition via competition_entries
  // joined to contribution, profile, and user for the full response shape
  const contributions = await sql`
    SELECT
      c.id              AS contribution_id,
      c.likes_count,
      c.comments_count,
      c.shares_count,
      u.id              AS user_id,
      u.user_name       AS username,
      p.profile_image_url,
      p.location,
      p.is_verified
    FROM competition_entries ce
    JOIN contribution c ON c.id = ce.contribution_id
    JOIN profile p      ON p.id = c.profile_id
    JOIN "user" u       ON u.id = p.user_id
    WHERE ce.competition_id = ${competitionId}
    ORDER BY c.date_of_publish DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  if (contributions.length === 0) {
    return res.json({ contributions: [] });
  }

  const contributionIds = contributions.map((c) => c.contribution_id);

  // pull the first media item for each contribution (lowest order_position)
  // used for both coverImageUrl and previewText
  const firstMediaItems = await sql`
    SELECT DISTINCT ON (contribution_id)
      contribution_id,
      image_url,
      body_text
    FROM image_contribution
    WHERE contribution_id = ANY(${contributionIds})
    ORDER BY contribution_id, order_position ASC
  `;

  // keyed by contribution_id for fast lookup
  const firstMediaMap = Object.fromEntries(
    firstMediaItems.map((m) => [m.contribution_id, m])
  );

  // check which contributions this user has liked
  const likedRows = await sql`
    SELECT contribution_id FROM reactions
    WHERE user_id = ${requestingUserId}
      AND contribution_id = ANY(${contributionIds})
      AND like_id IS NOT NULL
  `;
  const likedSet = new Set(likedRows.map((r) => r.contribution_id));

  // check which contributions this user has voted on
  const votedRows = await sql`
    SELECT contribution_id FROM contribution_votes
    WHERE profile_id = ${requestingProfile.id}
      AND contribution_id = ANY(${contributionIds})
  `;
  const votedSet = new Set(votedRows.map((r) => r.contribution_id));

  // check which contributions this user has bookmarked
  const bookmarkedRows = await sql`
    SELECT contribution_id FROM contribution_saved
    WHERE profile_id = ${requestingProfile.id}
      AND contribution_id = ANY(${contributionIds})
  `;
  const bookmarkedSet = new Set(bookmarkedRows.map((r) => r.contribution_id));

  res.json({
    contributions: contributions.map((c) => {
      const media = firstMediaMap[c.contribution_id];
      return {
        contributionId: c.contribution_id,
        author: {
          userId:          c.user_id,
          username:        c.username,
          profileImageUrl: c.profile_image_url,
          location:        c.location,
          isVerified:      c.is_verified,
        },
        preview: {
          coverImageUrl: media?.image_url || null,
          previewText:   media?.body_text || null,
        },
        engagement: {
          likesCount:    c.likes_count,
          commentsCount: c.comments_count,
          sharesCount:   c.shares_count,
          isLiked:       likedSet.has(c.contribution_id),
          isVoted:       votedSet.has(c.contribution_id),
          isBookmarked:  bookmarkedSet.has(c.contribution_id),
        },
      };
    }),
  });
});

module.exports = router;