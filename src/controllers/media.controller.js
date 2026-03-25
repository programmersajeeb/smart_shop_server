const mongoose = require("mongoose");
const ApiError = require("../utils/apiError");
const {
  openDownloadStream,
  toObjectId,
  getGridFSBucket,
} = require("../services/gridfs.service");

function setInlineCacheHeaders(res, contentType) {
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  if (contentType) {
    res.setHeader("Content-Type", contentType);
  }
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}

exports.getMediaById = async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid media id");
    }

    const bucket = getGridFSBucket();
    const fileId = toObjectId(id);

    const files = await bucket.find({ _id: fileId }).limit(1).toArray();
    const file = files?.[0];

    if (!file) {
      throw new ApiError(404, "Media not found");
    }

    setInlineCacheHeaders(
      res,
      file?.contentType || file?.metadata?.mimetype || "application/octet-stream"
    );

    if (file?.length != null) {
      res.setHeader("Content-Length", String(file.length));
    }

    if (file?.filename) {
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${String(file.filename).replace(/"/g, "")}"`
      );
    }

    const stream = openDownloadStream(fileId);

    stream.on("error", (err) => {
      next(err);
    });

    stream.pipe(res);
  } catch (e) {
    next(e);
  }
};

exports.getMediaMetaById = async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid media id");
    }

    const bucket = getGridFSBucket();
    const fileId = toObjectId(id);

    const files = await bucket.find({ _id: fileId }).limit(1).toArray();
    const file = files?.[0];

    if (!file) {
      throw new ApiError(404, "Media not found");
    }

    res.json({
      ok: true,
      media: {
        id: String(file._id),
        filename: file.filename || null,
        length: file.length || 0,
        chunkSize: file.chunkSize || null,
        uploadDate: file.uploadDate || null,
        contentType: file.contentType || file?.metadata?.mimetype || null,
        metadata: file.metadata || {},
      },
    });
  } catch (e) {
    next(e);
  }
};