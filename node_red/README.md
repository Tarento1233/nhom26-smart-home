# Nhà thông minh nhóm 26 — Node-RED + Wokwi trong VS Code

Luồng chính: **cảm biến → ESP32/Wokwi → MQTT HiveMQ → Node-RED → Dashboard**.
Lệnh tay và rule được Node-RED xử lý rồi gửi về ESP32. Home Assistant/Matter
và trang giọng nói dùng chung MQTT với luồng này.

## Dùng giao diện lần đầu

Trang chính giải thích mục đích, chỉ nơi bắt đầu và hiển thị căn phòng theo phản hồi thiết bị.
Khi báo **Phòng đã kết nối**, bấm **Bắt đầu trải nghiệm**, rồi thử **Tôi ở trong phòng**
và **Tôi ra khỏi phòng**. Mỗi thiết bị có nút bật/tắt ghi rõ tên và giải thích ngay bên cạnh.
**Tự động / Tự điều khiển / Giờ ngủ** tương ứng với AUTO / MANUAL / SLEEP trong phần kỹ thuật.
**Tôi mới dùng, chỉ tôi với** có hướng dẫn kết nối; **Cài đặt thử nghiệm & số liệu**
chứa đồng hồ demo, thời gian chờ, cảm biến, tải lịch sử và mở các biểu đồ bên dưới.
Trang giọng nói mở từ **Thích nói hơn bấm?**, có liên kết quay về căn phòng.

**Bật đèn trước khi về:** bấm hoặc nói bật đèn khi phòng vắng vẫn được chấp nhận.
Lệnh tay chuyển sang MANUAL, giữ đến khi bạn tắt hoặc đổi chế độ; Demo nhanh không
tự trả về AUTO. Chọn **Tự động** để áp dụng lại cảm biến và lịch.
Đây là hành vi điều khiển của bản demo; server hiện chỉ mở trên localhost.
Muốn sử dụng từ điện thoại khi ở ngoài nhà cần cấu hình truy cập từ xa riêng.

## Chọn nhiệt độ 16–31°C

Chọn **Tự điều khiển** hoặc **Tự động**, rồi bấm **− / +** ở thẻ Máy lạnh.
Mỗi chế độ nhớ mức riêng; **Giờ ngủ** dùng chung mức Tự động. Đổi mức đặt không
đổi chế độ, không tự bật máy đang tắt trong MANUAL và không giả số cảm biến.
Mặc định cả hai mức là 25°C. Nhiệt độ phòng hiện tại hiển thị riêng ở phía trên.
Cài đặt được lưu trong `data/preferences/` bằng context store `preferences`
trong `settings.js`; tồn tại qua restart. Import flow sang Node-RED khác cần
khai báo store này theo `settings.js`. Test dùng `IOT_PREFERENCES_DIR` riêng.

API: `POST /api/control` với `{ "kind":"autoTemperature", "value":27 }` hoặc
`{ "kind":"manualTemperature", "value":22 }`. Chỉ nhận số nguyên từ 16 đến 31.
Trang voice dùng cùng cài đặt qua MQTT; có thể nói **“máy lạnh 22 độ”** hoặc
**“đặt nhiệt độ tự động 27 độ”**. Câu thứ hai chỉ lưu mức Tự động, không đổi chế độ.

## Phòng tự động — mô phỏng inverter theo mức đặt

Trên dashboard bấm **Bắt đầu trải nghiệm**. Nút này đặt 14:00, AUTO, demo nhanh,
có người và nhiệt độ khởi đầu 30°C. Máy lạnh làm mát dần rồi giảm mức làm lạnh
để giữ quanh **mức đặt của chế độ đang chọn** (mặc định 25°C). Mức lạnh sâu
cần thêm thời gian; chọn mức cao hơn sẽ giảm làm lạnh và để phòng ấm dần tự nhiên.
Máy chỉ làm lạnh, không có bộ sưởi. Dashboard hiện mức làm lạnh mô phỏng;
với mức mặc định 25°C, khi có người mức cân bằng khoảng 31%. Đây không phải công suất điện hay số kWh đo được.
Mô hình tăng tốc phục vụ demo, không phải phép đo phòng thật hoặc dự đoán một căn
phòng cụ thể. Khung dữ liệu gửi mỗi 2 giây qua MQTT.

Mô hình nằm ở `lib/environment.js`, tính theo phản hồi ON/OFF của relay ESP32.
Relay ON nghĩa là máy lạnh được phép hoạt động; bộ điều chỉnh inverter nằm trong
mô hình và tự thay đổi mức làm lạnh. Relay LED xanh không biểu diễn tốc độ máy nén.
Nhiệt vào `H = (32 - T)/100 + 0,005` khi có người; mức làm lạnh
`u = clamp((H + 0,08*(T - target))/0,24, 0, 1)` khi relay ON, bằng 0 khi OFF;
`dT/dt = H - 0,24*u`. Không dùng phần trăm này để suy ra tiền điện.
Node-RED gửi khung mô phỏng; ESP32 áp dụng, hiển thị LCD và gửi trở lại các topic
cảm biến hiện có. Dashboard, voice và Home Assistant cùng nhận giá trị đó.
Dashboard chỉ đổi nhiệt độ khi nhận dữ liệu ESP32; dữ liệu cũ/offline làm mô hình tạm dừng.

**Tôi ở trong phòng/Tôi ra khỏi phòng** điều chỉnh người mô phỏng: trong AUTO/SLEEP,
đèn bật khi có người và tắt ngay khi nhận tín hiệu vắng. Máy lạnh dùng thời gian chờ vắng. LDR vẫn điều
chỉnh trên mạch. Bấm **Dừng trải nghiệm** để dùng lại DHT22/PIR của Wokwi.
Trong lúc phòng tự động chạy, xem nhiệt độ trên **LCD/dashboard**; thanh DHT22
vẫn là giá trị chỉnh tay, được dùng lại sau khi tắt mô hình.

Firmware cần bản mới. LCD có ký tự **S** ở ô cuối dòng dưới khi dùng mô hình.
ESP32 tự trả về cảm biến chỉnh tay nếu không nhận khung mô phỏng trong 15 giây
chạy của ESP32. Mô hình và khung gửi đều có xác nhận; không dùng lệnh retained.

Nếu Wokwi tạm dừng, mất mạng hoặc khởi động lại, mô hình chờ dữ liệu mới rồi tự gửi
lại yêu cầu, giữ nhiệt độ/người/chế độ đã chọn. Mỗi đợt gửi có tối đa ba lần, cách
nhau 10 giây; nếu chưa có xác nhận thì chờ thêm ít nhất 15 giây và chỉ tự thử lại
khi ESP32 vẫn gửi báo cáo mới. Dữ liệu retained không được dùng để xác nhận chạy.
**Thử lại ngay** gửi lại yêu cầu hiện tại; không đặt lại phòng 30°C hoặc chế độ AUTO.
**Dừng trải nghiệm** luôn dùng được khi chờ/lỗi; nếu phòng offline, yêu cầu dừng
sẽ được gửi khi thiết bị kết nối lại. Giao diện hiển thị đang chờ thay vì báo đang chạy.

Giữ tab Wokwi hiển thị cạnh dashboard: khi tab mô phỏng bị ẩn, Wokwi có thể tạm dừng
([ghi chú của Wokwi](https://github.com/wokwi/wokwi-vscode-micropython#usage)).

## Mở demo

1. Bấm đúp `D:\IOT\khoi_dong_demo.bat` để bật Node-RED, mở VS Code và trang điều khiển căn phòng.
2. Trong VS Code: **Ctrl+Shift+B**, chờ **Build OK**, rồi **F1 → Wokwi: Start Simulator**.
3. Giữ mạch mô phỏng và dashboard hiển thị cạnh nhau.
4. Mở dashboard <http://localhost:1880/dashboard/room>.
   Chờ **Phòng đã kết nối**, thử đổi nhiệt độ DHT22 để xác nhận dữ liệu mới.

| Giao diện | Địa chỉ |
|---|---|
| Dashboard | <http://localhost:1880/dashboard/room> |
| Flow editor Node-RED | <http://localhost:1880> |
| Điều khiển giọng nói | <http://localhost:1880/voice/voice.html> |
| Log CSV | <http://localhost:1880/api/log.csv> |
| Trạng thái JSON | <http://localhost:1880/api/status> |
| 200 bản ghi log gần nhất | <http://localhost:1880/api/history> |
| Home Assistant (nếu bật máy ảo) | <http://localhost:8123> |

Chạy riêng Node-RED bằng `khoi_dong_node_red.bat`. Server chạy nền;
có thể đóng cửa sổ khởi động. Tắt bằng `tat_node_red.bat`.
Launcher kiểm tra PID và thời điểm khởi động để không tắt nhầm tiến trình khác.

## Rule và chế độ

| Nội dung | Hành vi |
|---|---|
| Đèn AUTO/SLEEP | Tín hiệu có người → bật, không phụ thuộc lux |
| Tắt đèn AUTO/SLEEP | Tín hiệu vắng → tắt ngay sau khi nhận dữ liệu |
| Máy lạnh AUTO/SLEEP | Mức đặt **16–31°C**; bật relay ở **mức đặt + 0,5°C** khi có người, giữ ON gần mức đặt để mô hình giảm mức làm lạnh |
| Tắt máy lạnh AUTO/SLEEP | Nhiệt độ **≤ mức đặt − 0,5°C**, hoặc không chuyển động **10 phút** → tắt |
| MANUAL | Chọn Tự điều khiển hoặc gửi lệnh bật/tắt sẽ giữ MANUAL đến khi chọn chế độ khác. Đèn/máy lạnh giữ theo lệnh tay, cho phép bật trước khi về nhà dù phòng vắng; không có hẹn giờ tự trở lại AUTO |
| SLEEP | Theo lịch **23:00–06:00, UTC+7**; cùng rule đèn theo người và mức đặt của Tự động |
| Nút SLEEP | Ép chế độ ngủ đến khi chọn AUTO hoặc có lệnh tay; AUTO trở lại lịch theo giờ thật/giờ demo |

PIR báo chuyển động, không chứng minh người đã rời phòng. Theo yêu cầu demo, đèn
tắt khi PIR về 0 nên người ngồi yên cũng có thể làm đèn tắt. Dùng Có người/Vắng
người trong Phòng tự động để trình diễn rõ trạng thái phòng. AC vẫn giữ thời gian
chờ vắng trong AUTO/SLEEP. Trong MANUAL, cả đèn và AC giữ lệnh tay đến khi người dùng đổi chế độ.
Khi dùng DHT22 chỉnh tay, relay có vùng trễ ±0,5°C quanh mức đặt; thanh DHT22 không tự đổi
theo relay. Muốn xem giữ nhiệt phải bật Phòng tự động.
Trạng thái relay trên dashboard lấy từ phản hồi ESP32, không tự đổi thành công
chỉ vì đã bấm nút. Lệnh chưa có xác nhận được gửi lại tối đa 3 lần, mỗi lần cách 5 giây.

Node-RED không điều khiển tự động từ dữ liệu MQTT retained mới đọc khi khởi động.
Firmware gửi heartbeat cảm biến và online mỗi 5 giây; quá 25 giây không có dữ liệu
mới sẽ báo dữ liệu cũ. Rule từng thiết bị chỉ chạy khi các cảm biến cần thiết còn mới.

LCD dòng trên: `T` = nhiệt độ phòng, `S` = mức đặt máy lạnh, `H` = độ ẩm.
Dòng dưới: `D0/D1` = đèn tắt/bật, `A0/A1` = máy lạnh tắt/bật;
tiếp theo là `AUTO`, `MANUAL` hoặc `SLEEP`; `OK` = ESP32 nối được MQTT.

## Demo nhanh trong 3–5 phút

Mở **Cài đặt thử nghiệm & số liệu** trên dashboard, bật **Demo nhanh**, chọn **14:00**,
rồi chọn **AUTO**. Đèn tắt ngay khi báo vắng; timer demo AC **15 giây**.
MANUAL giữ đến khi đổi chế độ và không bị rút ngắn bởi Demo nhanh.
Chỉ timer và giờ của lịch được mô phỏng; cảm biến vẫn lấy từ Wokwi.

1. DHT22 = 29°C, LDR = khoảng 100 lux. Bấm PIR → **Simulate Motion**.
   Đèn vàng và LED xanh bật, dashboard/LCD cập nhật.
2. Chỉnh DHT22 xuống **25°C** → AC giữ bật; xuống **24,5°C** → AC tắt.
3. Nói **“tắt đèn”** trên trang giọng nói → đèn tắt, chế độ **MANUAL**.
   Chọn AUTO để trả lại rule; chờ không tự thoát MANUAL.
4. Kích PIR rồi để hết chuyển động: đèn tắt khi nhận PIR về thấp,
   AC tắt sau khoảng 15 giây. Dữ liệu heartbeat vẫn phải tiếp tục.
5. Chọn **23:00**, chọn AUTO. SLEEP vẫn bật đèn khi có người; AC đặt 25°C.
6. Dừng Wokwi → dashboard báo offline/dữ liệu cũ; chạy lại → trở về online khi có heartbeat.
7. Bấm **Tải log CSV** để trình bày các bản ghi cảm biến, mode và lệnh.

Sau demo: tắt Demo nhanh, chọn Giờ thật, chọn AUTO.

Khung **Giờ đang dùng để chạy lịch** hiển thị giờ thật hoặc 14:00/23:00 đang chọn
và chế độ thực tế. Nút AUTO/MANUAL/SLEEP tô theo chế độ đang chạy; dòng bên dưới
giải thích chế độ đó đến từ lịch tự động hay lựa chọn bằng tay. Nếu đang MANUAL
hoặc ép SLEEP bằng tay, chọn AUTO để áp dụng lịch theo giờ đã chọn.

## Giọng nói và Home Assistant

Trang giọng nói vẫn chờ khoảng 2,5 giây sau câu nói, hoặc bấm micro lần nữa để kết thúc.
Câu chưa rõ chỉ hiện chữ. Nút/lệnh gửi vào topic `controller/actuator/.../cmd` để
Node-RED chuyển MANUAL trước khi chuyển tiếp cho ESP32.
Có thể nói **“chế độ tự động”**, **“chế độ ngủ”**, **“chế độ thủ công”** hoặc hỏi chế độ hiện tại.

Để cập nhật Home Assistant dùng đường lệnh mới:

```powershell
python D:\IOT\home_assistant\publish_discovery.py
```

Các unique_id và topic trạng thái giữ nguyên. Flow cũng nghe topic lệnh cũ
`actuator/.../cmd` để nhận biết thao tác thủ công của cấu hình HA cũ.
Cầu nối Matter đang có vẫn đi qua các entity Home Assistant. Ghép “Hey Google”
thực tế cần hub Google và cấu hình mạng tương ứng; không có hub trong bộ mô phỏng.

## Topic MQTT

Tiền tố mặc định `nhom26/room1`:

| Topic sau tiền tố | Payload | Nguồn / đích |
|---|---|---|
| `sensor/temp_humid` | `{"temp":29,"hum":60}` | ESP32 → Node-RED |
| `sensor/light` | `{"lux":100}` | ESP32 → Node-RED |
| `sensor/motion` | `{"presence":1}` | ESP32 → Node-RED |
| `status` | `online` / `offline` | ESP32 heartbeat/LWT |
| `controller/actuator/light/cmd` | `{"cmd":"ON","source":"voice"}` | Giao diện/HA → Node-RED |
| `controller/actuator/ac/cmd` | `{"cmd":"OFF"}` | Giao diện/HA → Node-RED |
| `controller/temperature/cmd` | `{"profile":"auto","temperature":27}` | Giao diện → Node-RED; profile `auto` hoặc `manual`, không retained |
| `controller/mode/cmd` | `{"mode":"AUTO"}` | Giao diện → Node-RED |
| `actuator/light/cmd`, `actuator/ac/cmd` | `{"cmd":"ON","source":"node-red"}` | Node-RED → ESP32 |
| `actuator/light/state`, `actuator/ac/state` | `{"state":"ON"}` | ESP32 phản hồi |
| `controller/mode` | `{"mode":"MANUAL","manualHold":true,"manualUntil":0,"targetTemp":22}` | Node-RED → LCD; MANUAL không có thời hạn |
| `controller/state` | Snapshot JSON, timestamp mili giây | Node-RED → trang voice |
| `controller/status` | `online` / `offline` | Node-RED birth/LWT |
| `environment/cmd` | `SIM seq temp humidity presence` hoặc `SENSOR` | Node-RED → ESP32; khung mô hình hoặc trở về cảm biến |
| `environment/state` | `{"protocol":1,"enabled":true,"seq":1}` | ESP32 xác nhận nguồn dữ liệu/khung mô hình |

Nhận lại lệnh có `source: node-red` không chuyển MANUAL, tránh vòng lặp.
Node-RED dùng MQTT qua **WSS 8884**; ESP32 dùng TCP 1883, cùng broker HiveMQ.

## Cấu trúc và bàn giao

| File | Vai trò |
|---|---|
| `flows.json` | Flow có thể import: 3 tab MQTT/rule, Dashboard, API/CSV |
| `lib/controller.js` | Mã nguồn rule và state machine dùng cho tests |
| `lib/environment.js` | Mô hình nhiệt/ẩm, đóng vòng bằng relay thực tế, gửi khung và chờ xác nhận |
| `dashboard.vue` | Giao diện của node `ui-template` |
| `scripts/build-flows.cjs` | Nhúng controller và template vào flow độc lập |
| `settings.js` | Địa chỉ server, route voice, log và mặc định MQTT |
| `start.ps1`, `stop.ps1` | Chạy/tắt server nền có kiểm tra tiến trình |
| `package.json`, `pnpm-lock.yaml` | Phiên bản dependency đã chốt |
| `data/telemetry.csv` | Log vận hành, gồm nguồn mô hình/chỉnh tay trong chi tiết cảm biến, giữ qua các lần chạy |
| `data/node-red.log`, `data/node-red-error.log` | Log vận hành |

Sửa rule/template ở file nguồn rồi chạy `node scripts/build-flows.cjs` và khởi động lại Node-RED.
Nếu sửa flow trực tiếp trong editor, bấm Deploy để lưu. Build-flows sẽ tạo lại flow từ
nguồn nên cần export/giữ bản chỉnh bằng editor trước khi tạo lại.

Trên máy khác: cài **Node.js ≥22**, chép toàn bộ thư mục đồ án, chạy
`cai_dat_node_red.bat` một lần rồi `khoi_dong_demo.bat`.
Hoặc import `flows.json` vào Node-RED có `@flowfuse/node-red-dashboard` và sử dụng
`settings.js` đi kèm để khai báo các biến topic, MQTT, đường dẫn voice và file log.
Nếu giữ settings của hệ thống khác, cần ghép phần khai báo `IOT_*` và route voice
từ settings này trước khi deploy.

## Kiểm thử

```powershell
node --test D:\IOT\test\controller.test.cjs D:\IOT\test\environment.test.cjs D:\IOT\test\voice_recognition.test.cjs
python D:\IOT\test\test_node_red_e2e.py
# Thêm kiểm tra nút bấm, bố cục desktop/mobile bằng Chrome:
python D:\IOT\test\test_node_red_e2e.py --browser
```

Test đơn vị chạy rule thật và các sự kiện nhận dạng giọng nói giả lập.
E2E chạy **Node-RED thật trên cổng 1881**, giả lập thiết bị MQTT dưới tiền tố
ngẫu nhiên `nhom26/test-...`, kiểm tra lệnh/phản hồi/log/khởi động lại rồi dọn retained của riêng lần test.
CSV kiểm thử nằm ở `data/test-e2e.csv`; dữ liệu giả không đi vào topic/log sản xuất.
E2E cần thư viện Python `paho-mqtt`; tùy chọn `--browser` cần thêm `playwright`
và Google Chrome. Kết quả đã chạy: [KET_QUA_KIEM_THU.md](../KET_QUA_KIEM_THU.md).

Server mặc định chỉ mở trên **localhost**. Bản này chưa được publish ra Internet;
mạng MQTT HiveMQ và nhận giọng nói vẫn cần Internet. Wokwi phải đang chạy và hiển thị.
Broker công khai không xác thực, nên chỉ dùng cho đồ án mô phỏng.

Nguồn: [Node-RED](https://nodered.org/docs/getting-started/local),
[Dashboard 2.0](https://dashboard.flowfuse.com/getting-started.html),
[cấu hình Wokwi](https://docs.wokwi.com/vscode/project-config).
