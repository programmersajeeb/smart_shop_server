const router = require("express").Router();

const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");
const controller = require("../controllers/support.controller");

// Public contact form submission
router.post("/", controller.createPublicTicket);

// Admin support inbox
router.get(
  "/admin/summary",
  auth,
  requireRole({
    anyPermissions: ["support:read", "support:write", "users:read", "orders:read"],
  }),
  controller.getAdminSupportSummary
);

router.get(
  "/admin/list",
  auth,
  requireRole({
    anyPermissions: ["support:read", "support:write", "users:read", "orders:read"],
  }),
  controller.getAdminSupportList
);

router.get(
  "/admin/:id",
  auth,
  requireRole({
    anyPermissions: ["support:read", "support:write", "users:read", "orders:read"],
  }),
  controller.getAdminSupportOne
);

router.patch(
  "/admin/:id",
  auth,
  requireRole({
    anyPermissions: ["support:write", "users:write", "orders:write"],
  }),
  controller.updateAdminSupportTicket
);

module.exports = router;