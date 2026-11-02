/**
 * textMatcher.js - ฟังก์ชันช่วยค้นหาและตัดคำอาหาร
 */

const { foods } = require('../utils/foodStore');
const { normalizeThaiTypos, toThaiPhonetic } = require('./thaiTypoNormalizer');

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

// คำอาหารเฉพาะที่มีชื่อคล้ายหรือมีคำย่อยของอาหารในฐานข้อมูล แต่เป็นคนละชนิดกัน (ไม่ให้จับคู่ผิดด้วย Substring)
const SUBSTRING_CONFLICTS = [
  { conflictWord: 'มะม่วงหิมพานต์', blockedId: 'mango' },
  { conflictWord: 'เม็ดมะม่วง', blockedId: 'mango' },
  { conflictWord: 'ชมพู่มะเหมี่ยว', blockedId: 'mango' },
  { conflictWord: 'มะขามเทศ', blockedId: 'tamarind' },
  { conflictWord: 'สับปะรดสี', blockedId: 'pineapple' },
  { conflictWord: 'กระเทียมโทน', blockedId: 'onion_garlic' }
];
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
  let lower = normalizeThaiTypos(text).toLowerCase();
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
  let cleaned = normalizeThaiTypos(text).trim();

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

  return cleaned.replace(/เเ/g, 'แ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * ปรับรูปคำภาษาไทยเพื่อเปรียบเทียบคำที่สะกดเพี้ยน/วรรณยุกต์ผิด/พิมพ์ซ้ำตัวท้าย
 * @param {string} str
 * @returns {string}
 */
function normalizeForFuzzy(str) {
  return normalizeThaiTypos(str)
    .toLowerCase()
    .replace(/[\u0E47-\u0E4C]/g, '') // ตัดไม้ไต่คู้ วรรณยุกต์ และตัวการันต์ออกชั่วคราวเพื่อเทียบโครงคำ
    .replace(/(.)\1+/g, '$1') // ตัดตัวอักษรซ้ำติดกัน เช่น "องุ่นน" -> "องุน", "ช็อกกกโกแลต" -> "ชอกโกแลต"
    .trim();
}

/**
 * คำนวณระยะห่างการสะกดคำ (Levenshtein Edit Distance)
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * ค้นหาอาหารจาก foods.json (รองรับทั้งตรงตัว, คำย่อย และการพิมพ์ผิด/สะกดเพี้ยน)
 * @param {string} query 
 * @returns {object|null}
 */
function findFood(query) {
  if (!query || query.length === 0) return null;

  const raw = normalizeThaiTypos(query).toLowerCase().trim();
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
    if (SUBSTRING_CONFLICTS.some(c => c.blockedId === item.id && raw.includes(c.conflictWord))) {
      continue;
    }
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

  // 3. ค้นหาแบบอนุโลมคำพิมพ์ผิด (Fuzzy & Thai Phonetic Match)
  const targetQuery = cleaned.length >= 3 ? cleaned : raw;
  const normQuery = normalizeForFuzzy(targetQuery);
  const phonQuery = toThaiPhonetic(targetQuery);

  if (normQuery.length >= 3) {
    let bestMatch = null;
    let bestDist = Infinity;

    for (const { term, item } of candidates) {
      if (SUBSTRING_CONFLICTS.some(c => c.blockedId === item.id && raw.includes(c.conflictWord))) {
        continue;
      }
      const normTerm = normalizeForFuzzy(term);
      if (normTerm.length < 3) continue;

      // 3a. กรณีตัดวรรณยุกต์/สระซ้ำแล้วตรงกันเป๊ะ (เช่น "ช๊อกโกเเลตต" vs "ช็อกโกแลต")
      if (normQuery === normTerm || (normTerm.length >= 4 && normQuery.includes(normTerm))) {
        return item;
      }

      // 3b. กรณีเสียงพ้อง (Thai Phonetic Key) ตรงกันเป๊ะสำหรับคำ 2 พยางค์ขึ้นไป (เช่น "ชอกโกแลด" == "ช็อกโกแลต", "บร็อคโคลี่" == "บรอกโคลี", "ลูกเกต" == "ลูกเกด")
      const phonTerm = toThaiPhonetic(term);
      if (phonTerm.length >= 4 && (phonQuery === phonTerm || (phonTerm.length >= 5 && phonQuery.includes(phonTerm)))) {
        return item;
      }

      // 3c. คำนวณ Edit Distance บนรูปคำที่ตัดวรรณยุกต์แล้ว (ต้องขึ้นต้นด้วยเสียงพยัญชนะกลุ่มเดียวกัน เพื่อไม่ให้คำคนละชนิดอย่าง "อัลมอนด์" ไปชนกับ "แซลมอน")
      const maxAllowedDist = normTerm.length >= 6 ? 2 : normTerm.length >= 4 ? 1 : 0;
      const sameInitialGroup = phonQuery.length > 0 && phonTerm.length > 0 && phonQuery[0] === phonTerm[0];
      if (sameInitialGroup && maxAllowedDist > 0 && Math.abs(normQuery.length - normTerm.length) <= maxAllowedDist) {
        const dist = levenshteinDistance(normQuery, normTerm);
        if (dist <= maxAllowedDist && dist < bestDist) {
          bestDist = dist;
          bestMatch = item;
        }
      }
    }

    if (bestMatch) {
      return bestMatch;
    }
  }

  return null;
}

module.exports = {
  detectPetType,
  cleanFoodQuery,
  findFood
};
