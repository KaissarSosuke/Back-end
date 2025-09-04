const express = require("express");
const mongoose = require("mongoose");
const { auth } = require("./signin.js");

const router = express.Router();

// ====== تعريف مخطط الطلب ======
const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    cart: [
        {
            productId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Product" },
            name: { type: String },
            price: { type: Number },
            qty: { type: Number, required: true, min: 1 },
            images: [String]
        }
    ],
    total: { type: Number, required: true },
    address: {
        city: { type: String, required: true },
        district: { type: String, required: true },
        street: { type: String, required: true },
        houseNumber: { type: String, required: true },
        notes: { type: String }
    },
    phone: { type: String, required: true },
    status: {
        type: String,
        enum: ["قيد الانتظار", "جار التجهيز", "جار التوصيل", "تم التوصيل", "ملغي", "فشل التوصيل"],
        default: "قيد الانتظار"
    },
    createdAt: { type: Date, default: Date.now }
}, { collection: "orders" });

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);

// السلة
const UserCart = mongoose.model("UserCart");

// =========== إنشاء طلب جديد ===========
router.post("/payment", auth, async (req, res) => {
    try {
        const { address, phone } = req.body;
        if (!address || !address.city || !address.district || !address.street || !address.houseNumber || !phone) {
            return res.status(400).json({ message: "جميع بيانات التوصيل مطلوبة." });
        }
        if (!/^09[0-9]{8}$/.test(phone)) {
            return res.status(400).json({ message: "رقم الهاتف غير صحيح." });
        }

        // جلب بيانات المستخدم
        const user = await mongoose.model("User").findById(req.userId).select("fullName email").exec();
        if (!user) return res.status(401).json({ message: "المستخدم غير موجود." });

        // جلب السلة
        const cartEntry = await UserCart.findOne({ userId: user._id }).lean();
        if (!cartEntry || !cartEntry.cart || !cartEntry.cart.length) {
            return res.status(400).json({ message: "سلتك فارغة!" });
        }
        const cart = cartEntry.cart.map(item => ({
            productId: item.productId,
            name: item.name,
            price: item.price,
            qty: item.qty,
            images: item.images
        }));
        const total = cart.reduce((sum, p) => sum + (p.price || 0) * (p.qty || 0), 0);

        // إنشاء الطلب
        const newOrder = new Order({
            userId: user._id,
            fullName: user.fullName,
            email: user.email,
            cart,
            total,
            address,
            phone,
            status: "قيد الانتظار"
        });
        await newOrder.save();

        res.status(201).json({ message: "تم إرسال الطلب بنجاح!" });
    } catch (err) {
        console.error("ORDER_ERROR:", err);
        res.status(500).json({ message: "حدث خطأ أثناء معالجة الطلب" });
    }
});

// =========== جلب طلبات المستخدم (حسب الايميل) ===========
router.get("/orders", auth, async (req, res) => {
    try {
        const email = req.query.email;
        if (!email) return res.status(400).json({ message: "الإيميل مطلوب." });
        const orders = await Order.find({ email }).sort({ createdAt: -1 }).lean();
        res.status(200).json(orders);
    } catch (err) {
        console.error("GET_ORDERS_ERROR:", err);
        res.status(500).json({ message: "خطأ أثناء جلب الطلبات." });
    }
});

// =========== إلغاء طلب ===========
router.put("/orders/:id/cancel", auth, async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ message: "الطلب غير موجود." });

        // فقط صاحب الطلب يحق له الإلغاء
        if (String(order.userId) !== String(req.userId)) {
            return res.status(403).json({ message: "غير مصرح لك بإلغاء هذا الطلب." });
        }

        // يمكن الإلغاء فقط إذا كان قيد الانتظار أو جار التجهيز
        if (order.status !== "قيد الانتظار" && order.status !== "جار التجهيز") {
            return res.status(400).json({ message: "لا يمكن إلغاء هذا الطلب بعد بدء التوصيل أو إذا تم إلغاؤه سابقاً." });
        }

        order.status = "ملغي";
        await order.save();

        res.status(200).json({ message: "تم إلغاء الطلب بنجاح.", status: order.status });
    } catch (err) {
        console.error("CANCEL_ORDER_ERROR:", err);
        res.status(500).json({ message: "حدث خطأ أثناء إلغاء الطلب." });
    }
});

module.exports = router;