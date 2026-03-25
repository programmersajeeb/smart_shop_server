const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");
const AdminAuditLog = require("../models/AdminAuditLog");

const DEFAULT_RANGE_DAYS = 7;
const ALLOWED_RANGE_MAP = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function normalizePermissions(user) {
  const list = Array.isArray(user?.permissions) ? user.permissions : [];
  const out = [];
  const seen = new Set();

  for (const raw of list) {
    const value = String(raw || "").trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }

  return out;
}

function canAny({ userPerms, isSuper }, perms = []) {
  if (isSuper) return true;
  if (!Array.isArray(perms) || perms.length === 0) return true;
  if (userPerms.includes("*")) return true;

  return perms.some((p) =>
    userPerms.includes(String(p || "").trim().toLowerCase())
  );
}

function canMinLevel(roleLevel, minLevel) {
  const current = Number(roleLevel || 0);
  const target = Number(minLevel || 0);

  if (!Number.isFinite(target)) return true;
  return Number.isFinite(current) && current >= target;
}

function parseRangeDays(value) {
  const key = String(value || "7d").trim().toLowerCase();
  return ALLOWED_RANGE_MAP[key] || DEFAULT_RANGE_DAYS;
}

function rangeKeyFromDays(days) {
  if (days === 30) return "30d";
  if (days === 90) return "90d";
  return "7d";
}

function startOfTodayLocal() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function getRangeStart(days) {
  const date = startOfTodayLocal();
  date.setDate(date.getDate() - (days - 1));
  return date;
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getOrderDate(order) {
  const raw =
    order?.createdAt ||
    order?.created_at ||
    order?.date ||
    order?.placedAt ||
    order?.updatedAt;

  const date = raw ? new Date(raw) : null;
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}

function getOrderTotal(order) {
  return (
    num(order?.total) ||
    num(order?.grandTotal) ||
    num(order?.amount) ||
    num(order?.subtotalWithShipping) ||
    0
  );
}

function getOrderItemsCount(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.reduce((sum, item) => sum + num(item?.qty, 0), 0);
}

function getProductStock(product) {
  return (
    num(product?.stock) ||
    num(product?.inventory) ||
    num(product?.quantity) ||
    num(product?.qty) ||
    0
  );
}

function getProductTitle(product) {
  return product?.title || product?.name || product?.label || "Untitled product";
}

function getProductSalesScore(product) {
  return (
    num(product?.sold) ||
    num(product?.salesCount) ||
    num(product?.orderCount) ||
    num(product?.totalSold) ||
    0
  );
}

function getProductRevenueScore(product) {
  return (
    num(product?.revenue) ||
    num(product?.totalRevenue) ||
    num(product?.salesRevenue) ||
    0
  );
}

function getProductLowStockThreshold(product) {
  const threshold = num(product?.lowStockThreshold, 5);
  return threshold > 0 ? threshold : 5;
}

function sumOrderRevenue(orders = []) {
  return orders.reduce((sum, order) => sum + getOrderTotal(order), 0);
}

function extractOrderStatusCounts(orders = []) {
  const out = {
    pending: 0,
    paid: 0,
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  };

  for (const order of orders) {
    const status = String(order?.status || "").trim().toLowerCase();
    if (status in out) out[status] += 1;
  }

  return out;
}

function formatDayLabel(date, days) {
  if (days <= 7) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function buildRangeSeries(orders, days) {
  const today = startOfTodayLocal();
  const rows = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);

    rows.push({
      key: date.toISOString().slice(0, 10),
      label: formatDayLabel(date, days),
      revenue: 0,
      orders: 0,
    });
  }

  const map = new Map(rows.map((row) => [row.key, row]));

  for (const order of orders) {
    const orderDate = getOrderDate(order);
    if (!orderDate) continue;

    const date = new Date(orderDate);
    date.setHours(0, 0, 0, 0);

    const key = date.toISOString().slice(0, 10);
    const row = map.get(key);
    if (!row) continue;

    row.orders += 1;
    row.revenue += getOrderTotal(order);
  }

  return rows;
}

function buildRecentOrders(orders = []) {
  return [...orders]
    .sort((a, b) => {
      const aTime = getOrderDate(a)?.getTime() || 0;
      const bTime = getOrderDate(b)?.getTime() || 0;
      return bTime - aTime;
    })
    .slice(0, 6)
    .map((order, idx) => {
      const fallbackId = `order-${idx}`;
      const id = order?._id || order?.id || order?.orderId || fallbackId;

      return {
        id,
        _id: id,
        status: String(order?.status || "pending"),
        createdAt: order?.createdAt || order?.created_at || order?.date || null,
        shippingAddress: {
          name: order?.shippingAddress?.name || null,
        },
        user: order?.user
          ? {
              displayName: order?.user?.displayName || order?.user?.name || null,
              email: order?.user?.email || null,
              phone: order?.user?.phone || null,
            }
          : null,
        items: Array.isArray(order?.items) ? order.items : [],
        itemsCount: getOrderItemsCount(order),
        total: getOrderTotal(order),
        customer:
          order?.shippingAddress?.name ||
          order?.customerName ||
          order?.user?.displayName ||
          order?.user?.name ||
          order?.user?.email ||
          order?.email ||
          "Customer",
      };
    });
}

function buildInventorySummary(products = []) {
  return products.reduce(
    (acc, product) => {
      const stock = getProductStock(product);
      const threshold = getProductLowStockThreshold(product);

      acc.total += 1;
      acc.totalStock += stock;

      if (stock <= 0) {
        acc.outOfStock += 1;
      } else if (stock <= threshold) {
        acc.lowStock += 1;
      }

      return acc;
    },
    {
      total: 0,
      lowStock: 0,
      outOfStock: 0,
      totalStock: 0,
    }
  );
}

function buildTopProducts(products = []) {
  return [...products]
    .map((product) => ({
      id: product?._id || product?.id || getProductTitle(product),
      title: getProductTitle(product),
      sold: getProductSalesScore(product),
      revenue: getProductRevenueScore(product),
      stock: getProductStock(product),
    }))
    .sort((a, b) => {
      if (b.sold !== a.sold) return b.sold - a.sold;
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      return a.title.localeCompare(b.title);
    })
    .slice(0, 5);
}

function buildLowStockProducts(products = []) {
  return [...products]
    .map((product) => ({
      id: product?._id || product?.id || getProductTitle(product),
      title: getProductTitle(product),
      stock: getProductStock(product),
      threshold: getProductLowStockThreshold(product),
    }))
    .filter((product) => product.stock > 0 && product.stock <= product.threshold)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 5)
    .map(({ threshold, ...rest }) => rest);
}

function pushQuickAction(list, condition, item) {
  if (!condition || !item?.to) return;

  const exists = list.some((entry) => entry.to === item.to);
  if (!exists) list.push(item);
}

function makeHealthAlert(label, value, tone, helper) {
  return { label, value, tone, helper };
}

exports.summary = async (req, res, next) => {
  try {
    const role = String(req.user?.role || "").toLowerCase();
    const roleLevel = Number(req.user?.roleLevel || 0);
    const userPerms = normalizePermissions(req.user);
    const isSuper =
      role === "superadmin" || roleLevel >= 100 || userPerms.includes("*");

    const ctx = { userPerms, isSuper };

    const access = {
      orders: canAny(ctx, ["orders:read", "orders:write"]),
      products: canAny(ctx, ["products:read", "products:write"]),
      users: canAny(ctx, ["users:read", "users:write"]),
      settings: canAny(ctx, ["settings:read", "settings:write"]),
      audit: canAny(ctx, ["audit:read"]),
      shopControl: canMinLevel(roleLevel, 1),
      roles:
        canAny(ctx, ["users:read", "users:write"]) && canMinLevel(roleLevel, 20),
    };

    const rangeDays = parseRangeDays(req.query.range);
    const rangeKey = rangeKeyFromDays(rangeDays);
    const todayStart = startOfTodayLocal();
    const rangeStart = getRangeStart(rangeDays);

    const ordersPromise = access.orders
      ? Order.find({})
          .sort({ createdAt: -1 })
          .limit(500)
          .populate("user", "displayName name email phone")
          .lean()
      : Promise.resolve([]);

    const productsPromise = access.products
      ? Product.find({})
          .sort({ updatedAt: -1, createdAt: -1 })
          .limit(500)
          .lean()
      : Promise.resolve([]);

    const usersPromise = access.users ? User.countDocuments({}) : Promise.resolve(0);
    const auditPromise = access.audit
      ? AdminAuditLog.countDocuments({})
      : Promise.resolve(0);

    const [orders, products, customerCount, auditCount] = await Promise.all([
      ordersPromise,
      productsPromise,
      usersPromise,
      auditPromise,
    ]);

    const activeProducts = access.products
      ? products.filter((product) => product?.isActive !== false)
      : [];

    const filteredOrders = access.orders
      ? orders.filter((order) => {
          const date = getOrderDate(order);
          return date && date >= rangeStart;
        })
      : [];

    const todayOrders = access.orders
      ? orders.filter((order) => {
          const date = getOrderDate(order);
          return date && date >= todayStart;
        })
      : [];

    const totalRevenue = access.orders ? sumOrderRevenue(orders) : 0;
    const todayRevenue = access.orders ? sumOrderRevenue(todayOrders) : 0;
    const filteredRevenue = access.orders ? sumOrderRevenue(filteredOrders) : 0;

    const statusCounts = access.orders ? extractOrderStatusCounts(orders) : extractOrderStatusCounts([]);
    const filteredStatusCounts = access.orders
      ? extractOrderStatusCounts(filteredOrders)
      : extractOrderStatusCounts([]);

    const recentOrders = access.orders ? buildRecentOrders(orders) : [];
    const rangeSeries = access.orders ? buildRangeSeries(filteredOrders, rangeDays) : [];

    const statusChartData = access.orders
      ? [
          { label: "Pending", value: filteredStatusCounts.pending },
          { label: "Paid", value: filteredStatusCounts.paid },
          { label: "Processing", value: filteredStatusCounts.processing },
          { label: "Shipped", value: filteredStatusCounts.shipped },
          { label: "Delivered", value: filteredStatusCounts.delivered },
          { label: "Cancelled", value: filteredStatusCounts.cancelled },
        ]
      : [];

    const inventorySummary = access.products
      ? buildInventorySummary(activeProducts)
      : {
          total: 0,
          lowStock: 0,
          outOfStock: 0,
          totalStock: 0,
        };

    const topProducts = access.products ? buildTopProducts(activeProducts) : [];
    const lowStockProducts = access.products ? buildLowStockProducts(activeProducts) : [];

    const quickActions = [];

    pushQuickAction(quickActions, access.orders, {
      to: "/admin/orders",
      title: "Manage orders",
      description: "Review new orders and update statuses.",
      icon: "ClipboardList",
    });

    pushQuickAction(quickActions, access.products, {
      to: "/admin/products",
      title: "Manage products",
      description: "Create, edit and organize product listings.",
      icon: "Package",
    });

    pushQuickAction(quickActions, access.products, {
      to: "/admin/inventory",
      title: "Check inventory",
      description: "Monitor low stock and product availability.",
      icon: "Boxes",
    });

    pushQuickAction(quickActions, access.users, {
      to: "/admin/customers",
      title: "Customers",
      description: "Open customer records and account details.",
      icon: "Users",
    });

    pushQuickAction(quickActions, access.shopControl, {
      to: "/admin/shop-control",
      title: "Shop control",
      description: "Update homepage content and merchandising settings.",
      icon: "Store",
    });

    pushQuickAction(quickActions, access.settings, {
      to: "/admin/settings",
      title: "Settings",
      description: "Configure store and operational preferences.",
      icon: "Settings",
    });

    pushQuickAction(quickActions, access.audit, {
      to: "/admin/audit-logs",
      title: "Audit logs",
      description: "Review admin activity and system change history.",
      icon: "FileText",
    });

    pushQuickAction(quickActions, access.roles, {
      to: "/admin/roles",
      title: "Roles & access",
      description: "Manage permission groups and access boundaries.",
      icon: "ShieldCheck",
    });

    const healthAlerts = [];

    if (access.products) {
      healthAlerts.push(
        makeHealthAlert(
          "Out of stock products",
          inventorySummary.outOfStock,
          inventorySummary.outOfStock > 0 ? "danger" : "success",
          inventorySummary.outOfStock > 0
            ? "Requires immediate replenishment or listing update."
            : "No product is currently fully unavailable."
        )
      );

      healthAlerts.push(
        makeHealthAlert(
          "Low stock products",
          inventorySummary.lowStock,
          inventorySummary.lowStock > 0 ? "warning" : "success",
          inventorySummary.lowStock > 0
            ? "Monitor these items before they run out."
            : "Stock levels look healthy right now."
        )
      );
    }

    if (access.orders) {
      healthAlerts.push(
        makeHealthAlert(
          "Pending orders",
          statusCounts.pending,
          statusCounts.pending > 0 ? "info" : "success",
          statusCounts.pending > 0
            ? "Review payment and fulfillment workflow."
            : "No pending backlog at the moment."
        )
      );
    }

    if (access.audit) {
      healthAlerts.push(
        makeHealthAlert(
          "Audit monitoring",
          "Enabled",
          "success",
          auditCount > 0
            ? "Audit logs are active and accessible for this operator."
            : "Audit access is available for this operator."
        )
      );
    }

    const noWidgetAccess = !access.orders && !access.products && !access.users;

    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      meta: {
        range: rangeKey,
        rangeDays,
        generatedAt: new Date().toISOString(),
      },
      viewer: {
        role,
        roleLevel,
        isSuper,
      },
      access,
      noWidgetAccess,
      stats: {
        totalOrders: access.orders ? orders.length : 0,
        filteredOrders: access.orders ? filteredOrders.length : 0,
        todayOrders: access.orders ? todayOrders.length : 0,
        totalRevenue,
        filteredRevenue,
        todayRevenue,
        customers: access.users ? customerCount : 0,
        products: access.products ? activeProducts.length : 0,
        lowStock: access.products ? inventorySummary.lowStock : 0,
        outOfStock: access.products ? inventorySummary.outOfStock : 0,
        totalStock: access.products ? inventorySummary.totalStock : 0,
      },
      charts: {
        rangeSeries,
        statusChartData,
      },
      statusCounts: {
        all: statusCounts,
        filtered: filteredStatusCounts,
      },
      recentOrders,
      topProducts,
      lowStockProducts,
      quickActions,
      healthAlerts,
    });
  } catch (error) {
    next(error);
  }
};