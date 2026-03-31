const router = require("express").Router();
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");
const c = require("../controllers/user.controller");

// Admin RBAC
// read access: roleLevel >= 100 OR has users:read / users:write
// write access: roleLevel >= 100 OR has users:write

router.get(
  "/admin/permissions",
  auth,
  requireRole({
    mode: "any",
    minLevel: 100,
    anyPermissions: ["users:read", "users:write"],
  }),
  c.permissionsCatalog
);

router.get(
  "/admin/list",
  auth,
  requireRole({
    mode: "any",
    minLevel: 100,
    anyPermissions: ["users:read", "users:write"],
  }),
  c.adminList
);

router.patch(
  "/admin/:id/role",
  auth,
  requireRole({
    mode: "any",
    minLevel: 100,
    anyPermissions: ["users:write"],
  }),
  c.adminUpdateRole
);

router.patch(
  "/admin/:id/permissions",
  auth,
  requireRole({
    mode: "any",
    minLevel: 100,
    anyPermissions: ["users:write"],
  }),
  c.adminUpdatePermissions
);

router.patch(
  "/admin/:id/block",
  auth,
  requireRole({
    mode: "any",
    minLevel: 100,
    anyPermissions: ["users:write"],
  }),
  c.adminBlock
);

router.patch(
  "/admin/:id/rbac",
  auth,
  requireRole({
    mode: "any",
    minLevel: 100,
    anyPermissions: ["users:write"],
  }),
  c.adminUpdateRbac
);

router.delete(
  "/admin/:id",
  auth,
  requireRole({
    mode: "any",
    minLevel: 100,
    anyPermissions: ["users:write"],
  }),
  c.adminDeleteUser
);

router.patch(
  "/admin/bulk-rbac",
  auth,
  requireRole({
    mode: "any",
    minLevel: 100,
    anyPermissions: ["users:write"],
  }),
  c.adminBulkUpdateRbac
);

module.exports = router;