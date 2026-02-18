const mongoose = require("mongoose");
const AdminAuditLog = require("../models/AdminAuditLog");
const User = require("../models/User");

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

function isValidObjectIdString(id) {
  return mongoose.Types.ObjectId.isValid(String(id || "").trim());
}

// GET /audit-logs/admin
exports.adminList = async (req, res, next) => {
  try {
    // ✅ Security: Admin logs should not be cached
    res.set("Cache-Control", "no-store");

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const filter = {};

    // ✅ Enterprise: quick filters (optional)
    const action = String(req.query.action || "").trim();
    const entity = String(req.query.entity || "").trim().toLowerCase(); // ✅ match saved schema normalization
    const actor = String(req.query.actor || "").trim();
    const entityId = String(req.query.entityId || "").trim();

    if (action) filter.action = action;
    if (entity) filter.entity = entity;

    // ✅ Optional direct filters (fast path, index-friendly)
    if (actor && isValidObjectIdString(actor)) {
      filter.actor = new mongoose.Types.ObjectId(actor);
    }
    if (entityId && isValidObjectIdString(entityId)) {
      filter.entityId = new mongoose.Types.ObjectId(entityId);
    }

    // Date range (UTC day bounds)
    const dateFromRaw = parseDateInput(req.query.dateFrom);
    const dateToRaw = parseDateInput(req.query.dateTo);

    let dateFrom = dateFromRaw;
    let dateTo = dateToRaw;

    // ✅ normalize if reversed
    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
      const tmp = dateFrom;
      dateFrom = dateTo;
      dateTo = tmp;
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = toStartOfDayUTC(dateFrom);
      if (dateTo) filter.createdAt.$lte = toEndOfDayUTC(dateTo);
    }

    // Search (q)
    const q = String(req.query.q || "").trim();
    if (q) {
      const ors = [];
      const isObjectId = isValidObjectIdString(q);

      if (isObjectId) {
        // entityId search
        ors.push({ entityId: new mongoose.Types.ObjectId(q) });
        // actor search (if someone pastes a userId)
        ors.push({ actor: new mongoose.Types.ObjectId(q) });
      }

      const rx = new RegExp(escapeRegex(q), "i");
      ors.push({ action: rx });

      // entity is stored lowercase, regex still fine
      ors.push({ entity: rx });

      // ✅ match actor user by email/phone/displayName
      // Guard: prevent super broad scans for 1-char searches
      if (q.length >= 2) {
        const users = await User.find({
          $or: [{ email: rx }, { phone: rx }, { displayName: rx }],
        })
          .select("_id")
          .limit(200) // ✅ smaller cap for stability
          .lean();

        const userIds = users.map((u) => u._id).filter(Boolean);
        if (userIds.length) ors.push({ actor: { $in: userIds } });
      }

      filter.$or = ors;
    }

    const [items, total] = await Promise.all([
      AdminAuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("actor", "email phone displayName role roleLevel")
        .lean(),
      AdminAuditLog.countDocuments(filter),
    ]);

    res.json({
      logs: items,
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
