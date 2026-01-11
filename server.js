const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
require('dotenv').config();
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path'); // REQUIRED: Allows server to find your HTML files

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// --- CRITICAL CHANGE ---
// This tells the server to look in the current folder for files like 'style.css' or images
app.use(express.static(__dirname));

// Razorpay Instance
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// --- ROUTES ---

// 1. Serve the Homepage
// When someone visits your main link, show them index.html instead of the text message
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Payment Route: Create Order
app.post('/create-order', async (req, res) => {
    try {
        const options = {
            amount: req.body.amount * 100, // Amount in paise
            currency: 'INR',
            receipt: 'receipt_' + Math.random().toString(36).substring(7),
        };
        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error("Order Creation Error:", error);
        res.status(500).send(error);
    }
});

// 3. Payment Route: Verify Payment
app.post('/verify-payment', async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const generated_signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(razorpay_order_id + "|" + razorpay_payment_id)
        .digest('hex');

    if (generated_signature === razorpay_signature) {
        res.json({ success: true, message: "Payment Verified" });
    } else {
        res.status(400).json({ success: false, message: "Invalid Signature" });
    }
});

// 4. Send License Key Email
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
        text: `Thank you for your purchase! Here is your license key: ${licenseKey}`
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