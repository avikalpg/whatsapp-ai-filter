// backend/src/llm/perplexity.ts
import axios from 'axios';

interface PerplexityResponse {
	choices?: { message: { content: string } }[];
	// Define other properties based on the actual API response
}

async function analyzeMessageWithPerplexity(message: string): Promise<PerplexityResponse | null> {
	const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
	const perplexityApiUrl = 'https://api.perplexity.io/chat/completions'; // Check Perplexity API docs

	if (!perplexityApiKey) {
		console.warn('Perplexity API key not found in .env file (required for Perplexity).');
		return null;
	}

	try {
		const response = await axios.post<PerplexityResponse>(
			perplexityApiUrl,
			{
				model: 'sonar-small-online', // Or the model you prefer
				messages: [
					{
						role: 'user',
						content: message
					}
				]
			},
			{
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${perplexityApiKey}`
				}
			}
		);

		console.log('Perplexity API Response (Perplexity):', response.data);
		return response.data;
	} catch (error: any) {
		console.error('Error calling Perplexity API (Perplexity):', error.message);
		return null;
	}
}

export { analyzeMessageWithPerplexity, PerplexityResponse };