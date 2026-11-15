const { Router } = require('express');
const sql = require('../../db');

const router = Router({ mergeParams: true });

// ─────────────────────────────────────────────────────────────
// GET /profiles/:profileId/contributions
//
// This one route serves two different screens depending on the
// optional ?context query param:
//
//   context=profile  (default)
//   → Used by the Profile Page contributions grid
//   → Returns: contributionId, previewStack, createdAt
//   → Lean response — just enough to render the grid cards
//
//   context=entry
//   → Used by the Competition Entry flow (Screen 2 — pick existing contribution)
//   → Returns: contributionId, contributionTitle, previewText, previewStack
//   → Richer response — the entry picker needs title and preview text too
//
// Both contexts share the same pagination logic and previewStack resolution.
// The only difference is what fields get returned at the end.
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  const { profileId } = req.params;
  const { competitionId, context = 'profile' } = req.query;

  // pagination defaults — page 1, 10 per page
  const page   = Math.max(parseInt(req.query.page,  10) || 1, 1);
  const limit  = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const offset = (page - 1) * limit;

  // make sure the profile exists before doing anything
  const [profile] = await sql`
    SELECT id FROM profile WHERE id = ${profileId}
  `;

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found.' });
  }

  // fetch contributions for this profile, newest first, with pagination
  const contributions = await sql`
    SELECT
      c.id,
      c.title,
      c.date_of_publish,
      c.preview_front_media_id,
      c.preview_back_media_id
    FROM contribution c
    WHERE c.profile_id = ${profileId}
    ORDER BY c.date_of_publish DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  if (contributions.length === 0) {
    return res.json({ contributions: [] });
  }

  // collect all contribution ids so we can batch fetch media in one query
  const contributionIds = contributions.map((c) => c.id);

  // resolve front and back preview image urls
  // the contribution stores just the media id — we join to get the actual url
  const previewMediaIds = contributions.flatMap((c) => [
    c.preview_front_media_id,
    c.preview_back_media_id,
  ]).filter(Boolean);

  const previewMediaItems = await sql`
    SELECT id, image_url
    FROM image_contribution
    WHERE id = ANY(${previewMediaIds})
  `;

  // keyed by media id so we can look up urls quickly when building the response
  const previewUrlMap = Object.fromEntries(
    previewMediaItems.map((m) => [m.id, m.image_url])
  );

  // ── CONTEXT: entry ────────────────────────────────────────
  // extra data needed only for the competition entry picker screen
  // we fetch this here and skip it entirely for the profile grid context
  let firstMediaMap = {};

  if (context === 'entry') {
    // pull the body_text of the first media item for each contribution
    // this becomes the previewText shown in the entry picker cards
    const firstMediaItems = await sql`
      SELECT DISTINCT ON (contribution_id)
        contribution_id,
        body_text
      FROM image_contribution
      WHERE contribution_id = ANY(${contributionIds})
      ORDER BY contribution_id, order_position ASC
    `;

    firstMediaMap = Object.fromEntries(
      firstMediaItems.map((m) => [m.contribution_id, m.body_text])
    );
  }

  // ── BUILD RESPONSE ────────────────────────────────────────
  // shared previewStack shape used by both contexts
  const buildPreviewStack = (c) => ({
    frontImageUrl: previewUrlMap[c.preview_front_media_id] || null,
    backImageUrl:  previewUrlMap[c.preview_back_media_id]  || null,
  });

  // filter helper: only include contributions with both preview images
  const hasCompletePreview = (item) => 
    item.previewStack.frontImageUrl !== null && item.previewStack.backImageUrl !== null;

  if (context === 'entry') {
    // competition entry picker — richer response with title and preview text
    // filter out incomplete contributions (no images means no visual preview)
    return res.json({
      contributions: contributions
        .map((c) => ({
          contributionId:    c.id,
          contributionTitle: c.title,
          previewText:       firstMediaMap[c.id] || null,
          previewStack:      buildPreviewStack(c),
        }))
        .filter(hasCompletePreview),
    });
  }

  // default: profile grid — lean response, just what the grid cards need
  // filter out contributions with null images — they show as broken placeholders
  res.json({
    contributions: contributions.map((c) => ({
      contributionId: c.id,
      previewStack:   buildPreviewStack(c),
      createdAt:      c.date_of_publish,
    })).filter(hasCompletePreview),
  });
});

module.exports = router;