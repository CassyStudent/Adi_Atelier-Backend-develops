const { Router } = require('express');
const sql = require('../../db');

const router = Router({ mergeParams: true });

// ─────────────────────────────────────────────────────────────
// GET /competitions
//
// Loads the competition feed, filtered by tab:
//   tab=now      → active competitions
//   tab=soon     → upcoming competitions
//   tab=finished → closed competitions
//   tab=saved    → competitions this user has saved, any status
//
// isSaved is computed for each competition based on profile_saved_competitions
//
// Host is always the Adidas platform — there's no host profile linked
// in the schema, so we return a static Adidas object for all competitions
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  const { requestingUserId, tab = 'now' } = req.query;

  if (!requestingUserId) {
    return res.status(400).json({ error: 'requestingUserId query param is required.' });
  }

  // validate tab value
  const validTabs = ['now', 'soon', 'finished', 'saved'];
  if (!validTabs.includes(tab)) {
    return res.status(400).json({ error: 'tab must be one of: now, soon, finished, saved.' });
  }

  // pagination defaults
  const page   = Math.max(parseInt(req.query.page,  10) || 1, 1);
  const limit  = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const offset = (page - 1) * limit;

  // map tab names to db status values
  const tabStatusMap = {
    now:      'active',
    soon:     'upcoming',
    finished: 'closed',
  };

  // get the profile_id for this user — needed to check saved competitions
  const [profile] = await sql`
    SELECT id FROM profile WHERE user_id = ${requestingUserId} LIMIT 1
  `;

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found for this user.' });
  }

  // fetch competitions based on the selected tab
  // saved tab pulls from profile_saved_competitions regardless of status
  // all other tabs filter by the mapped status value
  let competitions;

  if (tab === 'saved') {
    competitions = await sql`
      SELECT
        c.id,
        c.status,
        c.cover_image_url,
        c.name,
        c.short_description,
        c.start_at,
        c.end_at
      FROM competition c
      JOIN profile_saved_competitions psc ON psc.competition_id = c.id
      WHERE psc.profile_id = ${profile.id}
      ORDER BY c.start_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    const status = tabStatusMap[tab];
    competitions = await sql`
      SELECT
        c.id,
        c.status,
        c.cover_image_url,
        c.name,
        c.short_description,
        c.start_at,
        c.end_at
      FROM competition c
      WHERE c.status = ${status}
      ORDER BY c.start_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  if (competitions.length === 0) {
    return res.json({ competitions: [] });
  }

  // check which competitions this user has saved
  // we do this in one query and build a set for fast lookup
  const competitionIds = competitions.map((c) => c.id);

  const savedRows = await sql`
    SELECT competition_id
    FROM profile_saved_competitions
    WHERE profile_id = ${profile.id}
      AND competition_id = ANY(${competitionIds})
  `;

  const savedSet = new Set(savedRows.map((r) => r.competition_id));

  // map db status to the tab label the frontend expects
  const statusLabelMap = {
    active:   'now',
    upcoming: 'soon',
    closed:   'finished',
  };

  res.json({
    competitions: competitions.map((c) => ({
      competitionId: c.id,
      status:        statusLabelMap[c.status],
      isSaved:       savedSet.has(c.id),
      // host is always Adidas — no host profile in the schema
      // if a host profile gets added to the db later, replace this with a join
      host: {
        hostId:          null,
        profileName:     'adi_atelier',
        profileImageUrl: 'https://cdn.adidas-platform.com/profiles/adidas/avatar.jpg',
        isVerified:      true,
      },
      card: {
        coverImageUrl: c.cover_image_url,
        title:         c.name,
        description:   c.short_description,
        startDateTime: c.start_at,
        endDateTime:   c.end_at,
      },
    })),
  });
});


// ─────────────────────────────────────────────────────────────
// PATCH /competitions/:competitionId/save
//
// Called when the user taps the save icon on a competition card
//   isSaved: true  → insert row into profile_saved_competitions
//   isSaved: false → delete row from profile_saved_competitions
//
// The table has a composite PK (profile_id, competition_id)
// so ON CONFLICT DO NOTHING handles accidental double taps safely
// ─────────────────────────────────────────────────────────────
router.patch('/:competitionId/save', async (req, res, next) => {
  const { competitionId } = req.params;
  const { requestingUserId, isSaved } = req.body;

  if (!requestingUserId) {
    return res.status(400).json({ error: 'requestingUserId is required.' });
  }
  if (typeof isSaved !== 'boolean') {
    return res.status(400).json({ error: 'isSaved must be a boolean.' });
  }

  // make sure the competition exists
  const [competition] = await sql`
    SELECT id FROM competition WHERE id = ${competitionId}
  `;

  if (!competition) {
    return res.status(404).json({ error: 'Competition not found.' });
  }

  // get profile_id for this user
  const [profile] = await sql`
    SELECT id FROM profile WHERE user_id = ${requestingUserId} LIMIT 1
  `;

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found for this user.' });
  }

  if (isSaved) {
    await sql`
      INSERT INTO profile_saved_competitions (profile_id, competition_id, saved_at)
      VALUES (${profile.id}, ${competitionId}, NOW())
      ON CONFLICT DO NOTHING
    `;
  } else {
    await sql`
      DELETE FROM profile_saved_competitions
      WHERE profile_id = ${profile.id}
        AND competition_id = ${competitionId}
    `;
  }

  res.json({
    competitionId: parseInt(competitionId, 10),
    isSaved,
  });
});

module.exports = router;