const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
require("dotenv").config();

const app = express();
app.set("trust proxy", 1);

app.use(
  cors({
    origin: [

      "http://127.0.0.1:5500"
      
            ], // يدعم الاثنين
    credentials: true,
  })
);

app.use(helmet());
app.use(express.json());
app.use(cookieParser());

mongoose.connect(
  "mongodb+srv://kaiss:Nigga542007@cluster0.hrv2uow.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
)
.then(() => {
  console.log("Connected to MongoDB");
})
.catch((err) => {
  console.error("error with connection to MongoDB", err);
});

// استيراد راوت التسجيل
const signUpRoutes = require("./signup.js");
app.use("/api", signUpRoutes);

// استيراد راوت تسجيل الدخول
const { router: authRoutes } = require("./signin.js");
app.use("/api", authRoutes);

// استيراد واستعمال راوت المنتجات
const productsRoutes = require("./products.js");
app.use("/api/products", productsRoutes);

// استيراد واستعمال راوت السلة
const userCartRoutes = require("./user-cart.js");
app.use("/api/user-cart", userCartRoutes);

// استيراد واستعمال راوت الدفع والطلبات
const paymentRoutes = require("./payment.js");
app.use("/api", paymentRoutes);

// استيراد واستعمال راوت الإعدادات
// في server.js (بعد تسجيل الدخول والتسجيل)
const settingRoutes = require("./settings.js");
app.use("/api/settings", settingRoutes);


// استيراد واستعمال راوت الأدمن
const adminRoutes = require("./admin.js");
app.use("/api", adminRoutes);

// استيراد واستعمال راوت تقييم المنتجات + الرسائل
const contactRoutes = require("./contact.js");
app.use("/api", contactRoutes);

// استيراد واستعمال راوت تقييم المنتجات
const rateRoutes = require("./rate.js");
app.use("/api", rateRoutes);

app.listen(2007, () => {
  console.log("Server is running on port 2007");
});