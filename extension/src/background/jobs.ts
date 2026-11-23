import { runCheck } from '../services/checks'
import { jobKey, type CheckJob, type CheckRequest } from '../services/work'

let activeJob: string | null = null

async function currentJob(): Promise<CheckJob | null> {
  const stored = (await chrome.storage.session.get(jobKey))[jobKey] as CheckJob | undefined
  if (stored?.status === 'running' && stored.id !== activeJob) {
    const interrupted: CheckJob = {
      ...stored, status: 'interrupted',
      error: 'Tiến trình đã bị ngắt khi trình duyệt khởi động lại hoặc extension tải lại. Hãy chạy lại kiểm tra.',
    }
    await chrome.storage.session.set({ [jobKey]: interrupted })
    return interrupted
  }
  return stored ?? null
}

async function startJob(request: CheckRequest): Promise<CheckJob> {
  if (activeJob) throw new Error('Đang có kiểm tra khác chạy. Hãy đợi kết quả.')
  await currentJob()
  if (activeJob) throw new Error('Đang có kiểm tra khác chạy. Hãy đợi kết quả.')
  const job: CheckJob = { id: crypto.randomUUID(), tool: request.tool, status: 'running', progress: [] }
  activeJob = job.id
  try {
    await chrome.storage.session.set({ [jobKey]: job })
  } catch (error) {
    activeJob = null
    throw error
  }
  void execute(job, request)
  return job
}

async function execute(job: CheckJob, request: CheckRequest): Promise<void> {
  let writes = Promise.resolve()
  const write = () => {
    const snapshot = { ...job, progress: [...job.progress] }
    writes = writes.then(() => chrome.storage.session.set({ [jobKey]: snapshot }))
      .catch((error) => { console.error('Không lưu được tiến trình kiểm tra', error) })
  }
  try {
    const record = await runCheck(
      request.tool, request.input, request.port, request.scanPorts, request.mxCommand,
      request.pingCount, request.maxHops, (event) => {
        job.progress = [...job.progress, { ...event, text: event.text.slice(0, 2000) }].slice(-100)
        write()
      }, request.tabId,
    )
    job.status = 'done'
    job.record = record
  } catch (error) {
    job.status = 'error'
    job.error = error instanceof Error ? error.message : String(error)
  } finally {
    try {
      await writes
      await chrome.storage.session.set({ [jobKey]: { ...job, progress: [...job.progress] } })
    } catch (error) {
      console.error('Không lưu được kết quả kiểm tra', error)
    } finally {
      activeJob = null
    }
  }
}

export function registerJobs(): void {
  chrome.runtime.onMessage.addListener((message: { type?: string; request?: CheckRequest }, _sender, respond) => {
    if (message?.type === 'toolkit:get-job') {
      void currentJob().then((job) => respond({ job }), (error) => respond({ error: String(error) }))
      return true
    }
    if (message?.type === 'toolkit:start-job' && message.request) {
      void startJob(message.request).then((job) => respond({ job }), (error) =>
        respond({ error: error instanceof Error ? error.message : String(error) }))
      return true
    }
    return false
  })
}
