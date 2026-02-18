const router = require("express").Router();

const c = require("../controllers/pageConfig.controller");
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");

// Public
router.get("/shop", c.getShopPublic);

// ✅ Public admin settings (safe subset)
router.get("/admin-settings/public", c.getAdminSettingsPublic);

// Admin
router.put("/shop", auth, requireRole("admin"), c.upsertShop);

// ✅ Admin settings (full doc)
// ✅ Enterprise: GET should allow read OR write
router.get(
  "/admin-settings",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["settings:read", "settings:write"] },
    "admin"
  ),
  c.getAdminSettings
);

// ✅ Enterprise: PUT should require write
router.put(
  "/admin-settings",
  auth,
  requireRole({ mode: "any", minLevel: 100, anyPermissions: ["settings:write"] }, "admin"),
  c.upsertAdminSettings
);

module.exports = router;
