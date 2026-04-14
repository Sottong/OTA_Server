const prisma = require('../config/database');
const checksumService = require('./checksumService');
const { isValidVersion } = require('../utils/semver');
const fs = require('fs');
const path = require('path');

class FirmwareService {
  async uploadFirmware(projectId, version, releaseNotes, file) {
    // Validasi versi
    if (!isValidVersion(version)) {
      throw Object.assign(new Error('Invalid version format. Use semantic versioning: x.y.z'), { statusCode: 400 });
    }

    // Hilangkan prefix v jika ada
    const cleanVersion = version.replace(/^v/, '');

    // Cek duplikat versi
    const existing = await prisma.firmware.findUnique({
      where: { projectId_version: { projectId, version: cleanVersion } },
    });
    if (existing) {
      // Hapus file yang baru diupload
      fs.unlinkSync(file.path);
      throw Object.assign(new Error(`Version ${cleanVersion} already exists for this project`), { statusCode: 409 });
    }

    // Hitung MD5 checksum
    const md5Checksum = await checksumService.calculateMD5(file.path);

    return prisma.firmware.create({
      data: {
        projectId,
        version: cleanVersion,
        releaseNotes,
        filePath: file.path,
        fileSize: file.size,
        md5Checksum,
      },
    });
  }

  async getFirmwaresByProject(projectId) {
    return prisma.firmware.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { updateLogs: true } },
      },
    });
  }

  async getFirmwareById(id) {
    return prisma.firmware.findUnique({
      where: { id },
      include: {
        project: true,
        updateLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { device: true },
        },
      },
    });
  }

  async setActiveFirmware(projectId, firmwareId) {
    // Transaction: set semua firmware di project ini jadi inactive, lalu activate yang dipilih
    return prisma.$transaction([
      prisma.firmware.updateMany({
        where: { projectId },
        data: { isActive: false },
      }),
      prisma.firmware.update({
        where: { id: firmwareId },
        data: { isActive: true },
      }),
    ]);
  }

  async deleteFirmware(id) {
    const firmware = await prisma.firmware.findUnique({ where: { id } });
    if (!firmware) throw Object.assign(new Error('Firmware not found'), { statusCode: 404 });

    // Hapus file dari disk
    if (fs.existsSync(firmware.filePath)) {
      fs.unlinkSync(firmware.filePath);
    }

    return prisma.firmware.delete({ where: { id } });
  }

  async getActiveFirmware(projectId) {
    return prisma.firmware.findFirst({
      where: { projectId, isActive: true },
    });
  }
}

module.exports = new FirmwareService();
