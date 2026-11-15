const { Router } = require('express');
const sql = require('../../db');

const router = Router({ mergeParams: true });

// GET /competitions/:competitionId/entry-options
// Loads the two entry path options when a user opens the competition entry screen
router.get('/', async (req, res, next) => {
  const { competitionId } = req.params;
  const { requestingUserId } = req.query;

  if (!requestingUserId) {
    return res.status(400).json({ error: 'requestingUserId query param is required.' });
  }

  // make sure the competition exists
  const [competition] = await sql`
    SELECT id FROM competition WHERE id = ${competitionId}
  `;

  if (!competition) {
    return res.status(404).json({ error: 'Competition not found.' });
  }

  // pull 3 preview images from the user's most recent contributions
  // these are just decorative — used for the card stack visual on the "existing" option
  const previewImages = await sql`
    SELECT ic.image_url
    FROM image_contribution ic
    JOIN contribution c ON c.id = ic.contribution_id
    JOIN profile p ON p.id = c.profile_id
    WHERE p.user_id = ${requestingUserId}
    ORDER BY c.date_of_publish DESC, ic.order_position ASC
    LIMIT 3
  `;

  res.json({
    competitionId: parseInt(competitionId, 10),
    options: [
      {
        type: 'existing',
        title: 'Use Existing Contribution',
        description: 'Pick one of your already published contributions and enter it into this competition.',
        previewImages: previewImages.map((img) => ({ imageUrl: img.image_url })),
      },
      {
        type: 'new',
        title: 'Create New Contribution',
        description: 'Start fresh and create a new contribution specifically for this competition.',
        previewImages: [], // static UI asset on the frontend, nothing from the db
      },
    ],
  });
});

module.exports = router;