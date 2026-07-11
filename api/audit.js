// api/audit.js
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'No content provided' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'Server not configured.' });

  // ── 1. CODE-BASED: Extract question numbers (handles 1. 1) Q1. Q1) 1: formats) ──
  const qnumRegex = /(?:^|\n)\s*(?:Q\.?\s*)?(\d+)\s*[.):\]]/g;
  const foundNums = [];
  let match;
  while ((match = qnumRegex.exec(content)) !== null) {
    const n = parseInt(match[1], 10);
    // Filter out option numbers like (1) (2) (3) (4) — only keep likely question numbers
    // Options are usually single digit 1-4, questions are usually higher or appear at line start
    foundNums.push(n);
  }

  // Remove option numbers: if a number appears more than 3x it's likely an option label not a Q number
  const freq = {};
  foundNums.forEach(n => { freq[n] = (freq[n] || 0) + 1; });
  // Question numbers: appear exactly once (or twice if duplicated), options appear many times
  const maxFreq = Math.max(...Object.values(freq));
  const threshold = Math.min(4, Math.floor(maxFreq / 2));
  const questionNums = foundNums.filter(n => freq[n] <= Math.max(3, threshold));
  // Get unique question numbers in order of appearance
  const seen2 = new Set();
  const orderedQNums = [];
  foundNums.forEach(n => {
    if (freq[n] <= Math.max(3, threshold) && !seen2.has(n)) {
      seen2.add(n);
      orderedQNums.push(n);
    }
  });

  const structuralIssues = [];
  let id = 1;

  if (orderedQNums.length > 0) {
    const seenCount = {};
    questionNums.forEach(n => { seenCount[n] = (seenCount[n] || 0) + 1; });

    const sorted = [...new Set(questionNums)].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    // Duplicate question numbers
    Object.entries(seenCount).forEach(([num, count]) => {
      if (count > 1) {
        structuralIssues.push({
          id: id++,
          question_num: `Q${num}`,
          category: 'duplicate_question_number',
          severity: 'high',
          description: `Question number ${num} appears ${count} times in the paper.`,
          suggestion: `Remove the duplicate. Keep only one question numbered ${num}.`,
          confidence: 1.0,
          original_text: `Q${num} appears ${count} times`,
        });
      }
    });

    // Missing question numbers
    for (let i = min; i <= max; i++) {
      if (!seenCount[i]) {
        structuralIssues.push({
          id: id++,
          question_num: `Q${i}`,
          category: 'missing_question_number',
          severity: 'high',
          description: `Question number ${i} is missing — sequence jumps over it.`,
          suggestion: `Add question ${i} or renumber to make the sequence continuous.`,
          confidence: 1.0,
          original_text: `Sequence skips number ${i}`,
        });
      }
    }

    // Out of order
    for (let i = 1; i < orderedQNums.length; i++) {
      if (orderedQNums[i] < orderedQNums[i - 1]) {
        structuralIssues.push({
          id: id++,
          question_num: `Q${orderedQNums[i]}`,
          category: 'question_ordering',
          severity: 'high',
          description: `Question ${orderedQNums[i]} appears after question ${orderedQNums[i - 1]} — out of order.`,
          suggestion: `Move question ${orderedQNums[i]} to its correct position in the sequence.`,
          confidence: 1.0,
          original_text: `...${orderedQNums[i - 1]}, ${orderedQNums[i]}...`,
        });
      }
    }
  }

  // ── 2. AI: Only spelling and duplicate options ──
  const prompt = `You are a question paper proofreader. Check ONLY these 2 things:

1. duplicate_options — within a single question, two or more options have IDENTICAL or very similar text. For example: option (3) is "7860" and option (4) is also "7860". Flag this as duplicate_options NOT as spelling.
2. spelling — a word is clearly misspelled. Only flag actual misspelled words, NOT numbers or repeated values.

IMPORTANT:
- If two options have the same value (e.g. both say 7860, or both say "Paris"), that is duplicate_options — NOT spelling.
- Only flag spelling if a word has wrong letters (e.g. "folowing", "Whcih", "teh").
- Do NOT flag numbers, math expressions, or repeated answer choices as spelling errors.

Return ONLY valid JSON, no markdown:
{
  "total_questions": <integer>,
  "issues": [
    {
      "id": <integer starting from ${id}>,
      "question_num": "<e.g. Q3>",
      "category": "<duplicate_options | spelling>",
      "severity": "<medium | low>",
      "description": "<short description — for duplicate options say which options are identical and their values>",
      "suggestion": "<exact fix>",
      "confidence": <float 0.0-1.0>,
      "original_text": "<the exact problematic text, max 80 chars>"
    }
  ],
  "quality_score": <integer 0-100>,
  "summary": "<one sentence>"
}

SEVERITY: medium = duplicate_options, low = spelling

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
          { role: 'system', content: 'You are a strict question paper proofreader. Respond with valid JSON only. Never flag numbers or repeated answer choices as spelling errors.' },
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
    const aiResult = JSON.parse(raw);

    // ── 3. Merge ──
    const allIssues = [...structuralIssues, ...(aiResult.issues || [])];
    const highCount = allIssues.filter(i => i.severity === 'high').length;
    const medCount = allIssues.filter(i => i.severity === 'medium').length;
    const lowCount = allIssues.filter(i => i.severity === 'low').length;
    const quality = Math.max(0, 100 - (highCount * 10) - (medCount * 5) - (lowCount * 2));

    return res.status(200).json({
      total_questions: aiResult.total_questions || orderedQNums.length,
      issues: allIssues,
      quality_score: quality,
      summary: aiResult.summary || `Found ${allIssues.length} issue(s).`,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};