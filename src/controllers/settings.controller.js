const PageConfig = require("../models/PageConfig");
const AdminAuditLog = require("../models/AdminAuditLog");
const ApiError = require("../utils/apiError");

/**
 * Admin Settings (Enterprise)
 * --------------------------
 * Storage strategy:
 * - Reuse PageConfig as a flexible, versioned settings store.
 * - Key: "admin_settings"
 * - Every write is validated + versioned + audit logged.
 * - ✅ Atomic get-or-create (race safe)
 * - ✅ Optional optimistic concurrency (If-Match / X-Config-Version / body.version)
 * - ✅ Public subset includes maintenance fields (parity with /page-config/admin-settings/public)
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function defaultAdminSettings() {
  return {
    store: {
      name: "Smart Shop",
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
      allowGuestCheckout: true,
      autoCancelUnpaidMinutes: 30,
    },
    notifications: {
      notifyNewOrder: true,
      notifyLowStock: true,
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

function collapseSpaces(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function sanitizeString(v, maxLen) {
  const s = collapseSpaces(v);
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function sanitizeEmail(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "";
  return EMAIL_RE.test(s) ? s : "";
}

/** ✅ Enterprise: allow http/https absolute OR "/relative" */
function sanitizeUrl(v, maxLen) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const clipped = (s.length > maxLen ? s.slice(0, maxLen) : s).replace(/\s+/g, "").replace(/\/$/, "");

  if (clipped.startsWith("/")) return clipped; // allow relative to our domain

  try {
    const u = new URL(clipped);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return clipped;
  } catch {
    return "";
  }
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  const k = Math.round(x);
  return Math.min(max, Math.max(min, k));
}

function normalizeEmailList(list) {
  const inArr = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();
  for (const raw of inArr) {
    const e = sanitizeEmail(raw);
    if (!e) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out.slice(0, 25);
}

/** ✅ Optional optimistic concurrency */
function parseExpectedVersion(req) {
  const hdr = req.headers["if-match"] || req.headers["x-config-version"];
  const bodyV = req.body?.version;

  const pick = (x) => {
    if (x === undefined || x === null) return null;
    const m = String(x).match(/\d+/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
  };

  return pick(hdr) ?? pick(bodyV);
}

function validatePayload(body) {
  const base = defaultAdminSettings();
  const b = body && typeof body === "object" ? body : {};

  const primaryColor = sanitizeString(b?.branding?.primaryColor, 30) || base.branding.primaryColor;

  return {
    store: {
      name: sanitizeString(b?.store?.name, 80) || base.store.name,
      supportEmail: sanitizeEmail(b?.store?.supportEmail) || "",
      supportPhone: sanitizeString(b?.store?.supportPhone, 40) || "",
      address: sanitizeString(b?.store?.address, 200) || "",
      currency: sanitizeString(b?.store?.currency, 8).toUpperCase() || base.store.currency,
      timezone: sanitizeString(b?.store?.timezone, 60) || base.store.timezone,
    },
    branding: {
      logoUrl: sanitizeUrl(b?.branding?.logoUrl, 500) || "",
      faviconUrl: sanitizeUrl(b?.branding?.faviconUrl, 500) || "",
      primaryColor: HEX_COLOR_RE.test(primaryColor) ? primaryColor : base.branding.primaryColor,
      enableDarkMode: Boolean(b?.branding?.enableDarkMode),
    },
    commerce: {
      lowStockThreshold: clampInt(b?.commerce?.lowStockThreshold, 0, 9999, base.commerce.lowStockThreshold),
      allowBackorders: Boolean(b?.commerce?.allowBackorders),
      allowGuestCheckout: Boolean(
        typeof b?.commerce?.allowGuestCheckout === "boolean"
          ? b.commerce.allowGuestCheckout
          : base.commerce.allowGuestCheckout
      ),
      autoCancelUnpaidMinutes: clampInt(
        b?.commerce?.autoCancelUnpaidMinutes,
        0,
        7 * 24 * 60,
        base.commerce.autoCancelUnpaidMinutes
      ),
    },
    notifications: {
      notifyNewOrder: Boolean(
        typeof b?.notifications?.notifyNewOrder === "boolean"
          ? b.notifications.notifyNewOrder
          : base.notifications.notifyNewOrder
      ),
      notifyLowStock: Boolean(
        typeof b?.notifications?.notifyLowStock === "boolean"
          ? b.notifications.notifyLowStock
          : base.notifications.notifyLowStock
      ),
      emails: normalizeEmailList(b?.notifications?.emails),
    },
    security: {
      require2FAForAdmins: Boolean(b?.security?.require2FAForAdmins),
      sessionMaxAgeDays: clampInt(b?.security?.sessionMaxAgeDays, 1, 365, base.security.sessionMaxAgeDays),
      ipAllowlist: sanitizeString(b?.security?.ipAllowlist, 400) || "",
    },
    data: {
      auditLogRetentionDays: clampInt(b?.data?.auditLogRetentionDays, 7, 3650, base.data.auditLogRetentionDays),
    },
    site: {
      maintenanceMode: Boolean(b?.site?.maintenanceMode),
      maintenanceMessage:
        sanitizeString(b?.site?.maintenanceMessage, 220) || base.site.maintenanceMessage,
    },
  };
}

/** ✅ Enterprise: atomic get-or-create (race-safe) */
async function getOrCreate(key, defaults) {
  const doc = await PageConfig.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, data: defaults, version: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc;
}

async function writeAudit({ req, before, after, entityId, action }) {
  try {
    const actor = req.user?.sub;
    if (!actor) return;
    await AdminAuditLog.create({
      actor,
      action: String(action || "settings.update").trim(),
      entity: "settings",
      entityId: entityId || null,
      before: before ?? null,
      after: after ?? null,
      meta: {
        ip: req.ip,
        ua: req.get("user-agent"),
        path: req.originalUrl,
      },
    });
  } catch {
    // Never block the request on audit errors
  }
}

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

exports.upsertAdminSettings = async (req, res, next) => {
  try {
    const expectedVersion = parseExpectedVersion(req);
    const nextData = validatePayload(req.body || {});

    const existing = await PageConfig.findOne({ key: "admin_settings" });
    const before = existing ? existing.data : null;

    const update = {
      $set: { data: nextData, updatedBy: req.user?.sub || null },
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
    if (!doc) throw new ApiError(500, "Failed to update settings");

    await writeAudit({
      req,
      before,
      after: doc.data,
      entityId: doc._id,
      action: "settings.update",
    });

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

exports.resetAdminSettings = async (req, res, next) => {
  try {
    const expectedVersion = parseExpectedVersion(req);
    const defaults = defaultAdminSettings();

    const existing = await PageConfig.findOne({ key: "admin_settings" });
    const before = existing ? existing.data : null;

    const update = {
      $set: { data: defaults, updatedBy: req.user?.sub || null },
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
    if (!doc) throw new ApiError(500, "Failed to reset settings");

    await writeAudit({
      req,
      before,
      after: doc.data,
      entityId: doc._id,
      action: "settings.reset",
    });

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

// ✅ Public settings (storefront-safe)
function pickPublicSettings(full) {
  const d = full || defaultAdminSettings();
  return {
    store: {
      name: d?.store?.name || "Smart Shop",
      supportEmail: d?.store?.supportEmail || "",
      supportPhone: d?.store?.supportPhone || "",
      address: d?.store?.address || "",
      currency: d?.store?.currency || "BDT",
      timezone: d?.store?.timezone || "Asia/Dhaka",
    },
    branding: {
      logoUrl: d?.branding?.logoUrl || "",
      faviconUrl: d?.branding?.faviconUrl || "",
      primaryColor: d?.branding?.primaryColor || "#000000",
      enableDarkMode: Boolean(d?.branding?.enableDarkMode),
    },
    commerce: {
      allowGuestCheckout: Boolean(d?.commerce?.allowGuestCheckout),
      allowBackorders: Boolean(d?.commerce?.allowBackorders),
      lowStockThreshold: Number.isFinite(Number(d?.commerce?.lowStockThreshold))
        ? Number(d?.commerce?.lowStockThreshold)
        : 5,
    },
    site: {
      maintenanceMode: Boolean(d?.site?.maintenanceMode),
      maintenanceMessage:
        sanitizeString(d?.site?.maintenanceMessage, 220) ||
        defaultAdminSettings().site.maintenanceMessage,
    },
  };
}

exports.getPublicSettings = async (req, res, next) => {
  try {
    const doc = await getOrCreate("admin_settings", defaultAdminSettings());
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({
      key: doc.key,
      data: pickPublicSettings(doc.data),
      updatedAt: doc.updatedAt,
      version: doc.version,
    });
  } catch (e) {
    next(e);
  }
};
