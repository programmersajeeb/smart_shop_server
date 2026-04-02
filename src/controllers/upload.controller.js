const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const initFirebase = require("../config/firebase");
const ApiError = require("../utils/apiError");
const { openUploadStream } = require("../services/gridfs.service");

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function safeFilename(name) {
  return String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function removeLocalFile(filePath) {
  try {
    if (filePath) {
      await fs.promises.unlink(filePath);
    }
  } catch {
    // ignore cleanup failure
  }
}

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

function getUploadDir() {
  return path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");
}

function getBaseUrlFromReq(req) {
  const envBase =
    normalizeText(process.env.PUBLIC_API_BASE_URL) ||
    normalizeText(process.env.APP_BASE_URL) ||
    normalizeText(process.env.API_BASE_URL);

  if (envBase) return envBase.replace(/\/+$/, "");

  const forwardedProto = normalizeText(req?.headers?.["x-forwarded-proto"]);
  const forwardedHost = normalizeText(req?.headers?.["x-forwarded-host"]);
  const host =
    forwardedHost ||
    normalizeText(req?.get?.("host")) ||
    normalizeText(req?.headers?.host);
  const proto =
    forwardedProto || (req?.protocol === "https" ? "https" : "http");

  if (!host) return "";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function buildMediaUrl(req, fileId) {
  const base = getBaseUrlFromReq(req);
  const relative = `/api/v1/media/${fileId}`;
  return base ? `${base}${relative}` : relative;
}

function buildStandardResponse({
  req,
  storage,
  fileId = null,
  filename = null,
  originalName = null,
  originalMimetype = null,
  originalSize = 0,
  mimetype = null,
  size = 0,
  width = null,
  height = null,
  format = null,
  url = null,
  path: storagePath = null,
}) {
  return {
    ok: true,
    storage,
    fileId: fileId ? String(fileId) : null,
    filename: filename || null,
    originalName: originalName || null,
    originalMimetype: originalMimetype || null,
    originalSize: Number(originalSize || 0) || 0,
    mimetype: mimetype || null,
    size: Number(size || 0) || 0,
    width: Number(width || 0) || null,
    height: Number(height || 0) || null,
    format: format || null,
    url: url || (fileId ? buildMediaUrl(req, fileId) : null),
    path: storagePath || null,
  };
}

async function optimizeImageToWebp(inputPath, originalName) {
  const uploadDir = getUploadDir();
  await ensureDir(uploadDir);

  const baseName = safeFilename(
    path.basename(
      String(originalName || "image"),
      path.extname(String(originalName || ""))
    )
  );

  const outputFilename = `${Date.now()}-${baseName || "image"}-optimized.webp`;
  const outputPath = path.join(uploadDir, outputFilename);

  const image = sharp(inputPath, { failOn: "none" });
  const metadata = await image.metadata();

  await sharp(inputPath, { failOn: "none" })
    .rotate()
    .resize({
      width: 1800,
      height: 1800,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: 82,
      effort: 5,
    })
    .toFile(outputPath);

  const optimizedStat = await fs.promises.stat(outputPath);
  const optimizedMeta = await sharp(outputPath, { failOn: "none" }).metadata();

  return {
    outputFilename,
    outputPath,
    original: {
      name: originalName || null,
      width: metadata?.width || null,
      height: metadata?.height || null,
      format: metadata?.format || null,
    },
    optimized: {
      mimetype: "image/webp",
      size: optimizedStat.size || 0,
      width: optimizedMeta?.width || null,
      height: optimizedMeta?.height || null,
      format: optimizedMeta?.format || "webp",
    },
  };
}

async function storeFileInGridFS(filePath, filename, meta = {}) {
  const uploadStream = openUploadStream(filename, {
    contentType: meta.mimetype || "image/webp",
    metadata: {
      originalName: meta.originalName || null,
      originalMimetype: meta.originalMimetype || null,
      originalSize: Number(meta.originalSize || 0) || 0,
      width: Number(meta.width || 0) || null,
      height: Number(meta.height || 0) || null,
      format: meta.format || null,
      optimizedMimetype: meta.mimetype || "image/webp",
      source: "local_optimized_upload",
    },
  });

  await new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(filePath);

    readStream.on("error", reject);
    uploadStream.on("error", reject);
    uploadStream.on("finish", resolve);

    readStream.pipe(uploadStream);
  });

  return uploadStream.id;
}

exports.uploadLocal = async (req, res, next) => {
  const file = req.file;
  let optimizedPath = null;

  try {
    if (!file) {
      throw new ApiError(400, "Image file is required");
    }

    const result = await optimizeImageToWebp(file.path, file.originalname);
    optimizedPath = result.outputPath;

    const fileId = await storeFileInGridFS(result.outputPath, result.outputFilename, {
      originalName: file.originalname || null,
      originalMimetype: file.mimetype || null,
      originalSize: file.size || 0,
      width: result.optimized.width,
      height: result.optimized.height,
      format: result.optimized.format,
      mimetype: result.optimized.mimetype,
    });

    return res.status(201).json(
      buildStandardResponse({
        req,
        storage: "gridfs",
        fileId: String(fileId),
        filename: result.outputFilename,
        originalName: file.originalname || null,
        originalMimetype: file.mimetype || null,
        originalSize: file.size || 0,
        mimetype: result.optimized.mimetype,
        size: result.optimized.size,
        width: result.optimized.width,
        height: result.optimized.height,
        format: result.optimized.format,
      })
    );
  } catch (e) {
    next(e);
  } finally {
    await removeLocalFile(file?.path);
    await removeLocalFile(optimizedPath);
  }
};

exports.uploadToFirebase = async (req, res, next) => {
  const file = req.file;
  let optimizedPath = null;

  try {
    if (!file) {
      throw new ApiError(400, "Image file is required");
    }

    const admin = initFirebase();
    const bucket = admin.storage().bucket();

    if (!bucket?.name) {
      throw new ApiError(500, "Firebase storage bucket is not configured");
    }

    const result = await optimizeImageToWebp(file.path, file.originalname);
    optimizedPath = result.outputPath;

    const baseName = safeFilename(
      path.basename(result.outputFilename, path.extname(result.outputFilename))
    );

    const destination = `products/${Date.now()}-${baseName}.webp`;

    await bucket.upload(optimizedPath, {
      destination,
      public: true,
      metadata: {
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable",
      },
    });

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

    return res.status(201).json(
      buildStandardResponse({
        req,
        storage: "firebase",
        filename: result.outputFilename,
        originalName: file.originalname || null,
        originalMimetype: file.mimetype || null,
        originalSize: file.size || 0,
        mimetype: result.optimized.mimetype,
        size: result.optimized.size,
        width: result.optimized.width,
        height: result.optimized.height,
        format: result.optimized.format,
        url: publicUrl,
        path: destination,
      })
    );
  } catch (e) {
    next(e);
  } finally {
    await removeLocalFile(file?.path);
    await removeLocalFile(optimizedPath);
  }
};