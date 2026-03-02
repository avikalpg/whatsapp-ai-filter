import { analyzeMessageWithPerplexity } from './perplexity.js';
import { analyzeMessageWithOpenAi } from './openai.js';
import { RelevanceCheckResponseSchema } from './schemas.js';

export interface LLMResponse {
  relevant: boolean | null;
  confidence?: number;
  reasoning?: string;
  provider?: string;
}

type ProviderFn = (message: string, prompt: string) => Promise<LLMResponse | null>;

function buildPrompt(messageBody: string, filterPrompt: string): string {
  return (
    `You are evaluating a WhatsApp message against a filter criterion.\n` +
    `Filter: "${filterPrompt}"\n` +
    `Message: "${messageBody}"\n\n` +
    `Respond with a JSON object: {"relevant": boolean, "confidence": number (0-1), "reasoning": string}`
  );
}

function buildProviders(): { name: string; fn: ProviderFn }[] {
  const providers: { name: string; fn: ProviderFn }[] = [];

  if (process.env.PERPLEXITY_API_KEY) {
    providers.push({
      name: 'perplexity',
      fn: async (message, prompt) => {
        const result = await analyzeMessageWithPerplexity(buildPrompt(message, prompt));
        if (!result?.choices?.[0]?.message?.content) return null;
        try {
          const parsed = RelevanceCheckResponseSchema.parse(
            JSON.parse(result.choices[0].message.content)
          );
          return { ...parsed, provider: 'perplexity' };
        } catch {
          return null;
        }
      },
    });
  }

  if (process.env.OPENAI_API_KEY) {
    providers.push({
      name: 'openai',
      fn: async (message, prompt) => {
        const result = await analyzeMessageWithOpenAi(buildPrompt(message, prompt));
        if (!result?.choices?.[0]?.message?.content) return null;
        try {
          const parsed = RelevanceCheckResponseSchema.parse(
            JSON.parse(result.choices[0].message.content)
          );
          return { ...parsed, provider: 'openai' };
        } catch {
          return null;
        }
      },
    });
  }

  return providers;
}

const providers = buildProviders();

export async function analyzeMessageWithLLM(
  messageBody: string,
  filterPrompt: string
): Promise<LLMResponse> {
  if (providers.length === 0) {
    throw new Error('No LLM providers configured. Set PERPLEXITY_API_KEY or OPENAI_API_KEY.');
  }

  for (const provider of providers) {
    try {
      const result = await provider.fn(messageBody, filterPrompt);
      if (result && result.relevant !== undefined && result.relevant !== null) {
        return result;
      }
    } catch (err) {
      console.error(`LLM provider ${provider.name} failed:`, err);
    }
  }

  return { relevant: false, reasoning: 'All LLM providers failed to analyze the message.' };
}
