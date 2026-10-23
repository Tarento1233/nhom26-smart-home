# Lời thuyết trình 3 phần — Nhà thông minh nhóm 26

Áp dụng bố cục trong hình thầy gửi cho đồ án hiện tại. Mục tiêu khoảng 4 phút;
tập đọc một lần có bấm giờ và điều chỉnh theo tốc độ nói của người trình bày.
Các chỉ dẫn trong ngoặc vuông là thao tác, không đọc thành lời.

## Ba phần tương ứng với hình

| Phần trong hình | Nội dung đồ án nhóm 26 | Thời gian gợi ý |
|---|---|---|
| Part 1: Device (ESP32) | Mạch Wokwi, cảm biến, firmware, LCD, relay và LED | Khoảng 1 phút |
| Part 2: MQTT services on Server | Aedes chuyển bản tin; Node-RED thu thập, xử lý rule, gửi lệnh và theo dõi kết nối | Khoảng 1 phút 15 giây |
| Part 3: Web server app | Dashboard, giọng nói, biểu đồ, SQLite, biểu đồ và phản hồi thiết bị | Khoảng 1 phút |

Thêm mở đầu và kết thúc khoảng 40–45 giây. Có thể trình bày trên 3 màn hình
Wokwi, flow Node-RED và dashboard; không cần đọc mã nguồn trong thời gian này.

## Lời nói để tập

### Mở đầu — khoảng 20 giây

Em chào thầy. Nhóm em thực hiện đề tài giám sát và điều khiển một phòng thông minh.
Mục tiêu là theo dõi môi trường và điều khiển đèn, máy lạnh bằng giao diện web
hoặc giọng nói. Em xin trình bày ba phần: thiết bị ESP32, dịch vụ MQTT và ứng dụng web.

### Phần 1: Thiết bị ESP32 — khoảng 1 phút

[Chỉ vào mạch Wokwi trong VS Code.]

Phần thứ nhất là thiết bị ESP32, được mô phỏng bằng Wokwi trong VS Code.
Mạch gồm DHT22 đo nhiệt độ và độ ẩm, LDR đo ánh sáng, PIR phát hiện chuyển động,
màn hình LCD và hai ngõ ra relay điều khiển tải. Hai LED biểu diễn trạng thái đèn
và máy lạnh.

Firmware viết bằng C++, có hai nhiệm vụ chính: đọc cảm biến rồi gửi dữ liệu,
và nhận lệnh để thay đổi ngõ ra. Sau khi thực hiện, ESP32 gửi trạng thái về để
giao diện xác nhận. LCD cũng hiển thị nhiệt độ và trạng thái thiết bị.

Ngoài việc chỉnh cảm biến bằng tay, nhóm có mô hình phòng tự động. Mô hình tính
nhiệt độ rồi gửi qua ESP32, giúp trình diễn quá trình làm mát về quanh 25 độ và
giữ nhiệt. Đây là dữ liệu mô phỏng, chưa phải phép đo một căn phòng thực tế.

### Phần 2: Dịch vụ MQTT — khoảng 1 phút 15 giây

[Mở tab 01 · MQTT & tự động trong Node-RED.]

Phần thứ hai là truyền thông và xử lý trên server. Nhóm sử dụng broker Aedes
để chuyển bản tin MQTT, còn Node-RED chạy trên máy tính để xử lý logic.

ESP32 gửi dữ liệu vào các topic cảm biến. Node-RED đăng ký các topic này để nhận
dữ liệu và kiểm tra điều kiện. Khi cần điều khiển, Node-RED gửi lệnh vào topic
thiết bị mà ESP32 đang đăng ký. Như vậy, dữ liệu đi từ thiết bị lên hệ thống,
còn lệnh điều khiển đi ngược về thiết bị.

Trong AUTO, đèn bật khi có tín hiệu có người và tắt khi báo vắng. Máy lạnh có
mức đặt từ 16 đến 31 độ; mô hình giảm mức làm lạnh khi gần đạt nhiệt độ đặt. MANUAL ưu tiên
lệnh người dùng, còn SLEEP đánh dấu lịch ban đêm. Bản hiện tại dùng cùng rule
thiết bị cho AUTO và SLEEP.

ESP32 gửi heartbeat định kỳ; Node-RED theo dõi độ mới dữ liệu để báo mất kết nối
và tạm dừng rule khi dữ liệu cũ. Broker riêng yêu cầu tài khoản MQTT và kiểm tra hash mật khẩu trong SQLite.
Mỗi vai trò ESP32, controller và voice có quyền topic riêng. Sai mật khẩu bị từ chối;
voice không được giả dữ liệu cảm biến. Firmware nhận tài khoản qua serial của Wokwi,
không nhúng mật khẩu trong code đưa lên GitHub.

### Phần 3: Ứng dụng web — khoảng 1 phút

[Chuyển sang dashboard. Nếu demo, chỉ bấm một thao tác.]

Phần thứ ba là ứng dụng web, sử dụng Dashboard của Node-RED. Người dùng xem được
nhiệt độ, độ ẩm, ánh sáng, tín hiệu người trong phòng và trạng thái ESP32.
Giao diện có nút bật tắt thiết bị, lựa chọn chế độ và biểu đồ lịch sử.

Khi người dùng bấm nút, lệnh được đưa qua Node-RED và MQTT về ESP32. Giao diện
cập nhật trạng thái theo phản hồi thiết bị. Nhóm cũng bổ sung trang nhận lệnh
giọng nói tiếng Việt, ví dụ “tắt đèn” hoặc hỏi nhiệt độ.

Web yêu cầu đăng nhập trước khi dùng. SQLite lưu dữ liệu cảm biến, sự kiện điều khiển,
chế độ và nhật ký xác thực. Người dùng lọc lịch sử ngay trên giao diện hoặc tải CSV.
Khởi động lại vẫn giữ dữ liệu. Nhóm chọn SQLite để chạy gọn trên máy, chưa dùng phân tích AI.

### Kết thúc — khoảng 20–25 giây

Ba phần kết nối thành luồng: cảm biến, ESP32, MQTT, Node-RED và giao diện web;
lệnh điều khiển đi theo chiều ngược lại. Nhóm đã kiểm tra logic và luồng điều
khiển bằng MQTT. Hướng phát triển tiếp theo là triển khai phần cứng thực tế,
bổ sung TLS và truy cập từ xa. Em xin hết phần trình bày.

## Chuẩn bị trước khi đứng nói

1. Mở sẵn mạch Wokwi, flow Node-RED và dashboard ở ba tab/cửa sổ dễ chuyển.
2. Chờ ESP32 online. Nếu muốn nhiệt độ đã ổn định khi trình bày, chạy Phòng tự động
   trước khoảng 1–2 phút, để Có người và AUTO.
3. Phần 1 chỉ vào DHT22, LDR, PIR, LCD, hai relay/LED.
4. Phần 2 chỉ tuyến MQTT in → controller → MQTT out; không đọc toàn bộ topic hay mã nguồn.
5. Phần 3 có thể bấm Vắng người để thấy đèn tắt, rồi Có người để đèn bật lại.
   Không chờ cả chu kỳ làm lạnh trong bài nói. Nếu demo trực tiếp, dành 15–20 giây
   và rút ngắn phần đọc tên linh kiện.

## Những điểm cần nói đúng khi thầy hỏi

- **Broker khác Node-RED thế nào?** Aedes chuyển bản tin giữa bên gửi và bên đăng ký;
  Node-RED nhận dữ liệu, chạy rule, tạo giao diện và lưu database.
- **Có đủ mọi chức năng của hình mẫu chưa?** Hình là kiến trúc tham khảo.
  Nhóm đã làm thiết bị mô phỏng, thu thập/điều khiển MQTT, giám sát kết nối,
  web, xác thực MQTT, phân quyền topic, SQLite và truy vấn lịch sử.
  Chưa có PCB/vỏ hộp thật hoặc TLS/truy cập từ xa.
- **SLEEP có phải low-power/deep sleep ESP32 không?** Không. Đây là tên chế độ
  lịch ban đêm của ứng dụng; firmware hiện vẫn chạy và duy trì MQTT.
- **AUTO và SLEEP khác nhau thế nào?** SLEEP được chọn theo lịch 23:00–06:00
  hoặc bằng nút; bản hiện tại cùng rule đèn và máy lạnh với AUTO.
- **PIR có phát hiện người ngồi yên không?** PIR phát hiện chuyển động. Trong
  bài demo, Có người/Vắng người là trạng thái giả lập; chưa chứng minh được
  nhận biết hiện diện liên tục bằng phần cứng thực tế.
- **Máy lạnh có điều chỉnh inverter thật không?** Chưa. Relay biểu diễn cho phép
  bật/tắt máy lạnh, còn mức làm lạnh thay đổi nằm trong mô hình nhiệt.
- **Phần trăm làm lạnh có chứng minh tiết kiệm điện không?** Không phải số đo
  công suất hoặc kWh. Muốn đánh giá điện năng cần thiết bị và phép đo thực tế.
- **Data analysis đã làm gì?** Biểu đồ và lịch sử phục vụ quan sát xu hướng,
  đối chiếu cảm biến và lệnh; chưa có dự báo hay mô hình học máy.

Nếu cần rút còn khoảng 3 phút: bỏ đoạn mô hình nhiệt ở phần 1, bỏ câu SLEEP và
chi tiết ACL trong lời nói phần 2, rút phần 3 còn dashboard, phản hồi và database. Vẫn
trả lời rõ các giới hạn trên nếu thầy hỏi.


## Demo Authentication và Database (thêm khoảng 30 giây)

- Đăng xuất web và thử mật khẩu sai: hệ thống từ chối. Đăng nhập đúng để mở phòng.
- Mở **Cài đặt thử nghiệm & số liệu → Lịch sử đã lưu**, chọn Nhiệt độ và độ ẩm,
  bấm Xem lịch sử. Đổi nhiệt độ hoặc bật/tắt rồi tải CSV để đối chiếu.
- Nếu thầy hỏi kiểm thử âm: tài khoản voice phát telemetry bị broker ngắt kết nối;
  thiết bị đăng ký phòng khác nhận SUBACK từ chối. Có kiểm thử tự động đi kèm.
- Giải thích SQLite là database SQL lưu trên đĩa, có bảng/index/prepared statements,
  không cần chạy thêm MySQL. Chưa nói rằng đã triển khai TLS hoặc máy lạnh vật lý.
