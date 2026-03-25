const ApiError = require("../utils/apiError");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const PermissionsCatalog = require("../utils/permissions");

const ALLOWED_ROLES = [
  "user",
  "superadmin",
  "admin",
  "manager",
  "support",
  "editor",
  "auditor",
];

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

function getCatalogPermissions() {
  const groups = Array.isArray(PermissionsCatalog?.groups)
    ? PermissionsCatalog.groups
    : [];
  const flat = Array.isArray(PermissionsCatalog?.permissions)
    ? PermissionsCatalog.permissions
    : [];

  const items = [];

  for (const g of groups) {
    for (const p of g?.items || []) {
      items.push(String(p || "").trim());
    }
  }

  for (const p of flat) {
    items.push(String(p || "").trim());
  }

  return Array.from(new Set(items.filter(Boolean))).sort();
}

const KNOWN_PERMISSIONS = getCatalogPermissions();

const PERMISSION_DEPENDENCIES = {
  "users:write": ["users:read"],
  "orders:write": ["orders:read"],
  "products:write": ["products:read"],
  "settings:write": ["settings:read"],
};

function normalizePermissions(list) {
  const arr = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();

  for (const raw of arr) {
    const p = String(raw || "").trim();
    if (!p) continue;
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }

  return out.sort((a, b) => a.localeCompare(b));
}

function applyPermissionDependencies(list) {
  const next = new Set(normalizePermissions(list));
  let changed = true;

  while (changed) {
    changed = false;
    for (const key of Array.from(next)) {
      const deps = PERMISSION_DEPENDENCIES[key] || [];
      for (const dep of deps) {
        if (!next.has(dep)) {
          next.add(dep);
          changed = true;
        }
      }
    }
  }

  if (next.has("*")) {
    next.add("admin:access");
  }

  return normalizePermissions(Array.from(next));
}

function isSuperAdminLike(role, roleLevel, permissions) {
  const r = String(role || "").trim().toLowerCase();
  const lvl = Number(roleLevel || 0);
  const perms = normalizePermissions(permissions);
  return r === "superadmin" || lvl >= 100 || perms.includes("*");
}

function shouldHaveAdminShell(role, roleLevel, permissions) {
  const nextRole = String(role || "").trim().toLowerCase();
  const nextLevel = Number(roleLevel || 0);
  const perms = normalizePermissions(permissions);

  return (
    nextRole === "superadmin" ||
    nextRole === "admin" ||
    nextRole === "manager" ||
    nextRole === "support" ||
    nextRole === "editor" ||
    nextRole === "auditor" ||
    nextLevel > 0 ||
    perms.includes("*")
  );
}

function ensureShellAccessPermission(role, roleLevel, permissions) {
  const next = new Set(normalizePermissions(permissions));

  if (shouldHaveAdminShell(role, roleLevel, Array.from(next))) {
    next.add("admin:access");
  }

  return normalizePermissions(Array.from(next));
}

function stripShellOnlyPermissions(role, roleLevel, permissions) {
  const nextRole = String(role || "").trim().toLowerCase();
  const nextLevel = Number(roleLevel || 0);
  const next = normalizePermissions(permissions);

  if (nextRole === "user" && nextLevel === 0) {
    return next.filter((p) => p !== "admin:access" && p !== "*");
  }

  return next;
}

function cleanAndValidatePermissions(list, actorLevel, options = {}) {
  const desiredRole = options?.role;
  const desiredRoleLevel = options?.roleLevel;

  let cleaned = applyPermissionDependencies(list);
  cleaned = ensureShellAccessPermission(desiredRole, desiredRoleLevel, cleaned);
  cleaned = stripShellOnlyPermissions(desiredRole, desiredRoleLevel, cleaned);
  cleaned = normalizePermissions(cleaned);

  if (cleaned.includes("*") && Number(actorLevel || 0) < 100) {
    throw new ApiError(403, "Only super admin can grant wildcard permission");
  }

  const invalid = cleaned.filter((p) => p !== "*" && !KNOWN_PERMISSIONS.includes(p));
  if (invalid.length) {
    throw new ApiError(400, `Invalid permission(s): ${invalid.join(", ")}`);
  }

  return cleaned;
}

function isSameUser(req, targetId) {
  return String(req.user?.sub || "") === String(targetId || "");
}

function getActorRole(req) {
  return String(req.user?.role || "").trim().toLowerCase();
}

function getActorRoleLevel(req) {
  return Number(req.user?.roleLevel || 0);
}

function getTargetRole(user) {
  return String(user?.role || "").trim().toLowerCase();
}

function getTargetRoleLevel(user) {
  return Number(user?.roleLevel || 0);
}

function canManageTarget(req, targetUser) {
  const actorId = String(req.user?.sub || "");
  const actorRole = getActorRole(req);
  const actorLevel = getActorRoleLevel(req);

  const targetId = String(targetUser?._id || "");
  const targetRole = getTargetRole(targetUser);
  const targetLevel = getTargetRoleLevel(targetUser);

  if (!actorId || !targetId) return false;
  if (actorId === targetId) return true;

  const actorIsSuper = actorRole === "superadmin" || actorLevel >= 100;
  const targetIsSuper = targetRole === "superadmin" || targetLevel >= 100;

  if (!actorIsSuper && targetIsSuper) return false;

  return actorLevel > targetLevel;
}

function assertAssignableRole(req, nextRole, nextRoleLevel) {
  const actorRole = getActorRole(req);
  const actorLevel = getActorRoleLevel(req);

  const desiredRole = String(nextRole || "").trim().toLowerCase();
  const desiredLevel = Number(nextRoleLevel || 0);

  if (desiredRole === "superadmin" && actorRole !== "superadmin") {
    throw new ApiError(403, "Only super admin can assign superadmin role");
  }

  if (desiredLevel >= actorLevel) {
    throw new ApiError(403, "You cannot assign equal or higher role level than your own");
  }
}

async function countSuperAdmins(excludeUserId) {
  const filter = {
    role: "superadmin",
    roleLevel: { $gte: 100 },
    isBlocked: false,
  };

  if (excludeUserId) {
    filter._id = { $ne: excludeUserId };
  }

  return User.countDocuments(filter);
}

async function ensureNotRemovingLastSuperAdmin({
  currentUser,
  nextRole,
  nextRoleLevel,
  nextBlocked,
}) {
  const isCurrentSuper =
    String(currentUser?.role || "").trim().toLowerCase() === "superadmin" &&
    Number(currentUser?.roleLevel || 0) >= 100;

  if (!isCurrentSuper) return;

  const remainsSuper =
    String(nextRole || currentUser.role).trim().toLowerCase() === "superadmin" &&
    Number(nextRoleLevel) >= 100;

  const remainsUnblocked =
    nextBlocked === undefined ? !Boolean(currentUser?.isBlocked) : !Boolean(nextBlocked);

  if (remainsSuper && remainsUnblocked) return;

  const others = await countSuperAdmins(currentUser._id);
  if (others <= 0) {
    throw new ApiError(400, "You cannot remove or block the last active super admin");
  }
}

function setRbacAuditFields(user, req) {
  user.rbacUpdatedAt = new Date();
  user.rbacUpdatedBy = String(req.user?.sub || "") || null;
}

function setBlockFields(user, req, nextBlocked) {
  user.isBlocked = Boolean(nextBlocked);

  if (user.isBlocked) {
    user.blockedAt = new Date();
    user.blockedBy = String(req.user?.sub || "") || null;
  } else {
    user.blockedAt = null;
    user.blockedBy = null;
  }
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
    const role = String(req.query.role || "").trim().toLowerCase();
    const blocked = req.query.blocked;
    const sortBy = String(req.query.sortBy || "createdAt").trim();
    const sortDir =
      String(req.query.sortDir || "desc").trim().toLowerCase() === "asc" ? 1 : -1;

    const filter = {};
    if (role) filter.role = role;

    if (blocked !== undefined && blocked !== "") {
      filter.isBlocked = String(blocked).toLowerCase() === "true";
    }

    if (q) {
      const r = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ email: r }, { phone: r }, { displayName: r }, { firebaseUid: r }];
    }

    const sortMap = {
      createdAt: { createdAt: sortDir, _id: -1 },
      displayName: { displayName: sortDir, _id: -1 },
      role: { role: sortDir, roleLevel: -1, _id: -1 },
      roleLevel: { roleLevel: sortDir, _id: -1 },
      isBlocked: { isBlocked: sortDir, _id: -1 },
      lastLoginAt: { lastLoginAt: sortDir, _id: -1 },
    };

    const mongoSort = sortMap[sortBy] || sortMap.createdAt;

    const [items, total] = await Promise.all([
      User.find(filter)
        .select(
          "firebaseUid email phone displayName photoURL role roleLevel permissions isBlocked lastLoginAt createdAt updatedAt rbacUpdatedAt rbacUpdatedBy blockedAt blockedBy"
        )
        .sort(mongoSort)
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      users: items,
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

// PATCH /users/admin/:id/role
exports.adminUpdateRole = async (req, res, next) => {
  try {
    const targetId = String(req.params.id || "");
    if (!targetId) throw new ApiError(400, "Invalid user id");

    const actorIsSelf = isSameUser(req, targetId);
    const actorLevel = getActorRoleLevel(req);

    const user = await User.findById(targetId);
    if (!user) throw new ApiError(404, "User not found");

    if (!canManageTarget(req, user) && !actorIsSelf) {
      throw new ApiError(403, "You cannot manage a user with equal or higher role level");
    }

    const before = {
      role: user.role,
      roleLevel: user.roleLevel,
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
    };

    const nextRole = String(req.body?.role || user.role).toLowerCase();
    if (!ALLOWED_ROLES.includes(nextRole)) throw new ApiError(400, "Invalid role");

    let nextLevel = Number(user.roleLevel || 0);
    if (req.body?.roleLevel !== undefined) {
      const n = Number(req.body.roleLevel);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        throw new ApiError(400, "Invalid roleLevel");
      }
      nextLevel = n;
    }

    if (actorIsSelf) {
      if (nextRole === "user") {
        throw new ApiError(400, "You cannot demote yourself");
      }
      if (nextLevel < actorLevel) {
        throw new ApiError(400, "You cannot reduce your own role level");
      }
    } else {
      assertAssignableRole(req, nextRole, nextLevel);
    }

    await ensureNotRemovingLastSuperAdmin({
      currentUser: user,
      nextRole,
      nextRoleLevel: nextLevel,
      nextBlocked: user.isBlocked,
    });

    user.role = nextRole;
    user.roleLevel = nextLevel;
    user.permissions = cleanAndValidatePermissions(user.permissions, actorLevel, {
      role: nextRole,
      roleLevel: nextLevel,
    });
    setRbacAuditFields(user, req);

    await user.save();

    await writeAudit(req, {
      action: "user.rbac.role.update",
      entity: "user",
      entityId: user._id,
      before,
      after: {
        role: user.role,
        roleLevel: user.roleLevel,
        permissions: user.permissions,
      },
      note: `Role updated to ${user.role} with level ${user.roleLevel}`,
    });

    res.json({
      ok: true,
      user: {
        id: user._id,
        role: user.role,
        roleLevel: user.roleLevel,
        permissions: user.permissions,
        rbacUpdatedAt: user.rbacUpdatedAt,
        rbacUpdatedBy: user.rbacUpdatedBy,
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

    const actorIsSelf = isSameUser(req, targetId);

    const user = await User.findById(targetId);
    if (!user) throw new ApiError(404, "User not found");

    if (!canManageTarget(req, user) && !actorIsSelf) {
      throw new ApiError(403, "You cannot manage a user with equal or higher role level");
    }

    const cleaned = cleanAndValidatePermissions(
      Array.isArray(req.body?.permissions) ? req.body.permissions : [],
      req.user?.roleLevel,
      {
        role: user.role,
        roleLevel: user.roleLevel,
      }
    );

    if (
      actorIsSelf &&
      shouldHaveAdminShell(user.role, user.roleLevel, cleaned) &&
      !cleaned.includes("admin:access")
    ) {
      throw new ApiError(400, "You cannot remove your own admin:access permission");
    }

    const before = {
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
    };

    user.permissions = cleaned;
    setRbacAuditFields(user, req);
    await user.save();

    await writeAudit(req, {
      action: "user.rbac.permissions.update",
      entity: "user",
      entityId: user._id,
      before,
      after: {
        permissions: user.permissions,
        rbacUpdatedAt: user.rbacUpdatedAt,
        rbacUpdatedBy: user.rbacUpdatedBy,
      },
      note: `Permissions updated (${user.permissions.length} total)`,
    });

    res.json({
      ok: true,
      permissions: user.permissions,
      rbacUpdatedAt: user.rbacUpdatedAt,
      rbacUpdatedBy: user.rbacUpdatedBy,
    });
  } catch (e) {
    next(e);
  }
};

// PATCH /users/admin/:id/block
exports.adminBlock = async (req, res, next) => {
  try {
    const targetId = String(req.params.id || "");
    if (!targetId) throw new ApiError(400, "Invalid user id");

    if (isSameUser(req, targetId)) {
      throw new ApiError(400, "You cannot block yourself");
    }

    const user = await User.findById(targetId);
    if (!user) throw new ApiError(404, "User not found");

    if (!canManageTarget(req, user)) {
      throw new ApiError(403, "You cannot manage a user with equal or higher role level");
    }

    const nextBlocked = Boolean(req.body?.blocked);

    await ensureNotRemovingLastSuperAdmin({
      currentUser: user,
      nextRole: user.role,
      nextRoleLevel: user.roleLevel,
      nextBlocked,
    });

    const before = {
      isBlocked: Boolean(user.isBlocked),
      blockedAt: user.blockedAt || null,
      blockedBy: user.blockedBy || null,
    };

    setBlockFields(user, req, nextBlocked);
    await user.save();

    await writeAudit(req, {
      action: "user.block.update",
      entity: "user",
      entityId: user._id,
      before,
      after: {
        isBlocked: user.isBlocked,
        blockedAt: user.blockedAt || null,
        blockedBy: user.blockedBy || null,
      },
      note: user.isBlocked ? "User was blocked" : "User was unblocked",
    });

    res.json({
      ok: true,
      blocked: user.isBlocked,
      blockedAt: user.blockedAt,
      blockedBy: user.blockedBy,
    });
  } catch (e) {
    next(e);
  }
};

// PATCH /users/admin/:id/rbac
exports.adminUpdateRbac = async (req, res, next) => {
  try {
    const targetId = String(req.params.id || "");
    if (!targetId) throw new ApiError(400, "Invalid user id");

    const actorIsSelf = isSameUser(req, targetId);
    const actorLevel = getActorRoleLevel(req);

    const user = await User.findById(targetId);
    if (!user) throw new ApiError(404, "User not found");

    if (!canManageTarget(req, user) && !actorIsSelf) {
      throw new ApiError(403, "You cannot manage a user with equal or higher role level");
    }

    const before = {
      role: user.role,
      roleLevel: user.roleLevel,
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      isBlocked: Boolean(user.isBlocked),
      rbacUpdatedAt: user.rbacUpdatedAt || null,
      rbacUpdatedBy: user.rbacUpdatedBy || null,
      blockedAt: user.blockedAt || null,
      blockedBy: user.blockedBy || null,
    };

    const nextRole =
      req.body?.role !== undefined ? String(req.body.role || "").toLowerCase() : user.role;
    if (!ALLOWED_ROLES.includes(nextRole)) throw new ApiError(400, "Invalid role");

    let nextRoleLevel = Number(user.roleLevel || 0);
    if (req.body?.roleLevel !== undefined) {
      const n = Number(req.body.roleLevel);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        throw new ApiError(400, "Invalid roleLevel");
      }
      nextRoleLevel = n;
    }

    const nextBlocked =
      req.body?.blocked !== undefined ? Boolean(req.body.blocked) : Boolean(user.isBlocked);

    const nextPermissions =
      req.body?.permissions !== undefined
        ? cleanAndValidatePermissions(req.body.permissions, actorLevel, {
            role: nextRole,
            roleLevel: nextRoleLevel,
          })
        : cleanAndValidatePermissions(user.permissions, actorLevel, {
            role: nextRole,
            roleLevel: nextRoleLevel,
          });

    if (actorIsSelf) {
      if (nextRole === "user") throw new ApiError(400, "You cannot demote yourself");
      if (nextBlocked) throw new ApiError(400, "You cannot block yourself");
      if (nextRoleLevel < actorLevel) {
        throw new ApiError(400, "You cannot reduce your own role level");
      }
      if (
        shouldHaveAdminShell(nextRole, nextRoleLevel, nextPermissions) &&
        !nextPermissions.includes("admin:access")
      ) {
        throw new ApiError(400, "You cannot remove your own admin:access permission");
      }
    } else {
      assertAssignableRole(req, nextRole, nextRoleLevel);
    }

    await ensureNotRemovingLastSuperAdmin({
      currentUser: user,
      nextRole,
      nextRoleLevel,
      nextBlocked,
    });

    user.role = nextRole;
    user.roleLevel = nextRoleLevel;
    user.permissions = nextPermissions;
    setBlockFields(user, req, nextBlocked);
    setRbacAuditFields(user, req);

    await user.save();

    const after = {
      role: user.role,
      roleLevel: user.roleLevel,
      permissions: user.permissions,
      isBlocked: Boolean(user.isBlocked),
      rbacUpdatedAt: user.rbacUpdatedAt || null,
      rbacUpdatedBy: user.rbacUpdatedBy || null,
      blockedAt: user.blockedAt || null,
      blockedBy: user.blockedBy || null,
    };

    await writeAudit(req, {
      action: "user.rbac.update",
      entity: "user",
      entityId: user._id,
      before,
      after,
      note: "Atomic RBAC update completed",
    });

    res.json({
      ok: true,
      user: {
        id: user._id,
        role: user.role,
        roleLevel: user.roleLevel,
        permissions: user.permissions,
        isBlocked: user.isBlocked,
        rbacUpdatedAt: user.rbacUpdatedAt,
        rbacUpdatedBy: user.rbacUpdatedBy,
        blockedAt: user.blockedAt,
        blockedBy: user.blockedBy,
      },
    });
  } catch (e) {
    next(e);
  }
};

// PATCH /users/admin/bulk-rbac
exports.adminBulkUpdateRbac = async (req, res, next) => {
  try {
    const action = String(req.body?.action || "").trim();
    const userIds = Array.isArray(req.body?.userIds)
      ? Array.from(
          new Set(req.body.userIds.map((x) => String(x || "").trim()).filter(Boolean))
        )
      : [];

    if (!action) throw new ApiError(400, "Action is required");
    if (!userIds.length) throw new ApiError(400, "No users selected");

    const users = await User.find({ _id: { $in: userIds } });
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const results = {
      ok: true,
      total: userIds.length,
      successCount: 0,
      failedCount: 0,
      updated: [],
      failed: [],
    };

    for (const id of userIds) {
      const user = byId.get(String(id));
      if (!user) {
        results.failedCount += 1;
        results.failed.push({ id, message: "User not found" });
        continue;
      }

      try {
        if (isSameUser(req, id)) {
          throw new ApiError(400, "You cannot run bulk action on yourself");
        }

        if (!canManageTarget(req, user)) {
          throw new ApiError(403, "You cannot manage a user with equal or higher role level");
        }

        const before = {
          role: user.role,
          roleLevel: user.roleLevel,
          permissions: Array.isArray(user.permissions) ? user.permissions : [],
          isBlocked: Boolean(user.isBlocked),
          rbacUpdatedAt: user.rbacUpdatedAt || null,
          rbacUpdatedBy: user.rbacUpdatedBy || null,
          blockedAt: user.blockedAt || null,
          blockedBy: user.blockedBy || null,
        };

        if (action === "block") {
          await ensureNotRemovingLastSuperAdmin({
            currentUser: user,
            nextRole: user.role,
            nextRoleLevel: user.roleLevel,
            nextBlocked: true,
          });
          setBlockFields(user, req, true);
        } else if (action === "unblock") {
          setBlockFields(user, req, false);
        } else if (action === "make-admin") {
          assertAssignableRole(req, "admin", 50);
          user.role = "admin";
          user.roleLevel = 50;
          user.permissions = cleanAndValidatePermissions(
            [...(Array.isArray(user.permissions) ? user.permissions : []), "admin:access"],
            req.user?.roleLevel,
            { role: "admin", roleLevel: 50 }
          );
          setRbacAuditFields(user, req);
        } else if (action === "make-user") {
          await ensureNotRemovingLastSuperAdmin({
            currentUser: user,
            nextRole: "user",
            nextRoleLevel: 0,
            nextBlocked: user.isBlocked,
          });
          user.role = "user";
          user.roleLevel = 0;
          user.permissions = cleanAndValidatePermissions(user.permissions, req.user?.roleLevel, {
            role: "user",
            roleLevel: 0,
          });
          setRbacAuditFields(user, req);
        } else if (action === "clear-permissions") {
          user.permissions = cleanAndValidatePermissions([], req.user?.roleLevel, {
            role: user.role,
            roleLevel: user.roleLevel,
          });
          setRbacAuditFields(user, req);
        } else if (action === "set-permissions") {
          user.permissions = cleanAndValidatePermissions(
            req.body?.permissions,
            req.user?.roleLevel,
            {
              role: user.role,
              roleLevel: user.roleLevel,
            }
          );
          setRbacAuditFields(user, req);
        } else if (action === "set-rbac") {
          const nextRole = String(req.body?.role || user.role).toLowerCase();
          const nextRoleLevel =
            req.body?.roleLevel !== undefined
              ? Number(req.body.roleLevel)
              : Number(user.roleLevel || 0);
          const nextBlocked =
            req.body?.blocked !== undefined ? Boolean(req.body.blocked) : Boolean(user.isBlocked);
          const nextPermissions =
            req.body?.permissions !== undefined
              ? cleanAndValidatePermissions(req.body.permissions, req.user?.roleLevel, {
                  role: nextRole,
                  roleLevel: nextRoleLevel,
                })
              : cleanAndValidatePermissions(user.permissions, req.user?.roleLevel, {
                  role: nextRole,
                  roleLevel: nextRoleLevel,
                });

          if (!ALLOWED_ROLES.includes(nextRole)) throw new ApiError(400, "Invalid role");
          if (!Number.isFinite(nextRoleLevel) || nextRoleLevel < 0 || nextRoleLevel > 100) {
            throw new ApiError(400, "Invalid roleLevel");
          }

          assertAssignableRole(req, nextRole, nextRoleLevel);

          await ensureNotRemovingLastSuperAdmin({
            currentUser: user,
            nextRole,
            nextRoleLevel,
            nextBlocked,
          });

          user.role = nextRole;
          user.roleLevel = nextRoleLevel;
          user.permissions = nextPermissions;
          setBlockFields(user, req, nextBlocked);
          setRbacAuditFields(user, req);
        } else {
          throw new ApiError(400, "Invalid bulk action");
        }

        await user.save();

        const after = {
          role: user.role,
          roleLevel: user.roleLevel,
          permissions: user.permissions,
          isBlocked: Boolean(user.isBlocked),
          rbacUpdatedAt: user.rbacUpdatedAt || null,
          rbacUpdatedBy: user.rbacUpdatedBy || null,
          blockedAt: user.blockedAt || null,
          blockedBy: user.blockedBy || null,
        };

        await writeAudit(req, {
          action: `user.rbac.bulk.${action}`,
          entity: "user",
          entityId: user._id,
          before,
          after,
          note: `Bulk RBAC action: ${action}`,
        });

        results.successCount += 1;
        results.updated.push({
          id: String(user._id),
          role: user.role,
          roleLevel: user.roleLevel,
          permissions: user.permissions,
          isBlocked: user.isBlocked,
          rbacUpdatedAt: user.rbacUpdatedAt,
          rbacUpdatedBy: user.rbacUpdatedBy,
          blockedAt: user.blockedAt,
          blockedBy: user.blockedBy,
        });
      } catch (err) {
        results.failedCount += 1;
        results.failed.push({
          id,
          message: err?.message || "Failed to update user",
        });
      }
    }

    res.json(results);
  } catch (e) {
    next(e);
  }
};