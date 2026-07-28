// api/audit.js — Google Gemini text API (free, high limits)
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { body = {}; }
  }

  let content = body.content || '';
  if (!content) return res.status(400).json({ error: 'No content provided' });

  // Clean PDF extraction artifacts: merge words broken by spaces (e.g. 'aqu eous' → 'aqueous')
  // Only merge if both parts are lowercase and short (broken word, not two real words)
  content = content.replace(/([a-z]{2,})\s([a-z]{2,})(?=\s)/g, (match, a, b) => {
    // Only merge if combined length is reasonable word length (<=12)
    if ((a + b).length <= 12) return a + b;
    return match;
  });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'Server not configured. Set GEMINI_API_KEY.' });

  console.log('DEBUG content len:', content.length);

  const CHUNK_SIZE = 30000;
  const chunks = [];
  for (let i = 0; i < content.length; i += CHUNK_SIZE) {
    chunks.push(content.substring(i, i + CHUNK_SIZE));
  }
  console.log('DEBUG chunks:', chunks.length);

  const allIssues = [];
  let totalQuestions = 0;
  let idCounter = 1;

  for (let c = 0; c < chunks.length; c++) {
    const prompt = `You are auditing an exam question paper.

IMPORTANT: The paper may start with a header and "IMPORTANT INSTRUCTIONS" with numbered points like "1. Use of calculator is prohibited". COMPLETELY IGNORE these — they are NOT questions.

Real exam questions ALWAYS have 4 answer options labeled (1)(2)(3)(4) or (A)(B)(C)(D) below them.

Find ONLY these issues:

1. duplicate_question_number: A question number appears more than once (e.g. Q5 in both PHYSICS and CHEMISTRY sections)

2. missing_question_number: A question number is skipped (e.g. questions go 9, 11 — question 10 is missing). Only check numbers of real questions that have 4 options.

3. question_ordering: Questions are out of ascending order (e.g. Q9 comes after Q10)

4. duplicate_options: Two or more of the 4 options inside ONE question are 100% character-for-character identical. Example: option (3) says "7860" AND option (4) also says "7860". NOT duplicates: "p" and "-p", "sinθ" and "-sinθ".

5. spelling: A word in a question is clearly misspelled (wrong letters). Not numbers or formulas.
   IMPORTANT: This is PDF-extracted text. Some words may appear broken with a space (e.g. 'aqu eous', 'nitro gen') or joined together without space (e.g. 'Aquaregia' instead of 'Aqua regia', 'sodiumchloride' instead of 'sodium chloride'). Do NOT flag these as spelling errors — they are PDF extraction artifacts, not real mistakes. Only flag genuinely misspelled words where the letters themselves are wrong.

Return ONLY valid JSON, no markdown:
{
  "total_questions": <count of real questions with 4 options in this chunk>,
  "issues": [
    {
      "id": ${idCounter},
      "question_num": "Q5",
      "category": "duplicate_question_number | missing_question_number | question_ordering | duplicate_options | spelling",
      "severity": "high | medium | low",
      "description": "clear description",
      "suggestion": "exact fix",
      "confidence": 0.95,
      "original_text": "exact text max 80 chars"
    }
  ]
}

SEVERITY: high = duplicate/missing/ordering, medium = duplicate options, low = spelling

CHUNK ${c + 1} of ${chunks.length}:
${chunks[c]}`;

    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
          }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API error ${resp.status}`);
      }

      const data = await resp.json();
      let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      raw = raw.replace(/```json|```/g, '').trim();
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        try {
          const result = JSON.parse(raw.substring(start, end + 1));
          totalQuestions += result.total_questions || 0;
          (result.issues || []).forEach(issue => {
            allIssues.push({ ...issue, id: idCounter++ });
          });
        } catch (parseErr) {
          console.log('DEBUG parse error chunk', c, parseErr.message);
          // Try to extract partial issues array
          try {
            const issuesMatch = raw.match(/"issues"\s*:\s*\[([\s\S]*?)\]/);
            const tqMatch = raw.match(/"total_questions"\s*:\s*(\d+)/);
            if (tqMatch) totalQuestions += parseInt(tqMatch[1]);
            if (issuesMatch) {
              const partial = JSON.parse("[" + issuesMatch[1] + "]");
              partial.forEach(issue => allIssues.push({ ...issue, id: idCounter++ }));
            }
          } catch { /* skip broken chunk */ }
        }
      }
    } catch (err) {
      console.log('DEBUG chunk error:', c, err.message);
    }
  }

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