const fs = require('fs');
const PDFDocument = require('pdfkit');

async function createPDF() {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    const writeStream = fs.createWriteStream('Oyna_App_Kodlar.pdf');
    doc.pipe(writeStream);

    doc.fontSize(16).text('Oyna App - Tüm Kaynak Kodları', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text('DIKKAT: PDF dosyalarından kod kopyalamak bosluklari ve girintileri bozabilir. Yazılımcılarin orijinal ZIP veya TXT dosyasını kullanması tavsiye edilir.', { align: 'center', color: 'red' });
    doc.moveDown();
    
    doc.fillColor('black');
    doc.fontSize(8).font('Courier');

    const text = fs.readFileSync('Oyna_Tum_Kodlar.txt', 'utf8');
    
    // Split text into smaller chunks to avoid memory issues with PDFKit
    const lines = text.split('\n');
    let currentChunk = '';
    
    for (let i = 0; i < lines.length; i++) {
        currentChunk += lines[i] + '\n';
        if (i > 0 && i % 100 === 0) {
            doc.text(currentChunk, { continued: false });
            currentChunk = '';
        }
    }
    if (currentChunk.length > 0) {
        doc.text(currentChunk);
    }
    
    doc.end();
    
    return new Promise((resolve) => {
        writeStream.on('finish', () => resolve());
    });
}

createPDF().then(() => console.log('PDF created successfully.'));
