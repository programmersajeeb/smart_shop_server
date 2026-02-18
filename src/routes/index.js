const router = require("express").Router();

router.use("/auth", require("./auth.routes"));
router.use("/products", require("./product.routes"));
router.use("/page-config", require("./pageConfig.routes"));
router.use("/upload", require("./upload.routes"));
router.use("/cart", require("./cart.routes"));
router.use("/orders", require("./order.routes"));
router.use("/settings", require("./settings.routes"));

// ✅ NEW (RBAC + Audit)
router.use("/users", require("./user.routes"));
router.use("/audit-logs", require("./auditLogs.routes"));

module.exports = router;
