const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginLimiter } = require('../middleware/rateLimiter');

router.get('/login', authController.renderLogin);
router.post('/login', loginLimiter, authController.handleLogin.bind(authController));
router.get('/logout', authController.handleLogout);

module.exports = router;
