import { randomUUID } from 'crypto';
import { env } from '../config/env.js';

export interface DraftGenerationInput {
  triggerData: Record<string, unknown>;
  context: Record<string, unknown>;
}

export interface DraftGenerationOutput {
  draftId: string;
  summary: string;
  generatedAt: string;
  confidence: number;
  model: string;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  costUsd: number;
}

export interface DraftGenerator {
  generate(input: DraftGenerationInput): Promise<DraftGenerationOutput>;
}

interface AnthropicMessageResponse {
  model: string;
  content: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

function estimateConfidence(text: string): number {
  const normalized = text.toLowerCase();
  const weakSignals = ['maybe', 'might', 'uncertain', 'unsure'];
  const weakCount = weakSignals.reduce((count, signal) => (normalized.includes(signal) ? count + 1 : count), 0);

  const lengthBoost = Math.min(0.2, text.length / 1000);
  const uncertaintyPenalty = weakCount * 0.12;
  const score = 0.72 + lengthBoost - uncertaintyPenalty;
  return Math.max(0, Math.min(0.99, Number(score.toFixed(2))));
}

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * env.ANTHROPIC_INPUT_COST_PER_MILLION;
  const outputCost = (outputTokens / 1_000_000) * env.ANTHROPIC_OUTPUT_COST_PER_MILLION;
  return Number((inputCost + outputCost).toFixed(6));
}

function buildPrompt(input: DraftGenerationInput): string {
  return [
    'Generate a concise workflow draft summary for a human approver.',
    `Trigger data: ${JSON.stringify(input.triggerData)}`,
    `Context: ${JSON.stringify(input.context)}`,
    'Output plain text only.'
  ].join('\n');
}

export class AnthropicDraftAdapter implements DraftGenerator {
  async generate(input: DraftGenerationInput): Promise<DraftGenerationOutput> {
    if (!env.ANTHROPIC_API_KEY) {
      return this.fallback(input);
    }

    const prompt = buildPrompt(input);
    const response = await this.callWithRetries(prompt);

    const summary =
      response.content.find((item) => item.type === 'text' && typeof item.text === 'string')?.text?.trim() ||
      'No summary generated';

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;

    return {
      draftId: `draft-${randomUUID()}`,
      summary,
      generatedAt: new Date().toISOString(),
      confidence: estimateConfidence(summary),
      model: response.model,
      tokenUsage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
      },
      costUsd: estimateCostUsd(inputTokens, outputTokens)
    };
  }

  private async callWithRetries(prompt: string): Promise<AnthropicMessageResponse> {
    let lastError: unknown = undefined;

    for (let attempt = 1; attempt <= env.ANTHROPIC_MAX_RETRIES; attempt += 1) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY ?? '',
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: env.ANTHROPIC_MODEL,
            max_tokens: 250,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ]
          })
        });

        if (!response.ok) {
          throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
        }

        return (await response.json()) as AnthropicMessageResponse;
      } catch (error) {
        lastError = error;
        if (attempt === env.ANTHROPIC_MAX_RETRIES) {
          break;
        }

        const backoffMs = 250 * 2 ** (attempt - 1);
        await new Promise((resolve) => {
          setTimeout(resolve, backoffMs);
        });
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Anthropic API request failed');
  }

  private fallback(input: DraftGenerationInput): DraftGenerationOutput {
    const source = typeof input.triggerData.source === 'string' ? input.triggerData.source : 'unknown';
    const customerId = typeof input.context.customerId === 'string' ? input.context.customerId : 'n/a';
    const summary = `Draft prepared for source=${source}, customer=${customerId}`;

    return {
      draftId: `draft-${randomUUID()}`,
      summary,
      generatedAt: new Date().toISOString(),
      confidence: 0.73,
      model: 'fallback-stub',
      tokenUsage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      },
      costUsd: 0
    };
  }
}
