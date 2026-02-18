const ApiError = require("../utils/apiError");

function normalizePermissions(u) {
  const list = Array.isArray(u?.permissions) ? u.permissions : [];
  const out = [];
  const seen = new Set();

  for (const raw of list) {
    const p = String(raw || "").trim();
    if (!p) continue;
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function hasAnyPerm(userPerms, anyList) {
  if (!Array.isArray(anyList) || anyList.length === 0) return false;
  return anyList.some((p) => userPerms.includes(String(p || "").trim().toLowerCase()));
}

function hasAllPerm(userPerms, allList) {
  if (!Array.isArray(allList) || allList.length === 0) return false;
  return allList.every((p) => userPerms.includes(String(p || "").trim().toLowerCase()));
}

module.exports = function requireRole(...args) {
  let opts = null;
  const roles = [];

  for (const a of args) {
    if (a && typeof a === "object" && !Array.isArray(a)) {
      opts = { ...(opts || {}), ...a };
    } else {
      const r = String(a || "").trim();
      if (r) roles.push(r.toLowerCase());
    }
  }

  const mode = String(opts?.mode || "any").toLowerCase() === "all" ? "all" : "any";
  const minLevelRaw = Number(opts?.minLevel);
  const minLevel = Number.isFinite(minLevelRaw) ? minLevelRaw : null;

  const anyPermissions = Array.isArray(opts?.anyPermissions) ? opts.anyPermissions : [];
  const allPermissions = Array.isArray(opts?.allPermissions) ? opts.allPermissions : [];

  return (req, res, next) => {
    const role = String(req.user?.role || "").toLowerCase();
    if (!role) return next(new ApiError(401, "Unauthorized"));

    const roleLevel = Number(req.user?.roleLevel || 0);
    const perms = normalizePermissions(req.user);

    // ✅ Enterprise super-allow (backward compatible)
    const isSuper =
      role === "admin" ||
      role === "superadmin" ||
      (Number.isFinite(roleLevel) && roleLevel >= 100) ||
      perms.includes("*");

    if (isSuper) return next();

    const checks = [];

    if (roles.length) {
      checks.push(roles.includes(role));
    }

    if (minLevel !== null) {
      checks.push(Number.isFinite(roleLevel) && roleLevel >= minLevel);
    }

    if (anyPermissions.length) {
      checks.push(hasAnyPerm(perms, anyPermissions));
    }

    if (allPermissions.length) {
      checks.push(hasAllPerm(perms, allPermissions));
    }

    // no constraints -> allow
    if (!checks.length) return next();

    const ok = mode === "all" ? checks.every(Boolean) : checks.some(Boolean);
    if (!ok) return next(new ApiError(403, "Forbidden"));

    next();
  };
};
