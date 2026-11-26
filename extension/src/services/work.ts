import type { Tool } from './checks'
import type { CheckRecord } from './storage'
import type { HTTPMethod } from './network/http-ping'
import type { DoHRecordType, DoHResolver } from './network/dns-lookup'
import type { CheckProgress } from './progress'

export const jobKey = 'currentCheck'
export const draftKey = 'popupDraft'

export type CheckRequest = {
  tool: Tool
  input: string
  httpCount: number
  httpMethod?: HTTPMethod
  dohRecordType?: DoHRecordType
  dohResolver?: DoHResolver
  tabId?: number
}

export type CheckJob = {
  id: string
  tool: Tool
  status: 'running' | 'done' | 'error' | 'interrupted'
  progress: CheckProgress[]
  record?: CheckRecord
  error?: string
}

export type PopupDraft = {
  input: string
  httpCount: number
  httpMethod?: HTTPMethod
  dohRecordType?: DoHRecordType
  dohResolver?: DoHResolver
  tool: Tool | null
}
