const prisma = require('../config/database');

class DeviceService {
  async getDevicesByProject(projectId) {
    return prisma.device.findMany({
      where: { projectId },
      orderBy: { lastCheckedAt: 'desc' },
      include: {
        updateLogs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });
  }

  async getDeviceById(id) {
    return prisma.device.findUnique({
      where: { id },
      include: {
        project: true,
        updateLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { firmware: true },
        },
      },
    });
  }

  async getDeviceStats(projectId) {
    const [total, online, upToDate, outdated] = await Promise.all([
      prisma.device.count({ where: { projectId } }),
      prisma.device.count({ where: { projectId, isOnline: true } }),
      // Up to date: device version = active firmware version
      prisma.$queryRaw`
        SELECT COUNT(*) as count FROM devices d
        JOIN firmwares f ON d."projectId" = f."projectId" AND f."isActive" = true
        WHERE d."projectId" = ${projectId} AND d."currentVersion" = f.version
      `,
      prisma.$queryRaw`
        SELECT COUNT(*) as count FROM devices d
        JOIN firmwares f ON d."projectId" = f."projectId" AND f."isActive" = true
        WHERE d."projectId" = ${projectId} AND (d."currentVersion" IS NULL OR d."currentVersion" != f.version)
      `,
    ]);

    return {
      total,
      online,
      upToDate: Number(upToDate[0]?.count || 0),
      outdated: Number(outdated[0]?.count || 0),
    };
  }

  async getUpdateLogs(projectId, page = 1, limit = 50) {
    const where = {
      device: { projectId },
    };

    const [logs, total] = await Promise.all([
      prisma.updateLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          device: true,
          firmware: true,
        },
      }),
      prisma.updateLog.count({ where }),
    ]);

    return { logs, total };
  }
}

module.exports = new DeviceService();
