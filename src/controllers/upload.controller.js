const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const initFirebase = require("../config/firebase");
const ApiError = require("../utils/apiError");
const { openUploadStream } = require("../services/gridfs.service");

function safeFilename(name) {
  return String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");
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

function buildMediaUrl(fileId) {
  return `/api/v1/media/${fileId}`;
}

async function optimizeImageToWebp(inputPath, originalName) {
  const uploadDir = getUploadDir();
  await ensureDir(uploadDir);

  const baseName = safeFilename(
    path.basename(String(originalName || "image"), path.extname(String(originalName || "")))
  );

  const outputFilename = `${Date.now()}-${baseName || "image"}-optimized.webp`;
  const outputPath = path.join(uploadDir, outputFilename);

  const image = sharp(inputPath, { failOn: "none" });
  const metadata = await image.metadata();

  const resized = sharp(inputPath, { failOn: "none" })
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: 80,
      effort: 4,
    });

  await resized.toFile(outputPath);

  const optimizedStat = await fs.promises.stat(outputPath);
  const optimizedMeta = await sharp(outputPath).metadata();

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
      originalSize: meta.originalSize || 0,
      width: meta.width || null,
      height: meta.height || null,
      format: meta.format || null,
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

    res.json({
      ok: true,
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
      url: buildMediaUrl(String(fileId)),
    });
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
        cacheControl: "public, max-age=31536000",
      },
    });

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

    res.json({
      ok: true,
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
    });
  } catch (e) {
    next(e);
  } finally {
    await removeLocalFile(file?.path);
    await removeLocalFile(optimizedPath);
  }
};