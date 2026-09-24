const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  email: { type: String, required: true, unique: true }, fullName: { type: String, required: true },
  password: { type: String, required: true, select: false }, codeHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true }, attempts: { type: Number, default: 0, max: 5 }, ip: String,
}, { timestamps: true, collection: "pending_signups" });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.models.PendingSignup || mongoose.model("PendingSignup", schema);