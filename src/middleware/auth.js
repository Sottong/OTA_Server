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
