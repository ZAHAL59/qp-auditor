# QP Auditor — AI Question Paper Review Tool

AI-powered question paper auditor. Upload a PDF, DOCX, XLSX, or TXT file and get a full
structured review with issue detection, severity ratings, suggested fixes, and an accept/reject
workflow — before you publish the exam.

---

## What it detects

| Category             | Examples                                                                    |
|----------------------|-----------------------------------------------------------------------------|
| **Option Issues**    | Duplicate options, missing options, wrong order (A,C,B,D), empty options   |
| **Spelling/Grammar** | Typos, punctuation errors, capitalization issues, extra spaces              |
| **Answer Key**       | Wrong answer label, answer not in options, missing answer                   |
| **Factual Errors**   | Incorrect scientific facts, wrong formulas, wrong dates                     |
| **Formatting**       | Missing/repeated question numbers, broken structure, missing diagrams       |
| **Educational Quality** | Ambiguity, double negatives, length-revealing options, "all of the above" |
| **Duplicates**       | Exact and near-duplicate questions across the paper                         |

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Run locally

```bash
npm start
```

Opens at http://localhost:3000

### 3. Build for production

```bash
npm run build
```

Outputs to the `build/` folder — deploy anywhere (Vercel, Netlify, S3, your own server).

---

## Deployment

### Vercel (recommended, free)
```bash
npm install -g vercel
vercel
```

### Netlify
```bash
npm run build
# Drag the build/ folder to netlify.com/drop
```

### Self-hosted (Nginx / Apache)
```bash
npm run build
# Copy build/ to your web server's public folder
```

---

## API Key

Users enter their own Anthropic API key on the upload screen. It is stored only in their
browser's localStorage — it is never sent to any server other than api.anthropic.com.

Get a key at: https://console.anthropic.com

---

## File Support

| Format | Parser            | Notes                              |
|--------|-------------------|------------------------------------|
| .txt   | Native browser    | Plain text, fastest                |
| .pdf   | pdfjs-dist        | Text-based PDFs only (not scanned) |
| .docx  | mammoth           | Full Word document support         |
| .xlsx  | SheetJS           | Reads all sheets as CSV            |

---

## Project Structure

```
src/
  App.jsx                  # Main workflow orchestrator
  components/
    UploadStep.jsx          # File upload / text paste + API key input
    LoadingStep.jsx         # Animated progress while AI analyzes
    IssueCard.jsx           # Individual issue with accept/reject actions
    ResultsStep.jsx         # Summary, filters, issue list, export
  utils/
    fileParser.js           # PDF / DOCX / XLSX / TXT extraction
    auditor.js              # Anthropic API call and prompt
    exportReport.js         # TXT and CSV export
```

---

## Customization

**Change the AI model**: Edit `auditor.js`, update `model: 'claude-sonnet-4-6'`

**Adjust the prompt**: Edit the `AUDIT_PROMPT` in `auditor.js` to add subject-specific
rules (e.g. "this is a medical exam — flag any dosage errors")

**Pre-fill API key**: Set `localStorage.setItem('qpa_key', 'sk-ant-...')` or pass it
via an environment variable with a small backend proxy

---

## License

MIT
