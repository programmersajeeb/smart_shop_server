const router = require("express").Router();

// Auth
router.use("/auth", require("./auth.routes"));

// Store / catalog
router.use("/products", require("./product.routes"));
router.use("/page-config", require("./pageConfig.routes"));
router.use("/upload", require("./upload.routes"));
router.use("/media", require("./media.routes"));
router.use("/cart", require("./cart.routes"));
router.use("/orders", require("./order.routes"));
router.use("/promotions", require("./promotion.routes"));
router.use("/settings", require("./settings.routes"));
router.use("/newsletter", require("./newsletter.routes"));

// Admin
router.use("/admin-overview", require("./adminOverview.routes"));
router.use("/users", require("./user.routes"));
router.use("/audit-logs", require("./auditLogs.routes"));

router.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Smart Shop API",
  });
});

module.exports = router;