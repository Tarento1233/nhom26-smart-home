# Hướng dẫn chạy demo — Nhà thông minh nhóm 26

Luồng chính: **ESP32/Wokwi trong VS Code → MQTT → Node-RED → Dashboard**.
Node-RED xử lý tự động, AUTO/MANUAL/SLEEP, lịch ban đêm và ghi log CSV.

Hướng dẫn thao tác từng bước và kết quả cần thấy:
[Test từ đầu đến cuối](HUONG_DAN_TEST_TU_DAU_DEN_CUOI.md).

**Demo tự chạy:** sau khi ESP32 online, bấm **Bắt đầu trải nghiệm** trên dashboard.
Nhiệt độ bắt đầu 30°C, máy lạnh làm mát về quanh 25°C rồi giảm mức làm lạnh để
giữ nhiệt. Xem LCD/dashboard và dòng Mức làm lạnh mô phỏng. Có người → đèn bật,
Vắng người → đèn tắt ngay khi ESP32 phản hồi; AC tắt sau 15 giây vắng trong demo.
Bấm **Dừng trải nghiệm** trước khi làm kịch bản kéo cảm biến bên dưới.

## Mở hệ thống

1. Bấm đúp **`D:\IOT\khoi_dong_demo.bat`**.
2. Trong VS Code: **Ctrl+Shift+B**, chờ **Build OK**, rồi **F1 → Wokwi: Start Simulator**.
3. Xếp cửa sổ Wokwi và dashboard cạnh nhau. Giữ tab mạch đang hiển thị.
4. Chờ LCD có **OK**, dashboard báo **Phòng đã kết nối**. Đổi DHT22 một lần để kiểm tra dữ liệu mới.

| Thành phần | Địa chỉ / file |
|---|---|
| Dashboard Node-RED | <http://localhost:1880/dashboard/room> |
| Sơ đồ flow để trình thầy | <http://localhost:1880> |
| Trang giọng nói | <http://localhost:1880/voice/voice.html> |
| Log CSV | <http://localhost:1880/api/log.csv> |
| Home Assistant (máy ảo, nếu dùng) | <http://localhost:8123> |
| Hướng dẫn chi tiết, topic và kiểm thử | [node_red/README.md](node_red/README.md) |
| Hướng dẫn Wokwi/license/build | [wokwi/README.md](wokwi/README.md) |

## Kịch bản demo nhanh

Trên dashboard mở **Cài đặt thử nghiệm & số liệu**, bật **Demo nhanh**, chọn **14:00**, chọn **AUTO**.

1. Đặt DHT22 **29°C**, LDR khoảng **100 lux**, bấm PIR → **Simulate Motion**.
   Đèn vàng và LED xanh bật; dashboard và LCD cập nhật.
2. Hạ nhiệt độ **25°C** → AC giữ bật; hạ **24,5°C** → AC tắt. Tăng **25,5°C** và kích PIR → bật lại.
3. Trên trang giọng nói, bấm micro rồi nói **“tắt đèn”**. Chờ khoảng 2,5 giây hoặc bấm micro lần nữa.
   Đèn tắt, hệ thống chuyển **MANUAL** và giữ đến khi bạn chọn chế độ khác.
4. Chọn AUTO, kích PIR rồi để nó hết chuyển động. Đèn tắt ngay khi nhận PIR về thấp;
   AC sau **15 giây** trong demo, **10 phút** bình thường. MANUAL AC vẫn ưu tiên lệnh tay.
5. Chọn **23:00**, chọn AUTO → **SLEEP**; đèn vẫn theo có/vắng người, AC đặt **25°C**.
6. Dừng Wokwi → dashboard báo offline/dữ liệu cũ; chạy lại → online khi có heartbeat.
7. Bấm **Tải log CSV** và mở hai biểu đồ để trình bày luồng dữ liệu và lịch sử.

Kết thúc demo: tắt Demo nhanh, chọn Giờ thật, chọn AUTO.

## Home Assistant và Matter

Home Assistant/Matter dùng làm phần mở rộng. Cập nhật đường lệnh qua Node-RED:

```powershell
python D:\IOT\home_assistant\publish_discovery.py
```

Các thiết bị vẫn dùng unique_id và topic phản hồi cũ. Flow cũng nhận diện lệnh MQTT
trực tiếp từ cấu hình HA cũ để ưu tiên MANUAL. “Hey Google” qua Matter cần hub Google;
trang giọng nói trên laptop dùng được với micro của trình duyệt.

## Tắt và mở lại

- Tắt Node-RED: bấm **`D:\IOT\tat_node_red.bat`**.
- Dừng Wokwi trong VS Code.
- Nếu bật Home Assistant: VirtualBox → HomeAssistant-IoT → **ACPI Shutdown**.
- Node-RED chạy nền nên đóng cửa sổ khởi động không làm server dừng. Log giữ ở `node_red/data/telemetry.csv`.

## Gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| ESP32 offline/dữ liệu cũ | Giữ Wokwi hiển thị và chạy, xem Wokwi Terminal có WiFi OK/MQTT OK |
| Node-RED chưa sẵn sàng | Chạy `khoi_dong_node_red.bat`; xem `node_red/data/node-red.log` |
| Có số nhưng không tự động | Dữ liệu có thể là retained; cần firmware heartbeat mới và chế độ AUTO/SLEEP |
| Vừa tắt đèn nhưng nó không tự bật lại | Đang Tự điều khiển; chọn Tự động để chạy theo cảm biến |
| Trang voice còn giao diện cũ | Nhấn **Ctrl+F5**; dùng địa chỉ cổng **1880** ở trên |
| Không nhận micro | Dùng Chrome/Edge có hỗ trợ nhận giọng nói và cho phép micro của localhost |
| Máy khác chưa có thư viện Node-RED | Cài Node.js >=22 rồi chạy `cai_dat_node_red.bat` |
| Wokwi thiếu/hết hạn license | F1 → Wokwi: Request a New License; xem [hướng dẫn](wokwi/README.md) |

Bản này chạy local trên laptop; MQTT và dịch vụ nhận giọng nói cần Internet.
