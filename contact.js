const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

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
router.post("/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body || {};
    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof message !== "string" ||
      !name.trim() ||
      !email.trim() ||
      !message.trim()
    ) {
      return res.status(400).json({ message: "يرجى تعبئة جميع الحقول بشكل صحيح" });
    }

    // حفظ الرسالة في قاعدة البيانات
    const newMsg = await Contact.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      message: message.trim(),
      ip: req.headers["x-forwarded-for"] || req.connection.remoteAddress,
    });

    return res.status(201).json({ message: "تم إرسال الرسالة بنجاح" });
  } catch (err) {
    console.error("CONTACT_ERROR:", err);
    return res.status(500).json({ message: "حدث خطأ أثناء إرسال الرسالة" });
  }
});

// إظهار جميع الرسائل (للمشاهدة فقط في الباك اند)
router.get("/contact/messages", async (req, res) => {
  try {
    // يمكنك إضافة تحقق أدمن هنا لاحقاً
    const msgs = await Contact.find().sort({ createdAt: -1 });
    return res.status(200).json(msgs);
  } catch (err) {
    return res.status(500).json({ message: "حدث خطأ بجلب الرسائل" });
  }
});

module.exports = router;