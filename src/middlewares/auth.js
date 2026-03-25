const ApiError = require("../utils/apiError");
const { verifyAccessToken } = require("../utils/jwt");
const User = require("../models/User");

const AUTH_USER_FIELDS = [
  "_id",
  "role",
  "roleLevel",
  "permissions",
  "isBlocked",
  "email",
  "phone",
  "displayName",
  "photoURL",
  "lastLoginAt",
  "rbacUpdatedAt",
  "rbacUpdatedBy",
  "blockedAt",
  "blockedBy",
].join(" ");

function normalizePermissions(list) {
  const input = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();

  for (const raw of input) {
    const value = String(raw || "").trim();
    if (!value) continue;

    const key = value.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(key);
  }

  return out.sort((a, b) => a.localeCompare(b));
}

function getBearerToken(headerValue) {
  const header = String(headerValue || "").trim();
  if (!header || !header.startsWith("Bearer ")) return null;

  const token = header.slice(7).trim();
  return token || null;
}

module.exports = async function auth(req, res, next) {
  const token = getBearerToken(req.headers.authorization);

  if (!token) {
    return next(new ApiError(401, "Unauthorized"));
  }

  try {
    const payload = verifyAccessToken(token);

    if (!payload || typeof payload !== "object") {
      return next(new ApiError(401, "Invalid token"));
    }

    const userId = payload?.sub ? String(payload.sub) : "";
    if (!userId) {
      return next(new ApiError(401, "Invalid token"));
    }

    req.tokenClaims = payload;

    const user = await User.findById(userId).select(AUTH_USER_FIELDS).lean();

    if (!user) {
      return next(new ApiError(401, "User not found"));
    }

    if (Boolean(user.isBlocked)) {
      return next(new ApiError(403, "User blocked"));
    }

    const normalizedRole = String(user.role || "user").trim().toLowerCase();
    const normalizedRoleLevel = Number.isFinite(Number(user.roleLevel))
      ? Number(user.roleLevel)
      : 0;

    req.user = {
      ...payload,
      sub: String(user._id),

      role: normalizedRole,
      roleLevel: normalizedRoleLevel,
      permissions: normalizePermissions(user.permissions),

      email: user.email || null,
      phone: user.phone || null,
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,

      lastLoginAt: user.lastLoginAt || null,
      rbacUpdatedAt: user.rbacUpdatedAt || null,
      rbacUpdatedBy: user.rbacUpdatedBy || null,
      blockedAt: user.blockedAt || null,
      blockedBy: user.blockedBy || null,
    };

    return next();
  } catch (error) {
    return next(new ApiError(401, "Invalid token"));
  }
};