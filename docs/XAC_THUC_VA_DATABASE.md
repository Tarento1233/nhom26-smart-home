# Authentication và SQLite — bản 23/10/2026

## Chạy bản mới

1. Dừng Wokwi và chạy `tat_node_red.bat`.
2. Lấy code mới bằng `git pull --ff-only`, chạy lại `cai_dat_node_red.bat`.
   Cần Node.js **22.13 trở lên** để sử dụng SQLite tích hợp.
3. Chạy `khoi_dong_demo.bat`. Dịch vụ tự tạo tài khoản và database trên máy này.
4. Mở `node_red/data/TAI_KHOAN_DEMO.txt`, dùng tên đăng nhập và mật khẩu để vào web.
5. Chạy Wokwi trong VS Code bằng firmware mới. Giữ mô phỏng hiển thị.
   ESP32 tự nhận tài khoản qua cổng serial 4000 rồi đăng nhập broker.
6. Chờ **Phòng đã kết nối** và sử dụng như trước. Sau khi cập nhật, nhấn Ctrl+F5.

Mỗi máy có mật khẩu riêng. Không cần đăng ký dịch vụ cloud, không cài MySQL.
Chạy toàn bộ launcher đi kèm, không chỉ import riêng `flows.json` vào một Node-RED khác.

## Ba phần của hệ thống

| Phần | Chức năng đã làm |
|---|---|
| Device ESP32 | Đọc DHT22/LDR/PIR, LCD, relay/LED, nhận tài khoản qua serial, đăng nhập MQTT, nhận lệnh và phản hồi state |
| MQTT services | Aedes broker riêng, Authentication, ACL theo vai trò, Collect/Control bằng Node-RED, heartbeat/LWT và kiểm tra dữ liệu mới |
| Web server/app | Đăng nhập, dashboard/voice, điều khiển và nhiệt độ 16–31°C, truy vấn SQLite, biểu đồ và xuất CSV |

## Authentication

Web yêu cầu đăng nhập trước khi truy cập dashboard, voice, API và flow editor.
Mật khẩu được kiểm tra bằng **scrypt với salt riêng**. Phiên đăng nhập tồn tại 8 giờ,
cookie có `HttpOnly` và `SameSite=Strict`, database chỉ lưu hash của mã phiên.
Đăng xuất hủy phiên và ngắt kết nối dashboard của phiên đó.
Trang đăng nhập giới hạn 10 lần sai trong 15 phút theo địa chỉ IP.
Yêu cầu thay đổi dữ liệu có Origin khác máy chủ bị từ chối.

Broker Aedes chạy cùng dịch vụ Node-RED, chỉ lắng nghe **127.0.0.1**:

| Cổng | Công dụng |
|---|---|
| 1880 HTTP | Web, API, flow editor |
| 1883 MQTT TCP | ESP32 và controller |
| 1884 WebSocket `/mqtt` | Trang giọng nói |
| 4000 RFC2217 | Cổng serial do Wokwi mở; dịch vụ Windows kết nối để cấp tài khoản |

Broker xác thực tài khoản trước CONNACK thành công. Sai hoặc không có tài khoản bị từ chối.
Mật khẩu MQTT không xuất hiện trong firmware/flows đưa lên GitHub.

| Vai trò | Được phát bản tin | Được đăng ký nhận |
|---|---|---|
| device | Cảm biến, trạng thái ESP32, phản hồi relay/mô hình | Lệnh relay, chế độ LCD và khung mô hình |
| controller | Lệnh relay, trạng thái/chế độ controller, khung mô hình | Cảm biến, phản hồi thiết bị và yêu cầu người dùng |
| operator (voice) | Yêu cầu bật/tắt, chế độ và nhiệt độ | Trạng thái trong phòng của nhóm |
| integration (HA) | Yêu cầu người dùng và cấu hình discovery của nhóm | Trạng thái trong phòng và discovery của nhóm |

Tài khoản voice không được phát telemetry hoặc gửi thẳng lệnh vào relay.
Tài khoản ESP32 không được tự phát lệnh điều khiển, đọc phòng khác hoặc `$SYS`.
Các quyền được kiểm tra ở broker, không chỉ ẩn nút trên web.

Khi web đã đăng nhập, `/api/mqtt-config.js` cung cấp tài khoản operator cho trang voice
với `Cache-Control: no-store`. Đây là tài khoản MQTT riêng, không phải mật khẩu tài khoản web.
Script launcher/kiểm thử dùng token dịch vụ cục bộ, không gửi token đó vào trình duyệt.

## Cấp tài khoản cho ESP32

Wokwi VS Code có private gateway. ESP32 kết nối `host.wokwi.internal:1883` để đến broker Windows.
`wokwi.toml` mở RFC2217 cổng 4000. Khi chưa có tài khoản, firmware in thử thách
`N26_PROVISION <nonce>`; dịch vụ trả tài khoản qua serial cùng nonce. Firmware kiểm tra nonce,
lưu tài khoản trong RAM và kết nối MQTT có username/password.

Firmware build sẵn dùng được trên các máy trong nhóm mà không chia sẻ mật khẩu cố định.
Mỗi lần mô phỏng khởi động lại sẽ nhận tài khoản của máy đang chạy.
Kênh serial này chỉ phục vụ mô phỏng cục bộ; phần cứng thật cần cách cấp khóa riêng.

Nếu lặp `N26_PROVISION`: chạy Node-RED trước, kiểm tra `wokwi.toml` mới, cổng 4000
không bị ứng dụng khác chiếm, rồi dừng/chạy lại Wokwi. Wokwi web công khai không thay thế
private gateway của bản VS Code trong cấu hình này.

## Database

File chính: **`node_red/data/smart_home.sqlite`**. SQLite dùng WAL và prepared statements.

| Bảng | Nội dung |
|---|---|
| telemetry | Thời gian, loại sự kiện, chế độ, nhiệt độ/ẩm/lux, chuyển động, đèn/AC và chi tiết |
| users | Tên, vai trò, salt và hash scrypt; không lưu mật khẩu thô |
| sessions | Hash token phiên, tài khoản và thời điểm hết hạn |
| auth_events | Lần đăng nhập MQTT/web, kết quả, ACL bị từ chối và cấp tài khoản mô phỏng |
| mqtt_retained | MQTT retained để phục hồi trạng thái khi broker khởi động lại |
| metadata | Dấu nhập CSV cũ một lần |

CSV cũ được nhập một lần khi khởi động, giữ lịch sử đã có. Chạy lại không nhập trùng.
Các sự kiện mới được ghi vào SQLite và vẫn ghi CSV dự phòng. API lịch sử và tải CSV đọc từ SQLite.
Số liệu retained chỉ để hiển thị; controller vẫn đòi telemetry mới trước khi tự điều khiển.
Cài đặt nhiệt độ riêng AUTO/MANUAL tiếp tục nằm trong `data/preferences/`.

### Xem và truy vấn

Mở **Cài đặt thử nghiệm & số liệu → Lịch sử đã lưu**. Chọn loại hoạt động, thời điểm bắt đầu,
bấm **Xem lịch sử**. Bảng hiện tối đa 20 bản ghi mới nhất khớp bộ lọc.
**Tải lịch sử hoạt động (.csv)** xuất toàn bộ telemetry từ database.

API yêu cầu phiên đăng nhập hợp lệ:

```text
GET /api/database
GET /api/history?limit=20
GET /api/history?event=sensor%3Atemp_humid&limit=20
GET /api/history?from=2026-10-23T00:00:00Z&to=2026-10-24T00:00:00Z
GET /api/history?beforeId=100&limit=20
GET /api/log.csv
```

`limit` từ 1 đến 500, mặc định 200. Bản ghi trong mỗi trang trả theo thứ tự thời gian lưu.
Tham số sai trả HTTP 400; truy vấn dùng tham số SQL để không ghép trực tiếp giá trị vào câu lệnh.

## Dữ liệu riêng trên máy

`security.json`, `TAI_KHOAN_DEMO.txt`, SQLite/WAL, CSV và phiên nằm trong thư mục `data/`
đã được Git ignore. Không gửi thư mục này lên repo Public.
Để sao lưu đầy đủ: dừng dịch vụ rồi chép cả thư mục `node_red/data/` vào nơi riêng.
Không xóa database để sửa đăng nhập vì sẽ mất lịch sử.

Có thể đổi mật khẩu bằng cách dừng dịch vụ, sửa trường tương ứng trong `security.json`
(24–64 ký tự chữ/số, `_` hoặc `-`), cập nhật file tài khoản đọc được rồi chạy lại.
Dịch vụ đồng bộ hash mới và thu hồi phiên của tài khoản đổi mật khẩu.

Home Assistant là phần tùy chọn. `publish_discovery.py` đọc tài khoản integration từ máy này.
HA phải truy cập được broker trên cùng máy/network namespace hoặc qua đường chuyển tiếp cục bộ.
Máy ảo HA cũ đang trỏ HiveMQ cần cấu hình lại kết nối và tài khoản; localhost trong VM là chính VM.
Bản này chưa mở broker ra LAN/Internet và chưa cấu hình TLS.

## Kiểm thử

```powershell
cd node_red
npm test
cd ..
python test/test_node_red_e2e.py --browser
```

E2E dùng cổng HTTP 1881, MQTT 1885/1886, tài khoản/database và topic thử riêng.
Không phát dữ liệu giả lên phòng thật. Bộ kiểm thử xác nhận sai mật khẩu, ACL, đăng xuất,
truy vấn và lưu bền qua restart, cấp tài khoản serial, điều khiển và giao diện desktop/mobile.
Kết quả cụ thể nằm trong `KET_QUA_KIEM_THU.md`.

Tài liệu nền: [Aedes](https://github.com/moscajs/aedes/blob/main/docs/Aedes.md),
[Node SQLite](https://nodejs.org/api/sqlite.html),
[Wokwi VS Code](https://docs.wokwi.com/vscode/project-config),
[Wokwi mạng ESP32](https://docs.wokwi.com/guides/esp32-wifi).
