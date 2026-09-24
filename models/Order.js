const mongoose = require("mongoose");
const itemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Product" },
  name: String, price: { type: Number, min: 0 }, qty: { type: Number, required: true, min: 1 }, images: [String],
}, { _id: false });
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User", index: true },
  fullName: { type: String, required: true }, email: { type: String, required: true, index: true },
  cart: [itemSchema], total: { type: Number, required: true, min: 0 },
  address: { city: { type: String, required: true }, district: { type: String, required: true }, street: { type: String, required: true }, houseNumber: { type: String, required: true }, notes: String },
  phone: { type: String, required: true },
  status: { type: String, enum: ["قيد الانتظار", "جار التجهيز", "جار التوصيل", "تم التوصيل", "ملغي", "فشل التوصيل"], default: "قيد الانتظار" },
  createdAt: { type: Date, default: Date.now, index: true },
}, { collection: "orders" });
module.exports = mongoose.models.Order || mongoose.model("Order", schema);