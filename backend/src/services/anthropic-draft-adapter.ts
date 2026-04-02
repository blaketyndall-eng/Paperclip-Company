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

type ProviderName = 'anthropic' | 'openai' | 'gemini';
type Fetcher = typeof fetch;

interface ProviderResult {
  provider: ProviderName;
  model: string;
  summary: string;
  inputTokens: number;
  outputTokens: number;
}

interface AnthropicMessageResponse {
  model: string;
  content: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface OpenAIChatResponse {
  model: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
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

function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  inputRate: number,
  outputRate: number
): number {
  const inputCost = (inputTokens / 1_000_000) * inputRate;
  const outputCost = (outputTokens / 1_000_000) * outputRate;
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
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async generate(input: DraftGenerationInput): Promise<DraftGenerationOutput> {
    const prompt = buildPrompt(input);
    const providerOrder = this.getProviderOrder();
    const configuredProviders = providerOrder.filter((provider) => this.isConfigured(provider));

    if (configuredProviders.length === 0) {
      return this.fallback(input);
    }

    let lastError: unknown = undefined;
    for (const provider of configuredProviders) {
      try {
        const result = await this.generateWithProvider(provider, prompt);

        return {
          draftId: `draft-${randomUUID()}`,
          summary: result.summary,
          generatedAt: new Date().toISOString(),
          confidence: estimateConfidence(result.summary),
          model: `${result.provider}:${result.model}`,
          tokenUsage: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalTokens: result.inputTokens + result.outputTokens
          },
          costUsd: this.estimateProviderCost(result)
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('All configured LLM providers failed');
  }

  private getProviderOrder(): ProviderName[] {
    const requested = env.LLM_PROVIDER_ORDER.split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value): value is ProviderName => value === 'anthropic' || value === 'openai' || value === 'gemini');

    return requested.length > 0 ? requested : ['anthropic', 'openai', 'gemini'];
  }

  private isConfigured(provider: ProviderName): boolean {
    switch (provider) {
      case 'anthropic':
        return Boolean(env.ANTHROPIC_API_KEY);
      case 'openai':
        return Boolean(env.OPENAI_API_KEY);
      case 'gemini':
        return Boolean(env.GEMINI_API_KEY);
    }
  }

  private estimateProviderCost(result: ProviderResult): number {
    switch (result.provider) {
      case 'anthropic':
        return estimateCostUsd(
          result.inputTokens,
          result.outputTokens,
          env.ANTHROPIC_INPUT_COST_PER_MILLION,
          env.ANTHROPIC_OUTPUT_COST_PER_MILLION
        );
      case 'openai':
        return estimateCostUsd(
          result.inputTokens,
          result.outputTokens,
          env.OPENAI_INPUT_COST_PER_MILLION,
          env.OPENAI_OUTPUT_COST_PER_MILLION
        );
      case 'gemini':
        return estimateCostUsd(
          result.inputTokens,
          result.outputTokens,
          env.GEMINI_INPUT_COST_PER_MILLION,
          env.GEMINI_OUTPUT_COST_PER_MILLION
        );
    }
  }

  private async generateWithProvider(provider: ProviderName, prompt: string): Promise<ProviderResult> {
    switch (provider) {
      case 'anthropic':
        return this.callAnthropic(prompt);
      case 'openai':
        return this.callOpenAI(prompt);
      case 'gemini':
        return this.callGemini(prompt);
    }
  }

  private async callAnthropic(prompt: string): Promise<ProviderResult> {
    const response = await this.callWithRetries('anthropic', env.ANTHROPIC_MAX_RETRIES, async () => {
      const result = await this.fetcher('https://api.anthropic.com/v1/messages', {
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

      if (!result.ok) {
        throw new Error(`Anthropic API error ${result.status}: ${await result.text()}`);
      }

      return (await result.json()) as AnthropicMessageResponse;
    });

    return {
      provider: 'anthropic',
      model: response.model,
      summary:
        response.content.find((item) => item.type === 'text' && typeof item.text === 'string')?.text?.trim() ||
        'No summary generated',
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0
    };
  }

  private async callOpenAI(prompt: string): Promise<ProviderResult> {
    const response = await this.callWithRetries('openai', env.OPENAI_MAX_RETRIES, async () => {
      const result = await this.fetcher('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY ?? ''}`
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 250
        })
      });

      if (!result.ok) {
        throw new Error(`OpenAI API error ${result.status}: ${await result.text()}`);
      }

      return (await result.json()) as OpenAIChatResponse;
    });

    return {
      provider: 'openai',
      model: response.model,
      summary: response.choices?.[0]?.message?.content?.trim() || 'No summary generated',
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0
    };
  }

  private async callGemini(prompt: string): Promise<ProviderResult> {
    const response = await this.callWithRetries('gemini', env.GEMINI_MAX_RETRIES, async () => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY ?? ''}`;
      const result = await this.fetcher(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ]
        })
      });

      if (!result.ok) {
        throw new Error(`Gemini API error ${result.status}: ${await result.text()}`);
      }

      return (await result.json()) as GeminiGenerateContentResponse;
    });

    return {
      provider: 'gemini',
      model: env.GEMINI_MODEL,
      summary: response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() || 'No summary generated',
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0
    };
  }

  private async callWithRetries<T>(provider: ProviderName, maxRetries: number, execute: () => Promise<T>): Promise<T> {
    let lastError: unknown = undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        return await execute();
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) {
          break;
        }

        const backoffMs = 250 * 2 ** (attempt - 1);
        await new Promise((resolve) => {
          setTimeout(resolve, backoffMs);
        });
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`${provider} API request failed`);
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
