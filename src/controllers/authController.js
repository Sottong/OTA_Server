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
