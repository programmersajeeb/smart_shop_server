const NewsletterSubscriber = require("../models/NewsletterSubscriber");
const AdminAuditLog = require("../models/AdminAuditLog");
const ApiError = require("../utils/apiError");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const ALLOWED_STATUSES = new Set(["subscribed", "unsubscribed"]);
const ALLOWED_SOURCES = new Set([
  "home_newsletter",
  "footer_newsletter",
  "admin_manual",
  "unknown",
]);

function sanitizeString(value, maxLen = 200) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return "";
  return EMAIL_RE.test(email) ? email : "";
}

function normalizeStatus(value, fallback = "") {
  const status = String(value || "").trim().toLowerCase();
  if (!status) return fallback;
  return ALLOWED_STATUSES.has(status) ? status : fallback;
}

function normalizeSource(value, fallback = "unknown") {
  const source = String(value || "").trim().toLowerCase();
  if (!source) return fallback;
  return ALLOWED_SOURCES.has(source) ? source : fallback;
}

function clampInt(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.round(num);
  return Math.min(max, Math.max(min, rounded));
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pickIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || null;
}

function toObjectIdOrNull(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return /^[0-9a-fA-F]{24}$/.test(raw) ? raw : null;
}

function normalizeSubscriber(doc) {
  if (!doc) return null;

  return {
    _id: doc._id,
    email: doc.email || "",
    status: doc.status || "subscribed",
    source: doc.source || "unknown",
    lastSource: doc.lastSource || doc.source || "unknown",
    sources: Array.isArray(doc.sources) ? doc.sources : [],
    subscribedAt: doc.subscribedAt || null,
    unsubscribedAt: doc.unsubscribedAt || null,
    lastSubscribedAt: doc.lastSubscribedAt || null,
    notes: doc.notes || "",
    updatedBy: doc.updatedBy || null,
    meta: doc.meta || {},
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

async function logNewsletterAction(req, payload) {
  try {
    const actor = toObjectIdOrNull(req.user?.sub);
    if (!actor) return;

    const action = sanitizeString(payload?.action, 120);
    const entity = sanitizeString(payload?.entity, 60).toLowerCase();
    if (!action || !entity) return;

    const entityId = toObjectIdOrNull(payload?.entityId);

    await AdminAuditLog.create({
      actor,
      action,
      entity,
      entityId,
      before: payload?.before ?? null,
      after: payload?.after ?? null,
      meta: {
        ip: pickIp(req),
        userAgent: req.headers["user-agent"] || null,
        path: req.originalUrl || req.url || null,
        method: req.method || null,
        requestId: req.requestId || null,
        ...(payload?.meta && typeof payload.meta === "object" ? payload.meta : {}),
      },
    });
  } catch {
    // ignore audit log errors
  }
}

exports.subscribe = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const source = normalizeSource(req.body?.source, "unknown");

    if (!email) {
      throw new ApiError(400, "A valid email address is required.");
    }

    const ip = pickIp(req);
    const userAgent = sanitizeString(req.headers["user-agent"], 500) || null;
    const referrer =
      sanitizeString(req.headers.referer || req.headers.referrer, 500) || null;
    const locale = sanitizeString(req.headers["accept-language"], 120) || null;

    const existing = await NewsletterSubscriber.findOne({ email });

    if (!existing) {
      const created = await NewsletterSubscriber.create({
        email,
        status: "subscribed",
        source,
        lastSource: source,
        sources: [source],
        subscribedAt: new Date(),
        lastSubscribedAt: new Date(),
        unsubscribedAt: null,
        meta: {
          ip,
          userAgent,
          referrer,
          locale,
        },
      });

      return res.status(201).json({
        ok: true,
        message: "Subscription completed successfully.",
        data: normalizeSubscriber(created),
      });
    }

    const previous = normalizeSubscriber(existing.toObject());

    existing.status = "subscribed";
    existing.source = existing.source || source;
    existing.lastSource = source;
    existing.sources = Array.isArray(existing.sources)
      ? Array.from(new Set([...existing.sources, source]))
      : [source];
    existing.lastSubscribedAt = new Date();

    if (!existing.subscribedAt) {
      existing.subscribedAt = new Date();
    }

    existing.unsubscribedAt = null;
    existing.meta = {
      ...(existing.meta && typeof existing.meta === "object" ? existing.meta : {}),
      ip,
      userAgent,
      referrer,
      locale,
    };

    await existing.save();

    return res.json({
      ok: true,
      message: "This email is now subscribed to the newsletter.",
      data: normalizeSubscriber(existing),
      meta: {
        restored:
          previous?.status === "unsubscribed" || previous?.unsubscribedAt != null,
        alreadyExisted: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getAdminSummary = async (req, res, next) => {
  try {
    const [total, subscribed, unsubscribed, sourceBreakdown] = await Promise.all([
      NewsletterSubscriber.countDocuments({}),
      NewsletterSubscriber.countDocuments({ status: "subscribed" }),
      NewsletterSubscriber.countDocuments({ status: "unsubscribed" }),
      NewsletterSubscriber.aggregate([
        {
          $group: {
            _id: "$lastSource",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1, _id: 1 } },
      ]),
    ]);

    res.set("Cache-Control", "no-store");
    return res.json({
      ok: true,
      data: {
        total,
        subscribed,
        unsubscribed,
        bySource: sourceBreakdown.map((item) => ({
          source: item?._id || "unknown",
          count: Number(item?.count || 0),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getAdminList = async (req, res, next) => {
  try {
    const page = clampInt(req.query?.page, 1, 100000, 1);
    const limit = clampInt(req.query?.limit, 1, 100, 20);
    const skip = (page - 1) * limit;

    const status = normalizeStatus(req.query?.status, "");
    const source = normalizeSource(req.query?.source, "");
    const q = sanitizeString(req.query?.q, 120);

    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (source) {
      filter.lastSource = source;
    }

    if (q) {
      const safe = escapeRegex(q);
      filter.$or = [
        { email: { $regex: safe, $options: "i" } },
        { notes: { $regex: safe, $options: "i" } },
        { lastSource: { $regex: safe, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      NewsletterSubscriber.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      NewsletterSubscriber.countDocuments(filter),
    ]);

    res.set("Cache-Control", "no-store");
    return res.json({
      ok: true,
      data: items.map((item) => normalizeSubscriber(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNextPage: skip + items.length < total,
        hasPrevPage: page > 1,
      },
      filters: {
        q,
        status: status || "",
        source: source || "",
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.updateSubscriberStatus = async (req, res, next) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      throw new ApiError(400, "Invalid subscriber id.");
    }

    const status = normalizeStatus(req.body?.status);
    if (!status) {
      throw new ApiError(400, "A valid subscriber status is required.");
    }

    const notes = sanitizeString(req.body?.notes, 500);
    const source = normalizeSource(req.body?.source, "admin_manual");

    const doc = await NewsletterSubscriber.findById(id);
    if (!doc) {
      throw new ApiError(404, "Subscriber not found.");
    }

    const before = normalizeSubscriber(doc.toObject());

    doc.status = status;
    doc.lastSource = source;
    doc.updatedBy = req.user?.sub || null;

    if (notes) {
      doc.notes = notes;
    }

    if (status === "subscribed") {
      doc.unsubscribedAt = null;
      doc.lastSubscribedAt = new Date();
      if (!doc.subscribedAt) {
        doc.subscribedAt = new Date();
      }
    } else if (status === "unsubscribed") {
      doc.unsubscribedAt = new Date();
    }

    if (Array.isArray(doc.sources)) {
      doc.sources = Array.from(new Set([...doc.sources, source]));
    } else {
      doc.sources = [source];
    }

    await doc.save();

    await logNewsletterAction(req, {
      action: "newsletter.subscriber.status.update",
      entity: "newsletter_subscriber",
      entityId: doc._id,
      before,
      after: normalizeSubscriber(doc.toObject()),
      meta: {
        targetStatus: status,
        source,
      },
    });

    res.set("Cache-Control", "no-store");
    return res.json({
      ok: true,
      message: "Subscriber status updated successfully.",
      data: normalizeSubscriber(doc),
    });
  } catch (error) {
    next(error);
  }
};