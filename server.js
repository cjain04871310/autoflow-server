const express = require('express');
const Razorpay = require('razorpay');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose(); 

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 1. SERVE YOUR WEBSITE
app.use(express.static(path.join(__dirname)));

// 2. SETUP RAZORPAY (Ensure these are your LIVE keys)
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,       
    key_secret: process.env.RAZORPAY_KEY_SECRET   
});

// 3. SETUP DATABASE
const db = new sqlite3.Database('./orders.db', (err) => {
    if (err) console.error("Database error:", err.message);
    else console.log("Connected to the SQLite database.");
});

// Create table if missing
db.run(`CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id TEXT,
    email TEXT,
    contact TEXT,
    license_key TEXT,
    date DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// 4. CREATE ORDER ROUTE
app.post('/create-order', async (req, res) => {
    try {
        const options = {
            amount: 3000, // ₹30
            currency: "INR",
            receipt: "receipt_" + Math.random().toString(36).substring(7),
        };
        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        res.status(500).send(error);
    }
});

// 5. VERIFY PAYMENT & SAVE TO DATABASE
app.post('/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        // Verify Signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', 'tSnygg1qQAYHDJFxL4yrzCrp')
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpay_signature) {
            
            // Get Email from Razorpay
            const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
            const userEmail = paymentDetails.email || "No Email Provided";
            const userContact = paymentDetails.contact || "No Contact";

            // Generate License
            const licenseKey = "AFPLUS-" + Math.random().toString(36).substring(2, 10).toUpperCase();

            // Save to Database
            const stmt = db.prepare("INSERT INTO licenses (payment_id, email, contact, license_key) VALUES (?, ?, ?, ?)");
            stmt.run(razorpay_payment_id, userEmail, userContact, licenseKey, function(err) {
                if (err) return console.error(err.message);
                console.log(`✅ SAVED TO DB: ${userEmail} -> ${licenseKey}`);
            });
            stmt.finalize();

            res.json({ status: "success", license: licenseKey });
        } else {
            res.status(400).json({ status: "failure" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("Error verifying payment");
    }
});

// 7. NEW: VALIDATE LICENSE ENDPOINT (For your Desktop App)
app.post('/validate-license', (req, res) => {
    const { license_key } = req.body; 

    console.log("Checking license:", license_key);

    const stmt = db.prepare("SELECT * FROM licenses WHERE license_key = ?");
    stmt.get(license_key, (err, row) => {
        if (err) {
            res.status(500).json({ valid: false, message: "Server Error" });
        } else if (row) {
            // Found it!
            res.json({ 
                valid: true, 
                email: row.email, 
                purchase_date: row.date 
            });
        } else {
            // Not found
            res.json({ valid: false, message: "Invalid License Key" });
        }
    });
    stmt.finalize();
});

// 6. START SERVER
app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});