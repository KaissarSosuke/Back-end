const express = require("express");
const bcrypt = require("bcryptjs");
const { auth } = require("./signin.js");
const { sanitizeString } = require("./lib/security");
const User = require("./models/User");
const router = express.Router();

// تحديث الاسم
router.post("/profile", auth, async (req, res) => {
  try {
    const rawName = req.body?.fullName;
    if (typeof rawName !== "string") {
      return res.status(400).json({ message: "يرجى إدخال اسم صحيح" });
    }
    const fullName = sanitizeString(rawName, 80);
    if (fullName.length < 3 || fullName.length > 80) {
      return res.status(400).json({ message: "يرجى إدخال اسم صحيح" });
    }
    const user = await User.findByIdAndUpdate(
      req.userId,
      { fullName: fullName.trim() },
      { new: true }
    ).select("fullName email");
    if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });
    return res.status(200).json({ message: "تم التحديث بنجاح", fullName: user.fullName });
  } catch (err) {
    return res.status(500).json({ message: "حدث خطأ أثناء تحديث الاسم" });
  }
});

// تغيير كلمة المرور
router.post("/password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== "string" || typeof newPassword !== "string" || !currentPassword || !newPassword) {
      return res.status(400).json({ message: "يرجى تعبئة جميع الحقول" });
    }
    if (newPassword.length < 8 || newPassword.length > 200 || !(/[A-Za-z]/.test(newPassword) && /[0-9]/.test(newPassword))) {
      return res.status(400).json({ message: "كلمة المرور الجديدة يجب أن لا تقل عن 8 خانات وتحتوي على أحرف وأرقام" });
    }
    // جلب المستخدم مع كلمة المرور
    const user = await User.findById(req.userId).select("+password +passwordHash");
    if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });

    const hash = user.password || user.passwordHash;
    if (!hash) return res.status(400).json({ message: "لا يوجد كلمة مرور محفوظة لهذا الحساب" });

    const ok = await bcrypt.compare(currentPassword, hash);
    if (!ok) return res.status(401).json({ message: "كلمة المرور الحالية غير صحيحة" });

    // تحقق أن كلمة المرور الجديدة مختلفة
    const same = await bcrypt.compare(newPassword, hash);
    if (same) return res.status(400).json({ message: "يرجى إدخال كلمة مرور جديدة تختلف عن الحالية" });

    const newHash = await bcrypt.hash(newPassword, 10);
    await User.updateOne(
      { _id: user._id },
      { $set: { password: newHash }, $unset: { passwordHash: 1 }, $inc: { tokenVersion: 1 } }
    );

    return res.status(200).json({ message: "تم تغيير كلمة المرور بنجاح" });
  } catch (err) {
    return res.status(500).json({ message: "حدث خطأ أثناء تغيير كلمة المرور" });
  }
});

module.exports = router;