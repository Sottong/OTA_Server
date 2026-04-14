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
