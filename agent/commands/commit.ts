import { gitCommitCommand } from './gitWorkflow.js'

// `qwen-agent commit [message]` delegates to the full git commit workflow
export async function commitCommand(message?: string): Promise<void> {
  await gitCommitCommand(message)
}
