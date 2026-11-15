const { Router } = require('express');
const sql = require('../../db');

const router = Router({ mergeParams: true });

// ─────────────────────────────────────────────────────────────
// GET /contributions/:contributionId/editor
//
// Only used in EDIT mode — loads all existing contribution data
// so the editor wizard can pre-fill every field
//
// In CREATE mode this is skipped entirely — the gallery picker
// POST response already contains everything the editor needs
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  const { contributionId } = req.params;
  const { competitionId } = req.query;

  // fetch the main contribution row
  const [contribution] = await sql`
    SELECT
      id,
      title,
      preview_front_media_id,
      preview_back_media_id,
      audio_external_id,
      audio_title,
      audio_artist,
      audio_preview_url,
      audio_cover_url
    FROM contribution
    WHERE id = ${contributionId}
  `;

  if (!contribution) {
    return res.status(404).json({ error: 'Contribution not found.' });
  }

  // fetch all media items for this contribution ordered by position
  const mediaItems = await sql`
    SELECT id, image_url, thumbnail_url, order_position, subtitle, body_text
    FROM image_contribution
    WHERE contribution_id = ${contributionId}
    ORDER BY order_position ASC
  `;

  // fetch any hashtags already linked to this contribution
  const hashtags = await sql`
    SELECT h.id, h.text
    FROM hashtag h
    JOIN contribution_hashtag ch ON ch.hashtag_id = h.id
    WHERE ch.contribution_id = ${contributionId}
  `;

  // if a competitionId was passed, fetch the competition title for display
  let competition = null;
  if (competitionId) {
    const [comp] = await sql`
      SELECT id, name FROM competition WHERE id = ${competitionId}
    `;
    if (comp) {
      competition = {
        competitionId: comp.id,
        competitionTitle: comp.name,
      };
    }
  }

  res.json({
    contribution: {
      contributionId:  contribution.id,
      title:           contribution.title,
      competition,
      mediaItems: mediaItems.map((item) => ({
        mediaId:         item.id,
        imageUrl:        item.image_url,
        thumbnailUrl:    item.thumbnail_url,
        orderIndex:      item.order_position,
        subtitle:        item.subtitle,
        descriptionText: item.body_text,
      })),
      previewSelection: {
        frontPreviewMediaId: contribution.preview_front_media_id,
        backPreviewMediaId:  contribution.preview_back_media_id,
      },
      selectedAudio: contribution.audio_external_id ? {
        externalAudioId: contribution.audio_external_id,
        trackTitle:      contribution.audio_title,
        artistName:      contribution.audio_artist,
        coverImageUrl:   contribution.audio_cover_url,
        previewAudioUrl: contribution.audio_preview_url,
      } : null,
      hashtags: hashtags.map((h) => ({
        hashtagId:   h.id,
        hashtagText: h.text,
      })),
    },
  });
});


// ─────────────────────────────────────────────────────────────
// PATCH /contributions/:contributionId/editor
//
// Called when the user presses Publish — saves everything in one go
//
// What this does in order:
//   1. Validate title, min 2 media items, preview IDs
//   2. Update each image_contribution row (subtitle, body_text, order_position)
//   3. Save audio fields onto the contribution row
//   4. Save title and preview selection onto the contribution row
//   5. Link hashtags via contribution_hashtag, increment posts_count
//   6. If competitionId provided → insert into competition_entries
//   7. Return success response
//
// No draft system — nothing is saved if the user abandons mid-flow
// ─────────────────────────────────────────────────────────────
router.patch('/', async (req, res, next) => {
  const { contributionId } = req.params;
  const {
    title,
    mediaItems,
    previewSelection,
    hashtags,
    selectedAudio,
    competitionId,
    publishState,
  } = req.body;

  // ── route-level validation ────────────────────────────────
  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'title is required.' });
  }
  if (!mediaItems || mediaItems.length < 2) {
    return res.status(400).json({ error: 'At least 2 media items are required.' });
  }
  if (!previewSelection?.frontPreviewMediaId || !previewSelection?.backPreviewMediaId) {
    return res.status(400).json({ error: 'previewSelection with front and back media IDs is required.' });
  }
  if (previewSelection.frontPreviewMediaId === previewSelection.backPreviewMediaId) {
    return res.status(400).json({ error: 'frontPreviewMediaId and backPreviewMediaId must be different.' });
  }
  if (publishState !== 'published') {
    return res.status(400).json({ error: 'publishState must be "published".' });
  }

  // make sure the contribution exists
  const [contribution] = await sql`
    SELECT id, profile_id FROM contribution WHERE id = ${contributionId}
  `;

  if (!contribution) {
    return res.status(404).json({ error: 'Contribution not found.' });
  }

  // validate both preview media IDs belong to this contribution
  const previewIds = [
    previewSelection.frontPreviewMediaId,
    previewSelection.backPreviewMediaId,
  ];

  const validPreview = await sql`
    SELECT id FROM image_contribution
    WHERE contribution_id = ${contributionId}
      AND id = ANY(${previewIds}::int[])
  `;

  if (validPreview.length !== 2) {
    return res.status(400).json({ error: 'One or both preview media IDs do not belong to this contribution.' });
  }

  // ── update each media item ────────────────────────────────
  // save subtitle, body_text, and order_position for each image
  for (const item of mediaItems) {
    await sql`
      UPDATE image_contribution
      SET
        subtitle       = ${item.subtitle       ?? null},
        body_text      = ${item.descriptionText ?? null},
        order_position = ${item.orderIndex}
      WHERE id = ${item.mediaId}
        AND contribution_id = ${contributionId}
    `;
  }

  // ── update the contribution row ───────────────────────────
  // date_of_publish is intentionally NOT updated here
  // it was set when the contribution was first created via POST /contributions/init
  // updating it would change the sort order on the profile grid
  await sql`
    UPDATE contribution
    SET
      title                  = ${title.trim()},
      preview_front_media_id = ${previewSelection.frontPreviewMediaId},
      preview_back_media_id  = ${previewSelection.backPreviewMediaId},
      audio_external_id      = ${selectedAudio?.externalAudioId  ?? null},
      audio_title            = ${selectedAudio?.trackTitle        ?? null},
      audio_artist           = ${selectedAudio?.artistName        ?? null},
      audio_preview_url      = ${selectedAudio?.previewAudioUrl   ?? null},
      audio_cover_url        = ${selectedAudio?.coverImageUrl     ?? null},
      used_in_competition    = ${!!competitionId}
    WHERE id = ${contributionId}
  `;

  // ── handle hashtags ───────────────────────────────────────
  // delete existing hashtag links first — replace with the new selection
  if (hashtags && hashtags.length > 0) {
    await sql`
      DELETE FROM contribution_hashtag
      WHERE contribution_id = ${contributionId}
    `;

    // insert new hashtag links and increment posts_count for each
    for (const tag of hashtags) {
      await sql`
        INSERT INTO contribution_hashtag (contribution_id, hashtag_id)
        VALUES (${contributionId}, ${tag.hashtagId})
        ON CONFLICT DO NOTHING
      `;

      await sql`
        UPDATE hashtag
        SET posts_count = posts_count + 1
        WHERE id = ${tag.hashtagId}
      `;
    }
  }

  // ── handle competition entry ──────────────────────────────
  // if a competitionId was provided, link this contribution to the competition
  // ON CONFLICT DO NOTHING prevents duplicate entries
  let competitionEntry = null;

  if (competitionId) {
    // get the user_id from the contribution's profile — competition_entries needs it
    const [profile] = await sql`
      SELECT user_id FROM profile WHERE id = ${contribution.profile_id}
    `;

    const [entry] = await sql`
      INSERT INTO competition_entries (competition_id, contribution_id, user_id, created_at)
      VALUES (${competitionId}, ${contributionId}, ${profile.user_id}, NOW())
      ON CONFLICT DO NOTHING
      RETURNING id, competition_id
    `;

    if (entry) {
      competitionEntry = {
        entryId:       entry.id,
        competitionId: entry.competition_id,
      };
    }
  }

  // ── success response ──────────────────────────────────────
  res.json({
    success:          true,
    message:          'Contribution successfully published.',
    contributionId:   parseInt(contributionId, 10),
    publishedAt:      new Date(),
    competitionEntry: competitionEntry,
  });
});

module.exports = router;