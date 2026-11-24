import { ArrowUpRight } from 'lucide-react'

export function Header({ section }: { section: string }) {
  return <header className="header">
    <div className="brand"><span className="brand-icon"><img src="/icons/icon-32.png" width="32" height="32" alt="" /></span><div><strong>IT Support Toolkit</strong><small>{section}</small></div></div>
    <span className="version">V {chrome.runtime.getManifest().version}</span>
  </header>
}
export function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return <a className="text-link" href={href} target="_blank" rel="noreferrer">{children} <ArrowUpRight size={14} /></a>
}
