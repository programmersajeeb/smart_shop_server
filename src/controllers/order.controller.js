const mongoose = require("mongoose");
const ApiError = require("../utils/apiError");

const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Order = require("../models/Order");
const User = require("../models/User");
const AdminAuditLog = require("../models/AdminAuditLog");
const PageConfig = require("../models/PageConfig"); // ✅ NEW

function calcTotals(items) {
  const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const shipping = 0;
  const discount = 0;
  const total = subtotal + shipping - discount;
  return { subtotal, shipping, discount, total };
}

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

// Admin status transition rules (enterprise-safe)
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

// ✅ Enterprise: cache commerce settings (reduce DB hits)
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
    // ignore -> defaults false
  }

  const out = { allowBackorders, allowGuestCheckout };
  _settingsCache = { data: out, exp: now + 30_000 }; // 30s TTL
  return out;
}

function normalizePhone(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  // keep digits only
  return s.replace(/[^\d]/g, "");
}

function normalizeText(v, maxLen) {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function normalizePaymentMethod(v) {
  const s = String(v || "").trim().toLowerCase();
  // enterprise-safe: whitelist (extend later)
  const allowed = ["cod", "bkash", "nagad", "card", "sslcommerz"];
  return allowed.includes(s) ? s : "cod";
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

    const orderItems = [];

    for (const it of cart.items) {
      const product = await Product.findById(it.product).session(session);
      if (!product || product.isActive === false) throw new ApiError(400, `Product unavailable: ${it.product}`);

      if (!allowBackorders && product.stock < it.qty) {
        throw new ApiError(400, `Insufficient stock: ${product.title}`);
      }

      // ✅ Enterprise: do not go negative if backorders allowed
      if (allowBackorders) product.stock = Math.max(0, product.stock - it.qty);
      else product.stock = product.stock - it.qty;

      await product.save({ session });

      orderItems.push({
        product: product._id,
        qty: it.qty,
        price: product.price,
        title: product.title,
        image: product.images?.[0] || null,
      });
    }

    const totals = calcTotals(orderItems);

    // ✅ sanitize shippingAddress (keeps your behavior but safer)
    const inAddr = req.body?.shippingAddress || {};
    const shippingAddress = {
      name: normalizeText(inAddr?.name, 80),
      phone: normalizeText(inAddr?.phone, 40),
      addressLine: normalizeText(inAddr?.addressLine, 200),
      city: normalizeText(inAddr?.city, 80),
      country: normalizeText(inAddr?.country, 80),
      postalCode: normalizeText(inAddr?.postalCode, 20),
      note: normalizeText(inAddr?.note, 300),
      paymentMethod: normalizePaymentMethod(inAddr?.paymentMethod),
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
        },
      ],
      { session }
    );

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

// ✅ POST /orders/checkout/guest
exports.guestCheckout = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const commerce = await getCommerceSettings();
    if (!commerce.allowGuestCheckout) throw new ApiError(403, "Guest checkout is disabled");

    const allowBackorders = Boolean(commerce.allowBackorders);

    const itemsIn = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!itemsIn.length) throw new ApiError(400, "Cart is empty");

    // ✅ require shipping phone for guest confirmation/security
    const inAddr = req.body?.shippingAddress || {};
    const phoneNorm = normalizePhone(inAddr?.phone);
    if (!phoneNorm) throw new ApiError(400, "Phone is required");

    // normalize + merge same product
    const merged = new Map();
    for (const raw of itemsIn) {
      const pid = String(raw?.product || raw?.productId || "").trim();
      const qty = Number(raw?.qty || 0);
      if (!pid || !/^[0-9a-fA-F]{24}$/.test(pid)) continue;
      if (!Number.isFinite(qty) || qty <= 0) continue;

      merged.set(pid, (merged.get(pid) || 0) + Math.round(qty));
    }

    const lines = Array.from(merged.entries()).slice(0, 50).map(([productId, qty]) => ({
      productId,
      qty,
    }));

    if (!lines.length) throw new ApiError(400, "Invalid cart items");

    const orderItems = [];

    for (const it of lines) {
      const product = await Product.findById(it.productId).session(session);
      if (!product || product.isActive === false) throw new ApiError(400, `Product unavailable: ${it.productId}`);

      if (!allowBackorders && product.stock < it.qty) {
        throw new ApiError(400, `Insufficient stock: ${product.title}`);
      }

      if (allowBackorders) product.stock = Math.max(0, product.stock - it.qty);
      else product.stock = product.stock - it.qty;

      await product.save({ session });

      orderItems.push({
        product: product._id,
        qty: it.qty,
        price: product.price,
        title: product.title,
        image: product.images?.[0] || null,
      });
    }

    const totals = calcTotals(orderItems);

    // ✅ sanitize + store shippingAddress
    const shippingAddress = {
      name: normalizeText(inAddr?.name, 80),
      phone: normalizeText(inAddr?.phone, 40),
      addressLine: normalizeText(inAddr?.addressLine, 200),
      city: normalizeText(inAddr?.city, 80),
      country: normalizeText(inAddr?.country, 80),
      postalCode: normalizeText(inAddr?.postalCode, 20),
      note: normalizeText(inAddr?.note, 300),
      paymentMethod: normalizePaymentMethod(inAddr?.paymentMethod),
    };

    const order = await Order.create(
      [
        {
          user: null, // ✅ guest
          items: orderItems,
          subtotal: totals.subtotal,
          shipping: totals.shipping,
          discount: totals.discount,
          total: totals.total,
          status: "pending",
          shippingAddress,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    res.status(201).json(order[0]);
  } catch (e) {
    await session.abortTransaction();
    next(e);
  } finally {
    session.endSession();
  }
};

// ✅ GET /orders/public/:id?phone=...
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

    // return safe subset
    res.json({
      _id: order._id,
      status: order.status,
      createdAt: order.createdAt,
      subtotal: order.subtotal,
      shipping: order.shipping,
      discount: order.discount,
      total: order.total,
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

// Admin: list orders (server-side search + date filter)
exports.adminList = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.status) filter.status = req.query.status;

    // Date range
    const dateFrom = parseDateInput(req.query.dateFrom);
    const dateTo = parseDateInput(req.query.dateTo);
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = toStartOfDayUTC(dateFrom);
      if (dateTo) filter.createdAt.$lte = toEndOfDayUTC(dateTo);
    }

    // Search
    const q = String(req.query.q || "").trim();
    if (q) {
      // exact order id
      if (/^[0-9a-fA-F]{24}$/.test(q)) {
        filter._id = new mongoose.Types.ObjectId(q);
      } else {
        const rx = new RegExp(escapeRegex(q), "i");

        // find matching users
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

// Admin: update order status (+ audit log)
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

    // Audit log (non-blocking-ish: if log fails, order still updated)
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
      // ignore audit errors
    }

    res.json(order);
  } catch (e) {
    next(e);
  }
};
