/**
 * geminiService.js - บริการเชื่อมต่อ Google Gemini API สำหรับระบบ Hybrid (AI + Database)
 * ทำหน้าที่:
 * 1. Smart NLU & Food Matching: ตีความประโยคซับซ้อนและจับคู่กับรายการอาหารใน foods.json
 * 2. RAG Grounded Response: อธิบายเสริมอย่างเป็นมิตรโดยอิงจากฐานข้อมูลเป็นหลัก
 * 3. AI Ingredient Warning: วิเคราะห์ส่วนผสมที่อาจเป็นอันตรายสำหรับเมนูที่ไม่อยู่ในฐานข้อมูลโดยตรง
 */

const foods = require('../data/foods.json');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

/**
 * ตรวจสอบว่ามีการตั้งค่า GEMINI_API_KEY ที่ใช้งานได้หรือไม่
 * @returns {boolean}
 */
function isGeminiConfigured() {
  const apiKey = process.env.GEMINI_API_KEY;
  return Boolean(
    apiKey &&
    apiKey.trim() !== '' &&
    apiKey !== 'your_gemini_api_key_here' &&
    apiKey !== 'YOUR_GEMINI_API_KEY'
  );
}

/**
 * สร้างสรุปฐานข้อมูล foods.json เพื่อแนบเป็น Context (RAG Grounding) ให้ Gemini
 */
function buildDatabaseContext() {
  return foods.map(item => ({
    id: item.id,
    name: item.name,
    aliases: item.aliases,
    allergens: item.allergens,
    dog_status: item.dog.status,
    dog_reason: item.dog.reason,
    cat_status: item.cat.status,
    cat_reason: item.cat.reason,
    source: item.source
  }));
}

/**
 * วิเคราะห์ข้อความของผู้ใช้ด้วย Google Gemini API (Structured JSON Output)
 * @param {string} userText - ข้อความที่ผู้ใช้พิมพ์
 * @param {'dog'|'cat'|null} rememberedPet - ชนิดสัตว์ที่ระบบจำไว้ก่อนหน้า (ถ้ามี)
 * @returns {Promise<object|null>} ผลลัพธ์การวิเคราะห์จาก AI หรือ null หากเรียกไม่สำเร็จ/ไม่ได้ตั้งค่าคีย์
 */
async function analyzeFoodWithGemini(userText, rememberedPet = null) {
  if (!isGeminiConfigured()) {
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY.trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const dbContext = JSON.stringify(buildDatabaseContext(), null, 2);

  const systemInstruction = `คุณคือผู้ช่วยสัตวแพทย์อัจฉริยะของบอท "Pet Food Checker" ระบบ Hybrid (AI + Database)
หน้าที่ของคุณคือวิเคราะห์คำถามของผู้ใช้เกี่ยวกับอาหารของสุนัข (dog) และแมว (cat) โดยยึดหลักความปลอดภัยสูงสุด (Safety First):

รายการอาหารในฐานข้อมูลที่ได้รับการยืนยันแล้ว (foods.json):
${dbContext}

กฎการทำงาน 3 ข้อของคุณ:
1. [Smart NLU & Food Matching]:
   - หากผู้ใช้ถามถึงอาหารที่ตรงกับรายการในฐานข้อมูลโดยตรง (เช่น "ช็อกโกแลต", "องุ่น", "กระเทียม", "ไก่ต้ม", "ชีส", "แอปเปิ้ล", "เมล็ดแอปเปิ้ล", "ไซลิทอล") ให้ระบุ matchedFoodId เป็น id ของอาหารนั้น
   - หากผู้ใช้ถามถึงเมนูอาหารที่มีส่วนผสมหลักเป็นสารอันตรายชัดเจนในฐานข้อมูลเดียว เช่น "บราวนี่" หรือ "เค้กช็อกโกแลต" (มีช็อกโกแลตเป็นหลัก) สามารถจับคู่ matchedFoodId = "chocolate" ได้เลย พร้อมอธิบายใน aiExplanation ว่าบราวนี่มีช็อกโกแลตเป็นส่วนผสมหลัก
   - หากเป็นเมนูผสมอื่นๆ หรืออาหารที่ไม่ได้อยู่ในฐานข้อมูล (เช่น "ชานมไข่มุก", "ส้มตำ", "หมูปิ้ง", "ทุเรียน", "ปลาทูทอด") ให้ตั้งค่า matchedFoodId เป็น null

2. [RAG Grounded Response]:
   - สร้างข้อความอธิบายเสริม (aiExplanation) ความยาวสั้นกระชับ 1-2 ประโยค ด้วยน้ำเสียงอบอุ่น เป็นมิตร เข้ากับคำถามของผู้ใช้โดยตรง
   - ห้ามขัดแย้งกับข้อมูลในฐานข้อมูลเด็ดขาด

3. [AI Ingredient Warning (สำหรับอาหารที่ matchedFoodId เป็น null)]:
   - ให้ระบุชื่ออาหารที่สกัดได้ใน extractedFoodName
   - ประเมินความเสี่ยงเบื้องต้นใน estimatedRisk ("danger" | "caution" | "safe") โดยยึดหลักระมัดระวังไว้ก่อน (หากมีเครื่องปรุง น้ำตาล เกลือ ผงชูรส นม หรือไม่แน่ใจ ให้เลือก "caution" หรือ "danger")
   - ระบุส่วนผสมที่ต้องระวังใน suspectedIngredients (เช่น ["น้ำตาลสูง", "นมวัว (แลคโตส)", "คาเฟอีนในชา"])
   - อธิบายเหตุผลเตือนภัยเบื้องต้นใน aiExplanation และย้ำเสมอว่าต้องปรึกษาสัตวแพทย์ก่อนให้กินจริง

การระบุชนิดสัตว์ (detectedPetType):
- หากในข้อความระบุว่า หมา/สุนัข ให้ตอบ "dog"
- หากในข้อความระบุว่า แมว/เหมียว ให้ตอบ "cat"
- หากในข้อความไม่ได้ระบุ ให้ใช้ค่าความจำเดิมคือ: ${rememberedPet ? `"${rememberedPet}"` : 'null'}`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      isFoodQuery: {
        type: 'BOOLEAN',
        description: 'เป็นคำถามหรือข้อความเกี่ยวกับการตรวจสอบอาหารสัตว์ใช่หรือไม่'
      },
      detectedPetType: {
        type: 'STRING',
        nullable: true,
        enum: ['dog', 'cat'],
        description: 'ชนิดสัตว์เลี้ยงที่ตรวจพบจากข้อความ หรือจากความจำเดิม'
      },
      extractedFoodName: {
        type: 'STRING',
        nullable: true,
        description: 'ชื่ออาหารหรือเมนูที่ผู้ใช้ถามถึง (เช่น "บราวนี่", "ชานมไข่มุก", "องุ่น")'
      },
      matchedFoodId: {
        type: 'STRING',
        nullable: true,
        description: 'id ของอาหารจากฐานข้อมูล foods.json ที่ตรงกัน หรือ null หากไม่มีในฐานข้อมูล'
      },
      estimatedRisk: {
        type: 'STRING',
        enum: ['danger', 'caution', 'safe'],
        description: 'ระดับความเสี่ยงประเมินเบื้องต้นสำหรับกรณีไม่อยู่ในฐานข้อมูล'
      },
      suspectedIngredients: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'รายการส่วนผสมในเมนูที่อาจก่ออันตรายหรือต้องระวังสำหรับสัตว์เลี้ยง'
      },
      aiExplanation: {
        type: 'STRING',
        description: 'คำอธิบายเสริมที่เป็นมิตร ตอบตรงคำถามของผู้ใช้ 1-2 ประโยค (ภาษาไทย)'
      }
    },
    required: [
      'isFoodQuery',
      'detectedPetType',
      'extractedFoodName',
      'matchedFoodId',
      'estimatedRisk',
      'suspectedIngredients',
      'aiExplanation'
    ]
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // Timeout 8 วินาทีเพื่อให้ทัน LINE replyToken

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userText }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`⚠️ Gemini API returned status ${response.status}:`, errText);
      return null;
    }

    const data = await response.json();
    const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) return null;

    return JSON.parse(rawJson);
  } catch (err) {
    console.error('⚠️ Gemini API call failed (falling back to local matcher):', err.message);
    return null;
  }
}

/**
 * ถอดความไฟล์เสียงภาษาไทย (Speech-to-Text) จาก LINE Audio Message ด้วย Google Gemini Multimodal API (Phase 5)
 * @param {string} base64Audio - ข้อมูลไฟล์เสียงแบบ Base64 (เช่น .m4a จาก LINE)
 * @param {string} [mimeType='audio/mp4'] - ชนิดไฟล์เสียง (LINE ส่งมาเป็น audio/mp4 หรือ audio/m4a)
 * @returns {Promise<string|null>} ข้อความภาษาไทยที่ถอดเสียงได้ หรือ null หากไม่สำเร็จ
 */
async function transcribeAudioWithGemini(base64Audio, mimeType = 'audio/mp4') {
  if (!isGeminiConfigured() || !base64Audio) {
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY.trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'ถอดเสียงพูดภาษาไทยจากคลิปเสียงนี้เป็นข้อความตัวอักษรให้ตรงตามที่ได้ยินมากที่สุด (ตอบเฉพาะข้อความที่ถอดเสียงได้เท่านั้น ห้ามใส่เครื่องหมายคำพูดหรือคำอธิบายอื่น หากไม่ได้ยินเสียงพูดเลยให้ตอบคำว่า EMPTY)'
              },
              {
                inlineData: {
                  mimeType,
                  data: base64Audio
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`⚠️ Gemini Audio STT returned status ${response.status}:`, errText);
      return null;
    }

    const data = await response.json();
    const transcript = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!transcript || transcript === 'EMPTY') {
      return null;
    }

    return transcript;
  } catch (err) {
    console.error('⚠️ Gemini Audio STT failed:', err.message);
    return null;
  }
}

module.exports = {
  isGeminiConfigured,
  analyzeFoodWithGemini,
  transcribeAudioWithGemini
};
