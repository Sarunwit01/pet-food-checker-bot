/**
 * researchService.js - ให้ Gemini ค้นคว้าอาหารที่ไม่มีในฐานข้อมูลจากเว็บจริง (Google Search Grounding)
 * เงื่อนไขก่อนบันทึกลงฐานข้อมูล:
 *   1. ต้องมีแหล่งข้อมูลที่ไม่ซ้ำโดเมน และผ่านการยืนยันว่าถูกดึงมาจากการค้นหาจริง >= MIN_SOURCES (5)
 *   2. ผลสรุปของแหล่งข้อมูลต้อง "ตรงกัน" >= CONSENSUS (80%) ทั้งสุนัขและแมว
 * หากไม่ผ่านเงื่อนไข จะไม่บันทึก (คืน null) เพื่อไม่ให้ข้อมูลผิดเข้าฐานข้อมูล
 */

const { isGeminiConfigured, getCandidateModels } = require('./geminiService');
const { foods, addLearnedFood } = require('./foodStore');

const MIN_SOURCES = 5;
const CONSENSUS = 0.8;
const VALID = ['danger', 'caution', 'safe'];
const BADGES = {
  danger: '🚫 อันตราย ห้ามให้น้องกิน',
  caution: '⚠️ ให้ได้แต่ต้องระวัง',
  safe: '✅ กินได้อย่างปลอดภัย'
};

// จำผลที่ค้นแล้วไม่ผ่านไว้ชั่วคราว ไม่ต้องเสียโควตาค้นซ้ำ (key -> timestamp)
const failedCache = new Map();
const FAIL_TTL_MS = 60 * 60 * 1000;
// กันการค้นซ้ำพร้อมกันของคำเดียวกัน
const inflight = new Map();

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** หาสถานะที่เสียงข้างมากและเช็คว่าตรงกันถึงเกณฑ์หรือไม่ */
function consensusOf(statuses) {
  const count = {};
  statuses.forEach(s => { count[s] = (count[s] || 0) + 1; });
  const [top, n] = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  return { status: top, ratio: n / statuses.length };
}

async function callSearchModel(prompt, apiKey) {
  for (const model of getCandidateModels()) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.1 }
        }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) {
        console.warn(`⚠️ Research model "${model}" status ${res.status}, trying next...`);
        continue;
      }
      const data = await res.json();
      const cand = data?.candidates?.[0];
      const text = (cand?.content?.parts || []).map(p => p.text || '').join('');
      const chunks = cand?.groundingMetadata?.groundingChunks || [];
      if (text) return { text, chunks };
    } catch (err) {
      console.warn(`⚠️ Research model "${model}" failed (${err.message}), trying next...`);
    }
  }
  return null;
}

async function doResearch(foodName) {
  const apiKey = process.env.GEMINI_API_KEY.trim();

  const prompt = `ค้นหาข้อมูลจากเว็บจริงด้วย Google Search ว่า "${foodName}" ปลอดภัยสำหรับสุนัขและแมวหรือไม่
ให้ค้นหาเป็นภาษาอังกฤษด้วย (เช่น "is ${foodName} safe for dogs and cats") แล้วใส่ใน sources ให้ครบทุกเว็บไซต์ที่ค้นพบและมีข้อมูลเรื่องนี้จริง (พยายามให้ได้ 8 แหล่งขึ้นไป อย่างน้อย ${MIN_SOURCES} แหล่ง คนละโดเมนกัน) (เช่น ASPCA, AKC, Merck Veterinary Manual, PetMD, VCA Hospitals, Cornell Vet, สัตวแพทยสภา, มหาวิทยาลัย/โรงพยาบาลสัตว์)
ห้ามเดาหรือแต่งข้อมูลหรือ URL เอง ใช้เฉพาะสิ่งที่พบจากการค้นหาจริงเท่านั้น

ตอบกลับเป็น JSON ล้วน (ไม่มี markdown) รูปแบบนี้:
{
 "isSpecificFood": true/false,   // false ถ้าเป็นคำกว้างเกินไป (เช่น "ขนม", "ผลไม้") หรือไม่ใช่สิ่งที่กินได้
 "nameTh": "ชื่อภาษาไทยที่ถูกต้อง",
 "aliases": ["ชื่อเรียกอื่นภาษาไทย/อังกฤษ"],
 "allergens": ["กลุ่มสารก่อภูมิแพ้ที่เกี่ยวข้อง เช่น ไก่ นม ถั่ว (ถ้าไม่มีให้เป็น [])"],
 "sources": [
   {"site": "โดเมน เช่น aspca.org", "url": "URL หน้าที่ใช้", "dog": "danger|caution|safe", "cat": "danger|caution|safe"}
 ],
 "dogReason": "สรุปเหตุผลสำหรับสุนัข 2-3 ประโยคภาษาไทย (สารที่เกี่ยวข้อง อาการ ปริมาณที่ระวัง)",
 "catReason": "สรุปเหตุผลสำหรับแมว 2-3 ประโยคภาษาไทย"
}
danger = เป็นพิษ/ห้ามให้, caution = ให้ได้เล็กน้อยหรือต้องเตรียมพิเศษ, safe = ปลอดภัย`;

  const result = await callSearchModel(prompt, apiKey);
  if (!result) return { ok: false, reason: 'no_response' };

  let parsed;
  try {
    const m = result.text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m[0]);
  } catch {
    return { ok: false, reason: 'bad_json' };
  }
  if (!parsed.isSpecificFood) return { ok: false, reason: 'not_specific' };

  // ยืนยันว่าแหล่งที่โมเดลอ้างถูกดึงมาจากการค้นหาจริง (ตรงกับ grounding metadata)
  const groundedDomains = new Set(
    result.chunks.map(c => (c.web?.title || domainOf(c.web?.uri) || '').toLowerCase().replace(/^www\./, ''))
  );
  const seen = new Set();
  const sources = [];
  for (const s of parsed.sources || []) {
    const site = (s.site || domainOf(s.url)).toLowerCase().replace(/^www\./, '');
    if (!site || seen.has(site)) continue;
    if (!VALID.includes(s.dog) || !VALID.includes(s.cat)) continue;
    const grounded = [...groundedDomains].some(g => g && (g === site || g.endsWith(site) || site.endsWith(g)));
    if (!grounded) continue;
    seen.add(site);
    sources.push({ site, url: s.url || '', dog: s.dog, cat: s.cat });
  }

  if (sources.length < MIN_SOURCES) return { ok: false, reason: `sources_${sources.length}` };

  const dog = consensusOf(sources.map(s => s.dog));
  const cat = consensusOf(sources.map(s => s.cat));
  if (dog.ratio < CONSENSUS || cat.ratio < CONSENSUS) {
    return { ok: false, reason: `no_consensus_dog${Math.round(dog.ratio * 100)}_cat${Math.round(cat.ratio * 100)}` };
  }

  const name = (parsed.nameTh || foodName).trim();
  const id = 'learned_' + (name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || Date.now());
  const date = new Date().toISOString().slice(0, 10);
  const siteList = sources.map(s => s.site).join(', ');

  return {
    ok: true,
    entry: {
      id,
      name,
      aliases: [...new Set([name, foodName, ...(parsed.aliases || [])].map(a => String(a).trim()).filter(Boolean))],
      allergens: parsed.allergens || [],
      dog: { status: dog.status, badge: BADGES[dog.status], reason: parsed.dogReason || '' },
      cat: { status: cat.status, badge: BADGES[cat.status], reason: parsed.catReason || '' },
      source: `AI ค้นคว้าจาก ${sources.length} แหล่ง: ${siteList}`,
      sources,
      consensus: { dog: dog.ratio, cat: cat.ratio },
      researchedAt: date,
      verification_note: `ข้อมูลนี้ AI ค้นคว้าจาก ${sources.length} แหล่ง (${date}) ผลตรงกัน ${Math.round(Math.min(dog.ratio, cat.ratio) * 100)}% ขึ้นไป ไม่ใช่การวินิจฉัยโดยสัตวแพทย์ หากสงสัยควรปรึกษาสัตวแพทย์`
    }
  };
}

/**
 * ค้นคว้าและบันทึกอาหารใหม่ลงฐานข้อมูล
 * @returns {Promise<object|null>} entry ที่บันทึกแล้ว หรือ null หากข้อมูลไม่เพียงพอ/ไม่ตรงกัน
 */
async function researchAndSaveFood(foodName) {
  if (!isGeminiConfigured() || !foodName) return null;
  const key = foodName.trim().toLowerCase();

  const failedAt = failedCache.get(key);
  if (failedAt && Date.now() - failedAt < FAIL_TTL_MS) return null;
  if (inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    try {
      const r = await doResearch(foodName);
      if (!r.ok) {
        console.log(`🔎 Research "${foodName}" ไม่ผ่านเกณฑ์: ${r.reason}`);
        if (r.reason !== 'no_response') failedCache.set(key, Date.now()); // ไม่จำกรณีโควตา/เครือข่ายล่ม
        return null;
      }
      const existing = foods.find(f => f.id === r.entry.id);
      if (existing) return existing;
      await addLearnedFood(r.entry);
      console.log(`📚 บันทึกอาหารใหม่ "${r.entry.name}" (${r.entry.sources.length} แหล่ง)`);
      return r.entry;
    } catch (err) {
      console.error('⚠️ Research failed:', err.message);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

module.exports = { researchAndSaveFood };
