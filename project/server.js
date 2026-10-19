/**
 * server.js - จุดเริ่มต้นของระบบ Pet Food Checker LINE Bot
 */

require('dotenv').config();
const express = require('express');
const { messagingApi, middleware } = require('@line/bot-sdk');
const { handleEvent } = require('./handlers/eventHandler');
const { isGeminiConfigured } = require('./utils/geminiService');

const app = express();
const port = process.env.PORT || 3000;

// ตรวจสอบ Environment Variables เบื้องต้น
const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN;
const channelSecret = process.env.CHANNEL_SECRET;

if (!channelAccessToken || !channelSecret || channelAccessToken === 'YOUR_CHANNEL_ACCESS_TOKEN') {
  console.warn('\n⚠️ [คำเตือน] ยังไม่ได้ใส่ CHANNEL_ACCESS_TOKEN หรือ CHANNEL_SECRET ในไฟล์ .env');
  console.warn('⚠️ บอทจะยังไม่สามารถเชื่อมต่อกับ LINE ได้จริง จนกว่าจะนำค่าจาก LINE Developers Console มาใส่\n');
}

if (isGeminiConfigured()) {
  console.log('🤖 [Hybrid Mode] เชื่อมต่อ Google Gemini API เรียบร้อยแล้ว (AI + Verified Database)');
} else {
  console.log('ℹ️ [Database Mode] ยังไม่ได้ตั้งค่า GEMINI_API_KEY — ระบบทำงานด้วยฐานข้อมูล foods.json (ใส่คีย์ใน .env เพื่อเปิดโหมด Hybrid AI)');
}

// การตั้งค่า LINE SDK
const lineConfig = {
  channelSecret: channelSecret || 'dummy_secret'
};

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: channelAccessToken || 'dummy_token'
});

// 1. หน้าแรกสำหรับตรวจสอบสถานะ Server (Health check)
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    project: 'Pet Food Checker (LINE Bot MVP - IE414)',
    message: 'Server is running normally! 🐾',
    webhookEndpoint: '/webhook'
  });
});

// 2. Webhook Endpoint สำหรับรับ Event จาก LINE
// ข้อควรระวัง: middleware(lineConfig) ต้องอยู่ก่อน body parser ใดๆ เพื่อคำนวณ Signature ตรวจสอบความถูกต้อง
app.post('/webhook', middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events;
    if (!events || events.length === 0) {
      return res.status(200).send('OK');
    }

    // ประมวลผลทุก Event ที่ส่งเข้ามา
    await Promise.all(events.map(event => handleEvent(event, client)));
    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Webhook error:', err);
    res.status(500).end();
  }
});

// เริ่มรัน Server
app.listen(port, () => {
  console.log(`===============================================`);
  console.log(`🐾 Pet Food Checker Server กำลังทำงานที่พอร์ต: ${port}`);
  console.log(`🌐 Local URL: http://localhost:${port}`);
  console.log(`📡 Webhook URL: http://localhost:${port}/webhook`);
  console.log(`===============================================`);
});
