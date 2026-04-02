import { jest } from '@jest/globals';

describe('AnthropicDraftAdapter provider chain', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('falls back to local stub when no provider is configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    process.env.LLM_PROVIDER_ORDER = 'anthropic,openai,gemini';

    const { AnthropicDraftAdapter } = await import('../../src/services/anthropic-draft-adapter');
    const adapter = new AnthropicDraftAdapter();

    const result = await adapter.generate({
      triggerData: { source: 'gmail' },
      context: { customerId: 'C-42' }
    });

    expect(result.model).toBe('fallback-stub');
    expect(result.summary).toContain('source=gmail');
    expect(result.costUsd).toBe(0);
  });

  it('fails over from anthropic to openai when anthropic request fails', async () => {
    process.env.LLM_PROVIDER_ORDER = 'anthropic,openai';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.ANTHROPIC_MAX_RETRIES = '1';
    process.env.OPENAI_MAX_RETRIES = '1';

    const mockFetch: typeof fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'anthropic unavailable'
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'gpt-4o-mini',
          choices: [{ message: { content: 'OpenAI drafted approval summary' } }],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 30
          }
        })
      } as Response);

    const { AnthropicDraftAdapter } = await import('../../src/services/anthropic-draft-adapter');
    const adapter = new AnthropicDraftAdapter(mockFetch);

    const result = await adapter.generate({
      triggerData: { source: 'drive' },
      context: { customerId: 'C-99' }
    });

    expect(result.model).toBe('openai:gpt-4o-mini');
    expect(result.summary).toBe('OpenAI drafted approval summary');
    expect(result.tokenUsage.totalTokens).toBe(150);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
