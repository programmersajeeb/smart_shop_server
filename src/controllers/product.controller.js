const Product = require("../models/Product");
const AdminAuditLog = require("../models/AdminAuditLog");
const ApiError = require("../utils/apiError");

/**
 * ============================================================
 * Products Controller (Enterprise-ready)
 * ------------------------------------------------------------
 * ✅ Public list: search + pagination + sorting + filters
 * ✅ Facets: categories/brands + price range (for Shop filters)
 * ✅ Admin list: includes inactive products + inventory filters
 * ✅ CRUD: keeps titleLower in sync
 * ✅ Admin Categories: aggregated view + rename/delete (no separate table)
 * ✅ Inventory Summary: KPI cards for inventory module
 * ✅ Bulk Inventory Update: stock/threshold update for selected products
 * ✅ Audit logging (best-effort, never breaks flows)
 * ============================================================
 */

function parseBool(v) {
  const s = String(v ?? "").toLowerCase().trim();
  return s === "1" || s === "true" || s === "yes";
}

function parseNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidObjectIdString(id) {
  return /^[0-9a-fA-F]{24}$/.test(String(id || "").trim());
}

function pickProductSnapshot(p) {
  if (!p) return null;
  const id = p._id != null ? String(p._id) : null;

  return {
    id,
    title: p.title,
    price: p.price,
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold,
    category: p.category,
    brand: p.brand,
    isActive: p.isActive,
    updatedAt: p.updatedAt,
    createdAt: p.createdAt,
  };
}

async function logAction(req, payload) {
  // ✅ Best-effort audit logging (never block business flows)
  try {
    const actor = req.user?.sub ? String(req.user.sub) : null;
    if (!actor || !isValidObjectIdString(actor)) return;

    const entityId =
      payload.entityId && isValidObjectIdString(payload.entityId)
        ? String(payload.entityId)
        : null;

    await AdminAuditLog.create({
      actor,
      action: String(payload.action || "").trim(),
      entity: String(payload.entity || "").trim(),
      entityId,
      before: payload.before ?? null,
      after: payload.after ?? null,
      meta: {
        ip: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
        path: req.originalUrl || req.url || null,
        method: req.method || null,
        ...(payload.meta && typeof payload.meta === "object" ? payload.meta : {}),
      },
    });
  } catch {
    // ignore
  }
}

/**
 * ✅ Enterprise-friendly search (safe fallback without requiring Mongo text index)
 * Searches: title, titleLower, category, brand
 */
function applySearchFilter(filter, q) {
  const qs = String(q || "").trim();
  if (!qs) return;

  const rx = new RegExp(escapeRegex(qs), "i");
  filter.$or = [
    { title: rx },
    { titleLower: rx },
    { category: rx },
    { brand: rx },
  ];
}

// GET /products (public)
exports.list = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(60, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const q = (req.query.q || "").trim();

    const filter = { isActive: true };

    if (req.query.category) filter.category = req.query.category;
    if (req.query.brand) filter.brand = req.query.brand;

    if (parseBool(req.query.inStock)) {
      filter.stock = { $gt: 0 };
    }

    const priceMin = parseNum(req.query.priceMin);
    const priceMax = parseNum(req.query.priceMax);
    if (priceMin != null || priceMax != null) {
      filter.price = {};
      if (priceMin != null) filter.price.$gte = priceMin;
      if (priceMax != null) filter.price.$lte = priceMax;
    }

    // ✅ safer search (no text index dependency)
    applySearchFilter(filter, q);

    const sort =
      req.query.sort === "price_asc"
        ? { price: 1 }
        : req.query.sort === "price_desc"
          ? { price: -1 }
          : { createdAt: -1 };

    const [items, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(limit),
      Product.countDocuments(filter),
    ]);

    res.json({
      products: items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
      skip,
    });
  } catch (e) {
    next(e);
  }
};

// GET /products/facets (public)
exports.facets = async (req, res, next) => {
  try {
    const match = { isActive: true };

    const [categories, brands, priceAgg] = await Promise.all([
      Product.distinct("category", { ...match, category: { $nin: [null, ""] } }),
      Product.distinct("brand", { ...match, brand: { $nin: [null, ""] } }),
      Product.aggregate([
        { $match: match },
        { $group: { _id: null, min: { $min: "$price" }, max: { $max: "$price" } } },
      ]),
    ]);

    const min = priceAgg?.[0]?.min ?? 0;
    const max = priceAgg?.[0]?.max ?? 0;

    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({
      categories: (categories || [])
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b))),
      brands: (brands || [])
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b))),
      price: { min, max },
    });
  } catch (e) {
    next(e);
  }
};

// GET /products/admin (admin)
exports.listAdmin = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const q = (req.query.q || "").trim();
    const filter = {};

    if (req.query.category) filter.category = req.query.category;
    if (req.query.brand) filter.brand = req.query.brand;

    if (req.query.isActive !== undefined && req.query.isActive !== "") {
      filter.isActive = parseBool(req.query.isActive);
    }

    // ✅ Inventory stock filter (out | low | ok)
    const stockFilter = String(req.query.stock || "").trim().toLowerCase();
    if (stockFilter === "out") {
      filter.stock = { $lte: 0 };
    } else if (stockFilter === "low") {
      filter.$expr = {
        $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", "$lowStockThreshold"] }],
      };
    } else if (stockFilter === "ok") {
      filter.$expr = { $gt: ["$stock", "$lowStockThreshold"] };
    }

    // Back-compat inStock
    if (parseBool(req.query.inStock)) {
      filter.stock = { $gt: 0 };
      delete filter.$expr;
    }

    const priceMin = parseNum(req.query.priceMin);
    const priceMax = parseNum(req.query.priceMax);
    if (priceMin != null || priceMax != null) {
      filter.price = {};
      if (priceMin != null) filter.price.$gte = priceMin;
      if (priceMax != null) filter.price.$lte = priceMax;
    }

    // ✅ safer search (no text index dependency)
    applySearchFilter(filter, q);

    // ✅ Enterprise sorts (Inventory needs these)
    const sort =
      req.query.sort === "price_asc"
        ? { price: 1 }
        : req.query.sort === "price_desc"
          ? { price: -1 }
          : req.query.sort === "stock_asc"
            ? { stock: 1, updatedAt: -1 }
            : req.query.sort === "stock_desc"
              ? { stock: -1, updatedAt: -1 }
              : req.query.sort === "updated_asc"
                ? { updatedAt: 1 }
                : req.query.sort === "updated_desc"
                  ? { updatedAt: -1 }
                  : { createdAt: -1 };

    const [items, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(limit),
      Product.countDocuments(filter),
    ]);

    res.json({
      products: items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
      skip,
    });
  } catch (e) {
    next(e);
  }
};

// GET /products/admin/categories
exports.adminCategories = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();

    // keep non-empty categories
    const match = { category: { $nin: [null, ""] } };

    // optional search
    if (q) {
      match.category = { $nin: [null, ""], $regex: escapeRegex(q), $options: "i" };
    }

    const rows = await Product.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$category",
          name: { $first: "$category" },
          count: { $sum: 1 },
          activeCount: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } },
          inStockCount: { $sum: { $cond: [{ $gt: ["$stock", 0] }, 1, 0] } },
          outOfStockCount: { $sum: { $cond: [{ $lte: ["$stock", 0] }, 1, 0] } },
          lowStockCount: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", "$lowStockThreshold"] }] },
                1,
                0,
              ],
            },
          },
          totalStock: { $sum: "$stock" },
        },
      },
      { $sort: { count: -1, name: 1 } },
    ]);

    res.json({ categories: rows });
  } catch (e) {
    next(e);
  }
};

// POST /products/admin/categories/rename
exports.renameCategory = async (req, res, next) => {
  try {
    const from = String(req.body?.from || "").trim();
    const to = String(req.body?.to || "").trim();

    if (!from) throw new ApiError(400, "from required");
    if (!to) throw new ApiError(400, "to required");
    if (from === to) return res.json({ ok: true, from, to, matched: 0, modified: 0 });

    const beforeCount = await Product.countDocuments({ category: from });

    const r = await Product.updateMany({ category: from }, { $set: { category: to } });

    await logAction(req, {
      action: "category.rename",
      entity: "category",
      entityId: null, // schema expects ObjectId; keep safe
      before: { category: from, affected: beforeCount },
      after: { category: to, modified: r.modifiedCount ?? r.nModified ?? 0 },
      meta: { from, to },
    });

    res.json({
      ok: true,
      from,
      to,
      matched: r.matchedCount ?? r.n ?? 0,
      modified: r.modifiedCount ?? r.nModified ?? 0,
    });
  } catch (e) {
    next(e);
  }
};

// POST /products/admin/categories/delete
exports.deleteCategory = async (req, res, next) => {
  try {
    const category = String(req.body?.category || "").trim();
    if (!category) throw new ApiError(400, "category required");

    const beforeCount = await Product.countDocuments({ category });

    const r = await Product.updateMany({ category }, { $set: { category: null } });

    await logAction(req, {
      action: "category.delete",
      entity: "category",
      entityId: null, // schema expects ObjectId; keep safe
      before: { category, affected: beforeCount },
      after: { category: null, modified: r.modifiedCount ?? r.nModified ?? 0 },
      meta: { category },
    });

    res.json({
      ok: true,
      category,
      matched: r.matchedCount ?? r.n ?? 0,
      modified: r.modifiedCount ?? r.nModified ?? 0,
    });
  } catch (e) {
    next(e);
  }
};

// ✅ GET /products/admin/inventory-summary
exports.inventorySummary = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const filter = {};

    if (req.query.category) filter.category = req.query.category;
    if (req.query.brand) filter.brand = req.query.brand;

    if (req.query.isActive !== undefined && req.query.isActive !== "") {
      filter.isActive = parseBool(req.query.isActive);
    }

    // ✅ safer search (no text index dependency)
    applySearchFilter(filter, q);

    const rows = await Product.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } },
          inactive: { $sum: { $cond: [{ $eq: ["$isActive", false] }, 1, 0] } },
          inStock: { $sum: { $cond: [{ $gt: ["$stock", 0] }, 1, 0] } },
          outOfStock: { $sum: { $cond: [{ $lte: ["$stock", 0] }, 1, 0] } },
          lowStock: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", "$lowStockThreshold"] }] },
                1,
                0,
              ],
            },
          },
          totalStock: { $sum: "$stock" },
        },
      },
    ]);

    const s = rows?.[0] || {};
    res.json({
      summary: {
        total: s.total || 0,
        active: s.active || 0,
        inactive: s.inactive || 0,
        inStock: s.inStock || 0,
        outOfStock: s.outOfStock || 0,
        lowStock: s.lowStock || 0,
        totalStock: s.totalStock || 0,
      },
    });
  } catch (e) {
    next(e);
  }
};

// ✅ PATCH /products/admin/bulk-stock
exports.bulkStockUpdate = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) throw new ApiError(400, "ids required");
    if (ids.length > 200) throw new ApiError(400, "Too many ids (max 200)");

    const cleanIds = ids.map((x) => String(x || "").trim());
    for (const id of cleanIds) {
      if (!isValidObjectIdString(id)) throw new ApiError(400, `Invalid id: ${id}`);
    }

    const update = {};
    if (req.body?.stock != null) {
      const n = Number(req.body.stock);
      if (!Number.isFinite(n) || n < 0) throw new ApiError(400, "Invalid stock");
      update.stock = Math.max(0, n);
    }
    if (req.body?.lowStockThreshold != null) {
      const n = Number(req.body.lowStockThreshold);
      if (!Number.isFinite(n) || n < 0) throw new ApiError(400, "Invalid lowStockThreshold");
      update.lowStockThreshold = Math.max(0, n);
    }

    if (!Object.keys(update).length) throw new ApiError(400, "Nothing to update");

    // sample before/after for audit (limit to 10 for performance)
    const beforeSample = await Product.find({ _id: { $in: cleanIds } })
      .select("title price stock lowStockThreshold category brand isActive updatedAt createdAt")
      .limit(10)
      .lean();

    // ensure updatedAt changes (enterprise visibility)
    update.updatedAt = new Date();

    const r = await Product.updateMany({ _id: { $in: cleanIds } }, { $set: update });

    const afterSample = await Product.find({ _id: { $in: cleanIds } })
      .select("title price stock lowStockThreshold category brand isActive updatedAt createdAt")
      .limit(10)
      .lean();

    await logAction(req, {
      action: "inventory.bulkUpdate",
      entity: "product",
      entityId: null,
      before: { sample: beforeSample.map(pickProductSnapshot), idsCount: cleanIds.length },
      after: {
        sample: afterSample.map(pickProductSnapshot),
        update,
        idsCount: cleanIds.length,
        modified: r.modifiedCount ?? r.nModified ?? 0,
      },
      meta: { update, idsCount: cleanIds.length },
    });

    res.json({
      ok: true,
      matched: r.matchedCount ?? r.n ?? 0,
      modified: r.modifiedCount ?? r.nModified ?? 0,
      update,
    });
  } catch (e) {
    next(e);
  }
};

// ✅ ALIASES for router compatibility (Enterprise safe)
// Router may look for these names depending on your earlier pickHandler list.
exports.bulkStock = exports.bulkStockUpdate;
exports.updateBulkStock = exports.bulkStockUpdate;
exports.adminBulkStock = exports.bulkStockUpdate;

// GET /products/:id (public)
exports.getOne = async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!isValidObjectIdString(id)) throw new ApiError(400, "Invalid id");

    const item = await Product.findById(id);
    if (!item) return res.status(404).json({ message: "Not found" });

    res.json(item);
  } catch (e) {
    next(e);
  }
};

// POST /products (admin)
exports.create = async (req, res, next) => {
  try {
    const { title, description, price, stock, lowStockThreshold, category, brand, images } =
      req.body || {};

    if (!title) throw new ApiError(400, "title required");
    if (price == null || Number.isNaN(Number(price))) throw new ApiError(400, "price required");

    const titleStr = String(title || "").trim();

    const doc = await Product.create({
      title: titleStr,
      titleLower: titleStr.toLowerCase(), // ✅ ensure create also has titleLower
      description: description || "",
      price: Number(price),
      stock: Math.max(0, Number(stock || 0)),
      lowStockThreshold:
        lowStockThreshold == null || Number.isNaN(Number(lowStockThreshold))
          ? 5
          : Math.max(0, Number(lowStockThreshold)),
      category: category || null,
      brand: brand || null,
      images: Array.isArray(images) ? images : [],
      isActive: true,
    });

    await logAction(req, {
      action: "product.create",
      entity: "product",
      entityId: doc._id,
      after: pickProductSnapshot(doc),
    });

    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
};

// PATCH /products/:id (admin)
exports.update = async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!isValidObjectIdString(id)) throw new ApiError(400, "Invalid id");

    const body = req.body || {};

    const beforeDoc = await Product.findById(id);
    if (!beforeDoc) throw new ApiError(404, "Product not found");

    const update = {};

    if (body.title != null) {
      update.title = body.title;
      update.titleLower = String(body.title || "").toLowerCase().trim();
    }
    if (body.description != null) update.description = body.description;

    if (body.price != null) {
      if (Number.isNaN(Number(body.price))) throw new ApiError(400, "Invalid price");
      update.price = Number(body.price);
    }

    if (body.stock != null) {
      if (Number.isNaN(Number(body.stock))) throw new ApiError(400, "Invalid stock");
      update.stock = Math.max(0, Number(body.stock));
    }

    if (body.lowStockThreshold != null) {
      if (Number.isNaN(Number(body.lowStockThreshold)))
        throw new ApiError(400, "Invalid lowStockThreshold");
      update.lowStockThreshold = Math.max(0, Number(body.lowStockThreshold));
    }

    if (body.category != null) update.category = body.category || null;
    if (body.brand != null) update.brand = body.brand || null;

    if (body.images != null) update.images = Array.isArray(body.images) ? body.images : [];

    // ✅ FIX: Boolean("false") === true bug
    if (body.isActive != null) {
      update.isActive = typeof body.isActive === "boolean" ? body.isActive : parseBool(body.isActive);
    }

    const afterDoc = await Product.findByIdAndUpdate(id, update, { new: true });
    if (!afterDoc) throw new ApiError(404, "Product not found");

    await logAction(req, {
      action: "product.update",
      entity: "product",
      entityId: afterDoc._id,
      before: pickProductSnapshot(beforeDoc),
      after: pickProductSnapshot(afterDoc),
      meta: { fields: Object.keys(update) },
    });

    res.json(afterDoc);
  } catch (e) {
    next(e);
  }
};

// DELETE /products/:id (admin) => soft delete
exports.remove = async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!isValidObjectIdString(id)) throw new ApiError(400, "Invalid id");

    const beforeDoc = await Product.findById(id);
    if (!beforeDoc) throw new ApiError(404, "Product not found");

    const doc = await Product.findByIdAndUpdate(id, { isActive: false }, { new: true });
    if (!doc) throw new ApiError(404, "Product not found");

    await logAction(req, {
      action: "product.deactivate",
      entity: "product",
      entityId: doc._id,
      before: pickProductSnapshot(beforeDoc),
      after: pickProductSnapshot(doc),
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};
