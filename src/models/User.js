const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    firebaseUid: { type: String, required: true, unique: true, index: true },
    email: { type: String, default: null, index: true },
    phone: { type: String, default: null, index: true },
    displayName: { type: String, default: null },
    photoURL: { type: String, default: null },

    role: { type: String, enum: ["user", "admin"], default: "user", index: true },

    /**
     * ✅ Enterprise RBAC
     */
    permissions: { type: [String], default: [], index: true },
    roleLevel: { type: Number, default: 0, index: true },

    isBlocked: { type: Boolean, default: false, index: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/**
 * ✅ Mongoose v9 compatible middleware
 * - এখানে আর "next()" ব্যবহার করবো না
 * - sync middleware: return/throw-based
 */
UserSchema.pre("save", function () {
  // roleLevel auto-sync based on role (only when missing OR role changed)
  if (this.roleLevel == null || this.isModified("role")) {
    this.roleLevel = this.role === "admin" ? 100 : 0;
  }

  // normalize permissions
  if (Array.isArray(this.permissions)) {
    this.permissions = Array.from(
      new Set(
        this.permissions
          .map((p) => String(p || "").trim())
          .filter(Boolean)
      )
    ).sort();
  }
});

module.exports = mongoose.model("User", UserSchema);
