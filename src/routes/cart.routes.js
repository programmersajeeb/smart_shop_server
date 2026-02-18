const router = require("express").Router();
const auth = require("../middlewares/auth");
const c = require("../controllers/cart.controller");

router.get("/", auth, c.getCart);
router.post("/items", auth, c.addItem);
router.patch("/items/:itemId", auth, c.updateItemQty);
router.delete("/items/:itemId", auth, c.removeItem);

// ✅ Backward compatible: client may call POST /cart/clear
router.post("/clear", auth, c.clearCart);

// Existing clear endpoint (recommended for REST)
router.delete("/", auth, c.clearCart);

module.exports = router;
