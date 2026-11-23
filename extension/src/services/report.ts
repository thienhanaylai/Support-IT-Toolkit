import type { CheckRecord } from './storage'

export function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function renderReportHTML(records: CheckRecord[]): string {
  const rows = records.map((r) =>
    `<details class="entry"><summary><span class="entry-title">${escapeHTML(r.tool)} — ${escapeHTML(r.target)}</span><span class="entry-meta">${escapeHTML(r.at)} · ${escapeHTML(r.status)}</span></summary><div class="entry-body"><p>Nguồn: ${escapeHTML(r.source)}</p><pre>${escapeHTML(JSON.stringify(r.result, null, 2))}</pre></div></details>`,
  ).join('')
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>IT Support Toolkit · Báo cáo</title><style>body{font:15px system-ui;max-width:900px;margin:40px auto;padding:0 20px;color:#183042;background:#f8fafb}h1{font-size:24px}.entry{border:1px solid #dce6e8;border-radius:10px;margin:12px 0;background:#fff}.entry summary{display:flex;align-items:center;flex-wrap:wrap;gap:5px 16px;cursor:pointer;padding:16px;list-style:none}.entry summary::-webkit-details-marker{display:none}.entry summary::before{content:"▸";color:#087d60;font-weight:bold}.entry[open] summary::before{content:"▾"}.entry summary:hover{background:#f2faf7}.entry-title{font-weight:700;overflow-wrap:anywhere}.entry-meta{font-size:12px;color:#687b83;margin-left:auto}.entry-body{border-top:1px solid #e8edef;padding:0 16px 16px}.entry-body p{color:#5b7078;font-size:13px}.entry pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#111b20;color:#f2f7f6;padding:16px;border-radius:8px;max-height:540px;overflow:auto}@media(max-width:600px){.entry-meta{margin-left:0;width:100%;padding-left:18px}}</style></head><body><h1>Báo cáo kiểm tra mạng</h1><p>${records.length} kết quả · Chọn một mục để xem chi tiết.</p>${rows}</body></html>`
}

export function downloadReport(records: CheckRecord[]): void {
  const html = renderReportHTML(records)
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  link.download = `it-support-report-${new Date().toISOString().slice(0, 10)}.html`
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
