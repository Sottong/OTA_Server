const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const projectRoutes = require('./projectRoutes');
const firmwareRoutes = require('./firmwareRoutes');
const deviceRoutes = require('./deviceRoutes');
const updateRoutes = require('./updateRoutes');
const webhookRoutes = require('./webhookRoutes');
const { authenticateJWT } = require('../middleware/auth');

// Auth routes (public)
router.use('/auth', authRoutes);

// Device API routes (API Key auth)
router.use('/api/update', updateRoutes);

// Dashboard (redirect)
router.get('/', (req, res) => res.redirect('/dashboard'));

// Dashboard route
router.get('/dashboard', authenticateJWT, async (req, res, next) => {
  try {
    const prisma = require('../config/database');
    const projects = await prisma.project.findMany({
      include: {
        _count: { select: { firmwares: true, devices: true } },
        firmwares: { where: { isActive: true }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    const totalProjects = await prisma.project.count();
    const totalDevices = await prisma.device.count();
    const totalFirmwares = await prisma.firmware.count();
    const recentLogs = await prisma.updateLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { device: true, firmware: true },
    });

    res.render('dashboard/index', {
      title: 'Dashboard',
      projects,
      totalProjects,
      totalDevices,
      totalFirmwares,
      recentLogs,
    });
  } catch (err) { next(err); }
});

// Admin panel routes
router.use('/projects', projectRoutes);
router.use('/projects/:projectId/firmware', firmwareRoutes);
router.use('/projects/:projectId/devices', deviceRoutes);
router.use('/projects/:projectId/webhooks', webhookRoutes);

module.exports = router;
