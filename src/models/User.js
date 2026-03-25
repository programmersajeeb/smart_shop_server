const mongoose = require("mongoose");

const USER_ROLES = [
  "superadmin",
  "admin",
  "manager",
  "support",
  "editor",
  "auditor",
  "user",
];

function normalizePermissions(list) {
  const arr = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();

  for (const raw of arr) {
    const p = String(raw || "").trim();
    if (!p) continue;
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }

  return out.sort((a, b) => a.localeCompare(b));
}

function getDefaultRoleLevel(role) {
  const r = String(role || "").trim().toLowerCase();

  if (r === "superadmin") return 100;
  if (r === "admin") return 50;
  if (r === "manager") return 40;
  if (r === "support") return 30;
  if (r === "editor") return 20;
  if (r === "auditor") return 10;
  return 0;
}

const UserSchema = new mongoose.Schema(
  {
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    email: {
      type: String,
      default: null,
      index: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      default: null,
      index: true,
      trim: true,
    },

    displayName: {
      type: String,
      default: null,
      trim: true,
    },

    photoURL: {
      type: String,
      default: null,
      trim: true,
    },

    role: {
      type: String,
      enum: USER_ROLES,
      default: "user",
      index: true,
      trim: true,
    },

    permissions: {
      type: [String],
      default: [],
      index: true,
    },

    roleLevel: {
      type: Number,
      default: 0,
      index: true,
      min: 0,
      max: 100,
    },

    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    rbacUpdatedAt: {
      type: Date,
      default: null,
    },

    rbacUpdatedBy: {
      type: String,
      default: null,
      trim: true,
    },

    blockedAt: {
      type: Date,
      default: null,
    },

    blockedBy: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

UserSchema.pre("save", function () {
  if (typeof this.firebaseUid === "string") {
    this.firebaseUid = this.firebaseUid.trim();
  }

  if (typeof this.email === "string") {
    this.email = this.email.trim().toLowerCase() || null;
  }

  if (typeof this.phone === "string") {
    this.phone = this.phone.trim() || null;
  }

  if (typeof this.displayName === "string") {
    this.displayName = this.displayName.trim() || null;
  }

  if (typeof this.photoURL === "string") {
    this.photoURL = this.photoURL.trim() || null;
  }

  if (typeof this.role === "string") {
    this.role = this.role.trim().toLowerCase();
  }

  if (!USER_ROLES.includes(this.role)) {
    this.role = "user";
  }

  if (
    this.roleLevel == null ||
    !Number.isFinite(Number(this.roleLevel)) ||
    Number(this.roleLevel) < 0
  ) {
    this.roleLevel = getDefaultRoleLevel(this.role);
  } else {
    this.roleLevel = Math.max(0, Math.min(100, Number(this.roleLevel)));
  }

  if (Array.isArray(this.permissions)) {
    this.permissions = normalizePermissions(this.permissions);
  } else {
    this.permissions = [];
  }

  if (typeof this.rbacUpdatedBy === "string") {
    this.rbacUpdatedBy = this.rbacUpdatedBy.trim() || null;
  }

  if (typeof this.blockedBy === "string") {
    this.blockedBy = this.blockedBy.trim() || null;
  }

  if (!this.isBlocked) {
    this.blockedAt = null;
    this.blockedBy = null;
  }
});

module.exports = mongoose.model("User", UserSchema);