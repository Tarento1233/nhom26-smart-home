# Test từ đầu đến cuối — Nhà thông minh nhóm 26

Bản hướng dẫn ngày 19/10/2026. Làm lần lượt; đối chiếu kết quả ở từng bước.
Wokwi và nhận dạng giọng nói cần Internet. MQTT chạy bằng broker riêng có xác thực trên máy.

**Thử một lượt bằng bản mới:** xem [Test nhanh 5 phút](TEST_NHANH_5_PHUT.md).
Bài đó dùng Phòng tự động, không cần chỉnh từng cảm biến Wokwi.

**Muốn xem nhiệt độ tự chạy:** sau khi ESP32 online, bấm **Bắt đầu trải nghiệm** trên
dashboard. Máy lạnh làm nhiệt độ giảm từ 30°C về quanh 25°C rồi giảm mức làm lạnh
để giữ nhiệt. Sau khoảng 1–2 phút, xem 25°C ổn định ở LCD/dashboard và phần trăm
làm lạnh giảm. Có người → đèn bật, Vắng người → đèn tắt khi ESP32 phản hồi.
Bấm **Dừng trải nghiệm** khi muốn thực hiện các bài test kéo DHT22/PIR bên dưới.

1. **Mở hệ thống.** Trong File Explorer vào `D:\IOT`, bấm đúp `khoi_dong_demo.bat`.
   Chờ mở VS Code, dashboard và trang giọng nói. File này khởi động Node-RED chạy nền,
   đồng thời thử bật máy ảo Home Assistant nếu máy có cấu hình đó.

   Các trang dùng trong buổi test:

   | Trang | Địa chỉ |
   |---|---|
   | Dashboard | <http://localhost:1880/dashboard/room> |
   | Giọng nói | <http://localhost:1880/voice/voice.html> |
   | Flow Node-RED | <http://localhost:1880> |
   | Home Assistant, phần mở rộng | <http://localhost:8123> |

   Nếu dashboard chưa mở được, chạy `D:\IOT\khoi_dong_node_red.bat` rồi tải lại trang.

2. **Build và chạy ESP32.** Bấm vào cửa sổ VS Code của project Wokwi, nhấn
   **Ctrl+Shift+B**. Chờ terminal có **Build OK**. Tiếp theo bấm **Ctrl+Shift+P**,
   gõ **Wokwi: Start Simulator**, chọn đúng dòng đó và nhấn Enter.
   Sơ đồ mạch phải hiện ra. Firmware sau lần chỉnh mới đã sửa phép đổi LDR cho
   nguồn 3,3V và điện trở cố định 10k, giúp giá trị lux sát với cảm biến mô phỏng hơn.

3. **Xác nhận kết nối trước khi điều khiển.** Xếp VS Code bên trái và trình duyệt
   bên phải màn hình bằng Win+← và Win+→. Giữ phần mạch Wokwi hiển thị khi test.
   Chờ khoảng 10–30 giây; thời gian còn phụ thuộc mạng và broker.

   Kết quả cần thấy: LCD có nhiệt độ/độ ẩm và **OK**; Wokwi Terminal có
   `WiFi OK`, `MQTT connecting ... OK`; dashboard báo **Phòng đã kết nối**.
   Nếu chưa đạt bước này, xem bảng xử lý lỗi cuối tài liệu trước khi thử lệnh.

4. **Thiết lập điều kiện ban đầu.** Trên dashboard, mở **Cài đặt thử nghiệm & số liệu**,
   nếu phòng tự động đang chạy thì bấm **Dừng trải nghiệm** trước.
   bật **Demo nhanh**, chọn **14:00**, chọn **AUTO**.
   Trên mạch, bấm DHT22 ở phía trên bên trái để mở phần chỉnh nhiệt độ/độ ẩm,
   đặt **25°C, 55%**. Bấm module LDR phía dưới bên trái, đặt ánh sáng khoảng
   **1000 lux**. Chờ dashboard nhận số mới, thường khoảng 5 giây mỗi đợt gửi.
   LDR dùng ADC nên số hiển thị có thể chênh một ít so với số đặt.

   Để PIR trở về **Không**, chờ thêm ít nhất 20 giây. Kết quả: chế độ AUTO,
   đèn và máy lạnh đều tắt sau khi hết thời gian vắng. Đèn tắt ngay khi nhận PIR=0.
   Demo nhanh: AC chờ vắng 15 giây. Bình thường: AC chờ vắng 10 phút. MANUAL không có hẹn giờ.

5. **Thử từng nút điều khiển tay.** Có thể bấm khi phòng có người hoặc đang vắng.
   Kết nối ESP32 phải còn hoạt động. Bấm và quan sát:

   | Nút trên dashboard | Kết quả trên dashboard và mạch |
   |---|---|
   | Đèn phòng → Bật | Đang bật, LED vàng sáng, LCD `D1` |
   | Đèn phòng → Tắt | Đang tắt, LED vàng tắt, LCD `D0` |
   | Máy lạnh → Bật | Đang bật, LED xanh sáng, LCD `A1` |
   | Máy lạnh → Tắt | Đang tắt, LED xanh tắt, LCD `A0` |

   Mỗi lệnh tay chuyển sang MANUAL và giữ đến khi bạn chọn chế độ khác.
   Hệ thống giữ lệnh đèn và máy lạnh dù cảm biến báo vắng; có thể bật đèn trước khi về nhà.
   Chờ hơn 15 giây ở demo nhanh: vẫn MANUAL. Chọn Tự động để trở về lịch theo giờ.
   Dòng chờ xác nhận phải hết khi ESP32 phản hồi.

6. **Thử micro và giọng nói.** Mở trang giọng nói bằng Chrome/Edge.
   Giữ tín hiệu Có người bằng Phòng tự động, hoặc kích PIR trước câu Bật đèn.
   Chờ broker, Node-RED và ESP32 sẵn sàng. Bấm micro và cho phép trình duyệt dùng micro.
   Mỗi câu bấm micro một lần để bắt đầu, nói xong chờ khoảng 2,5 giây hoặc bấm
   micro thêm lần nữa để kết thúc câu.

   | Nói | Kết quả cần thấy |
   |---|---|
   | “Bật đèn” | LED vàng sáng, dashboard chuyển MANUAL |
   | “Tắt đèn” | LED vàng tắt |
   | “Bật máy lạnh” | LED xanh sáng |
   | “Nhiệt độ bao nhiêu” | Đọc giá trị nhiệt độ/độ ẩm hiện tại |
   | “Tắt tất cả” | Cả hai thiết bị tắt |

   Thử thêm: nói “bật”, nghỉ khoảng 1 giây rồi nói “máy lạnh”. Trang phải chờ
   hoàn tất câu rồi mới xử lý. Sau bài thử, nói “tắt tất cả”, kiểm tra hai thiết bị
   tắt, rồi chọn AUTO trên dashboard để chuẩn bị thử rule.

7. **Thử AUTO khi sáng và khi tối.** Bấm Dừng trải nghiệm nếu mô hình đang chạy.
   Chọn 14:00 và AUTO. Đặt DHT22 **29°C**,
   ánh sáng **1000 lux**; chờ dashboard hiện số mới. Đảm bảo đèn đang tắt từ bước 6.
   Bấm PIR (đầu chụp trắng phía trên mạch), chọn **Simulate Motion**.

   Kết quả: chuyển động hiện **Có**, máy lạnh bật; đèn bật dù đủ sáng.
   Tiếp theo đặt LDR khoảng **100 lux**, kích PIR lại: đèn vẫn bật.
   LDR vẫn hiển thị và ghi log nhưng không quyết định đèn nữa.
   Nếu thao tác lâu làm PIR hết chuyển động và thiết bị hết thời gian chờ,
   kích PIR lại trước khi đánh giá kết quả.

8. **Thử mức đặt và vùng trễ relay máy lạnh.** Giữ 14:00, AUTO. Bắt đầu bằng
   29°C và kích PIR, chờ máy lạnh bật. Hạ xuống **25°C**, kích PIR lại:
   máy lạnh giữ bật. Hạ xuống **24,5°C**, kích PIR lại: máy lạnh tắt.
   Tăng lại **25°C**, kích PIR: máy lạnh vẫn tắt.
   Tăng lên **25,5°C**, kích PIR: máy lạnh bật lại.
   Mỗi lần đổi nhiệt độ cần giữ dữ liệu chuyển động mới bằng cách kích PIR.
   Đây là test relay khi chỉnh DHT22 bằng tay. Bấm Bắt đầu trải nghiệm để thấy
   inverter giữ 25°C; relay ON lúc giữ nhiệt là đúng, mức làm lạnh sẽ giảm.

9. **Thử tắt khi vắng người.** Đặt 29°C, ánh sáng khoảng 100 lux, chọn AUTO,
   kích PIR và chờ cả hai thiết bị bật. Để PIR tự hết chuyển động.
   Khi dashboard chuyển sang **Không**, đèn tắt sau phản hồi relay;
   khoảng 15 giây sau máy lạnh tắt. Giữ mô phỏng tiếp tục chạy.

   PIR mặc định giữ tín hiệu Có khoảng 5 giây sau lần kích; do đó nếu tính từ
   lúc bấm Simulate Motion, tổng thời gian thường khoảng 5/20 giây, có thêm
   độ trễ mạng/giao diện. Mỗi lần kích tiếp sẽ kéo dài thời gian có chuyển động.

10. **Thử lịch SLEEP và ưu tiên MANUAL ban đêm.** Sau bước 9, cả hai thiết bị đã tắt.
    Đặt nhiệt độ **29°C**, giữ ánh sáng thấp. Ở 14:00 và AUTO, chờ nhiệt độ mới
    rồi kích PIR: đèn và máy lạnh bật.
    Chọn **23:00**, chọn **AUTO**, kích PIR lại: chế độ chuyển **SLEEP**, đèn vẫn
    bật khi có người, máy lạnh giữ bật. Hạ về 24,5°C: máy lạnh tắt khi nhận số mới.

    Khi đang SLEEP và có người, bấm Tắt đèn: chế độ chuyển MANUAL, đèn tắt.
    Chờ hơn 15 giây demo nhanh: vẫn MANUAL, đèn tắt. Chọn Tự động để trở lại SLEEP và đèn bật lại.
    Có thể dùng Phòng tự động → Có người rồi chọn 23:00 để giữ tín hiệu.

11. **Xem flow, biểu đồ, log và Home Assistant.** Mở trang flow Node-RED:
    tab **01 · MQTT & tự động** thể hiện nhận cảm biến → điều khiển → gửi MQTT;
    tab **02 · Dashboard** tạo giao diện và biểu đồ; tab **03 · API & log CSV** ghi log.
    Trên dashboard, cuộn xuống hai biểu đồ: lịch sử nhiệt độ và ánh sáng phải có
    dữ liệu của các lần chỉnh. Bấm **Tải log CSV**, mở file: có bản ghi cảm biến,
    chuyển chế độ và lệnh bật/tắt. Timestamp CSV dùng UTC (giờ Việt Nam là UTC+7).

    Nếu trình thêm Home Assistant, mở localhost:8123, tìm **Den phong**, **May lanh**.
    Bật/tắt ở đó phải làm LED/dashboard đổi theo và Node-RED chuyển MANUAL.
    Đổi DHT22 rồi đối chiếu các sensor trong Home Assistant. Phần “Hey Google”
    qua Matter cần hub Google và ghép nối riêng; trang micro ở bước 6 dùng trên laptop.

12. **Thử mất kết nối và chạy lại.** Dừng mô phỏng bằng nút Stop trên thanh Wokwi.
    Trong khoảng 30 giây, dashboard phải báo **Dữ liệu đã cũ** hoặc **ESP32 offline**,
    tùy thời điểm broker phát hiện mất kết nối. Các nút relay bị khóa khi dữ liệu
    không còn mới. Những số cảm biến cuối vẫn có thể hiện trên màn hình.

    Chạy lại bằng Ctrl+Shift+P → Wokwi: Start Simulator. Chờ online và đổi thử nhiệt
    độ một lần để xác nhận dữ liệu thật đang cập nhật. Giá trị cảm biến có thể quay
    về giá trị khởi tạo khi mô phỏng khởi động lại.

13. **Trả hệ thống về bình thường rồi tắt.** Chọn **Tắt demo nhanh → Giờ thật → AUTO**.
    Chế độ hiệu lực theo giờ thật có thể là AUTO hoặc SLEEP. Tải log/chụp ảnh cần
    dùng để báo cáo. Dừng Wokwi; bấm đúp `D:\IOT\tat_node_red.bat` để dừng server.
    Nếu máy ảo Home Assistant đang chạy, vào VirtualBox → HomeAssistant-IoT → ACPI Shutdown.
    Muốn mở lại từ đầu, chạy `khoi_dong_demo.bat`.

| Gặp hiện tượng | Kiểm tra tiếp |
|---|---|
| Không mở được localhost:1880 | Chạy khoi_dong_node_red.bat; xem node_red/data/node-red.log |
| Build chưa có Build OK | Đọc lỗi build trong terminal; xử lý trước khi mở mô phỏng |
| ESP32 offline hoặc dữ liệu cũ | Giữ Wokwi chạy và hiển thị; xem WiFi/MQTT trong Wokwi Terminal |
| Đổi sensor nhưng số giữ nguyên | Chờ 5–10 giây và kiểm tra ESP32 online; số cũ có thể là retained |
| Rule chưa tự bật | Kiểm tra AUTO/SLEEP, nhiệt độ mới và kích PIR/chọn Có người |
| Tự động dừng sau khi bấm tay | Đang Tự điều khiển; chọn Tự động để chạy lại theo cảm biến |
| Máy lạnh ở 25°C vẫn bật | Đúng: mô hình giảm mức làm lạnh để giữ nhiệt; relay chỉ tạm ngừng dưới 24,5°C |
| Bấm Bật đèn nhưng chưa có phản hồi | Kiểm tra ESP32 online và MQTT. Lệnh tay được phép bật khi vắng; chỉ AUTO/SLEEP mới tắt đèn theo PIR |
| Thiết bị tắt giữa lúc chỉnh sensor | Thời gian vắng người đã hết trong demo nhanh; kích PIR lại |
| Micro báo chưa được phép | Cho phép micro cho localhost trong trình duyệt rồi thử lại |
| Voice hiển thị trang cũ | Dùng địa chỉ cổng 1880 và nhấn Ctrl+F5 |

Đánh dấu đạt sau buổi test: [ ] Online và dữ liệu mới; [ ] Đèn tay; [ ] AC tay;
[ ] Voice; [ ] Đèn theo người cả sáng/tối; [ ] Giữ 25°C; [ ] Tắt khi vắng;
[ ] SLEEP và ưu tiên tay; [ ] Biểu đồ/CSV; [ ] Offline và phục hồi.

Tham khảo thao tác cảm biến: [DHT22](https://docs.wokwi.com/parts/wokwi-dht22),
[PIR](https://docs.wokwi.com/parts/wokwi-pir-motion-sensor),
[LDR và công thức điện trở](https://docs.wokwi.com/parts/wokwi-photoresistor-sensor).
