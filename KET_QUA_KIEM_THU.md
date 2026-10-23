# Kết quả kiểm thử — cập nhật 23/10/2026

Bản hiện tại: Node-RED 5.0.8, Dashboard 2.0 1.33.0, Aedes 1.2.0 và SQLite của Node.js.

| Hạng mục | Kết quả |
|---|---|
| Controller, mô hình nhiệt và nhận dạng câu lệnh | 59 kiểm thử đạt |
| SQLite, ACL, serial và biểu đồ | 9 kiểm thử đạt |
| Tổng kiểm thử tự động bằng Node | **68/68 đạt** |
| Tích hợp HTTP/MQTT/SQLite và Chrome | **61/61 bước đạt** |
| Firmware ESP32 | Build thành công: 958892 byte chương trình (73%), RAM 48472 byte (14%) |
| Launcher và cài đặt | Lockfile cài được; dịch vụ mới đã khởi động trên cổng 1880 |
| Chuyển lịch sử cũ | 6350 bản ghi CSV được nhập vào SQLite một lần, không xóa CSV |

## Các trường hợp đã kiểm tra

- Web yêu cầu đăng nhập trước dashboard, voice, API lịch sử và file cấu hình MQTT.
- Mật khẩu web sai bị từ chối; cookie có HttpOnly/SameSite Strict; đăng xuất thu hồi phiên.
- Phiên web còn hiệu lực sau khi restart dịch vụ. Origin ngoài máy chủ không được điều khiển.
- MQTT không tài khoản hoặc sai mật khẩu bị từ chối. Device không đăng ký được phòng khác.
- Voice đăng nhập được qua WebSocket, nhưng không được giả telemetry cảm biến.
- SQLite giữ telemetry, mật khẩu đã hash, phiên và nhật ký xác thực sau restart.
- Lọc sự kiện, thời gian, số lượng và con trỏ lịch sử dùng prepared statements;
  tham số sai trả HTTP 400. CSV có dấu phẩy/ngoặc kép/xuống dòng được đọc đúng.
- CSV cũ chỉ nhập một lần. Tải CSV đọc từ SQLite; dữ liệu không mất sau khi khởi động lại.
- RFC2217 giải mã thương lượng bị chia gói và trả tài khoản đúng nonce qua serial giả lập.
- AUTO/MANUAL/SLEEP, bật đèn lúc vắng, giữ MANUAL, timeout vắng của AC, hysteresis theo mức đặt.
- Chọn nhiệt độ 16–31°C, nhớ riêng AUTO và MANUAL qua restart; voice dùng cùng cài đặt.
- Khung mô hình chờ ESP32 ACK, không giả online, tự phục hồi sau khi có dữ liệu mới.
- Chrome desktop/mobile bấm được các nút thật, lọc lịch sử SQLite, đổi chế độ, đăng xuất.
- Các chiều rộng 320, 390, 768 và 1280px không tràn ngang, không có lỗi JavaScript.

E2E chạy trên HTTP 1881, MQTT 1885/1886, bộ topic **nhom26/test-b2d8f7281231**,
file tài khoản/database riêng. Dùng thiết bị MQTT giả lập có phản hồi, không phát dữ liệu
vào phòng thật `nhom26/room1`. CSV xuất cuối lần kiểm thử có **252 bản ghi**.

## Bản đang chạy trên máy

Dashboard: <http://localhost:1880/dashboard/room>. Tài khoản riêng nằm trong
`node_red/data/TAI_KHOAN_DEMO.txt`; file này không nằm trong Git.
SQLite lưu tại `node_red/data/smart_home.sqlite`. Dịch vụ vẫn giữ các mức nhiệt đã lưu trước đây.

Broker cục bộ đã kết nối với Node-RED. ESP32 cần **dừng và chạy lại Wokwi** với firmware
mới để nhận tài khoản qua serial và kết nối private gateway. Lần cập nhật này đã build firmware,
kiểm tra giao thức serial và MQTT bằng test tự động, **chưa xác nhận vòng chạy trực tiếp
trên Wokwi sau khi đổi broker**. Không dùng thiết bị giả lập để làm phòng thật báo online.
Micro tiếng Việt thật và phần cứng relay/máy lạnh thật vẫn cần kiểm tra trực tiếp.
Home Assistant trong máy ảo cần đổi khỏi broker HiveMQ cũ và thiết lập đường đến broker riêng.

## Chạy lại

```powershell
cd node_red
npm test
cd ..
python test/test_node_red_e2e.py --browser
```

E2E cần Python `paho-mqtt`, `playwright` và Google Chrome. Wokwi/nhận dạng giọng nói
cần Internet; broker MQTT của bản mới chạy cục bộ.

Báo cáo và ảnh chỉ lưu trên máy chạy, được Git ignore:

- `node_red/data/test-e2e-result.json`
- `node_red/data/login-test-desktop.png`
- `node_red/data/database-history-desktop.png`
- `node_red/data/dashboard-test-desktop.png`
- `node_red/data/dashboard-test-mobile.png`
- `node_red/data/voice-test-mobile.png`

Chi tiết triển khai: [Authentication và SQLite](docs/XAC_THUC_VA_DATABASE.md).


## Sửa biểu đồ ngày 23/10

- Mặc định xem 15 phút gần nhất theo giờ thực; nhãn giờ thử của demo không đổi timestamp đo.
- Tiêu đề có số đo mới nhất và giờ cập nhật. Giá trị ánh sáng không đổi vẫn hiện đường rõ ràng
  vì thang dọc chừa khoảng ở cả hai phía.
- Chèn điểm ngắt khi mất dữ liệu quá 25 giây, không nối chéo qua nhiều giờ ngừng chạy.
- Khôi phục lịch sử theo thứ tự thời gian và thay toàn bộ lô dữ liệu cũ, tránh vẽ nối sai thứ tự.
- Kiểm thử bao gồm mẫu 500 lux không đổi, dữ liệu hôm qua, mất tín hiệu, mẫu đến muộn,
  cửa sổ 15 phút trong ECharts thật và trường hợp không có dữ liệu mới.
- Bản local đã được nạp các node biểu đồ; controller, chế độ và nhiệt độ đang đặt được giữ nguyên.
