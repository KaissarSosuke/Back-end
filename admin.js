const express = require("express");
const mongoose = require("mongoose");
const { auth, adminOnly } = require("./signin.js");
const { pageParams, setPageHeaders, sanitizeString, sanitizeObjectStrings, sanitizeId } = require("./lib/security");

const router = express.Router();
let clearProductCache = () => {};
try {
  const productsRouter = require("./products");
  if (typeof productsRouter.clearCache === "function") clearProductCache = productsRouter.clearCache;
} catch (_) { /* cache invalidation best-effort */ }

function allowedAdminProductFields(body) {
  const payload = sanitizeObjectStrings(body || {}, 2000);
  const allowed = ["name", "desc", "price", "images", "tags", "category", "sold", "stock", "rating", "reviews"];
  const update = {};
  for (const key of allowed) {
    if (payload[key] !== undefined) update[key] = payload[key];
  }
  return update;
}

router.get("/admin/me", auth, adminOnly, (req, res) => {
  res.json({ isAdmin: true, email: req.userEmail });
});

// ============ المستخدمين ============
router.get("/admin/users", auth, adminOnly, async (req, res) => {
  try {
    const { limit, page, skip } = pageParams(req.query);
    const User = mongoose.model("User");
    const [users, total] = await Promise.all([
      User.find({}, "fullName email createdAt ip").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments({})
    ]);
    setPageHeaders(res, total, page, limit);
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "خطأ أثناء جلب المستخدمين" });
  }
});

router.delete("/admin/users/:id", auth, adminOnly, async (req, res) => {
  try {
    const User = mongoose.model("User");
    const id = sanitizeId(req.params.id);
    if (!id) return res.status(400).json({ message: "معرف المستخدم غير صالح" });
    if (id === String(req.userId)) return res.status(400).json({ message: "لا يمكنك حذف حسابك الخاص" });
    const target = await User.findById(id).select("role").lean();
    if (!target) return res.status(404).json({ message: "المستخدم غير موجود" });
    if (target.role === "admin") return res.status(403).json({ message: "لا يمكن حذف حساب أدمن آخر" });
    const result = await User.deleteOne({ _id: id });
    if (!result.deletedCount) return res.status(404).json({ message: "المستخدم غير موجود" });
    res.json({ success: true });
  } catch (err) {
    if (err && err.name === "CastError") return res.status(400).json({ message: "معرف المستخدم غير صالح" });
    res.status(500).json({ message: "خطأ أثناء حذف المستخدم" });
  }
});

// ============ المنتجات ============

// جلب كل المنتجات
router.get("/admin/products", auth, adminOnly, async (req, res) => {
  try {
    const { limit, page, skip } = pageParams(req.query);
    const Product = mongoose.model("Product");
    const [products, total] = await Promise.all([
      Product.find({}).sort({ added: -1 }).skip(skip).limit(limit).lean(),
      Product.countDocuments({})
    ]);
    setPageHeaders(res, total, page, limit);
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "خطأ أثناء جلب المنتجات" });
  }
});

// إضافة منتج جديد
router.post("/admin/products", auth, adminOnly, async (req, res) => {
  try {
    const Product = mongoose.model("Product");
    const payload = sanitizeObjectStrings(req.body || {}, 2000);
    let { name, desc, price, images, tags, category, sold, stock, rating, reviews } = payload;

    if (!name || !desc || price === undefined || !category || stock === undefined) {
      return res.status(400).json({ message: "يرجى تعبئة جميع الحقول المطلوبة" });
    }

    if (typeof images === "string") images = images.split(",").map((i) => sanitizeString(i, 300)).filter(Boolean);
    if (typeof tags === "string") tags = tags.split(",").map((t) => sanitizeString(t, 120)).filter(Boolean);
    const priceNum = Number(price);
    const stockNum = Number(stock);
    const soldNum = sold === undefined || sold === "" ? 0 : Number(sold);
    const ratingNum = rating === undefined || rating === "" ? 0 : Number(rating);
    const reviewsNum = reviews === undefined || reviews === "" ? 0 : Number(reviews);
    if (!Number.isFinite(priceNum) || priceNum < 0) return res.status(400).json({ message: "السعر غير صالح" });
    if (!Number.isInteger(stockNum) || stockNum < 0) return res.status(400).json({ message: "المخزون غير صالح" });
    if (!Number.isInteger(soldNum) || soldNum < 0) return res.status(400).json({ message: "قيمة المبيعات غير صالحة" });
    if (!Number.isFinite(ratingNum) || ratingNum < 0 || ratingNum > 5) return res.status(400).json({ message: "التقييم يجب أن يكون بين 0 و 5" });
    if (!Number.isInteger(reviewsNum) || reviewsNum < 0) return res.status(400).json({ message: "عدد المراجعات غير صالح" });

    const added = Date.now();
    const product = new Product({
      name: sanitizeString(name, 200),
      desc: sanitizeString(desc, 5000),
      price: priceNum,
      images: Array.isArray(images) ? images.map((i) => sanitizeString(i, 300)).filter(Boolean) : [],
      tags: Array.isArray(tags) ? tags.map((t) => sanitizeString(t, 120)).filter(Boolean) : [],
      category: sanitizeString(category, 120),
      sold: soldNum,
      stock: stockNum,
      added,
      rating: ratingNum,
      reviews: reviewsNum
    });

    await product.save();
    clearProductCache();
    res.status(201).json(product);
  } catch (err) {
    console.error("خطأ أثناء إضافة المنتج:", err.message);
    if (err && err.name === "ValidationError") return res.status(400).json({ message: "بيانات المنتج غير صالحة" });
    res.status(500).json({ message: "خطأ أثناء إضافة المنتج" });
  }
});

// تعديل منتج
router.put("/admin/products/:id", auth, adminOnly, async (req, res) => {
  try {
    const Product = mongoose.model("Product");
    const id = sanitizeId(req.params.id);
    if (!id) return res.status(400).json({ message: "معرف المنتج غير صالح" });
    const updateFields = allowedAdminProductFields(req.body);
    delete updateFields.added;

    if (typeof updateFields.images === "string") {
      updateFields.images = updateFields.images.split(",").map((i) => sanitizeString(i, 300)).filter(Boolean);
    }
    if (typeof updateFields.tags === "string") {
      updateFields.tags = updateFields.tags.split(",").map((t) => sanitizeString(t, 120)).filter(Boolean);
    }
    if (Array.isArray(updateFields.images)) updateFields.images = updateFields.images.map((i) => sanitizeString(i, 300)).filter(Boolean);
    if (Array.isArray(updateFields.tags)) updateFields.tags = updateFields.tags.map((t) => sanitizeString(t, 120)).filter(Boolean);
    if (updateFields.price !== undefined) {
      const n = Number(updateFields.price);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: "السعر غير صالح" });
      updateFields.price = n;
    }
    if (updateFields.stock !== undefined) {
      const n = Number(updateFields.stock);
      if (!Number.isInteger(n) || n < 0) return res.status(400).json({ message: "المخزون غير صالح" });
      updateFields.stock = n;
    }
    if (updateFields.sold !== undefined) {
      const n = Number(updateFields.sold);
      if (!Number.isInteger(n) || n < 0) return res.status(400).json({ message: "قيمة المبيعات غير صالحة" });
      updateFields.sold = n;
    }
    if (updateFields.rating !== undefined) {
      const n = Number(updateFields.rating);
      if (!Number.isFinite(n) || n < 0 || n > 5) return res.status(400).json({ message: "التقييم يجب أن يكون بين 0 و 5" });
      updateFields.rating = n;
    }
    if (updateFields.reviews !== undefined) {
      const n = Number(updateFields.reviews);
      if (!Number.isInteger(n) || n < 0) return res.status(400).json({ message: "عدد المراجعات غير صالح" });
      updateFields.reviews = n;
    }
    if (updateFields.name !== undefined) updateFields.name = sanitizeString(updateFields.name, 200);
    if (updateFields.desc !== undefined) updateFields.desc = sanitizeString(updateFields.desc, 5000);
    if (updateFields.category !== undefined) updateFields.category = sanitizeString(updateFields.category, 120);

    const product = await Product.findByIdAndUpdate(id, updateFields, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ message: "المنتج غير موجود" });
    clearProductCache();
    res.json(product);
  } catch (err) {
    if (err && err.name === "CastError") return res.status(400).json({ message: "معرف المنتج غير صالح" });
    if (err && err.name === "ValidationError") return res.status(400).json({ message: "بيانات المنتج غير صالحة" });
    res.status(500).json({ message: "خطأ أثناء تحديث المنتج" });
  }
});

// حذف منتج
router.delete("/admin/products/:id", auth, adminOnly, async (req, res) => {
  try {
    const Product = mongoose.model("Product");
    const id = sanitizeId(req.params.id);
    if (!id) return res.status(400).json({ message: "معرف المنتج غير صالح" });
    const result = await Product.deleteOne({ _id: id });
    if (!result.deletedCount) return res.status(404).json({ message: "المنتج غير موجود" });
    clearProductCache();
    res.json({ success: true });
  } catch (err) {
    if (err && err.name === "CastError") return res.status(400).json({ message: "معرف المنتج غير صالح" });
    res.status(500).json({ message: "خطأ أثناء حذف المنتج" });
  }
});

// ============ الطلبات ============
router.get("/admin/orders", auth, adminOnly, async (req, res) => {
  try {
    const { limit, page, skip } = pageParams(req.query);
    const Order = mongoose.model("Order");
    const [orders, total] = await Promise.all([
      Order.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments({})
    ]);
    setPageHeaders(res, total, page, limit);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "خطأ أثناء جلب الطلبات" });
  }
});

// تحديث حالة الطلب
router.put("/admin/orders/:id/status", auth, adminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const Order = mongoose.model("Order");
    const Product = mongoose.model("Product");
    const id = sanitizeId(req.params.id);
    if (!id) return res.status(400).json({ message: "معرف الطلب غير صالح" });
    const payload = sanitizeObjectStrings(req.body || {});
    const status = typeof payload.status === "string" ? payload.status : req.body?.status;
    const allowedStatuses = [
      "قيد الانتظار", "جار التجهيز", "جار التوصيل", "تم التوصيل", "ملغي", "فشل التوصيل"
    ];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "حالة غير صالحة" });
    }
    let updated = null;
    await session.withTransaction(async () => {
      const order = await Order.findById(id).session(session);
      if (!order) throw Object.assign(new Error("الطلب غير موجود"), { statusCode: 404 });
      const prev = order.status;
      const cancelled = new Set(["ملغي", "فشل التوصيل"]);
      const wasCancelled = cancelled.has(prev);
      const willCancel = cancelled.has(status);
      if (!wasCancelled && willCancel) {
        for (const item of order.cart || []) {
          await Product.updateOne({ _id: item.productId }, { $inc: { stock: item.qty, sold: -item.qty } }, { session });
        }
      } else if (wasCancelled && !willCancel) {
        for (const item of order.cart || []) {
          const r = await Product.updateOne({ _id: item.productId, stock: { $gte: item.qty } }, { $inc: { stock: -item.qty, sold: item.qty } }, { session });
          if (!r.modifiedCount) throw Object.assign(new Error(`المخزون غير كافٍ لإعادة تفعيل الطلب (${item.name || "منتج"})`), { statusCode: 400 });
        }
      }
      order.status = status;
      await order.save({ session });
      updated = order;
    });
    try { clearProductCache(); } catch (_) {}
    res.json(updated);
  } catch (err) {
    if (err && err.name === "CastError") return res.status(400).json({ message: "معرف الطلب غير صالح" });
    res.status(err.statusCode || 500).json({ message: err.statusCode ? err.message : "خطأ أثناء تحديث حالة الطلب" });
  } finally {
    await session.endSession();
  }
});

// ============ السلال ============
router.get("/admin/carts", auth, adminOnly, async (req, res) => {
  try {
    const { limit, page, skip } = pageParams(req.query);
    const UserCart = mongoose.model("UserCart");
    const [carts, total] = await Promise.all([
      UserCart.find({}).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      UserCart.countDocuments({})
    ]);
    setPageHeaders(res, total, page, limit);
    res.json(carts);
  } catch (err) {
    res.status(500).json({ message: "خطأ أثناء جلب السلال" });
  }
});

router.delete("/admin/carts/:id", auth, adminOnly, async (req, res) => {
  try {
    const UserCart = mongoose.model("UserCart");
    const id = sanitizeId(req.params.id);
    if (!id) return res.status(400).json({ message: "معرف السلة غير صالح" });
    const result = await UserCart.deleteOne({ _id: id });
    if (!result.deletedCount) return res.status(404).json({ message: "السلة غير موجودة" });
    res.json({ success: true });
  } catch (err) {
    if (err && err.name === "CastError") return res.status(400).json({ message: "معرف السلة غير صالح" });
    res.status(500).json({ message: "خطأ أثناء حذف السلة" });
  }
});

module.exports = router;
