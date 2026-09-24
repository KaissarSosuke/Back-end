const express = require("express");
const mongoose = require("mongoose");
const { auth } = require("./signin.js");

const router = express.Router();

// ============ إعدادات الأدمن ============
// Admin check via role field (replaces hardcoded email list)
const ADMIN_ROLE = "admin";

// Middleware: allows only admins (by role field)
function adminOnly(req, res, next) {
  try {
    const user = await User.findById(req.userId).select("role").lean();
    if (!user || user.role !== ADMIN_ROLE) {
      return res.status(403).json({ message: "غير مصرح: هذه الصفحة للأدمن فقط" });
    }
    next;
  } catch (err) {
    res.status(403).json({ message: "غير مصرح: لا يمكن التحقق من الصلاحيات" });
  }
}

// Middleware: يسمح فقط للأدمن بالدخول
function adminOnly(req, res, next) {
  const userEmail = (req.userEmail || "").trim().toLowerCase();
  const isAdmin = ADMINS.map(e => e.trim().toLowerCase()).includes(userEmail);
  if (!userEmail || !isAdmin) {
    return res.status(403).json({ message: "غير مصرح: هذه الصفحة للأدمن فقط" });
  }
  next();
}

// تحقق الأدمن
router.get("/admin/me", auth, adminOnly, (req, res) => {
  res.json({ isAdmin: true, email: req.userEmail });
});

// ============ المستخدمين ============
router.get("/admin/users", auth, adminOnly, async (req, res) => {
  try {
    const User = mongoose.model("User");
    const users = await User.find({}, "fullName email createdAt ip").lean();
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
    const Product = mongoose.model("Product");
    const products = await Product.find({}).lean();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "خطأ أثناء جلب المنتجات" });
  }
});

// إضافة منتج جديد
router.post("/admin/products", auth, adminOnly, async (req, res) => {
  try {
    const Product = mongoose.model("Product");
    let { name, desc, price, images, tags, category, sold, stock, rating, reviews } = req.body;

    // تحقق من الحقول الأساسية
    if (!name || !desc || !price || !category || typeof stock === "undefined") {
      return res.status(400).json({ message: "يرجى تعبئة جميع الحقول المطلوبة" });
    }

    // معالجة الصور والوسوم إذا كانت سترينج
    if (typeof images === "string") {
      images = images.split(",").map(i => i.trim()).filter(Boolean);
    }
    if (typeof tags === "string") {
      tags = tags.split(",").map(t => t.trim()).filter(Boolean);
    }

    const added = Date.now();

    const product = new Product({
      name,
      desc,
      price,
      images: images || [],
      tags: tags || [],
      category,
      sold: sold || 0,
      stock,
      added,
      rating: rating || 0,
      reviews: reviews || 0
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
    const updateFields = { ...req.body };

    // معالجة الصور والوسوم إذا كانت سترينج
    if (typeof updateFields.images === "string") {
      updateFields.images = updateFields.images.split(",").map(i => i.trim()).filter(Boolean);
    }
    if (typeof updateFields.tags === "string") {
      updateFields.tags = updateFields.tags.split(",").map(t => t.trim()).filter(Boolean);
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
    const Order = mongoose.model("Order");
    const orders = await Order.find({}).sort({ createdAt: -1 }).lean();
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
    const UserCart = mongoose.model("UserCart");
    const carts = await UserCart.find({}).lean();
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
