const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Render Environment Variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const POCHI_NUMBER = process.env.POCHI_NUMBER || '07XXXXXXXX';

// ----------------------------------------------------
// SECURITY MIDDLEWARE
// ----------------------------------------------------
app.use(helmet());

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: { success: false, message: 'Too many requests. Please try again later.' }
});
app.use(globalLimiter);

const applicationLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, 
    max: 5, 
    message: { success: false, message: 'Too many submission attempts. Try again in 10 minutes.' }
});

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const applications = {};

// ----------------------------------------------------
// AI FRAUD DETECTOR RULES ENGINE
// ----------------------------------------------------
function aiFraudCheck(data) {
    const { idNumber, mpesaNumber, mpesaNumberConfirm } = data;

    if (mpesaNumber !== mpesaNumberConfirm) return { isSuspicious: true, reason: 'Phone numbers mismatch' };
    if (!/^(07|01)[0-9]{8}$/.test(mpesaNumber)) return { isSuspicious: true, reason: 'Invalid Kenyan phone format' };
    if (!/^[0-9]{6,9}$/.test(idNumber)) return { isSuspicious: true, reason: 'Suspicious National ID length' };
    
    const repeatedPattern = /^(\d)\1+$|^12345678$/;
    if (repeatedPattern.test(idNumber) || repeatedPattern.test(mpesaNumber)) {
        return { isSuspicious: true, reason: 'Bot/Dummy numeric sequence detected' };
    }

    return { isSuspicious: false, score: 'LOW RISK' };
}

// ----------------------------------------------------
// TELEGRAM ADMIN PROMPT
// ----------------------------------------------------
async function sendTelegramAdminPrompt(appId, details, aiStatus) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    const text = `
🟢 *NEW CREDIT APPLICATION RECEIVED* 🟢

📦 *Model:* ${details.product.model}
🏷️ *Category:* ${details.product.category}
💵 *Required Deposit:* KES ${details.amount}

🆔 *National ID:* \`${details.idNumber}\`
📍 *Delivery Location:* ${details.location}
📲 *Verified M-Pesa Line:* \`${details.mpesaNumber}\`

🤖 *AI Security Status:* ${aiStatus.isSuspicious ? '⚠️ *HIGH RISK FLAG*' : '🛡️ *VERIFIED SAFE*'}
${aiStatus.isSuspicious ? `❌ *Flag Reason:* ${aiStatus.reason}` : ''}

💰 *Payment Target:* Pochi La Biashara (${POCHI_NUMBER})

⏳ *Action Required:* Has deposit of *KES ${details.amount}* been received on Pochi? Please Approve.
    `;

    const inlineKeyboard = {
        inline_keyboard: [
            [
                { text: '✅ YES APPROVE', callback_data: `approve_${appId}` },
                { text: '❌ REJECT / UNPAID', callback_data: `reject_${appId}` }
            ]
        ]
    };

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: 'Markdown', reply_markup: inlineKeyboard })
    });
}

// ----------------------------------------------------
// API ENDPOINTS
// ----------------------------------------------------
app.post('/api/process-credit-app', applicationLimiter, async (req, res) => {
    try {
        const { product, idNumber, location, mpesaNumber, mpesaNumberConfirm, amount } = req.body;
        const aiEvaluation = aiFraudCheck({ idNumber, mpesaNumber, mpesaNumberConfirm, location, product });

        if (aiEvaluation.isSuspicious && aiEvaluation.reason.includes('mismatch')) {
            return res.status(400).json({ success: false, message: 'M-Pesa phone numbers do not match.' });
        }

        const appId = 'APP_' + Date.now();
        applications[appId] = { status: 'PENDING', product, idNumber, location, mpesaNumber, amount, aiRisk: aiEvaluation };

        await sendTelegramAdminPrompt(appId, applications[appId], aiEvaluation);
        res.status(200).json({ success: true, appId: appId });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.get('/api/check-status/:appId', (req, res) => {
    const appData = applications[req.params.appId];
    if (!appData) return res.json({ status: 'PENDING' });
    res.json({ status: appData.status });
});

app.post('/api/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;
        if (update.callback_query) {
            const query = update.callback_query;
            const chatId = query.message.chat.id;
            const messageId = query.message.message_id;
            const [action, appId] = query.data.split('_APP_');
            const fullAppId = 'APP_' + appId;

            if (action === 'approve') {
                if (applications[fullAppId]) applications[fullAppId].status = 'APPROVED';
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: `${query.message.text}\n\n✅ *STATUS:* APPROVED & DISPATCHED 🎉`, parse_mode: 'Markdown' })
                });
            } else if (action === 'reject') {
                if (applications[fullAppId]) applications[fullAppId].status = 'REJECTED';
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: `${query.message.text}\n\n❌ *STATUS:* REJECTED / PAYMENT UNPAID ⚠️`, parse_mode: 'Markdown' })
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
        res.sendStatus(500);
    }
});

app.listen(PORT, () => console.log(`🔒 Secure Enterprise Server running on port ${PORT}`));
