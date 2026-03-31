const mongoose = require("mongoose");

const PromotionTargetSchema = new mongoose.Schema(
  {
    productIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    categories: [{ type: String, trim: true }],
    brands: [{ type: String, trim: true }],
  },
  { _id: false }
);

const PromotionUsageSchema = new mongoose.Schema(
  {
    totalUsed: { type: Number, default: 0, min: 0 },
    users: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        phone: { type: String, default: null, trim: true },
        usedCount: { type: Number, default: 0, min: 0 },
      },
    ],
  },
  { _id: false }
);

const PromotionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    nameLower: { type: String, index: true },

    description: { type: String, default: "", trim: true },

    type: {
      type: String,
      enum: ["flash_sale", "coupon", "automatic"],
      required: true,
      index: true,
    },

    discountType: {
      type: String,
      enum: ["percentage", "fixed", "free_shipping"],
      required: true,
    },

    code: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      index: true,
    },

    value: { type: Number, default: 0, min: 0 },

    minOrderAmount: { type: Number, default: 0, min: 0 },

    maxDiscountAmount: { type: Number, default: null, min: 0 },

    appliesTo: {
      type: String,
      enum: ["all", "specific_products", "categories", "brands"],
      default: "all",
    },

    target: { type: PromotionTargetSchema, default: () => ({}) },

    startAt: { type: Date, default: null, index: true },
    endAt: { type: Date, default: null, index: true },

    isActive: { type: Boolean, default: true, index: true },

    stackable: { type: Boolean, default: false },

    usageLimit: { type: Number, default: null, min: 0 },
    usageLimitPerUser: { type: Number, default: null, min: 0 },

    usage: { type: PromotionUsageSchema, default: () => ({}) },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

function normalizeStringList(list = []) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();

  for (const raw of list) {
    const value = String(raw || "").trim();
    if (!value) continue;

    const key = value.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(value);
  }

  return out.slice(0, 100);
}

function normalizeObjectIdList(list = []) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();

  for (const raw of list) {
    const value = String(raw || "").trim();
    if (!/^[0-9a-fA-F]{24}$/.test(value)) continue;

    const key = value.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(new mongoose.Types.ObjectId(value));
  }

  return out.slice(0, 200);
}

function normalizeCode(value) {
  const v = String(value || "").trim().toUpperCase();
  return v || null;
}

function normalizeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function normalizeUsageUsers(users = []) {
  if (!Array.isArray(users)) return [];

  return users
    .map((item) => ({
      userId: item?.userId || null,
      phone: String(item?.phone || "").trim() || null,
      usedCount: Math.max(0, Number(item?.usedCount || 0)),
    }))
    .filter((item) => item.userId || item.phone)
    .slice(0, 5000);
}

PromotionSchema.pre("save", function () {
  this.name = String(this.name || "").trim();
  this.nameLower = this.name.toLowerCase();
  this.description = String(this.description || "").trim();

  this.code = normalizeCode(this.code);

  this.value = Math.max(0, Number(this.value || 0));
  this.minOrderAmount = Math.max(0, Number(this.minOrderAmount || 0));

  if (this.maxDiscountAmount != null && this.maxDiscountAmount !== "") {
    const n = Number(this.maxDiscountAmount);
    this.maxDiscountAmount = Number.isFinite(n) && n >= 0 ? n : null;
  } else {
    this.maxDiscountAmount = null;
  }

  this.usageLimit =
    this.usageLimit != null && this.usageLimit !== ""
      ? Math.max(0, Number(this.usageLimit || 0))
      : null;

  this.usageLimitPerUser =
    this.usageLimitPerUser != null && this.usageLimitPerUser !== ""
      ? Math.max(0, Number(this.usageLimitPerUser || 0))
      : null;

  this.startAt = normalizeDate(this.startAt);
  this.endAt = normalizeDate(this.endAt);

  if (this.endAt && this.startAt && this.endAt < this.startAt) {
    this.endAt = this.startAt;
  }

  if (!this.target || typeof this.target !== "object") {
    this.target = {};
  }

  this.target.productIds = normalizeObjectIdList(this.target.productIds);
  this.target.categories = normalizeStringList(this.target.categories);
  this.target.brands = normalizeStringList(this.target.brands);

  if (!this.usage || typeof this.usage !== "object") {
    this.usage = {};
  }

  this.usage.totalUsed = Math.max(0, Number(this.usage.totalUsed || 0));
  this.usage.users = normalizeUsageUsers(this.usage.users);

  if (this.type !== "coupon") {
    this.code = null;
  }

  if (this.discountType === "free_shipping") {
    this.value = 0;
    this.maxDiscountAmount = null;
  }
});

PromotionSchema.index({ type: 1, isActive: 1, startAt: 1, endAt: 1 });
PromotionSchema.index({ code: 1, isActive: 1 });
PromotionSchema.index({ nameLower: "text", description: "text" });

module.exports = mongoose.model("Promotion", PromotionSchema);