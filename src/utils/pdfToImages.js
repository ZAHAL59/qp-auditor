// src/utils/pdfToImages.js
// Renders each PDF page as a base64 image for vision AI

export async function pdfToImages(file, maxPages = 20) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const totalPages = Math.min(pdf.numPages, maxPages);
  const images = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 }); // high res for clarity

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Convert to base64 JPEG (smaller than PNG, good enough for text)
    const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
    images.push({ page: i, base64, totalPages: pdf.numPages });
  }

  return images;
}
