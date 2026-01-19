const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config();
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB Database'))
    .catch(err => console.error('Database Connection Error:', err));

// Database Schema with Hardware Locking and Expiry
const License = mongoose.model('License', new mongoose.Schema({
    email: String,
    licenseKey: String,
    subscriptionId: String,
    hwid: { type: String, default: null }, 
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null } // Added for trial tracking
}));

// Razorpay Initialization
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/get-razorpay-key', (req, res) => {
    res.json({ key: process.env.RAZORPAY_KEY_ID });
});

// Trial Registration Route (7 Days)
app.post('/register-trial', async (req, res) => {
    const { hwid } = req.body;
    try {
        const existingTrial = await License.findOne({ hwid: hwid });

        if (existingTrial) {
            return res.json({ success: false, message: "Trial already claimed on this device." });
        }

        const trialKey = `TRIAL-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        
        // Calculate 7 days from now
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 7);

        const newTrial = new License({
            email: "Trial-User",
            licenseKey: trialKey,
            subscriptionId: "FREE-TRIAL",
            hwid: hwid,
            status: 'active',
            expiresAt: expiryDate
        });

        await newTrial.save();
        console.log(`7-Day Trial registered for HWID: ${hwid}`);
        res.json({ success: true, message: "7-Day Trial activated!" });
    } catch (error) {
        console.error("TRIAL ERROR:", error);
        res.status(500).json({ success: false, message: "Server error during trial setup." });
    }
});

app.post('/verify-license', async (req, res) => {
    const { licenseKey, hwid } = req.body;
    try {
        const license = await License.findOne({ licenseKey: licenseKey, status: 'active' });

        if (!license) {
            return res.json({ success: false, message: "Invalid or Expired License Key" });
        }

        // Check if trial has expired
        if (license.expiresAt && new Date() > license.expiresAt) {
            license.status = 'expired';
            await license.save();
            return res.json({ success: false, message: "Trial period has ended." });
        }

        if (!license.hwid) {
            license.hwid = hwid; 
            await license.save();
            return res.json({ success: true, message: "License activated and locked." });
        }

        if (license.hwid === hwid) {
            return res.json({ success: true, message: "Access Granted" });
        } else {
            return res.json({ success: false, message: "License already in use on another device." });
        }
    } catch (error) {
        console.error("VERIFY ERROR:", error);
        res.status(500).json({ success: false, message: "Server connection error." });
    }
});

// Remaining routes (create-subscription, verify-payment, save-license)
app.post('/create-subscription', async (req, res) => {
    try {
        const subscription = await razorpay.subscriptions.create({
            plan_id: 'plan_S5oqxEfT2FHEtI', 
            customer_notify: 1,
            total_count: 120, 
            quantity: 1,
        });
        res.json(subscription);
    } catch (error) {
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
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false });
    }
});

app.post('/save-license', async (req, res) => {
    const { email, licenseKey, subscriptionId } = req.body;
    try {
        await new License({ email, licenseKey, subscriptionId }).save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));