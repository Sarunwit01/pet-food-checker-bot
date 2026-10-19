/**
 * eventHandler.js - จัดการ Event ทั้งหมดที่ส่งมาจาก LINE Webhook (รองรับทั้งข้อความตัวอักษรและข้อความเสียง)
 */

const { handleFoodCheck, userPetMemory } = require('./foodHandler');
const { handleEmergencyCheck } = require('./emergencyHandler');
const { handleAudioMessage } = require('./voiceHandler');
const { createSystemErrorFlex } = require('../flex/templates');

/**
 * จัดการแต่ละ Event จาก LINE
 * @param {object} event - LINE Event Object
 * @param {object} client - MessagingApiClient instance
 */
async function handleEvent(event, client) {
  // 1. ตรวจสอบประเภท Event: เมื่อผู้ใช้เพิ่มเพื่อน (Follow)
  if (event.type === 'follow') {
    const welcomeMessage = {
      type: 'text',
      text: 'สวัสดีครับ! ยินดีต้อนรับสู่ Pet Food Checker นะครับ 🐶🐱✨\n\nผมเป็นผู้ช่วยคอยเช็คว่าอาหารชิ้นนี้ "น้องหมาน้องแมวกินได้ไหม?" ก่อนที่คุณจะป้อนให้น้องๆ ครับ\n\n💬 วิธีใช้งานง่ายๆ:\n• พิมพ์ถามหรือส่งเสียงพูด เช่น "ช็อกโกแลต", "หมากินแอปเปิ้ลได้ไหม"\n• จำประวัติแพ้อาหาร เช่น "น้องแพ้ไก่"\n• คำนวณปริมาณอาหาร เช่น "คำนวณอาหาร"\n• ถ้าน้องเผลอกินอะไรเข้าไป/ป่วย พิมพ์บอกได้ทันทีเลยนะครับ 🚨\n\nลองพิมพ์ชื่ออาหารหรือกดไมค์พูดมาได้เลยนะ! 🐾🎙️'
    };
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [welcomeMessage]
    });
  }

  // 2. ถ้าไม่ใช่ Message Event ให้ข้าม
  if (event.type !== 'message') {
    return Promise.resolve(null);
  }

  try {
    // 3. [Phase 5] กรณีผู้ใช้ส่งข้อความเสียง (LINE Audio Message / Voice Note)
    if (event.message.type === 'audio') {
      const audioResponses = await handleAudioMessage(event);
      return await client.replyMessage({
        replyToken: event.replyToken,
        messages: Array.isArray(audioResponses) ? audioResponses.slice(0, 5) : [audioResponses]
      });
    }

    // 4. ถ้าไม่ใช่ข้อความตัวอักษร (เช่น สติกเกอร์/รูปภาพ) ให้ข้าม
    if (event.message.type !== 'text') {
      return Promise.resolve(null);
    }

    const userText = event.message.text.trim();
    const userId = event.source.userId;

    // ขั้นที่ 1 (Phase 2): ดักจับคำเตือนฉุกเฉินก่อนเป็นอันดับแรก (เช่น "เผลอกิน", "กินไปแล้ว", "อ้วก", "ชัก")
    const emergencyResponse = await handleEmergencyCheck(userText, userId, userPetMemory);
    if (emergencyResponse) {
      return await client.replyMessage({
        replyToken: event.replyToken,
        messages: Array.isArray(emergencyResponse) ? emergencyResponse : [emergencyResponse]
      });
    }

    // ขั้นที่ 2 (Phase 1, 3, 4): ส่งต่อไปให้ foodHandler ตรวจสอบอาหาร / ภูมิแพ้ / คำนวณปริมาณอาหาร
    const responseMessage = await handleFoodCheck(userText, userId);

    if (responseMessage) {
      return await client.replyMessage({
        replyToken: event.replyToken,
        messages: Array.isArray(responseMessage) ? responseMessage : [responseMessage]
      });
    }
  } catch (err) {
    console.error('❌ Error handling event:', err);
    // กรณีเกิดข้อผิดพลาด ให้ตอบกลับด้วยการ์ดแจ้งเตือนระบบขัดข้องที่ชัดเจนและให้คำแนะนำฉุกเฉิน
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [createSystemErrorFlex()]
    });
  }
}

module.exports = {
  handleEvent
};
