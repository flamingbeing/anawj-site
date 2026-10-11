// Read a photo of a case list into text, on this phone. Tesseract.js (vendor/tesseract, served from
// this site) loads on first use; the photo is never uploaded or stored: it's drawn onto a canvas,
// read, and dropped. The English data is kept by Tesseract in this browser's storage after the first
// read so later ones start faster.

const BASE = new URL('../vendor/tesseract/', import.meta.url).href;

let libP = null;
function needTesseract() {
  if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
  libP ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = BASE + 'tesseract.min.js';
    s.onload = () => resolve(globalThis.Tesseract);
    s.onerror = () => { libP = null; reject(new Error('Could not load the photo reader (offline?)')); };
    document.head.append(s);
  });
  return libP;
}

// The photo, upright, at most ~2000 px on its long side, in grey: faster and reads as well.
async function toCanvas(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.filter = 'grayscale(1) contrast(1.2)';
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close && bmp.close();
  return c;
}

// file: an image File/Blob. onProgress(text) gets short status lines. Returns the text read.
export async function readPhoto(file, onProgress = () => {}) {
  onProgress('Loading the photo reader…');
  const T = await needTesseract();
  const canvas = await toCanvas(file);
  let worker = null;
  try {
    worker = await T.createWorker('eng', 1, {
      workerPath: BASE + 'worker.min.js', corePath: BASE + 'core/', langPath: BASE + 'lang/',
      logger: m => {
        if (m.status === 'recognizing text') onProgress(`Reading… ${Math.round((m.progress || 0) * 100)}%`);
        else if (/loading/.test(m.status || '')) onProgress('Loading the photo reader…');
      },
    });
    const { data } = await worker.recognize(canvas);
    return String((data && data.text) || '');
  } finally {
    canvas.width = canvas.height = 0;   // let the pixels go
    if (worker) worker.terminate().catch(() => {});
  }
}
