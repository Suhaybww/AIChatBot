#!/bin/bash

echo "🕷️ Starting RMIT scrapers..."

# Create output directory
mkdir -p rmit_knowledge_base

# Run general sitemap scraper
echo "📄 Running general sitemap scraper..."
python scripts/scrape-general.py

# Run course details scraper  
echo "🎓 Running course details scraper..."
python scripts/scrape-courses.py

echo "✅ Scraping completed!"
echo "📊 File sizes:"
ls -lh rmit_knowledge_base/*.json

# Automatically run seeding
echo "🌱 Starting database seeding..."
npm run seed