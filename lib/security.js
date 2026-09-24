const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const csrfCookie = "csrf-token";
function csrfToken(req, res) {
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie(csrfCookie, token, { httpOnly: false, sameSite: "none", secure: true, path: "/" });
  res.json({ csrfToken: token });
}
function csrfProtection(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const cookie = req.cookies && req.cookies[csrfCookie];
  const header = req.get("X-CSRF-Token");
  if (!cookie || !header || cookie.length !== header.length || !crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    return res.status(403).json({ message: "رمز حماية الطلب مفقود أو غير صالح" });
  }
  next();
}
const stateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { message: "محاولات كثيرة جداً، حاول لاحقاً." } });
function pageParams(query) {
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  return { limit, page, skip: (page - 1) * limit };
}
function setPageHeaders(res, total, page, limit) {
  res.set({ "X-Total-Count": String(total), "X-Page": String(page), "X-Limit": String(limit), "X-Has-More": String(page * limit < total) });
}
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
module.exports = { csrfToken, csrfProtection, stateLimiter, pageParams, setPageHeaders, escapeRegex };