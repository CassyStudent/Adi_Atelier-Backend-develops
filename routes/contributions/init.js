const { Router } = require('express');
const multer = require('multer');
const cloudinary = require('../../config/cloudinary');
const sql = require('../../db');

const router = Router();

// multer is set to memory storage — files are kept as buffers in memory
// and passed directly to Cloudinary, nothing is written to disk
const upload = multer({ storage: multer.memoryStorage() });

// helper that uploads a single file buffer to Cloudinary and returns the result
// we wrap it in a promise because Cloudinary's upload_stream uses callbacks
function uploadToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

// POST /contributions/init
// Called when the user presses NEXT in the gallery picker with 2+ images selected
//
// What happens here:
//   1. Validate minimum 2 images
//   2. Create a bare contribution row (title, text etc are all null — filled in later)
//   3. Upload each image to Cloudinary, get back real URLs
//   4. Insert image_contribution rows with those URLs
//   5. Set default preview (front = first image, back = second image)
//   6. Return contributionId + mediaItems to the editor wizard
//
// multipart/form-data request — images come as file fields named "images"
// profileId and selectionOrder come as regular form fields
router.post('/', upload.array('images'), async (req, res, next) => {
  const { profileId } = req.body;
  const files = req.files;

  // route-level validation
  if (!profileId) {
    return res.status(400).json({ error: 'profileId is required.' });
  }
  if (!files || files.length < 2) {
    return res.status(400).json({ error: 'At least 2 images are required.' });
  }

  // make sure the profile exists
  const [profile] = await sql`
    SELECT id FROM profile WHERE id = ${profileId} LIMIT 1
  `;

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found.' });
  }

  // create the bare contribution row — everything except profile_id is null/default for now
  // the editor wizard will fill in title, text, audio etc in later steps
  const [contribution] = await sql`
    INSERT INTO contribution (profile_id, date_of_publish)
    VALUES (${profileId}, NOW())
    RETURNING id
  `;

  const contributionId = contribution.id;

  // upload each image to Cloudinary and insert a row into image_contribution
  // we process them in order so orderIndex matches selectionOrder from the frontend
  const mediaItems = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const orderIndex = i + 1; // 1-based order

    // upload original image to Cloudinary
    // stored under contributions/{contributionId}/ for easy organisation
    const uploaded = await uploadToCloudinary(
      file.buffer,
      `contributions/${contributionId}`
    );

    // Cloudinary generates a thumbnail by transforming the original url
    // we request a 400px wide version as the thumbnail
    const thumbnailUrl = cloudinary.url(uploaded.public_id, {
      width:   400,
      crop:    'scale',
      format:  'jpg',
    });

    // insert the image_contribution row
    const [mediaRow] = await sql`
      INSERT INTO image_contribution (
        contribution_id,
        image_url,
        thumbnail_url,
        order_position,
        media_type
      )
      VALUES (
        ${contributionId},
        ${uploaded.secure_url},
        ${thumbnailUrl},
        ${orderIndex},
        'image'
      )
      RETURNING id
    `;

    mediaItems.push({
      mediaId:      mediaRow.id,
      imageUrl:     uploaded.secure_url,
      thumbnailUrl: thumbnailUrl,
      orderIndex:   orderIndex,
    });
  }

  // default preview — front = first image, back = second image
  const frontPreviewMediaId = mediaItems[0].mediaId;
  const backPreviewMediaId  = mediaItems[1].mediaId;

  // save the default preview selection onto the contribution row
  await sql`
    UPDATE contribution
    SET
      preview_front_media_id = ${frontPreviewMediaId},
      preview_back_media_id  = ${backPreviewMediaId}
    WHERE id = ${contributionId}
  `;

  res.status(201).json({
    contribution: {
      contributionId,
      mediaItems,
      previewSelection: {
        frontPreviewMediaId,
        backPreviewMediaId,
      },
    },
  });
});

module.exports = router;