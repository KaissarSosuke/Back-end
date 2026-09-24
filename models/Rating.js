const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  orderId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Order" },
  productId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Product" },
  rating: { type: Number, required: true, min: 1, max: 5 }, note: { type: String, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
}, { collection: "ratings" });
schema.index({ userId: 1, orderId: 1, productId: 1 }, { unique: true });
schema.index({ productId: 1, createdAt: -1 });
module.exports = mongoose.models.Rating || mongoose.model("Rating", schema);