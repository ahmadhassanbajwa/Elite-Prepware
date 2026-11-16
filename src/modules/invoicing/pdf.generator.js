import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const logo = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../assets/logo.png');
const money = (n, cur) => `${cur} ${Number(n).toFixed(2)}`;

// Renders from the stored snapshot rows only, so a reissued PDF always matches the original.
export function generatePdf({ invoice, client, lines }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);

    if (fs.existsSync(logo)) doc.image(logo, 50, 40, { width: 90 });
    else doc.fontSize(20).text(process.env.COMPANY_NAME || 'Eliteprepware', 50, 45);
    doc.fontSize(9).fillColor('#555').text(process.env.COMPANY_ADDRESS || '', 50, 90);
    doc.fontSize(18).fillColor('#000').text('INVOICE', 400, 45, { align: 'right' });
    doc.fontSize(10).text(invoice.invoice_number, { align: 'right' })
      .text(`Issued: ${invoice.issued_at.slice(0, 10)}`, { align: 'right' })
      .text(invoice.due_date ? `Due: ${invoice.due_date}` : '', { align: 'right' });

    doc.fontSize(11).text('Bill to', 50, 140).fontSize(10)
      .text(client.company_name).text(client.billing_address || '').text(client.email || '')
      .text(client.tax_id ? `Tax ID: ${client.tax_id}` : '');

    let y = 270;
    const cols = [50, 280, 350, 430];
    doc.fontSize(10).font('Helvetica-Bold');
    ['Description', 'Qty', 'Unit price', 'Total'].forEach((h, i) => doc.text(h, cols[i], y));
    doc.font('Helvetica').moveTo(50, y + 15).lineTo(560, y + 15).stroke();
    y += 25;
    for (const l of lines) {
      if (y > 700) { doc.addPage(); y = 60; }
      doc.text(l.description, cols[0], y, { width: 220 });
      doc.text(String(l.quantity), cols[1], y);
      doc.text(money(l.unit_price, invoice.currency), cols[2], y);
      doc.text(money(l.line_total, invoice.currency), cols[3], y);
      y += 22;
    }
    y += 10;
    doc.moveTo(350, y).lineTo(560, y).stroke();
    doc.text('Subtotal', 350, y + 8).text(money(invoice.subtotal, invoice.currency), 430, y + 8)
      .text('Tax', 350, y + 26).text(money(invoice.tax, invoice.currency), 430, y + 26);
    doc.font('Helvetica-Bold').text('Total', 350, y + 44).text(money(invoice.total, invoice.currency), 430, y + 44);
    doc.end();
  });
}
