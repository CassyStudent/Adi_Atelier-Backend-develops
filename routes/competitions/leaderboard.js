const { Router } = require('express');
const sql = require('../../db');

const router = Router({ mergeParams: true });

// GET /competitions/:competitionId/leaderboard
// Loads the top 100 leaderboard entries for a competition
// sorted by votes_count descending
// rank comes from leaderboard.rank_position — pre-computed when votes are tallied
router.get('/', async (req, res, next) => {
  const { competitionId } = req.params;

  // make sure the competition exists
  const [competition] = await sql`
    SELECT id FROM competition WHERE id = ${competitionId}
  `;

  if (!competition) {
    return res.status(404).json({ error: 'Competition not found.' });
  }

  // pull leaderboard entries joined to profile and user for display info
  // fixed limit of 100 as per spec — no pagination needed here
  const entries = await sql`
    SELECT
      l.rank_position,
      l.votes_count,
      u.id          AS user_id,
      u.user_name   AS username,
      p.profile_image_url,
      p.location
    FROM leaderboard l
    JOIN profile p ON p.id = l.profile_id
    JOIN "user" u  ON u.id = p.user_id
    WHERE l.competition_id = ${competitionId}
    ORDER BY l.votes_count DESC
    LIMIT 100
  `;

  res.json({
    competitionId: parseInt(competitionId, 10),
    leaderboard: entries.map((entry) => ({
      rank:            entry.rank_position,
      userId:          entry.user_id,
      username:        entry.username,
      profileImageUrl: entry.profile_image_url,
      location:        entry.location,
      votesCount:      entry.votes_count,
    })),
  });
});

module.exports = router;