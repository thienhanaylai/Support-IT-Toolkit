import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ChevronDown, ChevronUp, Plus, Trash2, Upload, X } from 'lucide-react'
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
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const scanLocked = useRef(false)

  useEffect(() => {
    let mounted = true
    void loadAuthenticatorEntries()
      .then((saved) => { if (mounted) setEntries(saved) })
      .catch((cause) => { if (mounted) setError(cause instanceof Error ? cause.message : String(cause)) })
      .finally(() => { if (mounted) setLoading(false) })
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { mounted = false; window.clearInterval(timer) }
  }, [])

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

    {error && <p className="auth-message auth-error" role="alert">{error}</p>}
    {notice && !error && <p className="auth-message" role="status">{notice}</p>}

    <div className="auth-search">
      <input type="search" aria-label="Tìm Authenticator" placeholder="Tìm tài khoản..." value={query}
        onChange={(event) => setQuery(event.target.value)} />
    </div>

    {loading ? <p className="auth-empty">Đang mở kho Authenticator...</p> :
      filtered.length ? <div className="auth-list">{filtered.map((entry) => {
        const code = generateAuthenticatorCode(entry, now)
        const remaining = authenticatorRemainingSeconds(entry, now)
        const percent = Math.max(0, Math.min(100, remaining / entry.period * 100))
        const entryIndex = entries.findIndex((item) => item.id === entry.id)
        return <article className={`auth-card${copiedId === entry.id ? ' is-copied' : ''}`} key={entry.id}
          title="Bấm vào thẻ để sao chép mã" onClick={() => void copyCode(entry)}>
          <div className="auth-card-title"><div><strong>{displayIssuer(entry)}</strong><small>{displayAccount(entry)}</small></div>
            <div className="auth-card-actions">
              <button type="button" className="auth-order" title="Đưa lên" aria-label={`Đưa ${displayIssuer(entry)} lên`}
                disabled={saving || entryIndex <= 0}
                onClick={(event) => { event.stopPropagation(); void moveEntry(entry, -1) }}><ChevronUp size={15} /></button>
              <button type="button" className="auth-order" title="Đưa xuống" aria-label={`Đưa ${displayIssuer(entry)} xuống`}
                disabled={saving || entryIndex < 0 || entryIndex >= entries.length - 1}
                onClick={(event) => { event.stopPropagation(); void moveEntry(entry, 1) }}><ChevronDown size={15} /></button>
            <button type="button" className="auth-delete" title="Xóa Authenticator" aria-label={`Xóa ${displayIssuer(entry)}`}
              disabled={saving} onClick={(event) => { event.stopPropagation(); void removeEntry(entry) }}><Trash2 size={15} /></button>
            </div>
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
