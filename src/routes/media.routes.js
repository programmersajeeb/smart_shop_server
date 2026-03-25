const router = require("express").Router();
const c = require("../controllers/media.controller");

function pickHandler(name) {
  if (typeof c?.[name] === "function") return c[name];

  return (_req, res) =>
    res.status(501).json({
      ok: false,
      message: `Not implemented: ${name}`,
    });
}

// media binary stream
router.get("/:id", pickHandler("getMediaById"));

// media metadata
router.get("/:id/meta", pickHandler("getMediaMetaById"));

module.exports = router;