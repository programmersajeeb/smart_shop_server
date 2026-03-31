const mongoose = require("mongoose");
const ApiError = require("../utils/apiError");

const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Order = require("../models/Order");
const User = require("../models/User");
const Promotion = require("../models/Promotion");
const AdminAuditLog = require("../models/AdminAuditLog");
const PageConfig = require("../models/PageConfig");

function escapeRegex(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDateInput(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return new Date(t);
}
function toStartOfDayUTC(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function toEndOfDayUTC(d) {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

function canTransition(from, to) {
  if (from === to) return true;

  const map = {
    pending: ["paid", "cancelled"],
    paid: ["processing", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["delivered", "cancelled"],
    delivered: [],
    cancelled: [],
  };

  const allowed = map[from] || [];
  return allowed.includes(to);
}

let _settingsCache = { exp: 0, data: null };
async function getCommerceSettings() {
  const now = Date.now();
  if (_settingsCache.data && _settingsCache.exp > now) return _settingsCache.data;

  let allowBackorders = false;
  let allowGuestCheckout = false;

  try {
    const doc = await PageConfig.findOne({ key: "admin_settings" }).lean();
    allowBackorders = Boolean(doc?.data?.commerce?.allowBackorders);
    allowGuestCheckout = Boolean(doc?.data?.commerce?.allowGuestCheckout);
  } catch {
    // ignore
  }

  const out = { allowBackorders, allowGuestCheckout };
  _settingsCache = { data: out, exp: now + 30_000 };
  return out;
}

function normalizePhone(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  return s.replace(/[^\d]/g, "");
}

function normalizeText(v, maxLen) {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function normalizePaymentMethod(v) {
  const s = String(v || "").trim().toLowerCase();
  const allowed = ["cod", "bkash", "nagad", "card", "sslcommerz"];
  return allowed.includes(s) ? s : "cod";
}

function normalizeCode(value) {
  const s = String(value || "").trim().toUpperCase();
  return s || null;
}

function getPromotionComputedStatus(promotion, now = new Date()) {
  if (!promotion?.isActive) return "inactive";

  const startAt = promotion?.startAt ? new Date(promotion.startAt) : null;
  const endAt = promotion?.endAt ? new Date(promotion.endAt) : null;

  if (startAt && startAt > now) return "scheduled";
  if (endAt && endAt < now) return "expired";

  return "active";
}

function buildShippingAddress(inAddr = {}) {
  return {
    name: normalizeText(inAddr?.name, 80),
    phone: normalizeText(inAddr?.phone, 40),
    addressLine: normalizeText(inAddr?.addressLine, 200),
    city: normalizeText(inAddr?.city, 80),
    country: normalizeText(inAddr?.country, 80),
    postalCode: normalizeText(inAddr?.postalCode, 20),
    note: normalizeText(inAddr?.note, 300),
    paymentMethod: normalizePaymentMethod(inAddr?.paymentMethod),
  };
}

function calcBaseTotals(items) {
  const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const shipping = 0;
  return { subtotal, shipping };
}

async function validatePromotionForOrder({
  code,
  subtotal,
  productDocs,
  userId = null,
  phone = null,
  session = null,
}) {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) {
    return {
      promotion: null,
      discount: 0,
      shipping: 0,
      appliedPromotion: null,
    };
  }

  const promotion = await Promotion.findOne({
    type: "coupon",
    code: normalizedCode,
  }).session(session);

  if (!promotion) throw new ApiError(404, "Coupon not found");

  const status = getPromotionComputedStatus(promotion);
  if (status !== "active") {
    throw new ApiError(400, `Coupon is ${status}`);
  }

  if (
    promotion.usageLimit != null &&
    Number(promotion?.usage?.totalUsed || 0) >= promotion.usageLimit
  ) {
    throw new ApiError(400, "Coupon usage limit reached");
  }

  if (Number(promotion.minOrderAmount || 0) > subtotal) {
    throw new ApiError(
      400,
      `Minimum order amount is ${promotion.minOrderAmount}`
    );
  }

  if (promotion.usageLimitPerUser != null) {
    const usageRow = Array.isArray(promotion?.usage?.users)
      ? promotion.usage.users.find((item) => {
          if (userId && item?.userId && String(item.userId) === String(userId)) return true;
          if (phone && item?.phone && String(item.phone) === String(phone)) return true;
          return false;
        })
      : null;

    if (usageRow && Number(usageRow.usedCount || 0) >= promotion.usageLimitPerUser) {
      throw new ApiError(400, "Per-user coupon usage limit reached");
    }
  }

  if (promotion.appliesTo === "specific_products") {
    const targetIds = new Set(
      (promotion?.target?.productIds || []).map((id) => String(id))
    );
    const matched = productDocs.some((p) => targetIds.has(String(p._id)));
    if (!matched) {
      throw new ApiError(400, "Coupon does not apply to the selected products");
    }
  }

  if (promotion.appliesTo === "categories") {
    const allowed = new Set(
      (promotion?.target?.categories || []).map((x) => String(x).toLowerCase())
    );
    const matched = productDocs.some((p) =>
      allowed.has(String(p?.category || "").toLowerCase())
    );
    if (!matched) {
      throw new ApiError(400, "Coupon does not apply to selected categories");
    }
  }

  if (promotion.appliesTo === "brands") {
    const allowed = new Set(
      (promotion?.target?.brands || []).map((x) => String(x).toLowerCase())
    );
    const matched = productDocs.some((p) =>
      allowed.has(String(p?.brand || "").toLowerCase())
    );
    if (!matched) {
      throw new ApiError(400, "Coupon does not apply to selected brands");
    }
  }

  let discount = 0;
  let shipping = 0;

  if (promotion.discountType === "percentage") {
    discount = (subtotal * Number(promotion.value || 0)) / 100;
    if (promotion.maxDiscountAmount != null) {
      discount = Math.min(discount, Number(promotion.maxDiscountAmount || 0));
    }
  } else if (promotion.discountType === "fixed") {
    discount = Math.min(subtotal, Number(promotion.value || 0));
  } else if (promotion.discountType === "free_shipping") {
    shipping = 0;
    discount = 0;
  }

  return {
    promotion,
    discount: Math.max(0, Math.round(discount)),
    shipping,
    appliedPromotion: {
      promotionId: promotion._id,
      code: promotion.code || null,
      name: promotion.name,
      type: promotion.type,
      discountType: promotion.discountType,
      value: Number(promotion.value || 0),
    },
  };
}

async function incrementPromotionUsage({ promotion, userId = null, phone = null, session = null }) {
  if (!promotion) return;

  promotion.usage = promotion.usage || { totalUsed: 0, users: [] };
  promotion.usage.totalUsed = Math.max(0, Number(promotion.usage.totalUsed || 0)) + 1;

  const users = Array.isArray(promotion.usage.users) ? promotion.usage.users : [];
  const normalizedPhone = normalizePhone(phone);

  let row = users.find((item) => {
    if (userId && item?.userId && String(item.userId) === String(userId)) return true;
    if (normalizedPhone && item?.phone && normalizePhone(item.phone) === normalizedPhone) return true;
    return false;
  });

  if (!row) {
    row = {
      userId: userId || null,
      phone: normalizedPhone || null,
      usedCount: 0,
    };
    users.push(row);
  }

  row.usedCount = Math.max(0, Number(row.usedCount || 0)) + 1;
  promotion.usage.users = users;

  await promotion.save({ session });
}

async function buildOrderItemsFromCart(cartItems, allowBackorders, session) {
  const orderItems = [];
  const productDocs = [];

  for (const it of cartItems) {
    const product = await Product.findById(it.product).session(session);
    if (!product || product.isActive === false) {
      throw new ApiError(400, `Product unavailable: ${it.product}`);
    }

    if (!allowBackorders && product.stock < it.qty) {
      throw new ApiError(400, `Insufficient stock: ${product.title}`);
    }

    if (allowBackorders) product.stock = Math.max(0, product.stock - it.qty);
    else product.stock = product.stock - it.qty;

    await product.save({ session });

    productDocs.push(product);

    orderItems.push({
      product: product._id,
      qty: it.qty,
      price: product.price,
      title: product.title,
      image: product.images?.[0] || null,
    });
  }

  return { orderItems, productDocs };
}

async function buildOrderItemsFromGuestLines(lines, allowBackorders, session) {
  const orderItems = [];
  const productDocs = [];

  for (const it of lines) {
    const product = await Product.findById(it.productId).session(session);
    if (!product || product.isActive === false) {
      throw new ApiError(400, `Product unavailable: ${it.productId}`);
    }

    if (!allowBackorders && product.stock < it.qty) {
      throw new ApiError(400, `Insufficient stock: ${product.title}`);
    }

    if (allowBackorders) product.stock = Math.max(0, product.stock - it.qty);
    else product.stock = product.stock - it.qty;

    await product.save({ session });

    productDocs.push(product);

    orderItems.push({
      product: product._id,
      qty: it.qty,
      price: product.price,
      title: product.title,
      image: product.images?.[0] || null,
    });
  }

  return { orderItems, productDocs };
}

// POST /orders/checkout (auth)
exports.checkout = async (req, res, next) => {
  const userId = req.user.sub;
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const commerce = await getCommerceSettings();
    const allowBackorders = Boolean(commerce.allowBackorders);

    const cart = await Cart.findOne({ user: userId }).session(session);
    if (!cart || cart.items.length === 0) throw new ApiError(400, "Cart is empty");

    const { orderItems, productDocs } = await buildOrderItemsFromCart(
      cart.items,
      allowBackorders,
      session
    );

    const shippingAddress = buildShippingAddress(req.body?.shippingAddress || {});
    const baseTotals = calcBaseTotals(orderItems);

    const promoResult = await validatePromotionForOrder({
      code: req.body?.couponCode,
      subtotal: baseTotals.subtotal,
      productDocs,
      userId,
      phone: shippingAddress.phone,
      session,
    });

    const totals = {
      subtotal: baseTotals.subtotal,
      shipping: baseTotals.shipping,
      discount: promoResult.discount,
      total: baseTotals.subtotal + baseTotals.shipping - promoResult.discount,
    };

    const order = await Order.create(
      [
        {
          user: userId,
          items: orderItems,
          subtotal: totals.subtotal,
          shipping: totals.shipping,
          discount: totals.discount,
          total: totals.total,
          status: "pending",
          shippingAddress,
          appliedPromotion: promoResult.appliedPromotion,
        },
      ],
      { session }
    );

    if (promoResult.promotion) {
      await incrementPromotionUsage({
        promotion: promoResult.promotion,
        userId,
        phone: shippingAddress.phone,
        session,
      });
    }

    cart.items = [];
    await cart.save({ session });

    await session.commitTransaction();
    res.status(201).json(order[0]);
  } catch (e) {
    await session.abortTransaction();
    next(e);
  } finally {
    session.endSession();
  }
};

// POST /orders/checkout/guest
exports.guestCheckout = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const commerce = await getCommerceSettings();
    if (!commerce.allowGuestCheckout) {
      throw new ApiError(403, "Guest checkout is disabled");
    }

    const allowBackorders = Boolean(commerce.allowBackorders);

    const itemsIn = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!itemsIn.length) throw new ApiError(400, "Cart is empty");

    const inAddr = req.body?.shippingAddress || {};
    const phoneNorm = normalizePhone(inAddr?.phone);
    if (!phoneNorm) throw new ApiError(400, "Phone is required");

    const merged = new Map();
    for (const raw of itemsIn) {
      const pid = String(raw?.product || raw?.productId || "").trim();
      const qty = Number(raw?.qty || 0);
      if (!pid || !/^[0-9a-fA-F]{24}$/.test(pid)) continue;
      if (!Number.isFinite(qty) || qty <= 0) continue;

      merged.set(pid, (merged.get(pid) || 0) + Math.round(qty));
    }

    const lines = Array.from(merged.entries())
      .slice(0, 50)
      .map(([productId, qty]) => ({ productId, qty }));

    if (!lines.length) throw new ApiError(400, "Invalid cart items");

    const { orderItems, productDocs } = await buildOrderItemsFromGuestLines(
      lines,
      allowBackorders,
      session
    );

    const shippingAddress = buildShippingAddress(inAddr);
    const baseTotals = calcBaseTotals(orderItems);

    const promoResult = await validatePromotionForOrder({
      code: req.body?.couponCode,
      subtotal: baseTotals.subtotal,
      productDocs,
      userId: null,
      phone: shippingAddress.phone,
      session,
    });

    const totals = {
      subtotal: baseTotals.subtotal,
      shipping: baseTotals.shipping,
      discount: promoResult.discount,
      total: baseTotals.subtotal + baseTotals.shipping - promoResult.discount,
    };

    const order = await Order.create(
      [
        {
          user: null,
          items: orderItems,
          subtotal: totals.subtotal,
          shipping: totals.shipping,
          discount: totals.discount,
          total: totals.total,
          status: "pending",
          shippingAddress,
          appliedPromotion: promoResult.appliedPromotion,
        },
      ],
      { session }
    );

    if (promoResult.promotion) {
      await incrementPromotionUsage({
        promotion: promoResult.promotion,
        userId: null,
        phone: shippingAddress.phone,
        session,
      });
    }

    await session.commitTransaction();
    res.status(201).json(order[0]);
  } catch (e) {
    await session.abortTransaction();
    next(e);
  } finally {
    session.endSession();
  }
};

// GET /orders/public/:id?phone=...
exports.publicGetOne = async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!/^[0-9a-fA-F]{24}$/.test(id)) throw new ApiError(404, "Order not found");

    const phoneQ = normalizePhone(req.query.phone);
    if (!phoneQ) throw new ApiError(400, "Phone is required");

    const order = await Order.findById(id).lean();
    if (!order) throw new ApiError(404, "Order not found");

    const phoneOrder = normalizePhone(order?.shippingAddress?.phone);
    if (!phoneOrder || phoneOrder !== phoneQ) throw new ApiError(404, "Order not found");

    res.json({
      _id: order._id,
      status: order.status,
      createdAt: order.createdAt,
      subtotal: order.subtotal,
      shipping: order.shipping,
      discount: order.discount,
      total: order.total,
      appliedPromotion: order.appliedPromotion || null,
      items: (order.items || []).map((it) => ({
        title: it.title,
        image: it.image || null,
        qty: it.qty,
        price: it.price,
      })),
      shippingAddress: {
        name: order?.shippingAddress?.name || null,
        phone: order?.shippingAddress?.phone || null,
        addressLine: order?.shippingAddress?.addressLine || null,
        city: order?.shippingAddress?.city || null,
        country: order?.shippingAddress?.country || null,
        postalCode: order?.shippingAddress?.postalCode || null,
      },
    });
  } catch (e) {
    next(e);
  }
};

// GET /orders (user)
exports.myOrders = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Order.find({ user: req.user.sub }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments({ user: req.user.sub }),
    ]);

    res.json({ orders: items, total, page, pages: Math.ceil(total / limit), limit, skip });
  } catch (e) {
    next(e);
  }
};

// GET /orders/:id (user)
exports.getOne = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user.sub });
    if (!order) throw new ApiError(404, "Order not found");
    res.json(order);
  } catch (e) {
    next(e);
  }
};

// Admin: list orders
exports.adminList = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.status) filter.status = req.query.status;

    const dateFrom = parseDateInput(req.query.dateFrom);
    const dateTo = parseDateInput(req.query.dateTo);
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = toStartOfDayUTC(dateFrom);
      if (dateTo) filter.createdAt.$lte = toEndOfDayUTC(dateTo);
    }

    const q = String(req.query.q || "").trim();
    if (q) {
      if (/^[0-9a-fA-F]{24}$/.test(q)) {
        filter._id = new mongoose.Types.ObjectId(q);
      } else {
        const rx = new RegExp(escapeRegex(q), "i");

        const users = await User.find({
          $or: [{ email: rx }, { phone: rx }, { displayName: rx }],
        })
          .select("_id")
          .limit(500)
          .lean();

        const userIds = users.map((u) => u._id);

        const ors = [
          { "shippingAddress.phone": rx },
          { "shippingAddress.name": rx },
          { "items.title": rx },
          { "appliedPromotion.code": rx },
          { "appliedPromotion.name": rx },
        ];

        if (userIds.length) ors.unshift({ user: { $in: userIds } });

        filter.$or = ors;
      }
    }

    const [items, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "email phone displayName role"),
      Order.countDocuments(filter),
    ]);

    res.json({ orders: items, total, page, pages: Math.ceil(total / limit), limit, skip });
  } catch (e) {
    next(e);
  }
};

// Admin: update order status
exports.updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body || {};
    const allowed = ["pending", "paid", "processing", "shipped", "delivered", "cancelled"];
    if (!allowed.includes(status)) throw new ApiError(400, "Invalid status");

    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, "Order not found");

    const prev = order.status;
    if (!canTransition(prev, status)) {
      throw new ApiError(400, `Invalid status transition: ${prev} -> ${status}`);
    }

    order.status = status;
    await order.save();

    try {
      await AdminAuditLog.create({
        actor: req.user.sub,
        action: "order.status.update",
        entity: "Order",
        entityId: order._id,
        before: { status: prev },
        after: { status },
        meta: {
          ip: req.ip,
          userAgent: req.headers["user-agent"] || null,
          path: req.originalUrl || null,
          method: req.method || null,
        },
      });
    } catch {
      // ignore
    }

    res.json(order);
  } catch (e) {
    next(e);
  }
};