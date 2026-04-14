const multer = require('multer');
const path = require('path');
const fs = require('fs');
const env = require('./env');

// Pastikan upload dir ada
if (!fs.existsSync(env.UPLOAD_DIR)) {
  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectDir = path.join(env.UPLOAD_DIR, req.params.projectId);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    cb(null, projectDir);
  },
  filename: (req, file, cb) => {
    // Format: firmware_v1.0.0_<timestamp>.bin
    const version = req.body.version || 'unknown';
    const timestamp = Date.now();
    cb(null, `firmware_v${version}_${timestamp}.bin`);
  },
});

const fileFilter = (req, file, cb) => {
  // Hanya terima file .bin
  if (path.extname(file.originalname).toLowerCase() === '.bin') {
    cb(null, true);
  } else {
    cb(new Error('Only .bin files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.MAX_FILE_SIZE },
});

module.exports = upload;
