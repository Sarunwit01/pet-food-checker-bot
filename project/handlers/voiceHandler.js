/**
 * voiceHandler.js - ระบบรับคำสั่งด้วยเสียง (Voice Input - Phase 5)
 *
 * รองรับการใช้งานด้วยเสียงครบทั้ง 2 ระดับตามแผนงาน (PLAN.md):
 * - ระดับที่ 1 (Keyboard Voice Typing): ผู้ใช้กดปุ่มไมโครโฟนบนคีย์บอร์ดสมาร์ตโฟน (iOS/Android) แปลงเสียงเป็นข้อความส่งเข้าบอทได้ทันที (ฟรี 100% ไม่ต้องใช้ API เสริม)
 * - ระดับที่ 2 (LINE Audio Message + Gemini Multimodal STT): ผู้ใช้กดอัดคลิปเสียง (Voice Note) ในแชท LINE
 *   ระบบจะดาวน์โหลดไฟล์เสียง (.m4a) จาก LINE Server แล้วส่งให้ Google Gemini 2.5 Flash ถอดความภาษาไทย
 *   จากนั้นนำข้อความที่ถอดได้ไปประมวลผลเช็คอาหาร/ฉุกเฉิน/ภูมิแพ้/คำนวณอาหารต่อทันที!
 */

const { isGeminiConfigured, transcribeAudioWithGemini } = require('../utils/geminiService');
const { handleFoodCheck } = require('./foodHandler');

/**
 * ดาวน์โหลดไฟล์เสียงจาก LINE Content API แล้วแปลงเป็น Base64
 * @param {string} messageId - LINE Message ID ของคลิปเสียง
 * @returns {Promise<{ base64: string, mimeType: string } | null>}
 */
async function downloadLineAudioAsBase64(messageId) {
  const token = process.env.CHANNEL_ACCESS_TOKEN;
  if (!token || token === 'YOUR_CHANNEL_ACCESS_TOKEN' || token === 'your_channel_access_token_here') {
    return null;
  }

  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`⚠️ Failed to download LINE audio (${response.status})`);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'audio/mp4';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return {
      base64,
      mimeType: contentType.includes('audio/') ? contentType.split(';')[0].trim() : 'audio/mp4'
    };
  } catch (err) {
    console.error('⚠️ Error downloading LINE audio content:', err.message);
    return null;
  }
}

/**
 * จัดการ Event เมื่อผู้ใช้ส่งคลิปเสียง (event.message.type === 'audio') เข้ามาใน LINE
 * @param {object} event - LINE Webhook Event
 * @param {string|null} [mockTranscript] - ข้อความจำลองสำหรับการรันเทสต์ในเครื่องโดยไม่ต้องต่อ LINE Server
 * @returns {Promise<object | object[]>} LINE Message(s) สำหรับตอบกลับ
 */
async function handleAudioMessage(event, mockTranscript = null) {
  const userId = event?.source?.userId || 'voice_user';
  const messageId = event?.message?.id;

  let transcript = mockTranscript;

  // หากไม่ได้อยู่ในโหมดจำลองเทสต์ ให้ตรวจสอบคีย์ Gemini และดาวน์โหลดเสียงจาก LINE จริง
  if (!transcript) {
    if (!isGeminiConfigured()) {
      return {
        type: 'text',
        text: '🎙️ ได้รับข้อความเสียงของคุณแล้วครับ!\n\n💡 ตอนนี้ระบบยังไม่ได้เปิดโหมดถอดคลิปเสียงอัตโนมัติ (ต้องใส่ GEMINI_API_KEY ใน .env)\n\n👉 วิธีสั่งงานด้วยเสียงแบบง่ายและเร็วที่สุดตอนนี้:\nกดปุ่ม "รูปไมโครโฟน 🎤 บนแป้นพิมพ์คีย์บอร์ดมือถือ" ของคุณแล้วพูดชื่ออาหารได้เลยครับ มือถือจะพิมพ์เป็นข้อความส่งมาให้ผมเช็คได้ทันทีเลย! 🐾✨'
      };
    }

    const audioData = await downloadLineAudioAsBase64(messageId);
    if (!audioData) {
      return {
        type: 'text',
        text: 'แง ขอโทษทีนะครับ ผมดาวน์โหลดไฟล์เสียงไม่สำเร็จ 🥺 รบกวนลองพูดใหม่อีกครั้ง หรือกดปุ่มรูปไมโครโฟน 🎤 บนแป้นพิมพ์มือถือเพื่อพูดเป็นข้อความแทนได้เลยนะครับ 🐾'
      };
    }

    transcript = await transcribeAudioWithGemini(audioData.base64, audioData.mimeType);
    if (!transcript) {
      return {
        type: 'text',
        text: '🎙️ เมื่อกี้เสียงอาจจะเบาไปนิดนึง ผมฟังไม่ค่อยถนัดเลยครับ 😅 รบกวนลองอัดเสียงพูดชื่ออาหารชัดๆ อีกครั้ง หรือกดปุ่มไมโครโฟน 🎤 บนคีย์บอร์ดมือถือแทนก็ได้นะครับ 🐶🐱'
      };
    }
  }

  // นำข้อความที่ถอดเสียงได้ ไปเข้ากระบวนการตรวจสอบตามปกติ (รองรับทั้งเช็คอาหาร, เตือนฉุกเฉิน, ภูมิแพ้, และคำนวณอาหาร)
  const foodResponse = await handleFoodCheck(transcript, userId);

  const voiceConfirmMessage = {
    type: 'text',
    text: `🎙️ ได้ยินคุณพูดว่า: "${transcript}"\nเดี๋ยวผมเช็คข้อมูลให้เลยนะครับ! 👇`
  };

  if (Array.isArray(foodResponse)) {
    return [voiceConfirmMessage, ...foodResponse];
  }
  return [voiceConfirmMessage, foodResponse];
}

/**
 * สร้างคำแนะนำวิธีใช้งานด้วยเสียง เมื่อผู้ใช้พิมพ์ถาม เช่น "สั่งด้วยเสียงยังไง", "พูดเอาได้ไหม"
 */
function createVoiceGuideMessage() {
  const aiStatus = isGeminiConfigured()
    ? '✅ ตอนนี้เปิดระบบ AI ถอดคลิปเสียงแล้ว! คุณสามารถกดอัดคลิปเสียง (Voice Note) ส่งมาในแชทนี้ได้เลยครับ'
    : 'ℹ️ หากต้องการส่งเป็นคลิปเสียง (Voice Note) โดยตรง สามารถใส่ GEMINI_API_KEY ในไฟล์ .env เพื่อเปิดใช้งานได้ครับ';

  return {
    type: 'text',
    text: `🎙️ คุณสามารถสั่งงานผมด้วยเสียงได้ 2 วิธีเลยครับ!\n\n1️⃣ วิธีแนะนำ (เร็วและแม่นยำที่สุด):\nกดปุ่ม "รูปไมโครโฟน 🎤 บนแป้นพิมพ์คีย์บอร์ดมือถือ" (Voice Typing) แล้วพูดเช่น "หมากินองุ่นได้ไหม" ระบบมือถือจะแปลงเสียงเป็นตัวหนังสือส่งมาให้ทันทีครับ\n\n2️⃣ ส่งเป็นคลิปเสียงใน LINE:\n${aiStatus} 🐾`
  };
}

module.exports = {
  handleAudioMessage,
  createVoiceGuideMessage,
  downloadLineAudioAsBase64
};
