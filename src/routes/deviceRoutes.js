const express = require('express');
const router = express.Router({ mergeParams: true });
const deviceController = require('../controllers/deviceController');
const { authenticateJWT } = require('../middleware/auth');

router.use(authenticateJWT);

router.get('/', deviceController.listDevices.bind(deviceController));
router.get('/logs', deviceController.getUpdateLogs.bind(deviceController));
router.get('/:id', deviceController.getDeviceDetail.bind(deviceController));

module.exports = router;
