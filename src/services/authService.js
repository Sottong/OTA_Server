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
