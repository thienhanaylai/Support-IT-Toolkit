import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Clock3,
  Download,
  History,
  KeyRound,
  MessageSquareText,
  Moon,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sun,
  Tags,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { Header } from "../components/Header";
import { HistoryItem } from "../components/HistoryItem";
import { Result } from "../components/Result";
import { downloadAuthenticatorExport, loadAuthenticatorEntries } from "../services/authenticator";
import { hasPortalAccess, removePortalAccess, requestPortalAccess } from "../services/portalAccess";
import { downloadReport } from "../services/report";
import {
  createMessageTemplate,
  loadMessageTemplates,
  messageTemplatesStorageKey,
  saveMessageTemplates,
  type MessageTemplate,
} from "../services/messageTemplates";
import {
  applyTheme,
  defaultSettings,
  getHistory,
  getSettings,
  type CheckRecord,
  type Settings,
  type Theme,
} from "../services/storage";
import {
  createTagElementGroup,
  createTagElementMember,
  formatTagElement,
  loadTagElementGroups,
  parseTagElementText,
  saveTagElementGroups,
  serializeTagElementGroups,
  tagElementsStorageKey,
  type TagElementGroup,
} from "../services/tagElements";
import { safeTimeout } from "../services/validation";
import "../style.css";

type OptionsTab =
  | "preferences"
  | "tag-elements"
  | "message-templates"
  | "authenticator-backup"
  | "portal-access"
  | "history";

const optionsTabs: Array<{ id: OptionsTab; label: string }> = [
  { id: "preferences", label: "Tùy chọn" },
  { id: "tag-elements", label: "Tag Element" },
  { id: "message-templates", label: "Template tin nhắn" },
  { id: "authenticator-backup", label: "Authenticator" },
  { id: "portal-access", label: "Quyền Portal" },
  { id: "history", label: "Lịch sử" },
];

function initialOptionsTab(): OptionsTab {
  const value = location.hash.slice(1);
  return optionsTabs.some(tab => tab.id === value) ? (value as OptionsTab) : "preferences";
}

function App() {
  const [activeOptionsTab, setActiveOptionsTab] = useState<OptionsTab>(initialOptionsTab);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [history, setHistory] = useState<CheckRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [portalAccess, setPortalAccess] = useState<boolean | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [authExporting, setAuthExporting] = useState(false);
  const [authExportStatus, setAuthExportStatus] = useState("");
  const [authExportError, setAuthExportError] = useState("");
  const [tagGroups, setTagGroups] = useState<TagElementGroup[]>([]);
  const [tagImport, setTagImport] = useState("");
  const [tagSaved, setTagSaved] = useState(false);
  const [tagError, setTagError] = useState("");
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]);
  const [messageTemplateDraft, setMessageTemplateDraft] = useState<MessageTemplate | null>(null);
  const [templatesSaved, setTemplatesSaved] = useState(false);
  const [templatesError, setTemplatesError] = useState("");
  const filtered = history.filter(item =>
    `${item.tool} ${item.target} ${item.source}`.toLocaleLowerCase("vi-VN").includes(query.trim().toLocaleLowerCase("vi-VN")),
  );
  const selected = filtered.find(item => item.id === selectedId);

  useEffect(() => {
    let mounted = true;
    void getSettings()
      .then(value => {
        if (!mounted) return;
        setSettings(value);
        applyTheme(value.theme);
      })
      .catch(() => {
        if (mounted) setSaveError("Không thể tải cài đặt. Hãy mở lại trang và thử lần nữa.");
      });
    void getHistory()
      .then(items => {
        if (mounted) setHistory(items);
      })
      .catch(() => {
        if (mounted) setHistoryError("Không thể tải lịch sử. Hãy mở lại trang và thử lần nữa.");
      })
      .finally(() => {
        if (mounted) setHistoryLoading(false);
      });
    void hasPortalAccess()
      .then(allowed => {
        if (mounted) setPortalAccess(allowed);
      })
      .catch(() => {
        if (mounted) setPortalAccess(false);
      });
    void loadTagElementGroups()
      .then(groups => {
        if (!mounted) return;
        setTagGroups(groups);
        setTagImport(serializeTagElementGroups(groups));
      })
      .catch(() => {
        if (mounted) setTagError("Không thể tải danh sách Tag Element.");
      });
    void loadMessageTemplates()
      .then(templates => {
        if (mounted) setMessageTemplates(templates);
      })
      .catch(() => {
        if (mounted) setTemplatesError("Không thể tải danh sách template tin nhắn.");
      });
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes.history && mounted) {
        setHistory((changes.history.newValue as CheckRecord[] | undefined) ?? []);
        setHistoryError("");
      }
      if (area === "local" && changes[tagElementsStorageKey] && mounted) {
        const groups = changes[tagElementsStorageKey].newValue;
        if (Array.isArray(groups)) setTagGroups(groups as TagElementGroup[]);
      }
      if (area === "local" && changes[messageTemplatesStorageKey] && mounted) {
        const templates = changes[messageTemplatesStorageKey].newValue;
        if (Array.isArray(templates)) setMessageTemplates(templates as MessageTemplate[]);
      }
      if (area === "local" && changes.settings && mounted) {
        void getSettings().then(value => {
          if (!mounted) return;
          setSettings(value);
          applyTheme(value.theme);
        });
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = { ...settings, timeoutMs: safeTimeout(settings.timeoutMs) };
    try {
      await chrome.storage.local.set({ settings: next });
      setSettings(next);
      applyTheme(next.theme);
      setSaved(true);
      setSaveError("");
    } catch {
      setSaved(false);
      setSaveError("Không thể lưu cài đặt. Hãy thử lại.");
    }
  }

  async function clearHistory() {
    if (!window.confirm(`Xóa toàn bộ ${history.length} mục lịch sử trên thiết bị này?`)) return;
    try {
      await chrome.storage.local.remove("history");
      setHistory([]);
      setSelectedId(null);
      setHistoryError("");
    } catch {
      setHistoryError("Không thể xóa lịch sử. Hãy thử lại.");
    }
  }

  async function changePortalAccess(enabled: boolean) {
    if (portalBusy) return;
    setPortalBusy(true);
    setPortalError("");
    try {
      const changed = enabled ? await requestPortalAccess() : await removePortalAccess();
      const allowed = await hasPortalAccess();
      setPortalAccess(allowed);
      if (enabled && (!changed || !allowed)) setPortalError("Quyền Portal chưa được cấp.");
      if (!enabled && allowed) setPortalError("Không thể thu hồi quyền Portal.");
    } catch {
      setPortalError(enabled ? "Không thể cấp quyền Portal." : "Không thể thu hồi quyền Portal.");
    } finally {
      setPortalBusy(false);
    }
  }

  async function exportAuthenticators() {
    if (authExporting) return;
    setAuthExporting(true);
    setAuthExportStatus("");
    setAuthExportError("");
    try {
      const entries = await loadAuthenticatorEntries();
      if (!entries.length) {
        setAuthExportError("Chưa có tài khoản Authenticator để xuất.");
        return;
      }
      const confirmed = window.confirm(
        `Xuất ${entries.length} tài khoản Authenticator?\n\nFile TXT sẽ chứa secret TOTP dạng đọc được. Bất kỳ ai có file đều có thể tạo mã đăng nhập. Hãy lưu file ở nơi an toàn và xóa khi không còn cần.`,
      );
      if (!confirmed) return;
      downloadAuthenticatorExport(entries);
      setAuthExportStatus(`Đã xuất ${entries.length} tài khoản Authenticator.`);
    } catch (cause) {
      setAuthExportError(cause instanceof Error ? cause.message : "Không thể xuất Authenticator.");
    } finally {
      setAuthExporting(false);
    }
  }

  function selectOptionsTab(tab: OptionsTab) {
    setActiveOptionsTab(tab);
    window.history.replaceState(null, "", `#${tab}`);
  }

  function selectTheme(theme: Theme) {
    setSaved(false);
    setSettings(current => ({ ...current, theme }));
    applyTheme(theme);
  }

  function updateTagGroup(groupId: string, change: (group: TagElementGroup) => TagElementGroup) {
    setTagGroups(groups => groups.map(group => (group.id === groupId ? change(group) : group)));
    setTagSaved(false);
    setTagError("");
  }

  function importTags() {
    try {
      const groups = parseTagElementText(tagImport);
      setTagGroups(groups);
      setTagSaved(false);
      setTagError("");
    } catch (cause) {
      setTagError(cause instanceof Error ? cause.message : "Danh sách Tag Element không hợp lệ.");
    }
  }

  async function saveTags() {
    const clean = tagGroups.map(group => ({
      ...group,
      name: group.name.trim(),
      members: group.members.map(member => ({
        ...member,
        name: member.name.trim(),
        elementId: member.elementId.trim(),
      })),
    }));
    if (!clean.length) {
      setTagError("Cần có ít nhất một lĩnh vực.");
      return;
    }
    const invalidGroup = clean.find(group => !group.name);
    if (invalidGroup) {
      setTagError("Tên lĩnh vực không được để trống.");
      return;
    }
    const invalidMember = clean
      .flatMap(group => group.members)
      .find(member => !member.name || !/^@[^\s:[\]]+:[^\s[\]]+$/.test(member.elementId));
    if (invalidMember) {
      setTagError("Tên thành viên và Element ID dạng @id:example.com là bắt buộc.");
      return;
    }
    try {
      await saveTagElementGroups(clean);
      setTagGroups(clean);
      setTagImport(serializeTagElementGroups(clean));
      setTagSaved(true);
      setTagError("");
    } catch {
      setTagSaved(false);
      setTagError("Không thể lưu danh sách Tag Element.");
    }
  }

  function updateMessageTemplate(change: Partial<Pick<MessageTemplate, "name" | "content">>) {
    setMessageTemplateDraft(template => (template ? { ...template, ...change } : template));
    setTemplatesSaved(false);
    setTemplatesError("");
  }

  function addTagGroupToTemplate(
    group: TagElementGroup,
    button: HTMLButtonElement,
  ) {
    const template = messageTemplateDraft;
    if (!template) return;
    const tagText = group.members
      .map(member => member.name.trim() && member.elementId.trim() ? formatTagElement(member) : "")
      .filter(Boolean)
      .join("\n");
    if (!tagText) return;
    updateMessageTemplate({
      content: [template.content.trim(), tagText].filter(Boolean).join("\n\n"),
    });
    button.classList.remove("is-added");
    void button.offsetWidth;
    button.classList.add("is-added");
    window.setTimeout(() => button.classList.remove("is-added"), 700);
  }

  async function saveTemplates() {
    if (!messageTemplateDraft) return;
    try {
      const next = messageTemplates.some(template => template.id === messageTemplateDraft.id)
        ? messageTemplates.map(template =>
            template.id === messageTemplateDraft.id ? messageTemplateDraft : template)
        : [...messageTemplates, messageTemplateDraft];
      const savedTemplates = await saveMessageTemplates(next);
      setMessageTemplates(savedTemplates);
      setMessageTemplateDraft(null);
      setTemplatesSaved(true);
      setTemplatesError("");
    } catch (cause) {
      setTemplatesSaved(false);
      setTemplatesError(cause instanceof Error ? cause.message : "Không thể lưu template tin nhắn.");
    }
  }

  async function removeMessageTemplate(template: MessageTemplate) {
    if (!window.confirm(`Xóa template "${template.name}"?`)) return;
    const next = messageTemplates.filter(item => item.id !== template.id);
    try {
      const savedTemplates = await saveMessageTemplates(next);
      setMessageTemplates(savedTemplates);
      if (messageTemplateDraft?.id === template.id) setMessageTemplateDraft(null);
      setTemplatesSaved(true);
      setTemplatesError("");
    } catch (cause) {
      setTemplatesSaved(false);
      setTemplatesError(cause instanceof Error ? cause.message : "Không thể xóa template tin nhắn.");
    }
  }

  return (
    <main className="panel options-page">
      <Header section="Cài đặt" />
      <div className="main-content">
        <nav className="options-nav" role="tablist" aria-label="Mục cài đặt">
          {optionsTabs.map(tab => (
            <button
              type="button"
              role="tab"
              key={tab.id}
              aria-selected={activeOptionsTab === tab.id}
              aria-controls={tab.id}
              className={activeOptionsTab === tab.id ? "active" : ""}
              onClick={() => selectOptionsTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <form
          id="preferences"
          className="options-section"
          hidden={activeOptionsTab !== "preferences"}
          onSubmit={event => void submit(event)}
        >
          <div className="options-section-heading">
            <span className="options-section-icon">
              <Clock3 size={19} />
            </span>
            <div>
              <h2>Tùy chọn kiểm tra</h2>
              <p>Điều chỉnh thời gian chờ và cách lưu kết quả.</p>
            </div>
          </div>
          <div className="options-fields">
            <div className="options-field">
              <label htmlFor="timeout">Thời gian chờ</label>
              <div className="options-number">
                <input
                  id="timeout"
                  type="number"
                  min="500"
                  max="10000"
                  step="100"
                  value={settings.timeoutMs}
                  onChange={event => {
                    setSaved(false);
                    setSettings({ ...settings, timeoutMs: Number(event.target.value) });
                  }}
                />
                <span>ms</span>
              </div>
              <small>Từ 500 đến 10.000 ms cho mỗi lần kiểm tra.</small>
            </div>
            <label className="options-toggle" htmlFor="save-history">
              <span>
                <strong>Lưu lịch sử kiểm tra</strong>
                <small>Tắt để ngừng lưu kết quả mới. Kết quả cũ vẫn ở bên dưới cho tới khi bạn xóa.</small>
              </span>
              <input
                id="save-history"
                type="checkbox"
                checked={settings.saveHistory}
                onChange={event => {
                  setSaved(false);
                  setSettings({ ...settings, saveHistory: event.target.checked });
                }}
              />
            </label>
            <div className="options-theme">
              <span>
                <strong>Giao diện</strong>
                <small>Áp dụng cho popup, Cài đặt và Lịch sử của extension.</small>
              </span>
              <div role="radiogroup" aria-label="Chọn giao diện">
                <button
                  type="button"
                  role="radio"
                  aria-checked={settings.theme === "light"}
                  className={settings.theme === "light" ? "active" : ""}
                  onClick={() => selectTheme("light")}
                >
                  <Sun size={15} /> Sáng
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={settings.theme === "dark"}
                  className={settings.theme === "dark" ? "active" : ""}
                  onClick={() => selectTheme("dark")}
                >
                  <Moon size={15} /> Tối
                </button>
              </div>
            </div>
          </div>
          <div className="options-save">
            <button className="primary" type="submit">
              Lưu cài đặt
            </button>
            {saved && (
              <span className="success" role="status">
                Đã lưu cài đặt.
              </span>
            )}
            {saveError && (
              <span className="options-error" role="alert">
                {saveError}
              </span>
            )}
          </div>
        </form>

        <section
          id="tag-elements"
          hidden={activeOptionsTab !== "tag-elements"}
          className="options-section tag-elements-options"
          aria-labelledby="tag-elements-title"
        >
          <div className="options-section-heading">
            <span className="options-section-icon">
              <Tags size={19} />
            </span>
            <div>
              <h2 id="tag-elements-title">Danh sách Tag Element</h2>
              <p>Quản lý lĩnh vực và thành viên dùng cho các nút sao chép nhanh cạnh Thông tin VM.</p>
            </div>
          </div>
          <div className="tag-import">
            <label htmlFor="tag-import-text">Import hoặc chỉnh sửa hàng loạt</label>
            <textarea
              id="tag-import-text"
              value={tagImport}
              onChange={event => {
                setTagImport(event.target.value);
                setTagSaved(false);
                setTagError("");
              }}
              placeholder={"Vmware\n[username](https://matrix.to/#/@iduser:domain)"}
            />
            <div>
              <button type="button" onClick={importTags}>
                Nhận diện danh sách
              </button>
              <small>
                Mỗi lĩnh vực nằm trên một dòng; các dòng tiếp theo dùng dạng{" "}
                <code>[username](https://matrix.to/#/@iduser:domain)</code>.
              </small>
            </div>
          </div>
          <div className="tag-groups-editor">
            {tagGroups.map((group, groupIndex) => (
              <article className="tag-group-editor" key={group.id}>
                <div className="tag-group-editor-heading">
                  <label>
                    <span>Lĩnh vực {groupIndex + 1}</span>
                    <input
                      value={group.name}
                      aria-label={`Tên lĩnh vực ${groupIndex + 1}`}
                      onChange={event => updateTagGroup(group.id, current => ({ ...current, name: event.target.value }))}
                    />
                  </label>
                  <button
                    type="button"
                    className="tag-delete"
                    aria-label={`Xóa lĩnh vực ${group.name}`}
                    onClick={() => {
                      setTagGroups(groups => groups.filter(item => item.id !== group.id));
                      setTagSaved(false);
                    }}
                  >
                    <Trash2 size={15} /> Xóa lĩnh vực
                  </button>
                </div>
                <div className="tag-members-editor">
                  {group.members.map((member, memberIndex) => (
                    <div className="tag-member-editor" key={member.id}>
                      <label>
                        <span>Tên</span>
                        <input
                          value={member.name}
                          aria-label={`Tên thành viên ${memberIndex + 1} của ${group.name}`}
                          onChange={event =>
                            updateTagGroup(group.id, current => ({
                              ...current,
                              members: current.members.map(item =>
                                item.id === member.id ? { ...item, name: event.target.value } : item,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>Element ID</span>
                        <input
                          value={member.elementId}
                          placeholder="@id:example.com"
                          aria-label={`Element ID của ${member.name}`}
                          onChange={event =>
                            updateTagGroup(group.id, current => ({
                              ...current,
                              members: current.members.map(item =>
                                item.id === member.id ? { ...item, elementId: event.target.value } : item,
                              ),
                            }))
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="tag-delete tag-delete-member"
                        aria-label={`Xóa thành viên ${member.name}`}
                        onClick={() =>
                          updateTagGroup(group.id, current => ({
                            ...current,
                            members: current.members.filter(item => item.id !== member.id),
                          }))
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  {!group.members.length && <p className="tag-editor-empty">Lĩnh vực này chưa có thành viên.</p>}
                </div>
                <button
                  type="button"
                  className="tag-add-member"
                  onClick={() =>
                    updateTagGroup(group.id, current => ({
                      ...current,
                      members: [...current.members, createTagElementMember()],
                    }))
                  }
                >
                  <UserPlus size={15} /> Thêm thành viên
                </button>
              </article>
            ))}
          </div>
          <div className="tag-editor-actions">
            <button
              type="button"
              className="tag-add-group"
              onClick={() => {
                setTagGroups(groups => [...groups, createTagElementGroup()]);
                setTagSaved(false);
                setTagError("");
              }}
            >
              <Plus size={15} /> Thêm lĩnh vực
            </button>
            <button type="button" className="primary" onClick={() => void saveTags()}>
              <Save size={15} /> Lưu danh sách
            </button>
            {tagSaved && (
              <span className="success" role="status">
                Đã lưu Tag Element.
              </span>
            )}
          </div>
          {tagError && (
            <p className="options-error" role="alert">
              {tagError}
            </p>
          )}
        </section>

        <section
          id="message-templates"
          hidden={activeOptionsTab !== "message-templates"}
          className="options-section message-templates-options"
          aria-labelledby="message-templates-title"
        >
          <div className="options-section-heading">
            <span className="options-section-icon">
              <MessageSquareText size={19} />
            </span>
            <div>
              <h2 id="message-templates-title">Template tin nhắn</h2>
              <p>Quản lý nội dung dùng lại trong hộp Copy VM nâng cao trên Portal.</p>
            </div>
          </div>
          <div className="message-template-list">
            {messageTemplates.map(template => (
              <article
                className={`message-template-row${messageTemplateDraft?.id === template.id ? " is-editing" : ""}`}
                key={template.id}
              >
                <div className="message-template-row-copy">
                  <strong title={template.name}>{template.name}</strong>
                  <small title={template.content.replace(/\s+/g, " ")}>
                    {template.content.replace(/\s+/g, " ")}
                  </small>
                </div>
                <div className="message-template-row-actions">
                  <button
                    type="button"
                    className="message-template-row-edit"
                    title="Chỉnh sửa template"
                    aria-label={`Chỉnh sửa template ${template.name}`}
                    disabled={Boolean(messageTemplateDraft)}
                    onClick={() => {
                      setMessageTemplateDraft({ ...template });
                      setTemplatesSaved(false);
                      setTemplatesError("");
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="message-template-row-delete"
                    title="Xóa template"
                    aria-label={`Xóa template ${template.name}`}
                    disabled={Boolean(messageTemplateDraft)}
                    onClick={() => void removeMessageTemplate(template)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
            {!messageTemplates.length && !messageTemplateDraft &&
              <p className="message-template-empty">Chưa có template tin nhắn.</p>}
          </div>
          {messageTemplateDraft && (
            <article className="message-template-editor">
              <div className="message-template-heading">
                <label>
                  <span>Tên template</span>
                  <input
                    autoFocus
                    value={messageTemplateDraft.name}
                    aria-label="Tên template đang chỉnh sửa"
                    placeholder="Ví dụ: Thông báo kiểm tra"
                    onChange={event => updateMessageTemplate({ name: event.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="message-template-cancel"
                  onClick={() => {
                    setMessageTemplateDraft(null);
                    setTemplatesError("");
                  }}
                >
                  <X size={15} /> Hủy
                </button>
              </div>
              <label className="message-template-content">
                <span>Nội dung</span>
                <textarea
                  value={messageTemplateDraft.content}
                  aria-label="Nội dung template đang chỉnh sửa"
                  placeholder="Nhập nội dung sẽ chèn vào tin nhắn..."
                  onChange={event => updateMessageTemplate({ content: event.target.value })}
                />
              </label>
              <div className="message-template-tags"
                aria-label={`Thêm Tag Element vào template ${messageTemplateDraft.name || "đang chỉnh sửa"}`}>
                {tagGroups.map(group => (
                  <button
                    type="button"
                    key={group.id}
                    disabled={!group.members.some(member => member.name.trim() && member.elementId.trim())}
                    onClick={event => addTagGroupToTemplate(group, event.currentTarget)}
                  >
                    {group.name}
                  </button>
                ))}
                {!tagGroups.length && <small>Chưa có nhóm Tag Element.</small>}
              </div>
            </article>
          )}
          <div className="tag-editor-actions">
            <button
              type="button"
              className="tag-add-group"
              disabled={Boolean(messageTemplateDraft)}
              onClick={() => {
                setMessageTemplateDraft(createMessageTemplate());
                setTemplatesSaved(false);
                setTemplatesError("");
              }}
            >
              <Plus size={15} /> Thêm template
            </button>
            {messageTemplateDraft && (
              <button type="button" className="primary" onClick={() => void saveTemplates()}>
                <Save size={15} /> Lưu template
              </button>
            )}
            {templatesSaved && (
              <span className="success" role="status">
                Đã lưu template tin nhắn.
              </span>
            )}
          </div>
          {templatesError && (
            <p className="options-error" role="alert">
              {templatesError}
            </p>
          )}
        </section>

        <section
          id="authenticator-backup"
          hidden={activeOptionsTab !== "authenticator-backup"}
          className="options-section"
          aria-labelledby="authenticator-backup-title"
        >
          <div className="options-section-heading">
            <span className="options-section-icon">
              <KeyRound size={19} />
            </span>
            <div>
              <h2 id="authenticator-backup-title">Sao lưu Authenticator</h2>
              <p>Xuất các tài khoản TOTP để sao lưu hoặc import lại vào IT Support Toolkit.</p>
            </div>
          </div>
          <div className="options-auth-export">
            <div>
              <strong>Xuất file TXT</strong>
              <p>
                File giữ nguyên thứ tự và toàn bộ thiết lập TOTP. Có thể import lại bằng nút <strong>Import</strong> trong tab
                Auth.
              </p>
            </div>
            <button type="button" disabled={authExporting} onClick={() => void exportAuthenticators()}>
              <Download size={16} /> {authExporting ? "Đang xuất..." : "Export Auth"}
            </button>
          </div>
          <p className="options-sensitive-note">
            <ShieldCheck size={15} /> File xuất chứa secret TOTP dạng đọc được. Không gửi file qua kênh công khai và không để file
            trên máy dùng chung.
          </p>
          {authExportStatus && (
            <p className="success" role="status">
              {authExportStatus}
            </p>
          )}
          {authExportError && (
            <p className="options-error" role="alert">
              {authExportError}
            </p>
          )}
        </section>

        <section
          id="portal-access"
          hidden={activeOptionsTab !== "portal-access"}
          className="options-section"
          aria-labelledby="portal-access-options-title"
        >
          <div className="options-section-heading">
            <span className="options-section-icon">
              <ShieldCheck size={19} />
            </span>
            <div>
              <h2 id="portal-access-options-title">Quyền truy cập Portal Long Vân</h2>
              <p>Quản lý quyền sao chép và dán cấu hình VM trên Portal.</p>
            </div>
          </div>
          <label className="options-toggle" htmlFor="portal-access-toggle">
            <span>
              <strong>Cho phép truy cập portal.longvan.vn</strong>
              <small>
                Dùng cho tiện ích Dịch vụ, Tạo computing và điền OTP trong hộp xác thực 2 lớp trên Portal. Sau khi thay đổi, hãy
                refresh các tab Portal đang mở.
              </small>
            </span>
            <input
              id="portal-access-toggle"
              type="checkbox"
              disabled={portalBusy || portalAccess === null}
              checked={portalAccess === true}
              onChange={event => void changePortalAccess(event.target.checked)}
            />
          </label>
          {portalAccess === true && (
            <p className="success" role="status">
              Đã cấp quyền Portal.
            </p>
          )}
          {portalAccess === false && (
            <p className="agent-note">Chưa cấp quyền Portal. Các nút sao chép/dán sẽ không được chèn vào trang.</p>
          )}
          {portalError && (
            <p className="options-error" role="alert">
              {portalError}
            </p>
          )}
        </section>

        <section
          id="history"
          hidden={activeOptionsTab !== "history"}
          className="options-section"
          aria-labelledby="options-history-title"
        >
          <div className="options-section-heading options-history-heading">
            <span className="options-section-icon">
              <History size={19} />
            </span>
            <div>
              <h2 id="options-history-title">
                Lịch sử kiểm tra <span className="options-badge">{historyLoading ? "…" : history.length}/50</span>
              </h2>
              <p>Xem lại kết quả trên thiết bị này, không đồng bộ sang trình duyệt khác.</p>
            </div>
          </div>
          {history.length > 0 && (
            <div className="options-history-tools">
              <label className="options-search">
                <Search size={16} />
                <span className="sr-only">Tìm trong lịch sử</span>
                <input
                  type="search"
                  placeholder="Tìm công cụ hoặc mục tiêu..."
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                />
              </label>
              <button type="button" onClick={() => downloadReport(history)}>
                <Download size={15} /> Xuất HTML
              </button>
              <button type="button" className="danger" onClick={() => void clearHistory()}>
                <Trash2 size={15} /> Xóa tất cả
              </button>
            </div>
          )}
          {historyError && (
            <p className="options-error" role="alert">
              {historyError}
            </p>
          )}
          {historyLoading ? (
            <p className="options-empty">Đang tải lịch sử...</p>
          ) : !history.length ? (
            <p className="options-empty">Chưa có lần kiểm tra nào được lưu. Chạy một công cụ từ popup để bắt đầu.</p>
          ) : (
            <>
              <p className="options-history-count">
                {query.trim() ? `${filtered.length} kết quả phù hợp` : `${history.length} kết quả gần nhất`}
              </p>
              {filtered.length ? (
                <div className="options-history-list">
                  {filtered.map(item => (
                    <HistoryItem
                      key={item.id}
                      record={item}
                      selected={selectedId === item.id}
                      onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
                    />
                  ))}
                </div>
              ) : (
                <p className="options-empty">Không tìm thấy kết quả phù hợp.</p>
              )}
              {selected && (
                <div className="options-history-detail" aria-label="Chi tiết lịch sử">
                  <Result record={selected} />
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
