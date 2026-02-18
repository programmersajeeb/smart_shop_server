const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    titleLower: { type: String, index: true },

    description: { type: String, default: "" },

    price: { type: Number, required: true, min: 0, index: true },

    stock: { type: Number, default: 0, min: 0, index: true },

    // ✅ NEW (required by Inventory UI + aggregation logic)
    lowStockThreshold: { type: Number, default: 5, min: 0, index: true },

    category: { type: String, index: true },
    brand: { type: String, index: true },

    images: [{ type: String }],

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

/**
 * ============================================================
 * Normalizers (Enterprise-safe)
 * ============================================================
 */
function normStrOrNull(v) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function normImages(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

/**
 * ✅ Save hook (create / doc.save)
 */
ProductSchema.pre("save", function (next) {
  this.titleLower = (this.title || "").toLowerCase().trim();

  // normalize optional fields (prevents "" pollution)
  this.category = normStrOrNull(this.category);
  this.brand = normStrOrNull(this.brand);

  // keep numbers safe
  if (this.stock == null || Number.isNaN(Number(this.stock))) this.stock = 0;
  if (this.lowStockThreshold == null || Number.isNaN(Number(this.lowStockThreshold))) this.lowStockThreshold = 5;

  this.stock = Math.max(0, Number(this.stock));
  this.lowStockThreshold = Math.max(0, Number(this.lowStockThreshold));

  this.images = normImages(this.images);

  next();
});

/**
 * ✅ IMPORTANT: Update hooks (findOneAndUpdate / updateOne / updateMany)
 * কারণ: findByIdAndUpdate করলে "save" hook চলে না,
 * ফলে titleLower sync নষ্ট হয়ে যায়।
 */
function applyUpdateNormalization(update) {
  if (!update || typeof update !== "object") return update;

  const u = { ...update };
  const $set = { ...(u.$set || {}) };

  // support direct fields or $set fields
  const title = $set.title ?? u.title;
  if (title != null) {
    const t = String(title || "").trim();
    $set.title = t;
    $set.titleLower = t.toLowerCase();
    delete u.title;
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

  // keep $set only if has keys
  if (Object.keys($set).length) u.$set = $set;

  return u;
}

ProductSchema.pre(["findOneAndUpdate", "updateOne", "updateMany"], function (next) {
  const update = this.getUpdate();
  const normalized = applyUpdateNormalization(update);
  this.setUpdate(normalized);
  next();
});

/**
 * ============================================================
 * Indexes (Performance / Smooth UI)
 * ============================================================
 */

// existing text + filter-friendly compound
ProductSchema.index({ titleLower: "text", category: 1, brand: 1 });

// common list patterns
ProductSchema.index({ isActive: 1, createdAt: -1 });
ProductSchema.index({ updatedAt: -1 });
ProductSchema.index({ category: 1, isActive: 1 });
ProductSchema.index({ brand: 1, isActive: 1 });

module.exports = mongoose.model("Product", ProductSchema);
