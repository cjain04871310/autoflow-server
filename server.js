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

// Database Schema with Hardware Locking
const License = mongoose.model('License', new mongoose.Schema({
    email: String,
    licenseKey: String,
    subscriptionId: String,
    hwid: { type: String, default: null }, // Stores the unique machine ID for locking
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: Date.now }
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

app.post('/create-subscription', async (req, res) => {
    try {
        const subscription = await razorpay.subscriptions.create({
            plan_id: 'plan_S26jZw0nJKA5uA', 
            customer_notify: 1,
            total_count: 120, 
            quantity: 1,
        });
        res.json(subscription);
    } catch (error) {
        console.error("RAZORPAY ERROR:", error);
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

// Saves license data sent from the website after payment
app.post('/save-license', async (req, res) => {
    const { email, licenseKey, subscriptionId } = req.body;
    try {
        await new License({ email, licenseKey, subscriptionId }).save();
        console.log(`License record saved for ${email}`);
        res.json({ success: true });
    } catch (error) {
        console.error("DATABASE ERROR:", error);
        res.status(500).json({ success: false });
    }
});

// Verifies the key for the Python Tool and enforces hardware locking
app.post('/verify-license', async (req, res) => {
    const { licenseKey, hwid } = req.body;
    try {
        // Find the active license in the database
        const license = await License.findOne({ licenseKey: licenseKey, status: 'active' });

        if (!license) {
            return res.json({ success: false, message: "Invalid or Expired License Key" });
        }

        // Hardware Locking Logic: Link to the first machine that uses it
        if (!license.hwid) {
            license.hwid = hwid; 
            await license.save();
            return res.json({ success: true, message: "License activated and locked to this device." });
        }

        // Verify that the machine matches the locked Hardware ID
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));