import { runAgent, type AgentOptions } from '../../agent/agents/base.agent.js'
import type { QwenMessage } from '../../services/api/qwen-provider.js'
import type { AgentName, AgentResult } from './types.js'

export abstract class BaseAgent {
  protected readonly agentName: AgentName | string

  constructor(agentName: AgentName | string) {
    this.agentName = agentName
  }

  protected async callLLM(messages: QwenMessage[], options: AgentOptions): Promise<string> {
    return runAgent(messages, options)
  }

  protected log(message: string): void {
    console.log(`\x1b[36m[${this.agentName}]\x1b[0m ${message}`)
  }

  protected ok(summary: string, data?: unknown, nextActions?: string[]): AgentResult {
    return { agent: this.agentName, success: true, summary, data, nextActions }
  }

  protected fail(summary: string, errors?: string[], nextActions?: string[]): AgentResult {
    return { agent: this.agentName, success: false, summary, errors, nextActions }
  }
}
