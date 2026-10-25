import OpenAI from 'openai';

// OpenRouter speaks the OpenAI chat-completions API, so the OpenAI SDK works with a different base URL.
// Created on first use, so code that never calls the model (like the tests) doesn't need a key.
let client;
const llm = () => (client ??= new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL || 'https://web1-nine-smoky.vercel.app',
    'X-Title': 'SideQuest',
  },
}));

const MODEL = process.env.LLM_MODEL || 'openai/gpt-4o-mini';

// Some models reject response_format; remember that and stop sending it.
let jsonModeSupported = true;

function parseJSON(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error(`Model did not return JSON: ${text.slice(0, 200)}`);
  }
}

/**
 * One LLM call that must come back as a JSON object.
 * `user` can be a string or any object (sent as pretty JSON).
 */
export async function askJSON(system, user, { temperature = 0.7, retries = 1 } = {}) {
  const messages = [
    { role: 'system', content: `${system}\n\nRespond with one JSON object and nothing else.` },
    { role: 'user', content: typeof user === 'string' ? user : JSON.stringify(user, null, 2) },
  ];

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await llm().chat.completions.create({
        model: MODEL,
        messages,
        temperature,
        ...(jsonModeSupported ? { response_format: { type: 'json_object' } } : {}),
      });
      return parseJSON(res.choices[0]?.message?.content ?? '');
    } catch (err) {
      if (jsonModeSupported && err?.status === 400 && /response_format|json/i.test(err.message)) {
        jsonModeSupported = false;
        continue;
      }
      if (attempt >= retries) throw err;
    }
  }
}

export { MODEL };
