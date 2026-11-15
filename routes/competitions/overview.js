const { Router } = require('express');
const sql = require('../../db');

const router = Router({ mergeParams: true });

// ─────────────────────────────────────────────────────────────
// GET /competitions/:competitionId/overview
//
// Loads everything needed for the competition overview page:
//   - hero section (cover, title, dates)
//   - overview section (description, image collage up to 3 images)
//   - entry rules (auto-formatted from competition_rules structured fields)
//   - prizes (image + free-text)
//   - isSaved state for the bookmark icon
//
// NOTE: PATCH /competitions/:competitionId/save is handled in feed.js
// and is reused here — no need to duplicate it
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  const { competitionId } = req.params;
  const { requestingUserId } = req.query;

  if (!requestingUserId) {
    return res.status(400).json({ error: 'requestingUserId query param is required.' });
  }

  // fetch the main competition row
  const [competition] = await sql`
    SELECT
      id,
      status,
      cover_image_url,
      name,
      short_description,
      description,
      start_at,
      end_at,
      prize_image_url,
      prizes_text,
      custom_rules
    FROM competition
    WHERE id = ${competitionId}
  `;

  if (!competition) {
    return res.status(404).json({ error: 'Competition not found.' });
  }

  // get the profile for this user — needed to check isSaved
  const [profile] = await sql`
    SELECT id FROM profile WHERE user_id = ${requestingUserId} LIMIT 1
  `;

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found for this user.' });
  }

  // check if this user has saved this competition
  const [savedRow] = await sql`
    SELECT profile_id FROM profile_saved_competitions
    WHERE profile_id = ${profile.id}
      AND competition_id = ${competitionId}
    LIMIT 1
  `;

  // pull up to 3 images for the collage, ordered by order_position
  const collageImages = await sql`
    SELECT image_url, order_position
    FROM competition_images
    WHERE competition_id = ${competitionId}
    ORDER BY order_position ASC
    LIMIT 3
  `;

  // pull the structured rules for this competition
  const [rules] = await sql`
    SELECT
      min_media_items,
      allowed_media_types,
      required_tags,
      max_entries_per_user,
      allow_edit_after_submission
    FROM competition_rules
    WHERE competition_id = ${competitionId}
  `;

  // auto-format the structured rule fields into readable bullet points
  // each field becomes its own bullet — custom_rules appended at the end if present
  const bulletPoints = [];

  if (rules) {
    if (rules.min_media_items) {
      bulletPoints.push({ text: `Minimum of ${rules.min_media_items} media items required.` });
    }

    if (rules.allowed_media_types) {
      bulletPoints.push({ text: `Allowed media types: ${rules.allowed_media_types}.` });
    }

    if (rules.required_tags) {
      bulletPoints.push({ text: `Required hashtags: ${rules.required_tags}.` });
    }

    if (rules.max_entries_per_user) {
      bulletPoints.push({ text: `Maximum ${rules.max_entries_per_user} ${rules.max_entries_per_user === 1 ? 'entry' : 'entries'} per user.` });
    }

    bulletPoints.push({
      text: rules.allow_edit_after_submission
        ? 'Edits are allowed after submission.'
        : 'Edits are not allowed after submission.',
    });
  }

  // append free-text custom rules as an extra bullet if present
  if (competition.custom_rules && competition.custom_rules.trim() !== '') {
    bulletPoints.push({ text: competition.custom_rules.trim() });
  }

  // map db status to the frontend label
  const statusLabelMap = {
    active:   'now',
    upcoming: 'soon',
    closed:   'finished',
  };

  res.json({
    competitionId: competition.id,
    status:        statusLabelMap[competition.status],
    isSaved:       !!savedRow,
    hero: {
      coverImageUrl:    competition.cover_image_url,
      title:            competition.name,
      shortDescription: competition.short_description,
      startDateTime:    competition.start_at,
      endDateTime:      competition.end_at,
    },
    overview: {
      title:        competition.name,
      bodyText:     competition.description,
      imageCollage: collageImages.map((img) => ({
        imageUrl:      img.image_url,
        orderPosition: img.order_position,
      })),
    },
    entryRules: {
      title:        'Entry Rules',
      bulletPoints,
    },
    prizeImageUrl: competition.prize_image_url,
    prizes: {
      title: 'Prizes',
      text:  competition.prizes_text,
    },
  });
});

module.exports = router;