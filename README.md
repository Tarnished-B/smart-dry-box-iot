# 📦 Smart Dry Box Dashboard

Một chiếc Web Dashboard nhỏ xinh dùng để theo dõi nhiệt độ và độ ẩm của tủ chống ẩm cá nhân (bảo vệ máy ảnh, linh kiện điện tử,...). 

Dự án này được build chủ yếu để vọc vạch kết nối phần cứng với web, và đặc biệt là code được "vibe" (prompt) ra với sự trợ giúp nhiệt tình từ AI chứ không gõ tay 100% đâu nha :V.

## ✨ Cái web này làm được gì?
* **Realtime:** Hiển thị thông số Nhiệt độ & Độ ẩm theo thời gian thực (đẩy từ mạch lên Firebase).
* **Biểu đồ:** Vẽ chart lịch sử môi trường siêu mượt bằng Recharts.
* **Giao diện:** Chơi hệ kính mờ (Glassmorphism) nhìn cho xịn, có nút gạt Dark/Light Mode đổi màu theo tâm trạng.
* **Tích hợp AI:** Lâu lâu nhờ Gemini đọc data rồi "phán" vài câu xem tình trạng tủ đang ổn hay sắp mốc.

## 🛠️ Đồ chơi công nghệ (Tech Stack)
* **Frontend:** ReactJS + Vite.
* **Database:** Firebase Realtime Database.
* **Backend:** Cloud Functions (chạy ngầm).
* **Khác:** OpenWeather API, Google Gemini API.

## 🚀 Cách chạy code trên máy tính (Local)

Nếu bạn muốn tải về chạy thử, hãy làm theo các bước sau:

1. Clone repo này về máy:
```bash
git clone [https://github.com/Tarnished-B/smart-dry-box-iot.git](https://github.com/Tarnished-B/smart-dry-box-iot.git)
```
2. Cài đặt thư viện:
```bash
npm install
```
4. Tạo một file tên là .env ở thư mục gốc (ngang hàng với package.json) và điền các API Key của bạn vào (Firebase, Weather, Gemini...). Lưu ý: repo này không chứa API Key thật để bảo mật.

5. Khởi chạy dự án:
npm run dev
Dự án cá nhân vọc vạch cuối tuần. Cảm ơn các bạn đã ghé xem! ✌️
