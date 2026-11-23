import type { CheckRecord } from '../services/storage'

export function HistoryItem({ record, selected, onClick }: { record: CheckRecord; selected: boolean; onClick: () => void }) {
  return <button type="button" className={`recent${selected ? ' recent-active' : ''}`} aria-pressed={selected} onClick={onClick}>
    <span className={`recent-status ${record.status}`} />
    <span className="recent-details"><strong>{record.tool} <span>· {record.target}</span></strong><small>{record.source}</small></span>
    <time dateTime={record.at}>{new Date(record.at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</time>
  </button>
}
