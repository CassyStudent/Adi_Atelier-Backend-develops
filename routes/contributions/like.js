const { Router } = require('express');
const sql = require('../../db');

const router = Router({ mergeParams: true });

// PATCH /contributions/:contributionId/like
// Called when the user taps the like button
// isLiked: true → insert reaction row + increment likes_count
// isLiked: false → delete reaction row + decrement likes_count
router.patch('/', async (req, res, next) => {
  const { contributionId } = req.params;
  const { requestingUserId, isLiked } = req.body;

  if (!requestingUserId) {
    return res.status(400).json({ error: 'requestingUserId is required.' });
  }
  if (typeof isLiked !== 'boolean') {
    return res.status(400).json({ error: 'isLiked must be a boolean.' });
  }

  // make sure the contribution exists before doing anything
  const [contribution] = await sql`
    SELECT id, likes_count FROM contribution WHERE id = ${contributionId}
  `;

  if (!contribution) {
    return res.status(404).json({ error: 'Contribution not found.' });
  }

  if (isLiked) {
    // check if they already liked it — don't double insert
    const [existing] = await sql`
      SELECT id FROM reactions
      WHERE user_id = ${requestingUserId}
        AND contribution_id = ${contributionId}
        AND like_id IS NOT NULL
      LIMIT 1
    `;

    if (!existing) {
      // like_id is just an incrementing counter here — we use the reaction row id as the like reference
      await sql`
        INSERT INTO reactions (user_id, contribution_id, like_id, comment_id, moment)
        VALUES (${requestingUserId}, ${contributionId}, ${contribution.likes_count + 1}, '', NOW())
      `;

      await sql`
        UPDATE contribution SET likes_count = likes_count + 1 WHERE id = ${contributionId}
      `;
    }
  } else {
    // remove the like row if it exists
    await sql`
      DELETE FROM reactions
      WHERE user_id = ${requestingUserId}
        AND contribution_id = ${contributionId}
        AND like_id IS NOT NULL
    `;

    // decrement but never go below 0 — safety net for bad data
    await sql`
      UPDATE contribution
      SET likes_count = GREATEST(likes_count - 1, 0)
      WHERE id = ${contributionId}
    `;
  }

  // fetch the updated count to return the real value
  const [updated] = await sql`
    SELECT likes_count FROM contribution WHERE id = ${contributionId}
  `;

  res.json({
    likesCount: updated.likes_count,
    isLiked,
  });
});

module.exports = router;