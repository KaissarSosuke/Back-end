const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// نموذج المنتج
const productSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  desc: { type: String, required: true },
  price: { type: Number, required: true },
  images: [String],
  tags: [String],
  category: { type: String, required: true },
  sold: { type: Number, default: 0 },
  stock: { type: Number, required: true },
  added: { type: Number, required: true },
  rating: { type: Number, default: 0 },
  reviews: { type: Number, default: 0 }
}, { collection: 'products' });

const Product = mongoose.model("Product", productSchema);

// جلب جميع المنتجات
router.get("/", async (req, res) => {
  try {
    // ترتيب ودعم الفلترة حسب طلب الفرونت
    let { category, search, sort } = req.query;
    let filter = {};
    if (category && category !== "الكل") {
      filter.category = category;
    }
    if (search && search.trim().length) {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [
        { name: searchRegex },
        { tags: { $elemMatch: { $regex: searchRegex } } }
      ];
    }

    let sortObj = {};
    switch (sort) {
      case "newest":
        sortObj.added = -1;
        break;
      case "lowest":
        sortObj.price = 1;
        break;
      case "highest":
        sortObj.price = -1;
        break;
      case "mostsold":
        sortObj.sold = -1;
        break;
      default:
        sortObj.id = 1;
    }

    const products = await Product.find(filter).sort(sortObj).lean();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب المنتجات" });
  }
});

module.exports = router;