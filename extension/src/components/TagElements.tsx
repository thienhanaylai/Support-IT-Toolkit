import { Check, Copy, Settings2, Tags } from "lucide-react";
import { useEffect, useState } from "react";
import { formatTagElement, loadTagElementGroups, tagElementsStorageKey, type TagElementGroup } from "../services/tagElements";

export function TagElements() {
  const [groups, setGroups] = useState<TagElementGroup[]>([]);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    void loadTagElementGroups()
      .then(value => {
        if (mounted) setGroups(value);
      })
      .catch(() => {
        if (mounted) setError("Không thể tải danh sách Tag Element.");
      });
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (!mounted || area !== "local" || !changes[tagElementsStorageKey]) return;
      const value = changes[tagElementsStorageKey].newValue;
      if (Array.isArray(value)) setGroups(value as TagElementGroup[]);
    };
    chrome.storage.onChanged.addListener(changed);
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(changed);
    };
  }, []);

  async function copy(value: string, key: string) {
    setError("");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
    } catch {
      setCopied("");
      setError("Không thể sao chép Tag Element.");
    }
  }

  return (
    <div className="tag-tab-content">
      <div className="tag-tab-heading">
        <h1> Tag Element</h1>
        <a href="options.html#tag-elements" target="_blank" rel="noreferrer">
          <Settings2 size={14} /> Quản lý
        </a>
      </div>
      {error && (
        <p className="tag-tab-error" role="alert">
          {error}
        </p>
      )}
      <div className="tag-tab-list">
        {groups.map(group => {
          const groupKey = `group:${group.id}`;
          const groupText = group.members.map(formatTagElement).join("\n");
          return (
            <section className={`tag-tab-card${copied === groupKey ? " is-copied" : ""}`} key={group.id}>
              <button
                type="button"
                className="tag-tab-group-copy"
                disabled={!group.members.length}
                aria-label={`Sao chép toàn bộ liên hệ ${group.name}`}
                onClick={() => void copy(groupText, groupKey)}
              >
                <span>
                  <strong>{group.name}</strong>
                  <small>{group.members.length} liên hệ</small>
                </span>
                <span>
                  {copied === groupKey ? (
                    <>
                      <Check size={15} /> Đã chép
                    </>
                  ) : (
                    <>
                      <Copy size={15} /> Copy nhóm
                    </>
                  )}
                </span>
              </button>
              {group.members.length ? (
                <div className="tag-tab-members">
                  {group.members.map(member => {
                    const memberKey = `member:${member.id}`;
                    return (
                      <button
                        type="button"
                        key={member.id}
                        className={copied === memberKey ? "is-copied" : ""}
                        title={formatTagElement(member)}
                        onClick={() => void copy(formatTagElement(member), memberKey)}
                      >
                        <span>
                          <strong>{member.name}</strong>
                          <small>{member.elementId}</small>
                        </span>
                        {copied === memberKey ? <Check size={15} /> : <Copy size={15} />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="tag-tab-empty">Chưa có thành viên. Mở Quản lý để bổ sung.</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
