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
