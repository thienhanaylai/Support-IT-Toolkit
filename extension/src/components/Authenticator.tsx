import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, GripVertical, Plus, ScanLine, Trash2, Upload } from 'lucide-react'
import jsQR from 'jsqr'
import {
  authenticatorRemainingSeconds, generateAuthenticatorCode, loadAuthenticatorEntries,
  parseAuthenticatorText, parseAuthenticatorURI, saveAuthenticatorEntries, type AuthenticatorEntry,
} from '../services/authenticator'

async function imageBlobData(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob)
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

async function imageFileData(file: File): Promise<ImageData> {
  if (!file.type.startsWith('image/')) throw new Error('Hãy chọn một file ảnh QR.')
  if (file.size > 15 * 1024 * 1024) throw new Error('Ảnh QR không được lớn hơn 15 MB.')
  return imageBlobData(file)
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
  const [openingRegionPicker, setOpeningRegionPicker] = useState(false)
  const [copiedId, setCopiedId] = useState('')
  const [draggedId, setDraggedId] = useState('')
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const draggedIdRef = useRef('')
  const dropTargetRef = useRef<{ id: string; position: 'before' | 'after' } | null>(null)
  const pointerDragRef = useRef<{
    pointerId: number
    sourceId: string
    handle: HTMLButtonElement
    ghost: HTMLElement
    offsetX: number
    offsetY: number
    clientY: number
  } | null>(null)
  const autoScrollFrameRef = useRef(0)
  const autoScrollSpeedRef = useRef(0)
  const pointerMoveHandlerRef = useRef<(event: PointerEvent) => void>(() => {})
  const pointerUpHandlerRef = useRef<(event: PointerEvent) => void>(() => {})
  const pointerCancelHandlerRef = useRef<(event: PointerEvent) => void>(() => {})
  const wheelHandlerRef = useRef<(event: WheelEvent) => void>(() => {})

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

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => pointerMoveHandlerRef.current(event)
    const onPointerUp = (event: PointerEvent) => pointerUpHandlerRef.current(event)
    const onPointerCancel = (event: PointerEvent) => pointerCancelHandlerRef.current(event)
    const onWheel = (event: WheelEvent) => wheelHandlerRef.current(event)
    document.addEventListener('pointermove', onPointerMove, { capture: true })
    document.addEventListener('pointerup', onPointerUp, { capture: true })
    document.addEventListener('pointercancel', onPointerCancel, { capture: true })
    document.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => {
      if (autoScrollFrameRef.current) cancelAnimationFrame(autoScrollFrameRef.current)
      document.removeEventListener('pointermove', onPointerMove, { capture: true })
      document.removeEventListener('pointerup', onPointerUp, { capture: true })
      document.removeEventListener('pointercancel', onPointerCancel, { capture: true })
      document.removeEventListener('wheel', onWheel, { capture: true })
    }
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

  async function openQRRegionPicker() {
    if (openingRegionPicker) return
    try {
      setOpeningRegionPicker(true)
      setError('')
      setNotice('Đang mở bộ chọn vùng QR...')
      const response = await chrome.runtime.sendMessage({
        type: 'toolkit:start-auth-qr-region',
      }) as { started?: boolean; error?: string } | undefined
      if (!response?.started) throw new Error(response?.error || 'Không thể mở bộ chọn vùng QR.')
      setNotice('Kéo chuột khoanh vùng toàn bộ mã QR trên tab đang mở.')
      if (document.querySelector('main.popup')) window.close()
    } catch (cause) {
      setNotice('')
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setOpeningRegionPicker(false)
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

  function setPointerDropTarget(next: { id: string; position: 'before' | 'after' } | null) {
    const current = dropTargetRef.current
    if (current?.id === next?.id && current?.position === next?.position) return
    dropTargetRef.current = next
    setDropTarget(next)
  }

  function stopPointerAutoScroll() {
    autoScrollSpeedRef.current = 0
    if (autoScrollFrameRef.current) cancelAnimationFrame(autoScrollFrameRef.current)
    autoScrollFrameRef.current = 0
  }

  function refreshPointerDropTarget(clientY = pointerDragRef.current?.clientY) {
    const drag = pointerDragRef.current
    const list = listRef.current
    if (!drag || !list || clientY === undefined) {
      setPointerDropTarget(null)
      return
    }
    const candidates = [...list.querySelectorAll<HTMLElement>('.auth-card[data-entry-id]')]
      .filter((card) => card.dataset.entryId && card.dataset.entryId !== drag.sourceId)
    if (!candidates.length) {
      setPointerDropTarget(null)
      return
    }
    let closest = candidates[0]
    let closestBounds = closest.getBoundingClientRect()
    let distance = Math.abs(clientY - (closestBounds.top + closestBounds.height / 2))
    for (const card of candidates.slice(1)) {
      const bounds = card.getBoundingClientRect()
      const nextDistance = Math.abs(clientY - (bounds.top + bounds.height / 2))
      if (nextDistance < distance) {
        closest = card
        closestBounds = bounds
        distance = nextDistance
      }
    }
    setPointerDropTarget({
      id: closest.dataset.entryId!,
      position: clientY < closestBounds.top + closestBounds.height / 2 ? 'before' : 'after',
    })
  }

  function pointerAutoScrollFrame() {
    const drag = pointerDragRef.current
    const list = listRef.current
    const speed = autoScrollSpeedRef.current
    if (!drag || !list || !speed) {
      stopPointerAutoScroll()
      return
    }
    list.scrollTop += speed
    refreshPointerDropTarget(drag.clientY)
    autoScrollFrameRef.current = requestAnimationFrame(pointerAutoScrollFrame)
  }

  function updatePointerAutoScroll(clientY: number) {
    const list = listRef.current
    if (!pointerDragRef.current || !list || list.scrollHeight <= list.clientHeight) {
      stopPointerAutoScroll()
      return
    }
    const bounds = list.getBoundingClientRect()
    const edge = Math.min(64, bounds.height / 3)
    let speed = 0
    if (clientY < bounds.top + edge) {
      speed = -Math.max(3, Math.round(18 * Math.min(1, (bounds.top + edge - clientY) / edge)))
    } else if (clientY > bounds.bottom - edge) {
      speed = Math.max(3, Math.round(18 * Math.min(1, (clientY - bounds.bottom + edge) / edge)))
    }
    autoScrollSpeedRef.current = speed
    if (!speed) {
      stopPointerAutoScroll()
    } else if (!autoScrollFrameRef.current) {
      autoScrollFrameRef.current = requestAnimationFrame(pointerAutoScrollFrame)
    }
  }

  function clearDragState() {
    stopPointerAutoScroll()
    const drag = pointerDragRef.current
    if (drag) {
      try {
        if (drag.handle.hasPointerCapture?.(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId)
      } catch { /* Pointer capture may already be released. */ }
      drag.ghost.remove()
    }
    pointerDragRef.current = null
    draggedIdRef.current = ''
    dropTargetRef.current = null
    document.documentElement.classList.remove('auth-is-reordering')
    setDraggedId('')
    setDropTarget(null)
  }

  function startPointerDrag(event: React.PointerEvent<HTMLButtonElement>, entry: AuthenticatorEntry) {
    if (saving || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    clearDragState()
    const card = event.currentTarget.closest<HTMLElement>('.auth-card')
    if (!card) return
    const bounds = card.getBoundingClientRect()
    const ghost = card.cloneNode(true) as HTMLElement
    ghost.className = 'auth-card auth-drag-preview'
    ghost.style.width = `${bounds.width}px`
    document.body.append(ghost)
    pointerDragRef.current = {
      pointerId: event.pointerId,
      sourceId: entry.id,
      handle: event.currentTarget,
      ghost,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
      clientY: event.clientY,
    }
    draggedIdRef.current = entry.id
    setDraggedId(entry.id)
    setPointerDropTarget(null)
    document.documentElement.classList.add('auth-is-reordering')
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch { /* Optional enhancement. */ }
    ghost.style.left = `${event.clientX - pointerDragRef.current.offsetX}px`
    ghost.style.top = `${event.clientY - pointerDragRef.current.offsetY}px`
  }

  function movePointerDrag(event: PointerEvent) {
    const drag = pointerDragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    event.preventDefault()
    drag.clientY = event.clientY
    drag.ghost.style.left = `${event.clientX - drag.offsetX}px`
    drag.ghost.style.top = `${event.clientY - drag.offsetY}px`
    refreshPointerDropTarget(event.clientY)
    updatePointerAutoScroll(event.clientY)
  }

  function finishPointerDrag(event: PointerEvent, commit: boolean) {
    const drag = pointerDragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    event.preventDefault()
    const target = dropTargetRef.current
    const sourceId = drag.sourceId
    clearDragState()
    if (commit && target && target.id !== sourceId) {
      void reorderEntry(sourceId, target.id, target.position)
    }
  }

  function wheelWhileDragging(event: WheelEvent) {
    const drag = pointerDragRef.current
    const list = listRef.current
    if (!drag || !list || list.scrollHeight <= list.clientHeight) return
    event.preventDefault()
    const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 20
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? list.clientHeight : 1
    list.scrollTop += event.deltaY * scale
    refreshPointerDropTarget(drag.clientY)
  }

  pointerMoveHandlerRef.current = movePointerDrag
  pointerUpHandlerRef.current = (event) => finishPointerDrag(event, true)
  pointerCancelHandlerRef.current = (event) => finishPointerDrag(event, false)
  wheelHandlerRef.current = wheelWhileDragging

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
      <div><h1>Authenticator</h1></div>
      <div className="auth-actions">
        <button type="button" onClick={() => { setShowAdd((value) => !value); setError('') }}><Plus size={15} /> Thêm</button>
        <button type="button" title="Kéo chọn vùng chứa mã QR trên tab đang mở"
          disabled={openingRegionPicker} onClick={() => void openQRRegionPicker()}><ScanLine size={15} /> {openingRegionPicker ? 'Đang mở...' : 'Chọn vùng QR'}</button>
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
      filtered.length ? <div ref={listRef} className="auth-list">{filtered.map((entry) => {
        const code = generateAuthenticatorCode(entry, now)
        const remaining = authenticatorRemainingSeconds(entry, now)
        const percent = Math.max(0, Math.min(100, remaining / entry.period * 100))
        const dropPosition = dropTarget?.id === entry.id ? dropTarget.position : ''
        return <article className={`auth-card${copiedId === entry.id ? ' is-copied' : ''}${draggedId === entry.id ? ' is-dragging' : ''}${dropPosition ? ` is-drop-${dropPosition}` : ''}`} key={entry.id}
          data-entry-id={entry.id} title="Bấm vào thẻ để sao chép mã" onClick={() => void copyCode(entry)}>
          <div className="auth-card-title">
            <button type="button" className="auth-drag-handle" title="Giữ và kéo thẻ để thay đổi thứ tự"
              aria-label={`Kéo để sắp xếp ${displayIssuer(entry)}`}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => startPointerDrag(event, entry)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                event.preventDefault()
                event.stopPropagation()
                void moveEntry(entry, event.key === 'ArrowUp' ? -1 : 1)
              }}><GripVertical size={23} /></button>
            <div className="auth-card-identity"><strong>{displayIssuer(entry)}</strong><small>{displayAccount(entry)}</small></div>
            <span className="auth-code-value">{code}</span>
            <button type="button" className="auth-delete" title="Xóa Authenticator" aria-label={`Xóa ${displayIssuer(entry)}`}
              disabled={saving} onClick={(event) => { event.stopPropagation(); void removeEntry(entry) }}><Trash2 size={15} /></button>
          </div>
          <div className="auth-timer" aria-label="Thời gian còn lại của mã"><span style={{ width: `${percent}%` }} /></div>
        </article>
      })}</div> : <p className="auth-empty">Chưa có mã Authenticator. Hãy quét QR hoặc import ảnh QR/file TXT để thêm.</p>}

  </div>
}
