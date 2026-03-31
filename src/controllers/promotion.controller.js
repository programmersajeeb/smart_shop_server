const mongoose = require("mongoose");
const Promotion = require("../models/Promotion");
const Product = require("../models/Product");
const ApiError = require("../utils/apiError");

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function normalizeText(value, maxLen = 200) {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.slice(0, maxLen);
}

function normalizeCode(value) {
  const s = String(value || "").trim().toUpperCase();
  return s || null;
}

function toBool(value) {
  return value === true || value === "true" || value === 1 || value === "1" || value === "on";
}

function clampNumber(value, fallback = 0, min = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, n);
}

function normalizeStringList(list = []) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();

  for (const raw of list) {
    const value = normalizeText(raw, 80);
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
    const id = String(raw || "").trim();
    if (!/^[0-9a-fA-F]{24}$/.test(id)) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }

  return out.slice(0, 200);
}

function getPromotionComputedStatus(promotion, now = new Date()) {
  if (!promotion?.isActive) return "inactive";

  const startAt = promotion?.startAt ? new Date(promotion.startAt) : null;
  const endAt = promotion?.endAt ? new Date(promotion.endAt) : null;

  if (startAt && startAt > now) return "scheduled";
  if (endAt && endAt < now) return "expired";

  return "active";
}

function normalizePromotionPayload(body = {}, actorId = null) {
  const type = String(body?.type || "").trim();
  const discountType = String(body?.discountType || "").trim();
  const appliesTo = String(body?.appliesTo || "all").trim();

  if (!["flash_sale", "coupon", "automatic"].includes(type)) {
    throw new ApiError(400, "Invalid promotion type");
  }

  if (!["percentage", "fixed", "free_shipping"].includes(discountType)) {
    throw new ApiError(400, "Invalid discount type");
  }

  if (!["all", "specific_products", "categories", "brands"].includes(appliesTo)) {
    throw new ApiError(400, "Invalid appliesTo value");
  }

  const name = normalizeText(body?.name, 120);
  if (!name) throw new ApiError(400, "Promotion name is required");

  const code = normalizeCode(body?.code);

  if (type === "coupon" && !code) {
    throw new ApiError(400, "Coupon code is required for coupon promotions");
  }

  const startAt = parseDate(body?.startAt);
  const endAt = parseDate(body?.endAt);

  if (startAt && endAt && endAt < startAt) {
    throw new ApiError(400, "End date must be greater than or equal to start date");
  }

  const value = clampNumber(body?.value, 0, 0);
  const minOrderAmount = clampNumber(body?.minOrderAmount, 0, 0);

  const maxDiscountAmount =
    body?.maxDiscountAmount != null && body?.maxDiscountAmount !== ""
      ? clampNumber(body?.maxDiscountAmount, 0, 0)
      : null;

  const usageLimit =
    body?.usageLimit != null && body?.usageLimit !== ""
      ? clampNumber(body?.usageLimit, 0, 0)
      : null;

  const usageLimitPerUser =
    body?.usageLimitPerUser != null && body?.usageLimitPerUser !== ""
      ? clampNumber(body?.usageLimitPerUser, 0, 0)
      : null;

  const productIds = normalizeObjectIdList(body?.target?.productIds || []);
  const categories = normalizeStringList(body?.target?.categories || []);
  const brands = normalizeStringList(body?.target?.brands || []);

  if (appliesTo === "specific_products" && productIds.length === 0) {
    throw new ApiError(400, "At least one product is required");
  }

  if (appliesTo === "categories" && categories.length === 0) {
    throw new ApiError(400, "At least one category is required");
  }

  if (appliesTo === "brands" && brands.length === 0) {
    throw new ApiError(400, "At least one brand is required");
  }

  if (discountType === "percentage" && value > 100) {
    throw new ApiError(400, "Percentage discount cannot exceed 100");
  }

  return {
    name,
    nameLower: name.toLowerCase(),
    description: normalizeText(body?.description, 500),
    type,
    discountType,
    code: type === "coupon" ? code : null,
    value: discountType === "free_shipping" ? 0 : value,
    minOrderAmount,
    maxDiscountAmount: discountType === "free_shipping" ? null : maxDiscountAmount,
    appliesTo,
    target: {
      productIds,
      categories,
      brands,
    },
    startAt,
    endAt,
    isActive: body?.isActive === undefined ? true : toBool(body?.isActive),
    stackable: toBool(body?.stackable),
    usageLimit,
    usageLimitPerUser,
    updatedBy: actorId || null,
  };
}

async function buildPromotionResponse(doc) {
  const plain = doc.toObject ? doc.toObject() : doc;
  return {
    ...plain,
    computedStatus: getPromotionComputedStatus(plain),
  };
}

// GET /promotions/admin
exports.adminList = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const filter = {};
    const q = normalizeText(req.query.q, 100);
    const type = String(req.query.type || "").trim();
    const computedStatus = String(req.query.status || "").trim();

    if (type && ["flash_sale", "coupon", "automatic"].includes(type)) {
      filter.type = type;
    }

    if (q) {
      filter.$or = [
        { nameLower: { $regex: q.toLowerCase(), $options: "i" } },
        { code: { $regex: q.toUpperCase(), $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      Promotion.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Promotion.countDocuments(filter),
    ]);

    let rows = items.map((item) => ({
      ...item,
      computedStatus: getPromotionComputedStatus(item),
    }));

    if (computedStatus && ["active", "scheduled", "expired", "inactive"].includes(computedStatus)) {
      rows = rows.filter((item) => item.computedStatus === computedStatus);
    }

    res.json({
      promotions: rows,
      total: computedStatus ? rows.length : total,
      page,
      pages: Math.max(1, Math.ceil((computedStatus ? rows.length : total) / limit)),
      limit,
      skip,
    });
  } catch (e) {
    next(e);
  }
};

// GET /promotions/admin/:id
exports.adminGetOne = async (req, res, next) => {
  try {
    const promotion = await Promotion.findById(req.params.id).lean();
    if (!promotion) throw new ApiError(404, "Promotion not found");

    res.json({
      ...promotion,
      computedStatus: getPromotionComputedStatus(promotion),
    });
  } catch (e) {
    next(e);
  }
};

// POST /promotions/admin
exports.adminCreate = async (req, res, next) => {
  try {
    const payload = normalizePromotionPayload(req.body || {}, req.user?.sub || null);

    if (payload.type === "coupon" && payload.code) {
      const exists = await Promotion.findOne({ code: payload.code });
      if (exists) throw new ApiError(409, "Promotion code already exists");
    }

    const doc = await Promotion.create({
      ...payload,
      createdBy: req.user?.sub || null,
      usage: { totalUsed: 0, users: [] },
    });

    res.status(201).json(await buildPromotionResponse(doc));
  } catch (e) {
    next(e);
  }
};

// PATCH /promotions/admin/:id
exports.adminUpdate = async (req, res, next) => {
  try {
    const existing = await Promotion.findById(req.params.id);
    if (!existing) throw new ApiError(404, "Promotion not found");

    const payload = normalizePromotionPayload(
      {
        ...existing.toObject(),
        ...req.body,
        target: {
          ...(existing.target?.toObject ? existing.target.toObject() : existing.target || {}),
          ...(req.body?.target || {}),
        },
      },
      req.user?.sub || null
    );

    if (payload.type === "coupon" && payload.code) {
      const duplicate = await Promotion.findOne({
        _id: { $ne: existing._id },
        code: payload.code,
      });
      if (duplicate) throw new ApiError(409, "Promotion code already exists");
    }

    Object.assign(existing, payload);
    await existing.save();

    res.json(await buildPromotionResponse(existing));
  } catch (e) {
    next(e);
  }
};

// PATCH /promotions/admin/:id/toggle
exports.adminToggle = async (req, res, next) => {
  try {
    const promotion = await Promotion.findById(req.params.id);
    if (!promotion) throw new ApiError(404, "Promotion not found");

    promotion.isActive =
      req.body?.isActive === undefined ? !promotion.isActive : toBool(req.body.isActive);
    promotion.updatedBy = req.user?.sub || null;

    await promotion.save();
    res.json(await buildPromotionResponse(promotion));
  } catch (e) {
    next(e);
  }
};

// DELETE /promotions/admin/:id
exports.adminRemove = async (req, res, next) => {
  try {
    const promotion = await Promotion.findById(req.params.id);
    if (!promotion) throw new ApiError(404, "Promotion not found");

    await promotion.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

// POST /promotions/validate-coupon
exports.validateCoupon = async (req, res, next) => {
  try {
    const code = normalizeCode(req.body?.code);
    const subtotal = clampNumber(req.body?.subtotal, 0, 0);
    const productIds = normalizeObjectIdList(req.body?.productIds || []);
    const userId = req.user?.sub ? String(req.user.sub) : null;
    const phone = normalizeText(req.body?.phone, 40) || null;

    if (!code) throw new ApiError(400, "Coupon code is required");

    const promotion = await Promotion.findOne({
      type: "coupon",
      code,
    }).lean();

    if (!promotion) throw new ApiError(404, "Coupon not found");

    const status = getPromotionComputedStatus(promotion);
    if (status !== "active") {
      throw new ApiError(400, `Coupon is ${status}`);
    }

    if (promotion.usageLimit != null && Number(promotion?.usage?.totalUsed || 0) >= promotion.usageLimit) {
      throw new ApiError(400, "Coupon usage limit reached");
    }

    if (promotion.minOrderAmount > subtotal) {
      throw new ApiError(
        400,
        `Minimum order amount is ${promotion.minOrderAmount}`
      );
    }

    if (promotion.usageLimitPerUser != null) {
      const usageRow = Array.isArray(promotion?.usage?.users)
        ? promotion.usage.users.find((item) => {
            if (userId && item?.userId && String(item.userId) === userId) return true;
            if (phone && item?.phone && String(item.phone) === phone) return true;
            return false;
          })
        : null;

      if (usageRow && Number(usageRow.usedCount || 0) >= promotion.usageLimitPerUser) {
        throw new ApiError(400, "Per-user coupon usage limit reached");
      }
    }

    if (promotion.appliesTo === "specific_products" && productIds.length > 0) {
      const targetIds = new Set(
        (promotion?.target?.productIds || []).map((id) => String(id))
      );
      const matched = productIds.some((id) => targetIds.has(String(id)));
      if (!matched) {
        throw new ApiError(400, "Coupon does not apply to the selected products");
      }
    }

    if (promotion.appliesTo === "categories" || promotion.appliesTo === "brands") {
      const products = productIds.length
        ? await Product.find({ _id: { $in: productIds } })
            .select("category brand")
            .lean()
        : [];

      if (promotion.appliesTo === "categories") {
        const allowed = new Set((promotion?.target?.categories || []).map((x) => String(x).toLowerCase()));
        const matched = products.some((p) => allowed.has(String(p?.category || "").toLowerCase()));
        if (!matched) throw new ApiError(400, "Coupon does not apply to selected categories");
      }

      if (promotion.appliesTo === "brands") {
        const allowed = new Set((promotion?.target?.brands || []).map((x) => String(x).toLowerCase()));
        const matched = products.some((p) => allowed.has(String(p?.brand || "").toLowerCase()));
        if (!matched) throw new ApiError(400, "Coupon does not apply to selected brands");
      }
    }

    let discountAmount = 0;
    let shippingDiscount = 0;

    if (promotion.discountType === "percentage") {
      discountAmount = (subtotal * Number(promotion.value || 0)) / 100;
      if (promotion.maxDiscountAmount != null) {
        discountAmount = Math.min(discountAmount, Number(promotion.maxDiscountAmount || 0));
      }
    } else if (promotion.discountType === "fixed") {
      discountAmount = Math.min(subtotal, Number(promotion.value || 0));
    } else if (promotion.discountType === "free_shipping") {
      shippingDiscount = 0; // shipping currently 0, keep compatible for future
      discountAmount = 0;
    }

    res.json({
      ok: true,
      promotion: {
        _id: promotion._id,
        name: promotion.name,
        code: promotion.code,
        type: promotion.type,
        discountType: promotion.discountType,
        value: promotion.value,
      },
      computedStatus: status,
      discountAmount: Math.max(0, Math.round(discountAmount)),
      shippingDiscount: Math.max(0, Math.round(shippingDiscount)),
    });
  } catch (e) {
    next(e);
  }
};