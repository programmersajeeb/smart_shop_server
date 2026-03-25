class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);

    this.name = "ApiError";
    this.statusCode = Number(statusCode) || 500;
    this.details = details;

    Error.captureStackTrace?.(this, this.constructor);
  }
}

module.exports = ApiError;