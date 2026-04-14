const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const prisma = require('./config/database');
const fs = require('fs');
const cronService = require('./services/cronService');

// Pastikan folder penting ada
const dirs = ['uploads', 'logs'];
for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function main() {
  // Test database connection
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Start background services
    cronService.startCron();
  } catch (err) {
    logger.error('Failed to connect to database', err);
    process.exit(1);
  }

  // Start server
  app.listen(env.PORT, env.HOST, () => {
    logger.info(`🚀 OTA Server running at http://${env.HOST}:${env.PORT}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  logger.info('Server shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  logger.info('Server shutting down gracefully');
  process.exit(0);
});

main();
