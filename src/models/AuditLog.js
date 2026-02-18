const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    entity: { type: String, required: true, index: true },
    entityId: { type: String, default: null, index: true },

    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    actorSnapshot: {
      id: { type: String, default: null },
      email: { type: String, default: null },
      phone: { type: String, default: null },
      displayName: { type: String, default: null },
      role: { type: String, default: null },
      roleLevel: { type: Number, default: 0 },
    },

    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },

    meta: {
      ip: { type: String, default: null },
      userAgent: { type: String, default: null },
      method: { type: String, default: null },
      path: { type: String, default: null },
    },

    note: { type: String, default: null },
  },
  { timestamps: true }
);

AuditLogSchema.index({
  action: "text",
  entity: "text",
  entityId: "text",
  note: "text",
  "actorSnapshot.email": "text",
  "actorSnapshot.phone": "text",
  "actorSnapshot.displayName": "text",
});

module.exports = mongoose.model("AuditLog", AuditLogSchema);
