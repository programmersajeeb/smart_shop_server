const mongoose = require("mongoose");

const NEWSLETTER_STATUSES = ["subscribed", "unsubscribed"];

const NEWSLETTER_SOURCES = [
  "home_newsletter",
  "footer_newsletter",
  "admin_manual",
  "unknown",
];

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

function normalizeSource(value) {
  const source = String(value || "").trim().toLowerCase();
  if (!source) return "unknown";
  return NEWSLETTER_SOURCES.includes(source) ? source : "unknown";
}

function normalizeSourceList(list) {
  const input = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();

  for (const raw of input) {
    const source = normalizeSource(raw);
    if (!source || seen.has(source)) continue;
    seen.add(source);
    out.push(source);
  }

  return out;
}

const NewsletterSubscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },

    status: {
      type: String,
      enum: NEWSLETTER_STATUSES,
      default: "subscribed",
      index: true,
      trim: true,
    },

    source: {
      type: String,
      enum: NEWSLETTER_SOURCES,
      default: "unknown",
      index: true,
      trim: true,
    },

    lastSource: {
      type: String,
      enum: NEWSLETTER_SOURCES,
      default: "unknown",
      index: true,
      trim: true,
    },

    sources: {
      type: [String],
      default: [],
      index: true,
    },

    subscribedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    unsubscribedAt: {
      type: Date,
      default: null,
      index: true,
    },

    lastSubscribedAt: {
      type: Date,
      default: Date.now,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    meta: {
      ip: { type: String, default: null, trim: true },
      userAgent: { type: String, default: null, trim: true },
      referrer: { type: String, default: null, trim: true },
      locale: { type: String, default: null, trim: true },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

NewsletterSubscriberSchema.pre("save", function () {
  this.email = normalizeEmail(this.email);

  this.source = normalizeSource(this.source);
  this.lastSource = normalizeSource(this.lastSource || this.source);

  if (!Array.isArray(this.sources)) {
    this.sources = [];
  }

  const normalizedSources = normalizeSourceList([
    ...this.sources,
    this.source,
    this.lastSource,
  ]);

  this.sources = normalizedSources;

  if (typeof this.notes === "string") {
    this.notes = this.notes.trim();
  } else {
    this.notes = "";
  }

  if (this.status === "subscribed") {
    this.unsubscribedAt = null;

    if (!this.subscribedAt) {
      this.subscribedAt = new Date();
    }

    if (!this.lastSubscribedAt) {
      this.lastSubscribedAt = this.subscribedAt || new Date();
    }
  }

  if (this.status === "unsubscribed") {
    if (!this.unsubscribedAt) {
      this.unsubscribedAt = new Date();
    }
  }

  if (this.updatedBy != null && !mongoose.Types.ObjectId.isValid(this.updatedBy)) {
    this.updatedBy = null;
  }

  if (!this.meta || typeof this.meta !== "object") {
    this.meta = {};
  }

  this.meta.ip = this.meta.ip ? String(this.meta.ip).trim() : null;
  this.meta.userAgent = this.meta.userAgent
    ? String(this.meta.userAgent).trim()
    : null;
  this.meta.referrer = this.meta.referrer
    ? String(this.meta.referrer).trim()
    : null;
  this.meta.locale = this.meta.locale ? String(this.meta.locale).trim() : null;
});

NewsletterSubscriberSchema.index({ status: 1, createdAt: -1 });
NewsletterSubscriberSchema.index({ source: 1, createdAt: -1 });
NewsletterSubscriberSchema.index({ lastSource: 1, createdAt: -1 });
NewsletterSubscriberSchema.index({ subscribedAt: -1 });
NewsletterSubscriberSchema.index({ unsubscribedAt: -1 });
NewsletterSubscriberSchema.index({ createdAt: -1 });
NewsletterSubscriberSchema.index({ updatedAt: -1 });

module.exports = mongoose.model(
  "NewsletterSubscriber",
  NewsletterSubscriberSchema
);