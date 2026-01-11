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

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB Database'))
    .catch(err => console.error('Database Connection Error:', err));

const LicenseSchema = new mongoose.Schema({
    email: String,
    licenseKey: String,
    subscriptionId: String,
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: Date.now }
});

const License = mongoose.model('License', LicenseSchema);

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID, // Pulled from Env
    key_secret: process.env.RAZORPAY_KEY_SECRET // Pulled from Env
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Provides Key ID to frontend so it's not hardcoded
app.get('/get-razorpay-key', (req, res) => {
    res.json({ key: process.env.RAZORPAY_KEY_ID });
});

app.post('/create-subscription', async (req, res) => {
    try {
        const subscription = await razorpay.subscriptions.create({
            plan_id: process.env.RAZORPAY_PLAN_ID, // Only this needs updating in Render
            customer_notify: 1,
            total_count: 120, 
            quantity: 1,
        });
        res.json(subscription);
    } catch (error) {
        console.error("Subscription Error:", error);
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

app.post('/send-license', async (req, res) => {
    const { email, licenseKey, subscriptionId } = req.body;
    try {
        await new License({ email, licenseKey, subscriptionId }).save();
        const transporter = nodemailer.createTransport({
            host: 'smtppro.zoho.in',
            port: 465,
            secure: true, 
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS // Zoho App Password
            }
        });
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your AutoFlow License Key',
            text: `Thank you! Your key: ${licenseKey}`
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));