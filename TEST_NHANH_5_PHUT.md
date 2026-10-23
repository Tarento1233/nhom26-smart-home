# Test nhanh bản mới — giữ 25°C, đèn theo người

Làm theo thứ tự. Dùng **Phòng tự động** trên dashboard, không cần kéo thanh DHT22
hoặc kích PIR trong bài này. Nhiệt độ và người trong phòng là dữ liệu mô phỏng.

> Bản 23/10: đăng nhập bằng `node_red/data/TAI_KHOAN_DEMO.txt`; chạy Node-RED trước Wokwi. Mở phần số liệu để xem lịch sử SQLite. [Chi tiết](docs/XAC_THUC_VA_DATABASE.md).

## 1. Mở và kết nối

- Mở `D:\IOT\khoi_dong_demo.bat` nếu hệ thống chưa chạy.
- Bấm vào cửa sổ VS Code của đồ án, nhấn **Ctrl+Shift+B**, chờ **Build OK**.
- Nhấn **F1**, chọn **Wokwi: Start Simulator**. Giữ mạch Wokwi hiển thị cạnh trình duyệt.
- Mở [dashboard](http://localhost:1880/dashboard/room), nhấn **Ctrl+F5**.
- Chờ **Phòng đã kết nối**; LCD có **OK**. Chưa online thì chưa thử các bước dưới.

## 2. Bắt đầu một lượt mới

Trong khung **Bắt đầu ở đây**, bấm **Bắt đầu trải nghiệm**.

- Nếu đang có nút **Dừng trải nghiệm**: bấm nút đó, chờ về **Bắt đầu trải nghiệm**, rồi bấm chạy lại để bắt đầu từ 30°C.
- Nếu đang chờ xác nhận: giữ Wokwi hiển thị và chạy. Hệ thống tự thử lại khi có dữ liệu mới;
  **Thử lại ngay** gửi lại yêu cầu hiện tại, **Dừng trải nghiệm** vẫn dùng được khi đang chờ.

Nút chạy tự chọn **14:00 · AUTO · demo nhanh · Có người**.
Chờ vài giây để ESP32 nhận và phản hồi. Cần thấy:

| Quan sát | Kết quả |
|---|---|
| Nguồn nhiệt độ | Phòng mô phỏng |
| Người trong phòng | Có người trong phòng |
| Đèn phòng | Đang bật; LED vàng sáng; LCD D1 |
| Máy lạnh | Đang bật; LED xanh sáng; LCD A1 |
| Nhiệt độ | Bắt đầu gần 30°C rồi giảm dần |
| Nút trong khung mô phỏng | Đổi thành Dừng trải nghiệm |

## 3. Máy lạnh giữ nhiệt

Để nguyên khoảng **1–2 phút**, không bấm nút máy lạnh.

- Nhiệt độ giảm về quanh **25°C**, rồi giữ ổn định. Quan sát thêm khoảng 30 giây.
- Dòng trạng thái hiện **Đã mát rồi! Máy lạnh đang giữ quanh 25°C.**.
- **Mức làm lạnh** giảm từ cao xuống khoảng **31%** trong điều kiện mặc định.
- Máy lạnh vẫn **Đang bật**, LED xanh vẫn sáng: đây là trạng thái đúng khi mô hình giảm mức làm lạnh để giữ nhiệt.
- Không còn vòng phòng nóng lên 29°C rồi bật lại khi vẫn có người và đang AUTO.

Phần trăm này là mức làm lạnh của mô hình, không phải số đo điện năng.

## 4. Vắng người

Đảm bảo đang **Tự động (AUTO)**, rồi bấm **Tôi ra khỏi phòng** trong khung Phòng tự động.

- Chờ hình căn phòng báo **Phòng đang vắng**.
- Đèn **tắt khi ESP32 phản hồi**, LED vàng tắt, LCD D0; không chờ thêm 10 giây như bản cũ.
- Trong demo nhanh, máy lạnh tắt sau khoảng **15 giây vắng**, cộng độ trễ MQTT; LED xanh tắt, LCD A0.
- Sau khi máy lạnh tắt, nhiệt độ bắt đầu tăng dần.

## 5. Có người trở lại

Bấm **Tôi ở trong phòng**.

- Đèn bật lại, kể cả ánh sáng đang 500 hoặc 1000 lux.
- Máy lạnh bật khi nhiệt độ **từ 25,5°C** rồi đưa phòng về quanh 25°C.
- Nếu AC đang tắt và nhiệt độ còn dưới 25,5°C, chờ phòng ấm thêm; đó là vùng trễ relay.

## 6. Tự điều khiển và bật đèn trước khi về nhà

Giữ **Tôi ở trong phòng**:

1. Trong ô Đèn phòng, bấm **Tắt đèn phòng** → đèn tắt, chế độ **Tự điều khiển (MANUAL)**.
2. Chờ hơn **15 giây**: vẫn Tự điều khiển, đèn vẫn tắt. Demo nhanh không làm hết hạn lệnh tay.
3. Bấm **Bật đèn phòng** ở ô Đèn phòng để vào MANUAL, rồi bấm **Tôi ra khỏi phòng** ngay.
4. Đèn vẫn bật khi nhận tín hiệu vắng: đang giữ theo lệnh tay.
5. Tắt rồi bật đèn lúc vắng bằng nút hoặc giọng nói: đèn phải bật, cho phép đón người về nhà.
6. Bấm **Tôi ở trong phòng**, chọn **Tự động (AUTO)** để tiếp tục.

## 7. Giọng nói và lịch ban đêm

- Giữ Có người, mở [trang giọng nói](http://localhost:1880/voice/voice.html), nhấn Ctrl+F5.
- Bấm micro, nói **“tắt đèn”**; chờ khoảng 2,5 giây sau câu nói hoặc bấm micro lần nữa.
  Đèn tắt, chuyển MANUAL. Nói **“nhiệt độ bao nhiêu”** để nghe nhiệt độ mô phỏng.
- Trở lại dashboard, chọn **Tự động (AUTO)**. Trong Cài đặt thử nghiệm & số liệu chọn **23:00**.
  Chế độ chuyển **Giờ ngủ (SLEEP)**; bản mới vẫn bật đèn khi có người, tắt khi vắng và AC đặt 25°C.
- Kết thúc lượt thử, chọn **14:00 → AUTO → Có người** để dễ quan sát tiếp.

## Nếu kết quả khác

| Hiện tượng | Kiểm tra |
|---|---|
| ESP32 offline hoặc dữ liệu cũ | Wokwi phải chạy và hiển thị; terminal cần WiFi OK / MQTT OK |
| Nút mô phỏng bị mờ | Chờ ESP32 online và có dữ liệu mới |
| Chưa nhận được xác nhận mô phỏng | Giữ tab Wokwi hiển thị. Hệ thống tự phục hồi khi có phản hồi mới; không cần bấm liên tục. Có thể Dừng trải nghiệm để hủy yêu cầu |
| Nhiệt độ không tự chạy | Phải bật Phòng tự động, nguồn hiện Phòng mô phỏng |
| Chỉnh DHT22/PIR không có tác dụng | Đang dùng mô hình; thử bằng Có người/Vắng người trên dashboard |
| Máy lạnh không theo tự động | Chọn AUTO; MANUAL đang ưu tiên lệnh máy lạnh |
| Không thấy chữ/nút mới | Ctrl+F5; dùng dashboard cổng 1880 |
| Đèn không bật lại khi có người | Chọn AUTO để hết ưu tiên lệnh Tắt đèn bằng tay |

Đạt lượt thử khi: [ ] Online; [ ] Giữ quanh 25°C; [ ] Có người bật đèn;
[ ] Vắng tắt đèn; [ ] AC hết thời gian vắng thì tắt; [ ] Lệnh tay; [ ] Giọng nói; [ ] SLEEP.
