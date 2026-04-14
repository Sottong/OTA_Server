# Implementation Plan: ESP32 OTA Management Server

## Tujuan

Membangun platform OTA (Over-The-Air) update server berbasis web untuk mengelola firmware ESP32. Server berjalan di VPS dengan Docker, menyediakan Web Dashboard untuk admin dan REST API untuk device ESP32.

---

## Tech Stack

| Komponen | Teknologi | Alasan |
|---|---|---|
| Backend | Node.js + Express.js | Ringan, ecosystem besar, mudah di-deploy |
| Database | PostgreSQL 16 | Relational, cocok untuk relasi project-firmware-device |
| ORM | Prisma | Type-safe, migration tool bawaan, mudah dipelajari |
| File Storage | Local filesystem (VPS) | Simpel, bisa upgrade ke S3 nanti |
| Auth (Admin) | JWT + bcrypt | Session-less, cocok untuk REST API |
| Auth (Device) | API Key per project | Simpel, sesuai kebutuhan IoT |
| Frontend Dashboard | EJS Templates + Vanilla JS + CSS | Server-side rendered, ringan, tanpa build step |
| Containerization | Docker + docker-compose | Standar deployment |
| Reverse Proxy | NGINX | SSL termination, static files |
| Notification | Telegram Bot API | Gratis, real-time |

---

## Struktur Folder Project

```
OTA_Server/
├── docker-compose.yml
├── Dockerfile
├── nginx/
│   ├── nginx.conf
│   └── ssl/                    # SSL certificates (gitignored)
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app.js                  # Express app setup
│   ├── server.js               # Entry point, start server
│   ├── config/
│   │   ├── database.js         # Prisma client instance
│   │   ├── env.js              # Environment variables validation
│   │   └── multer.js           # File upload config
│   ├── middleware/
│   │   ├── auth.js             # JWT authentication middleware
│   │   ├── apiKeyAuth.js       # API Key auth for devices
│   │   ├── errorHandler.js     # Global error handler
│   │   └── rateLimiter.js      # Rate limiting
│   ├── routes/
│   │   ├── index.js            # Route aggregator
│   │   ├── authRoutes.js       # Login, register
│   │   ├── projectRoutes.js    # CRUD project
│   │   ├── firmwareRoutes.js   # Upload, list, set active, delete firmware
│   │   ├── deviceRoutes.js     # Device management & fleet monitoring
│   │   ├── updateRoutes.js     # Device API (check update, download)
│   │   └── webhookRoutes.js    # Webhook/notification settings
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── projectController.js
│   │   ├── firmwareController.js
│   │   ├── deviceController.js
│   │   ├── updateController.js
│   │   └── webhookController.js
│   ├── services/
│   │   ├── authService.js
│   │   ├── projectService.js
│   │   ├── firmwareService.js
│   │   ├── deviceService.js
│   │   ├── updateService.js
│   │   ├── checksumService.js  # MD5 hash generation & verification
│   │   └── notificationService.js  # Telegram/Email notification
│   ├── utils/
│   │   ├── semver.js           # Semantic versioning comparison
│   │   ├── apiResponse.js      # Standardized API response helper
│   │   └── logger.js           # Winston logger setup
│   └── views/
│       ├── layouts/
│       │   └── main.ejs        # Base layout with navbar, sidebar
│       ├── partials/
│       │   ├── header.ejs
│       │   ├── sidebar.ejs
│       │   └── footer.ejs
│       ├── auth/
│       │   └── login.ejs
│       ├── dashboard/
│       │   └── index.ejs       # Overview: total projects, devices, recent activity
│       ├── projects/
│       │   ├── list.ejs        # All projects
│       │   ├── detail.ejs      # Single project + firmware list
│       │   └── create.ejs      # Create new project form
│       ├── firmware/
│       │   ├── upload.ejs      # Upload firmware form
│       │   └── detail.ejs      # Firmware detail + release notes
│       ├── devices/
│       │   ├── list.ejs        # Fleet monitoring - all devices
│       │   └── detail.ejs      # Single device history
│       └── settings/
│           └── webhooks.ejs    # Webhook configuration
├── public/
│   ├── css/
│   │   └── style.css           # Global styles
│   ├── js/
│   │   └── app.js              # Client-side JS
│   └── images/
│       └── logo.svg
├── uploads/                    # Firmware .bin files (gitignored)
├── logs/                       # Application logs (gitignored)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Database Schema (Prisma)

### File: `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ==================== MODELS ====================

model User {
  id        String   @id @default(uuid())
  username  String   @unique
  email     String   @unique
  password  String   // bcrypt hashed
  role      Role     @default(ADMIN)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
}

enum Role {
  ADMIN
  VIEWER
}

model Project {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?
  apiKey      String   @unique @default(uuid()) // API Key untuk device auth
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  firmwares       Firmware[]
  devices         Device[]
  allowedMacs     AllowedMac[]
  webhookConfigs  WebhookConfig[]
  rolloutGroups   RolloutGroup[]

  @@map("projects")
}

model Firmware {
  id           String        @id @default(uuid())
  projectId    String
  version      String        // Semantic versioning: "1.0.0", "1.2.3"
  releaseNotes String?
  filePath     String        // Path to .bin file on disk
  fileSize     Int           // File size in bytes
  md5Checksum  String        // MD5 hash of .bin file
  isActive     Boolean       @default(false) // Only ONE firmware per project can be active
  createdAt    DateTime      @default(now())

  project      Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  updateLogs   UpdateLog[]

  @@unique([projectId, version]) // Satu project tidak boleh punya versi duplikat
  @@map("firmwares")
}

model Device {
  id              String   @id @default(uuid())
  macAddress      String
  projectId       String
  currentVersion  String?  // Versi firmware saat ini di device
  lastCheckedAt   DateTime? // Terakhir kali device cek update
  lastUpdatedAt   DateTime? // Terakhir kali device berhasil update
  ipAddress       String?  // IP address device saat check-in
  isOnline        Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  project         Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  updateLogs      UpdateLog[]

  @@unique([macAddress, projectId]) // Satu MAC hanya bisa 1x per project
  @@map("devices")
}

model AllowedMac {
  id        String   @id @default(uuid())
  macAddress String
  projectId  String
  label      String?  // Nama/label device (opsional)
  createdAt  DateTime @default(now())

  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([macAddress, projectId])
  @@map("allowed_macs")
}

model RolloutGroup {
  id          String   @id @default(uuid())
  name        String   // e.g., "Beta Testers", "Production"
  projectId   String
  macAddresses String[] // Array of MAC addresses in this group
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([name, projectId])
  @@map("rollout_groups")
}

model UpdateLog {
  id         String       @id @default(uuid())
  deviceId   String
  firmwareId String
  status     UpdateStatus
  message    String?      // Error message jika gagal
  createdAt  DateTime     @default(now())

  device     Device       @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  firmware   Firmware     @relation(fields: [firmwareId], references: [id], onDelete: Cascade)

  @@map("update_logs")
}

enum UpdateStatus {
  CHECKING    // Device sedang cek update
  DOWNLOADING // Device sedang download
  SUCCESS     // Update berhasil
  FAILED      // Update gagal
  SKIPPED     // Device skip update (sudah versi terbaru)
}

model WebhookConfig {
  id          String      @id @default(uuid())
  projectId   String
  type        WebhookType
  endpoint    String      // Telegram chat_id atau Email address atau URL
  token       String?     // Bot token untuk Telegram
  isActive    Boolean     @default(true)
  events      String[]    // ["update_success", "update_failed", "new_release", "mass_failure"]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  project     Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@map("webhook_configs")
}

enum WebhookType {
  TELEGRAM
  EMAIL
  CUSTOM_URL
}
```

---

## Phase 1: Project Setup & Configuration

### 1.1 File: `package.json`

```json
{
  "name": "esp32-ota-server",
  "version": "1.0.0",
  "description": "ESP32 OTA Firmware Management Server",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "db:migrate": "npx prisma migrate dev",
    "db:push": "npx prisma db push",
    "db:seed": "node prisma/seed.js",
    "db:studio": "npx prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^6.x",
    "bcryptjs": "^2.4.3",
    "compression": "^1.7.4",
    "cors": "^2.8.5",
    "dotenv": "^16.x",
    "ejs": "^3.1.10",
    "express": "^4.21.x",
    "express-rate-limit": "^7.x",
    "helmet": "^8.x",
    "jsonwebtoken": "^9.x",
    "morgan": "^1.10.0",
    "multer": "^1.4.5-lts.1",
    "winston": "^3.x",
    "node-fetch": "^3.x"
  },
  "devDependencies": {
    "nodemon": "^3.x",
    "prisma": "^6.x"
  }
}
```

### 1.2 File: `.env.example`

```env
# Server
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://ota_user:ota_password@db:5432/ota_server

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=7d

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=16777216  # 16MB in bytes

# Telegram (opsional)
TELEGRAM_BOT_TOKEN=
TELEGRAM_DEFAULT_CHAT_ID=

# Admin Default (untuk seed)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_EMAIL=admin@example.com
```

### 1.3 File: `.gitignore`

```gitignore
node_modules/
uploads/
logs/
.env
nginx/ssl/
*.log
dist/
```

### 1.4 File: `src/config/env.js`

Validasi environment variables saat startup. Jika variabel wajib tidak ada, throw error.

```javascript
const dotenv = require('dotenv');
dotenv.config();

const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE, 10) || 16 * 1024 * 1024,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_DEFAULT_CHAT_ID: process.env.TELEGRAM_DEFAULT_CHAT_ID || '',
};
```

### 1.5 File: `src/config/database.js`

```javascript
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

module.exports = prisma;
```

### 1.6 File: `src/config/multer.js`

```javascript
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const env = require('./env');

// Pastikan upload dir ada
if (!fs.existsSync(env.UPLOAD_DIR)) {
  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectDir = path.join(env.UPLOAD_DIR, req.params.projectId);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    cb(null, projectDir);
  },
  filename: (req, file, cb) => {
    // Format: firmware_v1.0.0_<timestamp>.bin
    const version = req.body.version || 'unknown';
    const timestamp = Date.now();
    cb(null, `firmware_v${version}_${timestamp}.bin`);
  },
});

const fileFilter = (req, file, cb) => {
  // Hanya terima file .bin
  if (path.extname(file.originalname).toLowerCase() === '.bin') {
    cb(null, true);
  } else {
    cb(new Error('Only .bin files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.MAX_FILE_SIZE },
});

module.exports = upload;
```

---

## Phase 2: Utility Modules

### 2.1 File: `src/utils/apiResponse.js`

Standardized API response format.

```javascript
class ApiResponse {
  static success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  }

  static error(res, message = 'Internal Server Error', statusCode = 500, errors = null) {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
    });
  }

  static paginated(res, data, page, limit, total) {
    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }
}

module.exports = ApiResponse;
```

### 2.2 File: `src/utils/semver.js`

Fungsi perbandingan Semantic Versioning.

```javascript
/**
 * Parse version string "1.2.3" atau "v1.2.3" menjadi object {major, minor, patch}
 */
function parseVersion(versionStr) {
  const cleaned = versionStr.replace(/^v/, '');
  const parts = cleaned.split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

/**
 * Compare dua versi.
 * Returns: 1 jika a > b, -1 jika a < b, 0 jika sama
 */
function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);

  if (va.major !== vb.major) return va.major > vb.major ? 1 : -1;
  if (va.minor !== vb.minor) return va.minor > vb.minor ? 1 : -1;
  if (va.patch !== vb.patch) return va.patch > vb.patch ? 1 : -1;
  return 0;
}

/**
 * Validasi format semantic versioning
 */
function isValidVersion(versionStr) {
  const regex = /^v?\d+\.\d+\.\d+$/;
  return regex.test(versionStr);
}

module.exports = { parseVersion, compareVersions, isValidVersion };
```

### 2.3 File: `src/utils/logger.js`

```javascript
const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'ota-server' },
  transports: [
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

module.exports = logger;
```

---

## Phase 3: Middleware

### 3.1 File: `src/middleware/auth.js`

JWT Authentication untuk admin dashboard.

```javascript
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiResponse = require('../utils/apiResponse');

// Middleware untuk route yang butuh login (dashboard)
function authenticateJWT(req, res, next) {
  // Cek token dari cookie atau header
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];

  if (!token) {
    // Jika request dari browser, redirect ke login
    if (req.accepts('html')) {
      return res.redirect('/auth/login');
    }
    return ApiResponse.error(res, 'Authentication required', 401);
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (req.accepts('html')) {
      return res.redirect('/auth/login');
    }
    return ApiResponse.error(res, 'Invalid or expired token', 401);
  }
}

module.exports = { authenticateJWT };
```

### 3.2 File: `src/middleware/apiKeyAuth.js`

API Key authentication untuk ESP32 devices.

```javascript
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
```

### 3.3 File: `src/middleware/errorHandler.js`

```javascript
const logger = require('../utils/logger');
const ApiResponse = require('../utils/apiResponse');

function errorHandler(err, req, res, next) {
  logger.error(err.message, { stack: err.stack });

  if (err.code === 'LIMIT_FILE_SIZE') {
    return ApiResponse.error(res, 'File too large. Max size is 16MB', 413);
  }

  if (err.message === 'Only .bin files are allowed') {
    return ApiResponse.error(res, err.message, 400);
  }

  // Prisma errors
  if (err.code === 'P2002') {
    return ApiResponse.error(res, 'Duplicate entry. Record already exists.', 409);
  }
  if (err.code === 'P2025') {
    return ApiResponse.error(res, 'Record not found.', 404);
  }

  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : err.message;

  return ApiResponse.error(res, message, statusCode);
}

module.exports = errorHandler;
```

### 3.4 File: `src/middleware/rateLimiter.js`

```javascript
const rateLimit = require('express-rate-limit');

// Rate limit untuk device API (check update)
const deviceApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 menit
  max: 30, // 30 requests per menit per IP
  message: { success: false, message: 'Too many requests, try again later' },
});

// Rate limit untuk login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 10, // 10 attempts per 15 menit
  message: { success: false, message: 'Too many login attempts' },
});

// Rate limit untuk upload
const uploadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many upload requests' },
});

module.exports = { deviceApiLimiter, loginLimiter, uploadLimiter };
```

---

## Phase 4: Services (Business Logic)

### 4.1 File: `src/services/authService.js`

```javascript
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const env = require('../config/env');

class AuthService {
  async login(username, password) {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    return { token, user: { id: user.id, username: user.username, role: user.role } };
  }

  async createUser(username, email, password, role = 'ADMIN') {
    const hashedPassword = await bcrypt.hash(password, 12);
    return prisma.user.create({
      data: { username, email, password: hashedPassword, role },
    });
  }

  async changePassword(userId, oldPassword, newPassword) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) throw Object.assign(new Error('Invalid old password'), { statusCode: 400 });

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    return prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }
}

module.exports = new AuthService();
```

### 4.2 File: `src/services/projectService.js`

```javascript
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
```

### 4.3 File: `src/services/firmwareService.js`

```javascript
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
```

### 4.4 File: `src/services/checksumService.js`

```javascript
const crypto = require('crypto');
const fs = require('fs');

class ChecksumService {
  calculateMD5(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}

module.exports = new ChecksumService();
```

### 4.5 File: `src/services/updateService.js`

Ini adalah service inti yang handle logic check update dan download untuk device ESP32.

```javascript
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
```

### 4.6 File: `src/services/deviceService.js`

```javascript
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
```

### 4.7 File: `src/services/notificationService.js`

```javascript
const prisma = require('../config/database');
const logger = require('../utils/logger');
const env = require('../config/env');

class NotificationService {
  async sendTelegram(chatId, botToken, message) {
    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      });
      const result = await response.json();
      if (!result.ok) {
        logger.error('Telegram API error', result);
      }
      return result;
    } catch (err) {
      logger.error('Failed to send Telegram notification', err);
    }
  }

  async _getWebhooks(projectId, event) {
    return prisma.webhookConfig.findMany({
      where: {
        projectId,
        isActive: true,
        events: { has: event },
      },
    });
  }

  async notifyUpdateSuccess(projectId, device, firmware) {
    const webhooks = await this._getWebhooks(projectId, 'update_success');
    for (const wh of webhooks) {
      if (wh.type === 'TELEGRAM') {
        const msg = `✅ <b>OTA Update Success</b>\n\nDevice: <code>${device.macAddress}</code>\nFirmware: v${firmware.version}\nProject: ${projectId}`;
        await this.sendTelegram(wh.endpoint, wh.token, msg);
      }
    }
  }

  async notifyUpdateFailed(projectId, device, firmware, errorMessage) {
    const webhooks = await this._getWebhooks(projectId, 'update_failed');
    for (const wh of webhooks) {
      if (wh.type === 'TELEGRAM') {
        const msg = `❌ <b>OTA Update Failed</b>\n\nDevice: <code>${device.macAddress}</code>\nFirmware: v${firmware.version}\nError: ${errorMessage || 'Unknown'}\nProject: ${projectId}`;
        await this.sendTelegram(wh.endpoint, wh.token, msg);
      }
    }
  }

  async notifyMassFailure(projectId, firmwareId, failedCount) {
    const webhooks = await this._getWebhooks(projectId, 'mass_failure');
    for (const wh of webhooks) {
      if (wh.type === 'TELEGRAM') {
        const msg = `🚨 <b>MASS FAILURE ALERT</b>\n\n${failedCount} devices failed to update in the last 10 minutes!\nFirmware ID: ${firmwareId}\nProject: ${projectId}\n\n⚠️ Consider rolling back to previous version!`;
        await this.sendTelegram(wh.endpoint, wh.token, msg);
      }
    }
  }

  async notifyNewRelease(projectId, firmware) {
    const webhooks = await this._getWebhooks(projectId, 'new_release');
    for (const wh of webhooks) {
      if (wh.type === 'TELEGRAM') {
        const msg = `🆕 <b>New Firmware Released</b>\n\nVersion: v${firmware.version}\nSize: ${(firmware.fileSize / 1024).toFixed(1)} KB\nNotes: ${firmware.releaseNotes || 'No release notes'}\nProject: ${projectId}`;
        await this.sendTelegram(wh.endpoint, wh.token, msg);
      }
    }
  }
}

module.exports = new NotificationService();
```

---

## Phase 5: Controllers

### 5.1 File: `src/controllers/authController.js`

```javascript
const authService = require('../services/authService');
const ApiResponse = require('../utils/apiResponse');

class AuthController {
  // GET /auth/login - Render login page
  renderLogin(req, res) {
    res.render('auth/login', { title: 'Login', error: null });
  }

  // POST /auth/login - Handle login
  async handleLogin(req, res, next) {
    try {
      const { username, password } = req.body;
      const { token, user } = await authService.login(username, password);

      // Set cookie (httpOnly jadi tidak bisa diakses JS)
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 hari
        sameSite: 'strict',
      });

      // Jika request dari API, return JSON
      if (req.headers['content-type'] === 'application/json') {
        return ApiResponse.success(res, { token, user }, 'Login successful');
      }

      // Redirect ke dashboard
      res.redirect('/dashboard');
    } catch (err) {
      if (req.headers['content-type'] === 'application/json') {
        return next(err);
      }
      res.render('auth/login', { title: 'Login', error: 'Invalid username or password' });
    }
  }

  // GET /auth/logout
  handleLogout(req, res) {
    res.clearCookie('token');
    res.redirect('/auth/login');
  }
}

module.exports = new AuthController();
```

### 5.2 File: `src/controllers/projectController.js`

```javascript
const projectService = require('../services/projectService');
const deviceService = require('../services/deviceService');
const ApiResponse = require('../utils/apiResponse');

class ProjectController {
  // GET /projects - List semua project
  async listProjects(req, res, next) {
    try {
      const projects = await projectService.getAllProjects();
      res.render('projects/list', { title: 'Projects', projects });
    } catch (err) { next(err); }
  }

  // GET /projects/create - Form create project
  renderCreateProject(req, res) {
    res.render('projects/create', { title: 'Create Project', error: null });
  }

  // POST /projects - Create project
  async createProject(req, res, next) {
    try {
      const { name, description } = req.body;
      await projectService.createProject(name, description);
      res.redirect('/projects');
    } catch (err) {
      if (err.code === 'P2002') {
        return res.render('projects/create', {
          title: 'Create Project',
          error: 'Project name already exists',
        });
      }
      next(err);
    }
  }

  // GET /projects/:id - Detail project
  async getProject(req, res, next) {
    try {
      const project = await projectService.getProjectById(req.params.id);
      if (!project) return res.status(404).render('error', { message: 'Project not found' });

      const deviceStats = await deviceService.getDeviceStats(project.id);
      res.render('projects/detail', { title: project.name, project, deviceStats });
    } catch (err) { next(err); }
  }

  // POST /projects/:id/delete - Delete project
  async deleteProject(req, res, next) {
    try {
      await projectService.deleteProject(req.params.id);
      res.redirect('/projects');
    } catch (err) { next(err); }
  }

  // POST /projects/:id/regenerate-key - Regenerate API Key
  async regenerateApiKey(req, res, next) {
    try {
      await projectService.regenerateApiKey(req.params.id);
      res.redirect(`/projects/${req.params.id}`);
    } catch (err) { next(err); }
  }

  // POST /projects/:id/allowed-macs - Add MAC to whitelist
  async addAllowedMac(req, res, next) {
    try {
      const { macAddress, label } = req.body;
      await projectService.addAllowedMac(req.params.id, macAddress, label);
      res.redirect(`/projects/${req.params.id}`);
    } catch (err) { next(err); }
  }

  // POST /projects/:id/allowed-macs/:macId/delete - Remove MAC from whitelist
  async removeAllowedMac(req, res, next) {
    try {
      await projectService.removeAllowedMac(req.params.macId);
      res.redirect(`/projects/${req.params.id}`);
    } catch (err) { next(err); }
  }
}

module.exports = new ProjectController();
```

### 5.3 File: `src/controllers/firmwareController.js`

```javascript
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
```

### 5.4 File: `src/controllers/updateController.js`

Controller untuk Device API (ESP32).

```javascript
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
```

### 5.5 File: `src/controllers/deviceController.js`

```javascript
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
```

### 5.6 File: `src/controllers/webhookController.js`

```javascript
const prisma = require('../config/database');
const notificationService = require('../services/notificationService');
const ApiResponse = require('../utils/apiResponse');

class WebhookController {
  async renderSettings(req, res, next) {
    try {
      const { projectId } = req.params;
      const webhooks = await prisma.webhookConfig.findMany({ where: { projectId } });
      res.render('settings/webhooks', { title: 'Webhook Settings', webhooks, projectId, error: null, success: null });
    } catch (err) { next(err); }
  }

  async createWebhook(req, res, next) {
    try {
      const { projectId } = req.params;
      const { type, endpoint, token, events } = req.body;

      await prisma.webhookConfig.create({
        data: {
          projectId,
          type,
          endpoint,
          token: token || null,
          events: Array.isArray(events) ? events : [events],
        },
      });

      res.redirect(`/projects/${projectId}/webhooks`);
    } catch (err) { next(err); }
  }

  async testWebhook(req, res, next) {
    try {
      const webhook = await prisma.webhookConfig.findUnique({ where: { id: req.params.id } });
      if (!webhook) return ApiResponse.error(res, 'Webhook not found', 404);

      if (webhook.type === 'TELEGRAM') {
        await notificationService.sendTelegram(
          webhook.endpoint,
          webhook.token,
          '🧪 <b>Test Notification</b>\n\nThis is a test message from ESP32 OTA Server. If you see this, your webhook is working!'
        );
      }

      res.redirect(`/projects/${webhook.projectId}/webhooks`);
    } catch (err) { next(err); }
  }

  async deleteWebhook(req, res, next) {
    try {
      const webhook = await prisma.webhookConfig.findUnique({ where: { id: req.params.id } });
      if (!webhook) return ApiResponse.error(res, 'Webhook not found', 404);

      await prisma.webhookConfig.delete({ where: { id: req.params.id } });
      res.redirect(`/projects/${webhook.projectId}/webhooks`);
    } catch (err) { next(err); }
  }
}

module.exports = new WebhookController();
```

---

## Phase 6: Routes

### 6.1 File: `src/routes/authRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginLimiter } = require('../middleware/rateLimiter');

router.get('/login', authController.renderLogin);
router.post('/login', loginLimiter, authController.handleLogin.bind(authController));
router.get('/logout', authController.handleLogout);

module.exports = router;
```

### 6.2 File: `src/routes/projectRoutes.js`

```javascript
const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { authenticateJWT } = require('../middleware/auth');

// Semua route butuh auth
router.use(authenticateJWT);

router.get('/', projectController.listProjects.bind(projectController));
router.get('/create', projectController.renderCreateProject.bind(projectController));
router.post('/', projectController.createProject.bind(projectController));
router.get('/:id', projectController.getProject.bind(projectController));
router.post('/:id/delete', projectController.deleteProject.bind(projectController));
router.post('/:id/regenerate-key', projectController.regenerateApiKey.bind(projectController));
router.post('/:id/allowed-macs', projectController.addAllowedMac.bind(projectController));
router.post('/:id/allowed-macs/:macId/delete', projectController.removeAllowedMac.bind(projectController));

module.exports = router;
```

### 6.3 File: `src/routes/firmwareRoutes.js`

```javascript
const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams penting untuk akses :projectId
const firmwareController = require('../controllers/firmwareController');
const upload = require('../config/multer');
const { authenticateJWT } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');

router.use(authenticateJWT);

router.get('/upload', firmwareController.renderUploadForm.bind(firmwareController));
router.post('/', uploadLimiter, upload.single('firmware'), firmwareController.uploadFirmware.bind(firmwareController));
router.get('/:id', firmwareController.getFirmwareDetail.bind(firmwareController));
router.post('/:id/activate', firmwareController.setActiveFirmware.bind(firmwareController));
router.post('/:id/delete', firmwareController.deleteFirmware.bind(firmwareController));

module.exports = router;
```

### 6.4 File: `src/routes/deviceRoutes.js`

```javascript
const express = require('express');
const router = express.Router({ mergeParams: true });
const deviceController = require('../controllers/deviceController');
const { authenticateJWT } = require('../middleware/auth');

router.use(authenticateJWT);

router.get('/', deviceController.listDevices.bind(deviceController));
router.get('/logs', deviceController.getUpdateLogs.bind(deviceController));
router.get('/:id', deviceController.getDeviceDetail.bind(deviceController));

module.exports = router;
```

### 6.5 File: `src/routes/updateRoutes.js`

Device API routes (TANPA JWT auth, pakai API Key auth).

```javascript
const express = require('express');
const router = express.Router();
const updateController = require('../controllers/updateController');
const { authenticateDevice } = require('../middleware/apiKeyAuth');
const { deviceApiLimiter } = require('../middleware/rateLimiter');

// Semua route pakai device auth (API Key)
router.use(authenticateDevice);
router.use(deviceApiLimiter);

router.get('/check', updateController.checkUpdate.bind(updateController));
router.get('/download', updateController.downloadFirmware.bind(updateController));
router.post('/report', updateController.reportStatus.bind(updateController));

module.exports = router;
```

### 6.6 File: `src/routes/webhookRoutes.js`

```javascript
const express = require('express');
const router = express.Router({ mergeParams: true });
const webhookController = require('../controllers/webhookController');
const { authenticateJWT } = require('../middleware/auth');

router.use(authenticateJWT);

router.get('/', webhookController.renderSettings.bind(webhookController));
router.post('/', webhookController.createWebhook.bind(webhookController));
router.post('/:id/test', webhookController.testWebhook.bind(webhookController));
router.post('/:id/delete', webhookController.deleteWebhook.bind(webhookController));

module.exports = router;
```

### 6.7 File: `src/routes/index.js`

```javascript
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
```

---

## Phase 7: Express App & Server

### 7.1 File: `src/app.js`

```javascript
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable for EJS templates with inline scripts
}));

// CORS (untuk API)
app.use(cors());

// Compression
app.use(compression());

// Logging
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) },
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use(routes);

// Error handler (harus terakhir)
app.use(errorHandler);

module.exports = app;
```

### 7.2 File: `src/server.js`

```javascript
const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const prisma = require('./config/database');
const fs = require('fs');

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
```

---

## Phase 8: Database Seed

### File: `prisma/seed.js`

```javascript
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // Create default admin user
  const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 12);

  const admin = await prisma.user.upsert({
    where: { username: process.env.ADMIN_USERNAME || 'admin' },
    update: {},
    create: {
      username: process.env.ADMIN_USERNAME || 'admin',
      email: process.env.ADMIN_EMAIL || 'admin@example.com',
      password: hashedPassword,
      role: 'ADMIN',
    },
  });

  console.log('✅ Default admin user created:', admin.username);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Tambahkan di `package.json` bagian prisma:
```json
{
  "prisma": {
    "seed": "node prisma/seed.js"
  }
}
```

---

## Phase 9: Docker & Deployment

### 9.1 File: `Dockerfile`

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY . .

# Create required directories
RUN mkdir -p uploads logs

# Expose port
EXPOSE 3000

# Start
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node src/server.js"]
```

### 9.2 File: `docker-compose.yml`

```yaml
version: '3.8'

services:
  app:
    build: .
    container_name: ota-server
    restart: unless-stopped
    env_file: .env
    ports:
      - "3000:3000"
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    depends_on:
      db:
        condition: service_healthy
    networks:
      - ota-network

  db:
    image: postgres:16-alpine
    container_name: ota-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ota_server
      POSTGRES_USER: ota_user
      POSTGRES_PASSWORD: ota_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ota_user -d ota_server"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - ota-network

  nginx:
    image: nginx:alpine
    container_name: ota-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
    networks:
      - ota-network

volumes:
  postgres_data:

networks:
  ota-network:
    driver: bridge
```

### 9.3 File: `nginx/nginx.conf`

```nginx
events {
    worker_connections 1024;
}

http {
    # Rate limiting zone
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;

    upstream ota_app {
        server app:3000;
    }

    # HTTP - redirect ke HTTPS
    server {
        listen 80;
        server_name _;

        # Untuk development, langsung proxy. Untuk production, uncomment redirect di bawah.
        # return 301 https://$host$request_uri;

        location / {
            proxy_pass http://ota_app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Untuk file upload besar
            client_max_body_size 20M;
        }
    }

    # HTTPS (uncomment saat sudah punya SSL cert)
    # server {
    #     listen 443 ssl;
    #     server_name your-domain.com;
    #
    #     ssl_certificate /etc/nginx/ssl/fullchain.pem;
    #     ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    #
    #     location / {
    #         proxy_pass http://ota_app;
    #         proxy_set_header Host $host;
    #         proxy_set_header X-Real-IP $remote_addr;
    #         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    #         proxy_set_header X-Forwarded-Proto $scheme;
    #         client_max_body_size 20M;
    #     }
    # }
}
```

---

## Phase 10: Frontend Views (EJS Templates)

> [!IMPORTANT]
> Semua EJS view harus menggunakan design dark mode yang modern, premium, dan responsif. Gunakan CSS custom (bukan framework). Tampilan harus memiliki sidebar navigation, cards, badges, dan animasi subtle.

### 10.1 File: `src/views/layouts/main.ejs`

Layout utama yang dipakai semua halaman. Berisi:
- HTML head (meta, CSS import, Google Font Inter)
- Sidebar navigasi (Dashboard, Projects, Settings)
- Content area
- Footer

### 10.2 Design System (`public/css/style.css`)

Color palette yang direkomendasikan (dark mode):
```css
:root {
  --bg-primary: #0f1117;
  --bg-secondary: #1a1d2e;
  --bg-card: #222640;
  --bg-hover: #2a2f4a;
  --text-primary: #e4e6f0;
  --text-secondary: #8b8fa3;
  --accent-primary: #6c5ce7;    /* Purple */
  --accent-secondary: #00cec9;  /* Teal */
  --accent-success: #00b894;    /* Green */
  --accent-warning: #fdcb6e;    /* Yellow */
  --accent-danger: #ff7675;     /* Red */
  --border-color: #2d3154;
  --shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  --radius: 12px;
  --transition: all 0.3s ease;
}
```

Komponen CSS yang harus dibuat:
1. **Sidebar** - Fixed left sidebar dengan icon dan label
2. **Cards** - Glassmorphism effect cards
3. **Tables** - Styled tables untuk listing
4. **Buttons** - Primary, secondary, danger variants
5. **Forms** - Styled input fields
6. **Badges/Tags** - Status badges (Active, Inactive, Online, Offline)
7. **Progress bars** - Untuk visualisasi update progress
8. **Alerts/Toast** - Notification messages
9. **Modal** - Konfirmasi dialog (delete, dll)
10. **Stats cards** - Dashboard metrics cards

### 10.3 Halaman-halaman yang perlu dibuat

| File View | Deskripsi | Elemen Kunci |
|---|---|---|
| `auth/login.ejs` | Halaman login | Form centered, logo, gradient background |
| `dashboard/index.ejs` | Dashboard overview | Stats cards (total projects, devices, firmwares), recent activity table, chart (opsional) |
| `projects/list.ejs` | Daftar project | Card grid, setiap card tampilkan nama, active firmware version, device count |
| `projects/create.ejs` | Form buat project baru | Form dengan input name & description |
| `projects/detail.ejs` | Detail project | Tabs: Firmware List, Devices, Settings. API Key display (masked), MAC whitelist management |
| `firmware/upload.ejs` | Form upload firmware | File input, version input, release notes textarea, drag & drop area |
| `firmware/detail.ejs` | Detail firmware | Release notes, download count, checksum, update log dari firmware ini |
| `devices/list.ejs` | Fleet monitoring | Table: MAC, Current Version, Last Check-in, Status badge, IP |
| `devices/detail.ejs` | Detail device | Full update history timeline |
| `settings/webhooks.ejs` | Webhook configuration | Form tambah webhook Telegram, list existing webhooks, test button |

---

## API Reference (Untuk ESP32 Client)

### Check Update

```
GET /api/update/check

Headers:
  X-API-Key: <project_api_key>
  X-Project-ID: <project_uuid>
  X-Device-MAC: AA:BB:CC:DD:EE:FF
  X-Current-Version: 1.0.0

Response 200:
{
  "success": true,
  "data": {
    "updateAvailable": true,
    "firmware": {
      "version": "1.1.0",
      "fileSize": 1234567,
      "md5Checksum": "abc123...",
      "releaseNotes": "Bug fixes",
      "downloadUrl": "/api/update/download?project_id=xxx"
    }
  }
}
```

### Download Firmware

```
GET /api/update/download?project_id=<id>

Headers:
  X-API-Key: <project_api_key>
  X-Project-ID: <project_uuid>
  X-Device-MAC: AA:BB:CC:DD:EE:FF

Response Headers:
  Content-Type: application/octet-stream
  Content-Length: 1234567
  x-MD5: abc123def456...

Response Body: Binary .bin file
```

### Report Update Status

```
POST /api/update/report

Headers:
  X-API-Key: <project_api_key>
  X-Project-ID: <project_uuid>
  X-Device-MAC: AA:BB:CC:DD:EE:FF
  Content-Type: application/json

Body:
{
  "version": "1.1.0",
  "status": "SUCCESS",     // atau "FAILED"
  "message": "Optional error message"
}

Response 200:
{
  "success": true,
  "message": "Status reported"
}
```

---

## Contoh Kode ESP32 (Arduino)

Untuk referensi dan dokumentasi, berikut contoh implementasi di sisi ESP32:

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <ArduinoJson.h>

const char* OTA_SERVER = "https://your-ota-server.com";
const char* API_KEY = "your-project-api-key";
const char* PROJECT_ID = "your-project-uuid";
const char* CURRENT_VERSION = "1.0.0";

String getMAC() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return String(macStr);
}

void checkForUpdate() {
  HTTPClient http;
  String url = String(OTA_SERVER) + "/api/update/check?project_id=" + PROJECT_ID;

  http.begin(url);
  http.addHeader("X-API-Key", API_KEY);
  http.addHeader("X-Project-ID", PROJECT_ID);
  http.addHeader("X-Device-MAC", getMAC());
  http.addHeader("X-Current-Version", CURRENT_VERSION);

  int httpCode = http.GET();
  if (httpCode == 200) {
    String payload = http.getString();
    JsonDocument doc;
    deserializeJson(doc, payload);

    if (doc["data"]["updateAvailable"].as<bool>()) {
      String downloadUrl = String(OTA_SERVER) + doc["data"]["firmware"]["downloadUrl"].as<String>();
      String md5 = doc["data"]["firmware"]["md5Checksum"].as<String>();

      Serial.println("Update available! Downloading...");
      performOTA(downloadUrl, md5);
    } else {
      Serial.println("Firmware is up to date.");
    }
  }
  http.end();
}

void performOTA(String url, String expectedMD5) {
  HTTPClient http;
  http.begin(url);
  http.addHeader("X-API-Key", API_KEY);
  http.addHeader("X-Project-ID", PROJECT_ID);
  http.addHeader("X-Device-MAC", getMAC());

  httpUpdate.setMD5(expectedMD5.c_str());

  t_httpUpdate_return ret = httpUpdate.update(http.getStream(), http.getSize());

  switch (ret) {
    case HTTP_UPDATE_OK:
      Serial.println("Update success! Rebooting...");
      reportStatus(CURRENT_VERSION, "SUCCESS", "");
      ESP.restart();
      break;
    case HTTP_UPDATE_FAILED:
      Serial.printf("Update failed: %s\n", httpUpdate.getLastErrorString().c_str());
      reportStatus(CURRENT_VERSION, "FAILED", httpUpdate.getLastErrorString());
      break;
  }
}

void reportStatus(String version, String status, String message) {
  HTTPClient http;
  String url = String(OTA_SERVER) + "/api/update/report";

  http.begin(url);
  http.addHeader("X-API-Key", API_KEY);
  http.addHeader("X-Project-ID", PROJECT_ID);
  http.addHeader("X-Device-MAC", getMAC());
  http.addHeader("Content-Type", "application/json");

  String body = "{\"version\":\"" + version + "\",\"status\":\"" + status + "\",\"message\":\"" + message + "\"}";
  http.POST(body);
  http.end();
}

void setup() {
  Serial.begin(115200);
  WiFi.begin("SSID", "PASSWORD");
  while (WiFi.status() != WL_CONNECTED) delay(500);

  checkForUpdate();
}

void loop() {
  // Check setiap 1 jam
  delay(3600000);
  checkForUpdate();
}
```

---

## Fitur Tambahan yang Direkomendasikan

### 1. Auto Device Offline Detection (Cron Job)

Tambahkan scheduled task yang jalan setiap 5 menit untuk menandai device yang sudah tidak check-in lebih dari 30 menit sebagai offline.

File: `src/services/cronService.js`

```javascript
const prisma = require('../config/database');
const logger = require('../utils/logger');

async function markOfflineDevices() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const result = await prisma.device.updateMany({
    where: {
      isOnline: true,
      lastCheckedAt: { lt: thirtyMinutesAgo },
    },
    data: { isOnline: false },
  });
  if (result.count > 0) {
    logger.info(`Marked ${result.count} devices as offline`);
  }
}

// Jalankan setiap 5 menit
setInterval(markOfflineDevices, 5 * 60 * 1000);
```

Import file ini di `src/server.js` agar auto-start.

### 2. Dashboard Charts

Gunakan Chart.js (CDN) di dashboard untuk visualisasi:
- Update success vs failed per hari (bar chart)
- Devices online vs offline (donut chart)
- Firmware distribution across devices (pie chart)

### 3. Firmware Diff View

Tampilkan perbandingan ukuran file antara versi firmware untuk membantu estimasi waktu download.

### 4. API Rate Limit Dashboard

Tampilkan berapa request yang sudah dilakukan per device di dashboard untuk monitoring.

---

## Urutan Implementasi

Implementasi harus dilakukan dalam urutan berikut:

| Step | Task | Dependensi |
|------|-------|----------|
| 1 | Project init (`npm init`, install deps) | - |
| 2 | Setup environment config files | Step 1 |
| 3 | Setup Prisma schema + generate + migrate | Step 2 |
| 4 | Implementasi utility modules (apiResponse, semver, logger) | Step 1 |
| 5 | Implementasi middleware (auth, apiKeyAuth, error, rateLimit) | Step 4 |
| 6 | Implementasi services (auth, project, firmware, checksum, update, device, notification) | Step 3, 4 |
| 7 | Implementasi controllers | Step 5, 6 |
| 8 | Implementasi routes | Step 7 |
| 9 | Setup Express app (app.js, server.js) | Step 8 |
| 10 | Setup database seed | Step 3 |
| 11 | Implementasi CSS design system | Step 1 |
| 12 | Implementasi EJS layout (main.ejs + partials) | Step 11 |
| 13 | Implementasi halaman login | Step 12 |
| 14 | Implementasi halaman dashboard | Step 12 |
| 15 | Implementasi halaman projects (list, create, detail) | Step 12 |
| 16 | Implementasi halaman firmware (upload, detail) | Step 12 |
| 17 | Implementasi halaman devices (list, detail) | Step 12 |
| 18 | Implementasi halaman webhooks | Step 12 |
| 19 | Setup Docker files | Step 9 |
| 20 | Setup NGINX config | Step 19 |
| 21 | Testing API manual / dengan ESP32 | Step 20 |
| 22 | Implementasi cron job (offline detection) | Step 9 |
| 23 | Implementasi dashboard charts | Step 14 |

---

## Verification Plan

### Automated Tests
1. `docker-compose up -d` - Pastikan semua service start tanpa error
2. `npx prisma migrate deploy` - Pastikan schema terbuat di database
3. `npx prisma db seed` - Pastikan admin user terbuat
4. Test login via browser
5. Test CRUD project via dashboard
6. Test upload firmware via dashboard

### Manual Verification (API Testing dengan curl)
```bash
# Check update
curl -H "X-API-Key: <key>" -H "X-Project-ID: <id>" -H "X-Device-MAC: AA:BB:CC:DD:EE:FF" -H "X-Current-Version: 0.0.1" http://localhost/api/update/check

# Download firmware
curl -H "X-API-Key: <key>" -H "X-Project-ID: <id>" -o firmware.bin http://localhost/api/update/download?project_id=<id>

# Verify MD5
md5sum firmware.bin
```

### ESP32 Testing
Upload contoh kode Arduino ke ESP32 nyata dan verifikasi flow OTA end-to-end.
