/**
 * Cost estimator for AI provider token usage.
 *
 * Uses the pricing tables from providerRegistry.
 * Returns null when pricing is not configured for a model.
 */

import { getProvider } from '../llm/providers/providerRegistry.js'

export function estimateCost(
  providerId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const provider = getProvider(providerId)
  if (!provider?.pricing) return null

  // Try exact model match, then try prefix match (e.g. "gpt-4o" matches "gpt-4o-2024-11-20")
  let pricing = provider.pricing[model]
  if (!pricing) {
    for (const [key, val] of Object.entries(provider.pricing)) {
      if (model.startsWith(key)) { pricing = val; break }
    }
  }
  if (!pricing) return null

  const inputCost = (inputTokens / 1000) * pricing.inputPer1kTokens
  const outputCost = (outputTokens / 1000) * pricing.outputPer1kTokens
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000 // 6 decimal precision
}

export function formatCost(cost: number | null): string {
  if (cost === null) return 'pricing not configured'
  if (cost === 0) return '$0.000000'
  if (cost < 0.000001) return `$${cost.toExponential(2)}`
  return `$${cost.toFixed(6)}`
}

export interface PricingInfo {
  providerId: string
  providerName: string
  model: string
  inputPer1kTokens: number | null
  outputPer1kTokens: number | null
  configured: boolean
}

export function getPricingInfo(providerId: string, model: string): PricingInfo {
  const provider = getProvider(providerId)
  if (!provider) {
    return {
      providerId,
      providerName: providerId,
      model,
      inputPer1kTokens: null,
      outputPer1kTokens: null,
      configured: false,
    }
  }

  let pricing = provider.pricing?.[model]
  if (!pricing && provider.pricing) {
    for (const [key, val] of Object.entries(provider.pricing)) {
      if (model.startsWith(key)) { pricing = val; break }
    }
  }

  return {
    providerId,
    providerName: provider.name,
    model,
    inputPer1kTokens: pricing?.inputPer1kTokens ?? null,
    outputPer1kTokens: pricing?.outputPer1kTokens ?? null,
    configured: !!pricing,
  }
}
