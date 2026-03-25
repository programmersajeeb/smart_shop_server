const ApiError = require("../utils/apiError");

function normalizeValues(list = []) {
  const input = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();

  for (const raw of input) {
    const value = String(raw || "").trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }

  return out;
}

function normalizePermissions(user) {
  return normalizeValues(user?.permissions);
}

function hasAnyPermission(userPerms, permissionList) {
  const normalized = normalizeValues(permissionList);
  if (!normalized.length) return false;

  return normalized.some(
    (permission) => userPerms.includes(permission) || userPerms.includes("*")
  );
}

function hasAllPermissions(userPerms, permissionList) {
  const normalized = normalizeValues(permissionList);
  if (!normalized.length) return false;

  return normalized.every(
    (permission) => userPerms.includes(permission) || userPerms.includes("*")
  );
}

module.exports = function requireRole(...args) {
  let options = {};
  const roles = [];

  for (const arg of args) {
    if (arg && typeof arg === "object" && !Array.isArray(arg)) {
      options = { ...options, ...arg };
      continue;
    }

    const role = String(arg || "").trim().toLowerCase();
    if (role) roles.push(role);
  }

  const normalizedRoles = normalizeValues(roles);
  const mode = String(options.mode || "any").trim().toLowerCase() === "all" ? "all" : "any";

  const parsedMinLevel = Number(options.minLevel);
  const minLevel = Number.isFinite(parsedMinLevel) ? parsedMinLevel : null;

  const anyPermissions = normalizeValues(options.anyPermissions);
  const allPermissions = normalizeValues(options.allPermissions);

  return (req, res, next) => {
    const role = String(req.user?.role || "").trim().toLowerCase();
    if (!role) {
      return next(new ApiError(401, "Unauthorized"));
    }

    const roleLevel = Number(req.user?.roleLevel || 0);
    const userPerms = normalizePermissions(req.user);

    const isSuper =
      role === "superadmin" ||
      (Number.isFinite(roleLevel) && roleLevel >= 100) ||
      userPerms.includes("*");

    if (isSuper) {
      return next();
    }

    const checks = [];

    if (normalizedRoles.length) {
      checks.push(normalizedRoles.includes(role));
    }

    if (minLevel !== null) {
      checks.push(Number.isFinite(roleLevel) && roleLevel >= minLevel);
    }

    if (anyPermissions.length) {
      checks.push(hasAnyPermission(userPerms, anyPermissions));
    }

    if (allPermissions.length) {
      checks.push(hasAllPermissions(userPerms, allPermissions));
    }

    if (!checks.length) {
      return next();
    }

    const allowed = mode === "all" ? checks.every(Boolean) : checks.some(Boolean);

    if (!allowed) {
      return next(new ApiError(403, "Forbidden"));
    }

    return next();
  };
};