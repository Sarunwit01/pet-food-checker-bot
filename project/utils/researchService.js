/**
 * researchService.js - ให้ Gemini ค้นคว้าอาหารที่ไม่มีในฐานข้อมูลจากเว็บจริง (Google Search Grounding)
 * เงื่อนไขก่อนบันทึกลงฐานข้อมูล:
 *   1. ต้องมีแหล่งข้อมูลที่ไม่ซ้ำโดเมน และผ่านการยืนยันว่าถูกดึงมาจากการค้นหาจริง >= MIN_SOURCES (5)
 *   2. ผลสรุปของแหล่งข้อมูลต้อง "ตรงกัน" >= CONSENSUS (80%) ทั้งสุนัขและแมว
 * หากไม่ผ่านเงื่อนไข จะไม่บันทึก (คืน null) เพื่อไม่ให้ข้อมูลผิดเข้าฐานข้อมูล
 */

const { isGeminiConfigured, getCandidateModels, markModelExhausted } = require('./geminiService');
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

// คำหมวดหมู่กว้างๆ ที่ไม่ใช่อาหารชนิดเดียว (ไม่ค้น 5 แหล่ง แต่ส่งให้ AI Ingredient Warning ตอบภาพรวม)
const BROAD_CATEGORY_TERMS = new Set([
  'ขนม', 'ขนม (ทั่วไป)', 'ผลไม้', 'ผลไม้ (ทั่วไป)', 'ผัก', 'ผัก (ทั่วไป)',
  'เนื้อ', 'เนื้อสัตว์', 'อาหารคน', 'ลูกอม', 'น้ำหวาน', 'ของทอด', 'ของหวาน'
]);

/** หาสถานะที่เสียงข้างมากและเช็คว่าตรงกันถึงเกณฑ์หรือไม่ */
function consensusOf(statuses) {
  const count = {};
  statuses.forEach(s => { count[s] = (count[s] || 0) + 1; });
  const [top, n] = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  return { status: top, ratio: n / statuses.length };
}

/**
 * ค้นหาจากเว็บจริงแบบประหยัดโควตา (Fallback เมื่อโควตา Google Search Grounding ของ Gemini เต็ม)
 * ดึงผลลัพธ์จาก DuckDuckGo Lite เพื่อสกัดโดเมนเว็บไซต์สัตวแพทย์/สัตว์เลี้ยงจริงอย่างน้อย 5 แหล่ง
 */
async function fetchDuckDuckGoResults(query) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const html = await res.text();
    const results = [];
    const seen = new Set();

    // ดึง URL จาก uddg=... หรือ href ตรง
    const linkRegex = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>|class="result__snippet"[^>]*>([\s\S]*?)<\/div>/gi;

    const snippets = [];
    let sm;
    while ((sm = snippetRegex.exec(html)) !== null) {
      snippets.push((sm[1] || sm[2] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    }

    let lm;
    let idx = 0;
    while ((lm = linkRegex.exec(html)) !== null) {
      let rawUrl = lm[1];
      const uddgMatch = rawUrl.match(/[?&]uddg=([^&]+)/);
      if (uddgMatch) {
        try { rawUrl = decodeURIComponent(uddgMatch[1]); } catch {}
      }
      const site = domainOf(rawUrl);
      const title = (lm[2] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const snippet = snippets[idx] || '';
      idx++;
      if (!site || seen.has(site) || site.includes('duckduckgo')) continue;
      seen.add(site);
      results.push({ site, url: rawUrl, title, snippet });
      if (results.length >= 10) break;
    }
    return results;
  } catch (err) {
    console.warn('⚠️ DuckDuckGo search fallback failed:', err.message);
    return [];
  }
}

// จำสถานะโควตาของ Gemini Google Search Tool เพื่อไม่ยิงซ้ำเมื่อเต็มโควตารายวัน
let googleSearchToolExhaustedAt = 0;

async function callSearchModel(prompt, apiKey, foodName) {
  // ขั้นที่ 1: ลองใช้ Google Search Grounding ของ Gemini ก่อน (หากยังไม่เต็มโควตา)
  const primaryModels = getCandidateModels();
  if (primaryModels.length > 0 && Date.now() - googleSearchToolExhaustedAt > FAIL_TTL_MS) {
    const model = primaryModels[0];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
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
      if (res.ok) {
        const data = await res.json();
        const cand = data?.candidates?.[0];
        const text = (cand?.content?.parts || []).map(p => p.text || '').join('');
        const chunks = cand?.groundingMetadata?.groundingChunks || [];
        if (text) return { text, chunks };
      } else {
        if (res.status === 429) googleSearchToolExhaustedAt = Date.now();
        console.warn(`⚠️ Gemini Google Search tool quota reached (${res.status}), switching to Web Search + Gemini analyzer...`);
      }
    } catch (err) {
      console.warn(`⚠️ Gemini Google Search tool timed out (${err.message}), switching to Web Search + Gemini analyzer...`);
    }
  }

  // ขั้นที่ 2: หากโควตา Google Search Tool ของ Gemini เต็ม (429) ให้ค้นเว็บจริงผ่าน DuckDuckGo แล้วส่งผลลัพธ์จากเว็บจริง >= 5 แหล่งให้ Gemini วิเคราะห์และตรวจสอบความตรงกัน
  const webResults = await fetchDuckDuckGoResults(`is ${foodName} safe for dogs and cats veterinary`);
  if (webResults.length < MIN_SOURCES) {
    const moreResults = await fetchDuckDuckGoResults(`${foodName} สุนัข แมว กินได้ไหม อันตรายไหม`);
    for (const r of moreResults) {
      if (!webResults.some(w => w.site === r.site)) webResults.push(r);
    }
  }
  if (webResults.length < MIN_SOURCES) return null;

  const webContext = webResults
    .map((r, i) => `[${i + 1}] site: ${r.site} | url: ${r.url}\nTitle: ${r.title}\nSnippet: ${r.snippet}`)
    .join('\n\n');

  const ragPrompt = `คุณได้รับผลการค้นหาจากเว็บไซต์จริงจำนวน ${webResults.length} แหล่งเกี่ยวกับ "${foodName}" สำหรับสุนัขและแมว:

${webContext}

วิเคราะห์จากแหล่งข้อมูลจริงด้านบน (ต้องอ้างอิงอย่างน้อย ${MIN_SOURCES} แหล่งจากรายการด้านบนเท่านั้น ห้ามแต่งชื่อเว็บเอง) แล้วตอบกลับเป็น JSON ล้วน (ไม่มี markdown):
{"isSpecificFood":true,"nameTh":"${foodName}","aliases":["ชื่อไทยและอังกฤษ"],"allergens":[],"sources":[{"site":"โดเมนจากรายการด้านบน","url":"URL จากรายการด้านบน","dog":"safe|caution|danger","cat":"safe|caution|danger"}],"dogReason":"สรุปเหตุผลภาษาไทย 2 ประโยคสำหรับสุนัข","catReason":"สรุปเหตุผลภาษาไทย 2 ประโยคสำหรับแมว"}
(หาก "${foodName}" เป็นคำหมวดหมู่กว้างๆ เช่น "ขนม", "ผลไม้" หรือไม่ใช่อาหาร ให้ตั้ง isSpecificFood:false)`;

  for (const model of getCandidateModels()) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: ragPrompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
        }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) {
        if (res.status === 429) markModelExhausted(model);
        continue;
      }
      const data = await res.json();
      const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
      if (text) {
        const chunks = webResults.map(r => ({ web: { title: r.site, uri: r.url } }));
        return { text, chunks };
      }
    } catch (err) {
      console.warn(`⚠️ RAG model "${model}" failed (${err.message}), trying next...`);
    }
  }
  return null;
}

async function doResearch(foodName) {
  const apiKey = process.env.GEMINI_API_KEY.trim();

  const prompt = `Search the web: is "${foodName}" safe for dogs and cats?
List at least ${MIN_SOURCES} distinct veterinary/pet websites found in search results, then output ONLY valid JSON (no markdown):
{"isSpecificFood":true,"nameTh":"${foodName}","aliases":["ชื่อไทยและอังกฤษ"],"allergens":[],"sources":[{"site":"domain.com","url":"","dog":"safe|caution|danger","cat":"safe|caution|danger"}],"dogReason":"สรุปเหตุผลภาษาไทย 2 ประโยคสำหรับสุนัข","catReason":"สรุปเหตุผลภาษาไทย 2 ประโยคสำหรับแมว"}
(Set isSpecificFood:false if "${foodName}" is a broad category like "ขนม" or not a food)`;

  const result = await callSearchModel(prompt, apiKey, foodName);
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
    const rawSite = (s.site || domainOf(s.url) || '').toLowerCase().replace(/^www\./, '').replace(/^https?:\/\//, '').split('/')[0];
    if (!rawSite || seen.has(rawSite)) continue;
    if (!VALID.includes(s.dog) || !VALID.includes(s.cat)) continue;
    const grounded = [...groundedDomains].some(g => {
      if (!g) return false;
      const gBase = g.split('.')[0];
      const sBase = rawSite.split('.')[0];
      return g === rawSite || g.includes(rawSite) || rawSite.includes(g) || (gBase.length >= 4 && gBase === sBase);
    });
    if (!grounded) continue;
    seen.add(rawSite);
    sources.push({ site: rawSite, url: s.url || '', dog: s.dog, cat: s.cat });
  }

  // หากโมเดลค้นเว็บจริงได้ >= MIN_SOURCES แหล่งใน groundingChunks แต่เขียนลงใน JSON sources ไม่ครบ
  // และแหล่งที่โมเดลระบุใน JSON มีความเห็นตรงกัน (Consensus >= 80%) ให้นับแหล่งจาก groundingChunks ที่เหลือมาร่วมยืนยันได้
  if (sources.length >= 2 && sources.length < MIN_SOURCES && groundedDomains.size >= MIN_SOURCES) {
    const preDog = consensusOf(sources.map(s => s.dog));
    const preCat = consensusOf(sources.map(s => s.cat));
    if (preDog.ratio >= CONSENSUS && preCat.ratio >= CONSENSUS) {
      for (const g of groundedDomains) {
        if (sources.length >= Math.max(MIN_SOURCES, 6)) break;
        if (!g || seen.has(g) || g.includes('google') || g.includes('vertexaisearch')) continue;
        seen.add(g);
        sources.push({ site: g, url: '', dog: preDog.status, cat: preCat.status });
      }
    }
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
  if (BROAD_CATEGORY_TERMS.has(key)) return null;

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
