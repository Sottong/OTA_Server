const prisma = require('../config/database');
const logger = require('../utils/logger');
const env = require('../config/env');

class NotificationService {
  async sendTelegram(chatId, botToken, message) {
    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      });
      const result = await response.json();
      if (!result.ok) {
        logger.error('Telegram API error', result);
      }
      return result;
    } catch (err) {
      logger.error('Failed to send Telegram notification', err);
    }
  }

  async _getWebhooks(projectId, event) {
    return prisma.webhookConfig.findMany({
      where: {
        projectId,
        isActive: true,
        events: { has: event },
      },
    });
  }

  async notifyUpdateSuccess(projectId, device, firmware) {
    const webhooks = await this._getWebhooks(projectId, 'update_success');
    for (const wh of webhooks) {
      if (wh.type === 'TELEGRAM') {
        const msg = `✅ <b>OTA Update Success</b>\n\nDevice: <code>${device.macAddress}</code>\nFirmware: v${firmware.version}\nProject: ${projectId}`;
        await this.sendTelegram(wh.endpoint, wh.token, msg);
      }
    }
  }

  async notifyUpdateFailed(projectId, device, firmware, errorMessage) {
    const webhooks = await this._getWebhooks(projectId, 'update_failed');
    for (const wh of webhooks) {
      if (wh.type === 'TELEGRAM') {
        const msg = `❌ <b>OTA Update Failed</b>\n\nDevice: <code>${device.macAddress}</code>\nFirmware: v${firmware.version}\nError: ${errorMessage || 'Unknown'}\nProject: ${projectId}`;
        await this.sendTelegram(wh.endpoint, wh.token, msg);
      }
    }
  }

  async notifyMassFailure(projectId, firmwareId, failedCount) {
    const webhooks = await this._getWebhooks(projectId, 'mass_failure');
    for (const wh of webhooks) {
      if (wh.type === 'TELEGRAM') {
        const msg = `🚨 <b>MASS FAILURE ALERT</b>\n\n${failedCount} devices failed to update in the last 10 minutes!\nFirmware ID: ${firmwareId}\nProject: ${projectId}\n\n⚠️ Consider rolling back to previous version!`;
        await this.sendTelegram(wh.endpoint, wh.token, msg);
      }
    }
  }

  async notifyNewRelease(projectId, firmware) {
    const webhooks = await this._getWebhooks(projectId, 'new_release');
    for (const wh of webhooks) {
      if (wh.type === 'TELEGRAM') {
        const msg = `🆕 <b>New Firmware Released</b>\n\nVersion: v${firmware.version}\nSize: ${(firmware.fileSize / 1024).toFixed(1)} KB\nNotes: ${firmware.releaseNotes || 'No release notes'}\nProject: ${projectId}`;
        await this.sendTelegram(wh.endpoint, wh.token, msg);
      }
    }
  }
}

module.exports = new NotificationService();
