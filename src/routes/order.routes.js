const router = require("express").Router();
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");
const c = require("../controllers/order.controller");

// ✅ Guest checkout (no auth) — controlled by settings.allowGuestCheckout
router.post("/checkout/guest", c.guestCheckout);

// ✅ Public order view for confirmation (requires phone match)
router.get("/public/:id", c.publicGetOne);

// ✅ Auth checkout + user orders
router.post("/checkout", auth, c.checkout);
router.get("/", auth, c.myOrders);

// ✅ admin (RBAC) — MUST be before "/:id"
router.get(
  "/admin/list",
  auth,
  requireRole({ mode: "any", minLevel: 100, anyPermissions: ["orders:read", "orders:write"] }, "admin"),
  c.adminList
);

router.patch(
  "/admin/:id/status",
  auth,
  requireRole({ mode: "any", minLevel: 100, anyPermissions: ["orders:write"] }, "admin"),
  c.updateStatus
);

// ✅ user order details (keep last so it doesn't catch /admin/*)
router.get("/:id", auth, c.getOne);

module.exports = router;
