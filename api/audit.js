// api/audit.js
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { body = {}; }
  }

  const content = body.content || '';
  console.log('DEBUG content length:', content.length);

  if (!content) return res.status(400).json({ error: 'No content provided' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'Server not configured.' });

  const prompt = `You are a question paper proofreader. Analyze the question paper below and check ONLY these 4 things:

1. duplicate_question_number — The MAIN question number (e.g. "5.", "21.") appears more than once in the paper. 
   IMPORTANT: Ignore sub-items inside match-the-column questions (like "1. Terminal centromere" in Column II). Only flag the top-level question numbers.

2. missing_question_number — A top-level question number is skipped in the sequence. For example, if questions go 9, 11 — then 10 is missing.
   IMPORTANT: Only check top-level question numbers, not column sub-items or option numbers.

3. duplicate_options — Within a single question, two or more answer options have EXACTLY identical text or value.
   Example: option (3) is "7860" and option (4) is also "7860".
   NOT duplicates: "p" and "-p", "x" and "2x", "sinθ" and "-sinθ" (different signs/coefficients).

4. spelling — A word in a question is clearly misspelled (wrong letters). 
   NOT spelling errors: numbers, math expressions, repeated values.

IMPORTANT RULES:
- For question numbering checks: only consider TOP-LEVEL question numbers (the main numbered questions like 1, 2, 3... or 5, 6, 9, 11...). 
  Ignore: option labels (1)(2)(3)(4), column sub-items (1. Terminal, 2. Centromere), decimal numbers (1.806, 6.023).
- Only flag duplicate_options when options are 100% character-for-character identical.
- Only flag spelling for actual misspelled English words.

Return ONLY valid JSON, no markdown, no explanation:
{
  "total_questions": <integer — count of top-level questions only>,
  "issues": [
    {
      "id": <unique integer starting from 1>,
      "question_num": "<e.g. Q5, Q11>",
      "category": "<duplicate_question_number | missing_question_number | duplicate_options | spelling | question_ordering>",
      "severity": "<high | medium | low>",
      "description": "<clear short description of the exact problem>",
      "suggestion": "<exact fix>",
      "confidence": <float 0.0-1.0>,
      "original_text": "<exact problematic text from paper, max 80 chars>"
    }
  ],
  "quality_score": <integer 0-100>,
  "summary": "<one sentence overall summary>"
}

SEVERITY:
- high: duplicate question number, missing question number, question out of order
- medium: duplicate options
- low: spelling mistake

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
            content: 'You are a strict question paper proofreader. You understand the difference between top-level question numbers and sub-items inside match-the-column questions. Respond with valid JSON only.',
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
    console.log('DEBUG AI raw:', raw.substring(0, 200));

    const result = JSON.parse(raw);
    return res.status(200).json(result);

  } catch (err) {
    console.log('DEBUG error:', err.message);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};