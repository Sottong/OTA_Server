const express = require('express');
const router = express.Router();
const updateController = require('../controllers/updateController');
const { authenticateDevice } = require('../middleware/apiKeyAuth');
const { deviceApiLimiter } = require('../middleware/rateLimiter');

// Semua route pakai device auth (API Key)
router.use(authenticateDevice);
router.use(deviceApiLimiter);

router.get('/check', updateController.checkUpdate.bind(updateController));
router.get('/download', updateController.downloadFirmware.bind(updateController));
router.post('/report', updateController.reportStatus.bind(updateController));

module.exports = router;
