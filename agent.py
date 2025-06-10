import requests
from bs4 import BeautifulSoup
import os
import re
import json
import time
from urllib.parse import urljoin, urlparse, parse_qs
from typing import List, Tuple, Dict, Set, Optional
from datetime import datetime
import logging
from pathlib import Path
import colorama
from colorama import Fore, Style, Back
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from queue import Queue
import hashlib
import xml.etree.ElementTree as ET

# Initialize colorama for colored terminal output
colorama.init()

# Setup logging with colors
class ColoredFormatter(logging.Formatter):
    """Custom formatter with colors for different log levels"""
    
    COLORS = {
        'DEBUG': Fore.CYAN,
        'INFO': Fore.GREEN,
        'WARNING': Fore.YELLOW,
        'ERROR': Fore.RED,
        'CRITICAL': Fore.RED + Back.WHITE
    }
    
    def format(self, record):
        log_color = self.COLORS.get(record.levelname, '')
        record.levelname = f"{log_color}{record.levelname}{Style.RESET_ALL}"
        record.msg = f"{log_color}{record.msg}{Style.RESET_ALL}"
        return super().format(record)

# Setup logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Console handler with colors
console_handler = logging.StreamHandler()
console_handler.setFormatter(ColoredFormatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(console_handler)

# File handler without colors
file_handler = logging.FileHandler('rmit_scraper.log')
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

# Configuration
CONFIG = {
    "output_dir": "rmit_knowledge_base",
    "max_retries": 3,
    "timeout": 30,
    "rate_limit": 0.3,  # seconds between requests
    "user_agent": "Educational Knowledge Base Crawler for Course Information",
    "save_progress_every": 50,  # save after every N items
    "max_depth": 5,  # increased crawling depth
    "max_pages": 15000,  # increased for comprehensive coverage 
    "max_threads": 5,   # keep threads controlled to prevent queue explosion
    "max_queue_size": 15000,  # increased queue size for more comprehensive crawling
    "content_categories": {
        "course-information": ["course", "program", "bachelor", "master", "diploma", "certificate", "degree"],
        "subject-information": ["subject", "unit", "elective", "core", "prerequisite", "curriculum", "syllabus", "handbook"],
        "policies": ["policy", "policies", "regulation", "procedure", "guideline", "rule"],
        "student-support": ["support", "help", "service", "wellbeing", "counselling", "advice"],
        "enrollment": ["enrol", "enrollment", "admission", "apply", "application", "entry"],
        "fees-scholarships": ["fees", "cost", "scholarship", "financial", "payment"],
        "academic-info": ["academic", "calendar", "timetable", "exam", "assessment", "grade"],
        "student-life": ["student life", "campus", "accommodation", "facilities", "clubs"],
        "research": ["research", "phd", "doctorate", "thesis", "publication"],
        "careers": ["career", "employment", "job", "internship", "placement"],
        "international": ["international", "visa", "overseas", "exchange"],
        "online-learning": ["online", "remote", "digital", "e-learning"],
        "faq": ["faq", "frequently asked", "question", "answer", "help", "guide", "common"],
        "forms": ["form", "document", "template", "download"],
        "contact": ["contact", "enquiry", "inquiry", "ask", "email", "phone"],
    }
}

# Create output directory
Path(CONFIG["output_dir"]).mkdir(exist_ok=True)

class RMITKnowledgeBaseScraper:
    """Comprehensive scraper for RMIT knowledge base"""
    
    def __init__(self):
        self.thread_local = threading.local()
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': CONFIG["user_agent"],
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
        })
        self.all_content = []
        self.visited_urls = set()
        self.content_hashes = set()  # To avoid duplicate content
        self.url_queue = Queue()
        self.lock = threading.Lock()
        self.stats = {category: 0 for category in CONFIG["content_categories"]}
        self.stats["total"] = 0
        self.stats["duplicates"] = 0
        
    def get_session(self):
        """Get thread-local session"""
        if not hasattr(self.thread_local, "session"):
            self.thread_local.session = requests.Session()
            self.thread_local.session.headers.update({
                'User-Agent': CONFIG["user_agent"],
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
            })
        return self.thread_local.session
    
    def print_banner(self):
        """Print a colorful banner"""
        print(f"\n{Fore.CYAN}{'='*80}")
        print(f"{Fore.YELLOW}✨ RMIT Comprehensive Knowledge Base Scraper ✨")
        print(f"{Fore.GREEN}🗺️  Using RMIT sitemap.xml for complete coverage!")
        print(f"{Fore.GREEN}Collecting ALL information: courses, policies, student services, and more!")
        print(f"{Fore.MAGENTA}Multi-threaded for maximum efficiency")
        print(f"{Fore.CYAN}{'='*80}{Style.RESET_ALL}\n")
    
    def print_stats(self):
        """Print current statistics"""
        print(f"\n{Fore.YELLOW}📊 Current Statistics:")
        for category, count in self.stats.items():
            if category not in ["total", "duplicates"] and count > 0:
                print(f"  {Fore.CYAN}{category}: {Fore.WHITE}{count}")
        print(f"  {Fore.GREEN}Total items: {Fore.WHITE}{self.stats['total']}")
        print(f"  {Fore.YELLOW}Duplicates avoided: {Fore.WHITE}{self.stats['duplicates']}")
        print(f"  {Fore.BLUE}URLs visited: {Fore.WHITE}{len(self.visited_urls)}\n")
    
    def categorize_content(self, url: str, title: str, content: str) -> str:
        """Determine the category of content based on URL and content"""
        url_lower = url.lower()
        title_lower = title.lower() if title else ""
        content_lower = content.lower()[:1000] if content else ""  # First 1000 chars
        
        # Check each category
        best_category = "general-information"
        best_score = 0
        
        for category, keywords in CONFIG["content_categories"].items():
            score = 0
            for keyword in keywords:
                if keyword in url_lower:
                    score += 3
                if keyword in title_lower:
                    score += 2
                if keyword in content_lower:
                    score += 1
            
            if score > best_score:
                best_score = score
                best_category = category
        
        return best_category
    
    def extract_course_codes_from_text(self, text: str) -> List[str]:
        """Extract course codes from text using RMIT's patterns"""
        patterns = [
            r'\b([A-Z]{2,4}\d{3,5})\b',  # Standard codes like BP094, COSC1234
            r'\b([A-Z]\d{4,5})\b',        # Codes like C4415
        ]
        
        course_codes = []
        for pattern in patterns:
            matches = re.findall(pattern, text)
            course_codes.extend(matches)
        
        # Filter valid RMIT course codes
        filtered_codes = []
        valid_prefixes = ['BP', 'MC', 'GC', 'GD', 'AD', 'FS', 'C', 'COSC', 'MATH', 'BUSM', 
                         'ARCH', 'COMM', 'DESI', 'ENGG', 'NURS', 'PSYC', 'EDUC', 'SCIEN',
                         'MKTG', 'ACCT', 'ECON', 'MGMT', 'INFO', 'COMP', 'SOFT', 'DATA',
                         'HUSO', 'LANG', 'BIOL', 'CHEM', 'PHYS', 'GEOM', 'STAT']
        
        for code in course_codes:
            if len(code) >= 4 and len(code) <= 8:
                if any(code.startswith(prefix) for prefix in valid_prefixes) or re.match(r'^[A-Z]\d{4,5}$', code):
                    filtered_codes.append(code)
        
        return list(set(filtered_codes))
    
    def get_content_hash(self, content: str) -> str:
        """Generate hash for content to avoid duplicates"""
        return hashlib.md5(content.encode()).hexdigest()
    
    def is_valid_rmit_url(self, url: str) -> bool:
        """Check if URL is a valid RMIT URL"""
        parsed = urlparse(url)
        return 'rmit.edu.au' in parsed.netloc
    
    def should_crawl_url(self, url: str) -> bool:
        """Determine if URL should be crawled"""
        # Skip certain file types
        skip_extensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', 
                          '.jpg', '.jpeg', '.png', '.gif', '.zip', '.rar', '.mp4', '.mov']
        
        url_lower = url.lower()
        if any(url_lower.endswith(ext) for ext in skip_extensions):
            return False
        
        # Skip certain URL patterns - REDUCED for more comprehensive coverage
        skip_patterns = [
            '/login', '/logout', '/search?', '/print/', '#', 'javascript:',
            '/news/', '/events/', '/staff/', '/media/',
            '/give/', '/alumni/', '/employers/', '/commercial/', '/venues/', '/tours/'
        ]
        if any(pattern in url_lower for pattern in skip_patterns):
            return False
        
        # Only crawl URLs with relevant keywords - EXPANDED for comprehensive coverage
        relevant_keywords = [
            'student', 'course', 'program', 'policy', 'support', 'help', 'service',
            'bachelor', 'master', 'diploma', 'certificate', 'degree', 'subject',
            'enrol', 'admission', 'apply', 'fees', 'scholarship', 'academic',
            'undergraduate', 'postgraduate', 'vocational', 'contact', 'faq',
            'unit', 'elective', 'core', 'prerequisite', 'curriculum', 'study',
            'assessment', 'exam', 'timetable', 'semester', 'campus', 'facility',
            'library', 'research', 'handbook', 'guide', 'information', 'detail',
            'overview', 'description', 'requirement', 'outcome', 'graduate'
        ]
        
        # Must contain at least one relevant keyword OR be a direct program page
        if not any(keyword in url_lower for keyword in relevant_keywords):
            # Allow direct program pages even without keywords
            if not any(pattern in url_lower for pattern in ['/bachelor-', '/master-', '/diploma-', '/certificate-']):
                return False
        
        return True
    
    def extract_structured_data(self, soup: BeautifulSoup, text_content: str, category: str) -> Dict:
        """Extract structured data based on content category"""
        structured_data = {}
        
        if category == "course-information":
            # Extract course details
            patterns = {
                'course_code': [r'\b([A-Z]{2,4}\d{3,5})\b'],
                'duration': [r'duration[:\s]+(\d+(?:\.\d+)?\s*(?:year|month|week|semester)s?)'],
                'fees': [r'fees?[:\s]+\$?\s*([\d,]+(?:\.\d{2})?)'],
                'credit_points': [r'(\d+)\s*credit\s*points?'],
                'atar': [r'ATAR[:\s]+(\d{1,2}(?:\.\d{1,2})?)'],
                'campus': [r'campus(?:es)?[:\s]+([^.;]+)'],
                'intake': [r'intake[s]?[:\s]+([^.;]+)'],
            }
            
            for field, field_patterns in patterns.items():
                for pattern in field_patterns:
                    match = re.search(pattern, text_content, re.IGNORECASE)
                    if match:
                        structured_data[field] = match.group(1).strip()
                        break
        
        elif category == "subject-information":
            # Extract subject details
            codes = self.extract_course_codes_from_text(text_content)
            if codes:
                structured_data['subject_codes'] = codes
            
            # Look for credit points
            credit_match = re.search(r'(\d+)\s*credit\s*points?', text_content, re.IGNORECASE)
            if credit_match:
                structured_data['credit_points'] = credit_match.group(1)
        
        elif category == "policies":
            # Extract policy details
            # Look for policy number
            policy_match = re.search(r'policy\s*(?:number|#|no\.?)?[:\s]*([A-Z0-9\-\.]+)', text_content, re.IGNORECASE)
            if policy_match:
                structured_data['policy_number'] = policy_match.group(1)
            
            # Look for effective date
            date_match = re.search(r'effective\s*(?:from|date)?[:\s]*([^.;]+)', text_content, re.IGNORECASE)
            if date_match:
                structured_data['effective_date'] = date_match.group(1).strip()
        
        elif category == "fees-scholarships":
            # Extract fee/scholarship information
            amount_pattern = r'\$\s*([\d,]+(?:\.\d{2})?)'
            amounts = re.findall(amount_pattern, text_content)
            if amounts:
                structured_data['amounts'] = amounts
        
        # Add URL as source
        structured_data['source_url'] = soup.find('link', {'rel': 'canonical'})['href'] if soup.find('link', {'rel': 'canonical'}) else None
        
        return structured_data
    
    def extract_content_from_page(self, url: str) -> Optional[Dict]:
        """Extract all relevant content from a page"""
        try:
            session = self.get_session()
            time.sleep(CONFIG["rate_limit"])
            response = session.get(url, timeout=CONFIG["timeout"])
            
            if response.status_code != 200:
                return None
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()
            
            # Extract title
            title = ""
            if soup.title:
                title = soup.title.string.strip()
            elif soup.h1:
                title = soup.h1.get_text(strip=True)
            
            # Extract main content
            content = ""
            content_selectors = [
                'main', 'article', '.content', '.main-content', '#content',
                '.text-content', '.page-content', '.entry-content'
            ]
            
            for selector in content_selectors:
                element = soup.select_one(selector)
                if element:
                    content = element.get_text(separator=' ', strip=True)
                    if len(content) > 100:  # Ensure meaningful content
                        break
            
            # If no main content found, get all text
            if not content or len(content) < 100:
                content = soup.get_text(separator=' ', strip=True)
            
            # Skip if content is too short
            if len(content) < 50:
                return None
            
            # Check for duplicate content
            content_hash = self.get_content_hash(content)
            with self.lock:
                if content_hash in self.content_hashes:
                    self.stats["duplicates"] += 1
                    return None
                self.content_hashes.add(content_hash)
            
            # Categorize content
            category = self.categorize_content(url, title, content)
            
            # Extract structured data
            structured_data = self.extract_structured_data(soup, content, category)
            
            # Extract all links for further crawling
            links = []
            for link in soup.find_all('a', href=True):
                href = link.get('href')
                full_url = urljoin(url, href)
                if self.is_valid_rmit_url(full_url) and self.should_crawl_url(full_url):
                    links.append(full_url)
            
            # Generate tags
            tags = [category]
            
            # Add specific tags based on content
            if 'course' in content.lower():
                tags.append('course')
            if 'policy' in content.lower() or 'procedure' in content.lower():
                tags.append('policy')
            if 'student' in content.lower():
                tags.append('student')
            if 'support' in content.lower() or 'service' in content.lower():
                tags.append('support')
            
            # Extract any course codes mentioned
            course_codes = self.extract_course_codes_from_text(content)
            tags.extend(course_codes)
            
            return {
                'url': url,
                'title': title,
                'content': content[:5000],  # Limit content length
                'category': category,
                'structured_data': structured_data,
                'tags': list(set(tags)),
                'links': links
            }
            
        except Exception as e:
            logger.debug(f"Error extracting content from {url}: {e}")
            return None
    
    def crawler_worker(self):
        """Worker thread for crawling"""        
        while True:
            try:
                # Get URL from queue
                url, depth = self.url_queue.get(timeout=5)
                
                # Check for poison pill (graceful shutdown)
                if url is None:
                    self.url_queue.task_done()
                    break
                
                # Skip if already visited or too deep
                with self.lock:
                    if url in self.visited_urls or depth > CONFIG["max_depth"]:
                        self.url_queue.task_done()
                        continue
                    self.visited_urls.add(url)
                
                # Extract content
                content_data = self.extract_content_from_page(url)
                
                if content_data:
                    # Add to results
                    with self.lock:
                        self.all_content.append(content_data)
                        self.stats[content_data['category']] += 1
                        self.stats["total"] += 1
                        
                        # Log progress
                        if self.stats["total"] % 10 == 0:
                            logger.info(f"{Fore.GREEN}✓ Scraped {self.stats['total']} items | {Fore.BLUE}Queue: {self.url_queue.qsize()} | {Fore.YELLOW}Category: {content_data['category']}")
                        
                        # Save progress periodically
                        if self.stats["total"] % CONFIG["save_progress_every"] == 0:
                            self.save_progress()
                    
                    # Add new links to queue (with queue size limit)
                    for link in content_data.get('links', []):
                        with self.lock:
                            if (link not in self.visited_urls and 
                                self.url_queue.qsize() < CONFIG["max_queue_size"]):
                                self.url_queue.put((link, depth + 1))
                
                self.url_queue.task_done()
                
            except:
                # Queue is empty or timeout
                break
    
    def save_progress(self):
        """Save current progress"""
        logger.info(f"{Fore.BLUE}💾 Saving progress: {len(self.all_content)} items...")
        self.save_to_database_format()
    
    def fetch_sitemap_urls(self) -> List[str]:
        """Fetch and parse URLs from RMIT sitemap.xml"""
        sitemap_url = "https://www.rmit.edu.au/sitemap.xml"
        urls = []
        
        try:
            logger.info(f"{Fore.YELLOW}📄 Fetching sitemap from: {sitemap_url}")
            response = self.session.get(sitemap_url, timeout=CONFIG["timeout"])
            response.raise_for_status()
            
            # Parse XML
            root = ET.fromstring(response.content)
            
            # Handle XML namespace
            namespace = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
            
            # Extract all URLs
            for url_element in root.findall('.//ns:url', namespace):
                loc_element = url_element.find('ns:loc', namespace)
                if loc_element is not None:
                    url = loc_element.text.strip()
                    if self.is_valid_rmit_url(url) and self.should_crawl_url(url):
                        urls.append(url)
            
            logger.info(f"{Fore.GREEN}✓ Found {len(urls)} valid URLs in sitemap")
            return urls
            
        except Exception as e:
            logger.error(f"{Fore.RED}✗ Error fetching sitemap: {e}")
            logger.warning(f"{Fore.YELLOW}⚠ Falling back to default start URLs")
            # Return a few essential URLs as fallback
            return [
                "https://www.rmit.edu.au",
                "https://www.rmit.edu.au/study-with-us",
                "https://www.rmit.edu.au/students",
                "https://www.rmit.edu.au/courses"
            ]
    
    def categorize_sitemap_url(self, url: str) -> str:
        """Categorize URLs from sitemap based on URL patterns"""
        url_lower = url.lower()
        
        # More specific categorization based on URL patterns
        if any(pattern in url_lower for pattern in ['microcredentials', 'courses', 'bachelor', 'master', 'diploma', 'certificate']):
            return 'course-information'
        elif any(pattern in url_lower for pattern in ['vocational-study', 'pre-university', 'apprenticeships']):
            return 'course-information'
        elif any(pattern in url_lower for pattern in ['policies', 'policy', 'procedure', 'regulation']):
            return 'policies'
        elif any(pattern in url_lower for pattern in ['students/support', 'student-support', 'help', 'service']):
            return 'student-support'
        elif any(pattern in url_lower for pattern in ['enrol', 'admission', 'apply', 'application']):
            return 'enrollment'
        elif any(pattern in url_lower for pattern in ['fees', 'scholarship', 'financial']):
            return 'fees-scholarships'
        elif any(pattern in url_lower for pattern in ['student-life', 'campus', 'facilities']):
            return 'student-life'
        elif any(pattern in url_lower for pattern in ['international', 'visa', 'overseas']):
            return 'international'
        else:
            return 'general-information'
    
    def scrape_rmit_knowledge_base(self):
        """Main method to scrape entire RMIT knowledge base"""
        self.print_banner()
        
        # Get URLs from sitemap instead of hardcoded list
        start_urls = self.fetch_sitemap_urls()
        
        # Add a few important URLs that might not be in sitemap
        additional_urls = [
            "https://www.rmit.edu.au/about/governance-and-management/policies",
            "https://policies.rmit.edu.au/browse",
            "https://www.rmit.edu.au/students/support-and-facilities",
            "https://www.rmit.edu.au/students/contact-and-help"
        ]
        
        # Combine sitemap URLs with additional important URLs
        for url in additional_urls:
            if url not in start_urls:
                start_urls.append(url)
        
        # Add all URLs to queue with priority based on category
        logger.info(f"{Fore.YELLOW}Adding {len(start_urls)} URLs from sitemap to crawl queue...")
        
        # Prioritize certain URLs (add them first)
        priority_patterns = ['courses', 'policies', 'students', 'support']
        priority_urls = []
        regular_urls = []
        
        for url in start_urls:
            if any(pattern in url.lower() for pattern in priority_patterns):
                priority_urls.append(url)
            else:
                regular_urls.append(url)
        
        # Add priority URLs first
        for url in priority_urls:
            self.url_queue.put((url, 0))
        
        # Then add regular URLs
        for url in regular_urls:
            self.url_queue.put((url, 0))
        
        # Start crawler threads
        logger.info(f"{Fore.YELLOW}Starting {CONFIG['max_threads']} crawler threads...")
        threads = []
        for i in range(CONFIG["max_threads"]):
            t = threading.Thread(target=self.crawler_worker, name=f"Crawler-{i+1}")
            t.daemon = True
            t.start()
            threads.append(t)
        
        # Monitor progress
        last_total = 0
        stall_count = 0
        
        while True:
            time.sleep(10)  # Check every 10 seconds
            
            with self.lock:
                current_total = self.stats["total"]
                queue_size = self.url_queue.qsize()
                active_threads = sum(1 for t in threads if t.is_alive())
            
            # Print statistics
            self.print_stats()
            
            # Check if scraping is complete
            if queue_size == 0 and active_threads == 0:
                logger.info(f"{Fore.GREEN}✓ All threads completed!")
                break
            
            # Check if we're making progress
            if current_total == last_total:
                stall_count += 1
                if stall_count > 6:  # No progress for 60 seconds
                    logger.warning(f"{Fore.YELLOW}⚠ No progress for 60 seconds, stopping...")
                    break
            else:
                stall_count = 0
                last_total = current_total
            
            # Check if we've hit limits
            if len(self.visited_urls) >= CONFIG["max_pages"]:
                logger.info(f"{Fore.YELLOW}Reached maximum page limit ({CONFIG['max_pages']})")
                break
            
            # Check if queue is too large (infinite loop protection)
            if queue_size >= CONFIG["max_queue_size"]:
                logger.warning(f"{Fore.YELLOW}⚠ Queue size limit reached ({CONFIG['max_queue_size']}), stopping to prevent infinite crawling...")
                break
            
            # Check if we have enough content already (comprehensive coverage)
            if current_total >= 8000:
                logger.info(f"{Fore.GREEN}✓ Collected comprehensive content ({current_total} items), stopping...")
                break
        
        # Signal threads to stop gracefully
        logger.info(f"{Fore.YELLOW}🛑 Stopping crawler threads...")
        for _ in range(CONFIG["max_threads"]):
            self.url_queue.put((None, 0))  # Poison pill to stop threads
        
        # Wait for threads to finish (with timeout)
        for t in threads:
            t.join(timeout=10)
            if t.is_alive():
                logger.warning(f"{Fore.YELLOW}⚠ Thread {t.name} did not stop gracefully")
        
        # Final save
        self.save_to_database_format()
        
        # Print final summary
        print(f"\n{Fore.CYAN}{'='*80}")
        print(f"{Fore.YELLOW}✨ Scraping Complete! ✨")
        print(f"{Fore.GREEN}Total items collected: {self.stats['total']}")
        print(f"{Fore.BLUE}Total URLs visited: {len(self.visited_urls)}")
        print(f"{Fore.YELLOW}Duplicates avoided: {self.stats['duplicates']}")
        print(f"\n{Fore.CYAN}Content breakdown:")
        for category, count in sorted(self.stats.items(), key=lambda x: x[1], reverse=True):
            if category not in ["total", "duplicates"] and count > 0:
                print(f"  {Fore.WHITE}{category}: {Fore.GREEN}{count}")
        print(f"{Fore.CYAN}{'='*80}{Style.RESET_ALL}\n")
    
    def save_to_database_format(self):
        """Save data in format compatible with Prisma database"""
        output_file = Path(CONFIG["output_dir"]) / "rmit_knowledge_base.json"
        
        # Format data for database import
        db_records = []
        
        for item in self.all_content:
            # Create a record for each item
            record = {
                "title": item['title'][:500],  # Limit title length
                "content": item['content'][:5000],  # Limit content length
                "category": item['category'],
                "sourceUrl": item['url'],
                "tags": item['tags'][:20],  # Limit number of tags
                "priority": self.calculate_priority(item),
                "isActive": True,
                "structuredData": item['structured_data']
            }
            
            db_records.append(record)
        
        # Save to file
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(db_records, f, ensure_ascii=False, indent=2)
        
        logger.info(f"\n{Fore.GREEN}✓ Saved {len(db_records)} records to: {output_file}")
        
        # Save detailed summary
        summary_file = Path(CONFIG["output_dir"]) / "scraping_summary.json"
        summary = {
            "scrape_date": datetime.now().isoformat(),
            "total_items": self.stats["total"],
            "total_urls_visited": len(self.visited_urls),
            "duplicates_avoided": self.stats["duplicates"],
            "content_breakdown": {cat: count for cat, count in self.stats.items() 
                               if cat not in ["total", "duplicates"]},
            "sample_items": {
                category: [
                    {
                        "title": item['title'],
                        "url": item['url'],
                        "tags": item['tags'][:5]
                    }
                    for item in self.all_content 
                    if item['category'] == category
                ][:3]
                for category in CONFIG["content_categories"]
            }
        }
        
        with open(summary_file, 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        logger.info(f"{Fore.GREEN}✓ Saved summary to: {summary_file}")
        logger.info(f"\n{Fore.YELLOW}📁 Output files ready in: {CONFIG['output_dir']}/")
        logger.info(f"{Fore.CYAN}Use rmit_knowledge_base.json for your database seeding script{Style.RESET_ALL}")
    
    def calculate_priority(self, item: Dict) -> int:
        """Calculate priority score for content"""
        priority = 5  # Base priority
        
        # Higher priority for certain categories
        priority_categories = {
            "course-information": 10,
            "subject-information": 9,
            "policies": 8,
            "student-support": 8,
            "enrollment": 7,
            "fees-scholarships": 7,
        }
        
        if item['category'] in priority_categories:
            priority = priority_categories[item['category']]
        
        # Boost priority if contains course codes
        if any(re.match(r'^[A-Z]{2,4}\d{3,5}$', tag) for tag in item['tags']):
            priority += 2
        
        # Boost priority for longer, more detailed content
        if len(item['content']) > 1000:
            priority += 1
        
        return min(priority, 10)  # Cap at 10


# Main execution
if __name__ == "__main__":
    scraper = RMITKnowledgeBaseScraper()
    
    try:
        scraper.scrape_rmit_knowledge_base()
        
    except KeyboardInterrupt:
        logger.warning(f"\n{Fore.YELLOW}⚠️  Scraping interrupted by user")
        if scraper.all_content:
            scraper.save_to_database_format()
            logger.info(f"{Fore.GREEN}✓ Partial data saved")
        else:
            logger.warning(f"{Fore.YELLOW}⚠️  No data to save")
        
    except Exception as e:
        logger.error(f"\n{Fore.RED}✗ Fatal error: {e}")
        if scraper.all_content:
            scraper.save_to_database_format()
            logger.info(f"{Fore.GREEN}✓ Partial data saved")
        raise