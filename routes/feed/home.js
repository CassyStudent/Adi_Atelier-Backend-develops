const { Router } = require('express');
const sql = require('../../db');

const router = Router();

// GET /feed/home
// Loads the home feed for the requesting user
//
// Feed is split into two source types:
//   following  → contributions from users this person is connected to (connections.user1_id = requestingUser)
//   suggested  → contributions from everyone else, ordered by likes_count as a simple relevance signal
//
// Both types are merged and returned together — the frontend uses sourceType
// to render the correct label ("Suggested for You" etc.)
router.get('/', async (req, res, next) => {
  const { requestingUserId } = req.query;

  if (!requestingUserId) {
    return res.status(400).json({ error: 'requestingUserId query param is required.' });
  }

  // pagination defaults
  const page   = Math.max(parseInt(req.query.page,  10) || 1, 1);
  const limit  = Math.max(parseInt(req.query.limit, 10) || 20, 1);
  const offset = (page - 1) * limit;

  // get the requesting user's profile — needed for engagement checks
  const [requestingProfile] = await sql`
    SELECT id FROM profile WHERE user_id = ${requestingUserId} LIMIT 1
  `;

  if (!requestingProfile) {
    return res.status(404).json({ error: 'Profile not found for this user.' });
  }

  // find all user ids this person is following (user1_id = them in connections)
  const followingRows = await sql`
    SELECT user2_id FROM connections WHERE user1_id = ${requestingUserId}
  `;
  const followingUserIds = followingRows.map((r) => r.user2_id);

  // fetch following contributions first — from people this user follows
  // fall back to empty array if they follow nobody
  let followingContributions = [];
  if (followingUserIds.length > 0) {
    followingContributions = await sql`
      SELECT
        c.id              AS contribution_id,
        c.likes_count,
        c.comments_count,
        c.shares_count,
        u.id              AS user_id,
        u.user_name       AS username,
        p.profile_image_url
      FROM contribution c
      JOIN profile p ON p.id = c.profile_id
      JOIN "user" u  ON u.id = p.user_id
      WHERE u.id = ANY(${followingUserIds})
      ORDER BY c.date_of_publish DESC
      LIMIT ${Math.floor(limit / 2)} OFFSET ${offset}
    `;
  }

  // fill the rest of the feed with suggested contributions
  // suggested = not from someone the user follows, not their own posts
  // ordered by likes_count as a simple popularity signal
  const excludeUserIds = [...followingUserIds, parseInt(requestingUserId, 10)];

  const suggestedContributions = await sql`
    SELECT
      c.id              AS contribution_id,
      c.likes_count,
      c.comments_count,
      c.shares_count,
      u.id              AS user_id,
      u.user_name       AS username,
      p.profile_image_url
    FROM contribution c
    JOIN profile p ON p.id = c.profile_id
    JOIN "user" u  ON u.id = p.user_id
    WHERE u.id != ALL(${excludeUserIds})
    ORDER BY c.likes_count DESC
    LIMIT ${limit - followingContributions.length} OFFSET ${offset}
  `;

  // tag each group with its source type before merging
  const tagged = [
    ...followingContributions.map((c) => ({ ...c, sourceType: 'following' })),
    ...suggestedContributions.map((c) => ({ ...c, sourceType: 'suggested' })),
  ];

  if (tagged.length === 0) {
    return res.json({ feedItems: [] });
  }

  const contributionIds = tagged.map((c) => c.contribution_id);

  // pull the first media item for each contribution — used for cover image and preview text
  const firstMediaItems = await sql`
    SELECT DISTINCT ON (contribution_id)
      contribution_id,
      image_url,
      body_text
    FROM image_contribution
    WHERE contribution_id = ANY(${contributionIds})
    ORDER BY contribution_id, order_position ASC
  `;

  const firstMediaMap = Object.fromEntries(
    firstMediaItems.map((m) => [m.contribution_id, m])
  );

  // check which contributions the requesting user has liked
  const likedRows = await sql`
    SELECT contribution_id FROM reactions
    WHERE user_id = ${requestingUserId}
      AND contribution_id = ANY(${contributionIds})
      AND like_id IS NOT NULL
  `;
  const likedSet = new Set(likedRows.map((r) => r.contribution_id));

  // check which contributions the requesting user has bookmarked
  const bookmarkedRows = await sql`
    SELECT contribution_id FROM contribution_saved
    WHERE profile_id = ${requestingProfile.id}
      AND contribution_id = ANY(${contributionIds})
  `;
  const bookmarkedSet = new Set(bookmarkedRows.map((r) => r.contribution_id));

  // build a set of followed user ids for the isFollowing field on each author
  const followingSet = new Set(followingUserIds);

  res.json({
    feedItems: tagged.map((c) => {
      const media = firstMediaMap[c.contribution_id];
      return {
        contributionId: c.contribution_id,
        sourceType:     c.sourceType,
        author: {
          userId:          c.user_id,
          username:        c.username,
          profileImageUrl: c.profile_image_url,
          isFollowing:     followingSet.has(c.user_id),
          // recommendationLabel is determined client-side from sourceType — not from db
          recommendationLabel: null,
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
          isBookmarked:  bookmarkedSet.has(c.contribution_id),
        },
      };
    }),
  });
});

module.exports = router;