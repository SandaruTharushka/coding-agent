import { runAgent, type AgentOptions } from '../../agent/agents/base.agent.js'
import type { QwenMessage } from '../../services/api/qwen-provider.js'
import type { AgentName, AgentResult } from './types.js'
import { resolveProviderAndModel } from '../llm/modelRouter.js'
import type { AgentPurpose } from '../llm/providers/types.js'

export abstract class BaseAgent {
  protected readonly agentName: AgentName | string

  constructor(agentName: AgentName | string) {
    this.agentName = agentName
  }

  protected async callLLM(
    messages: QwenMessage[],
    options: AgentOptions & { purpose?: AgentPurpose; taskId?: string },
  ): Promise<string> {
    // Resolve provider/model via the model router
    const { providerId, model } = resolveProviderAndModel(
      options.modelOverride,
      undefined,
      options.purpose ?? (this.agentName as AgentPurpose | undefined),
    )

    return runAgent(messages, {
      ...options,
      agentName: this.agentName as string,
      taskId: options.taskId,
      providerId,
      model,
    })
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
