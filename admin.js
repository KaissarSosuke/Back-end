const express = require("express");
const mongoose = require("mongoose");
const { auth, adminOnly } = require("./signin.js");
const { pageParams, sanitizeString, sanitizeObjectStrings } = require("./lib/security");

const router = express.Router();

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
    res.set({ "X-Total-Count": String(total), "X-Page": String(page), "X-Limit": String(limit) });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "خطأ أثناء جلب المستخدمين" });
  }
});

router.delete("/admin/users/:id", auth, adminOnly, async (req, res) => {
  try {
    const User = mongoose.model("User");
    const { id } = req.params;
    const result = await User.deleteOne({ _id: id });
    if (!result.deletedCount) return res.status(404).json({ message: "المستخدم غير موجود" });
    res.json({ success: true });
  } catch (err) {
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
    res.set({ "X-Total-Count": String(total), "X-Page": String(page), "X-Limit": String(limit) });
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
    if (Number(price) < 0 || Number(stock) < 0) return res.status(400).json({ message: "السعر أو المخزون غير صالح" });

    const added = Date.now();
    const product = new Product({
      name: sanitizeString(name, 200),
      desc: sanitizeString(desc, 5000),
      price: Number(price),
      images: Array.isArray(images) ? images.map((i) => sanitizeString(i, 300)).filter(Boolean) : [],
      tags: Array.isArray(tags) ? tags.map((t) => sanitizeString(t, 120)).filter(Boolean) : [],
      category: sanitizeString(category, 120),
      sold: Number(sold || 0),
      stock: Number(stock),
      added,
      rating: Number(rating || 0),
      reviews: Number(reviews || 0)
    });

    await product.save();
    res.status(201).json(product);
  } catch (err) {
    console.error("خطأ أثناء إضافة المنتج:", err);
    res.status(500).json({ message: "خطأ أثناء إضافة المنتج" });
  }
});

// تعديل منتج
router.put("/admin/products/:id", auth, adminOnly, async (req, res) => {
  try {
    const Product = mongoose.model("Product");
    const { id } = req.params;
    const updateFields = allowedAdminProductFields(req.body);

    if (typeof updateFields.images === "string") {
      updateFields.images = updateFields.images.split(",").map((i) => sanitizeString(i, 300)).filter(Boolean);
    }
    if (typeof updateFields.tags === "string") {
      updateFields.tags = updateFields.tags.split(",").map((t) => sanitizeString(t, 120)).filter(Boolean);
    }
    if (updateFields.price !== undefined && Number(updateFields.price) < 0) {
      return res.status(400).json({ message: "السعر غير صالح" });
    }
    if (updateFields.stock !== undefined && Number(updateFields.stock) < 0) {
      return res.status(400).json({ message: "المخزون غير صالح" });
    }
    if (!updateFields.added) updateFields.added = Date.now();

    const product = await Product.findByIdAndUpdate(id, updateFields, { new: true });
    if (!product) return res.status(404).json({ message: "المنتج غير موجود" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: "خطأ أثناء تحديث المنتج" });
  }
});

// حذف منتج
router.delete("/admin/products/:id", auth, adminOnly, async (req, res) => {
  try {
    const Product = mongoose.model("Product");
    const { id } = req.params;
    const result = await Product.deleteOne({ _id: id });
    if (!result.deletedCount) return res.status(404).json({ message: "المنتج غير موجود" });
    res.json({ success: true });
  } catch (err) {
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
    res.set({ "X-Total-Count": String(total), "X-Page": String(page), "X-Limit": String(limit) });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "خطأ أثناء جلب الطلبات" });
  }
});

// تحديث حالة الطلب
router.put("/admin/orders/:id/status", auth, adminOnly, async (req, res) => {
  try {
    const Order = mongoose.model("Order");
    const { id } = req.params;
    const { status } = req.body;
    const allowedStatuses = [
      "قيد الانتظار", "جار التجهيز", "جار التوصيل", "تم التوصيل", "ملغي", "فشل التوصيل"
    ];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "حالة غير صالحة" });
    }
    const order = await Order.findByIdAndUpdate(id, { status }, { new: true });
    if (!order) return res.status(404).json({ message: "الطلب غير موجود" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: "خطأ أثناء تحديث حالة الطلب" });
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
    res.set({ "X-Total-Count": String(total), "X-Page": String(page), "X-Limit": String(limit) });
    res.json(carts);
  } catch (err) {
    res.status(500).json({ message: "خطأ أثناء جلب السلال" });
  }
});

router.delete("/admin/carts/:id", auth, adminOnly, async (req, res) => {
  try {
    const UserCart = mongoose.model("UserCart");
    const { id } = req.params;
    const result = await UserCart.deleteOne({ _id: id });
    if (!result.deletedCount) return res.status(404).json({ message: "السلة غير موجودة" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "خطأ أثناء حذف السلة" });
  }
});

module.exports = router;
