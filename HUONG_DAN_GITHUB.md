# GitHub cho nhóm 26

Repo Public: <https://github.com/Tarento1233/nhom26-smart-home>

## Thành viên lấy code lần đầu

Cài Git, mở PowerShell tại thư mục muốn lưu dự án rồi chạy:

```powershell
git clone https://github.com/Tarento1233/nhom26-smart-home.git
cd nhom26-smart-home
```

Chạy `cai_dat_node_red.bat`, sau đó `khoi_dong_demo.bat`.
Chi tiết: [Bắt đầu ở đây](BAT_DAU_O_DAY.md).

## Khi được báo có bản mới

1. Dừng Wokwi và Node-RED bằng `tat_node_red.bat`.
2. Mở PowerShell trong thư mục repo.
3. Chạy:

```powershell
git status
git pull --ff-only
```

Nếu Git báo thay đổi trên máy mình chưa được lưu, commit thay đổi trước hoặc nhờ
người phụ trách ghép code. Không dùng lệnh xóa thay đổi để ép pull.
Nếu có cập nhật dependency, chạy lại `cai_dat_node_red.bat`.
Mở lại demo và nhấn Ctrl+F5 để lấy giao diện mới.

## Chủ repo đưa bản sửa lên

Kiểm tra code và thử demo, rồi chạy trong `D:\IOT` hoặc thư mục repo tương ứng:

```powershell
git status
git add .
git commit -m "Sua giao dien va dieu khien"
git push
```

Đổi nội dung commit thành mô tả ngắn cho lần cập nhật đó.
Nếu sửa `dashboard.vue`, `controller.js` hoặc `environment.js`, tạo lại flow trước:

```powershell
cd node_red
node scripts/build-flows.cjs
cd ..
```

Nếu sửa firmware, build lại và commit `wokwi/sketch.ino`, hai file firmware
được theo dõi cùng `wokwi/build/build-info.json` để người nhận chạy được ngay.

Repo chỉ theo dõi các thư mục Smart Home đã khai báo trong `.gitignore`.
Các bài học khác, ZIP, log, thư viện đã cài và cấu hình riêng của máy không được đẩy lên.

## Cho thành viên cùng sửa code

Chủ repo mở GitHub → repo → **Settings → Collaborators** để mời người cần push.
Ai chỉ cần lấy code thì không cần được cấp quyền ghi vì repo là Public.
Khi nhiều người cùng sửa, dùng nhánh riêng và Pull Request để ghép thay đổi.
