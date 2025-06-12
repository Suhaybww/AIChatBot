import { KnowledgeBaseSeeder } from './enhanced-seeder';
import fs from 'fs-extra';
import path from 'path';

const KNOWLEDGE_BASE_DIR = path.join(process.cwd(), 'rmit_knowledge_base');

async function main() {
  console.log('🚀 Starting RMIT Knowledge Base Seeding');
  
  // Ensure output directory exists
  await fs.ensureDir(KNOWLEDGE_BASE_DIR);
  
  // Check if files exist
  const generalFile = path.join(KNOWLEDGE_BASE_DIR, 'rmit_knowledge_base.json');
  const courseFile = path.join(KNOWLEDGE_BASE_DIR, 'rmit_course_details.json');
  
  const files = [
    { path: generalFile, name: 'general knowledge base' },
    { path: courseFile, name: 'course details' }
  ];
  
  // Check file sizes and provide info
  for (const file of files) {
    if (await fs.pathExists(file.path)) {
      const stats = await fs.stat(file.path);
      const sizeMB = stats.size / 1024 / 1024;
      console.log(`📊 ${file.name}: ${sizeMB.toFixed(2)} MB`);
    } else {
      console.log(`⚠️ ${file.name}: File not found`);
    }
  }
  
  // Optional: Validate files first (uncomment to enable)
  // console.log('🔍 Validating JSON files...');
  // await validateAllFiles();
  
  // Run the enhanced seeder
  console.log('⚡ Using enhanced batch processor');
  const seeder = new KnowledgeBaseSeeder();
  await seeder.seed();
  
  console.log('🎉 Knowledge base setup complete!');
}

main().catch(console.error);