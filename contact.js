const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { auth, adminOnly } = require("./signin.js");
const { pageParams, sanitizeString, sanitizeObjectStrings } = require("./lib/security");

const router = express.Router();
const contactLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { message: "محاولات كثيرة جداً، حاول لاحقاً." } });

// نموذج الرسالة
const contactSchema = new mongoose.Schema(
  {
    name:    { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email:   { type: String, required: true, trim: true, lowercase: true, match: /.+@.+\..+/ },
    message: { type: String, required: true, trim: true, minlength: 3, maxlength: 2000 },
    ip:      { type: String }
  },
  { timestamps: true }
);

const Contact = mongoose.models.Contact || mongoose.model("Contact", contactSchema);

// إرسال رسالة تواصل
router.post("/contact", contactLimiter, async (req, res) => {
  try {
    const payload = sanitizeObjectStrings(req.body || {});
    const name = sanitizeString(payload.name, 80);
    const email = sanitizeString(payload.email, 200).toLowerCase();
    const message = sanitizeString(payload.message, 2000);
    if (!name || !email || !message || !/.+@.+\..+/.test(email)) {
      return res.status(400).json({ message: "يرجى تعبئة جميع الحقول بشكل صحيح" });
    }

    await Contact.create({
      name,
      email,
      message,
      ip: req.headers["x-forwarded-for"] || req.connection.remoteAddress,
    });

    return res.status(201).json({ message: "تم إرسال الرسالة بنجاح" });
  } catch (err) {
    console.error("CONTACT_ERROR:", err);
    return res.status(500).json({ message: "حدث خطأ أثناء إرسال الرسالة" });
  }
});

router.get("/contact/messages", auth, adminOnly, async (req, res) => {
  try {
    const { limit, page, skip } = pageParams(req.query);
    const [msgs, total] = await Promise.all([
      Contact.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Contact.countDocuments({})
    ]);
    res.set({ "X-Total-Count": String(total), "X-Page": String(page), "X-Limit": String(limit) });
    return res.status(200).json(msgs);
  } catch (err) {
    return res.status(500).json({ message: "حدث خطأ بجلب الرسائل" });
  }
});

module.exports = router;