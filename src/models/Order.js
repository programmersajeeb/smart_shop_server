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

const AppliedPromotionSchema = new mongoose.Schema(
  {
    promotionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Promotion",
      default: null,
    },
    code: { type: String, default: null, trim: true },
    name: { type: String, default: null, trim: true },
    type: {
      type: String,
      enum: ["flash_sale", "coupon", "automatic"],
      default: null,
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed", "free_shipping"],
      default: null,
    },
    value: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
      index: true,
    },

    items: { type: [OrderItemSchema], required: true },

    subtotal: { type: Number, required: true, min: 0 },
    shipping: { type: Number, required: true, default: 0, min: 0 },
    discount: { type: Number, required: true, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },

    appliedPromotion: {
      type: AppliedPromotionSchema,
      default: null,
    },

    status: {
      type: String,
      enum: ["pending", "paid", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },

    paymentProvider: { type: String, default: null },
    paymentRef: { type: String, default: null },

    shippingAddress: {
      name: { type: String, default: null, trim: true },
      phone: { type: String, default: null, trim: true },
      addressLine: { type: String, default: null, trim: true },
      city: { type: String, default: null, trim: true },
      country: { type: String, default: null, trim: true },
      postalCode: { type: String, default: null, trim: true },
      note: { type: String, default: null, trim: true },
      paymentMethod: { type: String, default: "cod", trim: true },
    },
  },
  { timestamps: true, versionKey: false }
);

OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ user: 1, createdAt: -1 });
OrderSchema.index({ "appliedPromotion.code": 1, createdAt: -1 });

module.exports = mongoose.model("Order", OrderSchema);