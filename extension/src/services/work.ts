import type { MXCommand } from './domainLookup'
import type { NativeProgress } from './nativeHost'
import type { Tool } from './checks'
import type { CheckRecord } from './storage'

export const jobKey = 'currentCheck'
export const draftKey = 'popupDraft'

export type CheckRequest = {
  tool: Tool
  input: string
  port: number
  scanPorts: number[]
  mxCommand: MXCommand
  pingCount: number
  maxHops: number
  tabId?: number
}

export type CheckJob = {
  id: string
  tool: Tool
  status: 'running' | 'done' | 'error' | 'interrupted'
  progress: NativeProgress[]
  record?: CheckRecord
  error?: string
}

export type PopupDraft = {
  input: string
  port: number
  pingCount: number
  maxHops: number
  scanMode: 'common' | 'custom'
  customPorts: string
  mxCommand: MXCommand
  tool: Tool | null
}
