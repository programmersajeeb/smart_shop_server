const initFirebase = require("../config/firebase");
const ApiError = require("../utils/apiError");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../utils/jwt");
const { sha256 } = require("../utils/tokenHash");

const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");

function getCookieOptions() {
  const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";

  // ✅ Cross-site support: set COOKIE_SAMESITE=none when frontend+backend are on different domains
  const sameSiteRaw = String(
    process.env.COOKIE_SAMESITE || (isProd ? "none" : "lax")
  ).toLowerCase();
  const sameSite = ["lax", "strict", "none"].includes(sameSiteRaw) ? sameSiteRaw : "lax";

  // sameSite=none হলে secure=true MUST
  const secureEnv = String(process.env.COOKIE_SECURE || "").toLowerCase() === "true";
  const secure = sameSite === "none" ? true : (secureEnv || isProd);

  // ✅ Optional: subdomain/domain cookie support (set only if provided)
  const domainRaw = String(process.env.COOKIE_DOMAIN || "").trim();
  const base = {
    httpOnly: true,
    secure,
    sameSite,
    path: "/api/v1/auth",
  };

  return domainRaw ? { ...base, domain: domainRaw } : base;
}

function getRefreshCookieName() {
  return process.env.COOKIE_NAME || "rt";
}

// ✅ Central helper: stale/invalid refresh cookie থাকলে auto-clear
function clearRefreshCookie(res) {
  const cookieName = getRefreshCookieName();
  try {
    res.clearCookie(cookieName, getCookieOptions());
  } catch {}
}

/**
 * ✅ Enterprise user payload (RBAC ready)
 * Keep response stable for frontend.
 */
function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    photoURL: user.photoURL,

    role: user.role,
    roleLevel: Number(user.roleLevel || 0),
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  };
}

/**
 * ✅ Token claims (RBAC ready)
 * Note: server will still enforce using DB in middleware (next step),
 * but claims help UI + quick gating.
 */
function tokenClaims(user) {
  return {
    sub: String(user._id),
    role: user.role,
    roleLevel: Number(user.roleLevel || 0),
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  };
}

// POST /auth/firebase
exports.firebase = async (req, res, next) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) throw new ApiError(400, "idToken required");

    const admin = initFirebase();
    const decoded = await admin.auth().verifyIdToken(idToken);

    const firebaseUid = decoded.uid;
    const email = decoded.email || null;
    const phone = decoded.phone_number || null;
    const displayName = decoded.name || null;
    const photoURL = decoded.picture || null;

    let user = await User.findOne({ firebaseUid });

    if (!user) {
      user = await User.create({
        firebaseUid,
        email,
        phone,
        displayName,
        photoURL,
        lastLoginAt: new Date(),
      });
    } else {
      user.email = email ?? user.email;
      user.phone = phone ?? user.phone;
      user.displayName = displayName ?? user.displayName;
      user.photoURL = photoURL ?? user.photoURL;
      user.lastLoginAt = new Date();
      await user.save();
    }

    if (user.isBlocked) throw new ApiError(403, "User blocked");

    const accessToken = signAccessToken(tokenClaims(user));
    const refreshToken = signRefreshToken(tokenClaims(user));

    // store hashed refresh token for rotation/revocation
    const tokenHash = sha256(refreshToken);
    const payload = verifyRefreshToken(refreshToken);
    const expiresAt = new Date(payload.exp * 1000);

    await RefreshToken.create({
      user: user._id,
      tokenHash,
      expiresAt,
      userAgent: req.headers["user-agent"] || null,
      ip: req.ip || null,
    });

    res.cookie(getRefreshCookieName(), refreshToken, {
      ...getCookieOptions(),
      expires: expiresAt,
    });

    res.json({
      accessToken,
      user: publicUser(user),
    });
  } catch (e) {
    next(e);
  }
};

// POST /auth/refresh
exports.refresh = async (req, res, next) => {
  try {
    const cookieName = getRefreshCookieName();
    const token = req.cookies?.[cookieName];

    // ✅ NEW: stale cookie cleanup
    const clear = () => clearRefreshCookie(res);

    if (!token) {
      clear();
      throw new ApiError(401, "No refresh token");
    }

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      clear();
      throw new ApiError(401, "Invalid refresh token");
    }

    const tokenHash = sha256(token);
    const existing = await RefreshToken.findOne({ tokenHash });

    if (!existing) {
      clear();
      throw new ApiError(401, "Refresh token not found");
    }
    if (existing.revokedAt) {
      clear();
      throw new ApiError(401, "Refresh token revoked");
    }
    if (existing.expiresAt.getTime() < Date.now()) {
      clear();
      throw new ApiError(401, "Refresh token expired");
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      clear();
      throw new ApiError(401, "User not found");
    }
    if (user.isBlocked) {
      clear();
      throw new ApiError(403, "User blocked");
    }

    const newAccess = signAccessToken(tokenClaims(user));
    const newRefresh = signRefreshToken(tokenClaims(user));

    const newHash = sha256(newRefresh);
    const newPayload = verifyRefreshToken(newRefresh);
    const newExpiresAt = new Date(newPayload.exp * 1000);

    // rotate: revoke old and create new
    existing.revokedAt = new Date();
    existing.replacedByTokenHash = newHash;
    await existing.save();

    await RefreshToken.create({
      user: user._id,
      tokenHash: newHash,
      expiresAt: newExpiresAt,
      userAgent: req.headers["user-agent"] || null,
      ip: req.ip || null,
    });

    res.cookie(cookieName, newRefresh, {
      ...getCookieOptions(),
      expires: newExpiresAt,
    });

    // ✅ Keep same response shape (only accessToken), but token now includes RBAC claims
    res.json({ accessToken: newAccess });
  } catch (e) {
    next(e);
  }
};

// POST /auth/logout
exports.logout = async (req, res, next) => {
  try {
    const cookieName = getRefreshCookieName();
    const token = req.cookies?.[cookieName];

    if (token) {
      const tokenHash = sha256(token);
      await RefreshToken.updateOne(
        { tokenHash, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
    }

    // ✅ NEW: central clear helper
    clearRefreshCookie(res);

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

// GET /auth/me
exports.me = async (req, res, next) => {
  try {
    const userId = req.user?.sub;
    const user = await User.findById(userId).select("-__v");
    if (!user) throw new ApiError(404, "User not found");

    res.json(publicUser(user));
  } catch (e) {
    next(e);
  }
};
