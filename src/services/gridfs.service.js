const mongoose = require("mongoose");

let bucket = null;
const DEFAULT_BUCKET_NAME = "productMedia";

function getDb() {
  const db = mongoose.connection?.db;
  if (!db) {
    throw new Error("MongoDB connection is not ready");
  }
  return db;
}

function getBucketName() {
  const name = String(process.env.GRIDFS_BUCKET_NAME || DEFAULT_BUCKET_NAME).trim();
  return name || DEFAULT_BUCKET_NAME;
}

function initGridFS() {
  const db = getDb();
  bucket = new mongoose.mongo.GridFSBucket(db, {
    bucketName: getBucketName(),
  });
  return bucket;
}

function getGridFSBucket() {
  if (bucket) return bucket;
  return initGridFS();
}

function toObjectId(id) {
  const value = String(id || "").trim();
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error("Invalid GridFS file id");
  }
  return new mongoose.Types.ObjectId(value);
}

async function deleteGridFSFile(fileId) {
  const b = getGridFSBucket();
  await b.delete(toObjectId(fileId));
}

function openDownloadStream(fileId) {
  const b = getGridFSBucket();
  return b.openDownloadStream(toObjectId(fileId));
}

function openUploadStream(filename, options = {}) {
  const b = getGridFSBucket();
  return b.openUploadStream(filename, options);
}

module.exports = {
  initGridFS,
  getGridFSBucket,
  openUploadStream,
  openDownloadStream,
  deleteGridFSFile,
  toObjectId,
};