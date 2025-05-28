import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createTestPDFs() {
  console.log(chalk.blue('📄 Creating test PDF files...'));
  
  const pdfDir = path.join(__dirname, 'input', 'pdfs');
  await fs.ensureDir(pdfDir);

  // Test content for PDF creation
  const pdfContents = {
    'academic-policy.pdf': `
UNIVERSITY ACADEMIC POLICY HANDBOOK

GRADUATION REQUIREMENTS

All students must meet the following requirements to be eligible for graduation:

1. CREDIT REQUIREMENTS
   - Complete minimum 120 credit hours for bachelor's degree
   - Maintain cumulative GPA of 2.0 or higher
   - Complete final 30 credit hours in residence at the university

2. ACADEMIC STANDING
   Students must maintain good academic standing throughout their program:
   - Cumulative GPA of 2.0 or higher required
   - Major GPA of 2.5 required for most programs
   - No more than two failing grades in major coursework

3. IMPORTANT DEADLINES
   - Graduation application deadline: October 1st (Spring), March 1st (Fall)
   - Final transcript submission: 30 days before graduation
   - All requirements must be completed before degree conferral

ACADEMIC PROBATION POLICY
Students will be placed on academic probation when their cumulative GPA falls below 2.0. Students on probation must:
- Meet with academic advisor each semester
- Enroll in academic success workshop
- Limit course load to 13 credit hours maximum
- Raise GPA above 2.0 within two semesters or face academic dismissal

This policy is mandatory and applies to all undergraduate students.
`,

    'financial-aid-guide.pdf': `
FINANCIAL AID SERVICES GUIDE

FEDERAL STUDENT AID

Complete your Free Application for Federal Student Aid (FAFSA) to apply for:
- Federal Pell Grants (need-based, no repayment required)
- Federal Direct Loans (subsidized and unsubsidized)
- Federal Work-Study Program
- Federal Supplemental Educational Opportunity Grant (FSEOG)

IMPORTANT: FAFSA Priority Deadline is March 1st each year for maximum aid consideration.

INSTITUTIONAL AID

University scholarships and grants available:
- Merit-based academic scholarships
- Need-based institutional grants
- Departmental scholarships by major
- Athletic scholarships for eligible student-athletes

APPLICATION PROCESS
1. Complete FAFSA at studentaid.gov
2. Submit required verification documents if selected
3. Review and accept aid offer through student portal
4. Complete entrance counseling for first-time borrowers
5. Sign Master Promissory Note for loan recipients

STUDENT EMPLOYMENT
Work-Study positions available in:
- Academic departments and libraries
- Student services offices
- Food service and campus operations
- Community service and tutoring programs

For assistance with financial aid applications, visit the Financial Aid Office or call the helpline during business hours.
`,

    'course-registration-faq.pdf': `
COURSE REGISTRATION - FREQUENTLY ASKED QUESTIONS

Q: When can I register for courses?
A: Registration opens 6 weeks before the semester begins. Your specific registration date and time are based on your classification and total credit hours completed.

Q: How do I register for courses?
A: Use the online student portal to search for courses, check availability, and add courses to your schedule. You can also register by phone or in person at the Registrar's Office.

Q: What if the course I need is full?
A: Add yourself to the waitlist through the online system. You'll be automatically enrolled if a spot opens up. You can also contact the academic department to request permission to enroll.

Q: Can I change my schedule after registering?
A: Yes! You can add or drop courses during the first two weeks of the semester without academic penalty. After the add/drop period, you may withdraw from courses but will receive a "W" grade.

Q: What are prerequisites and how do I check them?
A: Prerequisites are courses you must complete before enrolling in more advanced classes. Check the course catalog or speak with your advisor to verify you've met all requirements.

Q: How many courses should I take per semester?
A: Full-time status requires 12+ credit hours. Most students take 15-16 credit hours (5-6 courses) per semester. Taking more than 18 credit hours requires advisor approval.

Q: What if I have a scheduling conflict?
A: Contact your academic advisor immediately. They can help you find alternative courses or sections that fit your schedule while meeting degree requirements.

Q: How do I get help with course selection?
A: Schedule an appointment with your academic advisor. They can help you plan your schedule, ensure you're meeting degree requirements, and discuss course options.

For additional registration assistance, contact the Registrar's Office or visit during walk-in advising hours.
`
  };

 try {
    // Check if PDFKit is available
    let PDFDocument;
    try {
      const pdfkit = await import('pdfkit');
      PDFDocument = pdfkit.default;
      console.log(chalk.green('✅ PDFKit library found, creating actual PDF files...'));
    } catch {
      console.log(chalk.yellow('⚠️ PDFKit not installed. Creating text files as PDF alternatives...'));
      
      // Create text files with PDF-like content instead
      for (const [filename, content] of Object.entries(pdfContents)) {
        const textFilename = filename.replace('.pdf', '-pdf-content.txt');
        const textPath = path.join(pdfDir, textFilename);
        await fs.writeFile(textPath, content);
        console.log(chalk.blue(`📄 Created: ${textFilename} (PDF content as text)`));
      }
      
      console.log(chalk.yellow('\n💡 To create actual PDFs:'));
      console.log(chalk.gray('1. Install PDFKit: npm install pdfkit'));
      console.log(chalk.gray('2. Run this script again'));
      console.log(chalk.gray('3. Or convert text files to PDF manually'));
      return;
    }

    // Create actual PDF files
    for (const [filename, content] of Object.entries(pdfContents)) {
      const pdfPath = path.join(pdfDir, filename);
      
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4'
      });
      
      // Pipe the PDF to a file
      doc.pipe(fs.createWriteStream(pdfPath));
      
      // Add title
      doc.fontSize(18)
         .font('Helvetica-Bold')
         .text(filename.replace('.pdf', '').toUpperCase().replace(/-/g, ' '), {
           align: 'center'
         });
      
      doc.moveDown(2);
      
      // Add content
      doc.fontSize(11)
         .font('Helvetica')
         .text(content.trim(), {
           align: 'left',
           lineGap: 2
         });
      
      // Finalize the PDF
      doc.end();
      
      console.log(chalk.green(`✅ Created PDF: ${filename}`));
    }

    console.log(chalk.blue('\n📊 PDF Creation Summary:'));
    console.log(chalk.white(`Created ${Object.keys(pdfContents).length} test PDF files:`));
    for (const filename of Object.keys(pdfContents)) {
      console.log(chalk.gray(`  • ${filename}`));
    }
    
    console.log(chalk.green('\n🎉 Test PDFs created successfully!'));
    console.log(chalk.yellow('🚀 Now run: npm run process-docs'));

  } catch (createError) {
    console.error(chalk.red('❌ Error creating PDFs:', createError.message));
    
    // Fallback: create text files with PDF content
    console.log(chalk.yellow('📄 Creating text files as fallback...'));
    for (const [filename, content] of Object.entries(pdfContents)) {
      const textFilename = filename.replace('.pdf', '-pdf-content.txt');
      const textPath = path.join(pdfDir, textFilename);
      await fs.writeFile(textPath, content);
      console.log(chalk.blue(`📄 Created: ${textFilename}`));
    }
  }
}

createTestPDFs();