/**
 * foodHandler.js - จัดการคำขอเช็คอาหารและสถานะผู้ใช้ด้วยระบบ Hybrid (AI + Database)
 * 
 * ลำดับการทำงาน (Hybrid Architecture):
 * 1. ตรวจจับคำทักทาย/ขอบคุณ/ถามวิธีใช้ เพื่อตอบกลับอย่างเป็นธรรมชาติเหมือนคุยกับคนจริงๆ
 * 2. Local Fast-Path: ลองค้นหาแบบตรงตัวจาก foods.json ก่อนเพื่อความแม่นยำและรวดเร็ว
 * 3. Gemini AI Hybrid:
 *    - หากเปิดใช้งาน GEMINI_API_KEY:
 *      a) ถ้าระบบ Local เจออาหารในฐานข้อมูล -> ให้ AI ช่วยสร้างคำอธิบายเสริมที่เป็นมิตร (RAG Grounded Response)
 *      b) ถ้าระบบ Local ไม่เจอ (เช่น ประโยคซับซ้อน หรือเมนูอย่าง "บราวนี่", "ชานมไข่มุก") -> ให้ AI ช่วยสกัดชื่ออาหาร จับคู่กับ id ใน foods.json หรือวิเคราะห์ส่วนผสมที่ต้องระวัง (AI Ingredient Warning)
 * 4. Safe Fallback: หากไม่ได้ใส่คีย์ AI หรือ AI ล่ม ระบบจะทำงานด้วยฐานข้อมูล Local 100% โดยไม่พัง
 */

const { foods } = require('../utils/foodStore');
const { detectPetType, cleanFoodQuery, findFood } = require('../utils/textMatcher');
const { isGeminiConfigured, analyzeFoodWithGemini } = require('../utils/geminiService');
const { researchAndSaveFood } = require('../utils/researchService');
const { handleEmergencyCheck } = require('./emergencyHandler');
const { handleAllergyCommand, checkAllergyConflict } = require('./allergyHandler');
const { handlePortionCommand } = require('./portionHandler');
const {
  createFoodResultFlex,
  createAiIngredientWarningFlex,
  createAskPetQuickReply,
  createNotFoundMessage,
  pickNaturalText
} = require('../flex/templates');

// เก็บสถานะชนิดสัตว์ล่าสุดของผู้ใช้แต่ละคนในหน่วยความจำ (userId -> 'dog' | 'cat')
const userPetMemory = new Map();

/**
 * ตรวจสอบข้อความทักทาย ขอบคุณ หรือถามวิธีใช้ทั่วไป เพื่อตอบกลับอย่างเป็นธรรมชาติ
 * @param {string} text
 * @returns {string|null}
 */
function checkCasualChat(text) {
  const lower = text.trim().toLowerCase();

  const greetings = ['สวัสดี', 'หวัดดี', 'ดีครับ', 'ดีค่ะ', 'ฮัลโหล', 'hello', 'hi', 'ทักทาย'];
  if (greetings.some(g => lower === g || lower.startsWith(g + ' '))) {
    return pickNaturalText([
      'สวัสดีครับ! 🐾 วันนี้อยากเช็คอาหารหรือขนมชิ้นไหนให้น้องหมาหรือน้องแมว พิมพ์ชื่อบอกผมได้เลยนะ 😊',
      'หวัดดีครับ! 🐶🐱 มีเมนูไหนไม่แน่ใจว่าน้องกินได้ไหม พิมพ์ถามมาได้เลยนะครับ เดี๋ยวช่วยเช็คให้!'
    ]);
  }

  const thanks = ['ขอบคุณ', 'ขอบใจ', 'แต้งกิ้ว', 'thank', 'thanks', 'ขอบคุณครับ', 'ขอบคุณค่ะ'];
  if (thanks.some(t => lower.includes(t))) {
    return pickNaturalText([
      'ยินดีมากๆ เลยครับ! 🐾 ถ้ามีอาหารชิ้นไหนอยากเช็คให้น้องอีก ทักมาถามได้ตลอดเลยนะ 😊',
      'ด้วยความยินดีเลยครับ ฝากเกาพุงน้องเผื่อด้วยน้า 🐶🐱 มีอะไรสงสัยเพิ่มเติมถามได้เสมอครับ!'
    ]);
  }

  const voiceHelps = ['สั่งด้วยเสียง', 'พูดเอาได้ไหม', 'ส่งเสียงได้ไหม', 'ข้อความเสียง', 'ใช้เสียงยังไง', 'อัดเสียง'];
  if (voiceHelps.some(v => lower.includes(v))) {
    return '🎙️ คุณสามารถสั่งงานผมด้วยเสียงได้ 2 วิธีเลยครับ!\n\n1️⃣ กดปุ่ม "รูปไมโครโฟน 🎤 บนแป้นพิมพ์คีย์บอร์ดมือถือ" (Voice Typing) แล้วพูดชื่ออาหารได้เลย (เร็วและแม่นยำมาก)\n2️⃣ กดอัดคลิปเสียง (Voice Note) ส่งมาในแชท LINE โดยตรง เพื่อให้ Gemini AI ถอดเสียงภาษาไทยและเช็คอาหารให้อัตโนมัติครับ 🐾✨';
  }

  const helps = ['ทำอะไรได้บ้าง', 'วิธีใช้', 'ใช้งานยังไง', 'ช่วยอะไรได้บ้าง', 'เมนู', 'help'];
  if (helps.some(h => lower.includes(h))) {
    return 'ผมช่วยดูแลเรื่องอาหารให้น้องหมา 🐶 และน้องแมว 🐱 ได้ครบเลยครับ:\n\n1️⃣ เช็คอาหาร: พิมพ์ชื่ออาหาร เช่น "ช็อกโกแลต", "หมากินองุ่นได้ไหม"\n2️⃣ จำประวัติแพ้อาหาร: พิมพ์บอก เช่น "น้องแพ้ไก่", "เช็คประวัติแพ้"\n3️⃣ คำนวณปริมาณอาหาร: พิมพ์ "คำนวณอาหาร" หรือ "คำนวณอาหารหมาโต 10 กก."\n4️⃣ สั่งงานด้วยเสียง: กดไมค์บนคีย์บอร์ดมือถือ หรือส่งคลิปเสียงเข้ามาได้เลย 🎙️\n5️⃣ ช่วยเหลือฉุกเฉิน: ถ้าน้องเผลอกินไปแล้วหรือป่วย พิมพ์บอกได้ทันทีเลยครับ 🚨';
  }

  return null;
}

/**
 * ประมวลผลข้อความตรวจสอบอาหาร (รองรับทั้งโหมด Hybrid AI + Database และโหมด Local Fallback)
 * @param {string} text - ข้อความที่ผู้ใช้พิมพ์
 * @param {string} userId - LINE User ID
 * @returns {Promise<object>} LINE Message object สำหรับใช้ตอบกลับ
 */
async function handleFoodCheck(text, userId) {
  // 0. ตรวจสอบภาวะฉุกเฉินก่อนเป็นอันดับแรก (Phase 2)
  const emergencyReply = await handleEmergencyCheck(text, userId, userPetMemory);
  if (emergencyReply) {
    return emergencyReply;
  }

  // 0.1 ตรวจสอบคำสั่งบันทึก/เช็ค/ลบประวัติการแพ้อาหาร (Phase 3)
  const detectedPetInText = detectPetType(text);
  if (detectedPetInText && userId) {
    userPetMemory.set(userId, detectedPetInText);
  }
  const allergyReply = handleAllergyCommand(text, userId);
  if (allergyReply) {
    return allergyReply;
  }

  // 0.2 ตรวจสอบโหมดคำนวณปริมาณอาหารตามน้ำหนักและช่วงวัย (Phase 4)
  const portionReply = handlePortionCommand(text, userId, userPetMemory);
  if (portionReply) {
    return portionReply;
  }

  // 0.3 ตรวจสอบว่าเป็นคำทักทาย ขอบคุณ หรือถามวิธีใช้หรือไม่
  const casualReply = checkCasualChat(text);
  if (casualReply) {
    return {
      type: 'text',
      text: casualReply
    };
  }

  let petType = detectedPetInText;

  // ตรวจสอบกรณีที่มาจากการกดปุ่ม Quick Reply เช่น "หมา: ช็อกโกแลต" หรือ "แมว: ชีส"
  let queryText = text;
  if (text.startsWith('หมา:') || text.startsWith('สุนัข:')) {
    petType = 'dog';
    queryText = text.replace(/^(หมา|สุนัข):\s*/, '');
  } else if (text.startsWith('แมว:')) {
    petType = 'cat';
    queryText = text.replace(/^แมว:\s*/, '');
  }

  // ดึงความจำเดิมของผู้ใช้ (ถ้ามี)
  const rememberedPet = userId && userPetMemory.has(userId) ? userPetMemory.get(userId) : null;
  if (!petType && rememberedPet) {
    petType = rememberedPet;
  }

  // คลีนข้อความเพื่อดึงชื่ออาหารเบื้องต้น
  const cleanedFoodName = cleanFoodQuery(queryText);

  if (!cleanedFoodName || cleanedFoodName.length === 0) {
    // บันทึกชนิดสัตว์ไว้ถ้าผู้ใช้พิมพ์มาแค่ "น้องหมา" หรือ "แมวกินได้ไหม"
    if (petType && userId) {
      userPetMemory.set(userId, petType);
    }
    const emptyPrompts = [
      'บอกชื่ออาหารหรือขนมที่อยากเช็คให้หน่อยน้า 😊 เช่น "ช็อกโกแลต", "องุ่น", "อกไก่ต้ม" หรือ "ชานมไข่มุก" เดี๋ยวผมช่วยเช็คให้ทันทีเลยครับ 🐾',
      'อยากเช็คเมนูไหนให้น้องดีครับ? พิมพ์ชื่ออาหารมาได้เลยนะ เช่น "หมากินแอปเปิ้ลได้ไหม" หรือ "ชีส" ครับ 🐶🐱'
    ];
    return {
      type: 'text',
      text: pickNaturalText(emptyPrompts)
    };
  }

  // ขั้นที่ 1: ค้นหาในฐานข้อมูล foods.json ด้วยระบบ Local Matcher ก่อน (Fast-Path 0ms ไม่เสียโควตา AI)
  let matchedFood = findFood(cleanedFoodName);
  let aiResult = null;

  // ขั้นที่ 2: หากไม่พบในฐานข้อมูล Local และตั้งค่า Google Gemini API ไว้ ให้เรียก AI ช่วยวิเคราะห์แบบ Hybrid
  if (!matchedFood && isGeminiConfigured()) {
    aiResult = await analyzeFoodWithGemini(text, petType);

    if (aiResult) {
      // อัปเดตชนิดสัตว์หาก AI ตรวจจับได้จากบริบทประโยค
      if (!petType && (aiResult.detectedPetType === 'dog' || aiResult.detectedPetType === 'cat')) {
        petType = aiResult.detectedPetType;
      }

      // หาก Local Matcher หาไม่เจอ แต่ AI จับคู่เข้ากับอาหารใน foods.json ได้ (เช่น "บราวนี่" -> "chocolate")
      if (!matchedFood && aiResult.matchedFoodId) {
        matchedFood = foods.find(f => f.id === aiResult.matchedFoodId) || null;
      }
    }
  }

  // ขั้นที่ 2.5: ไม่มีในฐานข้อมูล -> ให้ AI ค้นคว้าจากเว็บ (>= 5 แหล่ง ผลต้องตรงกัน) แล้วบันทึกลงฐานข้อมูลพร้อมแหล่งที่มา
  if (!matchedFood && aiResult && aiResult.isFoodQuery && isGeminiConfigured()) {
    const researched = await researchAndSaveFood(aiResult.extractedFoodName || cleanedFoodName);
    if (researched) {
      matchedFood = researched;
    }
  }

  // บันทึกชนิดสัตว์ลงใน Memory หากทราบแล้ว
  if (petType && userId) {
    userPetMemory.set(userId, petType);
  }

  // ขั้นที่ 3 (Phase 3): ตรวจสอบว่าอาหารนี้ตรงกับประวัติการแพ้ของน้องหรือไม่ (Cross-check)
  const triggeredAllergies = checkAllergyConflict(userId, matchedFood, aiResult);

  // กรณีที่ A: พบข้อมูลอาหารที่ตรงกับฐานข้อมูลหลัก (foods.json)
  if (matchedFood) {
    // ถ้ายังไม่ทราบว่าเช็คให้น้องหมาหรือน้องแมว ให้ถามด้วย Quick Reply ก่อน
    if (!petType) {
      return createAskPetQuickReply(matchedFood.name);
    }

    // ส่งการ์ด Flex Message จากฐานข้อมูลหลัก + คำอธิบายเสริมจาก AI + คำเตือนสารก่อภูมิแพ้ (ถ้ามี)
    return createFoodResultFlex(matchedFood, petType, {
      aiExplanation: aiResult ? aiResult.aiExplanation : null,
      triggeredAllergies
    });
  }

  // กรณีที่ B: ไม่พบใน foods.json แต่มีผลวิเคราะห์ส่วนผสมจาก Gemini AI (AI Ingredient Warning)
  if (aiResult) {
    if (aiResult.isFoodQuery) {
      const foodLabel = aiResult.extractedFoodName || cleanedFoodName;

      if (!petType) {
        return createAskPetQuickReply(foodLabel);
      }

      return createAiIngredientWarningFlex(aiResult, petType, triggeredAllergies);
    } else if (aiResult.aiExplanation) {
      // ถ้าผู้ใช้พิมพ์คุยเล่นทั่วไปที่ไม่ได้ถามเรื่องอาหาร ให้ AI ตอบกลับแบบเป็นธรรมชาติได้เลย
      return {
        type: 'text',
        text: aiResult.aiExplanation
      };
    }
  }

  // กรณีที่ C: Fallback ปลอดภัย (เมื่อไม่พบในฐานข้อมูลและไม่ได้เปิดใช้ AI)
  return createNotFoundMessage(cleanedFoodName);
}

module.exports = {
  handleFoodCheck,
  userPetMemory
};
