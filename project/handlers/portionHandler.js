/**
 * portionHandler.js - ระบบสนทนาและคำนวณปริมาณอาหารต่อวันตามน้ำหนักและช่วงวัย (Phase 4)
 *
 * รองรับ 2 รูปแบบการใช้งาน:
 * 1. แบบถาม-ตอบทีละขั้น (Step-by-step Conversation State):
 *    พิมพ์ "คำนวณอาหาร" -> เลือกชนิดสัตว์ -> พิมพ์น้ำหนัก (กก.) -> เลือกช่วงวัย -> รับการ์ดผลลัพธ์
 * 2. แบบพิมพ์รวดเดียวจบ (One-shot Smart Extraction):
 *    เช่น "คำนวณอาหารหมาโตหนัก 10 กิโล" -> สกัดชนิดสัตว์ น้ำหนัก และช่วงวัย แล้วแสดงการ์ดผลลัพธ์ทันที!
 */

const { detectPetType } = require('../utils/textMatcher');
const { calculateDailyPortion } = require('../utils/calculator');
const { createPortionResultFlex } = require('../flex/templates');

// เก็บสถานะการสนทนาคำนวณอาหารของผู้ใช้แต่ละคน (userId -> { step, petType, weightKg, lifeStage })
const portionSessions = new Map();

// คีย์เวิร์ดเริ่มต้นโหมดคำนวณปริมาณอาหาร
const PORTION_TRIGGER_KEYWORDS = [
  'คำนวณอาหาร',
  'คำนวณปริมาณอาหาร',
  'คำนวณมื้ออาหาร',
  'คำนวณแคลอรี',
  'กินวันละเท่าไหร่',
  'กินวันละกี่กรัม',
  'ให้กินเท่าไหร่',
  'กินปริมาณเท่าไหร่',
  'ต้องกินกี่กรัม'
];

/**
 * ตรวจจับช่วงวัยจากข้อความ
 * @param {string} text
 * @returns {'puppy'|'adult'|'senior'|null}
 */
function detectLifeStage(text) {
  const lower = text.toLowerCase();
  if (/(?:ลูกหมา|ลูกแมว|ลูกสัตว์|เด็ก|วัยเด็ก|ไม่ถึงปี|เดือน|puppy|kitten)/.test(lower)) {
    return 'puppy';
  }
  if (/(?:สูงวัย|แก่|ชรา|วัยเก๋า|อายุมาก|7\s*ปีขึ้น|senior)/.test(lower)) {
    return 'senior';
  }
  if (/(?:โตเต็มวัย|โตแล้ว|หมาโต|แมวโต|วัยรุ่น|ผู้ใหญ่|adult)/.test(lower)) {
    return 'adult';
  }
  return null;
}

/**
 * สกัดค่าน้ำหนักตัว (กิโลกรัม) จากข้อความ เช่น "หนัก 4.5 กก.", "10 กิโล", "5.2"
 * @param {string} text
 * @param {boolean} allowBareNumber - ยอมรับตัวเลขล้วนๆ หรือไม่ (ใช้ตอนอยู่ในสเต็ปถามน้ำหนัก)
 * @returns {number|null}
 */
function extractWeightKg(text, allowBareNumber = false) {
  const normalized = text.trim();

  // 1. ค้นหาตัวเลขที่มีหน่วยน้ำหนักตามหลัง เช่น "4.5 กก.", "10 กิโล", "3.2 kg", "หนัก 8"
  const unitMatch = normalized.match(/(?:หนัก\s*)?(\d+(?:\.\d+)?)\s*(?:กก\.?|กิโลกรัม|กิโล|โล|kg)/i);
  if (unitMatch) {
    const val = parseFloat(unitMatch[1]);
    if (val >= 0.1 && val <= 120) return val;
  }

  const prefixMatch = normalized.match(/หนัก\s*(\d+(?:\.\d+)?)/i);
  if (prefixMatch) {
    const val = parseFloat(prefixMatch[1]);
    if (val >= 0.1 && val <= 120) return val;
  }

  // 2. หากอยู่ในสเต็ปที่บอทเพิ่งถามน้ำหนัก ให้ยอมรับตัวเลขล้วนได้ เช่น "4.5" หรือ "12"
  if (allowBareNumber) {
    const bareMatch = normalized.match(/^(\d+(?:\.\d+)?)$/);
    if (bareMatch) {
      const val = parseFloat(bareMatch[1]);
      if (val >= 0.1 && val <= 120) return val;
    }
  }

  return null;
}

/**
 * สร้างข้อความพร้อมปุ่ม Quick Reply เพื่อถามชนิดสัตว์เลี้ยงสำหรับคำนวณอาหาร
 */
function askPetTypeForPortion() {
  return {
    type: 'text',
    text: '⚖️ มาคำนวณปริมาณอาหารต่อวันให้น้องกันครับ!\n\nขั้นแรก อยากคำนวณให้น้องหมาหรือน้องแมวครับ? จิ้มปุ่มด้านล่างได้เลย 👇',
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'message', label: '🐶 น้องหมา', text: 'คำนวณให้น้องหมา' }
        },
        {
          type: 'action',
          action: { type: 'message', label: '🐱 น้องแมว', text: 'คำนวณให้น้องแมว' }
        },
        {
          type: 'action',
          action: { type: 'message', label: '❌ ยกเลิก', text: 'ยกเลิกคำนวณ' }
        }
      ]
    }
  };
}

/**
 * สร้างข้อความพร้อมปุ่ม Quick Reply เพื่อถามน้ำหนักตัว (กก.)
 * @param {'dog'|'cat'} petType
 */
function askWeightForPortion(petType) {
  const isDog = petType === 'dog';
  const petName = isDog ? 'น้องหมา 🐶' : 'น้องแมว 🐱';
  const sampleWeights = isDog ? ['3 กก.', '5 กก.', '10 กก.', '20 กก.'] : ['2 กก.', '3.5 กก.', '4.5 กก.', '6 กก.'];

  return {
    type: 'text',
    text: `ตอนนี้${petName}หนักประมาณกี่กิโลกรัม (กก.) ครับ? ⚖️\n(พิมพ์ตัวเลขเช่น "4.5" หรือกดเลือกน้ำหนักด้านล่างได้เลยครับ)`,
    quickReply: {
      items: [
        ...sampleWeights.map(w => ({
          type: 'action',
          action: { type: 'message', label: `⚖️ ${w}`, text: w }
        })),
        {
          type: 'action',
          action: { type: 'message', label: '❌ ยกเลิก', text: 'ยกเลิกคำนวณ' }
        }
      ]
    }
  };
}

/**
 * สร้างข้อความพร้อมปุ่ม Quick Reply เพื่อถามช่วงวัยของสัตว์เลี้ยง
 * @param {'dog'|'cat'} petType
 * @param {number} weightKg
 */
function askLifeStageForPortion(petType, weightKg) {
  const isDog = petType === 'dog';
  const petName = isDog ? 'น้องหมา 🐶' : 'น้องแมว 🐱';
  const babyLabel = isDog ? '🐣 ลูกหมา (< 1 ปี)' : '🐣 ลูกแมว (< 1 ปี)';

  return {
    type: 'text',
    text: `รับทราบครับ! ${petName} หนัก ${weightKg} กก. ✨\n\nขั้นตอนสุดท้าย น้องอยู่ในช่วงวัยไหนครับ? กดเลือกด้านล่างได้เลย 👇`,
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'message', label: babyLabel, text: 'วัย: ลูกสัตว์' }
        },
        {
          type: 'action',
          action: { type: 'message', label: '🐕 โตเต็มวัย (1-7 ปี)', text: 'วัย: โตเต็มวัย' }
        },
        {
          type: 'action',
          action: { type: 'message', label: '🧓 สูงวัย (7 ปีขึ้นไป)', text: 'วัย: สูงวัย' }
        },
        {
          type: 'action',
          action: { type: 'message', label: '❌ ยกเลิก', text: 'ยกเลิกคำนวณ' }
        }
      ]
    }
  };
}

/**
 * จัดการบทสนทนาคำนวณปริมาณอาหาร (Phase 4)
 * @param {string} text - ข้อความที่ผู้ใช้พิมพ์
 * @param {string} userId - LINE User ID
 * @param {Map} [userPetMemory] - หน่วยความจำชนิดสัตว์ของผู้ใช้
 * @returns {object|null} LINE Message Object หากอยู่ในโหมดคำนวณอาหาร หรือ null หากไม่ใช่คำสั่งคำนวณอาหาร
 */
function handlePortionCommand(text, userId, userPetMemory = null) {
  if (!text || !userId) return null;
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // 1. ตรวจสอบคำสั่งยกเลิกโหมดคำนวณอาหาร
  if (['ยกเลิกคำนวณ', 'ยกเลิก', 'ออก', 'พอแค่นี้'].includes(lower) && portionSessions.has(userId)) {
    portionSessions.delete(userId);
    return {
      type: 'text',
      text: 'ยกเลิกการคำนวณปริมาณอาหารเรียบร้อยครับ 🐾 หากอยากเช็คความปลอดภัยของอาหารชิ้นไหน พิมพ์ชื่ออาหารถามผมได้เลยนะ!'
    };
  }

  const hasActiveSession = portionSessions.has(userId);
  const isTriggerWord =
    PORTION_TRIGGER_KEYWORDS.some(kw => lower.includes(kw)) ||
    lower === 'คำนวณให้น้องหมา' ||
    lower === 'คำนวณให้น้องแมว';

  // หากไม่ได้อยู่ใน Session และไม่ได้พิมพ์คีย์เวิร์ดคำนวณอาหาร ให้ผ่านไปทำงานส่วนอื่น
  if (!hasActiveSession && !isTriggerWord) {
    return null;
  }

  // กรณีเริ่มคำนวณใหม่ ("คำนวณอาหารใหม่" หรือกดปุ่มเริ่มใหม่)
  if (lower.includes('คำนวณอาหารใหม่')) {
    portionSessions.set(userId, {
      petType: userPetMemory && userPetMemory.has(userId) ? userPetMemory.get(userId) : null,
      weightKg: null,
      lifeStage: null
    });
    const session = portionSessions.get(userId);
    if (!session.petType) {
      return askPetTypeForPortion();
    }
    return askWeightForPortion(session.petType);
  }

  // ดึงหรือสร้าง Session ปัจจุบัน
  const session = portionSessions.get(userId) || {
    petType: userPetMemory && userPetMemory.has(userId) ? userPetMemory.get(userId) : null,
    weightKg: null,
    lifeStage: null
  };

  // สกัดข้อมูลจากข้อความปัจจุบัน (รองรับทั้งการตอบทีละขั้น และการพิมพ์รวดเดียว เช่น "คำนวณอาหารหมาโต 10 กิโล")
  const detectedPet = detectPetType(trimmed);
  if (detectedPet) {
    session.petType = detectedPet;
    if (userPetMemory) userPetMemory.set(userId, detectedPet);
  }

  const detectedWeight = extractWeightKg(trimmed, hasActiveSession && !session.weightKg);
  if (detectedWeight !== null) {
    session.weightKg = detectedWeight;
  }

  const detectedStage = detectLifeStage(trimmed);
  if (detectedStage) {
    session.lifeStage = detectedStage;
  }

  // ตรวจสอบกรณีผู้ใช้พยายามกรอกน้ำหนักแต่ค่าผิดปกติ (เช่น ติดลบ, 0, หรือเกิน 120 กก.)
  const invalidNumberAttempt =
    /(?:-\d+|\b0(?:\.0+)?\b|\d+\s*(?:กก\.?|กิโลกรัม|กิโล|โล|kg))/i.test(trimmed) &&
    detectedWeight === null;

  if ((hasActiveSession || isTriggerWord) && invalidNumberAttempt) {
    portionSessions.set(userId, session);
    return {
      type: 'text',
      text: '⚠️ น้ำหนักต้องอยู่ระหว่าง 0.1 ถึง 120 กิโลกรัม (กก.) นะครับ รบกวนพิมพ์น้ำหนักของน้องใหม่อีกครั้ง เช่น "4.5" หรือ "10 กก." ครับ ⚖️🐾'
    };
  }

  // Escape Hatch: หากผู้ใช้เคยค้างอยู่ใน Session แต่จู่ๆ พิมพ์ชื่ออาหารอื่นที่ไม่ใช่ตัวเลข/ช่วงวัย/สัตว์เลี้ยง
  // ให้ล้าง Session เพื่อให้ระบบไปเช็คอาหารตามปกติ ไม่ทำให้ผู้ใช้ติดค้างในลูป
  if (hasActiveSession && !isTriggerWord && !detectedPet && detectedWeight === null && !detectedStage) {
    portionSessions.delete(userId);
    return null;
  }

  // บันทึกสถานะล่าสุดลง Session
  portionSessions.set(userId, session);

  // ตรวจสอบว่ายังขาดข้อมูลตัวไหน ให้ถามตัวนั้นตามลำดับ
  if (!session.petType) {
    return askPetTypeForPortion();
  }

  if (session.weightKg === null) {
    return askWeightForPortion(session.petType);
  }

  if (!session.lifeStage) {
    return askLifeStageForPortion(session.petType, session.weightKg);
  }

  // เมื่อได้ข้อมูลครบทั้ง 3 อย่าง (petType, weightKg, lifeStage) -> คำนวณและส่งการ์ด Flex Message ทันที!
  const result = calculateDailyPortion(session.petType, session.weightKg, session.lifeStage);
  portionSessions.delete(userId);

  return createPortionResultFlex(result);
}

module.exports = {
  handlePortionCommand,
  portionSessions
};
