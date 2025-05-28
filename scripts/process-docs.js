import fs from 'fs-extra';
import path from 'path';
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DocumentProcessor {
  constructor() {
    this.inputDir = path.join(__dirname, 'input');
    this.outputDir = path.join(__dirname, '..', 'public', 'knowledge-base');
    this.tempDir = path.join(__dirname, 'temp');
    
    // Knowledge base categories
    this.categories = {
      'academic-policies': ['graduation', 'gpa', 'academic', 'policy', 'requirement', 'degree', 'credit', 'grade'],
      'student-services': ['financial', 'aid', 'housing', 'registration', 'enrollment', 'service', 'support', 'counseling'],
      'course-information': ['course', 'class', 'schedule', 'prerequisite', 'curriculum', 'syllabus', 'program'],
      'faq': ['question', 'answer', 'help', 'how', 'what', 'when', 'where', 'why', 'can i', 'do i']
    };

    this.processedData = {
      'academic-policies': [],
      'course-information': [],
      'faq': [],
      'student-services': []
    };
  }

  async init() {
    console.log(chalk.blue('🚀 Initializing Document Processor...'));
    
    // Ensure directories exist
    await fs.ensureDir(this.inputDir);
    await fs.ensureDir(this.outputDir);
    await fs.ensureDir(this.tempDir);
    
    // Ensure input subdirectories exist
    await fs.ensureDir(path.join(this.inputDir, 'pdfs'));
    await fs.ensureDir(path.join(this.inputDir, 'text-files'));
    await fs.ensureDir(path.join(this.inputDir, 'web-content'));
    await fs.ensureDir(path.join(this.inputDir, 'processed'));
    
    console.log(chalk.green('✅ Directories ready'));
  }

  // Main processing function
  async processAllDocuments() {
    try {
      console.log(chalk.blue('\n📂 Starting document processing...'));
      
      // Process PDFs
      await this.processPDFs();
      
      // Process text files
      await this.processTextFiles();
      
      // Process web content
      await this.processWebContent();
      
      // Generate JSON files
      await this.generateJSONFiles();
      
      console.log(chalk.green('\n🎉 All documents processed successfully!'));
      this.printSummary();
      
    } catch (err) {
      console.error(chalk.red('❌ Error processing documents:', err.message));
      throw err;
    }
  }

  // Process PDF files with dynamic import and error handling
  async processPDFs() {
    const pdfDir = path.join(this.inputDir, 'pdfs');
    
    if (!await fs.pathExists(pdfDir)) {
      console.log(chalk.yellow('⚠️ No PDFs directory found, creating...'));
      await fs.ensureDir(pdfDir);
      return;
    }

    const pdfFiles = await fs.readdir(pdfDir);
    const pdfs = pdfFiles.filter(file => file.toLowerCase().endsWith('.pdf'));
    
    if (pdfs.length === 0) {
      console.log(chalk.yellow('⚠️ No PDF files found, skipping...'));
      return;
    }
    
    console.log(chalk.blue(`\n📄 Processing ${pdfs.length} PDF files...`));
    
    // Create the missing test directory that pdf-parse expects
    const testDataDir = path.join(process.cwd(), 'test', 'data');
    try {
      await fs.ensureDir(testDataDir);
      // Create a dummy test file to prevent the error
      const dummyPdfPath = path.join(testDataDir, '05-versions-space.pdf');
      if (!await fs.pathExists(dummyPdfPath)) {
        // Create a minimal valid PDF buffer
        const minimalPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n174\n%%EOF');
        await fs.writeFile(dummyPdfPath, minimalPdf);
      }
    } catch (setupError) {
      console.log(chalk.yellow('⚠️ Could not create test directory for pdf-parse:', setupError.message));
    }
    
    // Dynamic import to avoid initialization issues
    let pdfParse;
    try {
      // Import pdf-parse dynamically
      const pdfParseModule = await import('pdf-parse');
      pdfParse = pdfParseModule.default;
      console.log(chalk.green('✅ PDF parser loaded successfully'));
    } catch (importError) {
      console.log(chalk.red('❌ Could not load pdf-parse library'));
      console.log(chalk.yellow('💡 Try: npm uninstall pdf-parse && npm install pdf-parse@1.1.1'));
      console.log(chalk.yellow('⚠️ Skipping PDF processing...'));
      console.log(chalk.gray(`   Error: ${importError.message}`));
      return;
    }
    
    for (const pdfFile of pdfs) {
      try {
        console.log(chalk.gray(`Processing: ${pdfFile}`));
        
        const pdfPath = path.join(pdfDir, pdfFile);
        const dataBuffer = await fs.readFile(pdfPath);
        const pdfData = await pdfParse(dataBuffer);
        
        const content = this.cleanText(pdfData.text);
        
        if (!content || content.length < 10) {
          console.log(chalk.yellow(`⚠️ ${pdfFile} appears to be empty or unreadable`));
          continue;
        }
        
        const category = this.categorizeContent(pdfFile, content);
        
        const entry = {
          id: this.generateId(pdfFile),
          title: this.generateTitle(pdfFile),
          content: content,
          source: pdfFile,
          category: category,
          type: 'pdf',
          priority: this.calculatePriority(content),
          tags: this.extractTags(content),
          wordCount: this.countWords(content),
          lastUpdated: new Date().toISOString()
        };
        
        this.processedData[category].push(entry);
        console.log(chalk.green(`✅ ${pdfFile} → ${category} (${entry.wordCount} words)`));
        
      } catch (processingError) {
        console.error(chalk.red(`❌ Error processing ${pdfFile}:`), processingError.message);
        // Continue processing other files
      }
    }
  }

  // Process text files
  async processTextFiles() {
    const textDir = path.join(this.inputDir, 'text-files');
    
    if (!await fs.pathExists(textDir)) {
      console.log(chalk.yellow('⚠️ No text-files directory found, creating...'));
      await fs.ensureDir(textDir);
      return;
    }

    const textFiles = await fs.readdir(textDir);
    const texts = textFiles.filter(file => 
      file.toLowerCase().endsWith('.txt') || 
      file.toLowerCase().endsWith('.md') ||
      file.toLowerCase().endsWith('.docx')
    );
    
    if (texts.length === 0) {
      console.log(chalk.yellow('⚠️ No text files found, skipping...'));
      return;
    }
    
    console.log(chalk.blue(`\n📝 Processing ${texts.length} text files...`));
    
    for (const textFile of texts) {
      try {
        console.log(chalk.gray(`Processing: ${textFile}`));
        
        const textPath = path.join(textDir, textFile);
        let content = '';
        
        if (textFile.toLowerCase().endsWith('.docx')) {
          try {
            const result = await mammoth.extractRawText({ path: textPath });
            content = result.value;
          } catch (docxError) {
            console.log(chalk.red(`❌ Error reading DOCX file ${textFile}:`, docxError.message));
            continue;
          }
        } else {
          content = await fs.readFile(textPath, 'utf8');
        }
        
        content = this.cleanText(content);
        
        if (!content || content.length < 10) {
          console.log(chalk.yellow(`⚠️ ${textFile} appears to be empty`));
          continue;
        }
        
        const category = this.categorizeContent(textFile, content);
        
        const entry = {
          id: this.generateId(textFile),
          title: this.generateTitle(textFile),
          content: content,
          source: textFile,
          category: category,
          type: textFile.toLowerCase().endsWith('.docx') ? 'docx' : 'text',
          priority: this.calculatePriority(content),
          tags: this.extractTags(content),
          wordCount: this.countWords(content),
          lastUpdated: new Date().toISOString()
        };
        
        this.processedData[category].push(entry);
        console.log(chalk.green(`✅ ${textFile} → ${category} (${entry.wordCount} words)`));
        
      } catch (processingError) {
        console.error(chalk.red(`❌ Error processing ${textFile}:`), processingError.message);
        // Continue processing other files
      }
    }
  }

  // Process web content (HTML files)
  async processWebContent() {
    const webDir = path.join(this.inputDir, 'web-content');
    
    if (!await fs.pathExists(webDir)) {
      console.log(chalk.yellow('⚠️ No web-content directory found, creating...'));
      await fs.ensureDir(webDir);
      return;
    }

    const webFiles = await fs.readdir(webDir);
    const htmls = webFiles.filter(file => file.toLowerCase().endsWith('.html'));
    
    if (htmls.length === 0) {
      console.log(chalk.yellow('⚠️ No HTML files found, skipping...'));
      return;
    }
    
    console.log(chalk.blue(`\n🌐 Processing ${htmls.length} web content files...`));
    
    for (const htmlFile of htmls) {
      try {
        console.log(chalk.gray(`Processing: ${htmlFile}`));
        
        const htmlPath = path.join(webDir, htmlFile);
        const htmlContent = await fs.readFile(htmlPath, 'utf8');
        const $ = cheerio.load(htmlContent);
        
        // Remove script and style tags
        $('script, style, nav, header, footer').remove();
        
        // Try to extract main content first, fallback to body
        let content = $('main').text() || $('article').text() || $('body').text() || $.text();
        content = this.cleanText(content);
        
        if (!content || content.length < 10) {
          console.log(chalk.yellow(`⚠️ ${htmlFile} appears to have no meaningful content`));
          continue;
        }
        
        const category = this.categorizeContent(htmlFile, content);
        
        const entry = {
          id: this.generateId(htmlFile),
          title: this.generateTitle(htmlFile),
          content: content,
          source: htmlFile,
          category: category,
          type: 'web',
          priority: this.calculatePriority(content),
          tags: this.extractTags(content),
          wordCount: this.countWords(content),
          lastUpdated: new Date().toISOString()
        };
        
        this.processedData[category].push(entry);
        console.log(chalk.green(`✅ ${htmlFile} → ${category} (${entry.wordCount} words)`));
        
      } catch (processingError) {
        console.error(chalk.red(`❌ Error processing ${htmlFile}:`), processingError.message);
        // Continue processing other files
      }
    }
  }

  // Clean and normalize text
  cleanText(text) {
    if (!text) return '';
    
    return text
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n/g, '\n\n') // Clean up line breaks
      .replace(/[^\w\s\-.,!?;:()\n]/g, '') // Remove special characters but keep basic punctuation
      .replace(/\s*\n\s*/g, '\n') // Clean up whitespace around newlines
      .trim();
  }

  // Count words in content
  countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  // Categorize content based on keywords
  categorizeContent(filename, content) {
    const text = (filename + ' ' + content).toLowerCase();
    const scores = {};
    
    // Calculate scores for each category
    for (const [category, keywords] of Object.entries(this.categories)) {
      scores[category] = 0;
      
      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = text.match(regex);
        if (matches) {
          scores[category] += matches.length;
        }
      }
    }
    
    // Return category with highest score, default to 'faq'
    const bestCategory = Object.keys(scores).reduce((a, b) => 
      scores[a] > scores[b] ? a : b
    );
    
    return scores[bestCategory] > 0 ? bestCategory : 'faq';
  }

  // Generate unique ID
  generateId(filename) {
    const name = path.basename(filename, path.extname(filename));
    const timestamp = Date.now();
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + timestamp;
  }

  // Generate readable title
  generateTitle(filename) {
    const name = path.basename(filename, path.extname(filename));
    return name
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim();
  }

  // Calculate content priority (1-5 scale)
  calculatePriority(content) {
    if (!content) return 1;
    
    const wordCount = this.countWords(content);
    const length = content.length;
    const importantWords = ['important', 'required', 'mandatory', 'deadline', 'policy', 'critical', 'urgent'];
    const hasImportantWords = importantWords.some(word => 
      content.toLowerCase().includes(word)
    );
    
    // Priority based on content importance, word count, and character length
    if (hasImportantWords && wordCount > 200) return 5;
    if (hasImportantWords && wordCount > 100) return 4;
    if (hasImportantWords || (wordCount > 400 && length > 2000)) return 4;
    if (wordCount > 150 || length > 800) return 3;
    if (wordCount > 50 || length > 300) return 2;
    return 1;
  }

  // Extract relevant tags using basic keyword matching
  extractTags(content) {
    if (!content) return [];
    
    const text = content.toLowerCase();
    const commonTags = [
      'academic', 'policy', 'requirement', 'course', 'student', 'service',
      'financial', 'aid', 'registration', 'graduation', 'degree', 'credit',
      'housing', 'enrollment', 'schedule', 'prerequisite', 'tuition'
    ];
    
    return commonTags.filter(tag => text.includes(tag));
  }

  // Generate JSON files
  async generateJSONFiles() {
    console.log(chalk.blue('\n📝 Generating JSON files...'));
    
    for (const [category, entries] of Object.entries(this.processedData)) {
      const jsonData = {
        category: category,
        lastUpdated: new Date().toISOString(),
        totalEntries: entries.length,
        totalWordCount: entries.reduce((sum, entry) => sum + (entry.wordCount || 0), 0),
        entries: entries.sort((a, b) => {
          // Sort by priority first, then by word count
          if (a.priority !== b.priority) {
            return b.priority - a.priority;
          }
          return (b.wordCount || 0) - (a.wordCount || 0);
        })
      };
      
      const filename = `${category}.json`;
      const filepath = path.join(this.outputDir, filename);
      
      await fs.writeJson(filepath, jsonData, { spaces: 2 });
      console.log(chalk.green(`✅ Generated: ${filename} (${entries.length} entries, ${jsonData.totalWordCount} words)`));
    }
  }

  // Print processing summary
  printSummary() {
    console.log(chalk.blue('\n📊 Processing Summary:'));
    console.log(chalk.blue('=' .repeat(50)));
    
    let totalEntries = 0;
    let totalWords = 0;
    
    for (const [category, entries] of Object.entries(this.processedData)) {
      const categoryWords = entries.reduce((sum, entry) => sum + (entry.wordCount || 0), 0);
      console.log(chalk.white(`${category}: ${entries.length} entries (${categoryWords} words)`));
      totalEntries += entries.length;
      totalWords += categoryWords;
    }
    
    console.log(chalk.blue('-'.repeat(50)));
    console.log(chalk.green(`Total: ${totalEntries} entries, ${totalWords} words processed`));
    console.log(chalk.blue('\n🎯 JSON files generated in: public/knowledge-base/'));
    
    if (totalEntries > 0) {
      console.log(chalk.yellow('\n💡 Next steps:'));
      console.log(chalk.yellow('1. Review generated JSON files'));
      console.log(chalk.yellow('2. Run database seed: npm run db:seed'));
      console.log(chalk.yellow('3. Test knowledge base search functionality'));
    } else {
      console.log(chalk.red('\n⚠️  No files were processed. Check:'));
      console.log(chalk.yellow('- Files are in correct input folders'));
      console.log(chalk.yellow('- File extensions are supported (.pdf, .txt, .md, .docx, .html)'));
      console.log(chalk.yellow('- Files are not corrupted or empty'));
    }
  }
}

// CLI Interface
async function main() {
  const processor = new DocumentProcessor();
  
  try {
    await processor.init();
    await processor.processAllDocuments();
  } catch (mainError) {
    console.error(chalk.red('\n💥 Processing failed:'), mainError.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default DocumentProcessor;