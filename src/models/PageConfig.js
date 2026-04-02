const mongoose = require("mongoose");

/**
 * Mini CMS for public pages (Shop control)
 */
const PageConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true, trim: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    version: { type: Number, default: 1 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PageConfig", PageConfigSchema);