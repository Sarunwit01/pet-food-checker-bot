/**
 * geminiService.js - บริการเชื่อมต่อ Google Gemini API สำหรับระบบ Hybrid (AI + Database)
 * ทำหน้าที่:
 * 1. Smart NLU & Food Matching: ตีความประโยคซับซ้อนและจับคู่กับรายการอาหารใน foods.json
 * 2. RAG Grounded Response: อธิบายเสริมอย่างเป็นมิตรโดยอิงจากฐานข้อมูลเป็นหลัก
 * 3. AI Ingredient Warning: วิเคราะห์ส่วนผสมที่อาจเป็นอันตรายสำหรับเมนูที่ไม่อยู่ในฐานข้อมูลโดยตรง
 */

const { foods } = require('../utils/foodStore');

// ลำดับโมเดลสำหรับเรียกใช้งานและสลับอัตโนมัติ (Model Fallback Chain)
// ใช้ gemini-2.5-flash และ gemini-3.5-flash เป็นหลักเพราะเสถียรและเร็ว (~2.5-4.5s)
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];

function getCandidateModels() {
  const envModel = process.env.GEMINI_MODEL ? process.env.GEMINI_MODEL.trim() : '';
  // หาก env ตั้งเป็น gemini-3.5-flash-lite ซึ่งมักเจอ 503 High Demand ให้เริ่มที่ gemini-2.5-flash ก่อนแล้วค่อย fallback
  if (!envModel || envModel === 'gemini-3.5-flash-lite') {
    return FALLBACK_MODELS;
  }
  return [envModel, ...FALLBACK_MODELS.filter(m => m !== envModel)];
}

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
 * สร้างสรุปฐานข้อมูล foods.json แบบกระชับเพื่อแนบเป็น Context ให้ Gemini ตอบกลับได้รวดเร็ว
 */
function buildDatabaseContext() {
  return foods
    .map(item => `- id: "${item.id}" | ชื่อ: ${item.name} | คำพ้อง: ${item.aliases.slice(0, 5).join(', ')}`)
    .join('\n');
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
  const dbContext = buildDatabaseContext();

  const systemInstruction = `คุณคือผู้ช่วยสัตวแพทย์อัจฉริยะของบอท "PawSafe (Pet Food Checker)" ระบบ Hybrid (AI + Database)
หน้าที่ของคุณคือวิเคราะห์คำถามของผู้ใช้เกี่ยวกับอาหาร ขนม เครื่องดื่ม พืช หรือสิ่งของที่สุนัข (dog) และแมว (cat) อาจกินเข้าไป โดยยึดหลักความปลอดภัยสูงสุด (Safety First):

รายการอาหารในฐานข้อมูลหลัก (foods.json):
${dbContext}

กฎการทำงาน 4 ข้อของคุณ:
1. [แก้คำพิมพ์ผิดอัตโนมัติ (Typo Correction) & จับคู่ฐานข้อมูล]:
   - หากผู้ใช้พิมพ์ชื่ออาหารผิด สะกดเพี้ยน หรือพิมพ์ตกหล่น (เช่น "ช็อกโกเเลต", "ช๊อกโกแลตต", "ชอกโกแลด", "องุ่นน", "ลูกเกต", "เเครอท", "อะโวคาโด้") ให้ตีความเป็นคำที่ถูกต้องทันที!
   - หากคำที่แก้แล้วตรงกับรายการในฐานข้อมูลหลัก หรือเป็นเมนูที่มีส่วนผสมหลักตัวนั้นชัดเจน (เช่น "บราวนี่" -> "chocolate") ให้ระบุ matchedFoodId เป็น id นั้นทันที
   - หากไม่อยู่ในฐานข้อมูลหลัก ให้ตั้งค่า matchedFoodId เป็น null และตั้งค่า isFoodQuery = true เสมอ

2. [รองรับคำหมวดหมู่กว้างๆ เช่น "ขนม", "ผลไม้", "ผัก", "อาหารคน", "ลูกอม", "เนื้อ"]:
   - หากผู้ใช้พิมพ์คำกว้างๆ เช่น "ขนม" ห้ามปฏิเสธว่าไม่พบข้อมูลเด็ดขาด! ให้ตั้งค่า isFoodQuery = true, matchedFoodId = null, extractedFoodName = คำที่ถาม (เช่น "ขนม (ทั่วไป)")
   - ประเมินความเสี่ยงเป็น "caution" และระบุ suspectedIngredients เช่น ["น้ำตาลและเกลือสูง (ขนมคน)", "ช็อกโกแลต / ผงโกโก้", "ไซลิทอล (น้ำตาลเทียม)", "ลูกเกด / ถั่วแมคคาเดเมีย"]
   - ใน aiExplanation ให้อธิบายอย่างเป็นมิตรว่า: ขนมสำหรับสัตว์เลี้ยงโดยเฉพาะกินได้ แต่ขนมของคนส่วนใหญ่มีน้ำตาล โซเดียม หรือสารพิษที่อันตราย หากอยากเช็คขนมชิ้นไหนเป็นพิเศษให้พิมพ์ชื่อขนมนั้นมาได้เลย

3. [AI Ingredient Warning (สำหรับอาหาร/เมนูทุกชนิดที่ไม่อยู่ในฐานข้อมูล)]:
   - ให้ตั้งค่า isFoodQuery = true เสมอสำหรับอาหาร ขนม เครื่องดื่ม พืช ยา หรือของกินทุกชนิด
   - ระบุชื่ออาหารที่ถูกต้องใน extractedFoodName
   - ประเมินความเสี่ยงใน estimatedRisk ("danger" | "caution" | "safe")
   - ระบุส่วนผสมที่ต้องระวังหรือข้อควรระวังใน suspectedIngredients
   - อธิบายเหตุผลสั้นกระชับ เข้าใจง่าย เป็นกันเอง 1-2 ประโยคใน aiExplanation

4. การระบุชนิดสัตว์ (detectedPetType):
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

  const modelsToTry = getCandidateModels();

  for (const modelName of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // Timeout 12 วินาทีต่อโมเดล แล้วสลับตัวถัดไปทันที

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
        console.warn(`⚠️ Gemini model "${modelName}" returned status ${response.status}, trying next fallback...`, errText.slice(0, 120));
        continue;
      }

      const data = await response.json();
      const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJson) continue;

      return JSON.parse(rawJson);
    } catch (err) {
      console.warn(`⚠️ Gemini model "${modelName}" failed (${err.message}), trying next fallback...`);
    }
  }

  return null;
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
  const modelsToTry = getCandidateModels();

  for (const modelName of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

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
        console.warn(`⚠️ Gemini Audio STT model "${modelName}" returned status ${response.status}, trying next fallback...`);
        continue;
      }

      const data = await response.json();
      const transcript = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!transcript || transcript === 'EMPTY') {
        return null;
      }

      return transcript;
    } catch (err) {
      console.warn(`⚠️ Gemini Audio STT model "${modelName}" failed (${err.message}), trying next fallback...`);
    }
  }

  return null;
}

module.exports = {
  isGeminiConfigured,
  getCandidateModels,
  analyzeFoodWithGemini,
  transcribeAudioWithGemini
};
