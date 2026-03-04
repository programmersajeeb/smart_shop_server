const mongoose = require('mongoose');

const CartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    qty: { type: Number, required: true, min: 1 },

    // Snapshot fields so cart doesn't break if product changes
    priceSnapshot: { type: Number, required: true  },
    titleSnapshot: { type: String, required: true },
    imageSnapshot: { type: String, default: null },
  },
  { _id: true }
);

const CartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    items: [CartItemSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cart', CartSchema);
