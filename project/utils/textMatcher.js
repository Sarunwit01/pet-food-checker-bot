/**
 * textMatcher.js - ฟังก์ชันช่วยค้นหาและตัดคำอาหาร
 */

const foods = require('../data/foods.json');

// คำที่ไม่จำเป็นหรือคำถามที่ผู้ใช้มักพิมพ์ติดมา
const STOP_WORDS = [
  'กินได้ไหมคะ', 'กินได้ไหมครับ', 'กินได้มั้ยคะ', 'กินได้มั้ยครับ',
  'กินได้ไหม', 'กินได้มั้ย', 'กินได้ป่าว', 'กินได้รึเปล่า', 'กินได้หรือเปล่า',
  'อันตรายไหม', 'อันตรายมั้ย', 'เป็นอะไรไหม', 'เป็นไรไหม', 'ให้กินได้ไหม',
  'ได้ไหมคะ', 'ได้ไหมครับ', 'ได้มั้ยคะ', 'ได้มั้ยครับ',
  'ได้ไหม', 'ได้มั้ย', 'ได้ป่าว', 'ได้รึเปล่า', 'ได้หรือเปล่า', 'ไหมครับ', 'ไหมคะ', 'มั้ยครับ', 'มั้ยคะ',
  'หมากิน', 'สุนัขกิน', 'น้องหมากิน', 'แมวกิน', 'น้องแมวกิน', 'ลูกหมากิน', 'ลูกแมวกิน',
  'น้องหมา', 'น้องแมว', 'ลูกหมา', 'ลูกแมว', 'หมา', 'สุนัข', 'แมว',
  'ช่วยดูหน่อย', 'เช็คหน่อย', 'อยากรู้ว่า', 'ถามหน่อย', 'ตรวจ', 'อาหาร', 'กิน', 'ครับ', 'ค่ะ'
];

/**
 * ตรวจจับประเภทสัตว์เลี้ยงจากข้อความ
 * @param {string} text 
 * @returns {'dog' | 'cat' | null}
 */
function detectPetType(text) {
  const lower = text.toLowerCase();
  const dogPatterns = ['หมา', 'สุนัข', 'น้องหมา', 'ลูกหมา', 'โฮ่ง', 'dog', 'puppy'];
  const catPatterns = ['แมว', 'น้องแมว', 'ลูกแมว', 'เหมียว', 'cat', 'kitten'];

  const hasDog = dogPatterns.some(p => lower.includes(p));
  const hasCat = catPatterns.some(p => lower.includes(p));

  if (hasDog && !hasCat) return 'dog';
  if (hasCat && !hasDog) return 'cat';
  return null;
}

/**
 * คลีนข้อความเพื่อดึงชื่ออาหารออกมา
 * @param {string} text 
 * @returns {string}
 */
function cleanFoodQuery(text) {
  let cleaned = text.trim();
  // เรียงลำดับคำที่มีความยาวมากไปน้อยเพื่อไม่ให้ตัดคำสั้นก่อน
  const sortedStopWords = [...STOP_WORDS].sort((a, b) => b.length - a.length);

  for (const word of sortedStopWords) {
    cleaned = cleaned.split(word).join(' ');
  }

  return cleaned.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * ค้นหาอาหารจาก foods.json
 * @param {string} query 
 * @returns {object|null}
 */
function findFood(query) {
  if (!query || query.length === 0) return null;

  const raw = query.toLowerCase().trim();
  const cleaned = cleanFoodQuery(query);

  // 1. ค้นหาแบบตรงตัวก่อน (Exact match กับ name หรือ alias)
  for (const item of foods) {
    if (item.name.toLowerCase() === raw || item.name.toLowerCase() === cleaned) {
      return item;
    }
    if (item.aliases.some(alias => alias.toLowerCase() === raw || alias.toLowerCase() === cleaned)) {
      return item;
    }
  }

  // 2. ค้นหาแบบบางส่วน (Substring Match)
  // ให้สิทธิ์คำที่มีความยาวอย่างน้อย 3 ตัวอักษรขึ้นไป เพื่อไม่ให้คำสั้นอย่าง 'นม' ไปจับคู่กับ 'ขนม' หรือ 'ชานม'
  for (const item of foods) {
    // ตรวจสอบกับชื่อหลักก่อน
    const nameLower = item.name.toLowerCase();
    if (raw.includes(nameLower) || cleaned.includes(nameLower)) {
      return item;
    }

    for (const alias of item.aliases) {
      const aliasLower = alias.toLowerCase();
      // คำสั้น 1-2 ตัวอักษร ให้เทียบแบบตรงตัวเท่านั้น
      if (aliasLower.length <= 2) {
        if (raw === aliasLower || cleaned === aliasLower) {
          return item;
        }
        continue;
      }

      // สำหรับคำที่ยาวตั้งแต่ 3 ตัวอักษรขึ้นไป
      if (raw.includes(aliasLower) || (cleaned.length >= 3 && cleaned.includes(aliasLower))) {
        return item;
      }
    }
  }

  return null;
}

module.exports = {
  detectPetType,
  cleanFoodQuery,
  findFood
};
