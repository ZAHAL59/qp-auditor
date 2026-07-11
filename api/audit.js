// api/audit.js — OpenRouter + Gemini 2.0 Flash (free, vision supported)
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { body = {}; }
  }

  const { content, images } = body;
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'Server not configured. Set OPENROUTER_API_KEY.' });

  console.log('DEBUG mode:', images ? `vision (${images.length} pages)` : 'text', 'content len:', (content || '').length);

  const SYSTEM_PROMPT = `You are an expert question paper proofreader for competitive exams (JEE, NEET, etc.).

Carefully read the question paper and detect ONLY these issues:

1. duplicate_question_number — A top-level question number appears more than once.
   IGNORE: sub-items in match-the-column (e.g. "1. Terminal centromere"), option labels (1)(2)(3)(4), decimal numbers (1.806).

2. missing_question_number — A top-level question number is skipped (e.g. 9 then 11 — 10 is missing).

3. question_ordering — Top-level question numbers are out of sequence (e.g. 8, 9, 7, 10).

4. duplicate_options — Within one question, two or more answer options are EXACTLY identical.
   You can read chemistry formulas, Greek letters (α β γ θ), charge symbols (⊕ ⊖), radical dots (Ċ), structural formulas.
   Example: option (3) is "CH₃CH₂ and Cl⊕" and option (4) is also "CH₃CH₂ and Cl⊕" → duplicate.
   NOT duplicates: "Cl·" and "Cl⊕" (different), "p" and "-p" (different signs), "x" and "2x" (different).

5. spelling — A clearly misspelled English word. Not numbers or chemistry symbols.

Return ONLY valid JSON, no markdown:
{
  "total_questions": <integer>,
  "issues": [
    {
      "id": <unique integer from 1>,
      "question_num": "<e.g. Q11>",
      "category": "<duplicate_question_number | missing_question_number | question_ordering | duplicate_options | spelling>",
      "severity": "<high | medium | low>",
      "description": "<specific description>",
      "suggestion": "<exact fix>",
      "confidence": <0.0-1.0>,
      "original_text": "<exact problematic text, max 80 chars>"
    }
  ],
  "quality_score": <0-100>,
  "summary": "<one sentence>"
}

SEVERITY: high = duplicate/missing question number or ordering, medium = duplicate options, low = spelling`;

  const callOpenRouter = async (messages) => {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://qp-auditor.vercel.app',
        'X-Title': 'QP Auditor',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free',
        max_tokens: 4096,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenRouter API error ${resp.status}`);
    }

    const data = await resp.json();
    let raw = data.choices?.[0]?.message?.content || '';
    raw = raw.replace(/```json|```/g, '').trim();
    console.log('DEBUG raw:', raw.substring(0, 150));
    return JSON.parse(raw);
  };

  try {
    const allIssues = [];
    let totalQuestions = 0;
    let idCounter = 1;
    let summaryText = '';

    if (images && images.length > 0) {
      // ── VISION MODE: 2 pages per batch ──
      const BATCH = 2;

      for (let i = 0; i < images.length; i += BATCH) {
        const batch = images.slice(i, i + BATCH);

        const userContent = [
          ...batch.map(img => ({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${img.base64}` },
          })),
          {
            type: 'text',
            text: `These are pages ${i + 1}–${Math.min(i + BATCH, images.length)} of ${images[images.length - 1].totalPages}. Analyze and return the JSON audit result.`,
          },
        ];

        console.log(`DEBUG processing pages ${i + 1}-${Math.min(i + BATCH, images.length)}`);
        const batchResult = await callOpenRouter([{ role: 'user', content: userContent }]);
        totalQuestions += batchResult.total_questions || 0;
        summaryText = batchResult.summary || '';
        (batchResult.issues || []).forEach(issue => {
          allIssues.push({ ...issue, id: idCounter++ });
        });

        // Delay between batches to avoid rate limit
        if (i + BATCH < images.length) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

    } else {
      // ── TEXT MODE: for DOCX/TXT ──
      if (!content) return res.status(400).json({ error: 'No content provided' });

      const CHUNK = 15000;
      const chunks = [];
      for (let i = 0; i < content.length; i += CHUNK) {
        chunks.push(content.substring(i, i + CHUNK));
        if (i + CHUNK >= content.length) break;
      }

      for (let i = 0; i < chunks.length; i++) {
        const chunkResult = await callOpenRouter([{
          role: 'user',
          content: `QUESTION PAPER (part ${i + 1}/${chunks.length}):\n\n${chunks[i]}\n\nReturn the JSON audit result.`,
        }]);
        totalQuestions += chunkResult.total_questions || 0;
        summaryText = chunkResult.summary || '';
        (chunkResult.issues || []).forEach(issue => {
          allIssues.push({ ...issue, id: idCounter++ });
        });

        if (i + 1 < chunks.length) await new Promise(r => setTimeout(r, 1000));
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

    console.log('DEBUG total issues:', dedupedIssues.length, 'questions:', totalQuestions);

    return res.status(200).json({
      total_questions: totalQuestions,
      issues: dedupedIssues,
      quality_score: quality,
      summary: summaryText || `Found ${dedupedIssues.length} issue(s) across ${totalQuestions} questions.`,
    });

  } catch (err) {
    console.log('DEBUG error:', err.message);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};