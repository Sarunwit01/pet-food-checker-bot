/**
 * emergencyHandler.js - ระบบตรวจจับภาวะฉุกเฉินและอาการวิกฤตของสัตว์เลี้ยง (Phase 2)
 *
 * ทำหน้าที่:
 * 1. ดักจับคีย์เวิร์ดวิกฤต เช่น "เผลอกิน", "กินไปแล้ว", "แอบกิน", "อาเจียน", "อ้วก", "ชัก", "ซึม", "น้ำลายฟูมปาก"
 * 2. ตรวจสอบว่าในประโยคมีชื่ออาหารในฐานข้อมูล (foods.json) ติดมาด้วยหรือไม่ (เช่น "น้องหมากินช็อกโกแลตไปแล้ว")
 * 3. หากเปิดโหมด Hybrid AI (Gemini) และเป็นอาหารนอกฐานข้อมูล ให้ AI ช่วยสรุปสารพิษ/ความเสี่ยงเบื้องต้นแนบไปกับการ์ดฉุกเฉิน
 * 4. ส่งการ์ด LINE Flex Message แจ้งเตือนฉุกเฉินทันทีโดยไม่ถามคำถามยืดเยื้อ (ตัดขั้นตอนปกติเพื่อช่วยชีวิตน้องให้เร็วที่สุด)
 */

const { detectPetType, cleanFoodQuery, findFood } = require('../utils/textMatcher');
const { isGeminiConfigured, analyzeFoodWithGemini } = require('../utils/geminiService');
const { createEmergencyFlex } = require('../flex/templates');
const { foods } = require('../utils/foodStore');

// รายการคำสำคัญที่บ่งบอกว่าน้องกินเข้าไปแล้ว หรือกำลังมีอาการผิดปกติฉุกเฉิน
const EMERGENCY_KEYWORDS = [
  // กลุ่มเผลอกิน / กินเข้าไปแล้ว
  'เผลอกิน',
  'กินไปแล้ว',
  'แอบกิน',
  'กินเข้าไป',
  'กลืนเข้าไป',
  'กลืนลงไป',
  'เลียไปแล้ว',
  'คาบไปกิน',
  'เพิ่งกิน',
  // กลุ่มอาการป่วยฉุกเฉิน
  'อาเจียน',
  'อ้วก',
  'ขย้อน',
  'ชัก',
  'กระตุก',
  'เกร็ง',
  'น้ำลายฟูมปาก',
  'น้ำลายไหลยืด',
  'ซึมมาก',
  'ซึมไม่กินข้าว',
  'นอนซึม',
  'ติดคอ',
  'สำลัก',
  'หายใจไม่ออก',
  'หายใจหอบ',
  'หอบแรง',
  'ถ่ายเป็นเลือด',
  'อึเป็นเลือด',
  'ท้องเสียหนัก',
  'หมดสติ',
  'ตัวสั่น',
  'ขาอ่อนแรง',
  'โดนพิษ',
  'ได้รับพิษ',
  'ฉุกเฉิน',
  'ช่วยด้วย'
];

// คำที่ไม่จำเป็นเวลาสกัดหาชื่ออาหารออกจากประโยคฉุกเฉิน
const EMERGENCY_STOP_WORDS = [
  ...EMERGENCY_KEYWORDS,
  'ทำไงดี',
  'ทำยังไงดี',
  'ช่วยหน่อย',
  'เป็นอะไรไหม',
  'อันตรายไหม',
  'ต้องทำยังไง',
  'เมื่อกี้',
  'ตะกี้',
  'เยอะมาก',
  'นิดนึง',
  'ไปชิ้นนึง',
  'ไปลูกนึง',
  'ไปเม็ดนึง',
  'ครับ',
  'ค่ะ',
  'คะ'
];

// รูปแบบประโยคที่คำกริยากับคำบอกอดีตมีชื่ออาหารคั่นกลาง เช่น "กินช็อกโกแลตไปแล้ว", "กินองุ่นเข้าไป", "กลืนกระดูกลงไป"
const EMERGENCY_REGEX_PATTERNS = [
  { regex: /(?:กิน|กลืน|เลีย|เคี้ยว|คาบ).*(?:ไปแล้ว|เข้าไป|ลงไป|หมดเลย|ไปเยอะ)/, label: 'กินเข้าไปแล้ว' },
  { regex: /(?:เผลอ|แอบ).*(?:กิน|กลืน|เลีย)/, label: 'เผลอกิน' },
  { regex: /(?:กิน|กลืน|เลีย).*(?:เผลอ|แอบ)/, label: 'เผลอกิน' },
  { regex: /(?:^|\s|น้อง|หมา|แมว|อาการ)ซึม/, label: 'ซึม' }
];

/**
 * ตรวจสอบว่าข้อความเข้าข่ายภาวะฉุกเฉินหรือไม่
 * @param {string} text
 * @returns {{ isEmergency: boolean, matchedKeywords: string[] }}
 */
function detectEmergency(text) {
  if (!text || typeof text !== 'string') {
    return { isEmergency: false, matchedKeywords: [] };
  }

  const normalized = text.trim().toLowerCase();
  const matchedKeywords = EMERGENCY_KEYWORDS.filter(kw => normalized.includes(kw.toLowerCase()));

  // ตรวจสอบด้วย Regex สำหรับประโยคที่มีชื่ออาหารคั่นกลาง เช่น "กินช็อกโกแลตไปแล้ว"
  for (const pattern of EMERGENCY_REGEX_PATTERNS) {
    if (pattern.regex.test(normalized) && !matchedKeywords.includes(pattern.label)) {
      matchedKeywords.push(pattern.label);
    }
  }

  return {
    isEmergency: matchedKeywords.length > 0,
    matchedKeywords
  };
}

/**
 * สกัดชื่ออาหารจากประโยคฉุกเฉิน เช่น "น้องหมากินช็อกโกแลตไปแล้ว ทำไงดี" -> ค้นหา "ช็อกโกแลต"
 * @param {string} text
 * @returns {string}
 */
function cleanEmergencyFoodQuery(text) {
  let cleaned = text;
  const sortedWords = [...EMERGENCY_STOP_WORDS].sort((a, b) => b.length - a.length);
  for (const w of sortedWords) {
    cleaned = cleaned.split(w).join(' ');
  }
  return cleanFoodQuery(cleaned);
}

/**
 * ประมวลผลข้อความกรณีฉุกเฉิน
 * @param {string} text - ข้อความที่ผู้ใช้พิมพ์
 * @param {string} userId - LINE User ID
 * @param {Map} [userPetMemory] - หน่วยความจำชนิดสัตว์ของผู้ใช้ (ถ้ามี)
 * @returns {Promise<object|null>} LINE Flex Message สำหรับแจ้งเตือนฉุกเฉิน หรือ null หากไม่ใช่เคสฉุกเฉิน
 */
async function handleEmergencyCheck(text, userId, userPetMemory = null) {
  const { isEmergency, matchedKeywords } = detectEmergency(text);
  if (!isEmergency) {
    return null;
  }

  // 1. ตรวจหาชนิดสัตว์ (ถ้ามีระบุในประโยค หรือจำได้จากก่อนหน้า)
  let petType = detectPetType(text);
  if (!petType && userId && userPetMemory && userPetMemory.has(userId)) {
    petType = userPetMemory.get(userId);
  } else if (petType && userId && userPetMemory) {
    userPetMemory.set(userId, petType);
  }

  // 2. ลองค้นหาว่าในประโยคฉุกเฉินพูดถึงอาหารชนิดใดในฐานข้อมูลหรือไม่
  const foodCandidate = cleanEmergencyFoodQuery(text);
  let matchedFood = findFood(text) || (foodCandidate ? findFood(foodCandidate) : null);
  let aiResult = null;

  // 3. หากไม่พบในฐานข้อมูล Local และเปิดใช้งาน Gemini AI ให้ AI ช่วยดูบริบทหรือส่วนผสมอันตรายเพิ่มเติม
  if (isGeminiConfigured() && !matchedFood && foodCandidate) {
    aiResult = await analyzeFoodWithGemini(text, petType);
    if (aiResult) {
      if (!petType && (aiResult.detectedPetType === 'dog' || aiResult.detectedPetType === 'cat')) {
        petType = aiResult.detectedPetType;
        if (userId && userPetMemory) {
          userPetMemory.set(userId, petType);
        }
      }
      if (!matchedFood && aiResult.matchedFoodId) {
        matchedFood = foods.find(f => f.id === aiResult.matchedFoodId) || null;
      }
    }
  }

  // 4. สร้างการ์ดแจ้งเตือนฉุกเฉินทันที (ไม่ต้องรอถามว่าเป็นหมาหรือแมว เพราะทุกวินาทีมีค่า)
  return createEmergencyFlex({
    userText: text,
    matchedKeywords,
    petType,
    matchedFood,
    aiResult
  });
}

module.exports = {
  detectEmergency,
  handleEmergencyCheck,
  EMERGENCY_KEYWORDS
};
