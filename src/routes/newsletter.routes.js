const router = require("express").Router();

const c = require("../controllers/newsletter.controller");
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");

// Public
router.post("/subscribe", c.subscribe);

// Admin summary
router.get(
  "/admin/summary",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["newsletter:read", "newsletter:write"] },
    "admin"
  ),
  c.getAdminSummary
);

// Admin list
router.get(
  "/admin/list",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["newsletter:read", "newsletter:write"] },
    "admin"
  ),
  c.getAdminList
);

// Admin status update
router.patch(
  "/admin/:id/status",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["newsletter:write"] },
    "admin"
  ),
  c.updateSubscriberStatus
);

module.exports = router;