const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose'); // Database tool
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
// Connect to MongoDB using the link you added in Render
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB Database'))
    .catch(err => console.error('Database Connection Error:', err));

// Define what a "License" looks like in the database
const LicenseSchema = new mongoose.Schema({
    email: String,
    licenseKey: String,
    subscriptionId: String,
    planId: String,
    status: { type: String, default: 'active' }, // active, cancelled, expired
    createdAt: { type: Date, default: Date.now }
});

const License = mongoose.model('License', LicenseSchema);

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

// 2. Create Subscription
app.post('/create-subscription', async (req, res) => {
    try {
        const subscription = await razorpay.subscriptions.create({
            plan_id: 'plan_YOUR_PLAN_ID_HERE', // <--- PASTE YOUR PLAN ID HERE
            customer_notify: 1,
            total_count: 120, 
            quantity: 1,
        });
        res.json(subscription);
    } catch (error) {
        console.error("Subscription Creation Error:", error);
        res.status(500).send(error);
    }
});

// 3. Verify Payment AND Save License to Database
app.post('/verify-payment', async (req, res) => {
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;

    const data = razorpay_payment_id + "|" + razorpay_subscription_id;

    const generated_signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(data)
        .digest('hex');

    if (generated_signature === razorpay_signature) {
        // Payment is Real! We don't save the user yet, we wait for the /send-license call
        // OR we can just return success here.
        res.json({ success: true, message: "Subscription Verified" });
    } else {
        res.status(400).json({ success: false, message: "Invalid Signature" });
    }
});

// 4. Send License Key & SAVE to Database
app.post('/send-license', async (req, res) => {
    const { email, licenseKey, subscriptionId } = req.body; 
    // Note: You must update index.html to send 'subscriptionId' too!

    // A. Save to Database
    try {
        const newLicense = new License({
            email: email,
            licenseKey: licenseKey,
            subscriptionId: subscriptionId || 'manual_entry', // handle missing sub ID
            status: 'active'
        });
        await newLicense.save();
        console.log("License Saved to Database:", licenseKey);
    } catch (dbError) {
        console.error("Database Save Error:", dbError);
        // We continue sending email even if DB fails, to be safe for the user
    }

    // B. Send Email
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

// 5. NEW ROUTE: Validate License (For your Desktop App to check)
app.post('/validate-license', async (req, res) => {
    const { licenseKey } = req.body;

    try {
        // 1. Find the license in our DB
        const userRecord = await License.findOne({ licenseKey: licenseKey });

        if (!userRecord) {
            return res.json({ valid: false, message: "Key not found" });
        }

        // 2. (Optional) Check Razorpay to see if they are still paying
        // For now, let's just check if we marked them as active
        if (userRecord.status === 'active') {
             // 3. OPTIONAL: Check Real-time status with Razorpay
             // const subStatus = await razorpay.subscriptions.fetch(userRecord.subscriptionId);
             // if(subStatus.status !== 'active') { update DB to cancelled; return false; }

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