const ApiError = require("../utils/apiError");
const SupportTicket = require("../models/SupportTicket");

const ORDER_RELATED_TYPES = new Set([
  "order_support",
  "delivery",
  "return_refund",
  "payment",
]);

const VALID_STATUSES = new Set(["open", "in_progress", "resolved", "spam", "archived"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const VALID_TYPES = new Set([
  "general",
  "order_support",
  "delivery",
  "return_refund",
  "payment",
  "business",
  "press",
]);

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(value) {
  const raw = String(value || "").replace(/[^\d+]/g, "").trim();
  if (!raw) return true;
  return raw.length >= 7 && raw.length <= 16;
}

function pickPriorityFromType(type) {
  if (type === "return_refund" || type === "payment") return "high";
  if (type === "business" || type === "press") return "medium";
  return "medium";
}

function buildPagination(page, limit, total) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);

  return {
    page: safePage,
    limit,
    total,
    totalPages,
    hasPrevPage: safePage > 1,
    hasNextPage: safePage < totalPages,
  };
}

function toPublicTicket(doc) {
  return {
    _id: doc?._id,
    ticketNo: doc?.ticketNo || "",
    status: doc?.status || "open",
    createdAt: doc?.createdAt || null,
  };
}

function toAdminTicket(doc) {
  return {
    _id: doc?._id,
    ticketNo: doc?.ticketNo || "",
    name: doc?.name || "",
    email: doc?.email || "",
    phone: doc?.phone || "",
    inquiryType: doc?.inquiryType || "general",
    subject: doc?.subject || "",
    orderReference: doc?.orderReference || "",
    message: doc?.message || "",
    source: doc?.source || "contact_page",
    status: doc?.status || "open",
    priority: doc?.priority || "medium",
    assignedTo: doc?.assignedTo || null,
    assignedAt: doc?.assignedAt || null,
    adminNotes: doc?.adminNotes || "",
    resolutionSummary: doc?.resolutionSummary || "",
    firstResponseAt: doc?.firstResponseAt || null,
    resolvedAt: doc?.resolvedAt || null,
    lastActivityAt: doc?.lastActivityAt || null,
    createdAt: doc?.createdAt || null,
    updatedAt: doc?.updatedAt || null,
  };
}

exports.createPublicTicket = async function createPublicTicket(req, res, next) {
  try {
    const name = normalizeText(req.body?.name);
    const email = normalizeEmail(req.body?.email);
    const phone = normalizeText(req.body?.phone);
    const inquiryType = normalizeText(req.body?.inquiryType || "general").toLowerCase();
    const subject = normalizeText(req.body?.subject);
    const orderReference = normalizeText(req.body?.orderReference);
    const message = normalizeText(req.body?.message);

    if (!name || name.length < 2) {
      throw new ApiError(400, "Please provide a valid name.");
    }

    if (!email || !isValidEmail(email)) {
      throw new ApiError(400, "Please provide a valid email address.");
    }

    if (!isValidPhone(phone)) {
      throw new ApiError(400, "Please provide a valid phone number.");
    }

    if (!VALID_TYPES.has(inquiryType)) {
      throw new ApiError(400, "Invalid inquiry type.");
    }

    if (!subject || subject.length < 4) {
      throw new ApiError(400, "Please provide a clear subject.");
    }

    if (!message || message.length < 20) {
      throw new ApiError(400, "Please provide a more detailed message.");
    }

    if (ORDER_RELATED_TYPES.has(inquiryType) && !orderReference) {
      throw new ApiError(400, "Order reference is required for this request type.");
    }

    const doc = await SupportTicket.create({
      name,
      email,
      phone,
      inquiryType,
      subject,
      orderReference,
      message,
      source: "contact_page",
      status: "open",
      priority: pickPriorityFromType(inquiryType),
      meta: {
        ip: normalizeText(req.ip),
        userAgent: normalizeText(req.headers["user-agent"]),
        referer: normalizeText(req.headers.referer),
      },
      lastActivityAt: new Date(),
    });

    return res.status(201).json({
      ok: true,
      message: "Your message has been received.",
      data: toPublicTicket(doc),
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminSupportSummary = async function getAdminSupportSummary(req, res, next) {
  try {
    const [total, open, inProgress, resolved, urgent, byType] = await Promise.all([
      SupportTicket.countDocuments(),
      SupportTicket.countDocuments({ status: "open" }),
      SupportTicket.countDocuments({ status: "in_progress" }),
      SupportTicket.countDocuments({ status: "resolved" }),
      SupportTicket.countDocuments({ priority: "urgent" }),
      SupportTicket.aggregate([
        {
          $group: {
            _id: "$inquiryType",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1, _id: 1 } },
      ]),
    ]);

    return res.json({
      ok: true,
      data: {
        total,
        open,
        inProgress,
        resolved,
        urgent,
        byType: byType.map((item) => ({
          inquiryType: item?._id || "general",
          count: Number(item?.count || 0),
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminSupportList = async function getAdminSupportList(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 20));
    const q = normalizeText(req.query?.q);
    const status = normalizeText(req.query?.status).toLowerCase();
    const priority = normalizeText(req.query?.priority).toLowerCase();
    const inquiryType = normalizeText(req.query?.inquiryType).toLowerCase();
    const source = normalizeText(req.query?.source).toLowerCase();

    const filter = {};

    if (q) {
      filter.$or = [
        { ticketNo: { $regex: q, $options: "i" } },
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { subject: { $regex: q, $options: "i" } },
        { message: { $regex: q, $options: "i" } },
        { orderReference: { $regex: q, $options: "i" } },
      ];
    }

    if (VALID_STATUSES.has(status)) {
      filter.status = status;
    }

    if (VALID_PRIORITIES.has(priority)) {
      filter.priority = priority;
    }

    if (VALID_TYPES.has(inquiryType)) {
      filter.inquiryType = inquiryType;
    }

    if (source) {
      filter.source = source;
    }

    const [total, rows] = await Promise.all([
      SupportTicket.countDocuments(filter),
      SupportTicket.find(filter)
        .sort({ lastActivityAt: -1, createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return res.json({
      ok: true,
      data: rows.map(toAdminTicket),
      pagination: buildPagination(page, limit, total),
    });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminSupportOne = async function getAdminSupportOne(req, res, next) {
  try {
    const id = normalizeText(req.params?.id);

    if (!id) {
      throw new ApiError(400, "Ticket id is required.");
    }

    const doc = await SupportTicket.findById(id).lean();

    if (!doc) {
      throw new ApiError(404, "Support ticket not found.");
    }

    return res.json({
      ok: true,
      data: toAdminTicket(doc),
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateAdminSupportTicket = async function updateAdminSupportTicket(req, res, next) {
  try {
    const id = normalizeText(req.params?.id);
    if (!id) {
      throw new ApiError(400, "Ticket id is required.");
    }

    const updates = {};
    const status = normalizeText(req.body?.status).toLowerCase();
    const priority = normalizeText(req.body?.priority).toLowerCase();
    const adminNotes = normalizeText(req.body?.adminNotes);
    const resolutionSummary = normalizeText(req.body?.resolutionSummary);
    const assignedTo = normalizeText(req.body?.assignedTo);

    if (status) {
      if (!VALID_STATUSES.has(status)) {
        throw new ApiError(400, "Invalid support status.");
      }
      updates.status = status;
    }

    if (priority) {
      if (!VALID_PRIORITIES.has(priority)) {
        throw new ApiError(400, "Invalid support priority.");
      }
      updates.priority = priority;
    }

    if (req.body?.adminNotes !== undefined) {
      updates.adminNotes = adminNotes;
    }

    if (req.body?.resolutionSummary !== undefined) {
      updates.resolutionSummary = resolutionSummary;
    }

    if (req.body?.assignedTo !== undefined) {
      updates.assignedTo = assignedTo || null;
      updates.assignedAt = assignedTo ? new Date() : null;
    }

    if (updates.status === "in_progress") {
      updates.firstResponseAt = new Date();
    }

    if (updates.status === "resolved") {
      updates.resolvedAt = new Date();
      if (!updates.firstResponseAt) {
        updates.firstResponseAt = new Date();
      }
    }

    if (updates.status && updates.status !== "resolved") {
      updates.resolvedAt = null;
    }

    updates.lastActivityAt = new Date();

    const doc = await SupportTicket.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).lean();

    if (!doc) {
      throw new ApiError(404, "Support ticket not found.");
    }

    return res.json({
      ok: true,
      message: "Support ticket updated successfully.",
      data: toAdminTicket(doc),
    });
  } catch (error) {
    return next(error);
  }
};