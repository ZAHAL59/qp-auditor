// src/utils/auditor.js
// Back to Groq text mode — stable and accurate

export async function auditPaper(content, images) {
  // For PDFs, use the extracted text (not images)
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
