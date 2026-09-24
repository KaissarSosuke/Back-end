require("dotenv").config();
const required = ["MONGODB_URI", "JWT_SECRET", "SMTP_USER", "SMTP_PASS"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const { csrfToken, csrfProtection, stateLimiter } = require("./lib/security");
const User = require("./models/User");
const app = express();
app.set("trust proxy", 1);

app.use(cors({ origin: ["https://kaissarsosuke.github.io"], credentials: true }));
app.use(helmet());
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.get("/api/csrf-token", csrfToken);
app.use(csrfProtection);
app.use((req, res, next) => (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) ? stateLimiter(req, res, next) : next()));

const signUpRoutes = require("./signup");
const { router: authRoutes } = require("./signin");
const productsRoutes = require("./products");
const userCartRoutes = require("./user-cart");
const paymentRoutes = require("./payment");
const settingRoutes = require("./settings");
const adminRoutes = require("./admin");
const contactRoutes = require("./contact");
const rateRoutes = require("./rate");
app.use("/api", signUpRoutes);
app.use("/api", authRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/user-cart", userCartRoutes);
app.use("/api", paymentRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api", adminRoutes);
app.use("/api", contactRoutes);
app.use("/api", rateRoutes);
app.use((req, res) => res.status(404).json({ message: "المسار غير موجود" }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error("REQUEST_ERROR:", err.message);
  res.status(err.statusCode || 500).json({ message: "حدث خطأ غير متوقع" });
});

async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  const configuredAdmins = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (configuredAdmins.length) await User.updateMany({ email: { $in: configuredAdmins } }, { $set: { role: "admin" } });
  const port = Number(process.env.PORT) || 2007;
  app.listen(port, () => console.log(`Server is running on port ${port}`));
}
if (require.main === module) start().catch((err) => { console.error("Startup failed:", err.message); process.exit(1); });
module.exports = app;