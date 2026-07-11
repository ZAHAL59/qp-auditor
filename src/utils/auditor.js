// src/utils/auditor.js
// Calls OpenRouter directly from the browser for vision (no Vercel size limit)
// For text mode, still goes through /api/audit backend

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

async function callOpenRouter(messages, apiKey) {
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'QP Auditor',
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      max_tokens: 8000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenRouter error ${resp.status}`);
  }

  const data = await resp.json();
  let raw = data.choices?.[0]?.message?.content || '';
  raw = raw.replace(/```json|```/g, '').trim();
  // Find JSON object in response even if there's extra text
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI did not return valid JSON. Please try again.');
  return JSON.parse(jsonMatch[0]);
}

export async function auditPaper(content, images, apiKey) {
  // ── VISION MODE: browser calls OpenRouter directly ──
  if (images && images.length > 0) {
    const allIssues = [];
    let totalQuestions = 0;
    let idCounter = 1;
    let summaryText = '';

    for (let i = 0; i < images.length; i++) {
      const img = images[i];

      const userContent = [
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${img.base64}` },
        },
        {
          type: 'text',
          text: `This is page ${img.page} of ${img.totalPages} of the question paper. Analyze carefully and return the JSON audit result.`,
        },
      ];

      const batchResult = await callOpenRouter(
        [{ role: 'user', content: userContent }],
        apiKey
      );

      totalQuestions += batchResult.total_questions || 0;
      summaryText = batchResult.summary || '';
      (batchResult.issues || []).forEach(issue => {
        allIssues.push({ ...issue, id: idCounter++ });
      });

      // Small delay between pages
      if (i + 1 < images.length) {
        await new Promise(r => setTimeout(r, 1500));
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

    return {
      total_questions: totalQuestions,
      issues: dedupedIssues,
      quality_score: quality,
      summary: summaryText || `Found ${dedupedIssues.length} issue(s) across ${totalQuestions} questions.`,
    };
  }

  // ── TEXT MODE: goes through /api/audit backend ──
  const response = await fetch('/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${response.status}`);
  }

  return await response.json();
}