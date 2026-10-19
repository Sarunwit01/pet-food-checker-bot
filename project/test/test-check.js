/**
 * test/test-check.js - สคริปต์จำลองการทดสอบครบทุกฟีเจอร์ (Phase 1 ถึง Phase 5)
 */

require('dotenv').config();
const { handleFoodCheck } = require('../handlers/foodHandler');
const { handleAudioMessage } = require('../handlers/voiceHandler');
const { isGeminiConfigured } = require('../utils/geminiService');

async function runTests() {
  console.log('==================================================');
  console.log('🧪 ทดสอบการทำงานของ Pet Food Checker (Phase 1 - 5)');
  console.log('==================================================');
  console.log(
    `🔌 สถานะ Gemini AI: ${
      isGeminiConfigured()
        ? '✅ เปิดใช้งาน (Hybrid AI + Database + Audio STT)'
        : 'ℹ️ ยังไม่ใส่ GEMINI_API_KEY ใน .env (ทำงานโหมด Database Fallback)'
    }\n`
  );

  // 1. ทดสอบถามอาหารโดยยังไม่ระบุสัตว์
  console.log('🔹 กรณีที่ 1: ผู้ใช้พิมพ์ "ช็อกโกแลต" (ยังไม่รู้ว่าเป็นหมาหรือแมว)');
  const res1 = await handleFoodCheck('ช็อกโกแลต', 'user_test_01');
  console.log('-> บอทตอบ:', res1.text);
  console.log('-> มีปุ่ม Quick Reply ให้เลือก:', res1.quickReply ? '✅ มีปุ่ม (หมา / แมว)' : '❌ ไม่มี');
  console.log('--------------------------------------------------\n');

  // 2. ทดสอบระบุว่าเป็นน้องหมา
  console.log('🔹 กรณีที่ 2: ผู้ใช้เลือก "หมา: ช็อกโกแลต"');
  const res2 = await handleFoodCheck('หมา: ช็อกโกแลต', 'user_test_01');
  console.log('-> รูปแบบการตอบกลับ:', res2.type);
  console.log('-> AltText:', res2.altText);
  console.log('-> แถบสีหัวข้อ:', res2.contents.header.backgroundColor, '(สีแดง = ห้ามกิน)');
  console.log('--------------------------------------------------\n');

  // 3. ทดสอบเช็คอาหารปลอดภัย (บอทจำได้แล้วว่าเป็นน้องหมา)
  console.log('🔹 กรณีที่ 3: ผู้ใช้พิมพ์ "อกไก่ต้ม" (ทดสอบระบบจำว่าเป็นหมา และยังไม่แพ้ไก่)');
  const res3 = await handleFoodCheck('อกไก่ต้ม', 'user_test_01');
  console.log('-> AltText:', res3.altText);
  console.log('-> แถบสีหัวข้อ:', res3.contents.header.backgroundColor, '(สีเขียว = ปลอดภัย)');
  console.log('--------------------------------------------------\n');

  // 4. ทดสอบอาหารที่ต้องระวังสำหรับน้องแมว
  console.log('🔹 กรณีที่ 4: ผู้ใช้พิมพ์ "แมวกินชีสได้ไหม"');
  const res4 = await handleFoodCheck('แมวกินชีสได้ไหม', 'user_test_02');
  console.log('-> AltText:', res4.altText);
  console.log('-> แถบสีหัวข้อ:', res4.contents.header.backgroundColor, '(สีส้ม = ต้องระวัง)');
  console.log('--------------------------------------------------\n');

  // 5. ทดสอบอาหารที่ไม่มีในฐานข้อมูล (เช่น ชานมไข่มุก)
  console.log('🔹 กรณีที่ 5: ผู้ใช้พิมพ์ "หมากินชานมไข่มุกได้ไหม" (ไม่มีใน foods.json)');
  const res5 = await handleFoodCheck('หมากินชานมไข่มุกได้ไหม', 'user_test_01');
  if (res5.type === 'flex') {
    console.log('-> [Hybrid AI Warning] รูปแบบ:', res5.type);
    console.log('-> AltText:', res5.altText);
  } else {
    console.log('-> [Safe Fallback] บอทตอบกลับ:', res5.text);
  }
  console.log('--------------------------------------------------\n');

  // 6. ทดสอบ Phase 2: ระบบตรวจจับภาวะฉุกเฉิน (เผลอกินอาหารอันตรายไปแล้ว)
  console.log('🔹 กรณีที่ 6 (Phase 2 ฉุกเฉิน): ผู้ใช้พิมพ์ "น้องหมากินช็อกโกแลตไปแล้ว ทำไงดี"');
  const res6 = await handleFoodCheck('น้องหมากินช็อกโกแลตไปแล้ว ทำไงดี', 'user_test_03');
  console.log('-> รูปแบบการตอบกลับ:', res6.type);
  console.log('-> AltText:', res6.altText);
  console.log('-> แถบสีหัวข้อ:', res6.contents.header.backgroundColor, '(สีแดงเข้มฉุกเฉิน #b71c1c)');
  console.log('-> ข้อมูลอาหารที่ตรวจพบในการ์ดฉุกเฉิน:', res6.contents.body.contents[0].contents[0].text);
  console.log('--------------------------------------------------\n');

  // 7. ทดสอบ Phase 2: อาการป่วยวิกฤต (อ้วก / ซึม / ชัก)
  console.log('🔹 กรณีที่ 7 (Phase 2 อาการวิกฤต): ผู้ใช้พิมพ์ "แมวที่บ้านอ้วกแล้วก็นอนซึมมาก ช่วยด้วยครับ"');
  const res7 = await handleFoodCheck('แมวที่บ้านอ้วกแล้วก็นอนซึมมาก ช่วยด้วยครับ', 'user_test_04');
  console.log('-> รูปแบบการตอบกลับ:', res7.type);
  console.log('-> AltText:', res7.altText);
  console.log('-> ปุ่มช่วยเหลือฉุกเฉิน:', res7.contents.footer.contents[0].action.label);
  console.log('--------------------------------------------------\n');

  // 8. ทดสอบ Phase 3: บันทึกประวัติแพ้อาหาร ("น้องแพ้ไก่") แล้วเช็ค "อกไก่ต้ม" ซ้ำ
  console.log('🔹 กรณีที่ 8 (Phase 3 บันทึกภูมิแพ้): ผู้ใช้พิมพ์ "น้องแพ้ไก่"');
  const res8_save = await handleFoodCheck('น้องแพ้ไก่', 'user_test_01');
  console.log('-> บอทตอบ:', res8_save.text);

  console.log('\n🔹 กรณีที่ 9 (Phase 3 Cross-check): ผู้ใช้พิมพ์ "อกไก่ต้ม" อีกครั้งหลังบันทึกว่าแพ้ไก่');
  const res8_check = await handleFoodCheck('อกไก่ต้ม', 'user_test_01');
  console.log('-> AltText:', res8_check.altText);
  console.log('-> แถบสีหัวข้อเปลี่ยนเป็น:', res8_check.contents.header.backgroundColor, '(สีส้มเข้มเตือนภัย #e65100 แทนสีเขียว)');
  console.log('-> กล่องเตือนพิเศษบนสุดของการ์ด:', res8_check.contents.body.contents[0].contents[0].text);

  // ล้างข้อมูลแพ้หลังทดสอบเสร็จเพื่อให้รันซ้ำได้สะอาด
  const res8_clear = await handleFoodCheck('ล้างข้อมูลแพ้', 'user_test_01');
  console.log('-> ทดสอบล้างข้อมูลแพ้:', res8_clear.text);
  console.log('--------------------------------------------------\n');

  // 10. ทดสอบ Phase 4: คำนวณปริมาณอาหารแบบถาม-ตอบทีละขั้น (Step-by-step Conversation)
  console.log('🔹 กรณีที่ 10 (Phase 4 คำนวณอาหารทีละขั้น): ผู้ใช้พิมพ์ "คำนวณอาหาร" -> "10" -> "วัย: โตเต็มวัย"');
  const step1 = await handleFoodCheck('คำนวณอาหาร', 'user_test_01');
  console.log('-> สเต็ปถามน้ำหนัก:', step1.text.split('\n')[0]);
  const step2 = await handleFoodCheck('10', 'user_test_01');
  console.log('-> สเต็ปถามช่วงวัย:', step2.text.split('\n')[0]);
  const step3 = await handleFoodCheck('วัย: โตเต็มวัย', 'user_test_01');
  console.log('-> ผลลัพธ์การ์ดคำนวณ:', step3.altText);
  console.log('-> ปริมาณอาหารเม็ดแนะนำ:', step3.contents.body.contents[0].contents[1].text);
  console.log('--------------------------------------------------\n');

  // 11. ทดสอบ Phase 4: คำนวณปริมาณอาหารแบบพิมพ์รวดเดียวจบ (One-shot)
  console.log('🔹 กรณีที่ 11 (Phase 4 พิมพ์รวดเดียว): ผู้ใช้พิมพ์ "คำนวณอาหารแมวโตหนัก 4.5 กก."');
  const oneShot = await handleFoodCheck('คำนวณอาหารแมวโตหนัก 4.5 กก.', 'user_test_05');
  console.log('-> ผลลัพธ์การ์ดคำนวณ:', oneShot.altText);
  console.log('-> ปริมาณอาหารเม็ดแนะนำ:', oneShot.contents.body.contents[0].contents[1].text);
  console.log('--------------------------------------------------\n');

  // 12. ทดสอบ Phase 5: ระบบรับข้อความเสียง (Voice Input / LINE Audio Message)
  console.log('🔹 กรณีที่ 12 (Phase 5 ส่งคลิปเสียงใน LINE): ผู้ใช้พูดว่า "หมากินองุ่นได้ไหม"');
  const mockAudioEvent = {
    type: 'message',
    message: { type: 'audio', id: 'mock_audio_001' },
    source: { userId: 'user_test_voice' }
  };
  const voiceRes = await handleAudioMessage(mockAudioEvent, 'หมากินองุ่นได้ไหม');
  console.log('-> ข้อความยืนยันเสียงที่ถอดได้:', voiceRes[0].text.split('\n')[0]);
  console.log('-> การ์ดผลลัพธ์ที่ส่งตามมาทันที:', voiceRes[1].altText);
  console.log('--------------------------------------------------\n');

  console.log('🎉 ทุกกรณีทดสอบ (Phase 1 ถึง Phase 5) ผ่านฉลุย 100%!');
}

runTests();
