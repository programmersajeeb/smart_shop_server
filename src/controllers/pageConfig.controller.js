const PageConfig = require("../models/PageConfig");
const ApiError = require("../utils/apiError");

/**
 * Public: GET /page-config/shop
 * Admin : PUT /page-config/shop
 *
 * ✅ NEW:
 * Public: GET /page-config/admin-settings/public
 * Admin : GET /page-config/admin-settings
 * Admin : PUT /page-config/admin-settings
 */

const ALLOWED_ICON_KEYS = new Set(["ShoppingBag", "Shirt", "Watch", "Gem", "Baby", "Gift"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function defaultShopConfig() {
  return {
    heroTitle: "Shop All Products",
    heroSubtitle:
      "Discover our latest collections, trending fashion, accessories, and more. Shop with confidence—premium quality guaranteed.",
    categories: [
      { name: "Men", iconKey: "Shirt" },
      { name: "Women", iconKey: "ShoppingBag" },
      { name: "Accessories", iconKey: "Watch" },
      { name: "Jewelry", iconKey: "Gem" },
      { name: "Kids", iconKey: "Baby" },
      { name: "Gifts", iconKey: "Gift" },
    ],
    brands: [],
    priceMax: 5000,
  };
}

/** ✅ Enterprise default admin settings (matches your AdminSettingsPage normalizeSettings) */
function defaultAdminSettings() {
  return {
    store: {
      name: "",
      supportEmail: "",
      supportPhone: "",
      address: "",
      currency: "BDT",
      timezone: "Asia/Dhaka",
    },
    branding: {
      logoUrl: "",
      faviconUrl: "",
      primaryColor: "#000000",
      enableDarkMode: false,
    },
    commerce: {
      lowStockThreshold: 5,
      allowBackorders: false,
      allowGuestCheckout: false,
      autoCancelUnpaidMinutes: 30,
    },
    notifications: {
      notifyNewOrder: false,
      notifyLowStock: false,
      emails: [],
    },
    security: {
      require2FAForAdmins: false,
      sessionMaxAgeDays: 30,
      ipAllowlist: "",
    },
    data: {
      auditLogRetentionDays: 90,
    },
    site: {
      maintenanceMode: false,
      maintenanceMessage: "We are performing scheduled maintenance. Please try again soon.",
    },
  };
}

function sanitizeString(v, maxLen) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function normalizeSpaces(v, maxLen) {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/** ✅ Enterprise: allow only http/https absolute OR "/relative" urls */
function isSafeUrl(raw) {
  const v = String(raw || "").trim();
  if (!v) return false;
  if (v.startsWith("/")) return true; // relative to our domain
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeUrl(u) {
  const v = String(u || "").trim();
  if (!v) return "";
  const cleaned = v.replace(/\s+/g, "").replace(/\/$/, "");
  return isSafeUrl(cleaned) ? cleaned : "";
}

function normalizeEmail(e) {
  const v = String(e || "").trim();
  if (!v) return "";
  const lower = v.toLowerCase();
  return EMAIL_RE.test(lower) ? lower : "";
}

function normalizeEmails(list) {
  const inArr = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();
  for (const raw of inArr) {
    const e = normalizeEmail(raw);
    if (!e) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out.slice(0, 25);
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  const k = Math.round(x);
  return Math.min(max, Math.max(min, k));
}

function toBool(v) {
  return v === true || v === "true" || v === 1 || v === "1" || v === "on";
}

/** ✅ Enterprise: optional optimistic concurrency */
function parseExpectedVersion(req) {
  const hdr = req.headers["if-match"] || req.headers["x-config-version"];
  const bodyV = req.body?.version;

  const pick = (x) => {
    if (x === undefined || x === null) return null;
    const s = String(x).match(/\d+/);
    if (!s) return null;
    const n = Number(s[0]);
    return Number.isFinite(n) ? n : null;
  };

  return pick(hdr) ?? pick(bodyV);
}

function validateShopPayload(body) {
  const heroTitle = sanitizeString(body?.heroTitle, 90);
  const heroSubtitle = sanitizeString(body?.heroSubtitle, 220);

  const categoriesIn = Array.isArray(body?.categories) ? body.categories : [];
  const categories = categoriesIn
    .map((c) => {
      const name = normalizeSpaces(c?.name, 40);
      const iconKey = normalizeSpaces(c?.iconKey, 30);
      if (!name) return null;
      if (iconKey && !ALLOWED_ICON_KEYS.has(iconKey)) return null;
      return { name, iconKey: iconKey || "ShoppingBag" };
    })
    .filter(Boolean)
    .slice(0, 40);

  const seen = new Set();
  const categoriesDeduped = [];
  for (const c of categories) {
    const key = c.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    categoriesDeduped.push(c);
  }

  const brandsIn = Array.isArray(body?.brands) ? body.brands : [];
  const brands = brandsIn.map((b) => normalizeSpaces(b, 40)).filter(Boolean).slice(0, 80);
  const brandsDeduped = Array.from(new Set(brands.map((b) => b.trim())));

  const priceMaxNum = Number(body?.priceMax);
  const priceMax =
    Number.isFinite(priceMaxNum) && priceMaxNum > 0
      ? Math.round(priceMaxNum)
      : defaultShopConfig().priceMax;

  return {
    heroTitle: heroTitle || defaultShopConfig().heroTitle,
    heroSubtitle: heroSubtitle || defaultShopConfig().heroSubtitle,
    categories: categoriesDeduped.length ? categoriesDeduped : defaultShopConfig().categories,
    brands: brandsDeduped,
    priceMax,
  };
}

/** ✅ Enterprise: validate admin settings payload (server-safe, matches UI normalizeSettings) */
function validateAdminSettingsPayload(body) {
  const base = defaultAdminSettings();

  const storeIn = body?.store || {};
  const brandingIn = body?.branding || {};
  const commerceIn = body?.commerce || {};
  const notificationsIn = body?.notifications || {};
  const securityIn = body?.security || {};
  const dataIn = body?.data || {};
  const siteIn = body?.site || {};

  const store = {
    name: normalizeSpaces(storeIn.name, 80),
    supportEmail: normalizeEmail(storeIn.supportEmail).slice(0, 120),
    supportPhone: sanitizeString(storeIn.supportPhone, 40),
    address: normalizeSpaces(storeIn.address, 200),
    currency:
      String(storeIn.currency || base.store.currency).trim().toUpperCase().slice(0, 8) ||
      base.store.currency,
    timezone: String(storeIn.timezone || base.store.timezone).trim().slice(0, 60) || base.store.timezone,
  };

  const color = sanitizeString(brandingIn.primaryColor || base.branding.primaryColor, 30) || base.branding.primaryColor;

  const branding = {
    logoUrl: normalizeUrl(brandingIn.logoUrl).slice(0, 500),
    faviconUrl: normalizeUrl(brandingIn.faviconUrl).slice(0, 500),
    primaryColor: HEX_COLOR_RE.test(color) ? color : base.branding.primaryColor,
    enableDarkMode: toBool(brandingIn.enableDarkMode),
  };

  const commerce = {
    lowStockThreshold: clampInt(commerceIn.lowStockThreshold, 0, 9999, base.commerce.lowStockThreshold),
    allowBackorders: toBool(commerceIn.allowBackorders),
    allowGuestCheckout: toBool(commerceIn.allowGuestCheckout),
    autoCancelUnpaidMinutes: clampInt(
      commerceIn.autoCancelUnpaidMinutes,
      0,
      7 * 24 * 60,
      base.commerce.autoCancelUnpaidMinutes
    ),
  };

  const notifications = {
    notifyNewOrder: toBool(notificationsIn.notifyNewOrder),
    notifyLowStock: toBool(notificationsIn.notifyLowStock),
    emails: normalizeEmails(notificationsIn.emails),
  };

  const security = {
    require2FAForAdmins: toBool(securityIn.require2FAForAdmins),
    sessionMaxAgeDays: clampInt(securityIn.sessionMaxAgeDays, 1, 365, base.security.sessionMaxAgeDays),
    ipAllowlist: normalizeSpaces(securityIn.ipAllowlist, 400),
  };

  const data = {
    auditLogRetentionDays: clampInt(dataIn.auditLogRetentionDays, 7, 3650, base.data.auditLogRetentionDays),
  };

  const maintenanceMessage = sanitizeString(siteIn.maintenanceMessage, 220);

  const site = {
    maintenanceMode: toBool(siteIn.maintenanceMode),
    maintenanceMessage: maintenanceMessage || base.site.maintenanceMessage,
  };

  return { store, branding, commerce, notifications, security, data, site };
}

/** ✅ Enterprise: atomic get-or-create (race-condition safe) */
async function getOrCreate(key, defaults) {
  const doc = await PageConfig.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, data: defaults, version: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc;
}

/** ==========================
 * SHOP CONFIG
 * ========================== */

exports.getShopPublic = async (req, res, next) => {
  try {
    const doc = await getOrCreate("shop", defaultShopConfig());
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({
      key: doc.key,
      data: doc.data || defaultShopConfig(),
      updatedAt: doc.updatedAt,
      version: doc.version,
    });
  } catch (e) {
    next(e);
  }
};

exports.upsertShop = async (req, res, next) => {
  try {
    const expectedVersion = parseExpectedVersion(req);
    const data = validateShopPayload(req.body || {});
    const update = {
      $set: { data, updatedBy: req.user?.sub || null },
      $inc: { version: 1 },
    };

    const filter = { key: "shop" };
    if (expectedVersion != null) filter.version = expectedVersion;

    const doc = await PageConfig.findOneAndUpdate(filter, update, {
      new: true,
      upsert: expectedVersion == null,
      setDefaultsOnInsert: true,
    });

    if (!doc && expectedVersion != null) throw new ApiError(409, "Version conflict. Please reload and try again.");
    if (!doc) throw new ApiError(500, "Failed to update shop config");

    res.json({
      key: doc.key,
      data: doc.data,
      updatedAt: doc.updatedAt,
      version: doc.version,
    });
  } catch (e) {
    next(e);
  }
};

/** ============================================================
 * ✅ ADMIN SETTINGS (Enterprise)
 * - Public endpoint returns ONLY safe flags + maintenance message
 * - Admin endpoints return full admin_settings document
 * ============================================================ */

// Public: GET /page-config/admin-settings/public
exports.getAdminSettingsPublic = async (req, res, next) => {
  try {
    const doc = await getOrCreate("admin_settings", defaultAdminSettings());

    const safe = {
      commerce: {
        allowBackorders: Boolean(doc?.data?.commerce?.allowBackorders),
        allowGuestCheckout: Boolean(doc?.data?.commerce?.allowGuestCheckout),
      },
      site: {
        maintenanceMode: Boolean(doc?.data?.site?.maintenanceMode),
        maintenanceMessage:
          sanitizeString(doc?.data?.site?.maintenanceMessage, 220) ||
          defaultAdminSettings().site.maintenanceMessage,
      },
    };

    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.json({
      key: doc.key,
      data: safe,
      updatedAt: doc.updatedAt,
      version: doc.version,
    });
  } catch (e) {
    next(e);
  }
};

// Admin: GET /page-config/admin-settings
exports.getAdminSettings = async (req, res, next) => {
  try {
    const doc = await getOrCreate("admin_settings", defaultAdminSettings());
    res.set("Cache-Control", "no-store");
    res.json({
      key: doc.key,
      data: doc.data || defaultAdminSettings(),
      updatedAt: doc.updatedAt,
      version: doc.version,
    });
  } catch (e) {
    next(e);
  }
};

// Admin: PUT /page-config/admin-settings
exports.upsertAdminSettings = async (req, res, next) => {
  try {
    const expectedVersion = parseExpectedVersion(req);
    const data = validateAdminSettingsPayload(req.body || {});
    const update = {
      $set: { data, updatedBy: req.user?.sub || null },
      $inc: { version: 1 },
    };

    const filter = { key: "admin_settings" };
    if (expectedVersion != null) filter.version = expectedVersion;

    const doc = await PageConfig.findOneAndUpdate(filter, update, {
      new: true,
      upsert: expectedVersion == null,
      setDefaultsOnInsert: true,
    });

    if (!doc && expectedVersion != null) throw new ApiError(409, "Version conflict. Please reload and try again.");
    if (!doc) throw new ApiError(500, "Failed to update admin settings");

    res.set("Cache-Control", "no-store");
    res.json({
      key: doc.key,
      data: doc.data,
      updatedAt: doc.updatedAt,
      version: doc.version,
    });
  } catch (e) {
    next(e);
  }
};
