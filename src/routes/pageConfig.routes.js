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

// Admin / CMS read routes
router.get(
  "/home/admin",
  auth,
  requireRole(
    {
      mode: "any",
      minLevel: 100,
      anyPermissions: ["settings:read", "settings:write"],
    },
    "admin"
  ),
  c.getHomePublic
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

router.put(
  "/contact",
  auth,
  requireRole(
    { mode: "any", minLevel: 100, anyPermissions: ["settings:write"] },
    "admin"
  ),
  c.upsertContact
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