const router = require("express").Router();

const c = require("../controllers/pageConfig.controller");
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");

// Public
router.get("/shop", c.getShopPublic);
router.get("/home", c.getHomePublic);
router.get("/contact", c.getContactPublic);
router.get("/collections", c.getCollectionsPublic);

// Public admin settings (safe subset)
router.get("/admin-settings/public", c.getAdminSettingsPublic);

// Admin / CMS write routes
router.put(
  "/shop",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["settings:write"] },
    "admin"
  ),
  c.upsertShop
);

router.put(
  "/home",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["settings:write"] },
    "admin"
  ),
  c.upsertHome
);

router.get(
  "/contact",
  auth,
  requireRole(
    {
      mode: "any",
      minLevel: 100,
      anyPermissions: ["settings:read", "settings:write"],
    },
    "admin"
  ),
  c.getContact
);

router.put(
  "/contact",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["settings:write"] },
    "admin"
  ),
  c.upsertContact
);

router.get(
  "/collections",
  auth,
  requireRole(
    {
      mode: "any",
      minLevel: 100,
      anyPermissions: ["settings:read", "settings:write"],
    },
    "admin"
  ),
  c.getCollections
);

router.put(
  "/collections",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["settings:write"] },
    "admin"
  ),
  c.upsertCollections
);

// Admin settings (full doc)
// GET should allow read OR write
router.get(
  "/admin-settings",
  auth,
  requireRole(
    {
      mode: "any",
      minLevel: 100,
      anyPermissions: ["settings:read", "settings:write"],
    },
    "admin"
  ),
  c.getAdminSettings
);

// PUT should require write
router.put(
  "/admin-settings",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["settings:write"] },
    "admin"
  ),
  c.upsertAdminSettings
);

module.exports = router;