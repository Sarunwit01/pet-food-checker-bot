# 🐾 Pet Food Checker — LINE Bot (MVP วิชา IE414)

แชทบอทผู้ช่วยตรวจสอบความปลอดภัยของอาหารสำหรับน้องหมาและน้องแมว ด้วยสถาปัตยกรรม **Hybrid (Google Gemini AI + Verified Veterinary Database)**

---

## ✨ ฟีเจอร์หลักครบทั้ง 5 ระบบ (Phase 1 – Phase 5)

1. **🥗 ระบบตรวจสอบความปลอดภัยอาหาร (Hybrid AI + Database)**
   - ดึงข้อมูลที่ได้รับการยืนยันจากแหล่งอ้างอิงทางสัตวแพทย์ (ASPCA, FDA, PetMD, Merck Vet) จากไฟล์ `data/foods.json`
   - ผสาน **Google Gemini AI (`gemini-3.5-flash-lite`)** ช่วยตีความเมนูซับซ้อน (เช่น *"บราวนี่"* -> ช็อกโกแลต), อธิบายเสริมอย่างเป็นกันเอง และวิเคราะห์ส่วนผสมอันตรายสำหรับเมนูนอกฐานข้อมูล (เช่น *"ชานมไข่มุก"*)
   - แสดงผลด้วยการ์ด **LINE Flex Message** แยกสีชัดเจน: 🟢 ปลอดภัย / 🟠 ต้องระวัง / 🔴 ห้ามกินเด็ดขาด
2. **🚨 ระบบตรวจจับภาวะฉุกเฉิน (`handlers/emergencyHandler.js`)**
   - ดักจับคำวิกฤต เช่น *"เผลอกิน"*, *"กิน...ไปแล้ว"*, *"อ้วก"*, *"ชัก"*, *"ซึม"*
   - ส่งการ์ดฉุกเฉินสีแดงเข้มทันที แนะนำ 3 ขั้นตอนช่วยชีวิตเบื้องต้น พร้อมปุ่มค้นหา รพ.สัตว์ใกล้ฉัน (Google Maps) และปุ่มโทรฉุกเฉิน
3. **🥜 ระบบบันทึกโปรไฟล์และเตือนสารก่อภูมิแพ้ (`handlers/allergyHandler.js`)**
   - สั่งจำประวัติแพ้อาหารรายบุคคล เช่น *"น้องแพ้ไก่"*, *"แพ้นม"*, *"เช็คประวัติแพ้"*, *"ล้างข้อมูลแพ้"*
   - แจ้งเตือนกล่องพิเศษสีส้ม/แดงทันทีเมื่อค้นหาอาหารที่มีส่วนผสมที่น้องแพ้
4. **⚖️ ระบบคำนวณปริมาณอาหารต่อวัน (`handlers/portionHandler.js` & `utils/calculator.js`)**
   - คำนวณพลังงาน RER & MER และปริมาณอาหารเม็ด/อาหารสด (กรัม/วัน) ตามชนิดสัตว์ น้ำหนักตัว (กก.) และช่วงวัย
   - รองรับทั้งการคุยถาม-ตอบทีละขั้น และการพิมพ์รวดเดียว เช่น *"คำนวณอาหารแมวโตหนัก 4.5 กก."*
5. **🎙️ ระบบรับคำสั่งด้วยเสียง (`handlers/voiceHandler.js`)**
   - รองรับทั้งการกดไมโครโฟนบนคีย์บอร์ดมือถือ (Voice Typing) และการกดอัดคลิปเสียง (Voice Note) ในแชท LINE โดยให้ Gemini AI ถอดเสียงพูดภาษาไทยอัตโนมัติ

---

## 🚀 วิธีรันและทดสอบในเครื่อง (Local Development)

### 1. ติดตั้งแพ็กเกจและรันชุดทดสอบจำลอง
```bash
npm install
npm test
```

### 2. ตั้งค่าไฟล์ `.env`
คัดลอกไฟล์ `.env.example` เป็น `.env` แล้วใส่ค่าดังนี้:
```env
CHANNEL_ACCESS_TOKEN=ใส่_Channel_Access_Token_จาก_LINE_Developers
CHANNEL_SECRET=ใส่_Channel_Secret_จาก_LINE_Developers
GEMINI_API_KEY=ใส่_API_Key_จาก_Google_AI_Studio
GEMINI_MODEL=gemini-3.5-flash-lite
PORT=3000
```

### 3. เปิดเซิร์ฟเวอร์และเชื่อม LINE Webhook ด้วย ngrok (สำหรับทดสอบจากคอมตัวเอง)
1. รันเซิร์ฟเวอร์บอท:
   ```bash
   npm start
   ```
2. เปิดอีกหน้าต่าง Terminal แล้วรัน `ngrok`:
   ```bash
   ngrok http 3000
   ```
3. คัดลอกลิงก์ `https://xxxx.ngrok-free.app` ไปใส่ใน [LINE Developers Console](https://developers.line.biz/console/) -> แท็บ **Messaging API** -> ช่อง **Webhook URL** โดยเติม `/webhook` ต่อท้าย:
   ```text
   https://xxxx.ngrok-free.app/webhook
   ```
4. กดปุ่ม **Verify** และเปิดสวิตช์ **Use webhook** (อย่าลืมปิด *Auto-reply messages* ในตั้งค่า LINE Official Account)

---

## ☁️ Phase 6: คู่มือการนำบอทขึ้น Cloud ฟรี 24 ชม. (Render.com)

เพื่อให้บอทออนไลน์ตลอด 24 ชั่วโมงโดยไม่ต้องเปิดคอมพิวเตอร์ทิ้งไว้ สามารถนำขึ้น **Render.com (Free Tier)** ได้ตามขั้นตอนนี้ครับ:

### ขั้นตอนที่ 1: นำโค้ดขึ้น GitHub
1. สร้าง Repository ใหม่บน [GitHub](https://github.com/new) (เช่นตั้งชื่อว่า `pet-food-checker-bot`)
2. เปิด Terminal ในโฟลเดอร์ `project` แล้วรันคำสั่ง:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Pet Food Checker LINE Bot MVP (Phase 0-6)"
   git branch -M main
   git remote add origin https://github.com/<ชื่อผู้ใช้ของคุณ>/pet-food-checker-bot.git
   git push -u origin main
   ```
   *(หมายเหตุ: ไฟล์ `.gitignore` ป้องกันไม่ให้ไฟล์ `.env` ที่มีรหัสลับถูกอัปโหลดขึ้น GitHub เรียบร้อยแล้ว)*

### ขั้นตอนที่ 2: สร้าง Web Service บน Render.com
1. สมัครและเข้าสู่ระบบที่ **[Render.com](https://render.com/)** (ล็อกอินด้วยบัญชี GitHub ได้เลย)
2. กดปุ่ม **New +** มุมขวาบน -> เลือก **Web Service**
3. เลือกเชื่อมต่อกับ GitHub Repository `pet-food-checker-bot` ที่เพิ่งอัปโหลดขึ้นไป
4. ตั้งค่าดังนี้:
   - **Name:** `pet-food-checker-bot`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** เลือก **Free ($0/month)**
5. เลื่อนลงมาที่หัวข้อ **Environment Variables** แล้วกด **Add Environment Variable** เพิ่ม 4 ตัวแปรนี้:
   - `CHANNEL_ACCESS_TOKEN` = *(ใส่ค่าจาก LINE Developers)*
   - `CHANNEL_SECRET` = *(ใส่ค่าจาก LINE Developers)*
   - `GEMINI_API_KEY` = *(ใส่ค่าจาก Google AI Studio)*
   - `GEMINI_MODEL` = `gemini-3.5-flash-lite`
6. กดปุ่ม **Create Web Service** รอระบบ Build ประมาณ 1–2 นาทีจนขึ้นสถานะสีเขียว **`Live`**

### ขั้นตอนที่ 3: นำ URL จาก Render ไปใส่ใน LINE Developers
1. คัดลอก URL ของเซิร์ฟเวอร์ที่ได้จาก Render (เช่น `https://pet-food-checker-bot.onrender.com`)
2. ไปที่ **LINE Developers Console** -> แท็บ **Messaging API** -> ช่อง **Webhook URL**
3. แก้เป็น URL ของ Render พร้อมเติม `/webhook` ต่อท้าย:
   ```text
   https://pet-food-checker-bot.onrender.com/webhook
   ```
4. กด **Update** และกด **Verify** — เสร็จเรียบร้อย! บอทของคุณพร้อมทำงานบน Cloud ตลอด 24 ชั่วโมงแล้วครับ 🎉
