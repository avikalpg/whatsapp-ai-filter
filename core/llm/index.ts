// backend/src/llm/index.ts

import { analyzeMessageWithPerplexity, PerplexityResponse } from './perplexity.js';
import { analyzeMessageWithOpenAi, OpenAiResponse } from './openai.js';

interface LLMResponse {
	content?: string;
	relevant?: boolean;
	provider?: 'perplexity' | 'openai' | string;
	rawResponse?: PerplexityResponse | OpenAiResponse | any;
	[key: string]: any;
}

class LLMOrchestrator {
	private availableProviders: { name: string; analyze: (message: string) => Promise<LLMResponse | null> }[] = [];

	constructor() {
		this.initProviders();
	}

	private initProviders() {
		if (process.env.PERPLEXITY_API_KEY) {
			this.availableProviders.push({
				name: 'perplexity',
				analyze: async (message: string) => {
					const result = await analyzeMessageWithPerplexity(message);
					if (result) {
						return {
							content: result.choices?.[0]?.message?.content,
							relevant: result.choices?.[0]?.message?.content?.includes('Bengaluru'), // Example relevance logic
							provider: 'perplexity',
							rawResponse: result,
						};
					}
					return null;
				},
			});
		}

		if (process.env.OPENAI_API_KEY) {
			this.availableProviders.push({
				name: 'openai',
				analyze: async (message: string) => {
					const result = await analyzeMessageWithOpenAi(message);
					if (result) {
						return {
							content: result.choices?.[0]?.message?.content,
							relevant: result.choices?.[0]?.message?.content?.includes('AI code generation'), // Example relevance logic
							provider: 'openai',
							rawResponse: result,
						};
					}
					return null;
				},
			});
		}

		console.log('Available LLM Providers:', this.availableProviders.map(p => p.name));
	}

	async analyzeMessage(message: string): Promise<LLMResponse | null> {
		if (this.availableProviders.length === 0) {
			console.warn('No LLM providers are available.');
			return null;
		}

		for (const provider of this.availableProviders) {
			console.log(`Attempting to analyze with ${provider.name}...`);
			const result = await provider.analyze(message);
			if (result) {
				console.log(`Message analyzed successfully by ${provider.name}.`);
				return result;
			} else {
				console.warn(`${provider.name} failed to analyze the message. Trying next provider...`);
			}
		}

		console.warn('All available LLM providers failed to analyze the message.');
		return null;
	}
}

const llmOrchestrator = new LLMOrchestrator();
export const analyzeMessageWithLLM = (message: string) => llmOrchestrator.analyzeMessage(message);
export type { LLMResponse };