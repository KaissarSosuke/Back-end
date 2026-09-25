const express = require("express");
const Product = require("./models/Product");
const { pageParams, setPageHeaders, escapeRegex } = require("./lib/security");
const router = express.Router();
const cache = new Map();
const TTL = 30 * 1000;
const MAX_CACHE_ENTRIES = 200;
function clearCache() { cache.clear(); }
function cacheSet(key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}
router.get("/", async (req, res) => {
  try {
    const { category, search, sort } = req.query;
    if ((category !== undefined && typeof category !== "string") || (search !== undefined && typeof search !== "string") || (sort !== undefined && typeof sort !== "string")) return res.status(400).json({ message: "معاملات البحث غير صحيحة" });
    const { limit, page, skip } = pageParams(req.query);
    const key = JSON.stringify({ category, search, sort, limit, page });
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) { cached.headers.forEach(([k, v]) => res.set(k, v)); return res.json(cached.data); }
    const filter = {};
    if (category && category !== "الكل") filter.category = category;
    if (search?.trim()) {
      const safe = escapeRegex(search.trim().slice(0, 100));
      filter.$or = [{ name: new RegExp(safe, "i") }, { tags: { $elemMatch: { $regex: new RegExp(safe, "i") } } }];
    }
    const sortObj = { newest: { added: -1 }, lowest: { price: 1 }, highest: { price: -1 }, mostsold: { sold: -1 } }[sort] || { id: 1 };
    const [data, total] = await Promise.all([Product.find(filter).sort(sortObj).skip(skip).limit(limit).lean(), Product.countDocuments(filter)]);
    setPageHeaders(res, total, page, limit);
    cacheSet(key, { data, expires: Date.now() + TTL, headers: [["X-Total-Count", String(total)], ["X-Page", String(page)], ["X-Limit", String(limit)], ["X-Has-More", String(page * limit < total)]] });
    res.json(data);
  } catch (_) { res.status(500).json({ message: "خطأ في جلب المنتجات" }); }
});
router.clearCache = clearCache;
module.exports = router;