import axios from 'axios';

export interface PerplexityResponse {
  choices?: { message: { content: string } }[];
}

export async function analyzeMessageWithPerplexity(prompt: string): Promise<PerplexityResponse | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.warn('Perplexity API key not configured.');
    return null;
  }

  try {
    const response = await axios.post<PerplexityResponse>(
      'https://api.perplexity.ai/chat/completions',
      {
        model: 'sonar',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: prompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            schema: {
              properties: {
                relevant: { title: 'Relevant', type: 'boolean' },
                confidence: { title: 'Confidence', type: 'number' },
                reasoning: { title: 'Reasoning', type: 'string' },
              },
              required: ['relevant', 'confidence', 'reasoning'],
              title: 'RelevanceCheck',
              type: 'object',
            },
          },
        },
      },
      { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` } }
    );
    return response.data;
  } catch (err: any) {
    console.error('Perplexity API error:', err.message);
    return null;
  }
}
