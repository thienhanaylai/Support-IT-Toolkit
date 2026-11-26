import React, { useEffect, useState } from 'react'
import { Check, Clock3, Copy, KeyRound, RefreshCw } from 'lucide-react'
import {
  defaultPasswordOptions, generatePassword, normalizePasswordOptions,
  passwordOptionsKey, passwordRecentKey, validatePasswordOptions, type PasswordOptions,
} from '../services/passwordGenerator'

export function PasswordGenerator({ standalone = false }: { standalone?: boolean }) {
  const [options, setOptions] = useState(defaultPasswordOptions)
  const [lengthText, setLengthText] = useState(String(defaultPasswordOptions.length))
  const [specialCountText, setSpecialCountText] = useState(String(defaultPasswordOptions.specialCount))
  const [password, setPassword] = useState('')
  const [recent, setRecent] = useState<string[]>([])
  const [expanded, setExpanded] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    let mounted = true
    void Promise.all([
      chrome.storage.session.get(passwordRecentKey),
      chrome.storage.local.get(passwordOptionsKey),
    ]).then(([savedRecent, savedOptions]) => {
      const values = savedRecent[passwordRecentKey]
      if (!mounted) return
      if (Array.isArray(values)) setRecent(values.filter((item): item is string => typeof item === 'string').slice(0, 3))
      const restored = normalizePasswordOptions(savedOptions[passwordOptionsKey])
      setOptions(restored)
      setLengthText(String(restored.length))
      setSpecialCountText(String(restored.specialCount))
    }).catch(() => {})
    return () => { mounted = false }
  }, [])

  function update<K extends keyof PasswordOptions>(key: K, value: PasswordOptions[K]) {
    setOptions((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function currentOptions(): PasswordOptions {
    return { ...options, length: Number(lengthText), specialCount: Number(specialCountText) }
  }

  async function saveOptions() {
    try {
      const next = currentOptions()
      validatePasswordOptions(next)
      await chrome.storage.local.set({ [passwordOptionsKey]: next })
      setOptions(next)
      setLengthText(String(next.length))
      setSpecialCountText(String(next.specialCount))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu tùy chọn.')
    }
  }

  function create() {
    try {
      const current = currentOptions()
      const next = generatePassword(current)
      const nextRecent = [next, ...recent.filter((item) => item !== next)].slice(0, 3)
      setOptions(current)
      setPassword(next)
      setRecent(nextRecent)
      setError('')
      setCopied('')
      void chrome.storage.session.set({ [passwordRecentKey]: nextRecent })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo mật khẩu.')
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(value)
    } catch { setError('Không thể sao chép mật khẩu vào clipboard.') }
  }

  return <section className={`password-generator${expanded ? ' is-expanded' : ''}${standalone ? ' password-generator-standalone' : ''}`} aria-labelledby="password-generator-title">
    <div className="password-heading"><span className="tool-icon"><KeyRound size={16} /></span><div className="password-heading-copy"><strong id="password-generator-title">Tạo mật khẩu</strong></div>
      <div className="password-heading-actions"><button type="button" className="password-options-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Thu gọn' : 'Tùy chọn'}</button>
        {recent.length > 0 && <button type="button" className="password-history-toggle" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}><Clock3 size={13} /> {showHistory ? 'Đóng' : `Lịch sử (${recent.length})`}</button>}
        <button type="button" className="password-generate" onClick={create}><RefreshCw size={14} /> {password ? 'Tạo lại' : 'Tạo ngay'}</button></div></div>
    {expanded && <div className="password-options">
      <div className="password-checks">
        <label><input type="checkbox" checked={options.numbers} onChange={(event) => update('numbers', event.target.checked)} /> Số</label>
        <label><input type="checkbox" checked={options.lowercase} onChange={(event) => update('lowercase', event.target.checked)} /> Chữ thường</label>
        <label><input type="checkbox" checked={options.uppercase} onChange={(event) => update('uppercase', event.target.checked)} /> Chữ hoa</label>
        <label><input type="checkbox" checked={options.special} onChange={(event) => update('special', event.target.checked)} /> Ký tự đặc biệt</label>
      </div>
      <label className="password-length">Độ dài <input type="number" inputMode="numeric" min={4} max={128} step={1} value={lengthText} onChange={(event) => { setLengthText(event.target.value); setError('') }} /></label>
      {options.special && <label className="password-special-count">Số ký tự đặc biệt <input type="number" inputMode="numeric" min={1} max={128} step={1} value={specialCountText} onChange={(event) => { setSpecialCountText(event.target.value); setError('') }} /></label>}
      <label className="password-extra"><span><input type="checkbox" checked={options.excludeEnabled} onChange={(event) => update('excludeEnabled', event.target.checked)} /> Loại trừ ký tự</span>{options.excludeEnabled && <input aria-label="Ký tự loại trừ" value={options.excludeChars} onChange={(event) => update('excludeChars', event.target.value)} placeholder="Ví dụ: 0O1Il" />}</label>
      <div className="password-save-row"><button type="button" className="password-save-options" onClick={() => void saveOptions()}><Check size={13} /> Lưu tùy chọn</button></div>
    </div>}
    {error && <p className="password-error" role="alert">{error}</p>}
    {password && <div className="password-result">
      <code aria-label="Mật khẩu vừa tạo">{password}</code>
      <button type="button" className="password-copy-main" title="Sao chép mật khẩu" aria-label="Sao chép mật khẩu" onClick={() => void copy(password)}>{copied === password ? <><Check size={16} /> Đã chép</> : <><Copy size={16} /> Sao chép</>}</button>
    </div>}
    {showHistory && recent.length > 0 && <div className="password-recent"><strong>3 MẬT KHẨU GẦN NHẤT</strong>{recent.map((item, index) => <div key={`${item}-${index}`}><code>{item}</code><button type="button" title="Sao chép" aria-label={`Sao chép mật khẩu gần đây ${index + 1}`} onClick={() => void copy(item)}>{copied === item ? <Check size={15} /> : <Copy size={15} />}</button></div>)}</div>}
  </section>
}
