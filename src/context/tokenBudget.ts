const CHARS_PER_TOKEN = 4

export interface BudgetChunk {
  id: string
  content: string
  priority: number
}

/**
 * Approximate token count using a fixed chars-per-token ratio.
 * Keeps the system lightweight — no external tokenizer needed.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/** True if the text fits within the token limit. */
export function withinBudget(text: string, maxTokens: number): boolean {
  return estimateTokens(text) <= maxTokens
}

/**
 * Trim a list of chunks to fit within maxTokens.
 * Higher-priority chunks are kept first.
 * Low-priority chunks are dropped entirely; the last fitting chunk is truncated
 * if a partial fit is possible (> 100 tokens remaining).
 *
 * Generic so callers can attach extra metadata to each chunk without losing it.
 */
export function trimToBudget<T extends BudgetChunk>(
  chunks: T[],
  maxTokens: number,
  reserveTokens = 0,
): T[] {
  const available = maxTokens - reserveTokens
  const sorted = [...chunks].sort((a, b) => b.priority - a.priority)

  const result: T[] = []
  let used = 0

  for (const chunk of sorted) {
    const tokens = estimateTokens(chunk.content)
    if (used + tokens <= available) {
      result.push(chunk)
      used += tokens
    } else {
      const remaining = available - used
      if (remaining > 100) {
        const truncated = chunk.content.slice(0, remaining * CHARS_PER_TOKEN) + '\n...(truncated)'
        result.push({ ...chunk, content: truncated })
        used += remaining
      }
      break
    }
  }

  return result
}
