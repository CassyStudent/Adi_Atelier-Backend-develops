const { Router } = require('express');
const sql = require('../../db');

const router = Router({ mergeParams: true });

// PATCH /contributions/:contributionId/vote
// Called when the user taps the vote button on a competition contribution
//
// isVoted: true  → insert into contribution_votes + increment leaderboard.votes_count
// isVoted: false → delete from contribution_votes + decrement leaderboard.votes_count
//
// contribution_votes has a composite PK (profile_id, contribution_id)
// so duplicate votes are blocked at the db level too
router.patch('/', async (req, res, next) => {
  const { contributionId } = req.params;
  const { requestingUserId, isVoted } = req.body;

  if (!requestingUserId) {
    return res.status(400).json({ error: 'requestingUserId is required.' });
  }
  if (typeof isVoted !== 'boolean') {
    return res.status(400).json({ error: 'isVoted must be a boolean.' });
  }

  // make sure the contribution exists
  const [contribution] = await sql`
    SELECT id, profile_id FROM contribution WHERE id = ${contributionId}
  `;

  if (!contribution) {
    return res.status(404).json({ error: 'Contribution not found.' });
  }

  // get the requesting user's profile — contribution_votes uses profile_id
  const [requestingProfile] = await sql`
    SELECT id FROM profile WHERE user_id = ${requestingUserId} LIMIT 1
  `;

  if (!requestingProfile) {
    return res.status(404).json({ error: 'Profile not found for this user.' });
  }

  // find which competition this contribution belongs to via competition_entries
  // we need this to update the right leaderboard row
  const [entry] = await sql`
    SELECT competition_id FROM competition_entries
    WHERE contribution_id = ${contributionId}
    LIMIT 1
  `;

  if (!entry) {
    return res.status(400).json({ error: 'This contribution is not entered in any competition.' });
  }

  if (isVoted) {
    // check if already voted — ON CONFLICT handles it at db level too,
    // but we skip the leaderboard update if the vote already exists
    const [existing] = await sql`
      SELECT profile_id FROM contribution_votes
      WHERE profile_id = ${requestingProfile.id}
        AND contribution_id = ${contributionId}
      LIMIT 1
    `;

    if (!existing) {
      await sql`
        INSERT INTO contribution_votes (profile_id, contribution_id, voted_at)
        VALUES (${requestingProfile.id}, ${contributionId}, NOW())
        ON CONFLICT DO NOTHING
      `;

      // increment votes_count on the leaderboard row for this contribution's author
      await sql`
        UPDATE leaderboard
        SET votes_count = votes_count + 1,
            updated_at  = NOW()
        WHERE profile_id     = ${contribution.profile_id}
          AND competition_id = ${entry.competition_id}
      `;
    }
  } else {
    const [existing] = await sql`
      SELECT profile_id FROM contribution_votes
      WHERE profile_id = ${requestingProfile.id}
        AND contribution_id = ${contributionId}
      LIMIT 1
    `;

    if (existing) {
      await sql`
        DELETE FROM contribution_votes
        WHERE profile_id     = ${requestingProfile.id}
          AND contribution_id = ${contributionId}
      `;

      // decrement but never go below 0 — safety net for bad data
      await sql`
        UPDATE leaderboard
        SET votes_count = GREATEST(votes_count - 1, 0),
            updated_at  = NOW()
        WHERE profile_id     = ${contribution.profile_id}
          AND competition_id = ${entry.competition_id}
      `;
    }
  }

  // fetch the current votes_count from leaderboard to return the real value
  const [leaderboardRow] = await sql`
    SELECT votes_count FROM leaderboard
    WHERE profile_id     = ${contribution.profile_id}
      AND competition_id = ${entry.competition_id}
  `;

  res.json({
    votesCount: leaderboardRow?.votes_count ?? 0,
    isVoted,
  });
});

module.exports = router;