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
  const isProd =
    String(process.env.NODE_ENV || "").toLowerCase() === "production";

  // Support both COOKIE_SAMESITE and COOKIE_SAME_SITE
  const sameSiteEnv =
    process.env.COOKIE_SAMESITE ?? process.env.COOKIE_SAME_SITE;

  const sameSiteRaw = String(
    sameSiteEnv || (isProd ? "none" : "lax")
  ).toLowerCase();

  const sameSite = ["lax", "strict", "none"].includes(sameSiteRaw)
    ? sameSiteRaw
    : "lax";

  // sameSite=none হলে secure=true MUST
  const secureEnv =
    String(process.env.COOKIE_SECURE || "").toLowerCase() === "true";
  const secure = sameSite === "none" ? true : secureEnv || isProd;

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

function clearRefreshCookie(res) {
  const cookieName = getRefreshCookieName();
  try {
    res.clearCookie(cookieName, getCookieOptions());
  } catch {}
}

function publicUser(user) {
  return {
    id: String(user._id),
    email: user.email || null,
    phone: user.phone || null,
    displayName: user.displayName || null,
    photoURL: user.photoURL || null,

    role: user.role,
    roleLevel: Number(user.roleLevel || 0),
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  };
}

function tokenClaims(user) {
  return {
    sub: String(user._id),
    role: user.role,
    roleLevel: Number(user.roleLevel || 0),
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  };
}

async function issueSession(user, req, res) {
  const accessToken = signAccessToken(tokenClaims(user));
  const refreshToken = signRefreshToken(tokenClaims(user));

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

  return { accessToken, expiresAt, refreshToken };
}

// POST /auth/firebase
exports.firebase = async (req, res, next) => {
  try {
    const rawIdToken = req.body?.idToken;
    const idToken = String(rawIdToken || "").trim();

    if (!idToken) {
      throw new ApiError(400, "idToken required");
    }

    const admin = initFirebase();
    const decoded = await admin.auth().verifyIdToken(idToken, true);

    const firebaseUid = decoded.uid;
    if (!firebaseUid) {
      throw new ApiError(401, "Invalid Firebase token");
    }

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

    if (user.isBlocked) {
      throw new ApiError(403, "User blocked");
    }

    const { accessToken } = await issueSession(user, req, res);

    res.json({
      ok: true,
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
    const token = String(req.cookies?.[cookieName] || "").trim();

    if (!token) {
      clearRefreshCookie(res);
      throw new ApiError(401, "No refresh token");
    }

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      clearRefreshCookie(res);
      throw new ApiError(401, "Invalid refresh token");
    }

    const userId = payload?.sub;
    if (!userId) {
      clearRefreshCookie(res);
      throw new ApiError(401, "Invalid refresh token");
    }

    const tokenHash = sha256(token);
    const existing = await RefreshToken.findOne({ tokenHash });

    if (!existing) {
      clearRefreshCookie(res);
      throw new ApiError(401, "Refresh token not found");
    }

    if (existing.revokedAt) {
      clearRefreshCookie(res);

      // Optional defensive action: revoke all active tokens for this user on token reuse
      await RefreshToken.updateMany(
        { user: existing.user, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );

      throw new ApiError(401, "Refresh token revoked");
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      clearRefreshCookie(res);
      throw new ApiError(401, "Refresh token expired");
    }

    const user = await User.findById(userId);
    if (!user) {
      clearRefreshCookie(res);
      throw new ApiError(401, "User not found");
    }

    if (user.isBlocked) {
      clearRefreshCookie(res);
      throw new ApiError(403, "User blocked");
    }

    const newAccess = signAccessToken(tokenClaims(user));
    const newRefresh = signRefreshToken(tokenClaims(user));

    const newHash = sha256(newRefresh);
    const newPayload = verifyRefreshToken(newRefresh);
    const newExpiresAt = new Date(newPayload.exp * 1000);

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

    res.json({
      ok: true,
      accessToken: newAccess,
    });
  } catch (e) {
    next(e);
  }
};

// POST /auth/logout
exports.logout = async (req, res, next) => {
  try {
    const cookieName = getRefreshCookieName();
    const token = String(req.cookies?.[cookieName] || "").trim();

    if (token) {
      const tokenHash = sha256(token);
      await RefreshToken.updateOne(
        { tokenHash, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
    }

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
    if (!userId) {
      throw new ApiError(401, "Unauthorized");
    }

    const user = await User.findById(userId).select("-__v");
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    res.json({
      ok: true,
      user: publicUser(user),
    });
  } catch (e) {
    next(e);
  }
};