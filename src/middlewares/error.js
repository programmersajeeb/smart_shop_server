const multer = require("multer");

function notFound(req, res, next) {
  res.status(404).json({
    ok: false,
    message: "Route not found",
    path: req.originalUrl,
  });
}

function errorHandler(err, req, res, next) {
  const isProd =
    String(process.env.NODE_ENV || "").toLowerCase() === "production";

  let status = err?.statusCode || err?.status || 500;
  let message = err?.message || "Server error";
  let details = err?.details || null;

  // Multer errors -> 400
  if (err instanceof multer.MulterError) {
    status = 400;
    if (err.code === "LIMIT_FILE_SIZE") message = "File too large";
  }

  // Mongoose validation -> 400
  if (err?.name === "ValidationError") {
    status = 400;
    message = "Validation error";
    details = err?.errors || null;
  }

  // Mongo duplicate key -> 409
  if (err?.code === 11000) {
    status = 409;
    message = "Duplicate key";
    details = err?.keyValue || null;
  }

  // JWT errors
  if (err?.name === "JsonWebTokenError") {
    status = 401;
    message = "Invalid token";
  }

  if (err?.name === "TokenExpiredError") {
    status = 401;
    message = "Token expired";
  }

  // Cast error (invalid Mongo ID)
  if (err?.name === "CastError") {
    status = 400;
    message = "Invalid ID format";
  }

  // Dev logging
  if (!isProd) {
    console.error("❌ ERROR:", err);
  }

  const payload = {
    ok: false,
    message,
    details,
    requestId: req.requestId || null,
  };

  if (!isProd && err?.stack) {
    payload.stack = err.stack;
  }

  res.status(status).json(payload);
}

module.exports = { notFound, errorHandler };