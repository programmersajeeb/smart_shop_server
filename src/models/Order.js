const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
    title: { type: String, required: true },
    image: { type: String, default: null },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    // ✅ UPDATED: user is optional to support guest checkout
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
      index: true,
    },

    items: { type: [OrderItemSchema], required: true },
    subtotal: { type: Number, required: true },
    shipping: { type: Number, required: true, default: 0 },
    discount: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true },

    status: {
      type: String,
      enum: ["pending", "paid", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },

    paymentProvider: { type: String, default: null },
    paymentRef: { type: String, default: null },

    shippingAddress: {
      name: { type: String, default: null },
      phone: { type: String, default: null },
      addressLine: { type: String, default: null },
      city: { type: String, default: null },
      country: { type: String, default: null },
      postalCode: { type: String, default: null },

      // ✅ NEW: so admin can see customer instructions + payment method
      note: { type: String, default: null },
      paymentMethod: { type: String, default: "cod" },
    },
  },
  { timestamps: true }
);

// ✅ Enterprise indexes (fast admin list + filters)
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Order", OrderSchema);
