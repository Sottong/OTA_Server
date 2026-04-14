const deviceService = require('../services/deviceService');

class DeviceController {
  async listDevices(req, res, next) {
    try {
      const { projectId } = req.params;
      const devices = await deviceService.getDevicesByProject(projectId);
      const stats = await deviceService.getDeviceStats(projectId);
      res.render('devices/list', { title: 'Devices', devices, stats, projectId });
    } catch (err) { next(err); }
  }

  async getDeviceDetail(req, res, next) {
    try {
      const device = await deviceService.getDeviceById(req.params.id);
      if (!device) return res.status(404).render('error', { message: 'Device not found' });
      res.render('devices/detail', { title: device.macAddress, device });
    } catch (err) { next(err); }
  }

  async getUpdateLogs(req, res, next) {
    try {
      const { projectId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const { logs, total } = await deviceService.getUpdateLogs(projectId, page);
      res.render('devices/logs', { title: 'Update Logs', logs, total, page, projectId });
    } catch (err) { next(err); }
  }
}

module.exports = new DeviceController();
