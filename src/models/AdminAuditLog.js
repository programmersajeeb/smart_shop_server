const mongoose = require("mongoose");

const AdminAuditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // e.g. "order.status.update", "product.create"
    action: { type: String, required: true, index: true, trim: true },

    // e.g. "order", "product"
    entity: { type: String, required: true, index: true, trim: true },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },

    // ✅ make meta flexible (controller adds extra keys)
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

/**
 * ✅ Normalizers (enterprise consistency)
 * - entity/action always lowercase + trimmed for consistent filtering
 */
AdminAuditLogSchema.pre("save", function (next) {
  if (this.action != null) this.action = String(this.action).trim();
  if (this.entity != null) this.entity = String(this.entity).trim().toLowerCase();
  next();
});

/**
 * ✅ Index strategy (fast dashboard queries)
 * Common filters:
 * - newest logs
 * - by actor
 * - by entity/entityId
 * - by action
 */
AdminAuditLogSchema.index({ createdAt: -1 });
AdminAuditLogSchema.index({ actor: 1, createdAt: -1 });
AdminAuditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model("AdminAuditLog", AdminAuditLogSchema);
