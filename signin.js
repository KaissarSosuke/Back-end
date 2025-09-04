const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const router = express.Router();

// إعدادات التوكن والكوكيز
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_IN_ENV_FILE";
const TOKEN_COOKIE_NAME = "token";
const TOKEN_TTL = "7d";

// إعداد الكوكيز المناسب للبيئة المحلية والإنتاجية
const cookieOptions = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000, // أسبوع
};

// نموذج المستخدم
let User;
try {
  User = require("./models/User");
} catch (_) {
  const userSchema = new mongoose.Schema(
    {
      fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
      email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
      password:     { type: String, required: false, select: false },
      passwordHash: { type: String, required: false, select: false },
    },
    { timestamps: true }
  );
  User = mongoose.models.User || mongoose.model("User", userSchema);
}

// إرجاع بيانات المستخدم الآمنة فقط
function toSafeUser(u) {
  return { id: String(u._id), fullName: u.fullName, email: u.email };
}

// ميدلوير التحقق من التوكن في الكوكيز وجعله أكثر قوة
function auth(req, res, next) {
  let token = null;
  // جلب التوكن من الكوكيز أو الهيدر
  if (req.cookies && req.cookies[TOKEN_COOKIE_NAME]) {
    token = req.cookies[TOKEN_COOKIE_NAME];
  } else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) return res.status(401).json({ message: "غير مصرح" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
  } catch (err) {
    return res.status(401).json({ message: "الجلسة منتهية أو غير صالحة" });
  }
}

// تحديد عدد محاولات تسجيل الدخول
const signinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "محاولات كثيرة جداً، حاول لاحقاً." },
  keyGenerator: (req, res) => {
    const email = (req.body?.email || "").toLowerCase().trim();
    return `${ipKeyGenerator(req, res)}:${email}`;
  },
});

// ============= POST /api/signin =============
router.post("/signin", signinLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return res.status(400).json({ message: "يرجى إدخال البريد وكلمة المرور" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    let user = await User.findOne({ email: normalizedEmail })
      .select("+password +passwordHash")
      .exec();

    if (!user) {
      return res.status(401).json({ message: "بيانات الدخول غير صحيحة" });
    }

    const hash = user.password || user.passwordHash;
    if (!hash) {
      return res.status(500).json({ message: "تم إعداد الحساب بدون كلمة مرور صالحة" });
    }

    const ok = await bcrypt.compare(password, hash);
    if (!ok) {
      return res.status(401).json({ message: "بيانات الدخول غير صحيحة" });
    }

    // أنشئ التوكن
    const token = jwt.sign(
      { sub: String(user._id), email: user.email },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL }
    );

    // احفظ التوكن في كوكي httpOnly بنفس الخيارات
    res.cookie(TOKEN_COOKIE_NAME, token, cookieOptions);

    return res.status(200).json({
      message: "تم تسجيل الدخول بنجاح",
      user: toSafeUser(user),
    });
  } catch (err) {
    console.error("SIGNIN_ERROR:", err);
    return res.status(500).json({ message: "حدث خطأ غير متوقع" });
  }
});

// ============= GET /api/profile =============
router.get("/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("fullName email").exec();
    if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });
    return res.status(200).json(toSafeUser(user));
  } catch (err) {
    console.error("PROFILE_ERROR:", err);
    return res.status(500).json({ message: "حدث خطأ غير متوقع" });
  }
});

// ============= POST /api/logout =============
router.post("/logout", (req, res) => {
  try {
    res.clearCookie(TOKEN_COOKIE_NAME, {
      ...cookieOptions,
      maxAge: 0,
    });
    return res.status(200).json({ message: "تم تسجيل الخروج" });
  } catch (err) {
    console.error("LOGOUT_ERROR:", err);
    return res.status(500).json({ message: "حدث خطأ غير متوقع" });
  }
});

// ============= فحص صلاحية التوكن (اختياري) =============
router.get("/check-auth", auth, (req, res) => {
  return res.status(200).json({ message: "مصرح", userId: req.userId, email: req.userEmail });
});

// تصدير الميدلوير والراوتر معاً
module.exports = {
  router,
  auth
};