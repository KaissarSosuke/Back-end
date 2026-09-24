const mongoose = require("mongoose");
const itemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Product" },
  name: String, price: { type: Number, min: 0 }, qty: { type: Number, required: true, min: 1, max: 999 },
  images: [String], stock: { type: Number, min: 0 }, addedAt: { type: Date, default: Date.now },
}, { _id: false });
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User", unique: true, index: true },
  fullName: { type: String, required: true }, email: { type: String, required: true },
  cart: [itemSchema], updatedAt: { type: Date, default: Date.now },
}, { collection: "usercarts" });
module.exports = mongoose.models.UserCart || mongoose.model("UserCart", schema);