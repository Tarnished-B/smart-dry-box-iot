/* eslint-env node */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueCreated } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const SYSTEM_PROMPT = `==================================================
OUTPUT STYLE & TONE (UPDATED)
==================================================

Return short structured analysis in Vietnamese.
Format exactly like this JSON. Do NOT wrap in markdown blocks.

{
  "temperature": "1-2 sentences analyzing temperature",
  "humidity": "1-2 sentences analyzing humidity",
  "summary": "1 sentence overall environmental status"
}

TONE RULES:
- Be concise, technical, and objective like a professional monitoring dashboard.
- CRITICAL: VARY YOUR VOCABULARY. Do NOT use the exact same phrasing every time. 
- Use synonyms for "ổn định" (duy trì tốt, cân bằng, không có biến động...), "cao" (vượt ngưỡng, tăng nhẹ, ấm hơn mức lý tưởng...), "thấp" (thiếu ẩm, khô, dưới chuẩn...).

==================================================
ANALYSIS RULES (UPDATED)
==================================================

- Ideal Temp: 24-28°C. Ideal Hum: 40-50%.
- EXPLAIN the context: Instead of just saying "Temp is high", say "Nhiệt độ 32°C đang vượt mức an toàn cho thiết bị".
- AVOID generic filler. Every word must carry analytical weight.
- NEVER copy the exact sentence structures from the examples below. The examples are strictly for demonstrating logical deduction, NOT for copy-pasting grammar.`;

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

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
      const modelName = "gemma-3-4b-it";
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
 * Tự động dọn dẹp Nhật ký hệ thống (DryBox/SystemLogs)
 * Giới hạn tối đa 100 bản ghi mới nhất.
 */
exports.truncateLogs = onValueCreated(
  {
    ref: "/DryBox/SystemLogs/{logId}",
    region: "asia-southeast1"
  },
  async (event) => {
    const logsRef = admin.database().ref("/DryBox/SystemLogs");

    try {
      const snapshot = await logsRef.get();
      if (!snapshot.exists()) return;

      const numChildren = snapshot.numChildren();
      const LIMIT = 100;

      if (numChildren > LIMIT) {
        const allLogs = [];
        snapshot.forEach((child) => {
          allLogs.push({
            key: child.key,
            timestamp: child.val().timestamp || 0
          });
        });

        allLogs.sort((a, b) => a.timestamp - b.timestamp);

        const numToRemove = allLogs.length - LIMIT;
        const logsToRemove = allLogs.slice(0, numToRemove);

        const updates = {};
        logsToRemove.forEach((log) => {
          updates[log.key] = null;
        });

        await logsRef.update(updates);
        logger.info(`Đã dọn dẹp ${numToRemove} nhật ký cũ thành công.`);
      }
    } catch (error) {
      logger.error("Lỗi khi tự động dọn dẹp logs:", error);
    }
  }
);