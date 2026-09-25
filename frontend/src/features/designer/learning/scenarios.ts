import type { LearningExperienceDefinition } from '../../../types/learning';

export const experiences: LearningExperienceDefinition[] = [
  { id: 'qkd_lab', level: 'core', title: 'QKD Lab', description: 'Khám phá cách tạo khóa chung trước khi ứng dụng vào dữ liệu tài chính.',
    learningObjectives: ['Thiết kế mạng QKD, cơ sở đo và sàng lọc', 'QBER, sửa lỗi và khuếch đại tính riêng tư', 'FSO, AI, Eve thụ động và Thorlabs'] },
  { id: 'electronic_invoice', level: 'basic', title: 'Hóa đơn điện tử & công nợ', description: 'Từ hóa đơn 11 triệu đến khoản còn phải thu: đối chiếu trước, bảo vệ dữ liệu sau.',
    learningObjectives: ['Phân biệt hóa đơn, doanh thu và tiền đã thu', 'Ghép đúng thanh toán; tính số tiền còn phải thu', 'Gửi bản chụp công nợ bằng QKD + AES'] },
  { id: 'q_authorization_vault', level: 'advanced', title: 'Q-Authorization Vault', description: 'Thực hành kiểm soát một lệnh 5 tỷ đồng qua hai vai trò và kênh truyền an toàn.',
    learningObjectives: ['Kiểm tra số dư khả dụng, hạn mức, bên nhận', 'Tách kiểm soát tuân thủ và người lập–người duyệt', 'Phân biệt phê duyệt để gửi với quyết toán'] },
];
export const futureExperiences = ['Quyết toán liên ngân hàng', 'Hồ sơ tín dụng', 'Gửi báo cáo kiểm toán', 'Sao lưu trung tâm dự phòng', 'Bảng lương', 'Trao đổi hồ sơ KYC', 'Dữ liệu thuế', 'Lệnh chứng khoán'];
export const levelLabels = { core: 'Nền tảng QKD', basic: 'Cơ bản · Tài chính', advanced: 'Nâng cao · Tài chính & AI-QKD' };
