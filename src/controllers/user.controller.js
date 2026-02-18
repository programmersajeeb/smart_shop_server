const ApiError = require("../utils/apiError");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const PermissionsCatalog = require("../utils/permissions");

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function actorSnapshot(req) {
  return {
    id: String(req.user?.sub || ""),
    email: req.user?.email || null,
    phone: req.user?.phone || null,
    displayName: req.user?.displayName || null,
    role: req.user?.role || null,
    roleLevel: Number(req.user?.roleLevel || 0),
  };
}

async function writeAudit(req, { action, entity, entityId, before, after, note }) {
  try {
    await AuditLog.create({
      action,
      entity,
      entityId: entityId ? String(entityId) : null,
      actor: req.user?.sub || null,
      actorSnapshot: actorSnapshot(req),
      before: before ?? null,
      after: after ?? null,
      note: note || null,
      meta: {
        ip: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
        method: req.method || null,
        path: req.originalUrl || req.path || null,
      },
    });
  } catch {
    // do not block request on audit failure
  }
}

// GET /users/admin/permissions
exports.permissionsCatalog = async (req, res, next) => {
  try {
    res.json(PermissionsCatalog);
  } catch (e) {
    next(e);
  }
};

// GET /users/admin/list
exports.adminList = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const q = String(req.query.q || "").trim();
    const role = String(req.query.role || "").trim();
    const blocked = req.query.blocked;

    const filter = {};
    if (role) filter.role = role;

    if (blocked !== undefined && blocked !== "") {
      const b = String(blocked).toLowerCase() === "true";
      filter.isBlocked = b;
    }

    if (q) {
      const r = new RegExp(escapeRegex(q), "i");
      filter.$or = [
        { email: r },
        { phone: r },
        { displayName: r },
        { firebaseUid: r },
      ];
    }

    const [items, total] = await Promise.all([
      User.find(filter)
        .select("firebaseUid email phone displayName photoURL role roleLevel permissions isBlocked lastLoginAt createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({ users: items, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit, skip });
  } catch (e) {
    next(e);
  }
};

// PATCH /users/admin/:id/role
exports.adminUpdateRole = async (req, res, next) => {
  try {
    const targetId = String(req.params.id || "");
    if (!targetId) throw new ApiError(400, "Invalid user id");

    if (String(req.user?.sub) === targetId) {
      // prevent self lockout
      if (String(req.body?.role || "").toLowerCase() === "user") {
        throw new ApiError(400, "You cannot demote yourself");
      }
    }

    const user = await User.findById(targetId);
    if (!user) throw new ApiError(404, "User not found");

    const before = { role: user.role, roleLevel: user.roleLevel };

    const nextRole = String(req.body?.role || user.role).toLowerCase();
    if (!["user", "admin"].includes(nextRole)) throw new ApiError(400, "Invalid role");

    const nextLevelRaw = req.body?.roleLevel;
    let nextLevel = user.roleLevel;
    if (nextLevelRaw !== undefined) {
      const n = Number(nextLevelRaw);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new ApiError(400, "Invalid roleLevel");
      nextLevel = n;
    }

    user.role = nextRole;
    user.roleLevel = nextLevel;

    await user.save();

    await writeAudit(req, {
      action: "user.rbac.role.update",
      entity: "user",
      entityId: user._id,
      before,
      after: { role: user.role, roleLevel: user.roleLevel },
    });

    res.json({
      ok: true,
      user: {
        id: user._id,
        role: user.role,
        roleLevel: user.roleLevel,
      },
    });
  } catch (e) {
    next(e);
  }
};

// PATCH /users/admin/:id/permissions
exports.adminUpdatePermissions = async (req, res, next) => {
  try {
    const targetId = String(req.params.id || "");
    if (!targetId) throw new ApiError(400, "Invalid user id");

    const user = await User.findById(targetId);
    if (!user) throw new ApiError(404, "User not found");

    const list = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const cleaned = Array.from(
      new Set(list.map((p) => String(p || "").trim()).filter(Boolean))
    ).sort();

    // only super admin can grant wildcard
    if (cleaned.includes("*") && Number(req.user?.roleLevel || 0) < 100) {
      throw new ApiError(403, "Only super admin can grant wildcard permission");
    }

    const before = { permissions: Array.isArray(user.permissions) ? user.permissions : [] };
    user.permissions = cleaned;

    await user.save();

    await writeAudit(req, {
      action: "user.rbac.permissions.update",
      entity: "user",
      entityId: user._id,
      before,
      after: { permissions: user.permissions },
    });

    res.json({ ok: true, permissions: user.permissions });
  } catch (e) {
    next(e);
  }
};

// PATCH /users/admin/:id/block
exports.adminBlock = async (req, res, next) => {
  try {
    const targetId = String(req.params.id || "");
    if (!targetId) throw new ApiError(400, "Invalid user id");

    if (String(req.user?.sub) === targetId) {
      throw new ApiError(400, "You cannot block yourself");
    }

    const user = await User.findById(targetId);
    if (!user) throw new ApiError(404, "User not found");

    const nextBlocked = Boolean(req.body?.blocked);
    const before = { isBlocked: Boolean(user.isBlocked) };

    user.isBlocked = nextBlocked;
    await user.save();

    await writeAudit(req, {
      action: "user.block.update",
      entity: "user",
      entityId: user._id,
      before,
      after: { isBlocked: user.isBlocked },
    });

    res.json({ ok: true, blocked: user.isBlocked });
  } catch (e) {
    next(e);
  }
};
