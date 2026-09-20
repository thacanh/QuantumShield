import type { ExperimentResult } from '../../../types/experiment';
import { diagnosticText, vi } from '../../../i18n/vi';

export default function ExperimentPanel({ result, stale }: { result: ExperimentResult; stale: boolean }) {
  const name = (id: string) => result.graphSnapshot.nodes.find(n => n.id === id)?.name ?? id;
  return <section className="lab-results">
    <h2>{(result.scope === 'qkd' || result.scope.endsWith('_qkd')) ? 'Kết quả QKD + Dữ liệu' : 'Kết quả thu nhận'}</h2>
    <p>Lần chạy {result.id.slice(0, 8)} · {vi(result.scope)} · {vi(result.state)}</p>
    {result.diagnostic && <p role="alert">{diagnosticText(result.diagnostic)}</p>}
    {stale && <p className="lab-note">Sơ đồ đã thay đổi. Kết quả bên dưới giữ nguyên bản chụp cấu hình của lần chạy trước.</p>}
    <p>{(result.scope === 'acquisition' || result.scope.endsWith('_acquisition')) ? 'Chưa sửa lỗi, xác minh hoặc khuếch đại tính riêng tư. Chưa có khóa bảo mật; AES chưa được yêu cầu.' : 'Mô hình giáo dục: Cascade có bước sửa trực tiếp dự phòng; xác minh bằng so sánh nội bộ. Thông tin Eve biết chỉ là ước lượng minh họa, không phải giới hạn bảo mật được chứng minh cho hệ thống kết hợp.'}</p>
    {result.sessions.map(session => {
      const config = result.graphSnapshot.qkdSessions.find(s => s.id === session.sessionId)!;
      return <article key={session.sessionId} className="lab-session-result">
        <h3>{config.participantIds.map(name).join(' ↔ ')} · {vi(session.protocol)}</h3>
        <p>Hạt giống ngẫu nhiên {config.config.masterSeed} · {session.preparedCount} trạng thái · {session.siftedCount} vị trí sau sàng lọc · {session.errorCount} lỗi · QBER {session.qber === null ? '— (không còn bit sau sàng lọc)' : `${(session.qber * 100).toFixed(2)}%`}</p>
        <p>{session.abortReason ? `QKD đã hủy: ${diagnosticText(session.abortReason)}` : session.qkdStatus === 'completed' ? 'QKD hoàn tất' : 'Thu nhận hoàn tất · QKD chờ hậu xử lý'} · Khóa: {vi(session.keyStatus)} · Ứng dụng: {vi(session.applicationStatus)}</p>
        {session.finalKeyLength !== undefined && <p>Khóa cuối: {session.finalKeyLength} bit · Ước lượng thông tin Eve biết: {session.estimated_eve_information_bits?.toFixed(2)} bit · Xác minh: {vi(session.verification)}</p>}
        {!!session.eveReport?.paths.length && <div className="lab-note">
          <p>Eve thu quang gần đầu thu · Ước lượng thông tin Eve biết: {session.eveReport.estimatedInformationBits.toFixed(2)} bit. Ước lượng phục vụ học tập; không phải giới hạn bảo mật được chứng minh.</p>
          {session.eveReport.paths.map(path => <p key={path.pathId}>{name(path.eveId)} · đường truyền {path.pathId.slice(0, 8)} · đầu thu {name(path.receiverId)} · khoảng lệch {path.offsetMeters} m · {path.detectedCount}/{path.sampleCount} mẫu Eve thu được sau sàng lọc · Tỷ lệ sai của Eve {path.peve === null ? '—' : `${(path.peve * 100).toFixed(2)}%`} · ước lượng {path.estimatedInformationBits.toFixed(2)} bit</p>)}
          <p>Tổng ước lượng các đường truyền được giới hạn ở số bit sau sàng lọc. Nghe lén thụ động không tự làm tăng QBER; QBER thấp không chứng minh không có Eve.</p>
        </div>}
        {session.reconciliation && <p>Đồng bộ khóa: {session.reconciliation.success ? 'Thành công' : 'Thất bại'} · Tiết lộ: {session.reconciliation.leakedBits} bit · Sửa trực tiếp dự phòng: {session.reconciliation.fallbackUsed ? 'Có' : 'Không'}</p>}
        {session.pathResults?.map(path => <p key={path.pathId}>
          Đường truyền {path.pathId.slice(0, 8)} · {vi(path.model)} · {vi(path.origin)} · Thu được {path.detectedCount}/{path.measuredCount} · Mất tín hiệu {path.erasedCount}
          {path.dataset && <> · {path.dataset} · Vị trí bắt đầu {path.windowStart} · {vi(path.thresholdMode)} ρ={path.rho?.toFixed(3)}</>}
        </p>)}
        {session.preview.length > 0 && <details><summary>Chi tiết mô phỏng · {session.preview.length}/{session.preparedCount} trạng thái đầu</summary>
          <div className="lab-table-scroll"><table><thead><tr><th>Vị trí</th><th>Đã chuẩn bị</th><th>Eve thu quang · Mô phỏng</th><th>Kết quả đo · Mô phỏng</th><th>Sàng lọc</th></tr></thead>
            <tbody>{session.preview.map(row => <tr key={row.index}><td>{row.index}</td><td>{row.preparedBit} / {row.preparedBasis}</td><td>{row.eve?.map(e => `${name(e.eveId)} (${e.pathId.slice(0, 8)}): ${e.measuredBit === -1 ? 'mất tín hiệu' : e.measuredBit}/${e.basis}`).join(' · ') || '—'}</td><td>{row.measurements.map(m => `${name(m.nodeId)}: ${m.bit === -1 ? 'mất tín hiệu' : m.bit} / ${m.basis} (${vi(m.origin)})`).join(' · ')}</td><td>{row.kept ? 'Giữ' : 'Loại'}</td></tr>)}</tbody>
          </table></div>
        </details>}
      </article>;
    })}
    {result.dataResults?.map((data, index) => {
      const edge = result.graphSnapshot.edges.find(e => e.id === data.edgeId)!;
      return <article key={data.edgeId} className="lab-session-result">
        <h3>Dữ liệu {index + 1} · {name(edge.source)} → {name(edge.target)}</h3>
        <p>{data.protection === 'none' ? 'Bản rõ · không mã hóa' : 'AES-256-GCM'} · {vi(data.applicationStatus)} · {vi(data.transmissionStatus)}</p>
        {data.protection !== 'none' && <p>Khóa: {data.keyBitsAvailable}/256 bit · AES {data.aesReady ? 'sẵn sàng' : 'chưa sẵn sàng'} · Tính toàn vẹn: {data.integrityVerified ? 'đã xác minh' : 'chưa xác minh'}</p>}
        {data.diagnostic && <p>{diagnosticText(data.diagnostic)}</p>}
        {data.ciphertext !== undefined && <details><summary>Bản mã / nonce / thẻ xác thực</summary><p className="lab-crypto-output">{data.ciphertext}<br />Nonce: {data.nonce}<br />Thẻ xác thực: {data.authenticationTag}</p></details>}
        {(data.decryptedPayload !== undefined || data.receivedPayload !== undefined) && <label>Bản nhận Dữ liệu {index + 1}<textarea readOnly aria-label={`Bản nhận Dữ liệu ${index + 1}`} value={data.decryptedPayload ?? data.receivedPayload} /></label>}
      </article>;
    })}
  </section>;
}
