const router = require("express").Router();
const upload = require("../middlewares/upload");
const c = require("../controllers/upload.controller");
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");

// local
router.post("/local", auth, requireRole("admin"), upload.single("image"), c.uploadLocal);

// firebase storage
router.post("/firebase", auth, requireRole("admin"), upload.single("image"), c.uploadToFirebase);

module.exports = router;
