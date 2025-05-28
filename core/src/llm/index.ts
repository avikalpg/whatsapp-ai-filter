// core/src/llm/index.ts
import { analyticsManager } from '../analyticsManager.js';
import { analyzeMessageWithPerplexity, PerplexityResponse } from './perplexity.js';
import { analyzeMessageWithOpenAi, OpenAiResponse } from './openai.js';
import { z } from 'zod';
import { RelevanceCheckResponseSchema, RelevanceCheckResponse } from './schemas.js';
import { loadUserConfig, userConfig } from '../dataStore.js';

interface LLMResponse {
	relevant: boolean | null;
	reasoning?: string;
	provider?: 'perplexity' | 'openai' | string;
	rawResponse?: PerplexityResponse | OpenAiResponse | any;
}

class LLMOrchestrator {
	private availableProviders: { name: string; analyze: (message: string, interests: string) => Promise<LLMResponse | null> }[] = [];

	constructor() {
		this.initProviders();
	}

	private initProviders() {
		if (process.env.PERPLEXITY_API_KEY) {
			this.availableProviders.push({
				name: 'perplexity',
				analyze: async (message: string, interests: string) => {
					const prompt = `Given the user's interests: "${interests}". Determine if the following WhatsApp message is relevant to these interests along with your confidence on your response and the reason why you think the given message is or isn't relevant to the user's interests. Respond with a JSON object conforming to the schema: {"relevant": boolean, "confidence": number, "reasoning": string}. Message: "${message}"`;
					const result = await analyzeMessageWithPerplexity(prompt);
					if (result?.choices?.[0]?.message?.content) {
						try {
							const parsedResponse = RelevanceCheckResponseSchema.parse(JSON.parse(result.choices[0].message.content));
							return {
								relevant: parsedResponse.relevant,
								confidence: parsedResponse.confidence,
								reasoning: parsedResponse.reasoning,
								provider: 'perplexity',
								rawResponse: result,
							};
						} catch (error: any) {
							console.error('Perplexity response parsing error:', error.message, result.choices[0].message.content);
						}
					}
					return null;
				},
			});
		}

		if (process.env.OPENAI_API_KEY) {
			this.availableProviders.push({
				name: 'openai',
				analyze: async (message: string, interests: string) => {
					const prompt = `Given the user's interests: "${interests}". Determine if the following WhatsApp message is relevant to these interests along with your confidence on your response and the reason why you think the given message is or isn't relevant to the user's interests. Respond with a JSON object conforming to the schema: {"relevant": boolean, "confidence": number, "reasoning": string}. Message: "${message}"`;
					const result = await analyzeMessageWithOpenAi(prompt);
					if (result?.choices?.[0]?.message?.content) {
						try {
							const parsedResponse = RelevanceCheckResponseSchema.parse(JSON.parse(result.choices[0].message.content));
							return {
								relevant: parsedResponse.relevant,
								confidence: parsedResponse.confidence,
								reasoning: parsedResponse.reasoning,
								provider: 'openai',
								rawResponse: result,
							};
						} catch (error: any) {
							console.error('OpenAI response parsing error:', error.message, result.choices[0].message.content);
						}
					}
					return null;
				},
			});
		}

		console.debug('Available LLM Providers:', this.availableProviders.map(p => p.name));
	}

	async analyzeMessage(message: string): Promise<LLMResponse | null> {
		loadUserConfig();
		const interests = userConfig.interests?.length ? userConfig.interests.join(', ') : null;

		if (!interests) {
			console.warn('User interests not defined.');
			throw new Error('User interests not defined. Please set your interests using the command: `!set interests=<your_interests>`');
		}

		if (this.availableProviders.length === 0) {
			console.warn('No LLM providers are available.');
			throw new Error('No LLM providers are available. Please check your environment setup.');
		}

		for (const provider of this.availableProviders) {
			console.debug(`Attempting to analyze with ${provider.name}...`);
			const startTime = Date.now();

			analyticsManager.addAiProviderMessageCount(provider.name); // Track message count for this provider

			let result: LLMResponse | null = null; // Initialize result to null
			try {
				// Attempt to analyze the message with the current provider
				result = await provider.analyze(message, interests);
				const latency = Date.now() - startTime; // Calculate latency only on success

				analyticsManager.recordAiApiLatency(provider.name, latency);
				analyticsManager.incrementAiApiSuccess(provider.name);

			} catch (error) {
				console.error(`Error analyzing message with ${provider.name}:`, error);
				analyticsManager.incrementAiApiFailure(provider.name);
				result = null;
			}

			// If the provider returned a valid result (not null and has 'relevant' field)
			if (result && result.relevant !== undefined && result.relevant !== null) {
				console.debug(`Message analyzed successfully by ${provider.name}. Relevant: ${result.relevant}, Reasoning: ${result.reasoning}`);
				return result;
			} else {
				console.warn(`${provider.name} returned null, failed, or provided invalid analysis. Trying next provider...`);
			}
		}

		console.warn('All available LLM providers failed to provide a valid analysis.');
		return { relevant: false, reasoning: 'All LLM providers failed to analyze the message.' };
	}
}

const llmOrchestrator = new LLMOrchestrator();
export const analyzeMessageWithLLM = (message: string) => llmOrchestrator.analyzeMessage(message);
export type { LLMResponse };