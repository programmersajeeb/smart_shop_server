const router = require("express").Router();
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");

const c = require("../controllers/adminAuditLog.controller");

// Admin (RBAC)
// ✅ List: allow if ANY matches -> role admin OR roleLevel>=100 OR has "audit:read"
router.get(
  "/admin",
  auth,
  requireRole({ mode: "any", minLevel: 100, anyPermissions: ["audit:read"] }, "admin"),
  c.adminList
);

module.exports = router;
