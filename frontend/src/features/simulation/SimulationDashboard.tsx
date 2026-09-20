import { diagnosticText, vi } from '../../i18n/vi';
import { useState } from 'react';
import { simulate } from '../../api/simulation';
import type { ChannelDataset, ThresholdMode, SimulationRequest, SimulateResponse, ExperimentRecord } from '../../types/simulation';

const DATASET_OPTIONS: Array<{
  value: ChannelDataset;
  label: string;
  detail: string;
}> = [
  { value: 'clearlowSI.csv', label: 'SI thấp', detail: 'Kênh quang ổn định' },
  { value: 'clearhighSI.csv', label: 'SI cao', detail: 'Nhiễu loạn mạnh' },
  { value: 'lightrain.csv', label: 'Mưa nhẹ', detail: 'Mưa nhẹ' },
];

export default function SimulationDashboard() {
  // Input parameters states
  const [mode, setMode] = useState<ThresholdMode>('adaptive');
  const [channelDataset, setChannelDataset] = useState<ChannelDataset>('clearlowSI.csv');
  const [windowStart, setWindowStart] = useState<number>(0);
  const [sampleSize, setSampleSize] = useState<number>(8192);
  const [fixedRho, setFixedRho] = useState<number>(1);
  const [Pt_dBm, setPt_dBm] = useState<number>(5);
  const [xi, setXi] = useState<number>(30);
  const [eveActive, setEveActive] = useState<boolean>(false);
  const [rE, setRE] = useState<number>(100);

  // Response simulation states
  const [results, setResults] = useState<SimulateResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [experiments, setExperiments] = useState<ExperimentRecord[]>([]);

  // Business scenario states
  const [documentName, setDocumentName] = useState<string>('Bao_cao_tai_chinh_Q2.pdf');
  const [fileBase64, setFileBase64] = useState<string>('Ngân hàng ABC: Doanh thu 5.000 tỷ, Lợi nhuận 600 tỷ, Giao dịch lớn Q2');
  const [fileSize, setFileSize] = useState<number | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024) {
      alert("Vui lòng chọn tệp nhỏ hơn 500KB để đảm bảo tốc độ mô phỏng mượt mà.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFileBase64(reader.result);
        setDocumentName(file.name);
        setFileSize(file.size);
      }
    };
    reader.readAsDataURL(file);
  };

  const executeSimulation = async (overrides: Partial<SimulationRequest> = {}) => {
    const request: SimulationRequest = {
      channel_dataset: channelDataset,
      window_start: windowStart,
      sample_size: sampleSize,
      mode,
      fixed_rho: fixedRho,
      Pt_dBm,
      xi,
      eve_active: eveActive,
      rE: eveActive ? rE : 0,
      document_name: documentName,
      plaintext_payload: fileBase64,
      ...overrides,
    };

    setLoading(true);
    setError(null);
    try {
      const data = await simulate(request);
      setResults(data);
      setCopied(false);
      setExperiments((previous) => [
        {
          timestamp: new Date().toISOString(),
          dataset: data.channel_dataset,
          windowStart: data.window_start,
          mode: request.mode,
          rho: data.rho,
          qber: data.qber,
          psift: data.psift,
          peve: data.peve,
          finalKeyLength: data.final_key_len,
          accepted: data.accepted,
        },
        ...previous,
      ].slice(0, 20));
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : 'Lỗi không xác định';
      setError(`Không thể chạy mô phỏng: ${message}`);
      console.error(caught);
    } finally {
      setLoading(false);
    }
  };

  const applyDemoConfiguration = (config: Partial<SimulationRequest>) => {
    if (config.channel_dataset) setChannelDataset(config.channel_dataset);
    if (config.window_start !== undefined) setWindowStart(config.window_start);
    if (config.sample_size !== undefined) setSampleSize(config.sample_size);
    if (config.mode) setMode(config.mode);
    if (config.fixed_rho !== undefined) setFixedRho(config.fixed_rho);
    if (config.Pt_dBm !== undefined) setPt_dBm(config.Pt_dBm);
    if (config.xi !== undefined) setXi(config.xi);
    if (config.eve_active !== undefined) setEveActive(config.eve_active);
    if (config.rE !== undefined) setRE(config.rE);
    void executeSimulation(config);
  };

  const runDemoStep = (step: number) => {
    const sharedDifficultChannel: Partial<SimulationRequest> = {
      channel_dataset: 'clearlowSI.csv',
      window_start: 0,
      sample_size: 8192,
      Pt_dBm: 4.5,
      xi: 60,
      eve_active: false,
      rE: 100,
    };
    if (step === 1) {
      applyDemoConfiguration({ ...sharedDifficultChannel, mode: 'fixed', fixed_rho: 0 });
    } else if (step === 2) {
      applyDemoConfiguration({ ...sharedDifficultChannel, mode: 'adaptive' });
    } else if (step === 3) {
      applyDemoConfiguration({
        channel_dataset: 'clearlowSI.csv',
        window_start: 0,
        sample_size: 8192,
        mode: 'adaptive',
        Pt_dBm: 5,
        xi: 30,
        eve_active: true,
        rE: 20,
      });
    }
  };

  const exportExperimentsCsv = () => {
    const header = 'timestamp,dataset,window_start,mode,rho,qber,psift,peve,final_key_bits,accepted';
    const rows = experiments.map((item) => [
      item.timestamp,
      item.dataset,
      item.windowStart,
      item.mode,
      item.rho,
      item.qber,
      item.psift,
      item.peve,
      item.finalKeyLength,
      item.accepted,
    ].join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'quantumshield_experiments.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // Banner logic
  const getBannerState = () => {
    if (!results) return null;
    if (results.accepted) {
      return {
        type: 'safe',
        message: `PHIÊN AN TOÀN: ${results.final_key_len} bit khóa đã chưng cất; AES-256-GCM xác thực và giải mã thành công.`,
        style: 'glow-green bg-emerald-50 text-emerald-800 border-emerald-300'
      };
    }
    if (results.qber >= 0.11) {
      return {
        type: 'danger',
        message: `TỪ CHỐI PHIÊN: QBER ${(results.qber * 100).toFixed(2)}% vượt ngưỡng an toàn 11%. Dữ liệu không được mã hóa hay truyền đi.`,
        style: 'glow-red bg-red-50 text-red-800 border-red-300'
      };
    }
    return {
      type: 'warning',
      message: `CHƯA ĐỦ KHÓA CHO AES-256-GCM: ${results.abort_reason ? diagnosticText(results.abort_reason) : 'Không xác định được nguyên nhân'}.`,
      style: 'glow-yellow bg-yellow-50 text-yellow-800 border-yellow-300'
    };
  };

  const banner = getBannerState();

  // Formatting helper for decimal QBER format (no scientific e-...)
  const formatQBERFraction = (qber: number) => {
    return qber.toFixed(8);
  };

  const formatQBERPercentage = (qber: number) => {
    return `${(qber * 100).toFixed(6)}%`;
  };

  return (
    <div className="min-h-screen text-slate-800 flex flex-col">
      {/* ERROR BANNER IF SERVER OFFLINE */}
      {error && (
        <div className="bg-red-100 border-b border-red-300 text-red-800 py-3 px-6 text-center text-sm font-semibold flex items-center justify-center gap-4">
          <span>{diagnosticText(error)}</span>
          <button
            onClick={() => window.location.reload()}
            className="underline font-bold hover:text-red-950"
          >
            Tải lại trang
          </button>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">

        {/* SIDEBAR - CONFIGURATION PANELS */}
        <section className="lg:col-span-1 flex flex-col gap-6">
          <div className="glass-panel rounded-2xl p-6 flex flex-col gap-6">
            <div className="pb-3 border-b border-slate-200">
              <h2 className="text-lg font-bold tracking-wide text-slate-950">Cấu Hình Hệ Thống</h2>
            </div>

            {/* Threshold Mode Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Chế độ lọc ngưỡng</label>
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                <button
                  id="mode-toggle-fixed"
                  aria-pressed={mode === 'fixed'}
                  onClick={() => setMode('fixed')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${mode === 'fixed'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  Cố định (cơ sở)
                </button>
                <button
                  id="mode-toggle-adaptive"
                  aria-pressed={mode === 'adaptive'}
                  onClick={() => setMode('adaptive')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${mode === 'adaptive'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  AI thích nghi
                </button>
              </div>
              {mode === 'fixed' && (
                <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-500">Ngưỡng cố định ρ</span>
                    <span className="text-red-600">{fixedRho.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.05"
                    value={fixedRho}
                    onChange={(event) => setFixedRho(parseFloat(event.target.value))}
                    className="w-full mt-2 accent-red-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Measured channel dataset and window */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Chọn môi trường kênh</label>
              <div className="grid grid-cols-1 gap-2" role="group" aria-label="Môi trường kênh đo thực nghiệm">
                {DATASET_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    id={`environment-${option.value.replace('.csv', '').toLowerCase()}`}
                    type="button"
                    aria-pressed={channelDataset === option.value}
                    onClick={() => setChannelDataset(option.value)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${channelDataset === option.value
                      ? 'border-red-500 bg-red-600 text-white shadow-sm ring-2 ring-red-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-red-300 hover:bg-red-50'
                      }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">{option.label}</span>
                      <span className={`h-2.5 w-2.5 rounded-full ${channelDataset === option.value ? 'bg-emerald-300' : 'bg-slate-300'}`} />
                    </span>
                    <span className={`mt-0.5 block text-[10px] ${channelDataset === option.value ? 'text-red-100' : 'text-slate-400'}`}>
                      {option.detail} · {option.value}
                    </span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-500">
                  SỐ MẪU
                  <select
                    value={sampleSize}
                    onChange={(event) => setSampleSize(parseInt(event.target.value))}
                    className="p-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
                  >
                    <option value={4096}>4.096</option>
                    <option value={8192}>8.192</option>
                    <option value={16384}>16.384</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-500">
                  VỊ TRÍ BẮT ĐẦU
                  <input
                    type="number"
                    min="0"
                    max="16777215"
                    value={windowStart}
                    onChange={(event) => setWindowStart(Math.max(0, parseInt(event.target.value) || 0))}
                    className="p-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
                  />
                </label>
              </div>
              <button
                onClick={() => setWindowStart(Math.floor(Math.random() * 16_777_216))}
                className="py-2 px-3 text-[10px] font-bold rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              >
                Lấy cửa sổ ngẫu nhiên mới
              </button>
            </div>

            {/* Transmit Power Pt */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs font-bold tracking-wider">
                <label className="text-slate-500 uppercase">Công suất phát (P_t)</label>
                <span className="text-red-600">{Pt_dBm} dBm</span>
              </div>
              <input
                id="power-slider"
                type="range"
                min="-5"
                max="10"
                step="0.5"
                value={Pt_dBm}
                onChange={(e) => setPt_dBm(parseFloat(e.target.value))}
                className="w-full accent-red-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>-5 dBm</span>
                <span>10 dBm</span>
              </div>
            </div>

            {/* Zenith Angle (xi) */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs font-bold tracking-wider">
                <label className="text-slate-500 uppercase">Góc thiên đỉnh (ξ)</label>
                <span className="text-red-600">{xi}°</span>
              </div>
              <input
                id="zenith-slider"
                type="range"
                min="0"
                max="60"
                step="1"
                value={xi}
                onChange={(e) => setXi(parseInt(e.target.value))}
                className="w-full accent-red-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>0° (Thẳng đứng)</span>
                <span>60° (Nghiêng lớn)</span>
              </div>
            </div>

            {/* Eavesdropper Eve Toggle */}
            <div className="pt-3 border-t border-slate-200 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-800">Kích hoạt nghe lén (Eve)</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="eve-active-checkbox"
                    type="checkbox"
                    checked={eveActive}
                    onChange={(e) => setEveActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-350 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600 peer-checked:after:bg-white" />
                </label>
              </div>

              {/* Eve Distance Slider */}
              {eveActive && (
                <div className="flex flex-col gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-amber-800">Khoảng lệch Eve so với đầu thu (rE)</span>
                    <span className="text-amber-700">{rE} m</span>
                  </div>
                  <input
                    id="eve-distance-slider"
                    type="range"
                    min="0"
                    max="200"
                    step="5"
                    value={rE}
                    onChange={(e) => setRE(parseInt(e.target.value))}
                    className="w-full accent-amber-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-amber-500">
                    <span>0 m (Sát Bob)</span>
                    <span>200 m (An toàn)</span>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => void executeSimulation()}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-slate-400 text-white text-sm font-extrabold shadow-md transition-all"
            >
              {loading ? 'Đang đọc dữ liệu & mô phỏng...' : 'Chạy thí nghiệm'}
            </button>
          </div>

          {/* QUICK DEMO CONTROL CARD */}
          <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-200">
              Minh họa trực tiếp Kịch Bản (Ghi Điểm)
            </h3>

            <div className="flex flex-col gap-3">
              <button
                id="demo-step-1-btn"
                onClick={() => runDemoStep(1)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-left border border-red-200 bg-red-50 hover:bg-red-100 text-red-800 transition-all flex justify-between items-center group cursor-pointer"
              >
                <span>Bước 1: Cố định ρ=0 giữ quá nhiều bit nhiễu</span>
                <span className="text-red-600 group-hover:translate-x-1 transition-transform">→</span>
              </button>

              <button
                id="demo-step-2-btn"
                onClick={() => runDemoStep(2)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-left border border-emerald-250 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition-all flex justify-between items-center group cursor-pointer"
              >
                <span>Bước 2: AI DRL chọn ngưỡng, AES thành công</span>
                <span className="text-emerald-600 group-hover:translate-x-1 transition-transform">→</span>
              </button>

              <button
                id="demo-step-3-btn"
                onClick={() => runDemoStep(3)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-left border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 transition-all flex justify-between items-center group cursor-pointer"
              >
                <span>Bước 3: Khảo sát Eve thu quang gần Bob</span>
                <span className="text-amber-600 group-hover:translate-x-1 transition-transform">→</span>
              </button>
            </div>
          </div>
        </section>

        {/* MAIN PANEL - KPIs AND MONITORING */}
        <section className="lg:col-span-3 flex flex-col gap-6">

          {/* DYNAMIC FINANCIAL SECURITY BANNER */}
          {banner && (
            <div className={`border rounded-2xl p-5 flex items-start gap-4 transition-all duration-500 shadow-sm ${banner.style}`}>
              <div className="flex-1">
                <h4 className="text-sm font-bold tracking-wider uppercase mb-1">
                  Trạng Thái An Ninh Tài Chính (Hệ thống ngân hàng lõi)
                </h4>
                <p className="text-sm leading-relaxed font-semibold">{banner.message}</p>
              </div>
            </div>
          )}

          {/* BUSINESS TRANSACTION SCENARIO CARD */}
          <div className="glass-panel rounded-2xl p-6 flex flex-col gap-6 border-l-4 border-l-red-600 bg-gradient-to-br from-white to-slate-50/50">
            <div className="flex justify-between items-start pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Mô Phỏng Giao Dịch Nghiệp Vụ An Toàn (Liên Chi Nhánh)
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Kịch bản: Hà Nội (Alice) truyền dữ liệu tài chính nhạy cảm vào TP.HCM (Bob) qua vệ tinh (Charlie)
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wider">
                Luồng QKD trong hệ thống ngân hàng
              </span>
            </div>

            {/* Step 1 & 2: Document Config */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Document Configuration */}
              <div className="flex flex-col gap-2 md:col-span-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tên tài liệu bảo mật</label>
                <div className="flex flex-col gap-2">
                  <select
                    value={documentName.includes('.') && !['Bao_cao_tai_chinh_Q2.pdf', 'Danh_sach_giao_dich_lon_Q2.xlsx', 'Thong_tin_VIP_ABC_Bank.csv'].includes(documentName) ? 'custom' : documentName}
                    onChange={(e) => {
                      if (e.target.value !== 'custom') {
                        setDocumentName(e.target.value);
                        setFileSize(null);
                        if (e.target.value === 'Bao_cao_tai_chinh_Q2.pdf') {
                          setFileBase64('Ngân hàng ABC: Doanh thu 5.000 tỷ, Lợi nhuận 600 tỷ, Giao dịch lớn Q2');
                        } else if (e.target.value === 'Danh_sach_giao_dich_lon_Q2.xlsx') {
                          setFileBase64('Danh sách giao dịch trên 10 tỷ liên chi nhánh: GD-10029, GD-10293, GD-10992');
                        } else {
                          setFileBase64('Thông tin khách hàng VIP: VIP-001 Nguyễn Văn A, VIP-002 Trần Thị B');
                        }
                      }
                    }}
                    className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500"
                  >
                    <option value="Bao_cao_tai_chinh_Q2.pdf">Báo cáo tài chính Q2.pdf</option>
                    <option value="Danh_sach_giao_dich_lon_Q2.xlsx">Danh sách giao dịch &gt;10 tỷ.xlsx</option>
                    <option value="Thong_tin_VIP_ABC_Bank.csv">Thông tin VIP ABC Bank.csv</option>
                    {documentName.includes('.') && !['Bao_cao_tai_chinh_Q2.pdf', 'Danh_sach_giao_dich_lon_Q2.xlsx', 'Thong_tin_VIP_ABC_Bank.csv'].includes(documentName) && (
                      <option value="custom">📁 {documentName}</option>
                    )}
                  </select>

                  {/* File Upload Button */}
                  <label className="flex items-center justify-center gap-2 py-2 px-3 border border-dashed border-red-300 bg-red-50/30 hover:bg-red-50 rounded-xl cursor-pointer text-xs font-bold text-red-650 transition-all select-none">
                    <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span>Chọn tệp thực tế (&lt;500KB)</span>
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      className="hidden"
                      accept=".txt,.pdf,.xlsx,.csv,.png,.jpg,.jpeg,.doc,.docx"
                    />
                  </label>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {fileSize ? (
                    <span>Tệp đã chọn: <span className="font-semibold text-slate-650">{documentName} ({(fileSize/1024).toFixed(1)} KB)</span></span>
                  ) : (
                    <span>Nội dung mẫu: <span className="italic font-medium">"{fileBase64.substring(0, 40)}..."</span></span>
                  )}
                </div>
              </div>

              {/* Alice (Hà Nội Branch) - Sender */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-3">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-xs font-bold text-sky-700 uppercase flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                    Alice (Hà Nội)
                  </span>
                  <span className="text-[9px] font-bold text-slate-400">Người gửi</span>
                </div>
                <div className="flex flex-col gap-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Bản rõ:</span>
                    <span className="font-semibold text-slate-700 truncate max-w-[120px]">{documentName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Khóa Alice:</span>
                    <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1 py-0.5 rounded">
                      {results && results.final_key_len > 0
                        ? results.final_key_alice.slice(0, 12).join('') + '...'
                        : 'Không có khóa'}
                    </span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-100 flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400">BẢN MÃ AES-GCM (Base64):</span>
                    <div className="font-mono text-[10px] text-red-600 bg-red-50/50 p-1.5 rounded break-all border border-red-100">
                      {results?.accepted && results.ciphertext
                        ? results.ciphertext.substring(0, 24) + '...'
                        : '[TRUYỀN TIN BỊ CHẶN - KHÔNG AN TOÀN]'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bob (TP.HCM HQ) - Receiver */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-3">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-xs font-bold text-emerald-700 uppercase flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Bob (TP.HCM)
                  </span>
                  <span className="text-[9px] font-bold text-slate-400">Người nhận</span>
                </div>
                <div className="flex flex-col gap-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Trạng thái nhận:</span>
                    {results?.accepted ? (
                      <span className="font-bold text-emerald-600">Đã xác thực & Giải mã</span>
                    ) : (
                      <span className="font-bold text-red-600">Bị chặn an toàn</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Khóa Bob:</span>
                    <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1 py-0.5 rounded">
                      {results && results.final_key_len > 0
                        ? results.final_key_bob.slice(0, 12).join('') + '...'
                        : 'Không có khóa'}
                    </span>
                  </div>

                  {(() => {
                    const decrypted = results?.accepted ? results.decrypted_payload : '';
                    const isRealFile = decrypted.startsWith('data:');

                    return (
                      <div className="mt-2 pt-2 border-t border-slate-100 flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400">BẢN GIẢI MÃ Ở BOB (TP.HCM):</span>
                        {results?.accepted && results.ciphertext ? (
                          isRealFile ? (
                            <div className="flex flex-col gap-2">
                              <div className="font-semibold text-[10px] text-emerald-800 bg-emerald-50/50 border border-emerald-150 p-2 rounded-xl flex items-center justify-between">
                                <span>📁 {documentName.substring(0, 20)}{documentName.length > 20 ? '...' : ''}</span>
                              </div>
                              <a
                                href={decrypted}
                                download={documentName}
                                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all text-center select-none"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Tải Tệp Đã Giải Mã
                              </a>
                            </div>
                          ) : (
                            <div className="font-medium text-[10px] p-1.5 rounded break-all border text-emerald-750 bg-emerald-50/50 border-emerald-150">
                              {decrypted}
                            </div>
                          )
                        ) : (
                          <div className="font-semibold text-[10px] p-1.5 rounded break-all border text-rose-700 bg-rose-50/50 border-rose-100">
                            KHÔNG CÓ DỮ LIỆU
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Stepper Status message */}
            <div className="pt-2">
              {results?.accepted ? (
                <div className="p-3.5 bg-emerald-50 border border-emerald-250 rounded-xl text-emerald-800 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping flex-shrink-0" />
                  <div className="text-xs font-semibold leading-relaxed">
                    <span className="font-bold">LUỒNG HOẠT ĐỘNG:</span> Tài liệu <span className="underline font-semibold">{documentName}</span> được mã hóa bằng AES-256-GCM với 256 bit lấy trực tiếp từ khóa QKD đã chưng cất. Bob kiểm tra thẻ xác thực và giải mã nguyên vẹn.
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse flex-shrink-0" />
                  <div className="text-xs font-bold leading-relaxed">
                    <span className="font-extrabold uppercase">PHIÊN ĐÃ BỊ HỦY AN TOÀN:</span> {results?.abort_reason ? diagnosticText(results.abort_reason) : 'Chưa chạy mô phỏng'}. Alice không tạo bản mã khi khóa không đạt điều kiện QBER và độ dài tối thiểu cho AES-256-GCM.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* KPI METRICS BLOCK */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

            {/* KPI 1: RHO */}
            <div className="glass-panel glass-panel-hover rounded-2xl p-5 flex flex-col gap-2 relative overflow-hidden">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Hệ Số Ngưỡng (ρ)</span>
              </div>
              <div className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
                {results ? results.rho.toFixed(4) : '—'}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                <span>{mode === 'fixed' ? 'Cố định cứng' : 'DRL tối ưu'}</span>
              </div>
            </div>

            {/* KPI 2: QBER */}
            <div className="glass-panel glass-panel-hover rounded-2xl p-5 flex flex-col gap-2 relative overflow-hidden">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Lỗi QBER</span>
              </div>
              <div className="text-lg font-bold tracking-tight text-slate-900 mt-2 truncate">
                {results ? formatQBERPercentage(results.qber) : '—'}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                <span>Hệ số: {results ? formatQBERFraction(results.qber) : '—'}</span>
              </div>
            </div>

            {/* KPI 3: PSIFT */}
            <div className="glass-panel glass-panel-hover rounded-2xl p-5 flex flex-col gap-2 relative overflow-hidden">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Khóa Giữ Lại (Psift)</span>
              </div>
              <div className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
                {results ? `${(results.psift * 100).toFixed(2)}%` : '—'}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                <span>Tỷ lệ bit giữ lại làm khóa</span>
              </div>
            </div>

            {/* KPI 4: PEVE */}
            <div className="glass-panel glass-panel-hover rounded-2xl p-5 flex flex-col gap-2 relative overflow-hidden">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Sai số của Eve (Pe)</span>
              </div>
              <div className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
                {results ? `${(results.peve * 100).toFixed(2)}%` : '—'}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                <span>Eve mù thông tin ở mức 50%</span>
              </div>
            </div>

          </div>

          {results && (
            <div className="glass-panel rounded-2xl p-5 grid grid-cols-2 md:grid-cols-6 gap-4 text-xs">
              <div className="md:col-span-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Nguồn dữ liệu thực nghiệm</div>
                <div className="font-bold text-slate-800 mt-1">{results.dataset_label}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Cửa sổ</div>
                <div className="font-mono font-semibold mt-1">{results.window_start.toLocaleString()} + {results.sample_size.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Trung bình / độ lệch chuẩn của h</div>
                <div className="font-mono font-semibold mt-1">{results.channel_mean.toFixed(4)} / {results.channel_std.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Mức chồng lấn với Eve</div>
                <div className="font-mono font-semibold mt-1">{(results.eve_interception_strength * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Mô hình đang chạy</div>
                <div className="font-mono font-semibold mt-1 text-red-700">{results.model_weights}</div>
              </div>
            </div>
          )}

          {/* BIT STREAM PREVIEW COMPONENT */}
          <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Xem trước 256 bit đầu của cửa sổ kênh</h3>
              </div>
              <span className="text-xs text-slate-400 font-medium">Mẫu thời gian thực</span>
            </div>

            {loading ? (
              <div className="h-28 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-500 font-semibold">Đang mô phỏng và giải mã...</span>
              </div>
            ) : results && results.bits_preview ? (
              <div
                className="gap-1 mx-auto py-4 max-w-max"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
              >
                {results.bits_preview.map((bit, idx) => {
                  if (bit === 1) {
                    return (
                      <div
                        key={idx}
                        className="w-6 h-6 rounded bg-emerald-500 border border-emerald-600 text-white flex items-center justify-center font-extrabold text-[10px] shadow-sm cursor-help"
                        title={`Vị trí ${idx}: Bit 1`}
                      >
                        1
                      </div>
                    );
                  } else if (bit === 0) {
                    return (
                      <div
                        key={idx}
                        className="w-6 h-6 rounded bg-red-500 border border-red-600 text-white flex items-center justify-center font-extrabold text-[10px] shadow-sm cursor-help"
                        title={`Vị trí ${idx}: Bit 0`}
                      >
                        0
                      </div>
                    );
                  } else {
                    // bit === -1 -> HUY (Discarded)
                    return (
                      <div
                        key={idx}
                        className="w-6 h-6 rounded bg-red-150 border border-red-300 text-red-700 flex items-center justify-center font-bold text-[8px] shadow-sm opacity-90 cursor-help animate-pulse"
                        title={`Vị trí ${idx}: Bị nhiễu / Hủy`}
                      >
                        Hủy
                      </div>
                    );
                  }
                })}
              </div>
            ) : (
              <div className="h-28 flex items-center justify-center text-slate-400 text-sm font-medium">
                Không có dữ liệu khóa. Hãy kiểm tra kết nối máy chủ.
              </div>
            )}

            {/* CAPTIONS AND LEGENDS */}
            <div className="flex gap-6 justify-center text-xs text-slate-500 pt-3 border-t border-slate-200">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-emerald-500 border border-emerald-600 text-[8px] text-white flex items-center justify-center font-extrabold">1</span>
                <span>Bit 1 (Sạch)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-red-500 border border-red-600 text-[8px] text-white flex items-center justify-center font-extrabold">0</span>
                <span>Bit 0 (Sạch)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-8 h-4 rounded bg-red-150 border border-red-300 text-[8px] text-red-700 flex items-center justify-center font-bold animate-pulse">Hủy</span>
                <span>Bit Hủy (Nhiễu / Bị chặn thu)</span>
              </div>
            </div>
          </div>

          {/* FINAL SECRET KEY COMPONENT */}
          <div className="glass-panel rounded-2xl p-6 flex flex-col gap-6">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                Khóa Lượng Tử Bảo Mật Cuối Cùng
              </h3>
              <span className="text-xs text-slate-400 font-medium">Xử lý hậu kỳ hoàn tất</span>
            </div>

            {loading ? (
              <div className="h-28 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-500 font-semibold">Đang sửa lỗi và chưng cất khóa...</span>
              </div>
            ) : results ? (
              <div className="flex flex-col gap-5">
                {/* Status indicator */}
                {results.accepted ? (
                  <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-250 rounded-xl text-emerald-800">
                    <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <div className="text-xs font-semibold">
                      Khóa Alice/Bob trùng khớp sau Cascade + Toeplitz; AES-256-GCM đã xác thực tag thành công.
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
                    <svg className="w-5 h-5 text-rose-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="text-xs font-bold">
                      Phiên không được phép truyền dữ liệu: {results.abort_reason ? diagnosticText(results.abort_reason) : 'Không xác định được nguyên nhân'}.
                    </div>
                  </div>
                )}

                {/* Grid stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Khóa thô sau sàng lọc (N)</span>
                    <span className="text-sm font-bold text-slate-700 mt-1">{results.sifted_key_len} bit</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Tiết lộ sửa sai (leak_EC)</span>
                    <span className="text-sm font-bold text-slate-700 mt-1">{results.ec_leaked_bits} bit</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Ước lượng thông tin Eve biết (I_E)</span>
                    <span className="text-sm font-bold text-slate-700 mt-1">
                      {results.estimated_eve_information_bits.toFixed(1)} bit
                    </span>
                  </div>
                  <div className="p-3 bg-red-50 border border-red-150 rounded-xl flex flex-col">
                    <span className="text-[10px] text-red-500 font-bold uppercase">Hiệu suất khóa cuối</span>
                    <span className="text-sm font-bold text-red-700 mt-1">
                      {((results.final_key_len / results.sample_size) * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* Key display block */}
                {results.final_key_len > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                      <span>KHÓA BẢO MẬT CUỐI CÙNG ({results.final_key_len} BIT)</span>
                      <button
                        onClick={() => {
                          const keyStr = results.final_key_bob.join('');
                          navigator.clipboard.writeText(keyStr);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="py-1 px-2.5 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 hover:border-red-300 font-semibold transition-all cursor-pointer text-[10px]"
                      >
                        {copied ? 'Đã sao chép!' : 'Sao chép khóa'}
                      </button>
                    </div>
                    <div className="bg-slate-900 text-red-400 p-4 rounded-xl font-mono text-xs break-all tracking-widest border border-slate-800 shadow-inner select-all">
                      {results.final_key_bob.join('')}
                    </div>
                  </div>
                )}

                {results.accepted && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px]">
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="font-bold text-emerald-700">THUẬT TOÁN</div>
                      <div className="mt-1 font-mono text-emerald-900">{results.encryption_algorithm}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden">
                      <div className="font-bold text-slate-500">NONCE 96-BIT</div>
                      <div className="mt-1 font-mono text-slate-700 truncate" title={results.nonce}>{results.nonce}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden">
                      <div className="font-bold text-slate-500">THẺ XÁC THỰC 128 BIT</div>
                      <div className="mt-1 font-mono text-slate-700 truncate" title={results.authentication_tag}>{results.authentication_tag}</div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-28 flex items-center justify-center text-slate-400 text-sm font-medium">
                Không có dữ liệu khóa. Hãy kiểm tra kết nối máy chủ.
              </div>
            )}
          </div>

          {experiments.length > 0 && (
            <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Lịch sử thí nghiệm</h3>
                  <p className="text-[10px] text-slate-400 mt-1">Giữ tối đa 20 lần chạy trong phiên trình duyệt</p>
                </div>
                <button
                  onClick={exportExperimentsCsv}
                  className="py-2 px-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-bold hover:bg-red-100"
                >
                  Xuất CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-200">
                    <tr>
                      <th className="text-left py-2">Bộ dữ liệu</th>
                      <th className="text-left py-2">Chế độ</th>
                      <th className="text-right py-2">ρ</th>
                      <th className="text-right py-2">QBER</th>
                      <th className="text-right py-2">Psift</th>
                      <th className="text-right py-2">Khóa cuối</th>
                      <th className="text-right py-2">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {experiments.slice(0, 8).map((item) => (
                      <tr key={`${item.timestamp}-${item.mode}`} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 font-mono">{item.dataset.replace('.csv', '')}@{item.windowStart}</td>
                        <td className="py-2">{vi(item.mode)}</td>
                        <td className="py-2 text-right font-mono">{item.rho.toFixed(3)}</td>
                        <td className="py-2 text-right font-mono">{(item.qber * 100).toFixed(2)}%</td>
                        <td className="py-2 text-right font-mono">{(item.psift * 100).toFixed(2)}%</td>
                        <td className="py-2 text-right font-mono">{item.finalKeyLength}</td>
                        <td className={`py-2 text-right font-bold ${item.accepted ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {item.accepted ? 'Chấp nhận' : 'Đã hủy'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SYSTEM ARCHITECTURE VECTOR ILLUSTRATION */}
          <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-200">
              Sơ Đồ Kênh Truyền Vật Lý & Mô Hình Tác Nhân AI
            </h3>

            {/* SVG Diagram */}
            <div className="w-full bg-slate-50 rounded-xl p-6 border border-slate-200 flex flex-col items-center">
              <svg viewBox="0 0 800 240" className="w-full max-w-2xl text-slate-550">
                {/* Classical Link between Alice and Bob */}
                <line x1="180" y1="170" x2="620" y2="170" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5,5" />
                <text x="400" y="160" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">Kênh Cổ Điển (Sàng lọc và hậu xử lý)</text>

                {/* Satellite (Charlie) to Alice beam */}
                <path d="M 400 60 Q 290 105 180 170" fill="none" stroke="#6366f1" strokeWidth="3" opacity="0.8" />

                {/* Satellite (Charlie) to Bob beam */}
                <path d="M 400 60 Q 510 105 620 170" fill="none" stroke="#10b981" strokeWidth="3" opacity="0.8" />

                {/* Eve interception path */}
                {eveActive && (
                  <>
                    <ellipse cx="620" cy="170" rx="145" ry="55" fill="#fef3c7" opacity="0.4" /><text x="560" y="194" fill="#92400e" fontSize="9" textAnchor="middle">rE = {rE} m</text>
                    <line x1="500" y1="180" x2="620" y2="170" stroke="#b45309" strokeWidth="1.5" strokeDasharray="2,2" opacity="0.5" />
                  </>
                )}

                {/* Atmosphere / Clouds (Atmospheric Turbulence) */}
                <g opacity="0.65">
                  <path d="M 270 110 C 278 102, 290 102, 298 110 C 306 102, 318 102, 326 110 C 330 114, 330 122, 326 126 L 270 126 Z" fill="#cbd5e1" />
                  <text x="298" y="120" fill="#475569" fontSize="7" fontWeight="bold" textAnchor="middle">Nhiễu khí quyển A</text>
                </g>

                <g opacity="0.65">
                  <path d="M 480 110 C 488 102, 500 102, 508 110 C 516 102, 528 102, 536 110 C 540 114, 540 122, 536 126 L 480 126 Z" fill="#cbd5e1" />
                  <text x="508" y="120" fill="#475569" fontSize="7" fontWeight="bold" textAnchor="middle">Nhiễu khí quyển B</text>
                </g>

                {/* Charlie Node (Satellite) */}
                <circle cx="400" cy="60" r="28" fill="#e0e7ff" stroke="#6366f1" strokeWidth="3" />
                <foreignObject x="350" y="5" width="100" height="24">
                  <div className="text-[10px] font-bold text-center text-red-700">CHARLIE (Vệ tinh)</div>
                </foreignObject>
                <text x="400" y="64" fill="#4f46e5" fontSize="12" fontWeight="extrabold" textAnchor="middle">Vệ tinh</text>

                {/* Alice Node (Ground Station A) */}
                <circle cx="180" cy="170" r="24" fill="#e0f2fe" stroke="#0284c7" strokeWidth="3" />
                <foreignObject x="140" y="200" width="80" height="24">
                  <div className="text-[10px] font-bold text-center text-sky-700">ALICE (Mặt đất)</div>
                </foreignObject>
                <text x="180" y="174" fill="#0369a1" fontSize="11" fontWeight="extrabold" textAnchor="middle">Alice</text>

                {/* Bob Node (Ground Station B) */}
                <circle cx="620" cy="170" r="24" fill="#d1fae5" stroke="#10b981" strokeWidth="3" />
                <foreignObject x="580" y="200" width="80" height="24">
                  <div className="text-[10px] font-bold text-center text-emerald-700">BOB (Mặt đất)</div>
                </foreignObject>
                <text x="620" y="174" fill="#047857" fontSize="11" fontWeight="extrabold" textAnchor="middle">Bob</text>

                {/* Eve Node */}
                {eveActive && (
                  <g>
                    <circle cx="500" cy="180" r="20" fill="#fef3c7" stroke="#d97706" strokeWidth="2" />
                    <foreignObject x="460" y="205" width="80" height="24">
                      <div className="text-[9px] font-bold text-center text-amber-700">EVE (Nghe lén)</div>
                    </foreignObject>
                    <text x="500" y="184" fill="#b45309" fontSize="10" fontWeight="extrabold" textAnchor="middle">Eve</text>
                  </g>
                )}

                {/* AI Controller Layer */}
                {mode === 'adaptive' && (
                  <g className="animate-fadeIn">
                    <rect x="320" y="185" width="160" height="42" rx="8" fill="#e0e7ff" stroke="#818cf8" strokeWidth="2" opacity="0.95" />
                    <foreignObject x="325" y="189" width="150" height="35">
                      <div className="text-[9px] text-red-850 font-bold text-center flex flex-col justify-center h-full">
                        <span>Tác nhân A2C DRL đang hoạt động</span>
                        <span className="text-emerald-700 text-[8px] font-extrabold">Ngưỡng ρ = {results ? results.rho.toFixed(2) : '—'}</span>
                      </div>
                    </foreignObject>
                  </g>
                )}
              </svg>
            </div>
          </div>

        </section>

      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400 mt-12">
        <p>© AI-Quantum Challenge 2026 - QuantumShield FinEdu.</p>
        <p className="mt-1">Phòng thí nghiệm mô phỏng phục vụ đào tạo/nghiên cứu; không phải hệ thống QKD phần cứng đã kiểm định.</p>
      </footer>
    </div>
  );
}
