const { Router } = require('express');
const sql = require('../../db');

const router = Router({ mergeParams: true });

// GET /contributions/:contributionId
// Opens the contribution detail screen
// requestingUserId comes as a query param since GET requests have no body
router.get('/', async (req, res, next) => {
  const { contributionId } = req.params;
  const { requestingUserId } = req.query;

  if (!requestingUserId) {
    return res.status(400).json({ error: 'requestingUserId query param is required.' });
  }

  // fetch the contribution + author info in one join
  // pulling from profile and user tables for the full author shape
  const [contribution] = await sql`
    SELECT
      c.id              AS contribution_id,
      c.title           AS contribution_title,
      c.likes_count,
      c.comments_count,
      c.shares_count,
      u.id              AS user_id,
      u.user_name       AS username,
      p.profile_image_url,
      p.location,
      p.is_verified
    FROM contribution c
    JOIN profile p ON p.id = c.profile_id
    JOIN "user" u  ON u.id = p.user_id
    WHERE c.id = ${contributionId}
  `;

  if (!contribution) {
    return res.status(404).json({ error: 'Contribution not found.' });
  }

  // pull all image media items for this contribution, ordered for display
  const mediaItems = await sql`
    SELECT id, image_url, thumbnail_url, order_position, subtitle, body_text
    FROM image_contribution
    WHERE contribution_id = ${contributionId}
    ORDER BY order_position ASC
  `;

  // check if the requesting user has liked this contribution
  // a like is a row in reactions where like_id is not null
  const [likeRow] = await sql`
    SELECT id FROM reactions
    WHERE user_id = ${requestingUserId}
      AND contribution_id = ${contributionId}
      AND like_id IS NOT NULL
    LIMIT 1
  `;

  // check if the requesting user has bookmarked this contribution
  // profile_id in contribution_saved maps to the profile of the requesting user
  const [bookmarkRow] = await sql`
    SELECT cs.profile_id FROM contribution_saved cs
    JOIN profile p ON p.id = cs.profile_id
    WHERE p.user_id = ${requestingUserId}
      AND cs.contribution_id = ${contributionId}
    LIMIT 1
  `;

  res.json({
    contributionId: contribution.contribution_id,
    contributionTitle: contribution.contribution_title,
    author: {
      userId: contribution.user_id,
      username: contribution.username,
      profileImageUrl: contribution.profile_image_url,
      location: contribution.location,
      isVerified: contribution.is_verified,
    },
    mediaItems: mediaItems.map((item) => ({
      mediaId: item.id,
      imageUrl: item.image_url,
      thumbnailUrl: item.thumbnail_url,
      subtitle: item.subtitle,
      bodyText: item.body_text,
      orderInContribution: item.order_position,
    })),
    engagement: {
      likesCount: contribution.likes_count,
      commentsCount: contribution.comments_count,
      sharesCount: contribution.shares_count,
      isLiked: !!likeRow,
      isBookmarked: !!bookmarkRow,
    },
  });
});

module.exports = router;