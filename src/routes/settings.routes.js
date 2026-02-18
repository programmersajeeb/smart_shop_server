const router = require("express").Router();

const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");

const c = require("../controllers/settings.controller");

// ✅ PUBLIC (storefront-safe)
router.get("/public", c.getPublicSettings);

// ✅ Enterprise RBAC
// GET => read OR write
const canReadSettings = requireRole({ anyPermissions: ["settings:read", "settings:write"] });

// PUT/RESET => write only
const canWriteSettings = requireRole({ anyPermissions: ["settings:write"] });

router.get("/admin", auth, canReadSettings, c.getAdminSettings);
router.put("/admin", auth, canWriteSettings, c.upsertAdminSettings);
router.post("/admin/reset", auth, canWriteSettings, c.resetAdminSettings);

module.exports = router;
