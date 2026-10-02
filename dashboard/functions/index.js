/* eslint-env node */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueCreated, onValueUpdated } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const SYSTEM_PROMPT = `==================================================
ROLE & CONTEXT
==================================================
You are an expert camera technician monitoring a "DIY Smart Dry Box". The assets inside are highly valuable, including electronic circuit boards, an Olympus mirrorless camera, and expensive lenses.

==================================================
OUTPUT STYLE & TONE
==================================================
Return a short, structured analysis in VIETNAMESE.
Format EXACTLY like this JSON. Do NOT wrap in markdown blocks.

{
  "temperature": "1-2 short sentences analyzing temperature in Vietnamese",
  "humidity": "1-2 short sentences analyzing humidity in Vietnamese",
  "summary": "1 short concluding sentence with actionable advice in Vietnamese"
}

TONE RULES (CRITICAL):
- Persona: Natural, flexible, and practical. Speak like a real technician reporting directly to the owner. Do NOT sound like a robotic automated system.
- Anti-Repetition: NEVER use the exact same sentence structure twice. Vary your opening phrases (e.g., sometimes go straight to the point, sometimes give a general remark first).
- Vocabulary Pool: You MUST flexibly utilize the following Vietnamese terms based on the condition (pick randomly, do not use all at once):
  + If Humidity > 50%: "nồm ẩm", "dư ẩm", "báo động đỏ cho ống kính", "nguy cơ nấm mốc", "rễ tre thấu kính", "dễ chạm mạch".
  + If Humidity < 40%: "hơi khô rát", "cẩn thận bong tróc cao su bọc máy", "nguy cơ khô mỡ bò vòng lấy nét".
  + If Ideal (40-50% & <30°C): "hoàn hảo", "môi trường êm ái", "yên tâm kê cao gối ngủ", "điều kiện tuyệt vời".

==================================================
ANALYSIS RULES (DOMAIN KNOWLEDGE)
==================================================
- Ideal Temperature: < 30°C. 
- Ideal Humidity: 40% - 50%. 
- Cross-Evaluation: Look at the big picture. If the temperature is slightly high but the humidity is perfect, reassure the user. If both are out of bounds, issue a stricter warning.

CURRENT INPUT DATA:
[Insert Temperature, Humidity data here]`;

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const ONE_HOUR_MS = 60 * 60 * 1000;
const HISTORY_LIMIT = 48;

function parseInsightJson(rawText) {
  const cleaned = String(rawText || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (!cleaned) {
    throw new Error("Gemini returned empty response text.");
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Gemini response does not contain valid JSON.");
    }
    return JSON.parse(jsonMatch[0]);
  }
}

/**
 * Lưu lịch sử độ ẩm đúng 1 lần mỗi giờ.
 * Chuyển sang onSchedule để tiết kiệm tối đa Invocations trên Spark Plan.
 * (Giảm từ ~8000 lần chạy xuống còn đúng 24 lần/ngày)
 */
exports.saveHumidityHistory = onSchedule(
  {
    schedule: "0 * * * *", // Chạy vào phút thứ 0 của mỗi giờ
    timeZone: "Asia/Ho_Chi_Minh",
    region: "asia-southeast1"
  },
  async () => {
    const db = admin.database();
    const dryBoxRef = db.ref("/DryBox");
    const historyRef = db.ref("/DryBox/HumidityHistory");
    const now = Date.now();

    try {
      const dryBoxSnap = await dryBoxRef.get();
      if (!dryBoxSnap.exists()) return null;

      const dryBox = dryBoxSnap.val() || {};
      const humidity = Number(dryBox.DoAm);
      const temperature = Number(dryBox.NhietDo);

      if (!Number.isFinite(humidity) || !Number.isFinite(temperature)) {
        logger.warn("Skip history save: invalid sensor values.", { humidity, temperature });
        return null;
      }

      const newHistoryRef = historyRef.push();
      await newHistoryRef.set({
        humidity,
        temperature,
        timestamp: now
      });

      logger.info("Hourly humidity history saved successfully.", { humidity, temperature });
      return null;
    } catch (error) {
      logger.error("Failed to save scheduled humidity history.", error);
      return null;
    }
  }
);

exports.generateAiInsight = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "Asia/Ho_Chi_Minh",
    region: "asia-southeast1",
    secrets: [GEMINI_API_KEY]
  },
  async () => {
    const apiKey = GEMINI_API_KEY.value();
    if (!apiKey) {
      logger.error("Missing GEMINI_API_KEY secret value.");
      return;
    }

    try {
      const dryBoxSnap = await admin.database().ref("/DryBox").get();
      if (!dryBoxSnap.exists()) {
        logger.warn("No sensor data found at /DryBox. Skipping AI insight update.");
        return;
      }

      const data = dryBoxSnap.val() || {};
      const temp = parseFloat(Number(data.NhietDo).toFixed(1));
      const humidity = parseFloat(Number(data.DoAm).toFixed(1));

      if (!Number.isFinite(temp) || !Number.isFinite(humidity)) {
        logger.warn("Invalid NhietDo/DoAm under /DryBox. Skipping.", data);
        return;
      }

      // TUYỆT CHIÊU: Lấy giờ hệ thống nhét vào Prompt để AI hành văn phong phú hơn
      const now = new Date();
      const timeString = now.toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

      const prompt = `${SYSTEM_PROMPT}\n\nNhiệt độ hiện tại: ${temp}°C, Độ ẩm: ${humidity}%, Thời điểm ghi nhận: ${timeString}.`;

      // Khai báo đúng 1 model chuẩn của nhánh Free
      const modelName = "gemini-3.1-flash-lite-preview";
      logger.info(`Đang gọi AI Model trực tiếp qua Fetch: ${modelName} lúc ${timeString}`);

      // GỌI API TRỰC TIẾP BẰNG FETCH
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Lỗi API trực tiếp: Mã ${response.status} - Chi tiết: ${errorText}`);
      }

      const jsonResult = await response.json();
      const textResponse = jsonResult?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textResponse || !textResponse.trim()) {
        throw new Error("API trả về kết quả rỗng.");
      }

      const parsed = parseInsightJson(textResponse);
      const payload = {
        temperature: String(parsed?.temperature || "").trim(),
        humidity: String(parsed?.humidity || "").trim(),
        summary: String(parsed?.summary || "").trim(),
        timestamp: admin.database.ServerValue.TIMESTAMP
      };

      if (!payload.temperature || !payload.humidity || !payload.summary) {
        throw new Error("Gemini response missing one of: temperature, humidity, summary.");
      }

      await admin.database().ref("/ai_insight/latest").set(payload);
      logger.info("AI insight updated successfully.", { temp, humidity, model: modelName });
    } catch (error) {
      logger.error("Failed to generate AI insight.", error);
    }
  }
);

/**
 * Tự động dọn dẹp Nhật ký hệ thống (/logs)
 * Giới hạn tối đa 100 bản ghi mới nhất.
 */
exports.truncateLogs = onValueCreated(
  {
    ref: "/logs/{logId}",
    region: "asia-southeast1"
  },
  async (event) => {
    const logsRef = admin.database().ref("/logs");

    try {
      const snapshot = await logsRef.orderByChild("timestamp").get();
      if (!snapshot.exists()) return;

      const numChildren = snapshot.numChildren();
      const LIMIT = 100;

      if (numChildren > LIMIT) {
        const updates = {};
        let i = 0;
        const numToRemove = numChildren - LIMIT;

        snapshot.forEach((child) => {
          if (i < numToRemove) {
            updates[child.key] = null;
          }
          i++;
        });

        await logsRef.update(updates);
        logger.info(`TruncateLogs: Đã dọn dẹp ${numToRemove} nhật ký cũ.`);
      }
    } catch (error) {
      logger.error("Lỗi khi tự động dọn dẹp logs:", error);
    }
  }
);

/**
 * Tự động dọn dẹp Lịch sử độ ẩm (/DryBox/HumidityHistory)
 * Giới hạn tối đa 48 bản ghi.
 */
exports.truncateHistory = onValueCreated(
  {
    ref: "/DryBox/HumidityHistory/{id}",
    region: "asia-southeast1"
  },
  async (event) => {
    const historyRef = admin.database().ref("/DryBox/HumidityHistory");

    try {
      const snapshot = await historyRef.orderByChild("timestamp").get();
      if (!snapshot.exists()) return;

      const numChildren = snapshot.numChildren();
      const LIMIT = 48;

      if (numChildren > LIMIT) {
        const updates = {};
        let i = 0;
        const numToRemove = numChildren - LIMIT;

        snapshot.forEach((child) => {
          if (i < numToRemove) {
            updates[child.key] = null;
          }
          i++;
        });

        await historyRef.update(updates);
        logger.info(`TruncateHistory: Đã dọn dẹp ${numToRemove} bản ghi lịch sử cũ.`);
      }
    } catch (error) {
      logger.error("Lỗi khi dọn dẹp HumidityHistory:", error);
    }
  }
);

/**
 * 1. Ghi nhật ký thiết bị: Chỉ chạy khi Quạt, Tấm nhiệt hoặc Vách ngăn thay đổi.
 */
exports.logDeviceChanges = onValueUpdated(
  {
    ref: "/DryBox/Devices",
    region: "asia-southeast1"
  },
  async (event) => {
    const prev = event.data.before.val() || {};
    const curr = event.data.after.val() || {};
    const messages = [];

    const devices = [
      { key: "Quat", label: "Quạt", type: "fan" },
      { key: "TamHutAm", label: "Tấm nhiệt", type: "heater" },
      { key: "VachNganTrong", label: "Vách ngăn trong", type: "door_in" },
      { key: "VachNganNgoai", label: "Vách ngăn ngoài", type: "door_out" }
    ];

    const dryBoxSnap = await admin.database().ref("/DryBox").get();
    const dryBox = dryBoxSnap.val() || {};
    const currentHop = dryBox.System?.Hop;

    devices.forEach(dev => {
      if (prev[dev.key] !== curr[dev.key] && curr[dev.key] !== undefined) {
        const c = curr[dev.key];
        
        // LOG THIẾT BỊ THÔNG THƯỜNG
        const stateText = dev.type.startsWith("door") 
          ? (c ? "đã MỞ" : "đã ĐÓNG")
          : (c ? (dev.type === "fan" ? "đã BẬT" : "đang HOẠT ĐỘNG") : (dev.type === "fan" ? "đã TẮT" : "đang CHỜ"));
        
        messages.push({
          message: `Thiết bị: ${dev.label} ${stateText}`,
          type: `${dev.type}_${c ? (dev.type.startsWith("door") ? "open" : "on") : (dev.type.startsWith("door") ? "closed" : "off")}`
        });

        // ĐẶC BIỆT: Nếu là Vách ngăn trong thay đổi khi đang ở Chế độ 1
        if (dev.key === "VachNganTrong" && currentHop === 1) {
          messages.push({
            message: c ? "Hệ thống: Chuyển sang Hút ẩm" : "Hệ thống: Chuyển sang Chế độ Chờ",
            type: c ? "mode_dehumidify" : "mode_standby"
          });
        }
      }
    });

    if (messages.length === 0) return null;
    return writeLogsToDb(messages);
  }
);

/**
 * 2. Ghi nhật ký Chế độ hệ thống: Chỉ chạy khi Chế độ (Hop) thay đổi.
 */
exports.logModeChanges = onValueUpdated(
  {
    ref: "/DryBox/System/Hop",
    region: "asia-southeast1"
  },
  async (event) => {
    const prev = event.data.before.val();
    const curr = event.data.after.val();
    if (prev === curr || curr === undefined) return null;

    const dryBoxSnap = await admin.database().ref("/DryBox/Devices").get();
    const devices = dryBoxSnap.val() || {};
    const isServo1Open = devices.VachNganTrong === true;

    if (curr === 1) {
      return writeLogsToDb([{
        message: isServo1Open ? "Hệ thống: Chuyển sang Hút ẩm" : "Hệ thống: Chuyển sang Chế độ Chờ",
        type: isServo1Open ? "mode_dehumidify" : "mode_standby"
      }]);
    }

    const modeNames = { 2: "Hệ thống: Chuyển sang Sấy hạt hút ẩm", 3: "Hệ thống: Chuyển sang Tản nhiệt hệ thống" };
    const modeIcons = { 2: "mode_dry", 3: "mode_cool" };

    return writeLogsToDb([{
      message: modeNames[curr] || "Hệ thống: Chế độ mới",
      type: modeIcons[curr] || "info"
    }]);
  }
);

/**
 * 3. Ghi nhật ký lỗi cảm biến: Chỉ chạy khi trạng thái cảm biến thay đổi.
 */
exports.logSensorError = onValueUpdated(
  {
    ref: "/DryBox/System/TrangThaiCamBien",
    region: "asia-southeast1"
  },
  async (event) => {
    const curr = event.data.after.val();
    if (curr === true || curr === undefined) return null; // Chỉ log khi lỗi (false)

    return writeLogsToDb([{
      message: "Hệ thống: Lỗi cảm biến (Mất kết nối hoặc hỏng)",
      type: "error"
    }]);
  }
);

/**
 * Hàm hỗ trợ ghi log (Helper)
 */
async function writeLogsToDb(messages) {
  const db = admin.database();
  const logsRef = db.ref("/logs");
  const updates = {};
  const timestamp = admin.database.ServerValue.TIMESTAMP;

  messages.forEach(item => {
    const newLogRef = logsRef.push();
    updates[`/logs/${newLogRef.key}`] = {
      message: item.message,
      type: item.type,
      timestamp: timestamp
    };
  });

  try {
    await db.ref().update(updates);
    logger.info(`Logs: Đã ghi ${messages.length} bản ghi mới.`);
  } catch (error) {
    logger.error("Lỗi khi ghi nhật ký:", error);
  }
  return null;
}
