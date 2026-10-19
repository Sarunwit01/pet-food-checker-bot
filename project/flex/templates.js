/**
 * templates.js - ตัวสร้าง LINE Flex Message และข้อความโต้ตอบแบบเป็นธรรมชาติ (รองรับระบบ Hybrid AI + Database)
 */

/**
 * สุ่มเลือกข้อความจากรายการเพื่อให้บอทพูดจาเป็นธรรมชาติ ไม่ซ้ำซากจำเจ
 * @param {string[]} list
 * @returns {string}
 */
function pickNaturalText(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * สร้าง Flex Message แสดงผลการตรวจสอบความปลอดภัยของอาหาร (จากฐานข้อมูล foods.json + คำอธิบายเสริมจาก AI)
 * @param {object} food - ข้อมูลอาหารจาก foods.json
 * @param {'dog'|'cat'} petType - ชนิดสัตว์เลี้ยง ('dog' หรือ 'cat')
 * @param {object} [aiOptions] - ข้อมูลเสริมจาก Gemini AI (เช่น aiExplanation, queriedName)
 * @returns {object} LINE Flex Message Object
 */
function createFoodResultFlex(food, petType, aiOptions = {}) {
  const isDog = petType === 'dog';
  const petName = isDog ? 'น้องหมา 🐶' : 'น้องแมว 🐱';
  const petData = isDog ? food.dog : food.cat;
  const triggeredAllergies = Array.isArray(aiOptions.triggeredAllergies) ? aiOptions.triggeredAllergies : [];
  const hasAllergyWarning = triggeredAllergies.length > 0;

  // กำหนดชุดสีตามระดับความปลอดภัย
  let themeColor = '#28a745'; // เขียว (Safe)
  let badgeBgColor = '#d4edda';
  let badgeTextColor = '#155724';
  let statusIcon = '✅';

  if (petData.status === 'danger') {
    themeColor = '#dc3545'; // แดง (Danger)
    badgeBgColor = '#f8d7da';
    badgeTextColor = '#721c24';
    statusIcon = '🚫';
  } else if (petData.status === 'caution') {
    themeColor = '#fd7e14'; // ส้ม (Caution)
    badgeBgColor = '#fff3cd';
    badgeTextColor = '#856404';
    statusIcon = '⚠️';
  }

  // ถ้าน้องมีประวัติแพ้อาหารชนิดนี้ ให้ปรับแถบสีหัวข้อเป็นสีส้มเข้ม/แดงเพื่อดึงดูดสายตาทันที
  if (hasAllergyWarning && petData.status === 'safe') {
    themeColor = '#e65100';
    statusIcon = '⚠️';
  }

  // ปุ่มสลับดูสัตว์อีกชนิดแบบภาษาพูดเป็นกันเอง
  const switchLabel = isDog ? '🐱 แล้วถ้าน้องแมวล่ะ กินได้ไหม?' : '🐶 แล้วถ้าน้องหมาล่ะ กินได้ไหม?';
  const switchText = isDog ? `แมว: ${food.name}` : `หมา: ${food.name}`;

  // สร้างเนื้อหาส่วน Body
  const bodyContents = [];

  // [Phase 3] กล่องเตือนพิเศษหากตรวจพบสารก่อภูมิแพ้ตรงกับโปรไฟล์ของน้อง
  if (hasAllergyWarning) {
    const allergyNames = triggeredAllergies.map(a => `[${a}]`).join(', ');
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#fff3cd',
      borderColor: '#ff9800',
      borderWidth: '2px',
      cornerRadius: '8px',
      paddingAll: '12px',
      spacing: 'xs',
      contents: [
        {
          type: 'text',
          text: `🚨 คำเตือนพิเศษ: น้องมีประวัติแพ้ ${allergyNames}!`,
          weight: 'bold',
          size: 'sm',
          color: '#b71c1c',
          wrap: true
        },
        {
          type: 'text',
          text: `ถึงอาหารนี้สัตว์เลี้ยงทั่วไปอาจจะกินได้ แต่ใน "${food.name}" มีส่วนประกอบของ ${allergyNames} จึงไม่ควรให้น้องกินเด็ดขาดเลยนะครับ!`,
          size: 'xs',
          color: '#856404',
          wrap: true
        }
      ]
    });
  }

  // ป้าย Badge สถานะทั่วไป และเหตุผลจากฐานข้อมูลหลัก
  bodyContents.push(
    {
      type: 'box',
      layout: 'vertical',
      backgroundColor: badgeBgColor,
      cornerRadius: '8px',
      paddingAll: '10px',
      alignItems: 'center',
      contents: [
        {
          type: 'text',
          text: `${petData.badge}`,
          weight: 'bold',
          size: 'md',
          color: badgeTextColor,
          wrap: true,
          align: 'center'
        }
      ]
    },
    {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: [
        {
          type: 'text',
          text: '💡 ข้อมูลทั่วไปสำหรับสัตว์เลี้ยง:',
          weight: 'bold',
          size: 'sm',
          color: '#333333'
        },
        {
          type: 'text',
          text: petData.reason,
          size: 'sm',
          color: '#555555',
          wrap: true
        }
      ]
    }
  );

  // หากมีคำอธิบายเสริมจาก Gemini AI (RAG Grounded Response) ให้แสดงกล่อง AI เพิ่มเติม
  if (aiOptions && aiOptions.aiExplanation) {
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#f0f7ff',
      cornerRadius: '8px',
      paddingAll: '10px',
      spacing: 'xs',
      margin: 'md',
      contents: [
        {
          type: 'text',
          text: '✨ คำแนะนำเพิ่มเติมให้น้อง:',
          weight: 'bold',
          size: 'xs',
          color: '#0056b3'
        },
        {
          type: 'text',
          text: aiOptions.aiExplanation,
          size: 'xs',
          color: '#333333',
          wrap: true
        }
      ]
    });
  }

  // เส้นคั่นและแหล่งอ้างอิง
  bodyContents.push(
    {
      type: 'separator',
      margin: 'md'
    },
    {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: [
        {
          type: 'text',
          text: `📚 อ้างอิงจาก: ${food.source || 'คู่มือสัตวแพทย์'}`,
          size: 'xxs',
          color: '#888888',
          wrap: true
        },
        {
          type: 'text',
          text: `🔍 ตรวจสอบโดย: ${aiOptions && aiOptions.aiExplanation ? 'ฐานข้อมูลสัตวแพทย์ + ผู้ช่วย AI' : 'ฐานข้อมูลสัตวแพทย์ที่ยืนยันแล้ว'}`,
          size: 'xxs',
          color: '#999999',
          wrap: true
        }
      ]
    }
  );

  const allergyPrefix = hasAllergyWarning ? '[⚠️ ระวังแพ้อาหาร!] ' : '';

  return {
    type: 'flex',
    altText: `${allergyPrefix}${statusIcon} เช็คอาหาร "${food.name}" ให้${petName}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: themeColor,
        paddingAll: '18px',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: `เช็คความปลอดภัยให้${petName}`,
                color: '#ffffff',
                size: 'sm',
                weight: 'bold'
              }
            ]
          },
          {
            type: 'text',
            text: food.name,
            weight: 'bold',
            size: 'xl',
            color: '#ffffff',
            margin: 'sm',
            wrap: true
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: bodyContents
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
              type: 'message',
              label: switchLabel,
              text: switchText
            }
          },
          {
            type: 'text',
            text: '🩺 ข้อมูลนี้เป็นคำแนะนำเบื้องต้น ถ้าน้องมีอาการผิดปกติ แนะนำให้ปรึกษาคุณหมอนะครับ',
            size: 'xxs',
            color: '#aaaaaa',
            align: 'center',
            wrap: true,
            margin: 'sm'
          }
        ]
      }
    }
  };
}

/**
 * สร้าง Flex Message สำหรับกรณีอาหารไม่อยู่ใน foods.json แต่ให้ Gemini AI วิเคราะห์ส่วนผสมที่ต้องระวัง (AI Ingredient Warning)
 * @param {object} aiResult - ผลลัพธ์จาก analyzeFoodWithGemini
 * @param {'dog'|'cat'} petType - ชนิดสัตว์เลี้ยง
 * @param {string[]} [triggeredAllergies] - รายการสารก่อภูมิแพ้ของน้องที่ตรวจพบในเมนูนี้
 * @returns {object} LINE Flex Message Object
 */
function createAiIngredientWarningFlex(aiResult, petType, triggeredAllergies = []) {
  const isDog = petType === 'dog';
  const petName = isDog ? 'น้องหมา 🐶' : 'น้องแมว 🐱';
  const foodTitle = aiResult.extractedFoodName || 'เมนูที่ถามมา';
  const hasAllergyWarning = Array.isArray(triggeredAllergies) && triggeredAllergies.length > 0;

  const isDanger = aiResult.estimatedRisk === 'danger';
  const isSafe = aiResult.estimatedRisk === 'safe' && !hasAllergyWarning;

  let themeColor = '#e0a800';
  let badgeBgColor = '#fff3cd';
  let badgeTextColor = '#856404';
  let badgeText = '⚠️ ต้องระวัง! มีส่วนผสมที่ควรจำกัดปริมาณ';

  if (isDanger) {
    themeColor = '#c82333';
    badgeBgColor = '#f8d7da';
    badgeTextColor = '#721c24';
    badgeText = '🚫 เสี่ยงอันตราย! ไม่แนะนำให้กินนะครับ';
  } else if (hasAllergyWarning) {
    themeColor = '#e65100';
    badgeBgColor = '#fff3cd';
    badgeTextColor = '#856404';
    badgeText = '⚠️ ระวัง! มีส่วนผสมที่ตรงกับประวัติแพ้อาหารของน้อง';
  } else if (isSafe) {
    themeColor = '#28a745';
    badgeBgColor = '#d4edda';
    badgeTextColor = '#155724';
    badgeText = '✅ กินได้ในปริมาณเหมาะสม (ประเมินโดย AI)';
  }

  const ingredientsList =
    Array.isArray(aiResult.suspectedIngredients) && aiResult.suspectedIngredients.length > 0
      ? aiResult.suspectedIngredients.join(', ')
      : 'เครื่องปรุงรส หรือส่วนผสมของอาหารคนที่ไม่เหมาะกับสัตว์เลี้ยง';

  const switchLabel = isDog ? '🐱 แล้วถ้าน้องแมวล่ะ กินได้ไหม?' : '🐶 แล้วถ้าน้องหมาล่ะ กินได้ไหม?';
  const switchText = isDog ? `แมว: ${foodTitle}` : `หมา: ${foodTitle}`;

  const bodyContents = [];

  if (hasAllergyWarning) {
    const allergyNames = triggeredAllergies.map(a => `[${a}]`).join(', ');
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#fff3cd',
      borderColor: '#ff9800',
      borderWidth: '2px',
      cornerRadius: '8px',
      paddingAll: '12px',
      spacing: 'xs',
      contents: [
        {
          type: 'text',
          text: `🚨 คำเตือนพิเศษ: น้องมีประวัติแพ้ ${allergyNames}!`,
          weight: 'bold',
          size: 'sm',
          color: '#b71c1c',
          wrap: true
        },
        {
          type: 'text',
          text: `เมนู "${foodTitle}" มีส่วนประกอบของ ${allergyNames} ที่น้องแพ้ ห้ามให้น้องกินเด็ดขาดนะครับ!`,
          size: 'xs',
          color: '#856404',
          wrap: true
        }
      ]
    });
  }

  bodyContents.push(
    {
      type: 'box',
      layout: 'vertical',
      backgroundColor: badgeBgColor,
      cornerRadius: '8px',
      paddingAll: '10px',
      alignItems: 'center',
      contents: [
        {
          type: 'text',
          text: badgeText,
          weight: 'bold',
          size: 'sm',
          color: badgeTextColor,
          wrap: true,
          align: 'center'
        }
      ]
    },
    {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: [
        {
          type: 'text',
          text: '🔍 ส่วนผสมที่ต้องระวังในเมนูนี้:',
          weight: 'bold',
          size: 'sm',
          color: '#333333'
        },
        {
          type: 'text',
          text: ingredientsList,
          size: 'sm',
          color: '#d9534f',
          weight: 'bold',
          wrap: true
        }
      ]
    },
    {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#f8f9fa',
      cornerRadius: '8px',
      paddingAll: '10px',
      spacing: 'xs',
      contents: [
        {
          type: 'text',
          text: '💬 คำแนะนำสำหรับเมนูนี้:',
          weight: 'bold',
          size: 'xs',
          color: '#333333'
        },
        {
          type: 'text',
          text: aiResult.aiExplanation || 'เมนูนี้มักจะมีเครื่องปรุงหรือส่วนผสมที่ไม่เหมาะกับระบบย่อยของสัตว์เลี้ยงครับ เลี่ยงไว้ก่อนจะปลอดภัยกับน้องมากกว่านะ',
          size: 'xs',
          color: '#555555',
          wrap: true
        }
      ]
    },
    {
      type: 'separator',
      margin: 'md'
    },
    {
      type: 'text',
      text: '📌 หมายเหตุ: เมนูนี้เป็นการให้ AI ช่วยประเมินส่วนผสมเบื้องต้นเพื่อเตือนภัยล่วงหน้า ยังไม่ได้อยู่ในฐานข้อมูลหลักนะครับ',
      size: 'xxs',
      color: '#888888',
      wrap: true
    }
  );

  const allergyPrefix = hasAllergyWarning ? '[⚠️ ระวังแพ้อาหาร!] ' : '';

  return {
    type: 'flex',
    altText: `${allergyPrefix}⚠️ เช็คส่วนผสมเบื้องต้น: ${foodTitle} สำหรับ${petName}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: themeColor,
        paddingAll: '18px',
        contents: [
          {
            type: 'text',
            text: `🤖 AI ช่วยเช็คส่วนผสมให้${petName}`,
            color: '#ffffff',
            size: 'sm',
            weight: 'bold'
          },
          {
            type: 'text',
            text: foodTitle,
            weight: 'bold',
            size: 'xl',
            color: '#ffffff',
            margin: 'sm',
            wrap: true
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: bodyContents
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
              type: 'message',
              label: switchLabel,
              text: switchText
            }
          },
          {
            type: 'text',
            text: '🩺 ถ้าไม่แน่ใจ แนะนำให้ถามคุณหมอก่อนป้อนน้องดีที่สุดครับ',
            size: 'xxs',
            color: '#aaaaaa',
            align: 'center',
            wrap: true,
            margin: 'sm'
          }
        ]
      }
    }
  };
}

/**
 * สร้าง Quick Reply ถามชนิดสัตว์เลี้ยงแบบเป็นกันเอง
 * @param {string} foodQuery 
 * @returns {object}
 */
function createAskPetQuickReply(foodQuery) {
  const prompts = [
    `อยากเช็คเรื่อง "${foodQuery}" ให้น้องหมาหรือน้องแมวเอ่ย? 🐶🐱 จิ้มเลือกด้านล่างบอกผมได้เลยนะครับ 👇`,
    `เดี๋ยวผมช่วยดูเรื่อง "${foodQuery}" ให้นะครับ! แต่ขอถามนิดนึงว่าเช็คให้น้องหมาหรือน้องแมวครับ? 🐾`,
    `ได้ยินชื่อ "${foodQuery}" แล้ว! อันนี้จะเช็คให้น้องหมาหรือน้องแมวกินครับ กดเลือกปุ่มข้างล่างได้เลยน้า 👇`
  ];

  return {
    type: 'text',
    text: pickNaturalText(prompts),
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: '🐶 น้องหมา',
            text: `หมา: ${foodQuery}`
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '🐱 น้องแมว',
            text: `แมว: ${foodQuery}`
          }
        }
      ]
    }
  };
}

/**
 * ข้อความตอบกลับเมื่อไม่พบอาหารในฐานข้อมูล (Fallback กรณีไม่ได้เปิดใช้ AI)
 * @param {string} foodQuery 
 * @returns {object}
 */
function createNotFoundMessage(foodQuery) {
  const fallbackMessages = [
    `เอ๊ะ... ตอนนี้ในระบบยังไม่มีข้อมูลของ "${foodQuery}" ที่ยืนยันจากตำราสัตวแพทย์เลยครับ 🤔\n\nเพื่อความปลอดภัยของน้อง แนะนำว่าอย่าเพิ่งให้กินเมนูนี้ดีกว่านะครับ ลองถามคุณหมอก่อนจะชัวร์และปลอดภัยกับน้องที่สุดครับ 🩺🐾`,
    `ผมลองค้นดูแล้ว แต่ยังไม่มีข้อมูลของ "${foodQuery}" ในฐานข้อมูลที่ยืนยันแล้วเลยครับ 🙏\n\nเรื่องอาหารสัตว์เราไม่อยากเดาสุ่มเลย ถ้ายังไม่แน่ใจ แนะนำให้เลี่ยงไปก่อน หรือลองปรึกษาคุณหมอประจำตัวน้องดูนะครับ 🩺✨`,
    `สำหรับ "${foodQuery}" ตอนนี้ผมยังไม่มีข้อมูลที่ฟันธงได้ว่าปลอดภัยไหมครับ 🐶🐱\n\nกันไว้ดีกว่าแก้ แนะนำว่าอย่าเพิ่งป้อนน้องนะครับ ลองเช็คกับสัตวแพทย์ก่อนให้น้องกินจะอุ่นใจกว่าครับ 🩺`
  ];

  return {
    type: 'text',
    text: pickNaturalText(fallbackMessages)
  };
}

/**
 * สร้าง Flex Message แจ้งเตือนเมื่อระบบมีปัญหา ขัดข้อง หรือเชื่อมต่อไม่สำเร็จ
 * @param {string} [customDetails] - รายละเอียดเพิ่มเติม (ถ้ามี)
 * @returns {object} LINE Flex Message Object
 */
function createSystemErrorFlex(customDetails = null) {
  return {
    type: 'flex',
    altText: '⚠️ แจ้งเตือน: ระบบขัดข้องชั่วคราว',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#6c757d',
        paddingAll: '18px',
        contents: [
          {
            type: 'text',
            text: '⚠️ ขออภัยในความไม่สะดวกครับ',
            color: '#ffffff',
            size: 'sm',
            weight: 'bold'
          },
          {
            type: 'text',
            text: 'ระบบขัดข้องชั่วคราว 🛠️',
            weight: 'bold',
            size: 'xl',
            color: '#ffffff',
            margin: 'sm'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#f8f9fa',
            cornerRadius: '8px',
            paddingAll: '12px',
            contents: [
              {
                type: 'text',
                text: 'ระบบกำลังมีปัญหาการเชื่อมต่อหรือประมวลผลสะดุดเล็กน้อยครับ กำลังเร่งตรวจสอบให้อยู่นะครับ 🙏',
                size: 'sm',
                color: '#495057',
                wrap: true
              }
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'xs',
            contents: [
              {
                type: 'text',
                text: '💡 สิ่งที่คุณทำได้ตอนนี้:',
                weight: 'bold',
                size: 'sm',
                color: '#212529'
              },
              {
                type: 'text',
                text: '1. ลองส่งข้อความสอบถามใหม่อีกครั้งในอีกสักครู่\n2. พิมพ์ชื่ออาหารสั้นๆ ชัดเจน เช่น "ช็อกโกแลต", "องุ่น"',
                size: 'xs',
                color: '#6c757d',
                wrap: true
              }
            ]
          },
          {
            type: 'separator',
            margin: 'md'
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#fff3cd',
            cornerRadius: '8px',
            paddingAll: '10px',
            contents: [
              {
                type: 'text',
                text: '🚨 กรณีฉุกเฉิน (น้องเผลอกินสิ่งอันตราย/มีอาการป่วย):',
                weight: 'bold',
                size: 'xs',
                color: '#856404'
              },
              {
                type: 'text',
                text: 'อย่ารอระบบตอบกลับนะครับ! กรุณารีบพาน้องส่งโรงพยาบาลสัตว์หรือโทรปรึกษาสัตว์แพทย์ใกล้บ้านทันที 🩺',
                size: 'xs',
                color: '#856404',
                wrap: true,
                margin: 'xs'
              }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#007bff',
            height: 'sm',
            action: {
              type: 'message',
              label: '🔄 ลองพิมพ์ถามใหม่อีกครั้ง',
              text: 'วิธีใช้'
            }
          }
        ]
      }
    }
  };
}

/**
 * สร้าง Flex Message แจ้งเตือนภาวะฉุกเฉิน (Phase 2) เมื่อน้องเผลอกินอาหารไปแล้ว หรือมีอาการวิกฤต
 * @param {object} options
 * @param {string} options.userText - ข้อความที่ผู้ใช้พิมพ์มา
 * @param {string[]} options.matchedKeywords - คีย์เวิร์ดฉุกเฉินที่ตรวจพบ
 * @param {'dog'|'cat'|null} options.petType - ชนิดสัตว์เลี้ยง (ถ้าทราบ)
 * @param {object|null} options.matchedFood - ข้อมูลอาหารจาก foods.json (ถ้าตรวจพบในประโยค)
 * @param {object|null} options.aiResult - ข้อมูลวิเคราะห์จาก Gemini AI (ถ้ามี)
 * @returns {object} LINE Flex Message Object
 */
function createEmergencyFlex({ userText, matchedKeywords = [], petType = null, matchedFood = null, aiResult = null }) {
  const petLabel = petType === 'dog' ? 'น้องหมา 🐶' : petType === 'cat' ? 'น้องแมว 🐱' : 'น้องหมา/น้องแมว 🐾';

  const bodyContents = [];

  // 1. หากตรวจพบชื่ออาหารในฐานข้อมูล (เช่น "ช็อกโกแลต", "องุ่น") ให้แสดงกล่องข้อมูลของอาหารนั้นทันที
  if (matchedFood) {
    const targetData = petType === 'cat' ? matchedFood.cat : matchedFood.dog;
    const isSafeFood = targetData.status === 'safe';

    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: isSafeFood ? '#e8f5e9' : '#ffebee',
      cornerRadius: '8px',
      paddingAll: '12px',
      spacing: 'xs',
      contents: [
        {
          type: 'text',
          text: `🍽️ สิ่งที่น้องกิน: ${matchedFood.name}`,
          weight: 'bold',
          size: 'sm',
          color: isSafeFood ? '#1b5e20' : '#b71c1c',
          wrap: true
        },
        {
          type: 'text',
          text: `${targetData.badge}`,
          weight: 'bold',
          size: 'xs',
          color: isSafeFood ? '#2e7d32' : '#c62828',
          wrap: true
        },
        {
          type: 'text',
          text: targetData.reason,
          size: 'xs',
          color: '#333333',
          wrap: true,
          margin: 'xs'
        }
      ]
    });
  } else if (aiResult && aiResult.extractedFoodName) {
    // กรณีไม่เจอใน foods.json แต่ AI สกัดชื่อเมนูและส่วนผสมอันตรายได้
    const ingredients =
      Array.isArray(aiResult.suspectedIngredients) && aiResult.suspectedIngredients.length > 0
        ? aiResult.suspectedIngredients.join(', ')
        : 'เครื่องปรุงรสหรือส่วนผสมที่ไม่ทราบแน่ชัด';

    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#fff3cd',
      cornerRadius: '8px',
      paddingAll: '12px',
      spacing: 'xs',
      contents: [
        {
          type: 'text',
          text: `🍽️ สิ่งที่น้องกิน: ${aiResult.extractedFoodName}`,
          weight: 'bold',
          size: 'sm',
          color: '#856404',
          wrap: true
        },
        {
          type: 'text',
          text: `⚠️ ส่วนผสมที่ต้องระวัง: ${ingredients}`,
          weight: 'bold',
          size: 'xs',
          color: '#d9534f',
          wrap: true
        },
        {
          type: 'text',
          text: aiResult.aiExplanation || 'เมนูนี้มีความเสี่ยงต่อสัตว์เลี้ยง แนะนำให้สังเกตอาการและปรึกษาสัตวแพทย์ทันทีครับ',
          size: 'xs',
          color: '#555555',
          wrap: true,
          margin: 'xs'
        }
      ]
    });
  }

  // 2. ขั้นตอนการรับมือฉุกเฉินที่เข้าใจง่ายและทำตามได้ทันที
  bodyContents.push(
    {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      margin: bodyContents.length > 0 ? 'md' : 'none',
      contents: [
        {
          type: 'text',
          text: '🚑 สิ่งที่ต้องทำทันทีตอนนี้ (ตั้งสติก่อนนะครับ):',
          weight: 'bold',
          size: 'sm',
          color: '#b71c1c',
          wrap: true
        },
        {
          type: 'text',
          text: '1️⃣ รีบพาน้องไปโรงพยาบาลสัตว์ที่ใกล้ที่สุดทันที ยิ่งถึงมือคุณหมอเร็วเท่าไหร่ยิ่งปลอดภัยครับ',
          size: 'xs',
          color: '#333333',
          wrap: true
        },
        {
          type: 'text',
          text: '2️⃣ ห้ามล้วงคอ ป้อนเกลือ หรือบังคับให้น้องอาเจียนเองเด็ดขาด! เพราะอาจสำลักเข้าปอดหรือหลอดอาหารบาดเจ็บได้ครับ',
          size: 'xs',
          color: '#d32f2f',
          weight: 'bold',
          wrap: true
        },
        {
          type: 'text',
          text: '3️⃣ เก็บซองขนม เศษอาหาร หรือถ่ายรูปสิ่งที่น้องกินเข้าไป พร้อมกะปริมาณและเวลาที่กินไปแจ้งคุณหมอด้วยนะครับ',
          size: 'xs',
          color: '#333333',
          wrap: true
        }
      ]
    },
    {
      type: 'separator',
      margin: 'md'
    },
    // 3. เบอร์ติดต่อฉุกเฉินเบื้องต้น
    {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#f8f9fa',
      cornerRadius: '8px',
      paddingAll: '10px',
      spacing: 'xs',
      contents: [
        {
          type: 'text',
          text: '☎️ เบอร์สายด่วนโรงพยาบาลสัตว์ (เปิดตลอด 24 ชม.):',
          weight: 'bold',
          size: 'xs',
          color: '#333333'
        },
        {
          type: 'text',
          text: '• รพ.สัตว์ ม.เกษตรฯ (บางเขน): 02-797-1900\n• รพ.สัตว์เล็ก จุฬาฯ (ฉุกเฉิน): 02-218-9752',
          size: 'xs',
          color: '#555555',
          wrap: true
        }
      ]
    }
  );

  return {
    type: 'flex',
    altText: `🚨 แจ้งเตือนฉุกเฉิน! คำแนะนำด่วนสำหรับ${petLabel}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#b71c1c',
        paddingAll: '18px',
        contents: [
          {
            type: 'text',
            text: `🚨 โหมดช่วยเหลือฉุกเฉิน (${petLabel})`,
            color: '#ffcdd2',
            size: 'xs',
            weight: 'bold'
          },
          {
            type: 'text',
            text: 'รีบพบสัตวแพทย์ทันทีนะครับ!',
            weight: 'bold',
            size: 'lg',
            color: '#ffffff',
            margin: 'xs',
            wrap: true
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: bodyContents
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#d32f2f',
            height: 'sm',
            action: {
              type: 'uri',
              label: '🗺️ ค้นหา รพ.สัตว์ใกล้ฉัน (Google Maps)',
              uri: 'https://www.google.com/maps/search/%E0%B9%82%E0%B8%A3%E0%B8%87%E0%B8%9E%E0%B8%A2%E0%B8%B2%E0%B8%9A%E0%B8%B2%E0%B8%A5%E0%B8%AA%E0%B8%B1%E0%B8%95%E0%B8%A7%E0%B9%8C%E0%B9%83%E0%B8%81%E0%B8%A5%E0%B9%89%E0%B8%89%E0%B8%B1%E0%B8%99'
            }
          },
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
              type: 'uri',
              label: '📞 โทรฉุกเฉิน รพ.สัตว์ ม.เกษตรฯ',
              uri: 'tel:027971900'
            }
          },
          {
            type: 'text',
            text: 'ℹ️ หมายเหตุ: ข้อมูลนี้เป็นคำแนะนำเบื้องต้นเท่านั้น ไม่สามารถทดแทนการตรวจวินิจฉัยและการรักษาของสัตวแพทย์ได้',
            size: 'xxs',
            color: '#999999',
            align: 'center',
            wrap: true,
            margin: 'sm'
          }
        ]
      }
    }
  };
}

/**
 * สร้าง Flex Message แสดงผลการคำนวณปริมาณอาหารและพลังงานต่อวัน (Phase 4)
 * @param {object} calc - ผลลัพธ์จาก calculateDailyPortion
 * @returns {object} LINE Flex Message Object
 */
function createPortionResultFlex(calc) {
  const isDog = calc.petType === 'dog';
  const petName = isDog ? 'น้องหมา 🐶' : 'น้องแมว 🐱';

  return {
    type: 'flex',
    altText: `⚖️ ปริมาณอาหารแนะนำต่อวันสำหรับ${petName} (หนัก ${calc.weightKg} กก.)`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#00897b',
        paddingAll: '18px',
        contents: [
          {
            type: 'text',
            text: `⚖️ คำนวณมื้ออาหารให้${petName}`,
            color: '#e0f2f1',
            size: 'xs',
            weight: 'bold'
          },
          {
            type: 'text',
            text: `น้ำหนัก ${calc.weightKg} กก. • ${calc.lifeStageLabel}`,
            weight: 'bold',
            size: 'md',
            color: '#ffffff',
            margin: 'xs',
            wrap: true
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          // กล่องปริมาณอาหารเม็ดแนะนำต่อวัน
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#e0f2f1',
            cornerRadius: '8px',
            paddingAll: '12px',
            spacing: 'xs',
            contents: [
              {
                type: 'text',
                text: '🥣 อาหารเม็ดมาตรฐาน (โดยประมาณ):',
                weight: 'bold',
                size: 'xs',
                color: '#00695c'
              },
              {
                type: 'text',
                text: `${calc.minKibbleGrams} - ${calc.maxKibbleGrams} กรัม / วัน`,
                weight: 'bold',
                size: 'xl',
                color: '#004d40',
                margin: 'xs'
              },
              {
                type: 'text',
                text: `⏰ แนะนำแบ่งป้อน: ${calc.mealsPerDay}`,
                size: 'xs',
                color: '#00695c',
                wrap: true
              }
            ]
          },
          // กล่องพลังงานและอาหารสด
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#f8f9fa',
            cornerRadius: '8px',
            paddingAll: '10px',
            spacing: 'xs',
            contents: [
              {
                type: 'text',
                text: `🔥 พลังงานที่ต้องการต่อวัน: ${calc.minKcal} - ${calc.maxKcal} kcal/วัน (RER พื้นฐาน = ${calc.rer} kcal)`,
                size: 'xs',
                color: '#333333',
                wrap: true
              },
              {
                type: 'text',
                text: `🥩 หากให้อาหารสด/บาร์ฟ: ประมาณ ${calc.minFreshGrams} - ${calc.maxFreshGrams} กรัม/วัน`,
                size: 'xs',
                color: '#555555',
                wrap: true
              }
            ]
          },
          // คำแนะนำตามช่วงวัย
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'xs',
            contents: [
              {
                type: 'text',
                text: '💡 ทริคการดูแลน้องวัยนี้:',
                weight: 'bold',
                size: 'xs',
                color: '#333333'
              },
              {
                type: 'text',
                text: calc.tip,
                size: 'xs',
                color: '#555555',
                wrap: true
              }
            ]
          },
          {
            type: 'separator',
            margin: 'md'
          },
          // คำเตือนเรื่องตารางข้างถุงอาหารอย่างเคร่งครัด
          {
            type: 'text',
            text: '📌 สำคัญมาก: ปริมาณกรัมจริงขึ้นอยู่กับค่าพลังงาน (kcal/kg) ของอาหารแต่ละยี่ห้อ แนะนำให้ดู "ตารางข้างถุงอาหาร" และปรึกษาสัตวแพทย์ควบคู่กันเป็นหลักนะครับ',
            size: 'xxs',
            color: '#888888',
            wrap: true
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
              type: 'message',
              label: '🔄 คำนวณใหม่ (เปลี่ยนน้ำหนัก/ช่วงวัย)',
              text: 'คำนวณอาหารใหม่'
            }
          },
          {
            type: 'text',
            text: '🩺 ข้อมูลนี้เป็นเกณฑ์ประเมินเบื้องต้นตามสูตรสัตวแพทย์ ไม่แทนการวินิจฉัยของคุณหมอครับ',
            size: 'xxs',
            color: '#aaaaaa',
            align: 'center',
            wrap: true,
            margin: 'sm'
          }
        ]
      }
    }
  };
}

module.exports = {
  createFoodResultFlex,
  createAiIngredientWarningFlex,
  createAskPetQuickReply,
  createNotFoundMessage,
  createSystemErrorFlex,
  createEmergencyFlex,
  createPortionResultFlex,
  pickNaturalText
};
