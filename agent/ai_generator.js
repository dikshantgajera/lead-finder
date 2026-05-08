const fs = require('fs');
const path = require('path');

// Default configuration for local AI (e.g., Ollama or LM Studio)
const DEFAULT_CONFIG = {
  baseUrl: process.env.AI_BASE_URL || 'http://192.168.1.146:8080/v1',
  model: process.env.AI_MODEL || 'llama3', // or 'mistral', etc.
};

function normalizeBaseUrl(url) {
  return (url || DEFAULT_CONFIG.baseUrl || '').trim().replace(/\/+$/, '');
}

async function parseJsonResponse(response) {
  const rawText = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const bodyStart = rawText.trim().slice(0, 300);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${bodyStart || 'Empty response'}`);
  }

  if (!contentType.toLowerCase().includes('application/json')) {
    console.error('AI endpoint returned non-JSON', {
      status: response.status,
      contentType,
      preview: bodyStart,
    });
    throw new Error(`Non-JSON response: ${bodyStart || 'Empty response'}`);
  }

  try {
    return JSON.parse(rawText);
  } catch (error) {
    console.error('AI endpoint returned invalid JSON', {
      status: response.status,
      contentType,
      preview: bodyStart,
    });
    throw new Error(`Invalid JSON response: ${bodyStart || error.message}`);
  }
}

/**
 * Generate a personalized cold email using a local AI model.
 * 
 * @param {Object} lead - The lead data object.
 * @param {Object} options - Configuration options.
 * @returns {Promise<string>} The generated email text.
 */
async function generateSalesPitch(lead, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const { model, valueProposition } = config;
  const baseUrl = normalizeBaseUrl(config.baseUrl);

  const leadName = lead.name || 'the business';
  const category = lead.category || 'your industry';
  const website = lead.website ? `Their website is ${lead.website}.` : '';
  const address = lead.fullAddress ? `They are located at ${lead.fullAddress}.` : '';

  const defaultProp = 'a premium software solution designed to streamline operations and increase revenue.';
  const proposition = valueProposition || defaultProp;

  const systemPrompt = `You are an expert Sales Development Representative. Your goal is to write a highly personalized, short, and punchy cold email to a prospect.
Do not include placeholders like [Your Name]. Just write the body of the email. Keep it under 150 words. Be conversational, professional, and focus on the value provided.`;

  const userPrompt = `Write a cold email to ${leadName}, a business in the ${category} sector.
${website}
${address}

We are offering them ${proposition}.

Write the email now.`;

  const openAiUrls = [
    `${baseUrl}/chat/completions`,
    `${baseUrl}/v1/chat/completions`
  ];
  const nativeBaseUrl = baseUrl.endsWith('/v1') ? baseUrl.slice(0, -3) : baseUrl;
  const completionUrls = [
    `${baseUrl}/completions`,
    `${baseUrl}/v1/completions`
  ];
  const llamaCppUrls = [
    `${nativeBaseUrl}/completion`
  ];

  const failures = [];

  for (const url of [...new Set(openAiUrls)]) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 300
        })
      });

      const data = await parseJsonResponse(response);
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim()) return content.trim();
      failures.push(`${url} returned JSON without chat content`);
    } catch (error) {
      failures.push(`${url} -> ${error.message}`);
    }
  }

  for (const url of [...new Set(completionUrls)]) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: `${systemPrompt}\n\n${userPrompt}\n\nAssistant:`,
          temperature: 0.7,
          max_tokens: 300
        })
      });

      const data = await parseJsonResponse(response);
      const content = data?.choices?.[0]?.text;
      if (typeof content === 'string' && content.trim()) return content.trim();
      failures.push(`${url} returned JSON without completion text`);
    } catch (error) {
      failures.push(`${url} -> ${error.message}`);
    }
  }

  for (const url of [...new Set(llamaCppUrls)]) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${systemPrompt}\n\n${userPrompt}\n\nAssistant:`,
          n_predict: 300,
          temperature: 0.7
        })
      });

      const data = await parseJsonResponse(response);
      const content = data?.content;
      if (typeof content === 'string' && content.trim()) return content.trim();
      failures.push(`${url} returned JSON without llama.cpp content`);
    } catch (error) {
      failures.push(`${url} -> ${error.message}`);
    }
  }

  const hint = [
    `Unable to reach a compatible AI endpoint for base URL: ${baseUrl}.`,
    'Use your actual llama.cpp server URL, usually either `http://HOST:PORT` or `http://HOST:PORT/v1`.',
    'If you launched the built-in web UI instead of the API server, the app will receive HTML and fail.'
  ].join(' ');

  const error = new Error(`${hint} Tried: ${failures.join(' | ')}`);
  console.error('Error generating AI pitch:', error);
  throw error;
}

module.exports = {
  generateSalesPitch,
  DEFAULT_CONFIG
};
