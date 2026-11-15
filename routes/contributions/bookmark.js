const { Router } = require('express');
const sql = require('../../db');

const router = Router({ mergeParams: true });

// PATCH /contributions/:contributionId/bookmark
// Called when the user taps the bookmark button
// isBookmarked: true → insert into contribution_saved
// isBookmarked: false → delete from contribution_saved
router.patch('/', async (req, res, next) => {
  const { contributionId } = req.params;
  const { requestingUserId, isBookmarked } = req.body;

  if (!requestingUserId) {
    return res.status(400).json({ error: 'requestingUserId is required.' });
  }
  if (typeof isBookmarked !== 'boolean') {
    return res.status(400).json({ error: 'isBookmarked must be a boolean.' });
  }

  // make sure the contribution exists
  const [contribution] = await sql`
    SELECT id FROM contribution WHERE id = ${contributionId}
  `;

  if (!contribution) {
    return res.status(404).json({ error: 'Contribution not found.' });
  }

  // get the profile_id for this user — contribution_saved uses profile_id not user_id
  const [profile] = await sql`
    SELECT id FROM profile WHERE user_id = ${requestingUserId} LIMIT 1
  `;

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found for this user.' });
  }

  if (isBookmarked) {
    // insert only if not already bookmarked — avoid duplicate rows
    await sql`
      INSERT INTO contribution_saved (profile_id, contribution_id, saved_at)
      VALUES (${profile.id}, ${contributionId}, NOW())
      ON CONFLICT DO NOTHING
    `;
  } else {
    await sql`
      DELETE FROM contribution_saved
      WHERE profile_id = ${profile.id}
        AND contribution_id = ${contributionId}
    `;
  }

  res.json({ isBookmarked });
});

module.exports = router;