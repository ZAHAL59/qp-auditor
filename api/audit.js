// api/audit.js
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'No content provided' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'Server not configured.' });

  // ── 1. CODE-BASED: Extract question numbers ──
  // Matches lines like "8." "9." "11." — question number followed by a dot
  // Ignores option formats like (1) (2) (3) (4) or A. B. C. D.
  const qnumRegex = /(?:^|\n)[ \t]*(\d+)\./g;
  const allFound = []; // in order of appearance
  let match;
  while ((match = qnumRegex.exec(content)) !== null) {
    allFound.push(parseInt(match[1], 10));
  }

  // Count frequency — question numbers appear once, option numbers (1.2.3.4.) appear many times
  const freq = {};
  allFound.forEach(n => { freq[n] = (freq[n] || 0) + 1; });

  // Keep only numbers that appear 1-2 times (real question numbers)
  // Option numbers like 1,2,3,4 appear once per question = many times total
  const maxOptionCount = Math.max(...Object.values(freq));
  // If 1,2,3,4 each appear N times, anything appearing <= 2 times is a question number
  const questionNumsInOrder = []; // order of first appearance
  const seenQ = new Set();
  allFound.forEach(n => {
    if (freq[n] <= 2 && !seenQ.has(n)) {
      seenQ.add(n);
      questionNumsInOrder.push(n);
    }
  });

  // Also get count map for duplicates
  const qFreq = {};
  allFound.forEach(n => {
    if (freq[n] <= 2) qFreq[n] = (qFreq[n] || 0) + 1;
  });

  const structuralIssues = [];
  let id = 1;

  if (questionNumsInOrder.length > 0) {
    const uniqueSorted = [...new Set(questionNumsInOrder)].sort((a, b) => a - b);
    const min = uniqueSorted[0];
    const max = uniqueSorted[uniqueSorted.length - 1];

    // 1. Duplicate question numbers
    Object.entries(qFreq).forEach(([num, count]) => {
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

    // 2. Missing question numbers (gaps)
    for (let i = min; i <= max; i++) {
      if (!qFreq[i]) {
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

    // 3. Out of order
    for (let i = 1; i < questionNumsInOrder.length; i++) {
      if (questionNumsInOrder[i] < questionNumsInOrder[i - 1]) {
        structuralIssues.push({
          id: id++,
          question_num: `Q${questionNumsInOrder[i]}`,
          category: 'question_ordering',
          severity: 'high',
          description: `Question ${questionNumsInOrder[i]} appears after question ${questionNumsInOrder[i - 1]} — out of order.`,
          suggestion: `Move question ${questionNumsInOrder[i]} before question ${questionNumsInOrder[i - 1]}.`,
          confidence: 1.0,
          original_text: `...${questionNumsInOrder[i - 1]}, ${questionNumsInOrder[i]}...`,
        });
      }
    }
  }

  // ── 2. AI: Only spelling and duplicate options ──
  const prompt = `You are a question paper proofreader. Check ONLY these 2 things:

1. duplicate_options — within a single question, two or more options have identical text or identical values. Example: option (3) is "7860" and option (4) is also "7860".
2. spelling — a word is clearly misspelled. Example: "folowing" instead of "following".

STRICT RULES:
- Repeated option values (numbers or text) = duplicate_options, NEVER spelling.
- Only flag spelling for actual wrong letters in words.
- Do NOT flag numbers, formulas, or math as spelling errors.
- Do NOT check question numbering or ordering — that is already handled separately.

Return ONLY valid JSON, no markdown:
{
  "total_questions": <integer>,
  "issues": [
    {
      "id": <integer starting from ${id}>,
      "question_num": "<e.g. Q3>",
      "category": "<duplicate_options | spelling>",
      "severity": "<medium | low>",
      "description": "<for duplicate_options: state which options are identical and their value. For spelling: state the misspelled word>",
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
          { role: 'system', content: 'You are a strict question paper proofreader. Respond with valid JSON only. Never flag numbers as spelling errors.' },
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
      total_questions: aiResult.total_questions || questionNumsInOrder.length,
      issues: allIssues,
      quality_score: quality,
      summary: aiResult.summary || `Found ${allIssues.length} issue(s).`,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};