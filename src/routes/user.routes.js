const router = require("express").Router();
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");
const c = require("../controllers/user.controller");

// Admin RBAC:
// ✅ allow: roleLevel>=100 OR has users:read / users:write permissions

router.get(
  "/admin/permissions",
  auth,
  requireRole({ mode: "any", minLevel: 100, anyPermissions: ["users:read"] }),
  c.permissionsCatalog
);

router.get(
  "/admin/list",
  auth,
  requireRole({ mode: "any", minLevel: 100, anyPermissions: ["users:read"] }),
  c.adminList
);

router.patch(
  "/admin/:id/role",
  auth,
  requireRole({ mode: "any", minLevel: 100, anyPermissions: ["users:write"] }),
  c.adminUpdateRole
);

router.patch(
  "/admin/:id/permissions",
  auth,
  requireRole({ mode: "any", minLevel: 100, anyPermissions: ["users:write"] }),
  c.adminUpdatePermissions
);

router.patch(
  "/admin/:id/block",
  auth,
  requireRole({ mode: "any", minLevel: 100, anyPermissions: ["users:write"] }),
  c.adminBlock
);

module.exports = router;
