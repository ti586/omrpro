// src/services/qrService.js
import QRCode from 'qrcode';

export async function generateQRCode(data) {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  return QRCode.toBuffer(text, { width: 150, margin: 1, errorCorrectionLevel: 'M' });
}
