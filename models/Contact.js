const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, trim: true, lowercase: true, match: /.+@.+\..+/ },
  message: { type: String, required: true, trim: true, minlength: 3, maxlength: 2000 }, ip: String,
}, { timestamps: true });
module.exports = mongoose.models.Contact || mongoose.model("Contact", schema);