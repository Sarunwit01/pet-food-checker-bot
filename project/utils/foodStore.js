/**
 * foodStore.js - ศูนย์รวมฐานข้อมูลอาหาร
 * รวม data/foods.json (ข้อมูลตั้งต้นที่ตรวจสอบแล้ว) + data/learned_foods.json (ข้อมูลที่ AI ค้นคว้าและบันทึกเพิ่มภายหลัง)
 * คืนค่า array เดียวกันตลอด (shared reference) จึงเพิ่มข้อมูลใหม่แล้วทุกโมดูลเห็นทันทีโดยไม่ต้อง restart
 */

const fs = require('fs');
const path = require('path');

const baseFoods = require('../data/foods.json');
const LEARNED_PATH = path.join(__dirname, '..', 'data', 'learned_foods.json');

function loadLearned() {
  try {
    if (!fs.existsSync(LEARNED_PATH)) return [];
    const data = JSON.parse(fs.readFileSync(LEARNED_PATH, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('⚠️ อ่าน learned_foods.json ไม่สำเร็จ:', err.message);
    return [];
  }
}

const foods = [...baseFoods, ...loadLearned()];

// ---------- Supabase (?????????????) ----------
// ????? learned_foods (id text primary key, data jsonb) ?? supabase_setup.sql
const SB_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_KEY || '';
const supabaseEnabled = Boolean(SB_URL && SB_KEY);

function sbHeaders(extra = {}) {
  return { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...extra };
}

/** ??????????????????????????? Supabase ??????????????? (??????????????????????????) */
async function loadFromSupabase() {
  if (!supabaseEnabled) return 0;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/learned_foods?select=data`, { headers: sbHeaders() });
    if (!res.ok) throw new Error(`status ${res.status}: ${(await res.text()).slice(0, 150)}`);
    const rows = await res.json();
    let added = 0;
    for (const r of rows) {
      if (r.data && !foods.some(f => f.id === r.data.id)) {
        foods.push(r.data);
        added++;
      }
    }
    console.log(`??? ????????????? Supabase ${added} ??????`);
    return added;
  } catch (err) {
    console.error('?? ???? Supabase ?????????:', err.message);
    return 0;
  }
}

async function saveToSupabase(entry) {
  if (!supabaseEnabled) return false;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/learned_foods?on_conflict=id`, {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ id: entry.id, data: entry })
    });
    if (!res.ok) throw new Error(`status ${res.status}: ${(await res.text()).slice(0, 150)}`);
    return true;
  } catch (err) {
    console.error('?? ?????? Supabase ?????????:', err.message);
    return false;
  }
}

const ready = loadFromSupabase();

/**
 * ?????????????? AI ?????????????????????? (Supabase ????????????? + ????????? + ???????????)
 * @returns {Promise<boolean>} false ????? id ???????????
 */
async function addLearnedFood(entry) {
  await ready;
  if (foods.some(f => f.id === entry.id)) return false;
  foods.push(entry);

  if (!(await saveToSupabase(entry))) {
    const learned = loadLearned();
    learned.push(entry);
    try {
      fs.writeFileSync(LEARNED_PATH, JSON.stringify(learned, null, 2), 'utf8');
    } catch (err) {
      console.error('?? ????? learned_foods.json ?????????:', err.message);
    }
  }
  return true;
}

module.exports = { foods, addLearnedFood, ready, supabaseEnabled };
