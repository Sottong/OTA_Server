const express = require('express');
const router = express.Router({ mergeParams: true });
const webhookController = require('../controllers/webhookController');
const { authenticateJWT } = require('../middleware/auth');

router.use(authenticateJWT);

router.get('/', webhookController.renderSettings.bind(webhookController));
router.post('/', webhookController.createWebhook.bind(webhookController));
router.post('/:id/test', webhookController.testWebhook.bind(webhookController));
router.post('/:id/delete', webhookController.deleteWebhook.bind(webhookController));

module.exports = router;
