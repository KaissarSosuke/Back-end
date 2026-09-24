const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { auth } = require("./signin.js");
const { sanitizeObjectStrings, sanitizeString } = require("./lib/security");
const router = express.Router();
const rateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { message: "محاولات كثيرة جداً، حاول لاحقاً." } });

// سكيمات
const ratingSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  orderId:   { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Order" },
  productId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Product" },
  rating:    { type: Number, required: true, min: 1, max: 5 },
  note:      { type: String, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now }
}, { collection: "ratings" });

const Rating = mongoose.models.Rating || mongoose.model("Rating", ratingSchema);

// تقييم منتج
router.post("/rate", rateLimiter, auth, async (req, res) => {
  try {
    const payload = sanitizeObjectStrings(req.body || {});
    const orderId = sanitizeString(payload.orderId, 50);
    const productId = sanitizeString(payload.productId, 50);
    const rating = Number(payload.rating);
    const note = sanitizeString(payload.note || "", 2000);
    if (!orderId || !productId || !Number.isFinite(rating)) {
      return res.status(400).json({ message: "كل الحقول مطلوبة." });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: "التقييم يجب أن يكون بين 1 و 5." });
    }
    // تحقق أن الطلب يخص المستخدم وحالته "تم التوصيل"
    const Order = mongoose.model("Order");
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "الطلب غير موجود." });
    if (String(order.userId) !== String(req.userId)) {
      return res.status(403).json({ message: "غير مصرح لك." });
    }
    if (order.status !== "تم التوصيل") {
      return res.status(400).json({ message: "لا يمكنك التقييم إلا بعد استلام المنتج." });
    }
    // تحقق أن المنتج ضمن الطلب
    const productInOrder = order.cart.find(p => String(p.productId) === String(productId));
    if (!productInOrder) {
      return res.status(400).json({ message: "المنتج غير موجود في هذا الطلب." });
    }
    // لا يسمح بتكرار التقييم لنفس المنتج في نفس الطلب
    const existing = await Rating.findOne({ userId: req.userId, orderId, productId });
    if (existing) {
      return res.status(409).json({ message: "قمت بتقييم هذا المنتج بالفعل لهذا الطلب." });
    }
    // حفظ التقييم
    const ratingObj = new Rating({
      userId: req.userId,
      orderId,
      productId,
      rating,
      note: note || ""
    });
    await ratingObj.save();
    res.status(201).json({ message: "تم إرسال تقييمك بنجاح!" });
  } catch (err) {
    console.error("RATE_ERROR:", err);
    res.status(500).json({ message: "حدث خطأ أثناء إرسال التقييم." });
  }
});

// جلب التقييمات لمنتج (مثلاً لحساب متوسط التقييم)
router.get("/rate/product/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const ratings = await Rating.find({ productId }).lean();
    res.json(ratings);
  } catch (err) {
    res.status(500).json({ message: "خطأ أثناء جلب التقييمات." });
  }
});

// جلب تقييم المستخدم على منتج في طلب معين (لمنع تكرار التقييم في الواجهة)
router.get("/rate/user", auth, async (req, res) => {
  try {
    const { orderId, productId } = req.query;
    if (!orderId || !productId) return res.status(400).json({ message: "معرف الطلب ومعرف المنتج مطلوبان." });
    const rate = await Rating.findOne({ userId: req.userId, orderId, productId });
    res.json(rate || null);
  } catch (err) {
    res.status(500).json({ message: "خطأ أثناء جلب التقييم." });
  }
});

module.exports = router;