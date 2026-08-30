# Telegram Bot Alert Integration

## 1. Telegram Service Architecture
The alert service runs asynchronously inside the Node.js backend. When an emergency event (Fall or Gas Leak) occurs, it formats a markdown notification and uploads the snapshot image directly using `multipart/form-data`.

---

## 2. Implementation with Axios & FormData

```javascript
const axios = require('axios');
const FormData = require('form-data');

async function sendTelegramEmergencyAlert(botToken, chatId, { title, details, imageBuffer }) {
  const caption = 
`🚨 *[KHẨN CẤP] CẢNH BÁO TỪ HỆ THỐNG SMART HOME* 🚨

⚠️ *Loại sự cố:* ${title}
🕒 *Thời gian:* ${new Date().toLocaleString('vi-VN')}
📊 *Chi tiết:*
${details}

📍 *Vị trí:* Phòng khách (Khu vực Camera AI)
👉 *Vui lòng kiểm tra ứng dụng hoặc liên hệ ngay!*`;

  try {
    if (imageBuffer) {
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('caption', caption);
      form.append('parse_mode', 'Markdown');
      form.append('photo', imageBuffer, { filename: 'emergency_snapshot.jpg' });

      await axios.post(`https://api.telegram.org/bot${botToken}/sendPhoto`, form, {
        headers: form.getHeaders(),
        timeout: 4000
      });
    } else {
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: caption,
        parse_mode: 'Markdown'
      }, { timeout: 3000 });
    }
    console.log('[TELEGRAM] Emergency alert sent successfully.');
  } catch (error) {
    console.error('[TELEGRAM] Failed to send alert:', error.message);
  }
}

module.exports = { sendTelegramEmergencyAlert };
```

---

## 3. Best Practices
1. **Timeout & Fallback**: Cap request timeout at 4000ms. If `sendPhoto` fails or times out, immediately fall back to text-only `sendMessage`.
2. **Rate Limiting**: Add a 5-second cooldown debounce per event type to prevent spamming the Telegram channel during continuous sensor trigger.
