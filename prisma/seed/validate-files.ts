import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KNOWLEDGE_BASE_DIR = path.join(__dirname, '..', '..', '..', 'rmit_knowledge_base');

interface ValidationReport {
  file: string;
  isValid: boolean;
  size: string;
  itemCount: number;
  errors: string[];
  warnings: string[];
  sampleData: unknown;
  recommendations: string[];
}

class FileValidator {
  async validateFile(filePath: string, expectedType: 'general' | 'course'): Promise<ValidationReport> {
    const report: ValidationReport = {
      file: path.basename(filePath),
      isValid: true,
      size: '0 MB',
      itemCount: 0,
      errors: [],
      warnings: [],
      sampleData: null,
      recommendations: []
    };

    try {
      // Check if file exists
      if (!await fs.pathExists(filePath)) {
        report.errors.push('File does not exist');
        report.isValid = false;
        return report;
      }

      // Get file size
      const stats = await fs.stat(filePath);
      const sizeMB = stats.size / 1024 / 1024;
      report.size = `${sizeMB.toFixed(2)} MB`;

      // Size recommendations
      if (sizeMB > 100) {
        report.recommendations.push('Large file detected. The enhanced seeder will process this efficiently in batches.');
      } else if (sizeMB > 50) {
        report.recommendations.push('Medium-sized file. Processing will take a few minutes.');
      } else {
        report.recommendations.push('File size is optimal for quick processing.');
      }

      // Parse JSON
      let data: unknown[];
      try {
        const content = await fs.readJson(filePath);
        data = Array.isArray(content) ? content : [content];
      } catch (error) {
        report.errors.push(`Invalid JSON format: ${error}`);
        report.isValid = false;
        return report;
      }

      report.itemCount = data.length;
      
      if (data.length === 0) {
        report.warnings.push('File contains no data');
        return report;
      }

      // Get sample data
      report.sampleData = data[0];

      // Validate structure based on expected type
      if (expectedType === 'general') {
        this.validateGeneralStructure(data, report);
      } else if (expectedType === 'course') {
        this.validateCourseStructure(data, report);
      }

      // General validations
      this.validateGeneralRequirements(data, report);

    } catch (error) {
      report.errors.push(`Validation failed: ${error}`);
      report.isValid = false;
    }

    report.isValid = report.errors.length === 0;
    return report;
  }

  private validateGeneralStructure(data: unknown[], report: ValidationReport) {
    const requiredFields = ['url', 'title', 'content', 'category'];
    
    // Check first 10 items for structure
    const sampleSize = Math.min(10, data.length);
    let missingFieldCount = 0;

    for (let i = 0; i < sampleSize; i++) {
      const item = data[i] as Record<string, unknown>;
      
      requiredFields.forEach(field => {
        if (!item[field]) {
          missingFieldCount++;
        }
      });

      // Check for common issues
      if (typeof item.content === 'string' && item.content.length < 10) {
        report.warnings.push(`Item ${i + 1}: Very short content (${item.content.length} chars)`);
      }

      if (typeof item.url === 'string' && !item.url.includes('rmit.edu.au')) {
        report.warnings.push(`Item ${i + 1}: URL doesn't appear to be from RMIT`);
      }
    }

    if (missingFieldCount > sampleSize * 0.5) {
      report.errors.push('Many items missing required fields (url, title, content, category)');
    } else if (missingFieldCount > 0) {
      report.warnings.push(`Some items missing required fields (${missingFieldCount}/${sampleSize} checked)`);
    }

    // Check categories
    const categories = Array.from(new Set(data.map((item: unknown) => (item as Record<string, unknown>)?.category).filter(Boolean)));
    if (categories.length === 0) {
      report.warnings.push('No categories found in data');
    } else {
      report.recommendations.push(`Found ${categories.length} categories: ${categories.slice(0, 5).join(', ')}${categories.length > 5 ? '...' : ''}`);
    }
  }

  private validateCourseStructure(data: unknown[], report: ValidationReport) {
    const requiredFields = ['source_url', 'course_title'];
    const importantFields = ['course_code', 'school', 'course_description'];
    
    const sampleSize = Math.min(10, data.length);
    let missingRequiredCount = 0;
    let missingImportantCount = 0;
    let coursesWithCodes = 0;

    for (let i = 0; i < sampleSize; i++) {
      const item = data[i] as Record<string, unknown>;
      
      requiredFields.forEach(field => {
        if (!item[field]) {
          missingRequiredCount++;
        }
      });

      importantFields.forEach(field => {
        if (!item[field]) {
          missingImportantCount++;
        }
      });

      if (item.course_code) {
        coursesWithCodes++;
        
        // Validate course code format
        if (typeof item.course_code === 'string' && !/^[A-Z]{2,4}\d{3,5}$/.test(item.course_code)) {
          report.warnings.push(`Item ${i + 1}: Unusual course code format: ${item.course_code}`);
        }
      }

      if (typeof item.source_url === 'string' && !item.source_url.includes('rmit.edu.au')) {
        report.warnings.push(`Item ${i + 1}: URL doesn't appear to be from RMIT`);
      }
    }

    if (missingRequiredCount > 0) {
      report.errors.push(`Items missing required fields: ${missingRequiredCount}/${sampleSize} checked`);
    }

    if (missingImportantCount > sampleSize * 0.7) {
      report.warnings.push('Many items missing important course data (course_code, school, description)');
    }

    const courseCodePercentage = (coursesWithCodes / sampleSize) * 100;
    if (courseCodePercentage < 50) {
      report.warnings.push(`Low percentage of items with course codes (${courseCodePercentage.toFixed(1)}%)`);
    } else {
      report.recommendations.push(`Good course code coverage (${courseCodePercentage.toFixed(1)}%)`);
    }
  }

  private validateGeneralRequirements(data: unknown[], report: ValidationReport) {
    // Check for duplicates
    const urls = data.map((item: unknown) => {
      const record = item as Record<string, unknown>;
      return (record?.url || record?.source_url) as string;
    }).filter(Boolean);
    const uniqueUrls = new Set(urls);
    
    if (urls.length !== uniqueUrls.size) {
      const duplicateCount = urls.length - uniqueUrls.size;
      report.warnings.push(`Found ${duplicateCount} duplicate URLs`);
      report.recommendations.push('Consider running deduplication before seeding');
    }

    // Check data distribution
    if (data.length > 10000) {
      report.recommendations.push('Large dataset detected. Consider using batch processing.');
    }

    // Check for empty content
    const emptyContent = data.filter((item: unknown) => {
      const record = item as Record<string, unknown>;
      return !record?.content && !record?.course_description;
    }).length;
    
    if (emptyContent > data.length * 0.1) {
      report.warnings.push(`${emptyContent} items (${(emptyContent/data.length*100).toFixed(1)}%) have no content`);
    }
  }
}

async function validateAllFiles(): Promise<void> {
  console.log('🔍 Starting JSON file validation...\n');

  const validator = new FileValidator();
  const files = [
    { path: path.join(KNOWLEDGE_BASE_DIR, 'rmit_knowledge_base.json'), type: 'general' as const },
    { path: path.join(KNOWLEDGE_BASE_DIR, 'rmit_course_details.json'), type: 'course' as const }
  ];

  const reports: ValidationReport[] = [];

  for (const file of files) {
    console.log(`📄 Validating ${file.type} file: ${path.basename(file.path)}`);
    const report = await validator.validateFile(file.path, file.type);
    reports.push(report);
    
    // Print immediate results
    console.log(`  📊 Size: ${report.size}`);
    console.log(`  📝 Items: ${report.itemCount.toLocaleString()}`);
    console.log(`  ✅ Valid: ${report.isValid ? 'Yes' : 'No'}`);
    
    if (report.errors.length > 0) {
      console.log(`  ❌ Errors: ${report.errors.length}`);
      report.errors.forEach(error => console.log(`    - ${error}`));
    }
    
    if (report.warnings.length > 0) {
      console.log(`  ⚠️  Warnings: ${report.warnings.length}`);
      report.warnings.slice(0, 3).forEach(warning => console.log(`    - ${warning}`));
    }
    
    console.log('');
  }

  // Generate summary report
  console.log('📋 Validation Summary');
  console.log('═'.repeat(50));
  
  const totalItems = reports.reduce((sum, r) => sum + r.itemCount, 0);
  const totalErrors = reports.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = reports.reduce((sum, r) => sum + r.warnings.length, 0);
  const allValid = reports.every(r => r.isValid);
  
  console.log(`Total items: ${totalItems.toLocaleString()}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log(`Total warnings: ${totalWarnings}`);
  console.log(`Overall status: ${allValid ? '✅ Ready for seeding' : '❌ Issues need attention'}`);

  // Recommendations
  const allRecommendations = reports.flatMap(r => r.recommendations);
  if (allRecommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    Array.from(new Set(allRecommendations)).forEach(rec => console.log(`  - ${rec}`));
  }

  // Sample data preview
  const validReports = reports.filter(r => r.isValid && r.sampleData);
  if (validReports.length > 0) {
    console.log('\n📝 Sample Data Preview:');
    validReports.forEach(report => {
      console.log(`\n  ${report.file}:`);
      const sample = report.sampleData as Record<string, unknown>;
      if (sample && typeof sample === 'object') {
        Object.keys(sample).slice(0, 5).forEach(key => {
          const value = sample[key];
          const display = typeof value === 'string' ? 
            value.substring(0, 50) + (value.length > 50 ? '...' : '') :
            JSON.stringify(value).substring(0, 50);
          console.log(`    ${key}: ${display}`);
        });
      }
    });
  }

  // Save detailed report
  const reportPath = path.join(KNOWLEDGE_BASE_DIR, 'validation_report.json');
  await fs.writeJson(reportPath, {
    timestamp: new Date().toISOString(),
    summary: {
      totalItems,
      totalErrors,
      totalWarnings,
      allValid
    },
    files: reports
  }, { spaces: 2 });
  
  console.log(`\n💾 Detailed report saved to: ${reportPath}`);
  
  if (!allValid) {
    console.log('\n⚠️  Please fix errors before running the seeder.');
    process.exit(1);
  } else {
    console.log('\n🎉 All files validated successfully! Ready to seed database.');
  }
}

// Run validation if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateAllFiles().catch(error => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
}

export { FileValidator, validateAllFiles };