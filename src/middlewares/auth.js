const ApiError = require('../utils/apiError');
const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');

module.exports = async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'Unauthorized'));

  try {
    const payload = verifyAccessToken(token);
    // Keep token claims (optional debugging / downstream usage)
    req.tokenClaims = payload;

    const userId = payload?.sub;
    if (!userId) return next(new ApiError(401, 'Invalid token'));

    // ✅ Enterprise enforcement: always load latest role/permissions from DB
    const user = await User.findById(userId)
      .select('role roleLevel permissions isBlocked email phone displayName photoURL')
      .lean();

    if (!user) return next(new ApiError(401, 'User not found'));
    if (user.isBlocked) return next(new ApiError(403, 'User blocked'));

    // ✅ req.user is now stable for all routes
    req.user = {
      ...payload, // keeps iat/exp if needed
      sub: String(user._id),

      role: user.role,
      roleLevel: Number(user.roleLevel || 0),
      permissions: Array.isArray(user.permissions) ? user.permissions : [],

      // optional identity fields (handy for audit logs)
      email: user.email || null,
      phone: user.phone || null,
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
    };

    next();
  } catch {
    next(new ApiError(401, 'Invalid token'));
  }
};
