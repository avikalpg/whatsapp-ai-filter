import axios from 'axios';

export interface OpenAiResponse {
  choices?: { message: { content: string } }[];
}

export async function analyzeMessageWithOpenAi(prompt: string): Promise<OpenAiResponse | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('OpenAI API key not configured.');
    return null;
  }

  try {
    const response = await axios.post<OpenAiResponse>(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      },
      { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, timeout: 15000 }
    );
    return response.data;
  } catch (err: any) {
    console.error('OpenAI API error:', err.message);
    return null;
  }
}
