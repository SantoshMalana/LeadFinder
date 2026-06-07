import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const redis = Redis.fromEnv()

interface CircuitState {
  state: 'closed' | 'open' | 'half-open'
  failureCount: number
  lastFailure: number
  successCount: number
}

export class PlatformCircuitBreaker {
  private platform: string
  private thresholds = {
    linkedin: { maxFailures: 3, timeout: 30 * 60 * 1000, maxActionsPerHour: 50 },
    naukri: { maxFailures: 5, timeout: 15 * 60 * 1000, maxActionsPerHour: 100 },
    telegram: { maxFailures: 10, timeout: 5 * 60 * 1000, maxActionsPerHour: 500 },
  }

  constructor(platform: string, overrideMaxActions?: number) {
    this.platform = platform
    if (overrideMaxActions) {
      this.thresholds[platform as keyof typeof this.thresholds].maxActionsPerHour = overrideMaxActions
    }
  }

  async canProceed(): Promise<boolean> {
    const state = await this.getState()
    const config = this.thresholds[this.platform as keyof typeof this.thresholds]
    if (!config) return true

    if (state.state === 'open') {
      if (Date.now() - state.lastFailure > config.timeout) {
        await this.setState({ ...state, state: 'half-open' })
        return true
      }
      console.log(`[Circuit] ${this.platform} circuit OPEN — waiting for timeout`)
      return false
    }

    // Check hourly rate
    const hourlyKey = `circuit:${this.platform}:hourly:${Math.floor(Date.now() / 3600000)}`
    const count = await redis.incr(hourlyKey)
    await redis.expire(hourlyKey, 3600)

    if (count > config.maxActionsPerHour) {
      console.log(`[Circuit] ${this.platform} hourly limit hit (${count}/${config.maxActionsPerHour})`)
      await this.recordFailure()
      return false
    }

    return true
  }

  async recordSuccess() {
    const state = await this.getState()
    await this.setState({ ...state, state: 'closed', failureCount: 0, successCount: state.successCount + 1 })
  }

  async recordFailure() {
    const state = await this.getState()
    const config = this.thresholds[this.platform as keyof typeof this.thresholds]
    const newFailures = state.failureCount + 1

    if (config && newFailures >= config.maxFailures) {
      console.log(`[Circuit] ${this.platform} circuit OPENED after ${newFailures} failures`)
      await this.setState({ state: 'open', failureCount: newFailures, lastFailure: Date.now(), successCount: 0 })
    } else {
      await this.setState({ ...state, failureCount: newFailures, lastFailure: Date.now() })
    }
  }

  private async getState(): Promise<CircuitState> {
    const raw = await redis.get<CircuitState>(`circuit:${this.platform}:state`)
    return raw || { state: 'closed', failureCount: 0, lastFailure: 0, successCount: 0 }
  }

  private async setState(state: CircuitState) {
    await redis.set(`circuit:${this.platform}:state`, state, { ex: 86400 })
  }
}
