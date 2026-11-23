function text(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'Chưa có dữ liệu'
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item.trim()) : []
}

export function WhoisResult({ result }: { result: Record<string, unknown> }) {
  const events = result.events && typeof result.events === 'object' && !Array.isArray(result.events)
    ? result.events as Record<string, unknown> : {}
  const status = list(result.status)
  const nameServers = list(result.nameServers)

  return <div className="whois-details">
    <div className="whois-dates">
      <div><span>NGÀY ĐĂNG KÝ</span><strong>{text(events.registration)}</strong></div>
      <div><span>NGÀY HẾT HẠN</span><strong>{text(events.expiration)}</strong></div>
    </div>
    <dl className="whois-fields">
      <div><dt>Tên miền</dt><dd>{text(result.domain)}</dd></div>
      <div><dt>Nhà đăng ký</dt><dd>{text(result.registrar)}</dd></div>
      <div><dt>DNSSEC</dt><dd>{result.dnssec === true ? 'Đã bật' : result.dnssec === false ? 'Chưa bật' : 'Chưa có dữ liệu'}</dd></div>
    </dl>
    <div className="whois-group"><strong>TRẠNG THÁI</strong>
      {status.length ? <ul className="whois-status">{status.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>Chưa có dữ liệu</p>}
    </div>
    <div className="whois-group"><strong>NAMESERVER</strong>
      {nameServers.length ? <ul className="whois-nameservers">{nameServers.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>Chưa có dữ liệu</p>}
    </div>
  </div>
}
