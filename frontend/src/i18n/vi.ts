// Presentation only: API values, graph IDs and persisted configurations stay unchanged.
const labels: Record<string, string> = {
  participant: 'Bên tham gia', key_distributor: 'Bên phân phối khóa', eavesdropper: 'Bên nghe lén',
  direct_bb84: 'BB84 trực tiếp', trusted_distributor: 'Phân phối khóa tin cậy',
  simulation: 'Mô phỏng', thorlabs: 'Thorlabs', SIM: 'Mô phỏng', HW: 'Phần cứng',
  ideal: 'Lý tưởng', current_fso: 'FSO hiện tại', fixed: 'Cố định', adaptive: 'Thích nghi',
  completed: 'Hoàn tất', aborted: 'Đã hủy', failed: 'Thất bại', not_run: 'Chưa chạy',
  waiting_for_hardware: 'Chờ phép đo phần cứng', processing: 'Đang xử lý', pending: 'Đang chờ',
  none: 'Không có', distilled: 'Đã chưng cất', verified: 'Đã xác minh',
  not_requested: 'Chưa yêu cầu', ready: 'Sẵn sàng', insufficient_key: 'Chưa đủ khóa', encrypted: 'Đã mã hóa',
  delivered: 'Đã nhận', blocked: 'Bị chặn', MATCH: 'Khớp', MISMATCH: 'Không khớp',
  aes_256_gcm: 'AES-256-GCM',
  acquisition: 'Thu nhận và ước lượng QBER', qkd: 'QKD và truyền dữ liệu',
  ideal_acquisition: 'Thu nhận lý tưởng', ideal_qkd: 'QKD lý tưởng',
  software_acquisition: 'Thu nhận mô phỏng', software_qkd: 'QKD mô phỏng',
  state_preparation: 'Chuẩn bị trạng thái', quantum_transmission: 'Truyền trạng thái lượng tử',
  measurement: 'Đo trạng thái', basis_reconciliation: 'Đối chiếu cơ sở đo', sifting: 'Sàng lọc khóa',
  qber_estimation: 'Ước lượng QBER', error_correction: 'Sửa lỗi bằng Cascade',
  key_verification: 'Xác minh khóa', privacy_amplification: 'Khuếch đại tính riêng tư', key_store: 'Lưu khóa chung',
  prepared_states: 'Trạng thái đã chuẩn bị', raw_measurements: 'Kết quả đo thô', basis_metadata: 'Thông tin cơ sở đo',
  sifted_key_pair: 'Cặp khóa đã sàng lọc', qber_report: 'Báo cáo QBER', corrected_key_pair: 'Cặp khóa đã sửa lỗi',
  verified_key_pair: 'Cặp khóa đã xác minh', secure_key_pair: 'Cặp khóa bảo mật', shared_key_handle: 'Tham chiếu khóa chung',
  states: 'Trạng thái', measurements: 'Kết quả đo', basis: 'Cơ sở đo', pair: 'Cặp khóa', report: 'Báo cáo', handle: 'Tham chiếu',
  receiver_side_fso: 'Thu quang nghe lén gần đầu thu',
};
export const vi = (value: string | null | undefined): string => value == null ? '—' : labels[value] ?? value;
export const portLabel = (value: string): string => value.startsWith('receiver:') ? `Bên nhận ${Number(value.split(':')[1]) + 1}` : vi(value);

const diagnostics: Record<string, string> = {
  INVALID_SYSTEM_GRAPH: 'Sơ đồ hoặc cấu hình không hợp lệ.', DUPLICATE_ID: 'Mã định danh bị trùng.',
  INVALID_SESSION_PARTICIPANTS: 'Phiên QKD cần hai bên tham gia khác nhau và tồn tại.',
  INVALID_SESSION_PATHS: 'Tham chiếu đường truyền của phiên bị thiếu, trùng hoặc không khớp.',
  INVALID_DIRECT_TOPOLOGY: 'BB84 trực tiếp cần một đường truyền từ bên gửi đến bên nhận.',
  INVALID_TRUSTED_TOPOLOGY: 'Phiên phân phối khóa tin cậy cần hai đường từ cùng bên phân phối đến hai bên tham gia.',
  ORPHAN_QUANTUM_PATH: 'Đường truyền chưa thuộc phiên QKD tương ứng.',
  INVALID_PATH_ENDPOINTS: 'Hai đầu đường truyền phải tồn tại và khác nhau.',
  INVALID_EVE_REFERENCE: 'Bên nghe lén được chọn không tồn tại hoặc không phải Eve.',
  UNSUPPORTED_PHYSICAL_EVE: 'Chưa hỗ trợ Eve trên đường truyền phần cứng Thorlabs.',
  INVALID_DATA_ENDPOINTS: 'Đường dữ liệu phải nối hai bên tham gia khác nhau.',
  NO_QKD_PATH: 'Chưa có phiên QKD cho hai bên truyền dữ liệu.',
  AMBIGUOUS_KEY_SOURCE: 'Có nhiều phiên QKD phù hợp; hãy chọn rõ nguồn khóa.',
  INVALID_KEY_SOURCE: 'Nguồn khóa không tồn tại hoặc không thuộc hai bên truyền dữ liệu.',
  NO_QKD_SESSION: 'Sơ đồ chưa có phiên QKD.', NO_VALID_SHARED_KEY: 'Chưa có khóa chung hợp lệ.',
  INSUFFICIENT_AES_256_KEY_MATERIAL: 'Chưa đủ 256 bit khóa cho AES-256-GCM.',
  AES_GCM_INTEGRITY_CHECK_FAILED: 'Xác thực tính toàn vẹn AES-GCM thất bại.',
  QBER_ABOVE_11_PERCENT: 'QBER đạt hoặc vượt 11%; phiên QKD đã bị hủy.',
  ERROR_CORRECTION_FAILED: 'Không thể đồng bộ hai khóa sau sửa lỗi.',
  FINAL_KEYS_DO_NOT_MATCH: 'Hai khóa cuối không khớp.',
  NO_SECURE_KEY_AFTER_PRIVACY_AMPLIFICATION: 'Không còn khóa bảo mật sau khuếch đại tính riêng tư.',
  PRIVACY_AMPLIFICATION_FAILED: 'Khuếch đại tính riêng tư thất bại.',
  HARDWARE_PROCESSING_FAILED: 'Xử lý kết quả đo phần cứng thất bại.',
  HARDWARE_OBSERVATION_REQUIRED: 'Cần nhập quan sát từ phần cứng.',
  PAYLOAD_TOO_LARGE: 'Nội dung truyền vượt giới hạn dung lượng.',
  ZERO_SIFTED_BITS: 'Không còn bit sau sàng lọc.', ZERO_SIFT: 'Không còn bit sau sàng lọc.',
  QBER_TOO_HIGH: 'QBER đạt hoặc vượt ngưỡng hủy phiên.', QBER_THRESHOLD_EXCEEDED: 'QBER đạt hoặc vượt ngưỡng hủy phiên.',
  RECONCILIATION_FAILED: 'Không thể đồng bộ khóa sau sửa lỗi.', KEY_VERIFICATION_FAILED: 'Hai khóa không khớp sau xác minh.',
  EXPERIMENT_NOT_FOUND_OR_EXPIRED: 'Không tìm thấy lần chạy hoặc phiên đã hết hạn.',
  HARDWARE_ACQUISITION_CANCELLED: 'Phiên đo phần cứng đã bị hủy.', HARDWARE_STORE_FULL: 'Bộ nhớ phiên đo đã đầy.',
  TASK_ALREADY_COMPLETED: 'Phép đo này đã được ghi nhận với kết quả khác.',
  STALE_ACQUISITION_TASK: 'Phép đo không còn là phép đo hiện tại. Hãy làm mới trạng thái.',
};
export function diagnosticText(value: string): string {
  if (value.includes(', ') && value.split(', ').every(code => /^[A-Z][A-Z_0-9]+$/.test(code))) return value.split(', ').map(diagnosticText).join(' ');
  if (/^Backend \d+/.test(value)) return value.replace(/^Backend/, 'Máy chủ');
  return diagnostics[value] ?? (value === 'Failed to fetch' ? 'Không kết nối được với máy chủ.'
    : /abort|timed out/i.test(value) && !/[À-ỹ]/.test(value) ? 'Yêu cầu đã dừng hoặc hết thời gian chờ.'
    : /^[A-Z][A-Z_0-9]+$/.test(value) ? `Không thể hoàn tất thao tác (mã lỗi: ${value}).` : value);
}

export const flowAriaLabels = {
  'controls.zoomIn.ariaLabel': 'Phóng to', 'controls.zoomOut.ariaLabel': 'Thu nhỏ',
  'controls.fitView.ariaLabel': 'Vừa khung nhìn', 'controls.interactive.ariaLabel': 'Bật hoặc tắt tương tác',
  'minimap.ariaLabel': 'Bản đồ thu nhỏ', 'controls.ariaLabel': 'Điều khiển sơ đồ',
  'node.a11yDescription.default': 'Nhấn Enter để chọn thực thể; dùng phím mũi tên để di chuyển.',
  'node.a11yDescription.keyboardDisabled': 'Nhấn Enter để chọn thực thể.',
  'edge.a11yDescription.default': 'Nhấn Enter để chọn đường truyền.',
};
