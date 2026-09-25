const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { auth } = require("./signin.js");
const { sanitizeObjectStrings, sanitizeString, sanitizeId } = require("./lib/security");
const Order = require("./models/Order");
const Product = require("./models/Product");
const User = require("./models/User");
const UserCart = require("./models/UserCart");

const router = express.Router();
const paymentLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { message: "محاولات كثيرة جداً، حاول لاحقاً." } });

// =========== إنشاء طلب جديد ===========
router.post("/payment", paymentLimiter, auth, async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const payload = sanitizeObjectStrings(req.body || {});
        const address = payload.address && typeof payload.address === "object" ? payload.address : {};
        const phoneRaw = payload.phone;
        const phone = sanitizeString(typeof phoneRaw === "number" ? String(phoneRaw) : phoneRaw, 20);
        if (!address.city || !address.district || !address.street || !address.houseNumber || !phone) {
            return res.status(400).json({ message: "جميع بيانات التوصيل مطلوبة." });
        }
        if (!/^09[0-9]{8}$/.test(phone)) {
            return res.status(400).json({ message: "رقم الهاتف غير صحيح." });
        }

        let orderResult = null;
        await session.withTransaction(async () => {
            const user = await User.findById(req.userId).select("fullName email").session(session);
            if (!user) throw Object.assign(new Error("المستخدم غير موجود."), { statusCode: 401 });

            // قفل السلة ذرياً: اقرأ ثم احذف داخل نفس المعاملة لمنع الطلب المزدوج
            const cartEntry = await UserCart.findOne({ userId: user._id }).session(session);
            if (!cartEntry || !cartEntry.cart || !cartEntry.cart.length) {
                throw Object.assign(new Error("سلتك فارغة!"), { statusCode: 400 });
            }

            const cart = [];
            let total = 0;
            for (const item of cartEntry.cart) {
                if (!item.productId) throw Object.assign(new Error("كمية منتج غير صالحة."), { statusCode: 400 });
                const product = await Product.findById(item.productId).session(session);
                if (!product) throw Object.assign(new Error(`المنتج ${item.name || "غير موجود"} غير متوفر الآن.`), { statusCode: 400 });
                const qty = Number(item.qty || 0);
                if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw Object.assign(new Error("كمية منتج غير صالحة."), { statusCode: 400 });
                // خصم ذري مع شرط المخزون لمنع البيع الزائد
                const stockRes = await Product.updateOne(
                    { _id: product._id, stock: { $gte: qty } },
                    { $inc: { stock: -qty, sold: qty } },
                    { session }
                );
                if (!stockRes.modifiedCount) throw Object.assign(new Error(`الكمية المطلوبة للمنتج ${product.name} غير متاحة.`), { statusCode: 400 });
                const price = Number(product.price || 0);
                cart.push({ productId: item.productId, name: product.name, price, qty, images: product.images || [] });
                total += price * qty;
            }

            const [newOrder] = await Order.create([{
                userId: user._id,
                fullName: user.fullName,
                email: user.email,
                cart,
                total,
                address: {
                    city: sanitizeString(address.city, 100),
                    district: sanitizeString(address.district, 100),
                    street: sanitizeString(address.street, 200),
                    houseNumber: sanitizeString(address.houseNumber, 50),
                    notes: sanitizeString(address.notes || "", 500)
                },
                phone,
                status: "قيد الانتظار"
            }], { session });
            await UserCart.deleteOne({ userId: user._id }).session(session);
            orderResult = newOrder;
        });

        res.status(201).json({ message: "تم إرسال الطلب بنجاح!", orderId: String(orderResult._id) });
    } catch (err) {
        console.error("ORDER_ERROR:", err.message);
        res.status(err.statusCode || 500).json({ message: err.statusCode ? err.message : "حدث خطأ أثناء معالجة الطلب" });
    } finally {
        await session.endSession();
    }
});

router.get("/orders/me", auth, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
        res.status(200).json(orders);
    } catch (err) {
        console.error("GET_ORDERS_ERROR:", err);
        res.status(500).json({ message: "خطأ أثناء جلب الطلبات." });
    }
});

// =========== إلغاء طلب ===========
router.put("/orders/:id/cancel", auth, async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const orderId = sanitizeId(req.params.id);
        if (!orderId) return res.status(400).json({ message: "معرف الطلب غير صالح." });
        let updated = null;
        await session.withTransaction(async () => {
            const order = await Order.findById(orderId).session(session);
            if (!order) throw Object.assign(new Error("الطلب غير موجود."), { statusCode: 404 });

            // فقط صاحب الطلب يحق له الإلغاء
            if (String(order.userId) !== String(req.userId)) {
                throw Object.assign(new Error("غير مصرح لك بإلغاء هذا الطلب."), { statusCode: 403 });
            }

            // يمكن الإلغاء فقط إذا كان قيد الانتظار أو جار التجهيز
            if (order.status !== "قيد الانتظار" && order.status !== "جار التجهيز") {
                throw Object.assign(new Error("لا يمكن إلغاء هذا الطلب بعد بدء التوصيل أو إذا تم إلغاؤه سابقاً."), { statusCode: 400 });
            }

            order.status = "ملغي";
            await order.save({ session });
            // تعويض المخزون المحجوز
            for (const item of order.cart || []) {
                await Product.updateOne(
                    { _id: item.productId },
                    { $inc: { stock: item.qty, sold: -item.qty } },
                    { session }
                );
            }
            updated = order;
        });

        res.status(200).json({ message: "تم إلغاء الطلب بنجاح.", status: updated.status });
    } catch (err) {
        console.error("CANCEL_ORDER_ERROR:", err.message);
        res.status(err.statusCode || 500).json({ message: err.statusCode ? err.message : "حدث خطأ أثناء إلغاء الطلب." });
    } finally {
        await session.endSession();
    }
});

module.exports = router;