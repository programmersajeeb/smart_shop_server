const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const ApiError = require("../utils/apiError");

const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;
const uploadDir = path.resolve(
  process.cwd(),
  process.env.UPLOAD_DIR || "uploads"
);

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function ensureUploadDir() {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

ensureUploadDir();

function normalizeText(value) {
  return String(value || "").trim();
}

function getFileExtension(file) {
  return path.extname(normalizeText(file?.originalname)).toLowerCase();
}

function getMimeType(file) {
  return normalizeText(file?.mimetype).toLowerCase();
}

function pickExtension(file) {
  const mime = getMimeType(file);
  const originalExt = getFileExtension(file);
  return MIME_TO_EXT[mime] || originalExt || "";
}

function isAllowedFile(file) {
  const mime = getMimeType(file);
  const ext = getFileExtension(file);

  const mimeAllowed = ALLOWED_MIME_TYPES.has(mime);
  const extAllowed = ALLOWED_EXTENSIONS.has(ext);

  return mimeAllowed && extAllowed;
}

function getSafeFilename(file) {
  const ext = pickExtension(file);
  return `${Date.now()}-${crypto.randomUUID()}${ext}`;
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
      cb(null, getSafeFilename(file));
    } catch (err) {
      cb(err);
    }
  },
});

const fileFilter = (_req, file, cb) => {
  if (!file) {
    return cb(new ApiError(400, "Image file is required"), false);
  }

  const mime = getMimeType(file);
  const ext = getFileExtension(file);

  if (!isAllowedFile(file)) {
    return cb(
      new ApiError(
        400,
        `Only JPG, PNG, and WEBP images are allowed. Received mime "${mime || "unknown"}" and extension "${ext || "unknown"}".`
      ),
      false
    );
  }

  cb(null, true);
};

const configuredMaxFileSize = Number(process.env.MAX_FILE_SIZE || DEFAULT_MAX_FILE_SIZE);
const maxFileSize =
  Number.isFinite(configuredMaxFileSize) && configuredMaxFileSize > 0
    ? configuredMaxFileSize
    : DEFAULT_MAX_FILE_SIZE;

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxFileSize,
    files: 1,
  },
});