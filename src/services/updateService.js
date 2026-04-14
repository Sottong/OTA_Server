const prisma = require('../config/database');
const firmwareService = require('./firmwareService');
const notificationService = require('./notificationService');
const { compareVersions } = require('../utils/semver');
const logger = require('../utils/logger');

class UpdateService {
  /**
   * Check apakah ada update untuk device
   * @param {string} projectId
   * @param {string} currentVersion - Versi firmware saat ini di device
   * @param {string} macAddress - MAC address device
   * @param {string} ipAddress - IP address device
   */
  async checkUpdate(projectId, currentVersion, macAddress, ipAddress) {
    // Upsert device record (auto-register device saat pertama kali check)
    const device = await prisma.device.upsert({
      where: {
        macAddress_projectId: { macAddress: macAddress.toUpperCase(), projectId },
      },
      update: {
        currentVersion,
        lastCheckedAt: new Date(),
        ipAddress,
        isOnline: true,
      },
      create: {
        macAddress: macAddress.toUpperCase(),
        projectId,
        currentVersion,
        lastCheckedAt: new Date(),
        ipAddress,
        isOnline: true,
      },
    });

    // Cek staged rollout: apakah device ini di group tertentu?
    // Untuk sekarang, cek firmware yang active
    const activeFirmware = await firmwareService.getActiveFirmware(projectId);

    if (!activeFirmware) {
      // Log status
      await this._logUpdate(device.id, null, 'SKIPPED', 'No active firmware');
      return { updateAvailable: false, message: 'No active firmware' };
    }

    // Bandingkan versi
    const comparison = compareVersions(activeFirmware.version, currentVersion || '0.0.0');

    if (comparison <= 0) {
      await this._logUpdate(device.id, activeFirmware.id, 'SKIPPED', 'Already up to date');
      return { updateAvailable: false, message: 'Already up to date' };
    }

    // Ada update!
    await this._logUpdate(device.id, activeFirmware.id, 'CHECKING');

    return {
      updateAvailable: true,
      firmware: {
        version: activeFirmware.version,
        fileSize: activeFirmware.fileSize,
        md5Checksum: activeFirmware.md5Checksum,
        releaseNotes: activeFirmware.releaseNotes,
        downloadUrl: `/api/update/download?project_id=${projectId}`,
      },
    };
  }

  /**
   * Report status update dari device setelah download
   */
  async reportUpdateStatus(projectId, macAddress, firmwareVersion, status, message) {
    const device = await prisma.device.findUnique({
      where: {
        macAddress_projectId: { macAddress: macAddress.toUpperCase(), projectId },
      },
    });

    if (!device) return;

    const firmware = await prisma.firmware.findUnique({
      where: {
        projectId_version: { projectId, version: firmwareVersion },
      },
    });

    if (!firmware) return;

    if (status === 'SUCCESS') {
      await prisma.device.update({
        where: { id: device.id },
        data: { currentVersion: firmwareVersion, lastUpdatedAt: new Date() },
      });
    }

    await this._logUpdate(device.id, firmware.id, status, message);

    // Cek mass failure dan kirim notifikasi
    if (status === 'FAILED') {
      await this._checkMassFailure(projectId, firmware.id);
      await notificationService.notifyUpdateFailed(projectId, device, firmware, message);
    }

    if (status === 'SUCCESS') {
      await notificationService.notifyUpdateSuccess(projectId, device, firmware);
    }
  }

  async _logUpdate(deviceId, firmwareId, status, message = null) {
    if (!firmwareId) return; // Skip logging jika tidak ada firmware
    try {
      await prisma.updateLog.create({
        data: { deviceId, firmwareId, status, message },
      });
    } catch (err) {
      logger.error('Failed to create update log', err);
    }
  }

  async _checkMassFailure(projectId, firmwareId) {
    // Cek jika > 5 device gagal dalam 10 menit terakhir
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const failedCount = await prisma.updateLog.count({
      where: {
        firmwareId,
        status: 'FAILED',
        createdAt: { gte: tenMinutesAgo },
      },
    });

    if (failedCount >= 5) {
      logger.warn(`Mass failure detected for firmware ${firmwareId}: ${failedCount} failures`);
      await notificationService.notifyMassFailure(projectId, firmwareId, failedCount);
    }
  }
}

module.exports = new UpdateService();
