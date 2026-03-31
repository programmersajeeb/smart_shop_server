const router = require("express").Router();
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");
const c = require("../controllers/order.controller");
const promotionController = require("../controllers/promotion.controller");

// Guest checkout
router.post("/checkout/guest", c.guestCheckout);

// Public order view for confirmation
router.get("/public/:id", c.publicGetOne);

// Coupon validation / preview
router.post("/validate-coupon", promotionController.validateCoupon);

// Auth checkout + user orders
router.post("/checkout", auth, c.checkout);
router.get("/", auth, c.myOrders);

// Admin (RBAC) — MUST be before "/:id"
router.get(
  "/admin/list",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["orders:read", "orders:write"] },
    "admin"
  ),
  c.adminList
);

router.patch(
  "/admin/:id/status",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["orders:write"] },
    "admin"
  ),
  c.updateStatus
);

// User order details
router.get("/:id", auth, c.getOne);

module.exports = router;