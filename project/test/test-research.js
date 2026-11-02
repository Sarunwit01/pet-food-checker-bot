require('dotenv').config();
const { handleFoodCheck } = require('../handlers/foodHandler');
const { foods } = require('../utils/foodStore');

(async () => {
  const before = foods.length;
  for (const [q, uid] of [['หมา: แก้วมังกร', 'r1'], ['หมา: แก้วมังกร', 'r1'], ['หมา: ขนม', 'r2']]) {
    const t0 = Date.now();
    const r = await handleFoodCheck(q, uid);
    console.log(`[${Date.now() - t0}ms] "${q}" => ${r.type} | ${r.altText || r.text}`);
  }
  console.log('foods:', before, '->', foods.length);
  console.log(JSON.stringify(foods.slice(before), null, 1));
})();


