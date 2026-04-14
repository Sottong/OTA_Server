const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams penting untuk akses :projectId
const firmwareController = require('../controllers/firmwareController');
const upload = require('../config/multer');
const { authenticateJWT } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');

router.use(authenticateJWT);

router.get('/upload', firmwareController.renderUploadForm.bind(firmwareController));
router.post('/', uploadLimiter, upload.single('firmware'), firmwareController.uploadFirmware.bind(firmwareController));
router.get('/:id', firmwareController.getFirmwareDetail.bind(firmwareController));
router.post('/:id/activate', firmwareController.setActiveFirmware.bind(firmwareController));
router.post('/:id/delete', firmwareController.deleteFirmware.bind(firmwareController));

module.exports = router;
