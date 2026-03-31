const router = require("express").Router();
const c = require("../controllers/product.controller");
const auth = require("../middlewares/auth");
const requireRole = require("../middlewares/requireRole");

function pickHandler(names = []) {
  for (const n of names) {
    if (typeof c?.[n] === "function") return c[n];
  }

  return (_req, res) =>
    res.status(501).json({
      ok: false,
      message: `Not implemented. Expected one of: ${names.join(", ")}`,
    });
}

const adminOnly = [auth, requireRole("admin")];

// public
router.get("/facets", pickHandler(["facets"]));
router.get(
  "/home",
  pickHandler(["home", "homepage", "getHome", "getHomepage"])
);
router.get("/", pickHandler(["list"]));

// admin list
router.get(
  "/admin",
  ...adminOnly,
  pickHandler([
    "listAdmin",
    "adminList",
    "listForAdmin",
    "getAdminProducts",
  ])
);

router.get(
  "/admin/categories",
  ...adminOnly,
  pickHandler([
    "adminCategories",
    "categoriesAdmin",
    "listCategoriesAdmin",
    "getAdminCategories",
    "categories",
  ])
);

router.post(
  "/admin/categories/rename",
  ...adminOnly,
  pickHandler([
    "renameCategory",
    "adminRenameCategory",
    "categoriesRename",
    "renameCategoryAdmin",
  ])
);

router.post(
  "/admin/categories/delete",
  ...adminOnly,
  pickHandler([
    "deleteCategory",
    "adminDeleteCategory",
    "categoriesDelete",
    "removeCategoryAdmin",
  ])
);

router.get(
  "/admin/inventory-summary",
  ...adminOnly,
  pickHandler([
    "inventorySummary",
    "adminInventorySummary",
    "getInventorySummary",
    "inventorySummaryAdmin",
  ])
);

router.patch(
  "/admin/bulk-stock",
  ...adminOnly,
  pickHandler([
    "bulkStock",
    "adminBulkStock",
    "updateBulkStock",
    "bulkStockAdmin",
    "bulkStockUpdate",
  ])
);

// NEW: hard delete route
router.delete(
  "/admin/:id/permanent",
  ...adminOnly,
  pickHandler([
    "removePermanent",
    "deletePermanent",
    "adminRemovePermanent",
    "permanentDelete",
  ])
);

// public: single product
router.get("/:id", pickHandler(["getOne"]));

// admin CRUD
router.post("/", ...adminOnly, pickHandler(["create"]));
router.patch("/:id", ...adminOnly, pickHandler(["update"]));
router.delete("/:id", ...adminOnly, pickHandler(["remove"]));

module.exports = router;