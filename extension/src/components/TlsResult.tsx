function value(input: unknown): string {
  return typeof input === 'string' && input.trim() ? input.trim() : 'Chưa có dữ liệu'
}

function certificateDate(input: unknown) {
  const raw = typeof input === 'string' ? input.trim() : ''
  const date = raw ? new Date(raw) : null
  return date && !Number.isNaN(date.getTime())
    ? <time dateTime={raw} title={raw}>{date.toLocaleString('vi-VN')}</time>
    : <span>{value(input)}</span>
}

export function TlsResult({ result }: { result: Record<string, unknown> }) {
  const names = Array.isArray(result.dnsNames)
    ? result.dnsNames.filter((item): item is string => typeof item === 'string' && !!item.trim()) : []
  const chain = Array.isArray(result.chain)
    ? result.chain.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item)) : []
  const verification = result.verified === true ? 'Xác minh thành công'
    : result.verified === false ? 'Không xác minh được' : 'Chưa có dữ liệu xác minh'
  const port = typeof result.port === 'number' && Number.isInteger(result.port) && result.port > 0 && result.port <= 65535
    ? String(result.port) : 'Chưa có dữ liệu'

  return <div className="tls-details">
    <div className={`tls-verification ${result.verified === true ? 'tls-valid' : result.verified === false ? 'tls-invalid' : ''}`}>
      <div><span>XÁC MINH CHỨNG CHỈ</span><strong>{verification}</strong></div>
      <div><span>GIAO THỨC</span><strong>{value(result.tlsVersion)}</strong></div>
    </div>
    {result.verified === false && typeof result.verificationError === 'string' && result.verificationError.trim() &&
      <p className="tls-error">Lý do: {result.verificationError}</p>}
    <div className="tls-dates">
      <div><span>CÓ HIỆU LỰC TỪ</span><strong>{certificateDate(result.notBefore)}</strong></div>
      <div><span>HẾT HẠN VÀO</span><strong>{certificateDate(result.notAfter)}</strong></div>
    </div>
    <dl className="tls-fields">
      <div><dt>Cổng kết nối</dt><dd>{port}</dd></div>
      <div><dt>Chủ thể</dt><dd>{value(result.subject)}</dd></div>
      <div><dt>Nhà phát hành</dt><dd>{value(result.issuer)}</dd></div>
    </dl>
    <div className="tls-names"><strong>TÊN MIỀN TRÊN CHỨNG CHỈ</strong>
      {names.length ? <><ul>{names.slice(0, 6).map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ul>
        {names.length > 6 && <details><summary>Xem thêm {names.length - 6} tên miền</summary>
          <ul>{names.slice(6).map((name, index) => <li key={`${name}-${index + 6}`}>{name}</li>)}</ul>
        </details>}</> : <p>Chưa có dữ liệu</p>}
    </div>
    {chain.length > 0 && <details className="tls-chain"><summary>Chuỗi chứng chỉ ({chain.length})</summary>
      <ol>{chain.map((cert, index) => <li key={index}>
        <strong>Chứng chỉ {index + 1}</strong>
        <span>Chủ thể: {value(cert.subject)}</span>
        <span>Nhà phát hành: {value(cert.issuer)}</span>
        <span>Hiệu lực: {certificateDate(cert.notBefore)} – {certificateDate(cert.notAfter)}</span>
      </li>)}</ol>
    </details>}
  </div>
}
