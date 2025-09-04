const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

// نموذج المستخدم النهائي
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email:    { type: String, required: true, unique: true },
    password: { type: String, required: true },
    ip:       { type: String }
});
const User = mongoose.models.User || mongoose.model("User", userSchema);

// كولكشن للكود المؤقت
const pendingSignupSchema = new mongoose.Schema({
    email:     { type: String, required: true, unique: true },
    fullName:  { type: String, required: true },
    password:  { type: String, required: true },
    code:      { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts:  { type: Number, default: 0 },
    ip:        { type: String }
}, { timestamps: true, collection: "pending_signups" });
const PendingSignup = mongoose.models.PendingSignup || mongoose.model("PendingSignup", pendingSignupSchema);

// إعداد nodemailer
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // لازم false مع 587
    auth: {
        user: "souqdotcom0@gmail.com",
        pass: "coqr uklw sdsk hwrz"
    }
});



// دالة توليد كود تحقق 6 أرقام
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// إرسال كود التحقق عبر الإيميل
async function sendVerificationCode(email, code) {
    await transporter.sendMail({
        from: '"سوق.كوم" <souqdotcom0@gmail.com>',
        to: email,
        subject: "كود التحقق لإنشاء حساب سوق.كوم",
        text: `كود التحقق الخاص بك هو: ${code}\nيرجى إدخاله خلال 5 دقائق.`,
        html: `<div style="font-family:Tajawal,sans-serif;font-size:1.3em">كود التحقق الخاص بك هو: <b>${code}</b><br>يرجى إدخاله خلال 5 دقائق.</div>`
    });
}

// 1. إرسال الكود
router.post("/signup/send-code", async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        if (!fullName || !email || !password)
            return res.status(400).json({ message: "يرجى تعبئة كل الحقول" });

        if (await User.findOne({ email }))
            return res.status(409).json({ message: "البريد الإلكتروني مستخدم بالفعل" });

        // تحقق إذا سجل طلب مسبق ولم ينتهي وقته
        let pending = await PendingSignup.findOne({ email });
        if (pending && pending.expiresAt > Date.now() && pending.attempts < 5)
            return res.status(429).json({ message: "تم إرسال كود بالفعل لهذا البريد، يرجى الانتظار أو إدخال الكود." });

        // توليد كود جديد
        const code = generateCode();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 دقائق
        const hashedPassword = await bcrypt.hash(password, 10);

        // حفظ في كولكشن المؤقتة (يحدث أو ينشئ)
        await PendingSignup.findOneAndUpdate(
            { email },
            { fullName, password: hashedPassword, code, expiresAt, attempts: 0, ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress },
            { upsert: true, new: true }
        );

        // إرسال الكود
        await sendVerificationCode(email, code);

        return res.status(200).json({ message: "تم إرسال كود التحقق لبريدك الإلكتروني. يرجى إدخاله خلال 5 دقائق." });
    } catch (err) {
        console.error("SendCode Error:", err);
        return res.status(500).json({ message: "حدث خطأ أثناء إرسال كود التحقق" });
    }
});

// 2. تحقق الكود وإنشاء الحساب
router.post("/signup/verify-code", async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ message: "يرجى إدخال البريد والكود" });

        const pending = await PendingSignup.findOne({ email });
        if (!pending) return res.status(400).json({ message: "لا يوجد طلب تحقق لهذا البريد." });

        // تحقق من الوقت
        if (pending.expiresAt < Date.now())
            return res.status(400).json({ message: "انتهت صلاحية الكود، أعد التسجيل." });

        // تحقق من المحاولات
        if (pending.attempts >= 5) {
            await PendingSignup.deleteOne({ email });
            return res.status(429).json({ message: "محاولات كثيرة جداً، يرجى إعادة التسجيل." });
        }

        // تحقق من الكود
        if (pending.code !== code) {
            await PendingSignup.updateOne({ email }, { $inc: { attempts: 1 } });
            return res.status(401).json({ message: "الكود غير صحيح. حاول مجدداً." });
        }

        // تحقق أن البريد لم يسجل أثناء المحاولة
        if (await User.findOne({ email })) {
            await PendingSignup.deleteOne({ email });
            return res.status(409).json({ message: "البريد الإلكتروني مستخدم بالفعل" });
        }

        // أنشئ الحساب
        const newUser = new User({
            fullName: pending.fullName,
            email: pending.email,
            password: pending.password,
            ip: pending.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress
        });
        await newUser.save();
        await PendingSignup.deleteOne({ email });

        return res.status(201).json({ message: "تم إنشاء الحساب بنجاح!" });
    } catch (err) {
        console.error("VerifyCode Error:", err);
        return res.status(500).json({ message: "حدث خطأ أثناء التحقق من الكود" });
    }
});

module.exports = router;