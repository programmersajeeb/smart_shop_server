const mongoose = require("mongoose");

const SUPPORT_STATUSES = ["open", "in_progress", "resolved", "spam", "archived"];
const SUPPORT_PRIORITIES = ["low", "medium", "high", "urgent"];
const SUPPORT_TYPES = [
  "general",
  "order_support",
  "delivery",
  "return_refund",
  "payment",
  "business",
  "press",
];
const SUPPORT_SOURCES = ["contact_page", "admin_manual", "email_import"];

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const SupportTicketSchema = new mongoose.Schema(
  {
    ticketNo: {
      type: String,
      trim: true,
      unique: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 180,
      index: true,
    },

    phone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "",
    },

    inquiryType: {
      type: String,
      enum: SUPPORT_TYPES,
      default: "general",
      index: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 220,
      index: true,
    },

    orderReference: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
      index: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },

    source: {
      type: String,
      enum: SUPPORT_SOURCES,
      default: "contact_page",
      index: true,
    },

    status: {
      type: String,
      enum: SUPPORT_STATUSES,
      default: "open",
      index: true,
    },

    priority: {
      type: String,
      enum: SUPPORT_PRIORITIES,
      default: "medium",
      index: true,
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    assignedAt: {
      type: Date,
      default: null,
    },

    adminNotes: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },

    resolutionSummary: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },

    firstResponseAt: {
      type: Date,
      default: null,
    },

    resolvedAt: {
      type: Date,
      default: null,
      index: true,
    },

    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    meta: {
      ip: { type: String, default: "" },
      userAgent: { type: String, default: "" },
      referer: { type: String, default: "" },
    },
  },
  {
    timestamps: true,
  }
);

SupportTicketSchema.index({
  subject: "text",
  message: "text",
  name: "text",
  email: "text",
  orderReference: "text",
  ticketNo: "text",
});

SupportTicketSchema.pre("validate", function () {
  this.name = normalizeText(this.name);
  this.email = normalizeText(this.email).toLowerCase();
  this.phone = normalizeText(this.phone);
  this.subject = normalizeText(this.subject);
  this.orderReference = normalizeText(this.orderReference);
  this.message = normalizeText(this.message);
  this.adminNotes = normalizeText(this.adminNotes);
  this.resolutionSummary = normalizeText(this.resolutionSummary);

  if (!this.lastActivityAt) {
    this.lastActivityAt = new Date();
  }
});

SupportTicketSchema.pre("save", async function () {
  if (!this.isNew || this.ticketNo) return;

  const model = this.constructor;
  const count = await model.countDocuments();
  const seq = String(count + 1).padStart(4, "0");
  this.ticketNo = `SUP-${seq}`;
});

module.exports = mongoose.model("SupportTicket", SupportTicketSchema);
module.exports.SUPPORT_STATUSES = SUPPORT_STATUSES;
module.exports.SUPPORT_PRIORITIES = SUPPORT_PRIORITIES;
module.exports.SUPPORT_TYPES = SUPPORT_TYPES;
module.exports.SUPPORT_SOURCES = SUPPORT_SOURCES;