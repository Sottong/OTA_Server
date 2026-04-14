const prisma = require('../config/database');
const logger = require('../utils/logger');

async function markOfflineDevices() {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const result = await prisma.device.updateMany({
      where: {
        isOnline: true,
        lastCheckedAt: { lt: thirtyMinutesAgo },
      },
      data: { isOnline: false },
    });
    if (result.count > 0) {
      logger.info(`Marked ${result.count} devices as offline`);
    }
  } catch (err) {
    logger.error('Failed to run offline detection cron', err);
  }
}

// Jalankan setiap 5 menit
function startCron() {
  logger.info('Starting Device Status Cron Job (5m interval)');
  setInterval(markOfflineDevices, 5 * 60 * 1000);
}

module.exports = { startCron };
