export interface ProxyConfig {
  server: string
  username?: string
  password?: string
}

export class ProxyManager {
  private proxies: ProxyConfig[] = []
  private currentIndex = 0
  private failCounts: Map<string, number> = new Map()

  constructor(proxyList: string[]) {
    this.loadProxies(proxyList)
  }

  private loadProxies(proxyList: string[]) {
    for (const proxy of proxyList) {
      // Expected format: user:pass@ip:port or ip:port
      if (proxy.includes('@')) {
        const [auth, server] = proxy.split('@')
        const [username, password] = auth.split(':')
        this.proxies.push({ server: `http://${server}`, username, password })
      } else {
        this.proxies.push({ server: `http://${proxy}` })
      }
    }
  }

  getNext(): ProxyConfig | undefined {
    if (!this.proxies.length) return undefined

    // Skip proxies with too many failures
    let attempts = 0
    while (attempts < this.proxies.length) {
      const proxy = this.proxies[this.currentIndex % this.proxies.length]
      this.currentIndex++
      if ((this.failCounts.get(proxy.server) || 0) < 3) return proxy
      attempts++
    }

    // Reset fail counts and try again
    this.failCounts.clear()
    return this.proxies[0]
  }

  reportFailure(server: string) {
    this.failCounts.set(server, (this.failCounts.get(server) || 0) + 1)
    console.log(`[Proxy] Marked ${server} as failing (${this.failCounts.get(server)} failures)`)
  }

  get count() { return this.proxies.length }
}
