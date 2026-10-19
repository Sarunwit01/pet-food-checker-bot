/**
 * allergyHandler.js - ระบบจัดการโปรไฟล์สารก่อภูมิแพ้ของสัตว์เลี้ยง (Phase 3)
 *
 * ทำหน้าที่:
 * 1. บันทึก เพิ่ม ลบ และดูประวัติการแพ้อาหารของสัตว์เลี้ยงแยกตาม userId ลงใน data/profiles.json
 * 2. ดักจับคำสั่งภาษาพูดธรรมชาติ เช่น "น้องแพ้ไก่", "แพ้นมกับไข่", "น้องแพ้อะไรบ้าง", "ล้างข้อมูลแพ้"
 * 3. ตรวจสอบการแพ้ซ้อนทับ (Cross-check) เมื่อผู้ใช้ค้นหาอาหาร ทั้งจาก foods.json และจากผลวิเคราะห์ส่วนผสมของ AI
 */

const fs = require('fs');
const path = require('path');
const { pickNaturalText } = require('../flex/templates');

const PROFILES_PATH = path.join(__dirname, '../data/profiles.json');

// ความพ้องรูปของสารก่อภูมิแพ้ที่พบบ่อย เพื่อให้จับคู่ได้แม่นยำขึ้น (เช่น บันทึกว่า "แพ้นม" จะจับคู่กับ "แลคโตส", "นมวัว", "เนย", "ชีส" ได้ด้วย)
const ALLERGEN_SYNONYMS = {
  'ไก่': ['ไก่', 'อกไก่', 'เนื้อไก่', 'chicken'],
  'นม': ['นม', 'นมวัว', 'แลคโตส', 'ชีส', 'เนย', 'ครีม', 'วิปครีม', 'milk', 'dairy', 'lactose', 'cheese'],
  'วัว': ['วัว', 'เนื้อวัว', 'beef'],
  'เนื้อวัว': ['วัว', 'เนื้อวัว', 'beef'],
  'ปลา': ['ปลา', 'อาหารทะเล', 'แซลมอน', 'ทูน่า', 'ปลาทู', 'fish', 'salmon', 'tuna'],
  'ไข่': ['ไข่', 'ไข่ไก่', 'ไข่แดง', 'ไข่ขาว', 'egg'],
  'ถั่ว': ['ถั่ว', 'ถั่วลิสง', 'เนยถั่ว', 'อัลมอนด์', 'peanut', 'nut'],
  'แป้งสาลี': ['แป้งสาลี', 'ข้าวสาลี', 'กลูเตน', 'ขนมปัง', 'wheat', 'gluten']
};

/**
 * โหลดข้อมูลโปรไฟล์ทั้งหมดจากไฟล์ data/profiles.json
 * @returns {object}
 */
function loadProfiles() {
  try {
    if (!fs.existsSync(PROFILES_PATH)) {
      fs.writeFileSync(PROFILES_PATH, '{}', 'utf8');
      return {};
    }
    const raw = fs.readFileSync(PROFILES_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    console.error('⚠️ Error reading profiles.json:', err.message);
    return {};
  }
}

/**
 * บันทึกข้อมูลโปรไฟล์ลงไฟล์ data/profiles.json
 * @param {object} profiles
 */
function saveProfiles(profiles) {
  try {
    fs.writeFileSync(PROFILES_PATH, JSON.stringify(profiles, null, 2), 'utf8');
  } catch (err) {
    console.error('⚠️ Error saving profiles.json:', err.message);
  }
}

/**
 * ดึงรายการสารก่อภูมิแพ้ของผู้ใช้
 * @param {string} userId
 * @returns {string[]}
 */
function getUserAllergies(userId) {
  if (!userId) return [];
  const profiles = loadProfiles();
  return profiles[userId]?.allergies || [];
}

/**
 * เพิ่มสารก่อภูมิแพ้ให้ผู้ใช้
 * @param {string} userId
 * @param {string[]} newAllergens
 * @returns {string[]} รายการสารก่อภูมิแพ้ทั้งหมดหลังอัปเดต
 */
function addUserAllergies(userId, newAllergens) {
  const profiles = loadProfiles();
  if (!profiles[userId]) {
    profiles[userId] = { allergies: [], updatedAt: new Date().toISOString() };
  }

  const current = new Set(profiles[userId].allergies || []);
  for (const item of newAllergens) {
    const cleaned = item.trim();
    if (cleaned) current.add(cleaned);
  }

  profiles[userId].allergies = Array.from(current);
  profiles[userId].updatedAt = new Date().toISOString();
  saveProfiles(profiles);

  return profiles[userId].allergies;
}

/**
 * ล้างข้อมูลสารก่อภูมิแพ้ของผู้ใช้ (ทั้งหมด หรือเฉพาะรายการ)
 * @param {string} userId
 * @param {string|null} [specificAllergen]
 * @returns {string[]} รายการที่เหลือ
 */
function clearUserAllergies(userId, specificAllergen = null) {
  const profiles = loadProfiles();
  if (!profiles[userId] || !Array.isArray(profiles[userId].allergies)) {
    return [];
  }

  if (!specificAllergen) {
    profiles[userId].allergies = [];
  } else {
    profiles[userId].allergies = profiles[userId].allergies.filter(
      a => a.toLowerCase() !== specificAllergen.trim().toLowerCase()
    );
  }

  profiles[userId].updatedAt = new Date().toISOString();
  saveProfiles(profiles);
  return profiles[userId].allergies;
}

/**
 * สกัดรายชื่อสารก่อภูมิแพ้จากประโยค เช่น "น้องแพ้ไก่กับนมครับ" -> ["ไก่", "นม"]
 * @param {string} rawAllergenPart
 * @returns {string[]}
 */
function parseAllergensFromText(rawAllergenPart) {
  const cleaned = rawAllergenPart
    .replace(/(?:ครับ|ค่ะ|คะ|นะ|จ้า|ด้วย|มาก|หนักมาก|เลย|นิดหน่อย)/g, ' ')
    .trim();

  // แยกคำด้วยตัวเชื่อม เช่น "กับ", "และ", ",", "/" หรือช่องว่าง (รองรับกรณีพิมพ์ติดกัน เช่น "ไก่กับนม")
  const parts = cleaned
    .split(/(?:และ|กับ|,|\/|\s+)/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !['อาหาร', 'พวก', 'เนื้อ', 'ของ'].includes(s));

  // กรณีผู้ใช้พิมพ์ว่า "แพ้เนื้อวัว" หรือ "แพ้นมวัว" ไม่ให้คำว่า "เนื้อ" ถูกตัดหายไปถ้าอยู่ติดกัน
  if (parts.length === 0 && cleaned.length > 0) {
    return [cleaned];
  }
  return parts;
}

/**
 * ตรวจสอบและจัดการคำสั่งเกี่ยวกับประวัติแพ้อาหาร
 * @param {string} text - ข้อความที่ผู้ใช้พิมพ์
 * @param {string} userId - LINE User ID
 * @returns {object|null} LINE Message Object หากเป็นคำสั่งจัดการภูมิแพ้ หรือ null หากเป็นข้อความทั่วไป
 */
function handleAllergyCommand(text, userId) {
  if (!text || !userId) return null;
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // 1. คำสั่งล้างประวัติการแพ้ทั้งหมด
  const clearPatterns = [
    'ล้างข้อมูลแพ้',
    'ลบข้อมูลแพ้',
    'ล้างประวัติแพ้',
    'ลบประวัติแพ้',
    'ไม่แพ้อะไรแล้ว',
    'รีเซ็ตข้อมูลแพ้',
    'ยกเลิกประวัติแพ้'
  ];
  if (clearPatterns.some(p => lower.includes(p))) {
    clearUserAllergies(userId);
    return {
      type: 'text',
      text: pickNaturalText([
        '🧹 ล้างประวัติการแพ้อาหารของน้องให้เรียบร้อยแล้วครับ! ถ้าต้องการบันทึกใหม่ พิมพ์บอกผมได้เลยนะ เช่น "น้องแพ้ไก่" ครับ 🐾',
        '✨ รีเซ็ตข้อมูลการแพ้อาหารให้แล้วนะครับ ตอนนี้โปรไฟล์ของน้องไม่มีรายการแพ้อาหารที่บันทึกไว้แล้วครับ 🐶🐱'
      ])
    };
  }

  // 2. คำสั่งลบเฉพาะบางรายการ เช่น "ยกเลิกแพ้ไก่", "ลบแพ้นม"
  const removeSpecificMatch = trimmed.match(/^(?:ยกเลิก|ลบ|เอาออก)[\s]*(?:ว่า)?(?:น้อง)?แพ้(.+)$/i);
  if (removeSpecificMatch) {
    const target = removeSpecificMatch[1].replace(/(?:ครับ|ค่ะ|คะ|ออก)/g, '').trim();
    const remaining = clearUserAllergies(userId, target);
    const remainText =
      remaining.length > 0
        ? `รายการที่ยังจำไว้อยู่ตอนนี้คือ: ${remaining.map(a => `"${a}"`).join(', ')} ครับ`
        : 'ตอนนี้ไม่มีรายการแพ้อาหารที่บันทึกไว้แล้วครับ';

    return {
      type: 'text',
      text: `✅ ลบ "${target}" ออกจากประวัติการแพ้ของน้องเรียบร้อยแล้วครับ!\n(${remainText})`
    };
  }

  // 3. คำสั่งขอดูประวัติการแพ้ปัจจุบัน
  const viewPatterns = [
    'เช็คประวัติแพ้',
    'ดูประวัติแพ้',
    'ดูรายการแพ้',
    'เช็ครายการแพ้',
    'น้องแพ้อะไรบ้าง',
    'แพ้อะไรบ้าง',
    'โปรไฟล์แพ้',
    'โปรไฟล์น้อง'
  ];
  if (viewPatterns.some(p => lower.includes(p))) {
    const allergies = getUserAllergies(userId);
    if (allergies.length === 0) {
      return {
        type: 'text',
        text: '📋 ตอนนี้ยังไม่มีบันทึกประวัติการแพ้อาหารของน้องเลยครับ\n\nถ้าน้องแพ้อะไร พิมพ์บอกผมไว้ได้เลยนะ เช่น:\n• "น้องแพ้ไก่"\n• "แพ้นม"\n• "แพ้เนื้อวัว"\nเวลาเช็คอาหารครั้งต่อไป ผมจะคอยเตือนเป็นพิเศษให้ครับ! 🐾'
      };
    }

    return {
      type: 'text',
      text: `📋 ประวัติการแพ้อาหารของน้องที่ผมจำไว้ตอนนี้:\n👉 แพ้: ${allergies.map(a => `[${a}]`).join(', ')}\n\nเวลาคุณถามเรื่องอาหารที่มีส่วนผสมเหล่านี้ ผมจะขึ้นป้ายเตือนพิเศษให้ทันทีครับ! 🛡️\n(หากต้องการลบทั้งหมด พิมพ์ "ล้างข้อมูลแพ้" ได้เลยนะครับ)`,
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'message',
              label: '🧹 ล้างข้อมูลแพ้ทั้งหมด',
              text: 'ล้างข้อมูลแพ้'
            }
          }
        ]
      }
    };
  }

  // 4. กรณีพิมพ์มาแค่ "น้องแพ้" หรือ "หมาแพ้" โดยไม่ได้ระบุชนิดอาหาร
  if (/^(?:จำไว้ว่า|บันทึกว่า|ตั้งค่า|เพิ่ม)?[\s]*(?:น้องหมา|น้องแมว|ลูกหมา|ลูกแมว|หมา|สุนัข|แมว|น้อง)?[\s]*แพ้(?:อาหาร)?[\s]*(?:ครับ|ค่ะ|คะ)?$/i.test(trimmed)) {
    return {
      type: 'text',
      text: 'น้องแพ้อาหารชนิดไหนครับ? 🐾 พิมพ์บอกผมได้เลยนะ เช่น "น้องแพ้ไก่", "แพ้นมวัว" หรือ "แพ้ไก่กับไข่" เดี๋ยวผมจดจำไว้เตือนเวลาเช็คอาหารให้ครับ!'
    };
  }

  // 5. คำสั่งบันทึกการแพ้อาหาร เช่น "น้องแพ้ไก่", "หมาแพ้นม", "แพ้เนื้อวัว", "จำไว้ว่าน้องแพ้ไก่กับไข่"
  // ระวังไม่ให้ชนกับคำถาม เช่น "หมากินไก่แล้วแพ้ไหม" หรือ "แพ้ไก่มีอาการยังไง"
  if (/(?:ไหม|มั้ย|ป่าว|หรือเปล่า|ยังไง|อย่างไร|ทำไง)/.test(lower)) {
    return null;
  }

  const addMatch = trimmed.match(/^(?:จำไว้ว่า|บันทึกว่า|ตั้งค่า|เพิ่ม)?[\s]*(?:น้องหมา|น้องแมว|ลูกหมา|ลูกแมว|หมา|สุนัข|แมว|น้อง)?[\s]*แพ้[\s]*(.+)$/i);
  if (addMatch) {
    const rawPart = addMatch[1].trim();
    const extracted = parseAllergensFromText(rawPart);

    if (extracted.length > 0) {
      const updatedAllergies = addUserAllergies(userId, extracted);
      const addedListStr = extracted.map(a => `"${a}"`).join(', ');
      const allListStr = updatedAllergies.map(a => `[${a}]`).join(', ');

      return {
        type: 'text',
        text: `📝 จดจำไว้เรียบร้อยแล้วครับว่าน้องแพ้ ${addedListStr}! 🐾\n\n📌 รายการที่น้องแพ้ทั้งหมดตอนนี้: ${allListStr}\n\nต่อไปเวลาเช็คอาหารที่มีส่วนผสมนี้ ผมจะช่วยเตือนเป็นพิเศษให้เลยนะครับ (ถ้าอยากล้างประวัติ พิมพ์ "ล้างข้อมูลแพ้" ได้ตลอดเลยนะ)`,
        quickReply: {
          items: [
            {
              type: 'action',
              action: {
                type: 'message',
                label: '📋 ดูประวัติแพ้ของน้อง',
                text: 'เช็คประวัติแพ้'
              }
            },
            {
              type: 'action',
              action: {
                type: 'message',
                label: '🧹 ล้างข้อมูลแพ้',
                text: 'ล้างข้อมูลแพ้'
              }
            }
          ]
        }
      };
    }
  }

  return null;
}

/**
 * ตรวจสอบว่าอาหารที่กำลังค้นหา มีส่วนผสมตรงกับประวัติการแพ้ของผู้ใช้หรือไม่ (Cross-check)
 * @param {string} userId - LINE User ID
 * @param {object|null} matchedFood - ข้อมูลอาหารจาก foods.json (ถ้ามี)
 * @param {object|null} aiResult - ข้อมูลผลวิเคราะห์จาก Gemini AI (ถ้ามี)
 * @returns {string[]} รายชื่อสารก่อภูมิแพ้ที่ตรวจพบว่าชนกับประวัติของน้อง
 */
function checkAllergyConflict(userId, matchedFood = null, aiResult = null) {
  const userAllergies = getUserAllergies(userId);
  if (!userAllergies || userAllergies.length === 0) {
    return [];
  }

  // รวบรวมคำทั้งหมดที่เกี่ยวข้องกับอาหารชิ้นนี้
  const foodTargets = [];
  if (matchedFood) {
    if (Array.isArray(matchedFood.allergens)) {
      foodTargets.push(...matchedFood.allergens);
    }
    foodTargets.push(matchedFood.name);
    if (Array.isArray(matchedFood.aliases)) {
      foodTargets.push(...matchedFood.aliases);
    }
  }

  if (aiResult) {
    if (aiResult.extractedFoodName) {
      foodTargets.push(aiResult.extractedFoodName);
    }
    if (Array.isArray(aiResult.suspectedIngredients)) {
      foodTargets.push(...aiResult.suspectedIngredients);
    }
  }

  const normalizedTargets = foodTargets.map(t => t.toLowerCase());
  const triggeredAllergies = [];

  for (const userAllergen of userAllergies) {
    const allergenLower = userAllergen.toLowerCase();
    // ดึงกลุ่มคำพ้องรูป (เช่น ถ้าน้องบันทึกว่า "แพ้นม" จะเช็คคำว่า "ชีส", "แลคโตส", "นมวัว" ด้วย)
    const expandTerms = ALLERGEN_SYNONYMS[allergenLower] || [allergenLower];

    const isMatched = expandTerms.some(term =>
      normalizedTargets.some(target => target.includes(term.toLowerCase()) || term.toLowerCase().includes(target))
    );

    if (isMatched) {
      triggeredAllergies.push(userAllergen);
    }
  }

  return triggeredAllergies;
}

module.exports = {
  getUserAllergies,
  addUserAllergies,
  clearUserAllergies,
  handleAllergyCommand,
  checkAllergyConflict
};
