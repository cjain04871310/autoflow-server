const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const cors = require('cors');
require('dotenv').config(); // Loads .env file (for local use)

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// --- DEBUGGING & SAFETY CHECK ---
console.log("-------------------------------------------------");
console.log("🚀 STARTING SERVER...");
console.log("🔍 CHECKING ENVIRONMENT VARIABLES:");
console.log("   > KEY_ID:", process.env.RAZORPAY_KEY_ID ? "✅ Loaded" : "❌ MISSING/UNDEFINED");
console.log("   > KEY_SECRET:", process.env.RAZORPAY_KEY_SECRET ? "✅ Loaded" : "❌ MISSING/UNDEFINED");
console.log("-------------------------------------------------");

let instance;

// Only initialize Razorpay if keys are present
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    try {
        instance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
        console.log("✅ Razorpay Instance Created Successfully.");
    } catch (error) {
        console.error("❌ Error creating Razorpay instance:", error.message);
    }
} else {
    console.error("⚠️ CRITICAL WARNING: Razorpay keys are missing! Payment routes will fail.");
}

// --------------------------------
// NEW: Default Route (Fixes "Cannot GET /" error)
// --------------------------------
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #2ecc71;">AutoFlow Server is Running! 🚀</h1>
            <p>Status: <strong>Online</strong></p>
            <p>Payment API is ready to accept requests.</p>
        </div>
    `);
});

// Route to create an order
app.post('/order', async (req, res) => {
    if (!instance) {
        return res.status(500).json({ error: "Server Error: Payment gateway not configured." });
    }

    try {
        const options = {
            amount: req.body.amount * 100, // Amount in paise
            currency: "INR",
            receipt: "receipt#1",
        };
        const order = await instance.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error("Order Creation Error:", error);
        res.status(500).send(error);
    }
});

// Route to verify payment signature
app.post('/verify', (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

    if (expectedSignature === razorpay_signature) {
        res.json({ status: "success" });
    } else {
        res.status(400).json({ status: "failure" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});