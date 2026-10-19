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

// คำประสมที่เป็นชื่ออาหาร/พืชที่มีคำว่า "หมา" หรือ "แมว" ปนอยู่ (ป้องกันไม่ให้ถูกตัดคำผิด)
const PROTECTED_COMPOUND_WORDS = [
  'หมากฝรั่งไร้น้ำตาล',
  'หมากฝรั่งน้ำตาลเทียม',
  'หมากฝรั่ง',
  'หมาล่า',
  'หมามุ่ย',
  'หญ้าแมว',
  'ตำแยแมว',
  'นมแมว'
];

/**
 * ตรวจจับประเภทสัตว์เลี้ยงจากข้อความ
 * @param {string} text 
 * @returns {'dog' | 'cat' | null}
 */
function detectPetType(text) {
  let lower = text.toLowerCase();
  for (const compound of PROTECTED_COMPOUND_WORDS) {
    lower = lower.split(compound).join(' ');
  }

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

  // แทนที่คำประสมด้วย Placeholder ชั่วคราวก่อนตัด STOP_WORDS
  const placeholders = [];
  for (let i = 0; i < PROTECTED_COMPOUND_WORDS.length; i++) {
    const word = PROTECTED_COMPOUND_WORDS[i];
    if (cleaned.includes(word)) {
      const token = `__PROTECTED_${i}__`;
      placeholders.push({ token, word });
      cleaned = cleaned.split(word).join(token);
    }
  }

  // เรียงลำดับคำที่มีความยาวมากไปน้อยเพื่อไม่ให้ตัดคำสั้นก่อน
  const sortedStopWords = [...STOP_WORDS].sort((a, b) => b.length - a.length);

  for (const word of sortedStopWords) {
    cleaned = cleaned.split(word).join(' ');
  }

  // คืนค่าคำประสมกลับคืนมา
  for (const { token, word } of placeholders) {
    cleaned = cleaned.split(token).join(word);
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

  // 2. ค้นหาแบบบางส่วน (Substring Match) โดยเรียงจากคำค้นที่ยาวที่สุดก่อน (เช่น "กระดูกไก่ต้ม" ต้องชนะ "ไก่ต้ม")
  const candidates = [];
  for (const item of foods) {
    candidates.push({ term: item.name.toLowerCase(), item });
    for (const alias of item.aliases) {
      candidates.push({ term: alias.toLowerCase(), item });
    }
  }
  candidates.sort((a, b) => b.term.length - a.term.length);

  for (const { term, item } of candidates) {
    if (term.length <= 2) {
      if (raw === term || cleaned === term) {
        return item;
      }
      continue;
    }
    if (raw.includes(term) || (cleaned.length >= 3 && cleaned.includes(term))) {
      return item;
    }
  }

  return null;
}

module.exports = {
  detectPetType,
  cleanFoodQuery,
  findFood
};
