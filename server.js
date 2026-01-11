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
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: Date.now }
});

const License = mongoose.model('License', LicenseSchema);

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// 1. Serve Homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Create Subscription (LIVE MODE)
app.post('/create-subscription', async (req, res) => {
    try {
        console.log("Attempting to create subscription...");
        const subscription = await razorpay.subscriptions.create({
            // REPLACE THIS with your actual Plan ID from Razorpay LIVE Dashboard
            plan_id: 'plan_YOUR_ACTUAL_LIVE_PLAN_ID', 
            customer_notify: 1,
            total_count: 120, 
            quantity: 1,
        });
        console.log("Subscription Created Successfully:", subscription.id);
        res.json(subscription);
    } catch (error) {
        console.error("RAZORPAY API ERROR:", JSON.stringify(error, null, 2));
        res.status(500).json({ error: "Razorpay rejection", details: error });
    }
});

// 3. Verify Payment
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

// 4. Send & Save License (Updated for Zoho.in with Detailed Logging)
app.post('/send-license', async (req, res) => {
    const { email, licenseKey, subscriptionId } = req.body;
    console.log(`Attempting to save and send key to: ${email}`);

    try {
        // Save to MongoDB
        await new License({ email, licenseKey, subscriptionId }).save();
        console.log("License saved to MongoDB successfully.");
        
        const transporter = nodemailer.createTransport({
            host: 'smtppro.zoho.in', // Ensure this is .com if your account is not .in
            port: 465,
            secure: true, 
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS // MUST be the 16-character App Password
            }
        });

        console.log("Attempting to send email via Zoho...");
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your AutoFlow Plus License Key',
            text: `Thank you for your purchase!\n\nYour License Key: ${licenseKey}\n\nPlease keep this email for your records.`
        });

        console.log("Email sent successfully!");
        res.json({ success: true });
    } catch (error) {
        console.error("CRITICAL ERROR IN SEND-LICENSE ROUTE:");
        console.error(error); 
        res.status(500).json({ success: false, error: error.message });
    }
});

// 5. Validate License (For Desktop App Check)
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
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));