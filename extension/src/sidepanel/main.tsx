import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Download, Trash2 } from 'lucide-react'
import { HistoryItem } from '../components/HistoryItem'
import { Result } from '../components/Result'
import { downloadReport } from '../services/report'
import { getHistory, type CheckRecord } from '../services/storage'
import '../style.css'

function App() {
  const [history, setHistory] = useState<CheckRecord[]>([])
  const [selected, setSelected] = useState<CheckRecord | null>(null)
  const detailsRef = useRef<HTMLDivElement>(null)
  useEffect(() => { void getHistory().then(setHistory) }, [])
  function showRecord(item: CheckRecord) {
    setSelected(item)
    requestAnimationFrame(() => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  return <main className="panel"><div className="main-content">
    <div className="eyebrow">NHẬT KÝ KIỂM TRA</div><h1>Lịch sử <span>của bạn.</span></h1>
    <p className="intro">Tối đa 50 lần kiểm tra, chỉ lưu trên trình duyệt này.</p>
    <div className="toolbar"><button disabled={!history.length} onClick={() => downloadReport(history)}><Download size={16} /> Xuất HTML</button><button disabled={!history.length} className="danger" onClick={async () => { if (confirm('Xóa toàn bộ lịch sử?')) { await chrome.storage.local.remove('history'); setHistory([]); setSelected(null) } }}><Trash2 size={16} /> Xóa lịch sử</button></div>
    {history.length ? <div className="history-list">{history.map((item) => <HistoryItem key={item.id} record={item} selected={selected?.id === item.id} onClick={() => showRecord(item)} />)}</div> : <p className="empty">Chưa có lịch sử. Mở popup và chạy một công cụ để bắt đầu.</p>}
    <div ref={detailsRef}>{selected && <Result record={selected} />}</div>
  </div></main>
}
createRoot(document.getElementById('root')!).render(<App />)
