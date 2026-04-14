const prisma = require('../config/database');
const notificationService = require('../services/notificationService');
const ApiResponse = require('../utils/apiResponse');

class WebhookController {
  async renderSettings(req, res, next) {
    try {
      const { projectId } = req.params;
      const webhooks = await prisma.webhookConfig.findMany({ where: { projectId } });
      res.render('settings/webhooks', { title: 'Webhook Settings', webhooks, projectId, error: null, success: null });
    } catch (err) { next(err); }
  }

  async createWebhook(req, res, next) {
    try {
      const { projectId } = req.params;
      const { type, endpoint, token, events } = req.body;

      await prisma.webhookConfig.create({
        data: {
          projectId,
          type,
          endpoint,
          token: token || null,
          events: Array.isArray(events) ? events : [events],
        },
      });

      res.redirect(`/projects/${projectId}/webhooks`);
    } catch (err) { next(err); }
  }

  async testWebhook(req, res, next) {
    try {
      const webhook = await prisma.webhookConfig.findUnique({ where: { id: req.params.id } });
      if (!webhook) return ApiResponse.error(res, 'Webhook not found', 404);

      if (webhook.type === 'TELEGRAM') {
        await notificationService.sendTelegram(
          webhook.endpoint,
          webhook.token,
          '🧪 <b>Test Notification</b>\n\nThis is a test message from ESP32 OTA Server. If you see this, your webhook is working!'
        );
      }

      res.redirect(`/projects/${webhook.projectId}/webhooks`);
    } catch (err) { next(err); }
  }

  async deleteWebhook(req, res, next) {
    try {
      const webhook = await prisma.webhookConfig.findUnique({ where: { id: req.params.id } });
      if (!webhook) return ApiResponse.error(res, 'Webhook not found', 404);

      await prisma.webhookConfig.delete({ where: { id: req.params.id } });
      res.redirect(`/projects/${webhook.projectId}/webhooks`);
    } catch (err) { next(err); }
  }
}

module.exports = new WebhookController();
