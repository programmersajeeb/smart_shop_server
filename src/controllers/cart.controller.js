const ApiError = require('../utils/apiError');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

function pickImageUrl(product) {
  if (!product) return null;

  const first = Array.isArray(product.images) ? product.images[0] : null;

  if (!first) return null;
  if (typeof first === 'string') return first.trim() || null;
  if (typeof first === 'object') {
    const url = String(first.url || '').trim();
    return url || null;
  }

  return null;
}

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = await Cart.create({ user: userId, items: [] });
  return cart;
}

exports.getCart = async (req, res, next) => {
  try {
    const cart = await getOrCreateCart(req.user.sub);
    res.json(cart);
  } catch (e) {
    next(e);
  }
};

exports.addItem = async (req, res, next) => {
  try {
    const { productId, qty } = req.body || {};
    const nQty = Number(qty || 1);

    if (!productId) throw new ApiError(400, 'productId required');
    if (!Number.isFinite(nQty) || nQty < 1) {
      throw new ApiError(400, 'qty must be >= 1');
    }

    const product = await Product.findById(productId);
    if (!product || product.isActive === false) {
      throw new ApiError(404, 'Product not found');
    }
    if (product.stock < nQty) {
      throw new ApiError(400, 'Insufficient stock');
    }

    const cart = await getOrCreateCart(req.user.sub);
    const idx = cart.items.findIndex(
      (it) => String(it.product) === String(product._id)
    );

    const snapshot = {
      product: product._id,
      qty: nQty,
      priceSnapshot: product.price,
      titleSnapshot: product.title,
      imageSnapshot: pickImageUrl(product),
    };

    if (idx >= 0) {
      const newQty = cart.items[idx].qty + nQty;
      if (product.stock < newQty) {
        throw new ApiError(400, 'Insufficient stock');
      }

      cart.items[idx].qty = newQty;
      cart.items[idx].priceSnapshot = snapshot.priceSnapshot;
      cart.items[idx].titleSnapshot = snapshot.titleSnapshot;
      cart.items[idx].imageSnapshot = snapshot.imageSnapshot;
    } else {
      cart.items.push(snapshot);
    }

    await cart.save();
    res.status(201).json(cart);
  } catch (e) {
    next(e);
  }
};

exports.updateItemQty = async (req, res, next) => {
  try {
    const { qty } = req.body || {};
    const nQty = Number(qty);

    if (!Number.isFinite(nQty) || nQty < 1) {
      throw new ApiError(400, 'qty must be >= 1');
    }

    const cart = await getOrCreateCart(req.user.sub);
    const item = cart.items.id(req.params.itemId);
    if (!item) throw new ApiError(404, 'Cart item not found');

    const product = await Product.findById(item.product);
    if (!product || product.isActive === false) {
      throw new ApiError(404, 'Product not found');
    }
    if (product.stock < nQty) {
      throw new ApiError(400, 'Insufficient stock');
    }

    item.qty = nQty;
    item.priceSnapshot = product.price;
    item.titleSnapshot = product.title;
    item.imageSnapshot = pickImageUrl(product);

    await cart.save();
    res.json(cart);
  } catch (e) {
    next(e);
  }
};

exports.removeItem = async (req, res, next) => {
  try {
    const cart = await getOrCreateCart(req.user.sub);
    const item = cart.items.id(req.params.itemId);
    if (!item) throw new ApiError(404, 'Cart item not found');

    item.deleteOne();
    await cart.save();
    res.json(cart);
  } catch (e) {
    next(e);
  }
};

exports.clearCart = async (req, res, next) => {
  try {
    const cart = await getOrCreateCart(req.user.sub);
    cart.items = [];
    await cart.save();
    res.json(cart);
  } catch (e) {
    next(e);
  }
};