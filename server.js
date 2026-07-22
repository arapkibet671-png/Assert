const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const POCHI_NUMBER = process.env.POCHI_NUMBER || '07XXXXXXXX';

app.use(helmet());

// Apply rate limiter ONLY to form submissions
const applicationLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, 
    max: 15, 
    message: { success: false, message: 'Too many submission attempts. Please wait 10 minutes.' }
});

// Increased JSON body limit to 10mb to handle base64 selfie image uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const applications = {};

// Recognizable Kenyan towns/areas for backend validation
const validKenyanLocations = [
    'nairobi', 'westlands', 'kilimani', 'karen', 'kasarani', 'embakasi', 'kibera', 'dagoretti', 'kamukunji', 'starehe',
    'mombasa', 'nyali', 'likoni', 'changamwe', 'kisauni', 'mvita',
    'kisumu', 'nakuru', 'eldoret', 'thika', 'ruiru', 'kiambu', 'machakos', 'kitengela', 'ngong', 'ongata rongai',
    'naivasha', 'nyeri', 'meru', 'embu', 'kericho', 'kakamega', 'bungoma', 'kitale', 'malindi', 'diani', 'kilifi',
    'machakos', 'makueni', 'kajiado', 'narok', 'bomet', 'kisii', 'homabay', 'migori', 'siaya', 'busia', 'vihiga',
    'nanyuki', 'karatina', 'limuru', 'juja', 'kikuyu', 'athiriver', 'voi', 'garissa', 'isiolo', 'lamu'
];

function aiFraudCheck(data) {
    const { idNumber, mpesaNumber, mpesaNumberConfirm, location } = data;
    if (mpesaNumber !== mpesaNumberConfirm) return { isSuspicious: true, reason: 'Phone numbers mismatch' };
    if (!/^(07|01)[0-9]{8}$/.test(mpesaNumber)) return { isSuspicious: true, reason: 'Invalid Kenyan phone format' };
    if (!/^[0-9]{6,9}$/.test(idNumber)) return { isSuspicious: true, reason: 'Suspicious National ID length' };
    
    // Server-side location verification
    const cleanLoc = (location || '').toLowerCase().trim();
    const isKnownLocation = validKenyanLocations.some(town => cleanLoc.includes(town));
    if (!isKnownLocation) {
        return { isSuspicious: true, reason: 'Unrecognized delivery location in Kenya' };
    }

    const repeatedPattern = /^(\d)\1+$|^12345678$/;
    if (repeatedPattern.test(idNumber) || repeatedPattern.test(mpesaNumber)) {
        return { isSuspicious: true, reason: 'Bot/Dummy numeric sequence detected' };
    }
    return { isSuspicious: false, score: 'LOW RISK' };
}

async function sendTelegramAdminPrompt(appId, details, aiStatus) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    const text = `
🟢 *NEW CREDIT APPLICATION RECEIVED* 🟢
🆔 *Application ID:* \`${appId}\`

📦 *Model:* ${details.product.model}
🏷️ *Category:* ${details.product.category}
💵 *Required Deposit:* KES ${details.amount}

🆔 *National ID:* \`${details.idNumber}\`
📍 *Delivery Location:* ${details.location}
📲 *Verified M-Pesa Line:* \`${details.mpesaNumber}\`
💳 *Payment Wallet:* \`${details.walletNumber}\`
📷 *Selfie Provided:* ${details.selfieDataUrl ? '✅ Yes' : '❌ No'}

🤖 *AI Security Status:* ${aiStatus.isSuspicious ? '⚠️ *HIGH RISK FLAG*' : '🛡️ *VERIFIED SAFE*'}
${aiStatus.isSuspicious ? `❌ *Flag Reason:* ${aiStatus.reason}` : ''}

💰 *Payment Target:* Pochi La Biashara (${POCHI_NUMBER})

⏳ *Action Required:* Has deposit of *KES ${details.amount}* been received? Please Approve.
💡 *Tip:* Reply directly to this message with an item photo to send real product photos to the applicant!
    `;

    const inlineKeyboard = {
        inline_keyboard: [
            [
                { text: '✅ YES APPROVE', callback_data: `approve_${appId}` },
                { text: '❌ REJECT / UNPAID', callback_data: `reject_${appId}` }
            ]
        ]
    };

    // If a selfie photo was uploaded, send it as a photo message to Telegram along with the details caption
    if (details.selfieDataUrl && details.selfieDataUrl.startsWith('data:image')) {
        try {
            const base64Data = details.selfieDataUrl.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');

            const FormData = require('form-data');
            const form = new FormData();
            form.append('chat_id', TELEGRAM_CHAT_ID);
            form.append('photo', buffer, { filename: 'selfie.jpg', contentType: 'image/jpeg' });
            form.append('caption', text);
            form.append('parse_mode', 'Markdown');
            form.append('reply_markup', JSON.stringify(inlineKeyboard));

            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: form
            });
            return;
        } catch (err) {
            console.error('Failed to send selfie photo, falling back to text message:', err);
        }
    }

    // Fallback text message if photo upload fails
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: 'Markdown', reply_markup: inlineKeyboard })
    });
}

// Application Submission Route
app.post('/api/process-credit-app', applicationLimiter, async (req, res) => {
    try {
        const { product, idNumber, location, mpesaNumber, mpesaNumberConfirm, walletNumber, amount, selfieDataUrl } = req.body;
        
        if (!selfieDataUrl) {
            return res.status(400).json({ success: false, message: 'Selfie verification photo is required.' });
        }

        const aiEvaluation = aiFraudCheck({ idNumber, mpesaNumber, mpesaNumberConfirm, location, product });

        if (aiEvaluation.isSuspicious && aiEvaluation.reason.includes('mismatch')) {
            return res.status(400).json({ success: false, message: 'M-Pesa phone numbers do not match.' });
        }

        const appId = 'APP_' + Date.now();
        applications[appId] = { status: 'PENDING', product, idNumber, location, mpesaNumber, walletNumber, amount, selfieDataUrl, aiRisk: aiEvaluation, itemPhotoUrl: null };

        await sendTelegramAdminPrompt(appId, applications[appId], aiEvaluation);
        res.status(200).json({ success: true, appId: appId });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Polling status route
app.get('/api/check-status/:appId', (req, res) => {
    const appData = applications[req.params.appId];
    if (!appData) return res.json({ status: 'PENDING', photoUrl: null });
    res.json({ status: appData.status, photoUrl: appData.itemPhotoUrl });
});

// Telegram Webhook (Handles replies with photos & inline buttons)
app.post('/api/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;

        // 1. Photo uploaded by Admin in Telegram
        if (update.message && update.message.photo && update.message.reply_to_message) {
            const replyText = update.message.reply_to_message.caption || update.message.reply_to_message.text || '';
            const appIdMatch = replyText.match(/APP_\d+/);

            if (appIdMatch) {
                const appId = appIdMatch[0];
                const photos = update.message.photo;
                const fileId = photos[photos.length - 1].file_id;

                const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
                const fileData = await fileRes.json();

                if (fileData.ok) {
                    const filePath = fileData.result.file_path;
                    const fullPhotoUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

                    if (applications[appId]) {
                        applications[appId].itemPhotoUrl = fullPhotoUrl;
                    }

                    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: update.message.chat.id,
                            reply_to_message_id: update.message.message_id,
                            text: `📸 *Photo received!* Sent to applicant view on website.`,
                            parse_mode: 'Markdown'
                        })
                    });
                }
            }
        }

        // 2. Inline approval buttons
        if (update.callback_query) {
            const query = update.callback_query;
            const chatId = query.message.chat.id;
            const messageId = query.message.message_id;
            const [action, appId] = query.data.split('_APP_');
            const fullAppId = 'APP_' + appId;

            const existingCaption = query.message.caption || query.message.text || '';

            if (action === 'approve') {
                if (applications[fullAppId]) applications[fullAppId].status = 'APPROVED';
                
                const updateMethod = query.message.caption ? 'editMessageCaption' : 'editMessageText';
                const bodyObj = { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' };
                if (query.message.caption) bodyObj.caption = `${existingCaption}\n\n✅ *STATUS:* APPROVED & DISPATCHED 🎉`;
                else bodyObj.text = `${existingCaption}\n\n✅ *STATUS:* APPROVED & DISPATCHED 🎉`;

                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${updateMethod}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyObj)
                });
            } else if (action === 'reject') {
                if (applications[fullAppId]) applications[fullAppId].status = 'REJECTED';
                
                const updateMethod = query.message.caption ? 'editMessageCaption' : 'editMessageText';
                const bodyObj = { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' };
                if (query.message.caption) bodyObj.caption = `${existingCaption}\n\n❌ *STATUS:* REJECTED / PAYMENT UNPAID ⚠️`;
                else bodyObj.text = `${existingCaption}\n\n❌ *STATUS:* REJECTED / PAYMENT UNPAID ⚠️`;

                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${updateMethod}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyObj)
                });
            }

            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: query.id })
            });
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('Webhook error:', err);
        res.sendStatus(500);
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
