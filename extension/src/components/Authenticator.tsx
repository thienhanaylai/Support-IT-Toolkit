import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, CircleAlert, CircleCheck, GripVertical, Plus, Trash2, Upload, X } from 'lucide-react'
import jsQR from 'jsqr'
import {
  authenticatorRemainingSeconds, generateAuthenticatorCode, loadAuthenticatorEntries,
  parseAuthenticatorText, parseAuthenticatorURI, saveAuthenticatorEntries, type AuthenticatorEntry,
} from '../services/authenticator'

async function imageFileData(file: File): Promise<ImageData> {
  if (!file.type.startsWith('image/')) throw new Error('Hãy chọn một file ảnh QR.')
  if (file.size > 15 * 1024 * 1024) throw new Error('Ảnh QR không được lớn hơn 15 MB.')
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Không thể đọc ảnh QR.')
    context.drawImage(bitmap, 0, 0, width, height)
    return context.getImageData(0, 0, width, height)
  } finally {
    bitmap.close()
  }
}

function displayIssuer(entry: AuthenticatorEntry): string {
  return entry.issuer || entry.label.split(':')[0] || 'Authenticator'
}

function displayAccount(entry: AuthenticatorEntry): string {
  const prefix = entry.issuer ? `${entry.issuer}:` : ''
  return prefix && entry.label.startsWith(prefix) ? entry.label.slice(prefix.length).trim() : entry.label
}

export function Authenticator() {
  const [entries, setEntries] = useState<AuthenticatorEntry[]>([])
  const [now, setNow] = useState(Date.now())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [uri, setUri] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraStatus, setCameraStatus] = useState('')
  const [copiedId, setCopiedId] = useState('')
  const [draggedId, setDraggedId] = useState('')
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const scanLocked = useRef(false)
  const draggedIdRef = useRef('')

  useEffect(() => {
    let mounted = true
    void loadAuthenticatorEntries()
      .then((saved) => { if (mounted) setEntries(saved) })
      .catch((cause) => { if (mounted) setError(cause instanceof Error ? cause.message : String(cause)) })
      .finally(() => { if (mounted) setLoading(false) })
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { mounted = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    if (!error && !notice) return
    const timer = window.setTimeout(() => {
      setError('')
      setNotice('')
    }, error ? 4500 : 2400)
    return () => window.clearTimeout(timer)
  }, [error, notice])

  const addURI = useCallback(async (value: string) => {
    const entry = parseAuthenticatorURI(value)
    if (entries.some((saved) => saved.secret === entry.secret &&
      saved.issuer === entry.issuer && saved.label === entry.label)) {
      throw new Error('Tài khoản Authenticator này đã tồn tại.')
    }
    setSaving(true)
    try {
      const next = [...entries, entry]
      await saveAuthenticatorEntries(next)
      setEntries(next)
      setUri('')
      setShowAdd(false)
      setNotice(`Đã thêm ${displayIssuer(entry)}.`)
      setError('')
    } finally {
      setSaving(false)
    }
  }, [entries])

  const addURIs = useCallback(async (value: string) => {
    const imported = parseAuthenticatorText(value)
    const added = imported.filter((entry) => !entries.some((saved) =>
      saved.secret === entry.secret && saved.issuer === entry.issuer && saved.label === entry.label))
    if (!added.length) throw new Error('Các tài khoản Authenticator này đã tồn tại.')
    if (entries.length + added.length > 100) {
      throw new Error('Kho Authenticator chỉ lưu tối đa 100 tài khoản.')
    }
    setSaving(true)
    try {
      const next = [...entries, ...added]
      await saveAuthenticatorEntries(next)
      setEntries(next)
      setUri('')
      setShowAdd(false)
      const skipped = imported.length - added.length
      setNotice(`Đã thêm ${added.length} Authenticator${skipped ? `, bỏ qua ${skipped} tài khoản đã có` : ''}.`)
      setError('')
    } finally {
      setSaving(false)
    }
  }, [entries])

  useEffect(() => {
    if (!cameraOpen) return
    let stopped = false
    let frame = 0
    let stream: MediaStream | undefined
    scanLocked.current = false
    setCameraStatus('Đang xin quyền camera...')
    void navigator.mediaDevices?.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }).then(async (media) => {
      if (stopped) { media.getTracks().forEach((track) => track.stop()); return }
      stream = media
      const video = videoRef.current
      if (!video) return
      video.srcObject = media
      await video.play()
      setCameraStatus('Đưa mã QR vào giữa khung hình.')
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', { willReadFrequently: true })
      const scan = () => {
        if (stopped || !videoRef.current || !context) return
        const current = videoRef.current
        if (current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && current.videoWidth && current.videoHeight) {
          const scale = Math.min(1, 900 / Math.max(current.videoWidth, current.videoHeight))
          canvas.width = Math.max(1, Math.round(current.videoWidth * scale))
          canvas.height = Math.max(1, Math.round(current.videoHeight * scale))
          context.drawImage(current, 0, 0, canvas.width, canvas.height)
          const image = context.getImageData(0, 0, canvas.width, canvas.height)
          const decoded = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })
          if (decoded?.data && !scanLocked.current) {
            scanLocked.current = true
            void addURI(decoded.data).then(() => setCameraOpen(false)).catch((cause) => {
              setError(cause instanceof Error ? cause.message : String(cause))
              setCameraStatus('QR không phải mã TOTP hợp lệ. Hãy thử mã khác.')
              scanLocked.current = false
            })
          }
        }
        frame = requestAnimationFrame(scan)
      }
      frame = requestAnimationFrame(scan)
    }).catch((cause) => {
      setCameraStatus('')
      setError(cause instanceof Error && cause.name === 'NotAllowedError'
        ? 'Bạn chưa cho phép extension sử dụng camera.'
        : 'Không thể mở camera. Hãy dùng Import ảnh QR.')
    })
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [cameraOpen, addURI])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('vi-VN')
    if (!needle) return entries
    return entries.filter((entry) =>
      `${entry.issuer} ${entry.label}`.toLocaleLowerCase('vi-VN').includes(needle))
  }, [entries, query])

  async function submitURI(event: React.FormEvent) {
    event.preventDefault()
    try {
      await addURIs(uri)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setSaving(true)
      setError('')
      const isText = file.type === 'text/plain' || /\.txt$/i.test(file.name)
      if (isText) {
        if (file.size > 1024 * 1024) throw new Error('File TXT không được lớn hơn 1 MB.')
        const imported = parseAuthenticatorText(await file.text())
        const added = imported.filter((entry) => !entries.some((saved) =>
          saved.secret === entry.secret && saved.issuer === entry.issuer && saved.label === entry.label))
        if (!added.length) throw new Error('Các tài khoản trong file TXT đã tồn tại.')
        if (entries.length + added.length > 100) {
          throw new Error('Kho Authenticator chỉ lưu tối đa 100 tài khoản.')
        }
        const next = [...entries, ...added]
        await saveAuthenticatorEntries(next)
        setEntries(next)
        const skipped = imported.length - added.length
        setNotice(`Đã import ${added.length} tài khoản từ TXT${skipped ? `, bỏ qua ${skipped} tài khoản đã có` : ''}.`)
        setShowAdd(false)
        setError('')
      } else {
        const image = await imageFileData(file)
        const decoded = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })
        if (!decoded?.data) throw new Error('Không tìm thấy mã QR trong ảnh.')
        await addURI(decoded.data)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  async function removeEntry(entry: AuthenticatorEntry) {
    if (!window.confirm(`Xóa Authenticator "${displayIssuer(entry)}"?`)) return
    try {
      setSaving(true)
      const next = entries.filter((item) => item.id !== entry.id)
      await saveAuthenticatorEntries(next)
      setEntries(next)
      setNotice('Đã xóa Authenticator.')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  async function moveEntry(entry: AuthenticatorEntry, direction: -1 | 1) {
    if (saving) return
    const index = entries.findIndex((item) => item.id === entry.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= entries.length) return
    try {
      setSaving(true)
      const next = [...entries]
      ;[next[index], next[target]] = [next[target], next[index]]
      await saveAuthenticatorEntries(next)
      setEntries(next)
      setNotice('Đã cập nhật thứ tự Authenticator.')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  function clearDragState() {
    draggedIdRef.current = ''
    setDraggedId('')
    setDropTarget(null)
  }

  async function reorderEntry(sourceId: string, targetId: string, position: 'before' | 'after') {
    if (saving || sourceId === targetId) return
    const sourceIndex = entries.findIndex((item) => item.id === sourceId)
    if (sourceIndex < 0 || !entries.some((item) => item.id === targetId)) return
    const next = [...entries]
    const [source] = next.splice(sourceIndex, 1)
    const targetIndex = next.findIndex((item) => item.id === targetId)
    next.splice(targetIndex + (position === 'after' ? 1 : 0), 0, source)
    if (next.every((item, index) => item.id === entries[index]?.id)) return
    try {
      setSaving(true)
      await saveAuthenticatorEntries(next)
      setEntries(next)
      setNotice('Đã cập nhật thứ tự Authenticator.')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  function dragOverEntry(event: React.DragEvent<HTMLElement>, targetId: string) {
    const sourceId = draggedIdRef.current
    if (!sourceId || sourceId === targetId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const bounds = event.currentTarget.getBoundingClientRect()
    const position = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
    setDropTarget((current) => current?.id === targetId && current.position === position
      ? current : { id: targetId, position })
  }

  async function copyCode(entry: AuthenticatorEntry) {
    try {
      const code = generateAuthenticatorCode(entry)
      await navigator.clipboard.writeText(code)
      setCopiedId(entry.id)
      setNotice(`Đã sao chép mã ${displayIssuer(entry)}.`)
      window.setTimeout(() => setCopiedId((current) => current === entry.id ? '' : current), 1200)
    } catch {
      setError('Không thể sao chép mã. Hãy thử lại.')
    }
  }

  return <div className="auth-content">
    <section className="auth-heading">
      <div><h1>Authenticator</h1><p>Mã TOTP được lưu mã hóa trên thiết bị.</p></div>
      <div className="auth-actions">
        <button type="button" onClick={() => { setShowAdd((value) => !value); setError('') }}><Plus size={15} /> Thêm</button>
        <button type="button" onClick={() => { setCameraOpen(true); setError(''); setNotice('') }}><Camera size={15} /> Quét QR</button>
        <button type="button" title="Import ảnh QR hoặc file TXT chứa liên kết otpauth"
          onClick={() => fileRef.current?.click()}><Upload size={15} /> Import</button>
        <input ref={fileRef} className="auth-file-input" type="file" accept="image/*,.txt,text/plain"
          onChange={(event) => void importFile(event)} />
      </div>
    </section>

    {showAdd && <form className="auth-add-form" onSubmit={(event) => void submitURI(event)}>
      <label htmlFor="auth-uri">Liên kết otpauth · mỗi dòng một mã</label>
      <textarea id="auth-uri" rows={4} autoComplete="off" spellCheck={false}
        placeholder={'otpauth://totp/...\notpauth://totp/...'} value={uri}
        onChange={(event) => { setUri(event.target.value); setError('') }} />
      <div>
        <button type="submit" disabled={saving || !uri.trim()}>Thêm tất cả</button>
        <button type="button" disabled={saving} onClick={() => { setShowAdd(false); setUri('') }}>Hủy</button>
      </div>
    </form>}

    {(error || notice) && <div className={`auth-toast${error ? ' auth-error' : ''}`}
      role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'}>
      {error ? <CircleAlert size={16} /> : <CircleCheck size={16} />}
      <span>{error || notice}</span>
    </div>}

    <div className="auth-search">
      <input type="search" aria-label="Tìm Authenticator" placeholder="Tìm tài khoản..." value={query}
        onChange={(event) => setQuery(event.target.value)} />
    </div>

    {loading ? <p className="auth-empty">Đang mở kho Authenticator...</p> :
      filtered.length ? <div className="auth-list">{filtered.map((entry) => {
        const code = generateAuthenticatorCode(entry, now)
        const remaining = authenticatorRemainingSeconds(entry, now)
        const percent = Math.max(0, Math.min(100, remaining / entry.period * 100))
        const dropPosition = dropTarget?.id === entry.id ? dropTarget.position : ''
        return <article className={`auth-card${copiedId === entry.id ? ' is-copied' : ''}${draggedId === entry.id ? ' is-dragging' : ''}${dropPosition ? ` is-drop-${dropPosition}` : ''}`} key={entry.id}
          title="Bấm vào thẻ để sao chép mã" onClick={() => void copyCode(entry)}
          onDragOver={(event) => dragOverEntry(event, entry.id)}
          onDrop={(event) => {
            event.preventDefault()
            const sourceId = draggedIdRef.current
            const position = dropTarget?.id === entry.id ? dropTarget.position : 'before'
            clearDragState()
            if (sourceId) void reorderEntry(sourceId, entry.id, position)
          }}>
          <div className="auth-card-title">
            <button type="button" className="auth-drag-handle" title="Giữ và kéo thẻ để thay đổi thứ tự"
              aria-label={`Kéo để sắp xếp ${displayIssuer(entry)}`} draggable={!saving}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                event.preventDefault()
                event.stopPropagation()
                void moveEntry(entry, event.key === 'ArrowUp' ? -1 : 1)
              }}
              onDragStart={(event) => {
                event.stopPropagation()
                draggedIdRef.current = entry.id
                setDraggedId(entry.id)
                setDropTarget(null)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', entry.id)
                const card = event.currentTarget.closest<HTMLElement>('.auth-card')
                if (card) event.dataTransfer.setDragImage(card, 18, 18)
              }}
              onDragEnd={clearDragState}><GripVertical size={17} /></button>
            <div className="auth-card-identity"><strong>{displayIssuer(entry)}</strong><small>{displayAccount(entry)}</small></div>
            <button type="button" className="auth-delete" title="Xóa Authenticator" aria-label={`Xóa ${displayIssuer(entry)}`}
              disabled={saving} onClick={(event) => { event.stopPropagation(); void removeEntry(entry) }}><Trash2 size={15} /></button>
          </div>
          <div className="auth-code-row">
            <span className="auth-code-value">{code}</span>
          </div>
          <div className="auth-timer" aria-label="Thời gian còn lại của mã"><span style={{ width: `${percent}%` }} /></div>
        </article>
      })}</div> : <p className="auth-empty">Chưa có mã Authenticator. Hãy quét QR hoặc import ảnh QR/file TXT để thêm.</p>}

    {cameraOpen && <div className="auth-camera-backdrop" role="dialog" aria-modal="true" aria-label="Quét mã QR">
      <div className="auth-camera">
        <div><strong>Quét mã QR Authenticator</strong><button type="button" aria-label="Đóng camera" onClick={() => setCameraOpen(false)}><X size={18} /></button></div>
        <video ref={videoRef} muted playsInline />
        <p>{cameraStatus}</p>
      </div>
    </div>}
  </div>
}
