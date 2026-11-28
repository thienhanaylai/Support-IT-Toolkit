import { BellOff, BellRing, ExternalLink, Minus, Pin, PinOff, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  defaultPortalMonitorSettings,
  defaultPortalMonitorState,
  normalizePortalMonitorSettings,
  normalizePortalMonitorState,
  portalMonitorSourceCountdownSeconds,
  portalMonitorSettingsKey,
  portalMonitorStateKey,
  type PortalMonitorSettings,
  type PortalMonitorState,
} from "../services/portalMonitor";

type MonitorResponse = {
  settings?: unknown;
  state?: unknown;
  reloaded?: number;
  opened?: number;
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
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [countdownStartedAt, setCountdownStartedAt] = useState<Partial<Record<"ticket" | "computingError", number>>>({});

  useEffect(() => {
    let mounted = true;
    void chrome.runtime
      .sendMessage({ type: "toolkit:get-monitor" })
      .then((response: MonitorResponse) => {
        if (!mounted) return;
        if (response?.error) throw new Error(response.error);
        if (response?.monitorVersion !== 14) {
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

  useEffect(() => {
    if (!ready || !settings.enabled) return;
    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ready, settings.enabled]);

  function settingsForSave(enabled: boolean): PortalMonitorSettings {
    const entered = Number(intervalInput);
    const intervalSeconds = Math.max(10, Number.isFinite(entered) ? Math.round(entered) : 10);
    setIntervalInput(String(intervalSeconds));
    return enabled
      ? { ...settings, enabled, intervalSeconds }
      : {
          ...settings,
          enabled: false,
          ticketEnabled: false,
          computingErrorEnabled: false,
          intervalSeconds,
        };
  }

  function startCountdownForSettings(
    next: PortalMonitorSettings,
    sources: Array<"ticket" | "computingError"> = ["ticket", "computingError"],
  ) {
    const now = Date.now();
    setCountdownStartedAt(current => {
      const anchors = { ...current };
      for (const source of sources) {
        const sourceEnabled = source === "ticket" ? next.ticketEnabled : next.computingErrorEnabled;
        const tabId = source === "ticket" ? next.ticketTabId : next.computingErrorTabId;
        if (next.enabled && sourceEnabled && tabId !== undefined) anchors[source] = now;
      }
      return anchors;
    });
  }

  function clearCountdown(source?: "ticket" | "computingError") {
    if (!source) {
      setCountdownStartedAt({});
      return;
    }
    setCountdownStartedAt(current => {
      const next = { ...current };
      delete next[source];
      return next;
    });
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
        openMissingTabs: true,
      })) as MonitorResponse;
      if (response?.error) throw new Error(response.error);
      const savedSettings = response?.settings ? normalizePortalMonitorSettings(response.settings) : nextSettings;
      setSettings(savedSettings);
      setIntervalInput(String(savedSettings.intervalSeconds));
      if (response?.state) setState(normalizePortalMonitorState(response.state));
      if (savedSettings.enabled && (response.reloaded || response.opened)) {
        startCountdownForSettings(savedSettings);
      } else if (!savedSettings.enabled) clearCountdown();
      setMessage(
        savedSettings.enabled
          ? response.opened
            ? `Đã mở ${response.opened} tab Portal được chọn để bắt đầu theo dõi.`
            : response.reloaded
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
    if (
      enabled &&
      !(
        (settings.ticketEnabled && settings.ticketTabId !== undefined) ||
        (settings.computingErrorEnabled && settings.computingErrorTabId !== undefined)
      )
    ) {
      setMessage("");
      setError("Hãy chọn tab theo dõi trước khi bật.");
      return;
    }
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
      const savedSettings = response?.settings ? normalizePortalMonitorSettings(response.settings) : nextSettings;
      setSettings(savedSettings);
      setIntervalInput(String(savedSettings.intervalSeconds));
      if (savedSettings.enabled && (response.reloaded || response.opened)) {
        startCountdownForSettings(savedSettings);
      } else if (!savedSettings.enabled) clearCountdown();
      setMessage(
        savedSettings.enabled
          ? response.reloaded
            ? `Đã bật theo dõi và tải lại ${response.reloaded} tab Portal.`
            : "Đã bật nhưng không tìm thấy tab Portal phù hợp đang mở."
          : enabled
            ? "Chưa thể bật: hãy ghim ít nhất một tab theo dõi đang mở."
            : "Đã dừng theo dõi tự động.",
      );
    } catch (cause) {
      setSettings(settings);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function toggleSource(source: "ticket" | "computingError", checked: boolean) {
    if (busy) return;
    const sourceKey = source === "ticket" ? "ticketEnabled" : "computingErrorEnabled";
    const otherEnabled = source === "ticket" ? settings.computingErrorEnabled : settings.ticketEnabled;
    const nextSettings: PortalMonitorSettings = {
      ...settings,
      [sourceKey]: checked,
      enabled: checked || otherEnabled,
    };
    setBusy(true);
    setError("");
    setMessage("");
    setSettings(nextSettings);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "toolkit:save-monitor",
        settings: nextSettings,
        openMissingTabs: checked,
      })) as MonitorResponse;
      if (response?.error) throw new Error(response.error);
      const savedSettings = response?.settings ? normalizePortalMonitorSettings(response.settings) : nextSettings;
      setSettings(savedSettings);
      if (savedSettings.enabled && (response.reloaded || response.opened)) {
        startCountdownForSettings(savedSettings, [source]);
      } else if (!savedSettings.enabled) clearCountdown();
      else if (!checked) clearCountdown(source);
      const label = source === "ticket" ? "Ticket" : "Computing lỗi";
      setMessage(
        checked
          ? response.opened
            ? `Đã chọn ${label}, bật theo dõi và mở tab chuyên dụng.`
            : response.reloaded
              ? `Đã chọn ${label}, bật theo dõi và tải lại tab đã ghim.`
              : `Đã chọn ${label} và bật theo dõi. Hãy ghim tab để bắt đầu tự tải lại.`
          : savedSettings.enabled
            ? `Đã bỏ chọn ${label}.`
            : "Đã bỏ chọn tất cả trang và tắt theo dõi.",
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
        openMissingTabs: true,
      })) as MonitorResponse;
      if (response?.error) throw new Error(response.error);
      const savedSettings = response?.settings ? normalizePortalMonitorSettings(response.settings) : nextSettings;
      setSettings(savedSettings);
      setIntervalInput(String(savedSettings.intervalSeconds));
      if (response?.state) setState(normalizePortalMonitorState(response.state));
      if (response.reloaded || response.opened) startCountdownForSettings(savedSettings);
      setMessage(
        response.opened
          ? `Đã mở ${response.opened} tab Portal được chọn để kiểm tra.`
          : response.reloaded
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

  async function toggleMonitorTab(source: "ticket" | "computingError") {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const selectedTabId = source === "ticket" ? settings.ticketTabId : settings.computingErrorTabId;
      if (selectedTabId !== undefined) {
        const response = (await chrome.runtime.sendMessage({
          type: "toolkit:monitor-clear-tab",
          source,
        })) as MonitorResponse;
        if (response?.error) throw new Error(response.error);
        if (!response?.settings) throw new Error("Không thể gỡ tab theo dõi.");
        const next = normalizePortalMonitorSettings(response.settings);
        setSettings(next);
        if (!next.enabled) clearCountdown();
        else clearCountdown(source);
        setMessage(source === "ticket" ? "Đã gỡ tab theo dõi Ticket." : "Đã gỡ tab theo dõi Computing lỗi.");
        return;
      }
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) throw new Error("Không tìm thấy tab hiện tại.");
      const response = (await chrome.runtime.sendMessage({
        type: "toolkit:monitor-select-tab",
        source,
        tabId: tab.id,
      })) as MonitorResponse;
      if (response?.error) throw new Error(response.error);
      if (!response?.settings) throw new Error("Không thể lưu tab theo dõi.");
      const next = normalizePortalMonitorSettings(response.settings);
      setSettings(next);
      if (next.enabled) startCountdownForSettings(next, [source]);
      setMessage(
        source === "ticket"
          ? `Đã chọn tab hiện tại (#${tab.id}) để theo dõi Ticket.`
          : `Đã chọn tab hiện tại (#${tab.id}) để theo dõi Computing lỗi.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
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

  const ticketCountdownSeconds = portalMonitorSourceCountdownSeconds(
    settings,
    state,
    "ticket",
    clockNow,
    countdownStartedAt.ticket,
  );
  const computingCountdownSeconds = portalMonitorSourceCountdownSeconds(
    settings,
    state,
    "computingError",
    clockNow,
    countdownStartedAt.computingError,
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
            disabled={busy}
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
            disabled={busy}
            onChange={event => void toggleSource("ticket", event.target.checked)}
          />
          <span>
            <strong>Danh sách Ticket</strong>
            <small>
              Tổng {state.totals.ticket} · {checkedAt(state.lastCheckedAt.ticket)}
              {" · "}
              {settings.ticketTabId ? `Tab #${settings.ticketTabId}` : "Chưa ghim tab"}
            </small>
            <small className="monitor-source-countdown" role="timer">
              {!settings.enabled || !settings.ticketEnabled ? (
                "Đếm ngược đang tắt"
              ) : settings.ticketTabId === undefined ? (
                "Đang chờ tab Ticket"
              ) : ticketCountdownSeconds === null ? (
                "Đang khởi tạo bộ đếm"
              ) : (
                <>
                  Tải lại sau: <b>{ticketCountdownSeconds}</b> giây
                </>
              )}
            </small>
          </span>
          <div className="monitor-source-count is-ticket" aria-label={`${state.activeCounts.ticket} Ticket NEW`}>
            <strong>{state.activeCounts.ticket}</strong>
            <small>NEW</small>
          </div>
          <button
            type="button"
            className={`monitor-source-tab${settings.ticketTabId ? " is-selected" : ""}`}
            disabled={busy}
            title={settings.ticketTabId ? "Gỡ tab theo dõi Ticket" : "Dùng tab hiện tại để theo dõi Ticket"}
            aria-label={settings.ticketTabId ? "Gỡ tab theo dõi Ticket" : "Dùng tab hiện tại để theo dõi Ticket"}
            aria-pressed={settings.ticketTabId !== undefined}
            onClick={event => {
              event.preventDefault();
              void toggleMonitorTab("ticket");
            }}
          >
            {settings.ticketTabId ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
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
            disabled={busy}
            onChange={event => void toggleSource("computingError", event.target.checked)}
          />
          <span>
            <strong>Computing triển khai lỗi</strong>
            <small>
              {checkedAt(state.lastCheckedAt.computingError)}
              {" · "}
              {settings.computingErrorTabId ? `Tab #${settings.computingErrorTabId}` : "Chưa ghim tab"}
            </small>
            <small className="monitor-source-countdown" role="timer">
              {!settings.enabled || !settings.computingErrorEnabled ? (
                "Đếm ngược đang tắt"
              ) : settings.computingErrorTabId === undefined ? (
                "Đang chờ tab Computing"
              ) : computingCountdownSeconds === null ? (
                "Đang khởi tạo bộ đếm"
              ) : (
                <>
                  Tải lại sau: <b>{computingCountdownSeconds}</b> giây
                </>
              )}
            </small>
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
            className={`monitor-source-tab${settings.computingErrorTabId ? " is-selected" : ""}`}
            disabled={busy}
            title={settings.computingErrorTabId ? "Gỡ tab theo dõi Computing lỗi" : "Dùng tab hiện tại để theo dõi Computing lỗi"}
            aria-label={
              settings.computingErrorTabId ? "Gỡ tab theo dõi Computing lỗi" : "Dùng tab hiện tại để theo dõi Computing lỗi"
            }
            aria-pressed={settings.computingErrorTabId !== undefined}
            onClick={event => {
              event.preventDefault();
              void toggleMonitorTab("computingError");
            }}
          >
            {settings.computingErrorTabId ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
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
          <p className="empty">Không có thông báo mới</p>
        )}
      </section>
    </div>
  );
}
