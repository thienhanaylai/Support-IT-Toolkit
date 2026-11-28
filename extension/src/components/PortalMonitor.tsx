import { BellOff, BellRing, ExternalLink, Minus, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  defaultPortalMonitorSettings,
  defaultPortalMonitorState,
  normalizePortalMonitorSettings,
  normalizePortalMonitorState,
  portalMonitorSettingsKey,
  portalMonitorStateKey,
  type PortalMonitorSettings,
  type PortalMonitorState,
} from "../services/portalMonitor";

type MonitorResponse = {
  settings?: unknown;
  state?: unknown;
  reloaded?: number;
  monitorVersion?: number;
  error?: string;
};

function checkedAt(value: string | undefined): string {
  if (!value) return "Chưa kiểm tra";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Chưa kiểm tra" : date.toLocaleString("vi-VN");
}

export function PortalMonitor() {
  const [settings, setSettings] = useState<PortalMonitorSettings>(defaultPortalMonitorSettings);
  const [state, setState] = useState<PortalMonitorState>(defaultPortalMonitorState);
  const [intervalInput, setIntervalInput] = useState(String(defaultPortalMonitorSettings.intervalSeconds));
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    void chrome.runtime
      .sendMessage({ type: "toolkit:get-monitor" })
      .then((response: MonitorResponse) => {
        if (!mounted) return;
        if (response?.error) throw new Error(response.error);
        if (response?.monitorVersion !== 13) {
          throw new Error("Background chưa được cập nhật. Hãy vào edge://extensions, bấm Reload rồi mở lại extension.");
        }
        const loadedSettings = normalizePortalMonitorSettings(response?.settings);
        setSettings(loadedSettings);
        setIntervalInput(String(loadedSettings.intervalSeconds));
        setState(normalizePortalMonitorState(response?.state));
        setReady(true);
        return chrome.runtime.sendMessage({ type: "toolkit:monitor-mark-read" });
      })
      .then((response: MonitorResponse | undefined) => {
        if (mounted && response?.state) setState(normalizePortalMonitorState(response.state));
      })
      .catch(cause => {
        if (mounted) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setReady(true);
        }
      });
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (!mounted || area !== "local") return;
      if (changes[portalMonitorSettingsKey]) {
        const changedSettings = normalizePortalMonitorSettings(changes[portalMonitorSettingsKey].newValue);
        setSettings(changedSettings);
        setIntervalInput(String(changedSettings.intervalSeconds));
      }
      if (changes[portalMonitorStateKey]) {
        setState(normalizePortalMonitorState(changes[portalMonitorStateKey].newValue));
      }
    };
    chrome.storage.onChanged.addListener(changed);
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(changed);
    };
  }, []);

  function settingsForSave(enabled: boolean): PortalMonitorSettings {
    const entered = Number(intervalInput);
    const intervalSeconds = Math.max(10, Number.isFinite(entered) ? Math.round(entered) : 10);
    setIntervalInput(String(intervalSeconds));
    return { ...settings, enabled, intervalSeconds };
  }

  function adjustInterval(delta: -5 | 5) {
    const entered = Number(intervalInput);
    const current = Number.isFinite(entered) ? Math.max(10, Math.round(entered)) : 10;
    setIntervalInput(String(Math.max(10, current + delta)));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const nextSettings = settingsForSave(settings.ticketEnabled || settings.computingErrorEnabled);
      const response = (await chrome.runtime.sendMessage({
        type: "toolkit:save-monitor",
        settings: nextSettings,
      })) as MonitorResponse;
      if (response?.error) throw new Error(response.error);
      const savedSettings = response?.settings ? normalizePortalMonitorSettings(response.settings) : nextSettings;
      setSettings(savedSettings);
      setIntervalInput(String(savedSettings.intervalSeconds));
      if (response?.state) setState(normalizePortalMonitorState(response.state));
      setMessage(
        savedSettings.enabled
          ? response.reloaded
            ? `Đã lưu và đang tải lại ${response.reloaded} tab Portal để tạo mốc theo dõi.`
            : "Đã lưu nhưng không tìm thấy tab Portal phù hợp đang mở."
          : "Đã tắt theo dõi tự động.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(enabled: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const nextSettings = settingsForSave(enabled);
    setSettings(nextSettings);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "toolkit:save-monitor",
        settings: nextSettings,
      })) as MonitorResponse;
      if (response?.error) throw new Error(response.error);
      if (response?.settings) {
        const savedSettings = normalizePortalMonitorSettings(response.settings);
        setSettings(savedSettings);
        setIntervalInput(String(savedSettings.intervalSeconds));
      }
      setMessage(
        enabled
          ? response.reloaded
            ? `Đã bật theo dõi và tải lại ${response.reloaded} tab Portal.`
            : "Đã bật nhưng không tìm thấy tab Portal phù hợp đang mở."
          : "Đã dừng theo dõi tự động.",
      );
    } catch (cause) {
      setSettings(settings);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function refreshNow() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!settings.ticketEnabled && !settings.computingErrorEnabled) {
        throw new Error("Hãy chọn ít nhất một trang cần theo dõi.");
      }
      const nextSettings = settingsForSave(true);
      const response = (await chrome.runtime.sendMessage({
        type: "toolkit:save-monitor",
        settings: nextSettings,
      })) as MonitorResponse;
      if (response?.error) throw new Error(response.error);
      const savedSettings = response?.settings ? normalizePortalMonitorSettings(response.settings) : nextSettings;
      setSettings(savedSettings);
      setIntervalInput(String(savedSettings.intervalSeconds));
      if (response?.state) setState(normalizePortalMonitorState(response.state));
      setMessage(
        response.reloaded
          ? `Đã bật theo dõi và đang tải lại ${response.reloaded} tab Portal để kiểm tra.`
          : "Đã bật theo dõi nhưng không tìm thấy tab Ticket hoặc Computing lỗi đang mở.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function openPage(type: "ticket" | "computing") {
    void chrome.runtime.sendMessage({
      type: type === "ticket" ? "toolkit:monitor-open-ticket" : "toolkit:monitor-open-computing-error",
    });
  }

  async function toggleSourceNotification(source: "ticket" | "computingError") {
    if (busy) return;
    const settingKey = source === "ticket" ? "ticketNotificationsEnabled" : "computingErrorNotificationsEnabled";
    const enabled = !settings[settingKey];
    const label = source === "ticket" ? "Ticket mới" : "VM lỗi";
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "toolkit:monitor-set-source-notification",
        source,
        enabled,
      })) as MonitorResponse & { notified?: boolean };
      if (response?.error) throw new Error(response.error);
      setSettings(current => ({ ...current, [settingKey]: enabled }));
      setMessage(
        enabled
          ? response?.notified
            ? `Đã bật và gửi thông báo Windows cho ${label} hiện có.`
            : `Đã bật thông báo Windows cho ${label}. Hiện chưa có mục cần báo.`
          : `Đã tắt thông báo Windows cho ${label}.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (busy || !state.recent.length) return;
    setBusy(true);
    setError("");
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "toolkit:monitor-clear-all",
      })) as MonitorResponse;
      if (response?.error) throw new Error(response.error);
      if (response?.state) setState(normalizePortalMonitorState(response.state));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleRecentItem(source: "ticket" | "computingError", id: string, open: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "toolkit:monitor-dismiss-item",
        source,
        id,
        open,
      })) as MonitorResponse;
      if (response?.error) throw new Error(response.error);
      if (response?.state) setState(normalizePortalMonitorState(response.state));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!ready)
    return (
      <div className="main-content monitor-tab">
        <p className="empty">Đang tải thiết lập theo dõi...</p>
      </div>
    );

  return (
    <div className="main-content monitor-tab">
      <section className="monitor-heading">
        <div>
          <h1>Theo dõi Portal</h1>
        </div>
        <label className={`monitor-master-switch${settings.enabled ? " is-enabled" : ""}`}>
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={busy || (!settings.ticketEnabled && !settings.computingErrorEnabled)}
            onChange={event => void toggleEnabled(event.target.checked)}
          />
          <span className="monitor-switch-track" aria-hidden="true" />
          <span className="monitor-switch-label">{settings.enabled ? "Bật" : "Tắt"}</span>
        </label>
      </section>

      <section className="monitor-settings-card" aria-labelledby="monitor-sources-title">
        <div className="section-title" id="monitor-sources-title">
          <span>TRANG CẦN THEO DÕI</span>
        </div>
        <label className={`monitor-source${settings.ticketEnabled ? " is-selected" : ""}`}>
          <input
            type="checkbox"
            checked={settings.ticketEnabled}
            onChange={event => setSettings({ ...settings, ticketEnabled: event.target.checked })}
          />
          <span>
            <strong>Danh sách Ticket</strong>
            <small>
              Tổng {state.totals.ticket} · {checkedAt(state.lastCheckedAt.ticket)}
            </small>
          </span>
          <div className="monitor-source-count is-ticket" aria-label={`${state.activeCounts.ticket} Ticket NEW`}>
            <strong>{state.activeCounts.ticket}</strong>
            <small>NEW</small>
          </div>
          <button
            type="button"
            className={`monitor-source-notify ${settings.ticketNotificationsEnabled ? "is-enabled" : "is-disabled"}`}
            disabled={busy}
            title={`${settings.ticketNotificationsEnabled ? "Tắt" : "Bật"} thông báo Windows cho Ticket mới`}
            aria-label={`${settings.ticketNotificationsEnabled ? "Tắt" : "Bật"} thông báo Windows cho Ticket mới`}
            aria-pressed={settings.ticketNotificationsEnabled}
            onClick={event => {
              event.preventDefault();
              void toggleSourceNotification("ticket");
            }}
          >
            {settings.ticketNotificationsEnabled ? <BellRing size={15} /> : <BellOff size={15} />}
          </button>
          <button
            type="button"
            title="Mở trang Ticket"
            onClick={event => {
              event.preventDefault();
              openPage("ticket");
            }}
          >
            <ExternalLink size={15} />
          </button>
        </label>
        <label className={`monitor-source${settings.computingErrorEnabled ? " is-selected" : ""}`}>
          <input
            type="checkbox"
            checked={settings.computingErrorEnabled}
            onChange={event => setSettings({ ...settings, computingErrorEnabled: event.target.checked })}
          />
          <span>
            <strong>Computing triển khai lỗi</strong>
            <small>{checkedAt(state.lastCheckedAt.computingError)}</small>
          </span>
          <div
            className="monitor-source-count is-computing"
            aria-label={`${state.activeCounts.computingError} Computing triển khai lỗi`}
          >
            <strong>{state.activeCounts.computingError}</strong>
            <small>VM LỖI</small>
          </div>
          <button
            type="button"
            className={`monitor-source-notify ${settings.computingErrorNotificationsEnabled ? "is-enabled" : "is-disabled"}`}
            disabled={busy}
            title={`${settings.computingErrorNotificationsEnabled ? "Tắt" : "Bật"} thông báo Windows cho VM lỗi`}
            aria-label={`${settings.computingErrorNotificationsEnabled ? "Tắt" : "Bật"} thông báo Windows cho VM lỗi`}
            aria-pressed={settings.computingErrorNotificationsEnabled}
            onClick={event => {
              event.preventDefault();
              void toggleSourceNotification("computingError");
            }}
          >
            {settings.computingErrorNotificationsEnabled ? <BellRing size={15} /> : <BellOff size={15} />}
          </button>
          <button
            type="button"
            title="Mở trang Computing triển khai lỗi"
            onClick={event => {
              event.preventDefault();
              openPage("computing");
            }}
          >
            <ExternalLink size={15} />
          </button>
        </label>
        <label className="monitor-interval" htmlFor="monitor-interval">
          <span>
            <strong>Thời gian tự tải lại</strong>
            <small>Áp dụng cho các tab được chọn đang mở</small>
          </span>
          <span className="monitor-interval-control">
            <button
              type="button"
              className="monitor-interval-step"
              disabled={busy}
              onClick={() => adjustInterval(-5)}
              aria-label="Giảm 5 giây"
              title="Giảm 5 giây"
            >
              <Minus size={14} />
            </button>
            <input
              id="monitor-interval"
              type="number"
              step={5}
              value={intervalInput}
              onChange={event => setIntervalInput(event.target.value)}
            />
            <button
              type="button"
              className="monitor-interval-step"
              disabled={busy}
              onClick={() => adjustInterval(5)}
              aria-label="Tăng 5 giây"
              title="Tăng 5 giây"
            >
              <Plus size={14} />
            </button>
            <small>giây</small>
          </span>
        </label>
        <div className="monitor-actions">
          <button type="button" className="monitor-refresh" disabled={busy} onClick={() => void refreshNow()}>
            <RefreshCw size={15} /> Kiểm tra ngay
          </button>
          <button
            type="button"
            className="monitor-save"
            disabled={busy || (settings.enabled && !settings.ticketEnabled && !settings.computingErrorEnabled)}
            onClick={() => void save()}
          >
            <Save size={15} /> Lưu theo dõi
          </button>
        </div>
        {message && (
          <p className="monitor-message" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="monitor-message is-error" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="monitor-recent" aria-labelledby="monitor-recent-title">
        <div className="monitor-recent-heading">
          <div className="section-title" id="monitor-recent-title">
            <span>THÔNG BÁO GẦN ĐÂY</span>
          </div>
          <button
            type="button"
            className="monitor-clear-all"
            disabled={busy || !state.recent.length}
            onClick={() => void clearAll()}
            title="Xóa tất cả thông báo"
          >
            <Trash2 size={13} /> Xóa tất cả
          </button>
        </div>
        {state.recent.length ? (
          state.recent.slice(0, 8).map(item => (
            <div className="monitor-recent-item" key={`${item.source}-${item.id}-${item.at}`}>
              <button
                type="button"
                className="monitor-recent-open"
                disabled={busy}
                onClick={() => void handleRecentItem(item.source, item.id, true)}
                title="Mở trang và xóa thông báo"
              >
                <span className={`monitor-event-dot is-${item.source}`} />
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.source === "ticket" ? "Ticket" : "Computing lỗi"} · {new Date(item.at).toLocaleString("vi-VN")}
                  </small>
                </span>
                <ExternalLink size={14} />
              </button>
              <button
                type="button"
                className="monitor-recent-dismiss"
                disabled={busy}
                onClick={() => void handleRecentItem(item.source, item.id, false)}
                aria-label={`Xóa thông báo ${item.title}`}
                title="Xóa thông báo"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        ) : (
          <p className="empty">
            <BellRing size={16} /> Chưa có mục mới.
          </p>
        )}
      </section>
    </div>
  );
}
