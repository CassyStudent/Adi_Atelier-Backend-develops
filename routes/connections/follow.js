const { Router } = require('express');
const sql = require('../../db');

const router = Router();

// PATCH /connections/follow
// Called when the user taps Follow or Unfollow on a feed item
//
// isFollowing: true  → insert row into connections (user1_id = requester, user2_id = target)
// isFollowing: false → delete that row from connections
//
// connections has no unique constraint in the schema so we check for existence
// before inserting to avoid duplicate rows
router.patch('/follow', async (req, res, next) => {
  const { requestingUserId, targetUserId, isFollowing } = req.body;

  if (!requestingUserId) {
    return res.status(400).json({ error: 'requestingUserId is required.' });
  }
  if (!targetUserId) {
    return res.status(400).json({ error: 'targetUserId is required.' });
  }
  if (typeof isFollowing !== 'boolean') {
    return res.status(400).json({ error: 'isFollowing must be a boolean.' });
  }
  if (requestingUserId === targetUserId) {
    return res.status(400).json({ error: 'You cannot follow yourself.' });
  }

  // make sure the target user actually exists
  const [targetUser] = await sql`
    SELECT id FROM "user" WHERE id = ${targetUserId} LIMIT 1
  `;

  if (!targetUser) {
    return res.status(404).json({ error: 'Target user not found.' });
  }

  if (isFollowing) {
    // check if already following — avoid duplicate rows
    const [existing] = await sql`
      SELECT user1_id FROM connections
      WHERE user1_id = ${requestingUserId}
        AND user2_id = ${targetUserId}
      LIMIT 1
    `;

    if (!existing) {
      await sql`
        INSERT INTO connections (user1_id, user2_id)
        VALUES (${requestingUserId}, ${targetUserId})
      `;
    }
  } else {
    await sql`
      DELETE FROM connections
      WHERE user1_id = ${requestingUserId}
        AND user2_id = ${targetUserId}
    `;
  }

  res.json({
    targetUserId: parseInt(targetUserId, 10),
    isFollowing,
  });
});

module.exports = router;