const prisma = require('../config/database');
const { v4: uuidv4 } = require('uuid'); // Prisma sudah handle UUID, tapi untuk API Key custom

class ProjectService {
  async createProject(name, description) {
    return prisma.project.create({
      data: { name, description },
    });
  }

  async getAllProjects() {
    return prisma.project.findMany({
      include: {
        firmwares: {
          where: { isActive: true },
          take: 1,
        },
        _count: {
          select: {
            firmwares: true,
            devices: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getProjectById(id) {
    return prisma.project.findUnique({
      where: { id },
      include: {
        firmwares: { orderBy: { createdAt: 'desc' } },
        devices: { orderBy: { lastCheckedAt: 'desc' } },
        allowedMacs: true,
        webhookConfigs: true,
        rolloutGroups: true,
        _count: {
          select: { firmwares: true, devices: true },
        },
      },
    });
  }

  async deleteProject(id) {
    // Cascade delete akan handle firmwares, devices, dll
    return prisma.project.delete({ where: { id } });
  }

  async regenerateApiKey(id) {
    return prisma.project.update({
      where: { id },
      data: { apiKey: uuidv4() },
    });
  }

  // MAC Whitelist Management
  async addAllowedMac(projectId, macAddress, label) {
    return prisma.allowedMac.create({
      data: { projectId, macAddress: macAddress.toUpperCase(), label },
    });
  }

  async removeAllowedMac(id) {
    return prisma.allowedMac.delete({ where: { id } });
  }

  async getAllowedMacs(projectId) {
    return prisma.allowedMac.findMany({ where: { projectId } });
  }
}

module.exports = new ProjectService();
