const mongoose = require("mongoose");

const ProductImageSchema = new mongoose.Schema(
  {
    fileId: { type: String, default: null, trim: true },
    url: { type: String, required: true, trim: true },
    filename: { type: String, default: null, trim: true },
    mimetype: { type: String, default: null, trim: true },
    size: { type: Number, default: 0, min: 0 },
    width: { type: Number, default: null, min: 0 },
    height: { type: Number, default: null, min: 0 },
    format: { type: String, default: null, trim: true },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    titleLower: { type: String, index: true },

    description: { type: String, default: "", trim: true },

    price: { type: Number, required: true, min: 0, index: true },
    compareAtPrice: { type: Number, default: null, min: 0 },

    stock: { type: Number, default: 0, min: 0, index: true },

    lowStockThreshold: { type: Number, default: 5, min: 0, index: true },

    category: { type: String, default: null, index: true, trim: true },
    brand: { type: String, default: null, index: true, trim: true },

    images: { type: [ProductImageSchema], default: [] },

    isActive: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

function normStrOrNull(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

function toPositiveNumberOrDefault(v, fallback = null) {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function normalizeImageItem(raw) {
  if (!raw) return null;

  if (typeof raw === "string") {
    const url = raw.trim();
    if (!url) return null;

    return {
      fileId: null,
      url,
      filename: null,
      mimetype: null,
      size: 0,
      width: null,
      height: null,
      format: null,
    };
  }

  if (typeof raw !== "object") return null;

  const url = String(raw.url || "").trim();
  if (!url) return null;

  return {
    fileId: normStrOrNull(raw.fileId),
    url,
    filename: normStrOrNull(raw.filename),
    mimetype: normStrOrNull(raw.mimetype),
    size: toPositiveNumberOrDefault(raw.size, 0),
    width: toPositiveNumberOrDefault(raw.width, null),
    height: toPositiveNumberOrDefault(raw.height, null),
    format: normStrOrNull(raw.format),
  };
}

function normImages(arr) {
  if (!Array.isArray(arr)) return [];

  const out = [];
  const seen = new Set();

  for (const raw of arr) {
    const img = normalizeImageItem(raw);
    if (!img) continue;

    const key = String(img.url || "").toLowerCase();
    if (!key || seen.has(key)) continue;

    seen.add(key);
    out.push(img);
  }

  return out.slice(0, 20);
}

function normalizeCompareAtPrice(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.max(0, n);
}

ProductSchema.pre("save", function () {
  this.title = String(this.title || "").trim();
  this.titleLower = this.title ? this.title.toLowerCase() : "";

  this.description = String(this.description || "").trim();
  this.category = normStrOrNull(this.category);
  this.brand = normStrOrNull(this.brand);

  if (this.price == null || Number.isNaN(Number(this.price))) {
    this.price = 0;
  }

  if (this.stock == null || Number.isNaN(Number(this.stock))) {
    this.stock = 0;
  }

  if (
    this.lowStockThreshold == null ||
    Number.isNaN(Number(this.lowStockThreshold))
  ) {
    this.lowStockThreshold = 5;
  }

  this.price = Math.max(0, Number(this.price));
  this.compareAtPrice = normalizeCompareAtPrice(this.compareAtPrice);
  this.stock = Math.max(0, Number(this.stock));
  this.lowStockThreshold = Math.max(0, Number(this.lowStockThreshold));
  this.images = normImages(this.images);
});

function applyUpdateNormalization(update) {
  if (!update || typeof update !== "object") return update;

  const u = { ...update };
  const $set = { ...(u.$set || {}) };

  const title = $set.title ?? u.title;
  if (title != null) {
    const t = String(title || "").trim();
    $set.title = t;
    $set.titleLower = t ? t.toLowerCase() : "";
    delete u.title;
  }

  const description = $set.description ?? u.description;
  if (description != null) {
    $set.description = String(description || "").trim();
    delete u.description;
  }

  const category = $set.category ?? u.category;
  if (category != null) {
    $set.category = normStrOrNull(category);
    delete u.category;
  }

  const brand = $set.brand ?? u.brand;
  if (brand != null) {
    $set.brand = normStrOrNull(brand);
    delete u.brand;
  }

  const images = $set.images ?? u.images;
  if (images != null) {
    $set.images = normImages(images);
    delete u.images;
  }

  const price = $set.price ?? u.price;
  if (price != null) {
    const n = Number(price);
    if (!Number.isNaN(n)) $set.price = Math.max(0, n);
    delete u.price;
  }

  const compareAtPrice = $set.compareAtPrice ?? u.compareAtPrice;
  if (compareAtPrice != null || compareAtPrice === "") {
    $set.compareAtPrice = normalizeCompareAtPrice(compareAtPrice);
    delete u.compareAtPrice;
  }

  const stock = $set.stock ?? u.stock;
  if (stock != null) {
    const n = Number(stock);
    if (!Number.isNaN(n)) $set.stock = Math.max(0, n);
    delete u.stock;
  }

  const thr = $set.lowStockThreshold ?? u.lowStockThreshold;
  if (thr != null) {
    const n = Number(thr);
    if (!Number.isNaN(n)) $set.lowStockThreshold = Math.max(0, n);
    delete u.lowStockThreshold;
  }

  if (Object.keys($set).length) {
    u.$set = $set;
  }

  return u;
}

function normalizeUpdateMiddleware() {
  const update = this.getUpdate();
  const normalized = applyUpdateNormalization(update);
  this.setUpdate(normalized);
}

ProductSchema.pre("findOneAndUpdate", normalizeUpdateMiddleware);
ProductSchema.pre("updateOne", normalizeUpdateMiddleware);
ProductSchema.pre("updateMany", normalizeUpdateMiddleware);

ProductSchema.index({ titleLower: "text", category: 1, brand: 1 });
ProductSchema.index({ isActive: 1, createdAt: -1 });
ProductSchema.index({ updatedAt: -1 });
ProductSchema.index({ category: 1, isActive: 1 });
ProductSchema.index({ brand: 1, isActive: 1 });
ProductSchema.index({ price: 1, isActive: 1 });
ProductSchema.index({ stock: 1, isActive: 1 });

module.exports = mongoose.model("Product", ProductSchema);