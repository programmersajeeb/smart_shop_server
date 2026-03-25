const router = require("express").Router();
const upload = require("../middlewares/upload");
const c = require("../controllers/upload.controller");
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");

function pickHandler(name) {
  if (typeof c?.[name] === "function") return c[name];

  return (_req, res) =>
    res.status(501).json({
      ok: false,
      message: `Not implemented: ${name}`,
    });
}

const adminOnly = [auth, requireRole("admin")];
const singleImageUpload = upload.single("image");

// local optimized upload
router.post(
  "/local",
  ...adminOnly,
  singleImageUpload,
  pickHandler("uploadLocal")
);

// firebase optimized upload
router.post(
  "/firebase",
  ...adminOnly,
  singleImageUpload,
  pickHandler("uploadToFirebase")
);

module.exports = router;