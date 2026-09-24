const mongoose = require("mongoose");
const productSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  desc: { type: String, required: true, maxlength: 5000 },
  price: { type: Number, required: true, min: 0 },
  images: [String], tags: [String],
  category: { type: String, required: true, index: true },
  sold: { type: Number, default: 0, min: 0 },
  stock: { type: Number, required: true, min: 0 },
  added: { type: Number, required: true },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviews: { type: Number, default: 0, min: 0 },
}, { collection: "products" });
productSchema.index({ name: "text", tags: "text" });
module.exports = mongoose.models.Product || mongoose.model("Product", productSchema);