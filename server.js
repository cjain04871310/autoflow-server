const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose'); 
require('dotenv').config();
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB Database'))
    .catch(err => console.error('Database Connection Error:', err));

const LicenseSchema = new mongoose.Schema({
    email: String,
    licenseKey: String,
    subscriptionId: String,
    planId: String,
    status: { type: String, default: 'active' }, 
    createdAt: { type: Date, default: Date.now }
});

const License = mongoose.model('License', LicenseSchema);

// Razorpay Instance
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// --- ROUTES ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Create Subscription
app.post('/create-subscription', async (req, res) => {
    try {
        const subscription = await razorpay.subscriptions.create({
            plan_id: 'plan_S26jZw0nJKA5uA', // Make sure this is your TEST Plan ID from Razorpay Dashboard
            customer_notify: 1,
            total_count: 120, 
            quantity: 1,
        });
        res.json(subscription);
    } catch (error) {
        console.error("Subscription Creation Error:", error);
        res.status(500).json(error);
    }
});

app.post('/verify-payment', async (req, res) => {
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;
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

// 4. Send License Key & SAVE to Database (UPDATED FOR ZOHO)
app.post('/send-license', async (req, res) => {
    const { email, licenseKey, subscriptionId } = req.body; 

    try {
        const newLicense = new License({
            email: email,
            licenseKey: licenseKey,
            subscriptionId: subscriptionId || 'manual_entry',
            status: 'active'
        });
        await newLicense.save();
        console.log("License Saved to Database:", licenseKey);
    } catch (dbError) {
        console.error("Database Save Error:", dbError);
    }

    // --- ZOHO CONFIGURATION START ---
    const transporter = nodemailer.createTransport({
        host: 'smtppro.zoho.in', // Change to 'smtppro.zoho.com' if your account is not .in
        port: 465,
        secure: true, // Use SSL for port 465
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
    // --- ZOHO CONFIGURATION END ---

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your AutoFlow License Key',
        text: `Thank you for subscribing! \n\nYour License Key: ${licenseKey}\n\nKeep this key safe.`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "License key sent & saved!" });
    } catch (error) {
        console.error("Email Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/validate-license', async (req, res) => {
    const { licenseKey } = req.body;
    try {
        const userRecord = await License.findOne({ licenseKey: licenseKey });
        if (!userRecord) {
            return res.json({ valid: false, message: "Key not found" });
        }
        if (userRecord.status === 'active') {
            res.json({ valid: true });
        } else {
            res.json({ valid: false, message: "Subscription Cancelled" });
        }
    } catch (error) {
        res.status(500).json({ valid: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});