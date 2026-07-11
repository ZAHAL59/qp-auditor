// src/utils/auditor.js
const SYSTEM_PROMPT = `You are an expert question paper proofreader for competitive exams (JEE, NEET, etc.).

Carefully read the question paper and detect ONLY these issues:

1. duplicate_question_number — A top-level question number appears more than once.
   IGNORE: sub-items in match-the-column (e.g. "1. Terminal centromere"), option labels (1)(2)(3)(4), decimal numbers (1.806).

2. missing_question_number — A top-level question number is skipped (e.g. 9 then 11 — 10 is missing).

3. question_ordering — Top-level question numbers are out of sequence (e.g. 8, 9, 7, 10).

4. duplicate_options — Within one question, two or more answer options are EXACTLY identical.
   You can read chemistry formulas, Greek letters (α β γ θ), charge symbols (⊕ ⊖), radical dots (Ċ), structural formulas.
   NOT duplicates: "Cl·" and "Cl⊕" (different), "p" and "-p" (different signs), "x" and "2x" (different).

5. spelling — A clearly misspelled English word. Not numbers or chemistry symbols.

Return ONLY valid JSON, no markdown, no thinking, no explanation:
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

function safeParseJSON(raw) {
  // Remove markdown, thinking tags, extra text
  raw = raw.replace(/```json|```/g, '');
  raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  raw = raw.trim();
  // Find the JSON object boundaries
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    console.warn('No JSON found:', raw.substring(0, 200));
    return { total_questions: 0, issues: [], quality_score: 100, summary: 'No issues detected on this page.' };
  }
  try {
    return JSON.parse(raw.substring(start, end + 1));
  } catch (e) {
    console.warn('JSON parse failed:', raw.substring(start, start + 200));
    return { total_questions: 0, issues: [], quality_score: 100, summary: 'Could not parse response for this page.' };
  }
}

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
  const raw = data.choices?.[0]?.message?.content || '';
  return safeParseJSON(raw);
}

export async function auditPaper(content, images, apiKey) {
  // ── VISION MODE ──
  if (images && images.length > 0) {
    const allIssues = [];
    let totalQuestions = 0;
    let idCounter = 1;
    let summaryText = '';

    // Process all pages in parallel for speed
    const pageResults = await Promise.all(images.map(img => {
      const userContent = [
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${img.base64}` },
        },
        {
          type: 'text',
          text: `This is page ${img.page} of ${img.totalPages}. Analyze and return JSON only.`,
        },
      ];
      return callOpenRouter([{ role: 'user', content: userContent }], apiKey);
    }));

    pageResults.forEach(batchResult => {
      totalQuestions += batchResult.total_questions || 0;
      if (batchResult.summary) summaryText = batchResult.summary;
      (batchResult.issues || []).forEach(issue => {
        allIssues.push({ ...issue, id: idCounter++ });
      });
    });

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

  // ── TEXT MODE ──
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