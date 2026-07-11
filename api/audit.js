// api/audit.js
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Vercel sometimes needs manual body parsing
  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { body = {}; }
  }

  const content = body.content || '';
  console.log('DEBUG content length:', content.length);
  console.log('DEBUG content preview:', content.substring(0, 100));

  if (!content) return res.status(400).json({ error: 'No content provided' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'Server not configured.' });

  // ── 1. CODE-BASED checks ──
  const qnumRegex = /(?:^|\n)[ \t]*(\d+)\./g;
  const allFound = [];
  let match;
  while ((match = qnumRegex.exec(content)) !== null) {
    allFound.push(parseInt(match[1], 10));
  }

  const freq = {};
  allFound.forEach(n => { freq[n] = (freq[n] || 0) + 1; });

  console.log('DEBUG qnums:', JSON.stringify(allFound), 'freq:', JSON.stringify(freq));

  const seen = new Set();
  const questionNumsInOrder = [];
  allFound.forEach(n => {
    if (!seen.has(n)) { seen.add(n); questionNumsInOrder.push(n); }
  });

  const structuralIssues = [];
  let id = 1;

  if (questionNumsInOrder.length > 0) {
    const sorted = [...new Set(allFound)].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    // Duplicate question numbers
    Object.entries(freq).forEach(([num, count]) => {
      if (count > 1) {
        structuralIssues.push({
          id: id++,
          question_num: `Q${num}`,
          category: 'duplicate_question_number',
          severity: 'high',
          description: `Question number ${num} appears ${count} times in the paper.`,
          suggestion: `Remove the duplicate. Only one question should be numbered ${num}.`,
          confidence: 1.0,
          original_text: `Q${num} appears ${count} times`,
        });
      }
    });

    // Missing question numbers
    for (let i = min; i <= max; i++) {
      if (!freq[i]) {
        structuralIssues.push({
          id: id++,
          question_num: `Q${i}`,
          category: 'missing_question_number',
          severity: 'high',
          description: `Question number ${i} is missing — sequence jumps from ${i - 1} to ${i + 1}.`,
          suggestion: `Add the missing question ${i} or renumber to make the sequence continuous.`,
          confidence: 1.0,
          original_text: `Sequence skips number ${i}`,
        });
      }
    }

    // Out of order
    for (let i = 1; i < questionNumsInOrder.length; i++) {
      if (questionNumsInOrder[i] < questionNumsInOrder[i - 1]) {
        structuralIssues.push({
          id: id++,
          question_num: `Q${questionNumsInOrder[i]}`,
          category: 'question_ordering',
          severity: 'high',
          description: `Question ${questionNumsInOrder[i]} appears after question ${questionNumsInOrder[i - 1]} — out of order.`,
          suggestion: `Move question ${questionNumsInOrder[i]} to its correct position.`,
          confidence: 1.0,
          original_text: `...${questionNumsInOrder[i - 1]}, ${questionNumsInOrder[i]}...`,
        });
      }
    }
  }

  // ── 2. AI: spelling and duplicate options only ──
  const prompt = `You are a question paper proofreader. Check ONLY these 2 things:

1. duplicate_options — within a single question, two or more options have identical text or identical values.
2. spelling — a word is clearly misspelled.

STRICT RULES:
- Repeated option values = duplicate_options, NEVER spelling.
- Only flag actual misspelled words, NOT numbers or math.
- Do NOT check question numbering or ordering.

Return ONLY valid JSON, no markdown:
{
  "total_questions": <integer>,
  "issues": [
    {
      "id": <integer starting from ${id}>,
      "question_num": "<e.g. Q11>",
      "category": "<duplicate_options | spelling>",
      "severity": "<medium | low>",
      "description": "<description>",
      "suggestion": "<exact fix>",
      "confidence": <float 0.0-1.0>,
      "original_text": "<exact problematic text, max 80 chars>"
    }
  ],
  "quality_score": <integer 0-100>,
  "summary": "<one sentence>"
}

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
          { role: 'system', content: 'You are a strict question paper proofreader. Respond with valid JSON only.' },
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

    const allIssues = [...structuralIssues, ...(aiResult.issues || [])];
    const highCount = allIssues.filter(i => i.severity === 'high').length;
    const medCount = allIssues.filter(i => i.severity === 'medium').length;
    const lowCount = allIssues.filter(i => i.severity === 'low').length;
    const quality = Math.max(0, 100 - (highCount * 10) - (medCount * 5) - (lowCount * 2));

    return res.status(200).json({
      total_questions: aiResult.total_questions || questionNumsInOrder.length,
      issues: allIssues,
      quality_score: quality,
      summary: aiResult.summary || `Found ${allIssues.length} issue(s).`,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};