const router = require("express").Router();
const auth = require("../middlewares/auth");
const rateLimit = require("express-rate-limit");

const c = require("../controllers/auth.controller");

// ✅ stricter rate limit for auth routes
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20, // login/refresh brute-force protection
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    message: "Too many auth requests, please try again later.",
  },
});

// Public routes
router.post("/firebase", authLimiter, c.firebase);
router.post("/refresh", authLimiter, c.refresh);
router.post("/logout", c.logout);

// Protected route
router.get("/me", auth, c.me);

module.exports = router;