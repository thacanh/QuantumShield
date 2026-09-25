# QuantumShield FinEdu

## Phòng học tài chính số

Mở **Phòng học FinEdu & QKD** để chọn một trong ba lộ trình:

- **QKD Lab:** thiết kế và thử nghiệm QKD tự do như trước.
- **Hóa đơn điện tử & công nợ:** học cách phân biệt hóa đơn, doanh thu và tiền đã thu;
  chọn các khoản đã thanh toán đúng tham chiếu, tính công nợ rồi gửi bản chụp qua QKD + AES.
  Bài mẫu: hóa đơn 11 triệu đồng, khoản thu khớp 6 triệu, còn phải thu 5 triệu.
- **Q-Authorization Vault:** kiểm soát lệnh mẫu 5 tỷ đồng theo số dư khả dụng,
  hạn mức, người thụ hưởng, tuân thủ giả lập và hai vai trò người lập–người duyệt.
  Sau khi đạt kiểm soát nghiệp vụ, chạy QKD + AES và xác minh dữ liệu bên nhận.
  “Được phê duyệt để gửi” không phải đã chuyển tiền hay quyết toán; không thay đổi số dư.

Hai bài tài chính dùng bốn bước **Học → Thực hành → Bảo vệ → Tổng kết**:

1. **Học:** đọc mục tiêu, quy trình và các thẻ kiến thức, rồi bấm **Đã đọc · Bắt đầu xử lý tình huống**.
2. **Thực hành:** xử lý ba điểm ra quyết định trong tình huống cố định, thay cho biểu mẫu tự nhập số.
   Mỗi lựa chọn có giải thích đúng/sai ngay; chọn sai có thể thử lại và số lần nhầm được giữ trong phiên.
   Hóa đơn dạy ghép đúng khoản đã thanh toán, khoản phải thu và trạng thái thu nợ.
   Vault dạy số dư/hạn mức, tạm giữ khác từ chối, người lập–người duyệt độc lập.
3. **Bảo vệ:** sau ba quyết định đúng, bấm **Áp dụng kết luận & thiết kế hệ QKD**.
   Nhánh tiếp diễn nêu rõ hồ sơ đã được rà soát và hai vai trò đồng ý trong tình huống giả lập;
   trả lời đúng không được coi là phê duyệt ngân hàng thật. Mở quy trình rồi **Chạy QKD + Dữ liệu**.
   Sau khi có kết quả, xử lý ba điểm kỹ thuật: khóa 192 bit, Eve thụ động và ý nghĩa lần chạy thật.
   Hai tình huống đầu có nhãn minh họa; câu cuối dùng kết quả đúng phiên/đường của bài học.
4. **Tổng kết:** xem số điểm đã xử lý đúng trên tổng 6 điểm, số đúng ngay lần đầu, điểm chưa hoàn thành
   và lời nhắc ôn theo số lần nhầm. Sửa đúng không xóa lịch sử lỗi. Có thể quay lại kiến thức bất cứ lúc nào.

Hóa đơn mẫu có khoản 6 triệu đã thanh toán đúng mã, khoản 3 triệu đang chờ và các khoản sai mã/hoàn đảo.
Vault có lệnh 5 tỷ, số dư 8 tỷ, hạn mức mỗi giao dịch 6 tỷ và hạn mức ngày còn lại 8 tỷ.
Nội dung JSON được nạp sẵn vào đúng đường dữ liệu; có thể sửa ghi chú `note`, các trường nghiệp vụ
phải khớp tình huống. Dữ liệu bài học không được đưa vào file thiết kế.
Thay thiết kế/nội dung gửi sẽ khiến kết quả cũ không áp dụng cho bản hiện tại. Chạy lại tạo một
điểm đọc kết quả mới; không cộng điểm hai lần bằng cách bấm lặp một đáp án đã đúng.
Thí nghiệm bị chặn vẫn có thể hoàn thành bài học nếu người học giải thích đúng kết quả.

Hai bài dùng nguyên Designer API và lõi QKD/FSO/AES hiện có. Kết quả A/B bổ sung
ngưỡng thu, số phát hiện/xóa, khả năng dùng AES, toàn vẹn và kết luận bài học.
Để so AI với ngưỡng cố định, giữ cùng sơ đồ, mã phiên/đường, seed, cửa sổ, độ dài,
công suất, góc và Eve; chỉ đổi chế độ ngưỡng. AI không luôn tạo ra lợi thế trong mọi lần chạy.

Tiến độ từng lộ trình giữ trong bộ nhớ khi chuyển màn hình; tải lại tab sẽ mất bài tập.
Lưu/nhập/xuất vẫn chỉ chứa thiết kế `SystemGraph` v1, không chứa số liệu tài chính,
nội dung truyền hoặc khóa. Xóa/thay liên kết của bài học sẽ chặn gửi; dùng **Hoàn tác**
hoặc **Khôi phục sơ đồ bài học** để khôi phục đúng liên kết, không tự chọn đường khác.

Dữ liệu và vai trò đều giả lập. Thuế suất, hạn mức và quy tắc trạng thái là quy ước
giáo dục, không dùng kê khai thuế hay ra quyết định ngân hàng. Phần trợ giúp trong bài
phân biệt các quy ước này với khái niệm tham khảo từ IFRS, BIS/Basel, ISO 20022 và FATF.
Không có kết nối thanh toán, phân quyền ngân hàng hoặc AML/KYC thật.

Mốc kiểm chứng FinEdu trên Windows: **76 kiểm thử backend, 41 kiểm thử frontend,
lint và build đạt**. Kiểm thử thêm khóa bước học, thứ tự quyết định, phản hồi/thử lại,
ghi nhớ lỗi, tổng kết và phân biệt số liệu minh họa với kết quả thực nghiệm.
Phần cứng Thorlabs chưa được đo thực tế.

## Visual QKD Lab — tiến độ mở rộng

Workspace Visual QKD Lab đã có System View để tạo/chỉnh node, QKD session,
quantum path, DATA link và lưu/import/export thiết kế. Đây là editor thiết kế;
Protocol View có hai template direct/trusted với typed ports và chạy ideal/FSO acquisition
đến QBER bằng seed xác định. Scope QKD + DATA bổ sung educational Cascade,
verification, Toeplitz, registry và AES-GCM. FSO dùng ba dataset và PolicyNet/fixed threshold,
giữ sequence của session, xử lý erasure theo index. Thorlabs manual hỗ trợ direct,
trusted HW/HW hoặc mixed SIM/HW: task D0/D1, retry idempotent, hủy phiên và TTL.
Visual Lab hỗ trợ Eve thu quang gần đầu thu của từng đường QKD, cấu hình khoảng lệch rE (0–200 m); estimator thông tin Eve là
heuristic giáo dục kế thừa binary entropy, không phải security bound.
Simulation Dashboard vẫn dùng API cũ.

Repository chỉ công bố README này; đặc tả và báo cáo làm việc được giữ riêng tại máy phát triển.
Kit Thorlabs thật chưa được nghiệm thu; kiểm thử phần mềm không thay thế phép đo phần cứng.
Mốc kiểm chứng trước thay đổi Eve: Python3.10.13 + đúng requirements trên Windows và Linux CPU,
75 backend tests mỗi môi trường, Gradio/Spaces thật và 13 frontend tests đều PASS.

Chọn mẫu Direct QKD, Trusted Distributor, Hybrid Hardware hoặc Eve Attack trong
“Mẫu hệ thống”. Mở Protocol View, chạy experiment rồi “Giữ kết quả làm Run A”.
Chỉnh một cấu hình trên cùng graph (ví dụ thêm/bỏ Eve trên path), chạy lại và giữ
Run B để so topology/provider/QBER/leakage/key/DATA. Giữ IDs, seed, scope và độ dài
để so cùng chuỗi ngẫu nhiên; mở template mới tạo IDs mới. So sánh chỉ ở memory,
không lưu payload/trace/keys. Acquisition hiển thị trace Eve; full QKD ẩn bit trace.

Với path Thorlabs, đặt sequence length ≤64, mở Protocol View và chạy acquisition
hoặc QKD + DATA. Nhập detector quan sát thực tế theo hướng dẫn từng state.
Trusted distributor đo toàn bộ lượt A rồi lượt B bằng cùng sequence. Phiên chỉ
tồn tại trong bộ nhớ backend 30 phút; restart backend làm mất phiên. UI có gửi lại,
làm mới và hủy. Đây là Physical Polarization Analogy; chưa kiểm chứng với kit thật.

Trong Protocol View, mở DATA payload, chọn links và nhập text demo; bấm
“Chạy QKD + DATA”. Không đủ 256 key bits chỉ chặn AES, không tự hủy QKD.
Payload/results ở memory, không ghi vào file thiết kế. Khóa mô phỏng có seed
công khai chỉ phục vụ giáo dục, không dùng bảo vệ dữ liệu thật.

Backend có `GET /v1/designer/catalog` và `POST /v1/designer/validate`.
Nút “Kiểm tra với backend” xác thực topology/config và nguồn khóa DATA;
kết quả hợp lệ chưa đồng nghĩa có thể chạy experiment hoặc đã có khóa AES.
Chạy toàn bộ backend tests từ repo root:
`python -m unittest backend.test_quantumshield backend.test_designer backend.test_ideal backend.test_security backend.test_fso backend.test_hardware backend.test_eve -v`.

Frontend test thêm: `cd frontend`, `npm run test:designer` (đã kiểm tra trên Node 24).

QuantumShield FinEdu là phòng thí nghiệm web mô phỏng CV-QKD/FSO trên dữ liệu
kênh đo thực nghiệm. Mô hình A2C chọn ngưỡng thu, chuỗi khóa được sửa lỗi và
rút gọn bằng Toeplitz, sau đó 256 bit khóa QKD được dùng trực tiếp cho
AES-256-GCM để bảo vệ nội dung tài chính mẫu.

> Đây là phần mềm mô phỏng phục vụ đào tạo và nghiên cứu, không phải thiết bị
> QKD vật lý đã được kiểm định cho hệ thống tài chính thực tế.

## Điểm chính của hệ thống

- Đọc cửa sổ 4.096-16.384 mẫu trực tiếp từ `clearlowSI.csv`,
  `clearhighSI.csv` hoặc `lightrain.csv`.
- So sánh ngưỡng cố định với A2C trên đúng cùng cửa sổ dữ liệu.
- Eve là máy thu quang gần đầu thu, dùng Gaussian overlap và Gen_Eve; nghe lén
  thụ động không tự tăng QBER. Ước lượng thông tin Eve biết không phải bằng chứng bảo mật.
- Cascade + ước lượng rò rỉ + Toeplitz privacy amplification dùng FFT.
- AES-256-GCM với nonce 96 bit, authentication tag 128 bit và AAD gắn với
  metadata phiên.
- Lịch sử tối đa 20 thí nghiệm và xuất CSV từ dashboard.
- Không âm thầm chạy model ngẫu nhiên khi weight thiếu hoặc không tương thích.
- Backend nạp trực tiếp model ba điều kiện từ `backend/weights/policy.pth`; dashboard
  có ba nút chọn Low SI, High SI và Light Rain.

## Chạy dự án

**Demo trên TV cảm ứng / thiết bị cùng mạng:** nhấp đúp `run-lan.bat`.
Launcher build bản demo rồi mở web trên cổng **5175**, in địa chỉ IP LAN để nhập
vào trình duyệt TV, ví dụ `http://192.168.2.43:5175`. IP có thể đổi khi đổi Wi-Fi.
TV và máy tính cần cùng mạng và mạng phải cho phép các thiết bị liên lạc với nhau.
Giữ cửa sổ launcher khi demo; nhấn Enter để dừng các máy chủ do launcher mở.
Chạy lại launcher sau khi sửa code để cập nhật bản demo.
API đi qua `/api` trên cùng địa chỉ web; backend vẫn chỉ nghe tại máy tính.
Windows Firewall cần cho phép TCP 5175 từ mạng con nội bộ (không cần mở cổng 8000).
Thiết lập một lần bằng `allow-lan.bat`, chọn **Yes** khi Windows hỏi quyền quản trị.
Quy tắc chỉ áp dụng cho Node.js trên cổng 5175 và các thiết bị cùng mạng con.
Mỗi thiết bị có phiên học riêng. Tải lại trang sẽ mất tiến độ trong tab.

**Trên máy Windows này: nhấp đúp `run.bat` ở thư mục gốc.** Backend và web tự chạy,
trình duyệt mở `http://127.0.0.1:5173`. Giữ cửa sổ chạy; nhấn Enter để dừng các máy chủ
vừa được mở. Máy chủ đã có từ trước được giữ nguyên. Sau khi sửa backend cần chạy lại.
Nhật ký khi có lỗi: `.runtime/`. Không cần kích hoạt venv hoặc gõ hai lệnh mỗi lần.

File chạy dùng `.venv-release` (ưu tiên) hoặc `.venv` và thư viện `frontend/node_modules`
đã cài. Nếu chuyển sang máy khác, cài Git LFS, Python3.10 và Node.js24, chuẩn bị một lần:

```powershell
git lfs install
git clone https://github.com/thacanh/QuantumShield.git
cd QuantumShield
git lfs pull
py -3.10 -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
cd frontend
npm ci
cd ..
.\run.bat
```

Ba bộ dữ liệu CSV và trọng số PolicyNet được quản lý bằng Git LFS; cần tải nội dung
LFS đầy đủ trước khi chạy backend. Môi trường Python, node_modules và cache không nằm trong repository.

Kiểm tra launcher không mở trình duyệt: `run.bat -Check -NoBrowser`.
Bản sửa Eve hiện hành: 76 backend tests, 18 frontend tests, lint/build PASS trên Windows.
Các kiểm tra Linux/Gradio bên trên là mốc release trước thay đổi này.

Chạy thủ công nếu cần:

Backend, từ thư mục gốc:

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend, ở terminal khác:

```powershell
cd frontend
npm install
npm run dev
```

Mở `http://localhost:5173`. API health check nằm tại
`http://localhost:8000/api/health`.

## Kịch bản demo đề xuất

1. **Fixed ρ=0:** Low Scintillation, cửa sổ 0, 8.192 mẫu, 4,5 dBm, góc 60°.
   Ngưỡng quá thấp giữ nhiều bit nhiễu, QBER vượt 11% và phiên bị hủy.
2. **AI Adaptive:** giữ nguyên mọi đầu vào. A2C chọn ρ thích nghi, tạo đủ khóa
   cho AES-256-GCM và Bob xác thực/giải mã thành công.
3. **Eve:** SI thấp, 5 dBm, góc 30°, khoảng lệch Eve so với Bob 20 m. So sánh
   với Eve 100/200 m trên cùng cấu hình; xem ước lượng thông tin Eve biết và độ dài khóa.
   QBER giữ nguyên vì Eve thu thụ động. Trong thiết kế, chỉ nối Eve với receiver của path.

## Kiểm thử

```powershell
python -m unittest backend.test_quantumshield -v
cd frontend
npm run lint
npm run build
```

CSV lớn được chuyển thành cache `*.uint8.npy` ở lần đọc đầu tiên. Cache chỉ là
artifact tăng tốc, được bỏ qua bởi `backend/.gitignore` và có thể xóa để tái tạo.
