# Nhà thông minh nhóm 26 — bản bàn giao 23/10/2026

Gói này có code ESP32/Wokwi, giao diện điều khiển, trang giọng nói, Node-RED,
Home Assistant (tùy chọn), bộ kiểm thử và firmware đã build sẵn.

## Chạy trên máy Windows mới

1. Clone repo bằng Git hoặc giải nén toàn bộ ZIP vào một thư mục. Có thể đặt ở
   ổ khác `D:`; giữ nguyên cấu trúc và chạy các file `.bat` trong thư mục dự án.
2. Cài **Node.js từ phiên bản 22.13**, **VS Code** và extension **Wokwi Simulator**.
   Kích hoạt Wokwi bằng tài khoản/license của người sử dụng.
3. Chạy **`cai_dat_node_red.bat`** một lần và chờ báo cài đặt thành công.
   Các thư viện Node-RED sẽ được tải về máy này; cần Internet.
4. Chạy **`khoi_dong_demo.bat`** để mở trang điều khiển và workspace Wokwi.
   Đăng nhập bằng tài khoản trong `node_red/data/TAI_KHOAN_DEMO.txt` vừa được tạo trên máy.
5. Trong VS Code, nhấn **F1 → Wokwi: Start Simulator**. Gói đã có firmware
   trong `wokwi/build/`, nên **không cần build lại để chạy thử bản này**.
6. Giữ tab Wokwi hiển thị cạnh dashboard. Chờ **Phòng đã kết nối**, rồi bấm
   **Bắt đầu trải nghiệm**. Trang giọng nói mở từ **Thích nói hơn bấm?**.

| Trang | Địa chỉ trên máy đang chạy demo |
|---|---|
| Điều khiển căn phòng | http://localhost:1880/dashboard/room |
| Điều khiển giọng nói | http://localhost:1880/voice/voice.html |
| Flow Node-RED | http://localhost:1880 |

Home Assistant là phần mở rộng; không cần cài để dùng hai trang điều khiển.
Dùng Chrome hoặc Edge và cho phép micro khi thử giọng nói. Wokwi và nhận giọng nói
cần Internet; MQTT chạy trên máy với xác thực. Truy cập từ ngoài nhà chưa được cấu hình trong gói này.

## Hành vi của bản mới

- **Tự động / Giờ ngủ:** đèn theo người, máy lạnh giữ quanh mức bạn chọn (16–31°C, mặc định 25°C) khi phòng nóng và có người.
- **Tự điều khiển:** giữ đến khi đổi chế độ; bật đèn khi phòng vắng vẫn được.
- Mô phỏng tự gửi lại yêu cầu khi Wokwi kết nối lại. **Dừng trải nghiệm** dùng được
  cả lúc đang chờ xác nhận. Không cần bấm Thử lại liên tục.
- Kết thúc demo: chạy **`tat_node_red.bat`** và dừng Wokwi.

## Khi chỉnh code

- Giao diện/rule: sửa `node_red/dashboard.vue` hoặc `node_red/lib/`, chạy
  `node scripts/build-flows.cjs` trong thư mục `node_red`, rồi khởi động lại Node-RED.
- Firmware: sửa `wokwi/sketch.ino`, cài Arduino CLI và thư viện theo
  `wokwi/README.md`, sau đó chạy `wokwi/build.ps1` hoặc Ctrl+Shift+B.
  Đường dẫn bộ Arduino trong script là mặc định của máy gốc; truyền
  `-ArduinoCli` và `-ArduinoConfig` theo máy mới nếu cần.
- Hướng dẫn demo: `TEST_NHANH_5_PHUT.md`, `HUONG_DAN_CHAY_DEMO.md`.
- Kết quả kiểm thử mới nhất: **68 kiểm tra logic + 61 bước tích hợp đạt**. Xem `KET_QUA_KIEM_THU.md` và `node_red/data/test-e2e-result.json`.

Các đường dẫn `D:\IOT` trong tài liệu chi tiết là ví dụ của máy gốc;
thay bằng thư mục đã giải nén trên máy của bạn.

Nếu lấy code bằng Git, xem `HUONG_DAN_GITHUB.md`: các lần sau chỉ cần dừng demo,
chạy `git pull --ff-only` rồi mở lại; không cần tải lại ZIP.

Tài khoản không nằm trong Git. Mỗi máy tự tạo tài khoản và SQLite riêng. Xem [Authentication và Database](docs/XAC_THUC_VA_DATABASE.md).
