// src/utils/auditor.js
// Sends PDF images or text to backend for Gemini Vision analysis

export async function auditPaper(content, images) {
  const response = await fetch('/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, images }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${response.status}`);
  }

  return await response.json();
}
