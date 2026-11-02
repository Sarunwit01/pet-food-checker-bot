require('dotenv').config();
const { handleFoodCheck } = require('../handlers/foodHandler');
const { ready } = require('../utils/foodStore');
const { normalizeThaiTypos } = require('../utils/thaiTypoNormalizer');

(async () => {
  await ready;

  console.log('🔎 ทดสอบ normalizeThaiTypos กับคำที่พิมพ์สระซ้อน:');
  console.log('   "หมายถุึงคำไนึง" ->', normalizeThaiTypos('หมายถุึงคำไนึง'));

  const cases = [
    // 1. พิมพ์ผิดแบบนิ้วเบียดแป้นพิมพ์ & คำถามภาษาพูดเพี้ยน
    { q: 'น้อนหทมากอนช็อคโกแล็คได้ไหท', uid: 'ut1', expect: 'ช็อกโกแลต' },
    { q: 'น้องเเมวกินองุ่นนไเ้ไหม', uid: 'ut2', expect: 'องุ่นและลูกเกด' },
    { q: 'หมสกินลูกเกตได้ปะ', uid: 'ut3', expect: 'องุ่นและลูกเกด' },
    { q: 'ฟมากินเเครอทได้ไม๊', uid: 'ut4', expect: 'แครอท' },
    { q: 'สุนักทานอะโวคาโด้ได้มัย', uid: 'ut5', expect: 'อะโวคาโด' },

    // 2. สะกดตามเสียงพูด (Thai Phonetic - แม่กด/กก/กบ/กน & ร/ล & ตัวการันต์)
    { q: 'หมา: บล็อคโคลี่', uid: 'ut6', expect: 'บรอกโคลี' },
    { q: 'หมา: บร็อกโคลี', uid: 'ut6', expect: 'บรอกโคลี' },
    { q: 'หมา: สตอเบอรี่', uid: 'ut6', expect: 'สตรอว์เบอร์รี' },
    { q: 'หมา: บลูเบอรี่', uid: 'ut6', expect: 'บลูเบอร์รี่' },
    { q: 'หมา: แมกคาเดเมียร์', uid: 'ut6', expect: 'ถั่วแมคคาเดเมีย' },
    { q: 'หมา: อัลมอนต์', uid: 'ut6', expect: 'อัลมอนด์' },
    { q: 'หมา: โยเกิต', uid: 'ut6', expect: 'โยเกิร์ต' },
    { q: 'แมว: ยาพาราเซตาม่อน', uid: 'ut7', expect: 'พาราเซตามอล' },
    { q: 'หมา: เเคนตาลุป', uid: 'ut6', expect: 'แคนตาลูป' },
    { q: 'หมา: มังคุต', uid: 'ut6', expect: 'มังคุด' },
    { q: 'หมา: เเก้วมังกรร', uid: 'ut6', expect: 'แก้วมังกร' },
    { q: 'หมา: ข้าวโอ๊ด', uid: 'ut6', expect: 'ข้าวโอ๊ต' },

    // 3. พิมพ์ผิดในคำสั่งฟีเจอร์ (คำนวณอาหาร / แพ้อาหาร / ฉุกเฉิน / ทักทาย)
    { q: 'คำนวนอาหารหทมาโต 10 กิโล', uid: 'ut8', expect: 'ปริมาณอาหารแนะนำต่อวัน' },
    { q: 'น้อนเเมวเเพ้ไก่', uid: 'ut9', expect: 'ไก่' },
    { q: 'เชคประวัติแพ้', uid: 'ut9', expect: 'ไก่' },
    { q: 'ล้างประวัดแพ้', uid: 'ut9', expect: 'แพ้อาหาร' },
    { q: 'ช้วยด้วย น้อนหทมาเผลอกอนชอกโกแลดเข้าไป', uid: 'ut10', expect: 'ฉุกเฉิน' },
    { q: 'แมวอาเจียร อ๊วกไม่หยุด', uid: 'ut11', expect: 'ฉุกเฉิน' },
    { q: 'สวัดดีคับ', uid: 'ut12', expect: 'หวัดดี' },
    { q: 'ขอบคุนคับ', uid: 'ut12', expect: 'ยินดี' }
  ];

  let passed = 0;
  for (const c of cases) {
    const t0 = Date.now();
    const res = await handleFoodCheck(c.q, c.uid);
    const ms = Date.now() - t0;
    const out = res.altText || res.text || '';
    const ok = out.includes(c.expect) || (c.expect === 'หวัดดี' && (out.includes('สวัสดี') || out.includes('หวัดดี')));
    if (ok) passed++;
    console.log(`${ok ? '✅' : '❌'} [${ms}ms] "${c.q}" -> ${out.replace(/\n+/g, ' ').slice(0, 85)}`);
  }

  console.log(`\n🎯 สรุปผลทดสอบคำพิมพ์ผิดภาษาไทย 25 รูปแบบ: ผ่าน ${passed}/${cases.length} (${Math.round((passed / cases.length) * 100)}%) | ใช้โควตา AI = 0!`);
})();
