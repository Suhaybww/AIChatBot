import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createComprehensiveTestFiles() {
  console.log(chalk.blue('🧪 Creating comprehensive test files for all document types...'));
  
  const testDir = path.join(__dirname, 'input');
  
  // Test content for different categories
  const testContent = {
    academicPolicies: `
University Academic Policies and Requirements

GRADUATION REQUIREMENTS - CRITICAL INFORMATION
Students must complete the following mandatory requirements for graduation:

1. Academic Standing Requirements:
   - Maintain a cumulative GPA of 2.0 or higher throughout program
   - Complete minimum 120 credit hours for bachelor's degree
   - Complete minimum 30 credit hours for master's degree
   - No more than 2 failing grades in major coursework

2. Degree Requirements:
   - Complete all required courses in major field of study
   - Complete general education requirements (42 credit hours)
   - Complete capstone project or thesis (as applicable)
   - Submit graduation application by published deadline

3. Academic Probation Policy:
   Students will be placed on academic probation when:
   - Cumulative GPA falls below 2.0
   - Semester GPA falls below 1.5
   - Failure to make satisfactory academic progress

4. Grade Point Average Calculation:
   - A = 4.0 grade points
   - B = 3.0 grade points  
   - C = 2.0 grade points
   - D = 1.0 grade points
   - F = 0.0 grade points

IMPORTANT: Students on academic probation have one semester to raise their GPA above the minimum threshold or face academic dismissal.
`,

    studentServices: `
Student Services and Support Resources

FINANCIAL AID SERVICES
The Financial Aid Office provides comprehensive support for:

1. Federal Student Aid (FAFSA):
   - Complete FAFSA by March 1st for priority consideration
   - Required annual renewal for continued aid eligibility
   - Verification process may be required for selected applications

2. Scholarship Opportunities:
   - Merit-based scholarships for academic achievement
   - Need-based aid for qualified students
   - Departmental scholarships in specific fields of study
   - External scholarship search assistance

3. Student Employment:
   - Work-study program coordination
   - On-campus job placement assistance
   - Career counseling and resume building

HOUSING SERVICES
Residential Life provides:
- Residence hall room assignments
- Meal plan options and dining services
- Room change requests and roommate mediation
- Maintenance requests and facility management

REGISTRATION AND ENROLLMENT
- Course enrollment and schedule planning
- Add/drop period assistance (first two weeks of semester)
- Transcript requests and degree audits
- Academic advising appointment scheduling

STUDENT SUPPORT SERVICES
- Academic tutoring and study groups
- Mental health counseling and wellness programs
- Disability support services and accommodations
- International student services and visa support
`,

    courseInformation: `
Course Information and Academic Planning Guide

COURSE SCHEDULING SYSTEM
Academic calendar follows semester system:

Fall Semester: August - December
- Classes begin: Late August
- Fall break: Mid-October (1 week)
- Thanksgiving break: Late November
- Final exams: Mid-December

Spring Semester: January - May  
- Classes begin: Mid-January
- Spring break: Early March (1 week)
- Final exams: Early May

Summer Sessions: June - August
- Summer I: June - July (6 weeks)
- Summer II: July - August (6 weeks)
- Full summer: June - August (12 weeks)

COURSE LOAD AND PREREQUISITES
Full-time student status: 12+ credit hours per semester
Part-time student status: Less than 12 credit hours
Maximum course load: 18 credit hours without special permission

Prerequisites must be completed before enrollment in advanced courses:
- Prerequisite grades of C or better required
- Co-requisites may be taken simultaneously
- Placement test scores may substitute for prerequisites

PROGRAM REQUIREMENTS BY MAJOR
Each degree program has specific curriculum requirements:
- Core curriculum: foundational courses in major field
- Electives: student choice within approved course list  
- General education: university-wide graduation requirements
- Capstone: culminating experience (thesis, project, or comprehensive exam)

COURSE REGISTRATION PROCESS
1. Meet with academic advisor for course planning
2. Check prerequisite completion and course availability
3. Register during assigned registration window
4. Confirm schedule and payment of tuition/fees
5. Attend classes from first day - attendance policies vary by instructor
`,

    faq: `
Frequently Asked Questions - Student Help Center

ADMISSIONS AND ENROLLMENT
Q: How do I apply for admission to the university?
A: Complete the online application at our admissions portal. Submit all required documents including transcripts, test scores, and essays by the application deadline.

Q: What are the application deadlines?
A: Fall semester: March 1st (priority), May 1st (final). Spring semester: October 1st. Summer: March 15th.

Q: How do I check my application status?
A: Log into your applicant portal using your student ID and password to view real-time application status updates.

REGISTRATION AND COURSES  
Q: How do I register for classes?
A: Use the online student portal during your assigned registration window. Contact your academic advisor if you need assistance with course selection.

Q: What if a class I need is full?
A: Add yourself to the waitlist through the registration system. You can also contact the department to request permission to enroll.

Q: Can I change my schedule after registration?
A: Yes, during the add/drop period (first two weeks of semester) you can make changes without penalty through the student portal.

FINANCIAL INFORMATION
Q: When is tuition due?
A: Tuition and fees are due by the first day of classes each semester. Late payment fees apply after the deadline.

Q: What payment methods are accepted?
A: We accept online payments, checks, money orders, and credit cards. Payment plans are available through the bursar's office.

Q: How do I apply for financial aid?
A: Complete the Free Application for Federal Student Aid (FAFSA) by March 1st for priority consideration. Visit our financial aid office for assistance.

CAMPUS SERVICES
Q: Where can I get academic help?
A: The Academic Success Center offers tutoring, study groups, and learning resources. Contact your department advisor for subject-specific assistance.

Q: How do I access campus Wi-Fi?
A: Connect to "Campus-WiFi" using your student login credentials. Visit the IT help desk if you experience connection issues.

Q: What dining options are available on campus?
A: Multiple dining locations including cafeterias, food courts, and coffee shops. Meal plans are available for purchase through student services.
`,

    htmlContent: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>University Academic Resources - Online Help Center</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background-color: #003366; color: white; padding: 20px; }
        .nav { background-color: #f0f0f0; padding: 10px; }
        .content { padding: 20px; }
        .section { margin-bottom: 30px; }
        .important { background-color: #fff3cd; padding: 10px; border-left: 4px solid #ffc107; }
    </style>
</head>
<body>
    <header class="header">
        <h1>University Student Portal - Academic Resources</h1>
        <p>Your comprehensive guide to university policies and procedures</p>
    </header>
    
    <nav class="nav">
        <a href="#academics">Academics</a> | 
        <a href="#services">Services</a> | 
        <a href="#help">Help</a> | 
        <a href="#contact">Contact</a>
    </nav>

    <main class="content">
        <section id="academics" class="section">
            <h2>Academic Information Center</h2>
            <div class="important">
                <strong>Important:</strong> All academic policy changes are effective immediately upon publication.
            </div>
            
            <h3>Degree Requirements</h3>
            <p>All undergraduate students must complete a minimum of 120 credit hours to be eligible for graduation. 
            This includes completion of general education requirements, major-specific coursework, and elective credits.</p>
            
            <h3>GPA Requirements</h3>
            <ul>
                <li>Minimum cumulative GPA of 2.0 required for graduation</li>
                <li>Major GPA of 2.5 required in most programs</li>
                <li>Dean's List: 3.5 GPA with 12+ credit hours</li>
                <li>Academic probation: Below 2.0 cumulative GPA</li>
            </ul>

            <h3>Course Prerequisites</h3>
            <p>Students must complete prerequisite courses with a grade of C or better before enrolling in 
            advanced coursework. Placement test scores may substitute for some prerequisites.</p>
        </section>

        <section id="services" class="section">
            <h2>Student Services Directory</h2>
            
            <h3>Registration Services</h3>
            <p>Course registration opens according to student classification and credit hours completed. 
            Students can add or drop courses during the first two weeks of each semester without penalty.</p>
            
            <h3>Financial Aid Office</h3>
            <p>Complete your FAFSA by March 1st for priority consideration of federal and institutional aid. 
            Payment plans and emergency financial assistance are available through the bursar's office.</p>
            
            <h3>Housing and Dining</h3>
            <p>On-campus housing applications are processed on a first-come, first-served basis. 
            Meal plans are required for all residence hall residents.</p>
        </section>

        <section id="help" class="section">
            <h2>Getting Help - Support Resources</h2>
            
            <h3>Academic Support</h3>
            <p>The Academic Success Center provides free tutoring services, study groups, and learning workshops. 
            Schedule appointments online or visit during walk-in hours.</p>
            
            <h3>Technical Support</h3>
            <p>IT Help Desk assists with student portal access, email setup, and campus Wi-Fi connectivity. 
            Submit help tickets online or call the support hotline.</p>
            
            <h3>Counseling Services</h3>
            <p>Mental health counseling and wellness programs are available to all enrolled students. 
            Services include individual counseling, group therapy, and crisis intervention.</p>
        </section>
    </main>

    <footer>
        <p>&copy; 2024 University Student Services. For additional help, contact the Student Success Center.</p>
    </footer>
    
    <script>
        // This script section will be removed during processing
        console.log("This JavaScript will not appear in processed content");
    </script>
</body>
</html>`,

    markdownContent: `# University Policy Manual - Academic Standards

## Overview
This document outlines the essential academic policies and standards that govern student academic progress and degree completion requirements.

### Academic Standing Categories

#### Good Standing
- Cumulative GPA of 2.0 or higher
- Satisfactory progress toward degree completion
- No outstanding academic or disciplinary sanctions

#### Academic Warning
- Cumulative GPA between 1.5 and 1.99
- Student receives academic advising requirement
- Enrollment may be limited to 13 credit hours maximum

#### Academic Probation
Students are placed on academic probation when:
- Cumulative GPA falls below 1.5
- Failure to meet satisfactory academic progress standards
- Two consecutive semesters with GPA below 2.0

### Grade Point System

| Letter Grade | Quality Points | Description |
|-------------|----------------|-------------|
| A           | 4.0           | Excellent   |
| A-          | 3.7           | Excellent   |
| B+          | 3.3           | Good        |
| B           | 3.0           | Good        |
| B-          | 2.7           | Good        |
| C+          | 2.3           | Satisfactory|
| C           | 2.0           | Satisfactory|
| C-          | 1.7           | Below Average|
| D+          | 1.3           | Poor        |
| D           | 1.0           | Poor        |
| F           | 0.0           | Failing     |

### Important Deadlines and Requirements

**Critical Dates:**
- FAFSA Priority Deadline: **March 1st**
- Graduation Application: **October 1st** (Spring), **March 1st** (Fall)
- Course Registration: Begins 6 weeks before semester start
- Add/Drop Period: First 10 business days of semester

**Graduation Requirements:**
1. Complete minimum 120 credit hours
2. Achieve cumulative GPA ≥ 2.0
3. Complete major requirements with GPA ≥ 2.5
4. Fulfill general education requirements (42 hours)
5. Complete final 30 hours in residence

> **Note:** Policy changes may occur. Students are responsible for staying informed of current academic requirements through official university communications.

---
*For questions about academic policies, contact the Registrar's Office or your academic advisor.*`
  };

  try {
    // Ensure all directories exist
    await fs.ensureDir(path.join(testDir, 'text-files'));
    await fs.ensureDir(path.join(testDir, 'pdfs'));
    await fs.ensureDir(path.join(testDir, 'web-content'));
    await fs.ensureDir(path.join(testDir, 'processed'));

    console.log(chalk.blue('\n💾 Creating text files...'));
    
    // Create comprehensive text files
    await fs.writeFile(
      path.join(testDir, 'text-files/academic-policies-comprehensive.txt'), 
      testContent.academicPolicies
    );
    
    await fs.writeFile(
      path.join(testDir, 'text-files/student-services-guide.txt'), 
      testContent.studentServices
    );
    
    await fs.writeFile(
      path.join(testDir, 'text-files/course-information-detailed.txt'), 
      testContent.courseInformation
    );
    
    await fs.writeFile(
      path.join(testDir, 'text-files/frequently-asked-questions.txt'), 
      testContent.faq
    );

    // Create markdown file
    await fs.writeFile(
      path.join(testDir, 'text-files/academic-policy-manual.md'), 
      testContent.markdownContent
    );

    console.log(chalk.blue('🌐 Creating HTML files...'));
    
    // Create HTML files
    await fs.writeFile(
      path.join(testDir, 'web-content/university-portal.html'), 
      testContent.htmlContent
    );

    // Create additional HTML with different content
    const faqHtml = `
<!DOCTYPE html>
<html>
<head><title>FAQ - Student Help</title></head>
<body>
    <h1>Student FAQ Center</h1>
    <div class="faq-section">
        <h2>How do I register for courses?</h2>
        <p>Students can register for courses through the online student portal during their assigned registration window.</p>
        
        <h2>What financial aid is available?</h2>
        <p>Financial aid includes federal grants, loans, work-study programs, and institutional scholarships. Complete the FAFSA to apply.</p>
        
        <h2>Where can I get academic help?</h2>
        <p>The Academic Success Center offers tutoring, study groups, and learning support services for all students.</p>
    </div>
</body>
</html>`;

    await fs.writeFile(
      path.join(testDir, 'web-content/student-faq.html'), 
      faqHtml
    );

    console.log(chalk.blue('📋 Creating additional test files...'));

    // Create some edge case test files
    await fs.writeFile(
      path.join(testDir, 'text-files/short-policy.txt'), 
      'Important: Students must maintain 2.0 GPA for graduation.'
    );

    await fs.writeFile(
      path.join(testDir, 'text-files/mixed-content.txt'), 
      `Registration Information and Course Requirements

This document contains information about course registration, financial aid deadlines, and graduation requirements.

Students must complete prerequisite courses before enrolling in advanced classes. The academic calendar shows important dates for registration and payment deadlines.

Housing services provides residence hall assignments and meal plan options for students living on campus.`
    );

    console.log(chalk.yellow('\n📄 PDF File Instructions:'));
    console.log(chalk.gray('To test PDF processing, you can:'));
    console.log(chalk.gray('1. Convert any of the created text files to PDF using online tools'));
    console.log(chalk.gray('2. Download sample PDFs from university websites'));
    console.log(chalk.gray('3. Create PDFs from Word documents'));
    console.log(chalk.gray('4. Place PDF files in: scripts/input/pdfs/'));

    console.log(chalk.yellow('\n📝 DOCX File Instructions:'));
    console.log(chalk.gray('To test DOCX processing:'));
    console.log(chalk.gray('1. Copy any text content above into Microsoft Word'));
    console.log(chalk.gray('2. Save as .docx format'));
    console.log(chalk.gray('3. Place in: scripts/input/text-files/'));

    // Create a sample script to convert text to PDF (requires additional dependencies)
    const pdfConversionNote = `# PDF Creation Guide

To create test PDFs for processing:

## Option 1: Online Conversion
1. Copy content from any .txt file in text-files/
2. Use online converters like:
   - smallpdf.com/txt-to-pdf
   - ilovepdf.com/txt_to_pdf
   - convertio.co/txt-pdf

## Option 2: Command Line (requires additional setup)
\`\`\`bash
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
\`\`\`

## Option 3: From Word Documents
1. Create Word document with test content
2. Save As → PDF format
3. Place in scripts/input/pdfs/

## Sample PDF Content Suggestions:
- University handbook pages
- Course catalog excerpts  
- Academic policy documents
- Student services brochures
`;

    await fs.writeFile(
      path.join(testDir, 'PDF_CREATION_GUIDE.md'), 
      pdfConversionNote
    );

    console.log(chalk.green('\n✅ Comprehensive test files created successfully!'));
    console.log(chalk.blue('\n📁 File Summary:'));
    console.log(chalk.white('Text Files:'));
    console.log(chalk.gray('  • academic-policies-comprehensive.txt (detailed policies)'));
    console.log(chalk.gray('  • student-services-guide.txt (comprehensive services)'));
    console.log(chalk.gray('  • course-information-detailed.txt (course info)'));
    console.log(chalk.gray('  • frequently-asked-questions.txt (FAQ content)'));
    console.log(chalk.gray('  • academic-policy-manual.md (markdown format)'));
    console.log(chalk.gray('  • short-policy.txt (minimal content test)'));
    console.log(chalk.gray('  • mixed-content.txt (category mixing test)'));
    
    console.log(chalk.white('\nHTML Files:'));
    console.log(chalk.gray('  • university-portal.html (full webpage)'));
    console.log(chalk.gray('  • student-faq.html (FAQ webpage)'));
    
    console.log(chalk.white('\nDocumentation:'));
    console.log(chalk.gray('  • PDF_CREATION_GUIDE.md (instructions for PDF testing)'));

    console.log(chalk.yellow('\n🚀 Next Steps:'));
    console.log(chalk.yellow('1. Run: npm run process-docs'));
    console.log(chalk.yellow('2. Add PDF files to: scripts/input/pdfs/'));
    console.log(chalk.yellow('3. Add DOCX files to: scripts/input/text-files/'));
    console.log(chalk.yellow('4. Check generated JSON files in: public/knowledge-base/'));

  } catch (testError) {
    console.error(chalk.red('❌ Error creating test files:', testError.message));
  }
}

createComprehensiveTestFiles();