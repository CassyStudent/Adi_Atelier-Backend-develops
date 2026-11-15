const { Router } = require('express');
const sql = require('../../db');

const router = Router({ mergeParams: true });

// GET /contributions/:contributionId/preview
// Opens the preview selection screen — returns the contribution title,
// current preview stack, and all media items the user can pick from
router.get('/', async (req, res, next) => {
  const { contributionId } = req.params;

  // fetch the contribution row — we need title and current preview IDs
  const [contribution] = await sql`
    SELECT id, title, preview_front_media_id, preview_back_media_id
    FROM contribution
    WHERE id = ${contributionId}
  `;

  if (!contribution) {
    return res.status(404).json({ error: 'Contribution not found.' });
  }

  // pull all image media items for this contribution, ordered for display
  // only pulling from image_contribution — previews are always images, videos can't be preview cards
  const mediaItems = await sql`
    SELECT id, thumbnail_url, image_url, order_position
    FROM image_contribution
    WHERE contribution_id = ${contributionId}
    ORDER BY order_position ASC
  `;

  // spec says return an error if fewer than 2 media items exist
  if (mediaItems.length < 2) {
    return res.status(422).json({
      error: 'Contribution must have at least 2 media items to set a preview.',
    });
  }

  // default front = first image, back = second image — only used if preview IDs aren't set yet
  const frontId = contribution.preview_front_media_id ?? mediaItems[0].id;
  const backId = contribution.preview_back_media_id ?? mediaItems[1].id;

  res.json({
    contributionId: contribution.id,
    contributionTitle: contribution.title,
    previewStack: {
      frontImageMediaId: frontId,
      backImageMediaId: backId,
    },
    mediaItems: mediaItems.map((item) => ({
      mediaId: item.id,
      thumbnailUrl: item.thumbnail_url,
      fullImageUrl: item.image_url,
      orderInContribution: item.order_position,
    })),
  });
});


// PATCH /contributions/:contributionId/preview
// Called when the user presses "NEXT" — persists their preview stack selection
router.patch('/', async (req, res, next) => {
  const { contributionId } = req.params;
  const { previewStack } = req.body;

  // route-level validation — check the shape of the request before touching the db
  if (!previewStack || !previewStack.frontImageMediaId || !previewStack.backImageMediaId) {
    return res.status(400).json({
      error: 'previewStack with frontImageMediaId and backImageMediaId is required.',
    });
  }

  const { frontImageMediaId, backImageMediaId } = previewStack;

  if (frontImageMediaId === backImageMediaId) {
    return res.status(400).json({
      error: 'frontImageMediaId and backImageMediaId must be different images.',
    });
  }

  // make sure the contribution actually exists
  const [contribution] = await sql`
    SELECT id FROM contribution WHERE id = ${contributionId}
  `;

  if (!contribution) {
    return res.status(404).json({ error: 'Contribution not found.' });
  }

  // validate both media IDs belong to this contribution — do it in one query
  const validMedia = await sql`
    SELECT id FROM image_contribution
    WHERE contribution_id = ${contributionId}
      AND id = ANY(ARRAY[${frontImageMediaId}, ${backImageMediaId}]::int[])
  `;

  // if we didn't get back exactly 2 rows, at least one ID is wrong or foreign
  if (validMedia.length !== 2) {
    return res.status(400).json({
      error: 'One or both media IDs do not belong to this contribution.',
    });
  }

  // all good — persist the selection
  const now = new Date();

  await sql`
    UPDATE contribution
    SET
      preview_front_media_id = ${frontImageMediaId},
      preview_back_media_id = ${backImageMediaId}
    WHERE id = ${contributionId}
  `;

  res.json({
    contributionId: parseInt(contributionId, 10),
    previewStack: {
      frontImageMediaId,
      backImageMediaId,
    },
    updatedAt: now,
  });
});


module.exports = router;