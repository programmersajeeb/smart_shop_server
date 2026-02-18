const multer = require("multer");
const path = require("path");
const fs = require("fs");
const ApiError = require("../utils/apiError");

const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (_, file, cb) => {
  const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
  if (!ok) return cb(new ApiError(400, "Only jpg/png/webp allowed"), false);
  cb(null, true);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE || 5242880) },
});
