# PDF Creation Guide

To create test PDFs for processing:

## Option 1: Online Conversion
1. Copy content from any .txt file in text-files/
2. Use online converters like:
   - smallpdf.com/txt-to-pdf
   - ilovepdf.com/txt_to_pdf
   - convertio.co/txt-pdf

## Option 2: Command Line (requires additional setup)
```bash
# Install puppeteer for HTML to PDF conversion
npm install puppeteer

# Create PDF from HTML
node -e "
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent('YOUR_HTML_CONTENT');
  await page.pdf({path: 'scripts/input/pdfs/test.pdf'});
  await browser.close();
})();
"
```

## Option 3: From Word Documents
1. Create Word document with test content
2. Save As → PDF format
3. Place in scripts/input/pdfs/

## Sample PDF Content Suggestions:
- University handbook pages
- Course catalog excerpts  
- Academic policy documents
- Student services brochures
