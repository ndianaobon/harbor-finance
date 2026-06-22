const express  = require('express');
const multer   = require('multer');
const { requireAuth } = require('../middleware/auth');
const supabase = require('../lib/supabase');
const path     = require('path');
const crypto   = require('crypto');

const router = express.Router();

const ALLOWED_BUCKETS = ['kyc-documents', 'support-files', 'deposit-proofs'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed. Use JPG, PNG, GIF, WebP, or PDF.'));
  },
});

// POST /api/upload — upload a file to Supabase Storage
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const bucket = req.body.bucket || 'kyc-documents';
  if (!ALLOWED_BUCKETS.includes(bucket)) {
    return res.status(400).json({ error: 'Invalid bucket' });
  }

  const ext = path.extname(req.file.originalname) || '.jpg';
  const fileName = `${req.user.id}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(fileName, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    });

  if (error) {
    console.error('[UPLOAD]', error.message);
    return res.status(500).json({ error: 'Upload failed: ' + error.message });
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);

  res.json({
    url: urlData.publicUrl,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
  });
});

// Error handler for multer
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Maximum 5MB.' });
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
});

module.exports = router;
