// api/audit.js
// Vercel serverless function — proxies requests to Groq
// Your GROQ_API_KEY stays here on the server, never exposed to users

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { content } = req.body;
  if (!content) {
    return res.status(400).json({ error: 'No content provided' });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'Server not configured. Please set GROQ_API_KEY.' });
  }

  const prompt = `You are a question paper proofreader. Analyze the question paper below and check ONLY these 4 things. Do not check anything else.

CHECK ONLY:
1. duplicate_question_number — same question number appears more than once (e.g. Q5 used twice)
2. duplicate_options — within a single question, two or more options have identical text
3. question_ordering — question numbers are not in ascending order (e.g. 1, 2, 4, 3, 5)
4. spelling — a word is clearly misspelled (e.g. "folowing" instead of "following")

IGNORE everything else — do not flag grammar, punctuation, answer correctness, meaning, or anything else.

Return ONLY a valid JSON object, no markdown, no explanation:
{
  "total_questions": <integer>,
  "issues": [
    {
      "id": <unique integer starting from 1>,
      "question_num": "<e.g. Q3>",
      "category": "<duplicate_question_number | duplicate_options | question_ordering | spelling>",
      "severity": "<high | medium | low>",
      "description": "<short factual description>",
      "suggestion": "<exact fix>",
      "confidence": <float 0.0-1.0>,
      "original_text": "<the exact problematic text, max 80 chars>"
    }
  ],
  "quality_score": <integer 0-100>,
  "summary": "<one sentence summary>"
}

SEVERITY: high = duplicate question number or ordering, medium = duplicate options, low = spelling

QUESTION PAPER:
${content.substring(0, 8000)}`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        max_tokens: 4096,
        messages: [
          {
            role: 'system',
            content: 'You are a question paper proofreader. Respond with valid JSON only — no markdown, no text before or after.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || 'Groq API error' });
    }

    const data = await groqRes.json();
    let raw = data.choices?.[0]?.message?.content || '';
    raw = raw.replace(/```json|```/g, '').trim();

    const result = JSON.parse(raw);
    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}