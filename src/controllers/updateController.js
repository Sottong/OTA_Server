const updateService = require('../services/updateService');
const firmwareService = require('../services/firmwareService');
const ApiResponse = require('../utils/apiResponse');
const fs = require('fs');
const path = require('path');

class UpdateController {
  /**
   * GET /api/update/check
   *
   * Headers yang dibutuhkan dari ESP32:
   *   X-API-Key: <project_api_key>
   *   X-Project-ID: <project_id>
   *   X-Device-MAC: <mac_address>
   *   X-Current-Version: <current_firmware_version>
   *
   * Response:
   *   200: { updateAvailable: true/false, firmware: { version, fileSize, md5, downloadUrl } }
   */
  async checkUpdate(req, res, next) {
    try {
      const projectId = req.project.id;
      const currentVersion = req.headers['x-current-version'] || req.query.current_version || '0.0.0';
      const macAddress = req.deviceMac || req.headers['x-device-mac'] || 'UNKNOWN';
      const ipAddress = req.ip || req.connection.remoteAddress;

      const result = await updateService.checkUpdate(projectId, currentVersion, macAddress, ipAddress);

      return ApiResponse.success(res, result);
    } catch (err) { next(err); }
  }

  /**
   * GET /api/update/download
   *
   * Headers:
   *   X-API-Key: <project_api_key>
   *   X-Project-ID: <project_id>
   *
   * Response: Binary .bin file stream
   *
   * Compatible dengan ESP32 HTTPUpdate.h:
   *   - Content-Type: application/octet-stream
   *   - Content-Length header
   *   - x-MD5 header untuk checksum verification
   */
  async downloadFirmware(req, res, next) {
    try {
      const projectId = req.project.id;

      const activeFirmware = await firmwareService.getActiveFirmware(projectId);
      if (!activeFirmware) {
        return ApiResponse.error(res, 'No active firmware', 404);
      }

      // Cek file exists
      if (!fs.existsSync(activeFirmware.filePath)) {
        return ApiResponse.error(res, 'Firmware file not found on server', 500);
      }

      // Log download event
      const macAddress = req.deviceMac || req.headers['x-device-mac'] || 'UNKNOWN';
      await updateService.reportUpdateStatus(
        projectId, macAddress, activeFirmware.version, 'DOWNLOADING'
      );

      // Set headers compatible with ESP32 HTTPUpdate
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', activeFirmware.fileSize);
      res.setHeader('Content-Disposition', `attachment; filename="firmware_v${activeFirmware.version}.bin"`);
      res.setHeader('x-MD5', activeFirmware.md5Checksum); // ESP32 uses this for verification

      // Stream file
      const fileStream = fs.createReadStream(activeFirmware.filePath);
      fileStream.pipe(res);
    } catch (err) { next(err); }
  }

  /**
   * POST /api/update/report
   *
   * ESP32 reports update hasil (success/failed) setelah flash
   * Body: { status: "SUCCESS"|"FAILED", message: "optional error message" }
   */
  async reportStatus(req, res, next) {
    try {
      const projectId = req.project.id;
      const macAddress = req.deviceMac || req.headers['x-device-mac'];
      const { version, status, message } = req.body;

      if (!macAddress || !version || !status) {
        return ApiResponse.error(res, 'Missing required fields: version, status', 400);
      }

      await updateService.reportUpdateStatus(projectId, macAddress, version, status, message);

      return ApiResponse.success(res, null, 'Status reported');
    } catch (err) { next(err); }
  }
}

module.exports = new UpdateController();
