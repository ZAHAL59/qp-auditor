// api/audit.js — Full AI approach, strict prompt
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { body = {}; }
  }

  const content = body.content || '';
  if (!content) return res.status(400).json({ error: 'No content provided' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'Server not configured. Set GROQ_API_KEY.' });

  console.log('DEBUG content len:', content.length);

  // Split into chunks with overlap
  const CHUNK_SIZE = 4000;
  const chunks = [];
  for (let i = 0; i < content.length; i += CHUNK_SIZE) {
    chunks.push(content.substring(i, i + CHUNK_SIZE));
  }
  console.log('DEBUG chunks:', chunks.length);

  const allIssues = [];
  let totalQuestions = 0;
  let idCounter = 1;

  for (let c = 0; c < chunks.length; c++) {
    if (c > 0) await new Promise(r => setTimeout(r, 10000));

    const prompt = `You are auditing a question paper. The paper may have a header section with "IMPORTANT INSTRUCTIONS" containing numbered points like "1. Use of calculator is prohibited". IGNORE those completely — they are NOT questions.

Real exam questions always have 4 answer options labeled (1)(2)(3)(4) or (A)(B)(C)(D) below them.

From this text, find ONLY these issues:

1. duplicate_question_number: A question number is used more than once (e.g. question 5 appears in both PHYSICS and CHEMISTRY sections)

2. missing_question_number: A question number is skipped in the sequence. For example if you see questions 9 and 11 but no question 10, then 10 is missing. Only check questions that have 4 answer options.

3. question_ordering: Questions are not in ascending order (e.g. question 8 comes after question 9)

4. duplicate_options: Inside one question, two or more of the 4 options (1)(2)(3)(4) have EXACTLY the same text. For example option (3) says "7860" and option (4) also says "7860". Only flag when they are 100% character-for-character identical. "p" and "-p" are NOT duplicates.

5. spelling: A word in a question is clearly misspelled. NOT numbers or formulas.

RULES:
- Numbered items in IMPORTANT INSTRUCTIONS are NOT questions — ignore them completely
- Only count numbers as question numbers if they have 4 answer options below them
- For duplicate_options: only flag when options are truly identical word-for-word

Return ONLY valid JSON:
{
  "total_questions": <number of real exam questions found in this chunk>,
  "issues": [
    {
      "id": ${idCounter},
      "question_num": "Q5",
      "category": "duplicate_question_number | missing_question_number | question_ordering | duplicate_options | spelling",
      "severity": "high | medium | low",
      "description": "clear description",
      "suggestion": "exact fix",
      "confidence": 0.9,
      "original_text": "exact text max 80 chars"
    }
  ]
}

CHUNK ${c + 1} of ${chunks.length}:
${chunks[c]}`;

    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          temperature: 0.1,
          max_tokens: 4096,
          messages: [
            {
              role: 'system',
              content: 'You are a strict exam paper auditor. Only flag real issues. Never flag instruction section numbers as question numbers. Only flag duplicate options when they are 100% identical. Return valid JSON only.',
            },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!groqRes.ok) {
        const err = await groqRes.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Groq API error');
      }

      const data = await groqRes.json();
      let raw = data.choices?.[0]?.message?.content || '';
      raw = raw.replace(/```json|```/g, '').trim();

      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        const result = JSON.parse(raw.substring(start, end + 1));
        totalQuestions += result.total_questions || 0;
        (result.issues || []).forEach(issue => {
          allIssues.push({ ...issue, id: idCounter++ });
        });
      }
    } catch (err) {
      console.log('DEBUG chunk error:', c, err.message);
    }
  }

  // Deduplicate
  const seen = new Set();
  const dedupedIssues = allIssues.filter(issue => {
    const key = `${issue.question_num}-${issue.category}-${issue.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((issue, i) => ({ ...issue, id: i + 1 }));

  const highCount = dedupedIssues.filter(i => i.severity === 'high').length;
  const medCount = dedupedIssues.filter(i => i.severity === 'medium').length;
  const lowCount = dedupedIssues.filter(i => i.severity === 'low').length;
  const quality = Math.max(0, 100 - (highCount * 10) - (medCount * 5) - (lowCount * 2));

  return res.status(200).json({
    total_questions: totalQuestions,
    issues: dedupedIssues,
    quality_score: quality,
    summary: `Found ${dedupedIssues.length} issue(s) across ${totalQuestions} questions.`,
  });
};