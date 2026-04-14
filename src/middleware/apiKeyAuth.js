const prisma = require('../config/database');
const ApiResponse = require('../utils/apiResponse');

/**
 * Middleware untuk autentikasi device via API Key
 * Device mengirim API Key melalui header: X-API-Key
 * Dan Project ID melalui header: X-Project-ID atau query param
 */
async function authenticateDevice(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const projectId = req.headers['x-project-id'] || req.query.project_id;

  if (!apiKey || !projectId) {
    return ApiResponse.error(res, 'Missing X-API-Key or X-Project-ID header', 401);
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.apiKey !== apiKey) {
      return ApiResponse.error(res, 'Invalid API Key or Project ID', 403);
    }

    // Check MAC whitelist jika ada
    const macAddress = req.headers['x-device-mac'];
    if (macAddress) {
      const allowedMacs = await prisma.allowedMac.findMany({
        where: { projectId },
      });

      // Jika whitelist ada dan MAC tidak terdaftar, tolak
      if (allowedMacs.length > 0) {
        const isAllowed = allowedMacs.some(
          (m) => m.macAddress.toLowerCase() === macAddress.toLowerCase()
        );
        if (!isAllowed) {
          return ApiResponse.error(res, 'Device MAC address not whitelisted', 403);
        }
      }
    }

    req.project = project;
    req.deviceMac = macAddress;
    next();
  } catch (err) {
    return ApiResponse.error(res, 'Authentication failed', 500);
  }
}

module.exports = { authenticateDevice };
