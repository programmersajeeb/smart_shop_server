const router = require('express').Router();
const c = require('../controllers/product.controller');
const auth = require('../middlewares/auth');
const requireRole = require('../middlewares/requireRole');

/**
 * Enterprise-safe handler picker:
 * - supports multiple possible controller function names
 * - prevents server crash if a handler is missing (returns 501)
 */
function pickHandler(names = []) {
  for (const n of names) {
    if (typeof c?.[n] === 'function') return c[n];
  }
  return (req, res) =>
    res.status(501).json({
      message: `Not implemented. Expected one of: ${names.join(', ')}`,
    });
}

// public
// IMPORTANT: keep fixed paths BEFORE '/:id' to avoid treating them as an id.
router.get('/facets', c.facets);
router.get('/', c.list);

// admin list (dashboard)
router.get('/admin', auth, requireRole('admin'), c.listAdmin);

/**
 * ✅ Admin: Categories (derived from products)
 * UI expects:
 * - GET  /products/admin/categories
 * - POST /products/admin/categories/rename
 * - POST /products/admin/categories/delete
 */
router.get(
  '/admin/categories',
  auth,
  requireRole('admin'),
  pickHandler(['adminCategories', 'categoriesAdmin', 'listCategoriesAdmin', 'getAdminCategories', 'categories'])
);

router.post(
  '/admin/categories/rename',
  auth,
  requireRole('admin'),
  pickHandler(['renameCategory', 'adminRenameCategory', 'categoriesRename', 'renameCategoryAdmin'])
);

router.post(
  '/admin/categories/delete',
  auth,
  requireRole('admin'),
  pickHandler(['deleteCategory', 'adminDeleteCategory', 'categoriesDelete', 'removeCategoryAdmin'])
);

/**
 * ✅ Admin: Inventory helpers
 * UI expects:
 * - GET   /products/admin/inventory-summary
 * - PATCH /products/admin/bulk-stock
 */
router.get(
  '/admin/inventory-summary',
  auth,
  requireRole('admin'),
  pickHandler(['inventorySummary', 'adminInventorySummary', 'getInventorySummary', 'inventorySummaryAdmin'])
);

router.patch(
  '/admin/bulk-stock',
  auth,
  requireRole('admin'),
  pickHandler(['bulkStock', 'adminBulkStock', 'updateBulkStock', 'bulkStockAdmin'])
);

// public: single product
router.get('/:id', c.getOne);

// admin
router.post('/', auth, requireRole('admin'), c.create);
router.patch('/:id', auth, requireRole('admin'), c.update);
router.delete('/:id', auth, requireRole('admin'), c.remove);

module.exports = router;
