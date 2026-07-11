// api/audit.js
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'No content provided' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'Server not configured.' });

  // ── 1. Extract all question numbers from the text (pure logic, 100% reliable) ──
  const qnumRegex = /^\s*(\d+)\s*[.)]/gm;
  const foundNums = [];
  let match;
  while ((match = qnumRegex.exec(content)) !== null) {
    foundNums.push(parseInt(match[1], 10));
  }

  const structuralIssues = [];
  let id = 1;

  if (foundNums.length > 0) {
    const seen = {};
    const sorted = [...foundNums].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    // Duplicate question numbers
    foundNums.forEach(n => {
      seen[n] = (seen[n] || 0) + 1;
    });
    Object.entries(seen).forEach(([num, count]) => {
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

    // Missing question numbers (gaps in sequence)
    for (let i = min; i <= max; i++) {
      if (!seen[i]) {
        structuralIssues.push({
          id: id++,
          question_num: `Q${i}`,
          category: 'missing_question_number',
          severity: 'high',
          description: `Question number ${i} is missing from the sequence.`,
          suggestion: `Add question ${i} or renumber questions so the sequence is continuous.`,
          confidence: 1.0,
          original_text: `Sequence jumps over ${i}`,
        });
      }
    }

    // Out of order question numbers
    for (let i = 1; i < foundNums.length; i++) {
      if (foundNums[i] < foundNums[i - 1]) {
        structuralIssues.push({
          id: id++,
          question_num: `Q${foundNums[i]}`,
          category: 'question_ordering',
          severity: 'high',
          description: `Question ${foundNums[i]} appears after question ${foundNums[i - 1]} — out of order.`,
          suggestion: `Reorder so question ${foundNums[i]} comes before question ${foundNums[i - 1]}.`,
          confidence: 1.0,
          original_text: `...${foundNums[i - 1]}, ${foundNums[i]}...`,
        });
      }
    }
  }

  // ── 2. Send to AI only for spelling and duplicate options ──
  const prompt = `You are a question paper proofreader. Check ONLY these 2 things:

1. duplicate_options — within a single question, two or more options have identical text (e.g. option 1 and option 2 are both "Paris")
2. spelling — a word is clearly misspelled (e.g. "folowing" instead of "following", "Whcih" instead of "Which")

Do NOT check question numbering, ordering, grammar, meaning, or anything else.

Return ONLY valid JSON, no markdown:
{
  "total_questions": <integer>,
  "issues": [
    {
      "id": <unique integer starting from ${id}>,
      "question_num": "<e.g. Q3>",
      "category": "<duplicate_options | spelling>",
      "severity": "<medium | low>",
      "description": "<short description>",
      "suggestion": "<exact fix>",
      "confidence": <float 0.0-1.0>,
      "original_text": "<problematic text, max 80 chars>"
    }
  ],
  "quality_score": <integer 0-100>,
  "summary": "<one sentence summary>"
}

SEVERITY: medium = duplicate options, low = spelling

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
          { role: 'system', content: 'You are a question paper proofreader. Respond with valid JSON only.' },
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

    // ── 3. Merge structural issues (100% accurate) + AI issues ──
    const allIssues = [...structuralIssues, ...(aiResult.issues || [])];

    // Recalculate quality score
    const highCount = allIssues.filter(i => i.severity === 'high').length;
    const medCount = allIssues.filter(i => i.severity === 'medium').length;
    const lowCount = allIssues.filter(i => i.severity === 'low').length;
    const penalty = (highCount * 10) + (medCount * 5) + (lowCount * 2);
    const quality = Math.max(0, 100 - penalty);

    return res.status(200).json({
      total_questions: aiResult.total_questions || foundNums.length,
      issues: allIssues,
      quality_score: quality,
      summary: aiResult.summary || `Found ${allIssues.length} issues in the paper.`,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};