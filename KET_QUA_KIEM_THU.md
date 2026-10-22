# Kết quả kiểm thử — Node-RED / Wokwi / giọng nói

Các lần kiểm tra: **17 và 19/10/2026**. Node-RED **5.0.8**, Dashboard 2.0 **1.33.0**.

## Đã đạt

| Hạng mục | Kết quả |
|---|---|
| Rule AUTO/MANUAL/SLEEP, đèn theo người, độ mới, retry, CSV | 17/17 bài kiểm tra logic đạt |
| Mô hình inverter giữ 25°C, phản hồi ESP32, nguồn dữ liệu và mất kết nối | 10/10 bài kiểm tra đạt |
| Thu âm theo đoạn, chờ nói hết câu, nguồn mô phỏng, từ chối bật đèn lúc vắng | 12/12 bài kiểm tra sự kiện giả lập đạt |
| Node-RED thật + broker MQTT thật + thiết bị MQTT giả lập | 23/23 bước kiểm tra đạt, gồm thao tác trình duyệt |
| Chrome desktop 1280 px và mobile 390 px | Không có lỗi JavaScript; không tràn ngang; đã xem ảnh giao diện |
| Launcher PowerShell | Cú pháp hợp lệ; đã tắt và mở lại server nền thành công |
| Firmware ESP32 mới nhất | Biên dịch thành công; 957476 byte chương trình (73%), RAM 48408 byte (14%) |
| Thư viện trong VS Code | Cấu hình IntelliSense được tạo từ build thật: 321 đường dẫn, tìm thấy WiFi.h, PubSubClient.h, DHT.h, LiquidCrystal_I2C.h và Arduino.h; tự cập nhật sau build |
| Home Assistant | Đã cập nhật 6 khai báo MQTT Discovery; lệnh đèn/AC đi qua Node-RED |

E2E kiểm tra bật/tắt relay hai chiều, vùng trễ máy lạnh, ưu tiên MANUAL, hết thời gian
trở lại lịch SLEEP, đèn tắt ngay khi báo vắng, timeout AC demo 15 giây, từ chối điều khiển khi offline, khôi phục
sau kết nối lại, không điều khiển từ dữ liệu retained khi khởi động, lưu/đọc CSV và
nút bấm AUTO/SLEEP/demo/giờ trên dashboard. Thiết bị giả lập xác nhận lệnh qua MQTT.

Lần E2E mới nhất dùng tiền tố riêng `nhom26/test-3243668a4306` trên cổng 1881,
không gửi dữ liệu giả lập của bài test vào `nhom26/room1`. Server đồ án dùng cổng
1880, có chế độ phòng tự động gắn nhãn mô hình khi người dùng bật.
Kết quả máy đọc: [test-e2e-result.json](node_red/data/test-e2e-result.json).
Ảnh kiểm tra dùng dữ liệu của thiết bị giả lập:
[desktop](node_red/data/dashboard-test-desktop.png), [mobile](node_red/data/dashboard-test-mobile.png).

## Cần xác nhận khi chạy demo trực tiếp

**Lịch sử kiểm tra bản vòng 25–29°C trước lần sửa mới:** ngày 19/10, đã xác nhận toàn tuyến **Node-RED → khung mô hình → ESP32 Wokwi →
cảm biến/relay phản hồi → Node-RED**. Vòng quan sát trên Wokwi đang chạy: AC ON ở
25,3°C (đã bắt đầu làm lạnh trước thời điểm lấy mẫu), OFF ở 24,7°C, ON lại ở
29,1°C sau khoảng 92 giây của đợt theo dõi. Số quan sát quanh ngưỡng có độ trễ
do chu kỳ gửi dữ liệu/MQTT. [Báo cáo vòng Wokwi](node_red/data/test-environment-wokwi.json).
Đã thử Có người/Vắng người, trả về DHT22/PIR và bật mô hình lại qua nút dashboard.
[Báo cáo điều khiển](node_red/data/test-environment-controls.json).

Nhận dạng tiếng Việt qua micro thật cần người dùng cấp quyền và nói thử trong
Chrome/Edge. Kiểm tra sự kiện trình duyệt không thay thế bước thử micro thực tế.
“Hey Google” qua Matter chưa được kiểm tra do chưa có hub Google.

## Chạy lại kiểm tra

```powershell
node --test D:\IOT\test\controller.test.cjs D:\IOT\test\environment.test.cjs D:\IOT\test\voice_recognition.test.cjs
python D:\IOT\test\test_node_red_e2e.py --browser
```

E2E cần `paho-mqtt`, `playwright`, Google Chrome và Internet. Báo cáo JSON chỉ được
ghi sau khi toàn bộ bước kiểm tra thành công; xem lỗi terminal nếu một lần chạy mới dừng giữa chừng.

Cập nhật **19/10/2026**: sửa phép đổi LDR theo điện trở cố định 10k và nguồn 3,3V
(`R = 10000 * Vout / (3.3 - Vout)`). Hệ số 2000 của công thức 5V trước đó làm
số lux cao hơn giá trị đặt khi cấp nguồn 3,3V. Firmware mới đã build thành công:
**938788 byte (71%)**, RAM **48360 byte (14%)**; cấu hình IntelliSense tự tạo đủ 321
đường dẫn. Cần đối chiếu lux trên mạch đang chạy theo
[hướng dẫn test từng bước](HUONG_DAN_TEST_TU_DAU_DEN_CUOI.md).

Cập nhật giao diện **19/10/2026**: phần trình diễn mở sẵn, thêm khung giờ đang dùng
và tô nút theo chế độ thực tế để tránh AUTO vẫn xanh khi lịch đã chuyển SLEEP.
Đã bấm thử trên dashboard đang nối ESP32: 14:00 hiện ban ngày/AUTO, 23:00 hiện
ban đêm/SLEEP; chữ và nút được chọn cập nhật đúng. Sau kiểm tra đã trả lại 23:00,
demo bật và lịch tự động như trạng thái trước đó. Không có lỗi script hoặc tràn
ngang ở viewport 390px. [Báo cáo](node_red/data/test-clock-display-result.json),
[ảnh khung giờ](node_red/data/dashboard-clock-controls-fixed.png).

**Bản hiện hành, cập nhật sau đó ngày 19/10:** mô phỏng inverter đặt 25°C, giảm
mức làm lạnh để giữ nhiệt, relay bật ở 25,5°C và tạm ngừng ở 24,5°C. Đèn theo tín
hiệu có/vắng, không phụ thuộc lux; vắng tắt ngay kể cả MANUAL. SLEEP dùng cùng rule.
Đã đạt **39 bài kiểm tra logic** và **23 bước E2E**, gồm nút bấm desktop/mobile.
Trong test đóng vòng có phản hồi relay, nhiệt độ về quanh 25°C và giữ thêm 15 phút
mô phỏng mà AC chỉ nhận một lần ON, không chuyển OFF/ON lặp. Mức làm lạnh mô phỏng
giảm từ 100% về khoảng 31%, không phải số đo điện năng.
[Dấu vết mô hình](node_red/data/test-inverter-model.json),
[giao diện hiện hành](node_red/data/inverter-dashboard-desktop.png).
Wokwi đang offline ở lần sửa này nên chưa đối chiếu rule mới trên ESP32 chạy trực tiếp.
Các báo cáo/ảnh vòng Wokwi cũ ở trên chỉ chứng minh bản trước. Firmware giao thức
mô hình giữ nguyên; chạy Wokwi rồi bấm Bắt đầu trải nghiệm để kiểm tra trực tiếp.

## Giao diện dễ dùng — 22/10/2026

Trang chính có điểm bắt đầu rõ ràng, nút **Bắt đầu trải nghiệm**, hai lựa chọn
**Tôi ở trong phòng / Tôi ra khỏi phòng**, hình căn phòng theo phản hồi thiết bị
và nút bật/tắt ghi đầy đủ tên. Chế độ hiển thị bằng tiếng Việt, có giải thích.
Hướng dẫn kết nối và cài đặt thử nghiệm được mở khi cần; biểu đồ chỉ xuất hiện
khi mở **Cài đặt thử nghiệm & số liệu**. Trang giọng nói có ba bước sử dụng và nút về trang chính.
Launcher mở dashboard trước; trang giọng nói mở qua liên kết trên dashboard.

Đã đạt **39 bài kiểm tra logic** và **28 bước kiểm tra tích hợp** trên Node-RED
thật, dùng thiết bị MQTT giả lập với topic riêng `nhom26/test-af25c2255bf2`.
Các bước mới kiểm tra bắt đầu/dừng mô phỏng, ra/vào phòng, phản hồi đèn và máy lạnh,
khóa bật đèn khi vắng, quay lại tự động, hướng dẫn khi offline và kết nối lại.
Chrome đã kiểm tra các chiều rộng **320, 390, 768 và 1280 px**; không có lỗi script
hay tràn ngang. Giao diện và các nút đã được kiểm tra bằng trình duyệt; lần này
không thay thế việc thử trực tiếp với ESP32/Wokwi hoặc thu âm bằng micro thật.

- [Báo cáo 28 bước](node_red/data/test-e2e-result.json)
- [Ảnh desktop](node_red/data/dashboard-test-desktop.png)
- [Ảnh điện thoại](node_red/data/dashboard-test-mobile.png)
- [Ảnh hướng dẫn khi mất kết nối](node_red/data/dashboard-test-offline.png)
- [Ảnh trang giọng nói](node_red/data/voice-test-mobile.png)

Nguồn giao diện và flows trước khi sửa được giữ tại
`node_red/data/dashboard-before-ux-redesign.vue` và `node_red/data/flows-before-ux-redesign.json`.

## Sửa tự điều khiển và bật đèn khi vắng — cập nhật tiếp ngày 22/10/2026

Bản hiện tại thay quy tắc MANUAL của các báo cáo cũ: chọn Tự điều khiển hoặc gửi
lệnh tay qua nút/giọng nói/Home Assistant sẽ giữ MANUAL cho đến khi người dùng đổi
chế độ. Demo nhanh chỉ rút ngắn thời gian chờ vắng của máy lạnh trong AUTO/SLEEP;
không làm MANUAL hết hạn. Trong MANUAL, đèn và máy lạnh giữ lệnh tay dù phòng vắng.
Lệnh bật đèn không đòi hỏi tín hiệu có người; vẫn cần thiết bị online để gửi qua controller.
AUTO/SLEEP vẫn tắt đèn ngay khi vắng và áp dụng thời gian chờ vắng của máy lạnh.

Đã đạt **44 kiểm tra logic** và **31 bước tích hợp** trên topic riêng
`nhom26/test-e4782e15c764`. Kiểm tra trực tiếp bằng Chrome đã chọn Tự điều khiển,
chờ quá 15 giây, bật đèn trong phòng vắng và nhận phản hồi ON; quay lại Tự động thì
đèn tắt đúng theo cảm biến. Trang giọng nói được trỏ vào topic thử nghiệm riêng trong
phản hồi trình duyệt để kiểm tra đường lệnh bật đèn lúc vắng, không gửi lệnh vào phòng thật.
Các sự kiện nhận giọng nói vẫn được kiểm tra bằng mô phỏng, chưa thu âm micro thật.

- [Báo cáo 31 bước hiện tại](node_red/data/test-e2e-result.json)
- [Ảnh bật đèn lúc vắng, MANUAL vẫn được chọn](node_red/data/dashboard-manual-away-desktop.png)

Đã nạp đúng node điều khiển, template và ghi chú vào Node-RED cổng 1880.
Flow đang chạy trước thay đổi được lưu ở `node_red/data/flows-before-manual-fix-live.json`.
Bản này vẫn chỉ lắng nghe localhost; truy cập thực tế từ ngoài nhà cần cấu hình riêng.

## Sửa kẹt xác nhận mô phỏng — cập nhật tiếp ngày 22/10/2026

Đã thấy trực tiếp trạng thái `requested=true`, `active=false`, `pending=true` và lỗi
xác nhận còn giữ sau khi ESP32 kết nối lại. Firmware và checksum build khớp nguồn.
Trong lần thử lại có theo dõi MQTT, ESP32 thật đã phản hồi đúng chuỗi lệnh, báo
nguồn `model`, và nhiệt độ giảm từ 30°C xuống 26,4°C; sau đó giữ 25°C.

Bản sửa chờ 10 giây giữa các lần gửi, tối đa ba lần mỗi đợt, rồi tự thử lại sau
ít nhất 15 giây nếu thiết bị vẫn có báo cáo mới. Kết nối phục hồi hoặc ESP32 khởi
động lại sẽ gửi khung mới thay vì giữ lỗi và lệnh cũ. Retry không đặt lại nhiệt độ,
người hay chế độ. Dữ liệu retained không xác nhận chạy mô hình. Giao diện hiển thị
trạng thái đang chờ/tạm dừng đúng thực tế và luôn có nút Dừng khi chờ hoặc lỗi.

Đạt **51 kiểm tra logic** và **33 bước tích hợp** với topic riêng
`nhom26/test-91dc612c6aa2`. Bài tích hợp cố tình bỏ lệnh mô phỏng, chờ lỗi, khôi
phục đường lệnh rồi xác nhận tự phục hồi mà không bấm Thử lại; đồng thời bấm Dừng
ngay khi ESP32 chưa xác nhận bắt đầu. Các kiểm tra điều khiển tay và giọng nói vẫn qua.

Đã nạp bản sửa vào hai node liên quan trên cổng 1880 và theo dõi ESP32 thật thêm
30 giây: online, mô phỏng running, không lỗi, đèn/AC ON, nhiệt độ 25°C, mức làm lạnh
mô hình 31%. Không đổi firmware hay dùng dữ liệu thiết bị giả trên topic phòng thật.

- [Theo dõi phòng thật sau sửa](node_red/data/environment-recovery-live-result.json)
- [Ảnh phòng thật giữ 25°C](node_red/data/environment-recovered-real-room.png)
- [Ảnh chờ xác nhận trong bài kiểm thử](node_red/data/dashboard-recovery-waiting.png)
- [Báo cáo 33 bước hiện tại](node_red/data/test-e2e-result.json)

Wokwi cần giữ tab mô phỏng hiển thị; việc tự phục hồi không làm firmware tiếp tục
chạy khi bản thân trình mô phỏng đã bị tạm dừng.
