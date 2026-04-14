const firmwareService = require('../services/firmwareService');
const notificationService = require('../services/notificationService');
const ApiResponse = require('../utils/apiResponse');

class FirmwareController {
  // GET /projects/:projectId/firmware/upload - Render upload form
  renderUploadForm(req, res) {
    res.render('firmware/upload', {
      title: 'Upload Firmware',
      projectId: req.params.projectId,
      error: null,
    });
  }

  // POST /projects/:projectId/firmware - Upload firmware
  async uploadFirmware(req, res, next) {
    try {
      const { projectId } = req.params;
      const { version, releaseNotes } = req.body;
      const file = req.file;

      if (!file) {
        return res.render('firmware/upload', {
          title: 'Upload Firmware',
          projectId,
          error: 'Please select a .bin file',
        });
      }

      const firmware = await firmwareService.uploadFirmware(projectId, version, releaseNotes, file);

      // Kirim notifikasi new release
      await notificationService.notifyNewRelease(projectId, firmware);

      res.redirect(`/projects/${projectId}`);
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 409) {
        return res.render('firmware/upload', {
          title: 'Upload Firmware',
          projectId: req.params.projectId,
          error: err.message,
        });
      }
      next(err);
    }
  }

  // GET /projects/:projectId/firmware/:id - Firmware detail
  async getFirmwareDetail(req, res, next) {
    try {
      const firmware = await firmwareService.getFirmwareById(req.params.id);
      if (!firmware) return res.status(404).render('error', { message: 'Firmware not found' });

      res.render('firmware/detail', { title: `v${firmware.version}`, firmware });
    } catch (err) { next(err); }
  }

  // POST /projects/:projectId/firmware/:id/activate - Set firmware as active
  async setActiveFirmware(req, res, next) {
    try {
      await firmwareService.setActiveFirmware(req.params.projectId, req.params.id);
      res.redirect(`/projects/${req.params.projectId}`);
    } catch (err) { next(err); }
  }

  // POST /projects/:projectId/firmware/:id/delete - Delete firmware
  async deleteFirmware(req, res, next) {
    try {
      await firmwareService.deleteFirmware(req.params.id);
      res.redirect(`/projects/${req.params.projectId}`);
    } catch (err) { next(err); }
  }
}

module.exports = new FirmwareController();
