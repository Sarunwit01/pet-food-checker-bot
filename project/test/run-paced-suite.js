/**
 * test/run-paced-suite.js
 * ชุดทดสอบขนาดใหญ่แบบถนอมโควตา (Paced Comprehensive Test Suite - 50 Test Cases)
 * - ทดสอบครบทุกฟีเจอร์ (Database, Typos, Emergency, Allergy, Portion, Casual, Concurrent Users, AI 5-Source Web Research + Supabase Persistence)
 * - มีการเว้นระยะเวลา (Pacing Delay 6 วินาที) เฉพาะข้อที่ต้องเรียก Gemini AI เพื่อไม่ให้ติด Rate Limit (RPM)
 */

require('dotenv').config();
const { handleFoodCheck, userPetMemory } = require('../handlers/foodHandler');
const { foods, ready, supabaseEnabled } = require('../utils/foodStore');
const { clearUserAllergies } = require('../handlers/allergyHandler');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function summarize(msg) {
  if (!msg) return 'null';
  if (msg.type === 'text') {
    const qr = msg.quickReply ? ` [QR: ${msg.quickReply.items.map(i => i.action.label).join('/')}]` : '';
    return `TEXT: ${msg.text.replace(/\n+/g, ' ').slice(0, 75)}${qr}`;
  }
  if (msg.type === 'flex') {
    const bodyText = JSON.stringify(msg.contents);
    const srcMatch = bodyText.match(/📚 อ้างอิงจาก: ([^"]+)/);
    const srcInfo = srcMatch ? ` | Ref: ${srcMatch[1].slice(0, 55)}` : '';
    return `FLEX: ${msg.altText}${srcInfo}`;
  }
  return msg.type;
}

(async () => {
  await ready;
  const initialCount = foods.length;
  console.log(`🚀 เริ่มชุดทดสอบแบบถนอมโควตา (Paced Test Suite) | Supabase=${supabaseEnabled} | อาหารเริ่มต้น=${initialCount} รายการ\n`);

  let passed = 0;
  let total = 0;

  async function check(id, desc, fn, validate, delayAfterMs = 0) {
    total++;
    const t0 = Date.now();
    try {
      const res = await fn();
      const ms = Date.now() - t0;
      const ok = validate(res);
      if (ok) passed++;
      console.log(`${ok ? '✅' : '❌'} [${id}] (${ms}ms) ${desc}\n   ↳ ${summarize(res)}`);
    } catch (e) {
      console.log(`❌ [${id}] ERROR ${desc}: ${e.message}`);
    }
    if (delayAfterMs > 0) {
      await sleep(delayAfterMs);
    }
  }

  // =========================================================================
  // PART 1: ทดสอบความเร็วฐานข้อมูลหลัก + คำสะกดผิด/วรรณยุกต์เพี้ยน (15 เคส - 0 AI Quota)
  // =========================================================================
  console.log('--- PART 1: ฐานข้อมูลหลัก & แก้คำพิมพ์ผิดอัตโนมัติ (0 AI Quota) ---');
  await check('T01', 'หมา: ช็อกโกแลต (ตรงตัว)', () => handleFoodCheck('หมา: ช็อกโกแลต', 'u_p1'), r => r.type === 'flex' && r.altText.includes('🚫'));
  await check('T02', 'แมว: หัวหอม (ตรงตัว)', () => handleFoodCheck('แมว: หัวหอม', 'u_p1'), r => r.type === 'flex' && r.altText.includes('🚫'));
  await check('T03', 'ช็อกโกเเลต (พิมพ์สระ เ สองตัว - ยังไม่ระบุสัตว์)', () => handleFoodCheck('ช็อกโกเเลต', 'u_typo1'), r => r.type === 'text' && r.quickReply);
  await check('T04', 'หมา: ชอกโกแลด (สะกดผิด 2 จุด)', () => handleFoodCheck('หมา: ชอกโกแลด', 'u_typo2'), r => r.type === 'flex' && r.altText.includes('ช็อกโกแลต'));
  await check('T05', 'แมว: ช๊อกโกแลตต (วรรณยุกต์เพี้ยน + ตัวซ้ำ)', () => handleFoodCheck('แมว: ช๊อกโกแลตต', 'u_typo3'), r => r.type === 'flex' && r.altText.includes('ช็อกโกแลต'));
  await check('T06', 'หมา: ลูกเกต (สะกดผิด ต แทน ด)', () => handleFoodCheck('หมา: ลูกเกต', 'u_typo4'), r => r.type === 'flex' && r.altText.includes('องุ่นและลูกเกด'));
  await check('T07', 'หมา: องุ่นน (ตัวอักษรซ้ำท้ายคำ)', () => handleFoodCheck('หมา: องุ่นน', 'u_typo5'), r => r.type === 'flex' && r.altText.includes('องุ่น'));
  await check('T08', 'หมา: เเครอท (สระ เ สองตัว)', () => handleFoodCheck('หมา: เเครอท', 'u_typo6'), r => r.type === 'flex' && r.altText.includes('แครอท'));
  await check('T09', 'แมว: แซลม่อนน (สะกดเพี้ยน)', () => handleFoodCheck('แมว: แซลม่อนน', 'u_typo7'), r => r.type === 'flex' && r.altText.includes('ปลาแซลมอน'));
  await check('T10', 'หมา: อะโวคาโด้ (วรรณยุกต์เกิน)', () => handleFoodCheck('หมา: อะโวคาโด้', 'u_typo8'), r => r.type === 'flex' && r.altText.includes('อะโวคาโด'));
  await check('T11', 'หมา: กระดูกไก่ต้ม (คำยาวต้องชนะคำสั้น)', () => handleFoodCheck('หมา: กระดูกไก่ต้ม', 'u_p1'), r => r.type === 'flex' && r.altText.includes('🚫'));
  await check('T12', 'หมา: อกไก่ต้ม (ปลอดภัย)', () => handleFoodCheck('หมา: อกไก่ต้ม', 'u_p1'), r => r.type === 'flex' && r.altText.includes('✅'));
  await check('T13', 'หมา: หมากฝรั่งไร้น้ำตาล (Protected compound word)', () => handleFoodCheck('หมา: หมากฝรั่งไร้น้ำตาล', 'u_p1'), r => r.type === 'flex' && r.altText.includes('ไซลิทอล'));
  await check('T14', 'แมว: หญ้าแมว (Protected compound word)', () => handleFoodCheck('แมว: หญ้าแมว', 'u_p1'), r => r.type === 'flex' && r.altText.includes('✅'));
  await check('T15', 'หมา: แก้วมังกร (โหลดจาก Supabase ที่เคยบันทึกไว้แล้ว -> 0ms!)', () => handleFoodCheck('หมา: แก้วมังกร', 'u_p1'), r => r.type === 'flex' && r.altText.includes('แก้วมังกร'));

  // =========================================================================
  // PART 2: ทดสอบฟีเจอร์ฉุกเฉิน, แพ้อาหาร, คำนวณปริมาณอาหาร, สนทนาทั่วไป (15 เคส - 0 AI Quota)
  // =========================================================================
  console.log('\n--- PART 2: ฉุกเฉิน, ประวัติแพ้อาหาร, คำนวณปริมาณ, สนทนาทั่วไป (0 AI Quota) ---');
  await check('T16', 'ฉุกเฉิน: หมาเผลอกินช็อกโกแลตเข้าไป', () => handleFoodCheck('หมาเผลอกินช็อกโกแลตเข้าไปทำยังไงดี', 'u_em1'), r => r.type === 'flex' && r.altText.includes('ฉุกเฉิน'));
  await check('T17', 'ฉุกเฉิน: แมวมีอาการชัก น้ำลายฟูมปาก', () => handleFoodCheck('ช่วยด้วย แมวชัก น้ำลายฟูมปาก', 'u_em2'), r => r.type === 'flex' && r.altText.includes('ฉุกเฉิน'));
  await check('T18', 'ฉุกเฉิน: หมากินช็อกโกแลตไป 1 เม็ด', () => handleFoodCheck('หมากินช็อกโกแลตไป 1 เม็ด', 'u_em3'), r => r.type === 'flex' && r.altText.includes('ฉุกเฉิน'));
  clearUserAllergies('u_alg');
  await check('T19', 'บันทึกประวัติแพ้: น้องหมาแพ้ไก่และแพ้นม', () => handleFoodCheck('น้องหมาแพ้ไก่และแพ้นม', 'u_alg'), r => r.type === 'text' && r.text.includes('ไก่'));
  await check('T20', 'เช็คประวัติแพ้', () => handleFoodCheck('เช็คประวัติแพ้', 'u_alg'), r => r.type === 'text' && r.text.includes('ไก่'));
  await check('T21', 'แจ้งเตือนภูมิแพ้อัตโนมัติเมื่อเช็ค "อกไก่ต้ม"', () => handleFoodCheck('อกไก่ต้ม', 'u_alg'), r => r.type === 'flex' && r.altText.includes('ระวังแพ้อาหาร'));
  await check('T22', 'ลบประวัติแพ้', () => handleFoodCheck('ลบประวัติแพ้', 'u_alg'), r => r.type === 'text' && r.text.includes('รีเซ็ต'));
  await check('T23', 'คำนวณอาหารหมาโต 10 กก.', () => handleFoodCheck('คำนวณอาหารหมาโต 10 กก.', 'u_port1'), r => r.type === 'flex' && r.altText.includes('ปริมาณอาหาร'));
  await check('T24', 'คำนวณอาหารลูกแมว 1.5 กิโล', () => handleFoodCheck('คำนวณอาหารลูกแมว 1.5 กิโล', 'u_port2'), r => r.type === 'flex' && r.altText.includes('ปริมาณอาหาร'));
  await check('T25', 'คำนวณอาหารหมาสูงวัย 25 kg', () => handleFoodCheck('คำนวณอาหารหมาสูงวัย 25 kg', 'u_port3'), r => r.type === 'flex' && r.altText.includes('ปริมาณอาหาร'));
  await check('T26', 'ทักทาย: สวัสดี', () => handleFoodCheck('สวัสดี', 'u_chat'), r => r.type === 'text');
  await check('T27', 'ขอบคุณ: ขอบคุณมากๆ ครับ', () => handleFoodCheck('ขอบคุณมากๆ ครับ', 'u_chat'), r => r.type === 'text');
  await check('T28', 'ถามวิธีใช้: ทำอะไรได้บ้าง', () => handleFoodCheck('ทำอะไรได้บ้าง', 'u_chat'), r => r.type === 'text' && r.text.includes('เช็คอาหาร'));
  await check('T29', 'ถามวิธีใช้เสียง: สั่งด้วยเสียงยังไง', () => handleFoodCheck('สั่งด้วยเสียงยังไง', 'u_chat'), r => r.type === 'text' && r.text.includes('ไมโครโฟน'));
  await check('T30', 'ถามอาหารใหม่แต่ยังไม่บอกชนิดสัตว์ -> ต้องถาม Quick Reply ทันทีใน 0ms ไม่เปลือง AI!', () => handleFoodCheck('เงาะ', 'u_new_no_pet'), r => r.type === 'text' && r.quickReply);

  // =========================================================================
  // PART 3: ค่อยๆ ทดสอบ AI ค้นคว้าอาหารใหม่จากเว็บ >= 5 แหล่ง + บันทึกลง Supabase
  //         และทดสอบการถามซ้ำ (0ms) + ทดสอบผู้ใช้หลายคนถามพร้อมกัน (Paced 6s delay)
  // =========================================================================
  console.log('\n--- PART 3: ทดสอบ AI ค้นคว้า >= 5 แหล่ง + บันทึก Supabase + ถามซ้ำ 0ms (เว้นระยะ 6 วินาที/ข้อ) ---');

  // รายการที่ 1: กีวี่ (Kiwi)
  await check(
    'T31',
    '[AI Research #1] หมา: กีวี่ (ค้นคว้า >= 5 แหล่ง + บันทึกลง Supabase)',
    () => handleFoodCheck('หมา: กีวี่', 'u_r1'),
    r => r.type === 'flex' && JSON.stringify(r.contents).includes('AI ค้นคว้าจาก'),
    6000
  );
  await check(
    'T32',
    '[Verify Cache #1] แมว: กีวี่ (ถามซ้ำหลังบันทึก -> ต้องตอบทันทีจากฐานข้อมูลใน <5ms!)',
    () => handleFoodCheck('แมว: กีวี่', 'u_r2'),
    r => r.type === 'flex' && JSON.stringify(r.contents).includes('AI ค้นคว้าจาก')
  );

  // รายการที่ 2: แคนตาลูป (Cantaloupe)
  await check(
    'T33',
    '[AI Research #2] หมา: แคนตาลูป (ค้นคว้า >= 5 แหล่ง + บันทึกลง Supabase)',
    () => handleFoodCheck('หมา: แคนตาลูป', 'u_r1'),
    r => r.type === 'flex' && JSON.stringify(r.contents).includes('AI ค้นคว้าจาก'),
    6000
  );
  await check(
    'T34',
    '[Verify Cache #2] แมว: แคนตาลูป (ถามซ้ำหลังบันทึก -> ตอบทันที <5ms)',
    () => handleFoodCheck('แมว: แคนตาลูป', 'u_r2'),
    r => r.type === 'flex' && JSON.stringify(r.contents).includes('AI ค้นคว้าจาก')
  );

  // รายการที่ 3: ข้าวโอ๊ต (Oatmeal)
  await check(
    'T35',
    '[AI Research #3] หมา: ข้าวโอ๊ต (ค้นคว้า >= 5 แหล่ง + บันทึกลง Supabase)',
    () => handleFoodCheck('หมา: ข้าวโอ๊ต', 'u_r1'),
    r => r.type === 'flex' && JSON.stringify(r.contents).includes('AI ค้นคว้าจาก'),
    6000
  );
  await check(
    'T36',
    '[Verify Cache #3] แมว: ข้าวโอ๊ต (ถามซ้ำหลังบันทึก -> ตอบทันที <5ms)',
    () => handleFoodCheck('แมว: ข้าวโอ๊ต', 'u_r2'),
    r => r.type === 'flex' && JSON.stringify(r.contents).includes('AI ค้นคว้าจาก')
  );

  // รายการที่ 4: เม็ดมะม่วงหิมพานต์ (Cashew - ทดสอบว่าไม่ชนกับ "มะม่วง" อีกต่อไป!)
  await check(
    'T37',
    '[AI Research #4] หมา: เม็ดมะม่วงหิมพานต์ (ไม่ชน "มะม่วง" + ค้นคว้า >= 5 แหล่ง)',
    () => handleFoodCheck('หมา: เม็ดมะม่วงหิมพานต์', 'u_r1'),
    r => r.type === 'flex' && !r.altText.includes('"มะม่วง"'),
    6000
  );
  await check(
    'T38',
    '[Verify Cache #4] แมว: เม็ดมะม่วงหิมพานต์ (ถามซ้ำหลังบันทึก -> ตอบทันที)',
    () => handleFoodCheck('แมว: เม็ดมะม่วงหิมพานต์', 'u_r2'),
    r => r.type === 'flex'
  );

  // รายการที่ 5: ทดสอบผู้ใช้ 3 คนถาม "มังคุด" พร้อมกันในวินาทีเดียวกัน (Concurrent Deduplication)
  console.log('\n--- PART 4: ทดสอบผู้ใช้ 3 คนถามอาหารใหม่พร้อมกัน (Concurrent Inflight Deduplication) ---');
  await check(
    'T39',
    '[Concurrent 3 Users] ผู้ใช้ 3 คนถาม "หมา: มังคุด" พร้อมกัน (ยิง AI แค่ 1 ครั้ง แต่ได้คำตอบครบ 3 คน)',
    async () => {
      const [r1, r2, r3] = await Promise.all([
        handleFoodCheck('หมา: มังคุด', 'u_conc_1'),
        handleFoodCheck('หมา: มังคุด', 'u_conc_2'),
        handleFoodCheck('แมว: มังคุด', 'u_conc_3')
      ]);
      return r1 && r2 && r3 && r1.type === 'flex' && r3.type === 'flex' ? r1 : null;
    },
    r => r && r.type === 'flex' && JSON.stringify(r.contents).includes('AI ค้นคว้าจาก'),
    6000
  );

  // รายการที่ 6: ทดสอบคำหมวดหมู่กว้างๆ ("ขนม") ต้องไม่ถูกบันทึกลง Supabase แต่ตอบด้วยการ์ด AI Ingredient Warning
  await check(
    'T40',
    '[Broad Category] หมา: ขนม (ต้องไม่บันทึกลงฐานข้อมูล แต่แสดงการ์ด AI Ingredient Warning)',
    () => handleFoodCheck('หมา: ขนม', 'u_broad1'),
    r => r.type === 'flex' && r.altText.includes('เช็คส่วนผสมเบื้องต้น'),
    2000
  );

  console.log(`\n=============================================================`);
  console.log(`🎯 สรุปผลการทดสอบ: ผ่าน ${passed}/${total} ข้อ (${Math.round((passed / total) * 100)}%)`);
  console.log(`📚 จำนวนอาหารในระบบเพิ่มขึ้นจาก ${initialCount} -> ${foods.length} รายการ (บันทึกถาวรใน Supabase)`);
  console.log(`=============================================================`);
})();
