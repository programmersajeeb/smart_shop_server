const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const ApiError = require("../utils/apiError");

const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");

function ensureUploadDir() {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

ensureUploadDir();

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function pickExtension(file) {
  const mime = String(file?.mimetype || "").toLowerCase().trim();
  const originalExt = path.extname(String(file?.originalname || "")).toLowerCase().trim();

  return MIME_TO_EXT[mime] || originalExt || "";
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureUploadDir();
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    try {
      const ext = pickExtension(file);
      const name = `${Date.now()}-${crypto.randomUUID()}${ext}`;
      cb(null, name);
    } catch (err) {
      cb(err);
    }
  },
});

const fileFilter = (_req, file, cb) => {
  const mime = String(file?.mimetype || "").toLowerCase().trim();
  const ok = ALLOWED_MIME_TYPES.includes(mime);

  if (!ok) {
    return cb(new ApiError(400, "Only jpg/png/webp allowed"), false);
  }

  cb(null, true);
};

const maxFileSize = Number(process.env.MAX_FILE_SIZE || 5242880);

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: Number.isFinite(maxFileSize) && maxFileSize > 0 ? maxFileSize : 5242880,
    files: 1,
  },
});