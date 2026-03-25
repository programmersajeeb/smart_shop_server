const router = require("express").Router();

const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");
const adminOverviewController = require("../controllers/adminOverview.controller");

const allowAdminOverview = requireRole(
  { mode: "any", minLevel: 1, anyPermissions: ["admin:access"] },
  "admin",
  "manager",
  "support",
  "editor",
  "auditor",
  "superadmin"
);

router.get("/", auth, allowAdminOverview, adminOverviewController.summary);
router.get("/summary", auth, allowAdminOverview, adminOverviewController.summary);

module.exports = router;