const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { auth, adminOnly } = require("./signin.js");
const { sanitizeObjectStrings, sanitizeString, sanitizeId, isValidObjectId, pageParams, setPageHeaders } = require("./lib/security");
const UserCart = require("./models/UserCart");
const Product = require("./models/Product");

const router = express.Router();
const cartLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { message: "محاولات كثيرة جداً، حاول لاحقاً." } });

// =========== دالة إضافة منتج إلى السلة ===========
router.post("/add", cartLimiter, auth, async (req, res) => {
  try {
    const payload = sanitizeObjectStrings(req.body || {});
    const productId = sanitizeId(payload.productId);
    const qty = Number(payload.qty);
    if (!productId || !Number.isInteger(qty) || qty < 1 || qty > 999) {
      return res.status(400).json({ message: "بيانات المنتج أو الكمية غير صحيحة." });
    }

    const user = await mongoose.model("User").findById(req.userId).select("fullName email").exec();
    if (!user) return res.status(401).json({ message: "المستخدم غير موجود." });

    const product = await Product.findById(productId).lean();
    if (!product) return res.status(404).json({ message: "المنتج غير موجود." });
    if (qty > Number(product.stock || 0)) return res.status(400).json({ message: `لا يوجد مخزون كافٍ للمنتج ${product.name}.` });

    let cart = await UserCart.findOne({ userId: user._id });
    if (!cart) {
      cart = new UserCart({
        userId: user._id,
        fullName: user.fullName,
        email: user.email,
        cart: [{
          productId,
          name: product.name,
          price: product.price,
          qty,
          images: product.images,
          stock: product.stock
        }]
      });
    } else {
      const idx = cart.cart.findIndex((i) => i.productId.toString() === productId);
      if (idx >= 0) {
        const newQty = cart.cart[idx].qty + qty;
        if (newQty > 999) return res.status(400).json({ message: "تم تجاوز الحد الأقصى للكمية." });
        if (newQty > Number(product.stock || 0)) return res.status(400).json({ message: `لا يوجد مخزون كافٍ للمنتج ${product.name}.` });
        cart.cart[idx].qty = newQty;
        cart.cart[idx].addedAt = new Date();
      } else {
        cart.cart.push({
          productId,
          name: product.name,
          price: product.price,
          qty,
          images: product.images,
          stock: product.stock
        });
      }
    }
    cart.updatedAt = new Date();
    await cart.save();

    return res.status(200).json({ success: true, cart });
  } catch (err) {
    console.error("ADD_TO_CART_ERROR:", err);
    return res.status(500).json({ message: "خطأ أثناء إضافة المنتج للسلة." });
  }
});

router.get("/me", auth, async (req, res) => {
  try {
    const cart = await UserCart.findOne({ userId: req.userId }).lean();
    if (!cart) return res.status(200).json({ items: [] });
    return res.status(200).json({ items: cart.cart || [] });
  } catch (err) {
    console.error("GET_MY_CART_ERROR:", err);
    return res.status(500).json({ message: "خطأ أثناء جلب السلة." });
  }
});

router.get("/", auth, adminOnly, async (req, res) => {
  try {
    const { limit, page, skip } = pageParams(req.query);
    const [allCarts, total] = await Promise.all([
      UserCart.find({}).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      UserCart.countDocuments({})
    ]);
    setPageHeaders(res, total, page, limit);
    res.status(200).json(allCarts);
  } catch (err) {
    console.error("GET_CARTS_ERROR:", err.message);
    return res.status(500).json({ message: "خطأ أثناء جلب السلات." });
  }
});

router.get("/user", auth, async (req, res) => {
  try {
    const cart = await UserCart.findOne({ userId: req.userId }).lean();
    if (!cart) return res.status(200).json({ cart: [] });
    return res.status(200).json(cart);
  } catch (err) {
    console.error("GET_CART_FOR_USER_ERROR:", err);
    return res.status(500).json({ message: "خطأ أثناء جلب السلة للمستخدم." });
  }
});

// =========== دالة حذف منتج من السلة ===========
router.post("/remove", auth, async (req, res) => {
  try {
    const payload = sanitizeObjectStrings(req.body || {});
    const productId = sanitizeId(payload.productId);
    if (!productId) return res.status(400).json({ message: "معرف المنتج مطلوب." });

    let cart = await UserCart.findOne({ userId: req.userId });
    if (!cart) return res.status(404).json({ message: "سلة المستخدم غير موجودة." });

    cart.cart = cart.cart.filter(i => String(i.productId) !== String(productId));
    cart.updatedAt = new Date();
    await cart.save();

    return res.status(200).json({ success: true, cart });
  } catch (err) {
    console.error("REMOVE_FROM_CART_ERROR:", err);
    return res.status(500).json({ message: "خطأ أثناء حذف المنتج من السلة." });
  }
});

// =========== دالة تفريغ السلة ===========
router.post("/clear", auth, async (req, res) => {
  try {
    let cart = await UserCart.findOne({ userId: req.userId });
    if (!cart) return res.status(404).json({ message: "سلة المستخدم غير موجودة." });

    cart.cart = [];
    cart.updatedAt = new Date();
    await cart.save();

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("CLEAR_CART_ERROR:", err);
    return res.status(500).json({ message: "خطأ أثناء تفريغ السلة." });
  }
});

module.exports = router;