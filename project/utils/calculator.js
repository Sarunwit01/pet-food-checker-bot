/**
 * calculator.js - ฟังก์ชันคำนวณพลังงานและปริมาณอาหารต่อวันสำหรับสุนัขและแมว (Phase 4)
 *
 * อ้างอิงสูตรมาตรฐานทางสัตวแพทย์ (WSAVA Global Nutrition Guidelines / NRC):
 * - RER (Resting Energy Requirement) = 70 * (น้ำหนักตัวเป็น kg ^ 0.75) kcal/วัน
 * - MER (Maintenance Energy Requirement) = RER * ตัวคูณตามช่วงวัยและชนิดสัตว์
 * - ปริมาณอาหารเม็ดโดยประมาณ: คำนวณจากค่าเฉลี่ยพลังงานอาหารเม็ดมาตรฐาน (~3.6 kcal ต่อกรัม หรือ 3,600 kcal/kg)
 * - ปริมาณอาหารสด/บาร์ฟโดยประมาณ: คิดเป็นร้อยละของน้ำหนักตัว (ประมาณ 2% - 3% สำหรับสัตว์โต และ 4% - 6% สำหรับลูกสัตว์)
 */

const LIFE_STAGE_CONFIG = {
  dog: {
    puppy: {
      label: 'ลูกหมา (อายุน้อยกว่า 1 ปี)',
      minFactor: 2.0,
      maxFactor: 3.0,
      freshPercentMin: 4.0,
      freshPercentMax: 6.0,
      mealsPerDay: '3 - 4 มื้อ/วัน',
      tip: 'วัยกำลังโตต้องการพลังงานและโปรตีนสูง ควรแบ่งให้หลายมื้อย่อยๆ เพื่อไม่ให้ท้องอืดนะครับ'
    },
    adult: {
      label: 'โตเต็มวัย (อายุ 1 - 7 ปี)',
      minFactor: 1.4,
      maxFactor: 1.6,
      freshPercentMin: 2.0,
      freshPercentMax: 3.0,
      mealsPerDay: '2 มื้อ/วัน (เช้า - เย็น)',
      tip: 'หากน้องทำหมันแล้วหรือออกกำลังกายน้อย แนะนำให้เลือกป้อนค่าต่ำสุดของช่วงเพื่อคุมน้ำหนักนะครับ'
    },
    senior: {
      label: 'สูงวัย (อายุ 7 ปีขึ้นไป)',
      minFactor: 1.1,
      maxFactor: 1.3,
      freshPercentMin: 1.8,
      freshPercentMax: 2.5,
      mealsPerDay: '2 มื้อ/วัน (เน้นย่อยง่าย)',
      tip: 'น้องวัยเก๋าเผาผลาญน้อยลง ควรคุมแคลอรีไม่ให้อ้วนเพื่อถนอมข้อต่อและหัวใจครับ'
    }
  },
  cat: {
    puppy: {
      label: 'ลูกแมว (อายุน้อยกว่า 1 ปี)',
      minFactor: 2.0,
      maxFactor: 2.5,
      freshPercentMin: 4.0,
      freshPercentMax: 6.0,
      mealsPerDay: '3 - 4 มื้อ/วัน',
      tip: 'ลูกแมวกระเพาะเล็กแต่ใช้พลังงานเยอะ แนะนำแบ่งมื้อย่อยๆ และเน้นสูตรลูกแมวโดยเฉพาะนะครับ'
    },
    adult: {
      label: 'โตเต็มวัย (อายุ 1 - 7 ปี)',
      minFactor: 1.2,
      maxFactor: 1.4,
      freshPercentMin: 2.0,
      freshPercentMax: 3.0,
      mealsPerDay: '2 - 3 มื้อ/วัน',
      tip: 'แมวเลี้ยงในบ้านหรือทำหมันแล้วมักใช้พลังงานน้อย ระวังอย่าให้ขนมแมวเลียเกินโควตาแคลอรีต่อวันนะ'
    },
    senior: {
      label: 'สูงวัย (อายุ 7 ปีขึ้นไป)',
      minFactor: 1.0,
      maxFactor: 1.2,
      freshPercentMin: 1.8,
      freshPercentMax: 2.5,
      mealsPerDay: '2 - 3 มื้อ/วัน (เน้นย่อยง่ายและน้ำเพียงพอ)',
      tip: 'แมวสูงวัยควรเน้นอาหารที่ย่อยง่ายและกระตุ้นให้กินน้ำเยอะๆ เพื่อดูแลสุขภาพไตนะครับ'
    }
  }
};

// ค่าเฉลี่ยพลังงานของอาหารเม็ดมาตรฐาน (ประมาณ 3,600 kcal/kg = 3.6 kcal/g)
const DEFAULT_KIBBLE_KCAL_PER_GRAM = 3.6;

/**
 * คำนวณพลังงาน (RER, MER) และปริมาณอาหารต่อวัน
 * @param {'dog'|'cat'} petType - ชนิดสัตว์เลี้ยง
 * @param {number} weightKg - น้ำหนักตัว (กิโลกรัม)
 * @param {'puppy'|'adult'|'senior'} lifeStage - ช่วงวัย
 * @returns {object} ผลลัพธ์การคำนวณทั้งหมด
 */
function calculateDailyPortion(petType, weightKg, lifeStage = 'adult') {
  const validPet = petType === 'cat' ? 'cat' : 'dog';
  const validStage = ['puppy', 'adult', 'senior'].includes(lifeStage) ? lifeStage : 'adult';
  const config = LIFE_STAGE_CONFIG[validPet][validStage];

  // 1. คำนวณ RER = 70 * (BW ^ 0.75)
  const rer = Math.round(70 * Math.pow(weightKg, 0.75));

  // 2. คำนวณความต้องการพลังงานต่อวัน (MER Range)
  const minKcal = Math.round(rer * config.minFactor);
  const maxKcal = Math.round(rer * config.maxFactor);

  // 3. แปลงเป็นปริมาณอาหารเม็ดมาตรฐาน (กรัม/วัน) ปัดเศษให้ดูง่ายทีละ 5 กรัม
  const roundTo5 = num => Math.max(5, Math.round(num / 5) * 5);
  const minKibbleGrams = roundTo5(minKcal / DEFAULT_KIBBLE_KCAL_PER_GRAM);
  const maxKibbleGrams = roundTo5(maxKcal / DEFAULT_KIBBLE_KCAL_PER_GRAM);

  // 4. แปลงเป็นปริมาณอาหารสด/บาร์ฟโดยประมาณ (2-3% ของน้ำหนักตัวสำหรับสัตว์โต)
  const weightGrams = weightKg * 1000;
  const minFreshGrams = roundTo5((weightGrams * config.freshPercentMin) / 100);
  const maxFreshGrams = roundTo5((weightGrams * config.freshPercentMax) / 100);

  return {
    petType: validPet,
    weightKg: Number(weightKg.toFixed(1)),
    lifeStage: validStage,
    lifeStageLabel: config.label,
    rer,
    minKcal,
    maxKcal,
    minKibbleGrams,
    maxKibbleGrams,
    minFreshGrams,
    maxFreshGrams,
    mealsPerDay: config.mealsPerDay,
    tip: config.tip
  };
}

module.exports = {
  calculateDailyPortion,
  LIFE_STAGE_CONFIG
};
