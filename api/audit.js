// api/audit.js — Gemini Vision for PDF images, Gemini text for DOCX/TXT
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { body = {}; }
  }

  const { content, images } = body;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'Server not configured. Set GEMINI_API_KEY.' });

  console.log('DEBUG mode:', images ? `vision (${images.length} pages)` : 'text', 'content len:', (content||'').length);

  const SYSTEM_PROMPT = `You are an expert question paper proofreader for competitive exams (JEE, NEET, etc.).

Carefully read the question paper and detect ONLY these issues:

1. duplicate_question_number — A top-level question number appears more than once in the paper.
   IGNORE: sub-items in match-the-column (e.g. "1. Terminal centromere"), option labels (1)(2)(3)(4), decimal numbers.

2. missing_question_number — A top-level question number is skipped (e.g. questions go 9, 11 — number 10 is missing).

3. question_ordering — Top-level question numbers are out of sequence (e.g. 8, 9, 7, 10).

4. duplicate_options — Within one question, two or more answer options are EXACTLY identical.
   You can read chemistry formulas, Greek letters (α β γ θ), charge symbols (⊕ ⊖), radical dots (Ċ), structural formulas.
   Example: option (3) is "CH₃CH₂ and Cl⊕" and option (4) is also "CH₃CH₂ and Cl⊕" → duplicate.
   NOT duplicates: "Cl·" and "Cl⊕" (different), "p" and "-p" (different signs).

5. spelling — A word is clearly misspelled. Not numbers or chemistry symbols.

Return ONLY valid JSON, no markdown:
{
  "total_questions": <integer>,
  "issues": [
    {
      "id": <unique integer from 1>,
      "question_num": "<e.g. Q11>",
      "category": "<duplicate_question_number | missing_question_number | question_ordering | duplicate_options | spelling>",
      "severity": "<high | medium | low>",
      "description": "<specific description — for duplicate options show the exact identical text>",
      "suggestion": "<exact fix>",
      "confidence": <0.0-1.0>,
      "original_text": "<exact problematic text, max 80 chars>"
    }
  ],
  "quality_score": <0-100>,
  "summary": "<one sentence>"
}

SEVERITY: high = duplicate/missing question number or ordering, medium = duplicate options, low = spelling`;

  try {
    let geminiResponse;

    if (images && images.length > 0) {
      // ── VISION MODE: process pages in batches of 5 ──
      const BATCH = 5;
      const allIssues = [];
      let totalQuestions = 0;
      let idCounter = 1;
      let summaryText = '';

      for (let i = 0; i < images.length; i += BATCH) {
        const batch = images.slice(i, i + BATCH);
        const parts = [
          { text: SYSTEM_PROMPT + `\n\nThis is pages ${i+1}–${Math.min(i+BATCH, images.length)} of ${images[images.length-1].totalPages}. Analyze carefully.` },
          ...batch.map(img => ({
            inline_data: { mime_type: 'image/jpeg', data: img.base64 }
          })),
          { text: 'Return the JSON audit result for these pages only.' }
        ];

        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts }] }),
          }
        );

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error?.message || `Gemini API error ${resp.status}`);
        }

        const data = await resp.json();
        let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        raw = raw.replace(/```json|```/g, '').trim();
        console.log(`DEBUG batch ${i/BATCH+1} raw:`, raw.substring(0, 150));

        const batchResult = JSON.parse(raw);
        totalQuestions += batchResult.total_questions || 0;
        summaryText = batchResult.summary || '';
        (batchResult.issues || []).forEach(issue => {
          allIssues.push({ ...issue, id: idCounter++ });
        });
      }

      // Deduplicate issues from overlapping batches
      const seen = new Set();
      const dedupedIssues = allIssues.filter(issue => {
        const key = `${issue.question_num}-${issue.category}-${issue.description}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const highCount = dedupedIssues.filter(i => i.severity === 'high').length;
      const medCount  = dedupedIssues.filter(i => i.severity === 'medium').length;
      const lowCount  = dedupedIssues.filter(i => i.severity === 'low').length;
      const quality   = Math.max(0, 100 - (highCount * 10) - (medCount * 5) - (lowCount * 2));

      return res.status(200).json({
        total_questions: totalQuestions,
        issues: dedupedIssues,
        quality_score: quality,
        summary: summaryText || `Found ${dedupedIssues.length} issue(s).`,
      });

    } else {
      // ── TEXT MODE: for DOCX/TXT ──
      if (!content) return res.status(400).json({ error: 'No content provided' });

      const CHUNK = 15000;
      const chunks = [];
      for (let i = 0; i < content.length; i += CHUNK) {
        chunks.push(content.substring(i, i + CHUNK));
        if (i + CHUNK >= content.length) break;
      }

      const allIssues = [];
      let totalQuestions = 0;
      let idCounter = 1;

      for (let i = 0; i < chunks.length; i++) {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: SYSTEM_PROMPT + `\n\nQUESTION PAPER (part ${i+1}/${chunks.length}):\n${chunks[i]}\n\nReturn JSON audit result.`
                }]
              }]
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
        const chunkResult = JSON.parse(raw);
        totalQuestions += chunkResult.total_questions || 0;
        (chunkResult.issues || []).forEach(issue => {
          allIssues.push({ ...issue, id: idCounter++ });
        });
      }

      const seen = new Set();
      const dedupedIssues = allIssues.filter(issue => {
        const key = `${issue.question_num}-${issue.category}-${issue.description}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const highCount = dedupedIssues.filter(i => i.severity === 'high').length;
      const medCount  = dedupedIssues.filter(i => i.severity === 'medium').length;
      const lowCount  = dedupedIssues.filter(i => i.severity === 'low').length;
      const quality   = Math.max(0, 100 - (highCount * 10) - (medCount * 5) - (lowCount * 2));

      return res.status(200).json({
        total_questions: totalQuestions,
        issues: dedupedIssues,
        quality_score: quality,
        summary: `Found ${dedupedIssues.length} issue(s) across ${totalQuestions} questions.`,
      });
    }

  } catch (err) {
    console.log('DEBUG error:', err.message);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
