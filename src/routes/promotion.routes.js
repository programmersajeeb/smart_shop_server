const router = require("express").Router();
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");
const c = require("../controllers/promotion.controller");

// Public / auth coupon validation
router.post("/validate-coupon", c.validateCoupon);

// Admin only
router.get(
  "/admin",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["settings:read", "settings:write"] },
    "admin"
  ),
  c.adminList
);

router.get(
  "/admin/:id",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["settings:read", "settings:write"] },
    "admin"
  ),
  c.adminGetOne
);

router.post(
  "/admin",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["settings:write"] },
    "admin"
  ),
  c.adminCreate
);

router.patch(
  "/admin/:id",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["settings:write"] },
    "admin"
  ),
  c.adminUpdate
);

router.patch(
  "/admin/:id/toggle",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["settings:write"] },
    "admin"
  ),
  c.adminToggle
);

router.delete(
  "/admin/:id",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["settings:write"] },
    "admin"
  ),
  c.adminRemove
);

module.exports = router;