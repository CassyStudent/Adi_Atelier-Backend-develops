const { Router } = require('express');
const sql = require('../../db');

const router = Router({ mergeParams: true });

// GET /profiles/:profileId
// Loads everything needed to render the profile page header —
// user info, location, and computed stats (contributions, followers, following)
router.get('/', async (req, res, next) => {
  const { profileId } = req.params;

  // fetch profile + user info in one join
  // google_profile_id lives on the user table, everything else on profile
  const [profile] = await sql`
    SELECT
      u.id                AS user_id,
      u.user_name         AS username,
      p.profile_image_url,
      p.location
    FROM profile p
    JOIN "user" u ON u.id = p.user_id
    WHERE p.id = ${profileId}
  `;

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found.' });
  }

  // count how many contributions this profile has published
  const [{ count: contributionsCount }] = await sql`
    SELECT COUNT(*) AS count
    FROM contribution
    WHERE profile_id = ${profileId}
  `;

  // followers = other users who have this user listed as user2 in connections
  // the connections table stores user ids, so we need the user_id for this profile first
  const [{ count: followersCount }] = await sql`
    SELECT COUNT(*) AS count
    FROM connections
    WHERE user2_id = ${profile.user_id}
  `;

  // following = connections where this user is the one who initiated (user1_id)
  const [{ count: followingCount }] = await sql`
    SELECT COUNT(*) AS count
    FROM connections
    WHERE user1_id = ${profile.user_id}
  `;

  res.json({
    userId:           profile.user_id,
    username:         profile.username,
    profileImageUrl:  profile.profile_image_url,
    location:         profile.location,
    stats: {
      contributionsCount: parseInt(contributionsCount, 10),
      followersCount:     parseInt(followersCount,     10),
      followingCount:     parseInt(followingCount,     10),
    },
  });
});

module.exports = router;