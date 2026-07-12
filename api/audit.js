// api/audit.js — Groq text mode with hybrid approach
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

  // ── 1. CODE-BASED: Question number checks ──
  // Skip everything before questions start
  // Strategy 1: find subject headers
  const SUBJECT_HEADERS = ['PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'MATHEMATICS', 'MATHS', 'SOCIAL SCIENCE', 'ENGLISH', 'BOTANY', 'ZOOLOGY', 'SCIENCE'];
  const headerRegex = new RegExp('(' + SUBJECT_HEADERS.join('|') + ')', 'i');
  const headerMatch = headerRegex.exec(content);

  // Strategy 2: find "IMPORTANT INSTRUCTIONS" and skip past its numbered list
  let skipIndex = 0;
  const instrMatch = /IMPORTANT\s+INSTRUCTIONS/i.exec(content);
  if (instrMatch) {
    // Find where the instructions end — look for a blank line or subject header after them
    const afterInstr = content.substring(instrMatch.index);
    // Instructions end when we hit a subject header or a line that looks like a question (longer than 60 chars)
    const endOfInstr = headerRegex.exec(afterInstr);
    if (endOfInstr) {
      skipIndex = instrMatch.index + endOfInstr.index;
    }
  }

  // Use whichever skip is further in the document
  if (headerMatch) skipIndex = Math.max(skipIndex, headerMatch.index);
  const questionContent = skipIndex > 0 ? content.substring(skipIndex) : content;

  console.log('DEBUG content len:', content.length, 'question content len:', questionContent.length);

  // Match question numbers: number + dot + letter (question text starts with letter)
  // Uses questionContent only (after subject headers)
  const qnumRegex = /(?<!\d)([1-9]\d{0,2})\.\s{2,}(?=[A-Z][a-zA-Z\s]{10,})/g;
  const allFound = [];
  let match;
  while ((match = qnumRegex.exec(questionContent)) !== null) {
    allFound.push(parseInt(match[1], 10));
  }

  console.log('DEBUG found question nums:', allFound);

  const freq = {};
  allFound.forEach(n => { freq[n] = (freq[n] || 0) + 1; });

  const seen = new Set();
  const inOrder = [];
  allFound.forEach(n => { if (!seen.has(n)) { seen.add(n); inOrder.push(n); } });

  const structuralIssues = [];
  let id = 1;

  if (inOrder.length > 0) {
    const sorted = [...new Set(allFound)].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    // Duplicate question numbers
    Object.entries(freq).forEach(([num, count]) => {
      if (count > 1) {
        structuralIssues.push({
          id: id++, question_num: `Q${num}`,
          category: 'duplicate_question_number', severity: 'high',
          description: `Question number ${num} appears ${count} times in the paper.`,
          suggestion: `Remove the duplicate. Only one question should be numbered ${num}.`,
          confidence: 1.0, original_text: `Q${num} appears ${count} times`,
        });
      }
    });

    // Missing question numbers
    for (let i = min; i <= max; i++) {
      if (!freq[i]) {
        structuralIssues.push({
          id: id++, question_num: `Q${i}`,
          category: 'missing_question_number', severity: 'high',
          description: `Question number ${i} is missing — sequence jumps from ${i - 1} to ${i + 1}.`,
          suggestion: `Add question ${i} or renumber to make sequence continuous.`,
          confidence: 1.0, original_text: `Sequence skips ${i}`,
        });
      }
    }

    // Out of order
    for (let i = 1; i < inOrder.length; i++) {
      if (inOrder[i] < inOrder[i - 1]) {
        structuralIssues.push({
          id: id++, question_num: `Q${inOrder[i]}`,
          category: 'question_ordering', severity: 'high',
          description: `Q${inOrder[i]} appears after Q${inOrder[i - 1]} — out of order.`,
          suggestion: `Move Q${inOrder[i]} to its correct position.`,
          confidence: 1.0, original_text: `...${inOrder[i - 1]}, ${inOrder[i]}...`,
        });
      }
    }
  }

  // ── 2. AI: duplicate options + spelling only ──
  // Send in chunks to handle large papers
  const CHUNK_SIZE = 10000;
  const chunks = [];
  for (let i = 0; i < questionContent.length; i += CHUNK_SIZE) {
    chunks.push(questionContent.substring(i, i + CHUNK_SIZE));
  }

  const aiIssues = [];
  let totalQuestions = 0;
  console.log('DEBUG chunks:', chunks.length, 'total content:', questionContent.length);

  for (let c = 0; c < chunks.length; c++) {
    const prompt = `You are a question paper proofreader. Check ONLY these 2 things:

IMPORTANT: If the paper has an "IMPORTANT INSTRUCTIONS" section at the top with numbered points like "1. Use of calculator...", "2. The candidates...", completely IGNORE those numbers. They are not question numbers.
Only count numbers that are actual exam questions with answer options (1)(2)(3)(4).

1. duplicate_options — Within a single question, two or more options have 100% IDENTICAL text/value.
   Example: option (3) is "7860" and option (4) is also "7860".
   NOT duplicates: "p" and "-p", "sinθ" and "-sinθ", "x" and "2x", values with different signs.
   Only flag when options are character-for-character identical.

2. spelling — A word is clearly misspelled (wrong letters only).
   Do NOT flag numbers, formulas, or symbols.

Do NOT check question numbering.

Return ONLY valid JSON:
{
  "total_questions": <integer>,
  "issues": [
    {
      "id": <integer starting from ${id}>,
      "question_num": "<e.g. Q11>",
      "category": "<duplicate_options | spelling>",
      "severity": "<medium | low>",
      "description": "<exact description>",
      "suggestion": "<exact fix>",
      "confidence": <0.0-1.0>,
      "original_text": "<problematic text, max 80 chars>"
    }
  ],
  "summary": "<one sentence>"
}

QUESTION PAPER (part ${c + 1}/${chunks.length}):
${chunks[c]}`;

    // Wait between chunks to avoid rate limit
    if (c > 0) await new Promise(r => setTimeout(r, 40000));

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
            { role: 'system', content: 'You are a strict question paper proofreader. Only flag duplicate_options when 100% identical. Respond with valid JSON only.' },
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
      const aiResult = JSON.parse(raw);
      totalQuestions += aiResult.total_questions || 0;
      (aiResult.issues || []).forEach(issue => aiIssues.push({ ...issue, id: id++ }));
    } catch (err) {
      console.log('DEBUG AI error chunk', c, err.message);
    }
  }

  // Merge structural + AI issues
  const allIssues = [...structuralIssues, ...aiIssues];

  // Deduplicate
  const seenKeys = new Set();
  const dedupedIssues = allIssues.filter(issue => {
    const key = `${issue.question_num}-${issue.category}-${issue.description}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  }).map((issue, i) => ({ ...issue, id: i + 1 }));

  const highCount = dedupedIssues.filter(i => i.severity === 'high').length;
  const medCount = dedupedIssues.filter(i => i.severity === 'medium').length;
  const lowCount = dedupedIssues.filter(i => i.severity === 'low').length;
  const quality = Math.max(0, 100 - (highCount * 10) - (medCount * 5) - (lowCount * 2));

  return res.status(200).json({
    total_questions: totalQuestions || inOrder.length,
    issues: dedupedIssues,
    quality_score: quality,
    summary: `Found ${dedupedIssues.length} issue(s) across ${totalQuestions || inOrder.length} questions.`,
  });
};