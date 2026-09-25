const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, select: false },
  passwordHash: { type: String, select: false },
  role: { type: String, enum: ["user", "admin"], default: "user", index: true },
  tokenVersion: { type: Number, default: 0 },
  ip: { type: String },
}, { timestamps: true, collection: "users" });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);