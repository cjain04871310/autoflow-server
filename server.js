const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
require('dotenv').config();
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Serves your HTML/CSS files

// Razorpay Instance
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// --- ROUTES ---

// 1. Serve Homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. NEW: Create Subscription (Replaces /create-order)
app.post('/create-subscription', async (req, res) => {
    try {
        const subscription = await razorpay.subscriptions.create({
            plan_id: 'plan_S26uwgKUPt1CFq', // <--- PASTE YOUR PLAN ID HERE
            customer_notify: 1,
            total_count: 120, // 10 years of monthly billing
            quantity: 1,
            // add_ons: [],
            // notes: {}
        });
        res.json(subscription);
    } catch (error) {
        console.error("Subscription Creation Error:", error);
        res.status(500).send(error);
    }
});

// 3. UPDATED: Verify Subscription Payment
app.post('/verify-payment', async (req, res) => {
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;

    // The signature formula for subscriptions is different:
    // payment_id + "|" + subscription_id
    const data = razorpay_payment_id + "|" + razorpay_subscription_id;

    const generated_signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(data)
        .digest('hex');

    if (generated_signature === razorpay_signature) {
        res.json({ success: true, message: "Subscription Verified" });
    } else {
        res.status(400).json({ success: false, message: "Invalid Signature" });
    }
});

// 4. Send License Key Email (Unchanged)
app.post('/send-license', async (req, res) => {
    const { email, licenseKey } = req.body;

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your AutoFlow License Key',
        text: `Thank you for subscribing! Here is your license key: ${licenseKey}`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "License key sent!" });
    } catch (error) {
        console.error("Email Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});