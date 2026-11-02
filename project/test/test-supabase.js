require('dotenv').config();
const s = require('../utils/foodStore');

(async () => {
  console.log('enabled =', s.supabaseEnabled);
  await s.ready;
  console.log('foods after load =', s.foods.length);
  const entry = {
    id: 'learned_test_entry', name: 'ทดสอบ', aliases: ['ทดสอบระบบ'], allergens: [],
    dog: { status: 'safe', badge: 'x', reason: 'test' }, cat: { status: 'safe', badge: 'x', reason: 'test' },
    source: 'test', sources: [], researchedAt: new Date().toISOString().slice(0, 10)
  };
  console.log('added =', await s.addLearnedFood(entry));

  // ตรวจอ่านกลับจาก Supabase โดยตรง
  const url = process.env.SUPABASE_URL.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_KEY;
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  let res = await fetch(`${url}/rest/v1/learned_foods?id=eq.learned_test_entry&select=id,data`, { headers: h });
  console.log('read back =', res.status, JSON.stringify(await res.json()).slice(0, 120));
  res = await fetch(`${url}/rest/v1/learned_foods?id=eq.learned_test_entry`, { method: 'DELETE', headers: h });
  console.log('cleanup =', res.status);
})();
