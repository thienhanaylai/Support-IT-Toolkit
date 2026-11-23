export const commonPorts = [
  21, 22, 25, 53, 80, 110, 143, 443, 445, 465,
  587, 993, 995, 1433, 3306, 3389, 5432, 6379, 8080, 8443,
]

export function parseScanPorts(input: string): number[] {
  if (!input.trim()) throw new Error('Nhập ít nhất một cổng TCP cần quét')
  const ports = new Set<number>()
  for (const token of input.split(',')) {
    const match = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(token.trim())
    if (!match) throw new Error('Danh sách cổng không hợp lệ. Ví dụ: 22,80,443,8000-8005')
    const start = Number(match[1])
    const end = match[2] ? Number(match[2]) : start
    if (start < 1 || end > 65535 || start > end || end - start >= 32) {
      throw new Error('Cổng phải từ 1–65535, mỗi dải tối đa 32 cổng')
    }
    for (let port = start; port <= end; port++) {
      ports.add(port)
      if (ports.size > 32) throw new Error('Chỉ quét tối đa 32 cổng mỗi lần')
    }
  }
  return [...ports].sort((a, b) => a - b)
}
