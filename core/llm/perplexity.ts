// backend/src/llm/perplexity.ts
import axios from 'axios';
import { RelevanceCheckResponseSchema, RelevanceCheckResponse } from './schemas.js';

interface PerplexityResponse {
	choices?: { message: { content: string } }[];
	// Define other properties based on the actual API response
}

async function analyzeMessageWithPerplexity(prompt: string): Promise<PerplexityResponse | null> {
	const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
	const perplexityApiUrl = 'https://api.perplexity.ai/chat/completions'; // Check Perplexity API docs

	if (!perplexityApiKey) {
		console.warn('Perplexity API key not found in .env file (required for Perplexity).');
		return null;
	}

	try {
		const response = await axios.post<PerplexityResponse>(
			perplexityApiUrl,
			{
				model: 'sonar',
				messages: [
					{
						role: 'user',
						content: prompt
					}
				],
				response_format: { type: 'json_object' } // Explicitly request JSON response
			},
			{
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${perplexityApiKey}`
				}
			}
		);

		console.debug('Perplexity API Response (Perplexity):', response.data);
		return response.data;
	} catch (error: any) {
		console.error('Error calling Perplexity API (Perplexity):', error.message);
		console.error('Error details:', error.response?.data || error);
		return null;
	}
}

export { analyzeMessageWithPerplexity, PerplexityResponse };