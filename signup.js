const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");
const User = require("./models/User");
const PendingSignup = require("./models/PendingSignup");
const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false, message: { message: "محاولات كثيرة جداً، حاول لاحقاً." } });
const transporter = nodemailer.createTransport({ host: "smtp.gmail.com", port: 587, secure: false, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
const normalizeEmail = (value) => typeof value === "string" ? value.trim().toLowerCase() : null;
function generateCode() { return crypto.randomInt(100000, 1000000).toString(); }
async function sendVerificationCode(email, code) {
  await transporter.sendMail({ from: `"سوق.كوم" <${process.env.SMTP_USER}>`, to: email, subject: "كود التحقق لإنشاء حساب سوق.كوم", text: `كود التحقق الخاص بك هو: ${code}\nيرجى إدخاله خلال 5 دقائق.` });
}
router.post("/signup/send-code", limiter, async (req, res) => {
  try {
    const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (fullName.length < 2 || fullName.length > 80 || !email || typeof password !== "string" || password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ message: "بيانات التسجيل غير صحيحة" });
    if (await User.findOne({ email }).lean()) return res.status(409).json({ message: "البريد الإلكتروني مستخدم بالفعل" });
    const pending = await PendingSignup.findOne({ email }).select("+codeHash").lean();
    if (pending && pending.expiresAt > Date.now() && pending.attempts < 5) return res.status(429).json({ message: "تم إرسال كود بالفعل لهذا البريد، يرجى الانتظار." });
    const code = generateCode();
    await PendingSignup.findOneAndUpdate({ email }, { fullName, password: await bcrypt.hash(password, 10), codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + 5 * 60 * 1000), attempts: 0, ip: req.ip }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await sendVerificationCode(email, code);
    res.json({ message: "تم إرسال كود التحقق لبريدك الإلكتروني." });
  } catch (err) { console.error("SIGNUP_SEND_ERROR:", err.message); res.status(500).json({ message: "حدث خطأ أثناء إرسال كود التحقق" }); }
});
router.post("/signup/verify-code", limiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ message: "بيانات التحقق غير صحيحة" });
    const pending = await PendingSignup.findOne({ email }).select("+password +codeHash");
    if (!pending || pending.expiresAt < Date.now()) return res.status(400).json({ message: "انتهت صلاحية الكود، أعد التسجيل." });
    if (pending.attempts >= 5) { await PendingSignup.deleteOne({ email }); return res.status(429).json({ message: "محاولات كثيرة جداً، يرجى إعادة التسجيل." }); }
    if (!await bcrypt.compare(code, pending.codeHash)) { pending.attempts += 1; await pending.save(); return res.status(401).json({ message: "الكود غير صحيح. حاول مجدداً." }); }
    if (await User.findOne({ email }).lean()) { await PendingSignup.deleteOne({ email }); return res.status(409).json({ message: "البريد الإلكتروني مستخدم بالفعل" }); }
    await User.create({ fullName: pending.fullName, email, password: pending.password, ip: pending.ip });
    await PendingSignup.deleteOne({ email });
    res.status(201).json({ message: "تم إنشاء الحساب بنجاح!" });
  } catch (err) { console.error("SIGNUP_VERIFY_ERROR:", err.message); res.status(500).json({ message: "حدث خطأ أثناء التحقق من الكود" }); }
});
module.exports = router;