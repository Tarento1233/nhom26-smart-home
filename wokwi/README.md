# Nhà thông minh nhóm 26 — Wokwi trong VS Code

Bản này dùng lại `sketch.ino` và `diagram.json` của đồ án: ESP32, DHT22, LDR,
PIR, hai relay, LED vàng (đèn), LED xanh (máy lạnh), LCD I2C.
Broker là Aedes trên máy Windows, ESP32 truy cập qua `host.wokwi.internal:1883`.
Chạy Node-RED trước, rồi Wokwi VS Code với private gateway. Dịch vụ cấp tài khoản
cho ESP32 qua serial RFC2217 cổng 4000. Firmware build sẵn không chứa mật khẩu.
Chi tiết: [Authentication và Database](../docs/XAC_THUC_VA_DATABASE.md).

## Mở và chạy

1. Bấm đúp `D:\IOT\mo_wokwi_vscode.bat`, hoặc mở
   `D:\IOT\Nhom26-SmartHome.code-workspace` bằng VS Code.
   Nếu mở thư mục thủ công, chọn **`D:\IOT\wokwi`**, nơi có `wokwi.toml`.
2. Cần extension **Wokwi Simulator** (`Wokwi.wokwi-vscode`).
3. Lần đầu: **F1 → Wokwi: Request a new License** → mở trang Wokwi,
   đăng nhập tài khoản của mình, bấm **GET YOUR LICENSE**, rồi mở lại VS Code
   để kích hoạt. Đây là license riêng cho VS Code; tài khoản web không tự kích hoạt extension.
   [Trang cấp license](https://wokwi.com/license) hiện cấp mã cá nhân 30 ngày
   và ghi Wokwi cho VS Code miễn phí cho dự án nguồn mở; dùng thương mại cần mua license.
   Khi mã hết hạn, dùng lại lệnh Request a New License để yêu cầu mã mới theo điều kiện của tài khoản.
   File nguồn, sơ đồ mạch và bộ biên dịch cục bộ vẫn sử dụng được khi license mô phỏng hết hạn.
4. **Ctrl+Shift+B** để biên dịch. Chờ terminal báo **Build OK**.
   Firmware có sẵn trong `build/` cũng dùng được khi chỉ cần chạy lại.
5. **F1 → Wokwi: Start Simulator**. Chờ LCD hiện nhiệt độ và **OK**.
   Serial Monitor sẽ có `WiFi OK` và `MQTT connecting ... OK`.
6. Mở Home Assistant: <http://localhost:8123>.
   Trang giọng nói: <http://localhost:1880/voice/voice.html> (chạy bằng file demo).

Sau khi sửa `sketch.ino`, lưu file rồi **Ctrl+Shift+B**.
Wokwi tự nạp lại firmware khi build xong. Chỉnh mạch trong `diagram.json`;
dừng và chạy lại mô phỏng sau khi chỉnh. Giữ tab mô phỏng hiển thị khi demo;
Wokwi trong VS Code vẫn có thể tạm dừng khi tab bị ẩn.
Chỉ chạy một mô phỏng của nhóm tại một thời điểm để tránh hai ESP32 cùng điều khiển một bộ topic.

## Biên dịch bằng PowerShell

```powershell
cd D:\IOT\wokwi
powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
```

Script dùng bộ Arduino CLI + ESP32 core + thư viện đã cài tại `D:\Tools\arduino`.
Nó tạo bản sao nguồn đúng tên thư mục Arduino trong `build/source/sketch`,
build cache tại `build/cache`, và xuất firmware về `build/`.
Chỉ sửa file nguồn `sketch.ino` ở thư mục ngoài.

Nếu chuyển máy: cài Arduino CLI, board `esp32:esp32`, và bốn thư viện trong
`libraries.txt` bằng Arduino CLI/Library Manager. File `libraries.txt` phục vụ
Wokwi web; Arduino CLI không tự cài thư viện từ file này.
Có thể chỉ định đường dẫn bộ công cụ:

```powershell
.\build.ps1 -ArduinoCli 'C:\Tools\arduino-cli.exe' -ArduinoConfig 'C:\Tools\arduino-cli.yaml'
```

## File cần biết

| File | Vai trò |
|---|---|
| `sketch.ino` | Firmware nguồn để sửa |
| `diagram.json` | Mạch gốc của nhóm |
| `wokwi.toml` | Trỏ Wokwi tới firmware `.merged.bin` và ELF trong `build/` |
| `build.ps1` | Biên dịch cục bộ, kiểm đầu ra, ghi checksum nguồn trong `build/build-info.json` |
| `configure-intellisense.ps1` | Lấy đường dẫn thư viện và defines từ Arduino build để cấu hình VS Code; tự chạy sau mỗi build |
| `.vscode/c_cpp_properties.json` | Cấu hình thư viện/compiler cho IntelliSense, tự tạo từ build trên máy hiện tại |
| `.vscode/tasks.json` | Phím tắt build Ctrl+Shift+B |
| `../khoi_dong_demo.bat` | Bật Node-RED, mở dashboard và workspace VS Code; Home Assistant nếu có |

## Kiểm tra demo

1. Chỉnh DHT22 lên 35°C → LCD, Home Assistant và trang giọng nói cập nhật sau khoảng 5 giây.
2. Bật/tắt **Den phong** → relay và LED vàng đổi trạng thái.
3. Bật/tắt **May lanh** → relay và LED xanh đổi trạng thái.
4. Kích hoạt PIR, chỉnh ánh sáng LDR → giá trị tương ứng cập nhật.
5. Nói **“bật đèn”**, **“nhiệt độ bao nhiêu”** trên trang giọng nói.

Phần Node-RED, dashboard, AUTO/MANUAL/SLEEP và log CSV đã được bổ sung trong
`../node_red`. Xem [hướng dẫn Node-RED](../node_red/README.md).
Firmware gửi heartbeat 5 giây và nhận chế độ/nhiệt độ đặt để hiển thị LCD.
Dòng trên: `T` là nhiệt độ phòng, `S` là mức đặt máy lạnh (16–31°C), `H` là độ ẩm. Dòng dưới:
`D0/D1` = đèn tắt/bật, `A0/A1` = máy lạnh tắt/bật, tiếp theo là chế độ và `OK`.
Ký tự **S** ở ô cuối dòng dưới cho biết đang dùng mô hình phòng tự động.
Trên dashboard bấm Bắt đầu trải nghiệm để xem nhiệt độ thay đổi về mức bạn chọn bằng nút − / + khi AC bật (mặc định 25°C),
rồi mô hình inverter giảm mức làm lạnh để giữ nhiệt. LED xanh ON cho biết máy
lạnh được phép chạy; phần trăm làm lạnh chỉ là dữ liệu mô hình trên dashboard.
Đèn bật khi có người, tắt khi báo vắng, kể cả phòng sáng và chế độ SLEEP.
DHT22/PIR chỉnh tay được dùng lại khi bấm
Dừng trải nghiệm; LDR vẫn hoạt động trong cả hai chế độ.

## Gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| Không thấy `wokwi.toml` | Mở workspace ở bước 1, hoặc F1 → Wokwi: Select Config File → chọn file trong thư mục `wokwi` |
| Không thấy firmware | Ctrl+Shift+B; xem lỗi trong terminal nếu chưa có Build OK |
| Báo thiếu/hết hạn license | F1 → Wokwi: Request a new License; kiểm tra license trong tài khoản Wokwi |
| LCD chưa có OK | Xem Serial Monitor; chạy Node-RED trước; nếu lặp N26_PROVISION, kiểm tra cổng serial 4000 và wokwi.toml; sau đó kiểm tra private gateway |
| Home Assistant báo Unavailable | Kiểm tra mô phỏng đang chạy và hiển thị, LCD có OK; đóng bản Wokwi web đang chạy song song |
| Build báo thiếu thư viện | Cài đủ thư viện trong `libraries.txt` vào bộ Arduino CLI đang dùng |
| VS Code báo `cannot open source file` nhưng build vẫn được | Ctrl+Shift+B để cập nhật cấu hình IntelliSense; nếu vẫn còn báo cũ, F1 → Developer: Reload Window |
| `Wokwi`, `MQTT`, `Aedes`: Unknown word | Cảnh báo chính tả; từ kỹ thuật của project được khai báo trong `.vscode/settings.json` |

Tài liệu chính thức: [Bắt đầu với VS Code](https://docs.wokwi.com/vscode/getting-started),
[cấu hình dự án](https://docs.wokwi.com/vscode/project-config).
