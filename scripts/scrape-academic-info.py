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
file_handler = logging.FileHandler('rmit_academic_info_scraper.log')
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

# Configuration
CONFIG = {
    "output_dir": "rmit_knowledge_base",
    "output_file": "academic_information.json",  # Output for AcademicInformation table
    "max_retries": 3,
    "timeout": 30,
    "rate_limit": 0.3,  # seconds between requests
    "user_agent": "RMIT Academic Information Scraper",
    "save_progress_every": 50,  # save after every N items
    "max_depth": 5,
    "max_pages": 12000,
    "max_threads": 5,
    "max_queue_size": 12000,
    "content_categories": {
        # Exclude programs - that's handled by a separate scraper
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

class RMITAcademicInfoScraper:
    """Scraper for RMIT academic information - policies, FAQs, support services, etc."""
    
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
        
        # Create output directory
        self.output_dir = Path(CONFIG["output_dir"])
        self.output_dir.mkdir(exist_ok=True)
        
        # Full output path
        self.output_file = self.output_dir / CONFIG["output_file"]
        
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
        print(f"{Fore.YELLOW}✨ RMIT Academic Information Scraper ✨")
        print(f"{Fore.GREEN}📋 Extracting FAQs, policies, support services, and general academic info")
        print(f"{Fore.GREEN}🗺️  Using RMIT sitemap.xml for complete coverage!")
        print(f"{Fore.MAGENTA}Output: AcademicInformation table format")
        print(f"{Fore.MAGENTA}Output directory: {CONFIG['output_dir']}")
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
        
        # Skip program pages - those are handled by separate scraper
        if any(pattern in url_lower for pattern in ['/bachelor-', '/master-', '/diploma-', '/certificate-']):
            return None
        if any(pattern in title_lower for pattern in ['bachelor of', 'master of', 'diploma in', 'certificate in']):
            return None
        if any(pattern in url_lower for pattern in ['program', 'BP', 'MC', 'GC', 'GD']) and not any(pattern in url_lower for pattern in ['support', 'help', 'policy']):
            return None
        
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
        
        # Skip certain URL patterns
        skip_patterns = [
            '/login', '/logout', '/search?', '/print/', '#', 'javascript:',
            '/news/', '/events/', '/staff/', '/media/',
            '/give/', '/alumni/', '/employers/', '/commercial/', '/venues/', '/tours/'
        ]
        if any(pattern in url_lower for pattern in skip_patterns):
            return False
        
        # Skip program-specific URLs (handled by separate scraper)
        skip_program_patterns = [
            '/bachelor-', '/master-', '/diploma-', '/certificate-',
            '/programs/', '/course-information/'
        ]
        if any(pattern in url_lower for pattern in skip_program_patterns):
            return False
        
        # Only crawl URLs with relevant keywords for academic information
        relevant_keywords = [
            'student', 'policy', 'support', 'help', 'service', 'faq',
            'enrol', 'admission', 'apply', 'fees', 'scholarship', 'academic',
            'contact', 'wellbeing', 'counselling', 'advice', 'calendar',
            'assessment', 'exam', 'timetable', 'semester', 'campus', 'facility',
            'library', 'research', 'handbook', 'guide', 'information', 'detail',
            'overview', 'requirement', 'international', 'visa', 'career'
        ]
        
        # Must contain at least one relevant keyword
        if not any(keyword in url_lower for keyword in relevant_keywords):
            return False
        
        return True
    
    def extract_structured_data(self, soup: BeautifulSoup, text_content: str, category: str, title: str) -> Dict:
        """Extract structured data based on content category"""
        structured_data = {}
        
        if category == "policies":
            # Extract policy details
            patterns = {
                'policy_number': [r'policy\s*(?:number|#|no\.?)?[:\s]*([A-Z0-9\-\.]+)'],
                'effective_date': [r'effective\s*(?:from|date)?[:\s]*([^.;\n]+)', 
                                 r'date\s+approved[:\s]*([^.;\n]+)',
                                 r'last\s+updated[:\s]*([^.;\n]+)'],
                'review_date': [r'review\s+date[:\s]*([^.;\n]+)'],
                'policy_owner': [r'policy\s+owner[:\s]*([^.;\n]+)',
                               r'responsible\s+(?:for|office)[:\s]*([^.;\n]+)']
            }
            
            for field, field_patterns in patterns.items():
                for pattern in field_patterns:
                    match = re.search(pattern, text_content, re.IGNORECASE)
                    if match:
                        structured_data[field] = match.group(1).strip()
                        break
            
            # Determine policy type
            if any(term in title.lower() for term in ["academic", "assessment", "exam", "grade"]):
                structured_data['policy_type'] = "Academic"
            elif any(term in title.lower() for term in ["student", "conduct", "behaviour", "code"]):
                structured_data['policy_type'] = "Student"
            elif any(term in title.lower() for term in ["staff", "employment", "hr"]):
                structured_data['policy_type'] = "Staff"
            else:
                structured_data['policy_type'] = "Administrative"
        
        elif category == "student-support":
            # Extract support service details
            patterns = {
                'contact_email': [r'([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})'],
                'contact_phone': [r'(?:\+61|0)[0-9\s\-\(\)]{8,}'],
                'hours': [r'(?:hours|open)[:\s]*([^.;\n]{10,80})'],
                'location': [r'building\s+([^.;\n]+)', 
                            r'level\s+\d+[^.;\n]*',
                            r'room\s+[^.;\n]*',
                            r'(?:located|address)[:\s]*([^.;\n]+)'],
                'website': [r'(https?://[^\s]+)', r'www\.[^\s]+']
            }
            
            for field, field_patterns in patterns.items():
                for pattern in field_patterns:
                    match = re.search(pattern, text_content, re.IGNORECASE)
                    if match:
                        if field == 'hours':
                            structured_data[field] = match.group(0).strip()
                        else:
                            structured_data[field] = match.group(1).strip()
                        break
            
            # Determine service type
            if any(term in title.lower() for term in ["academic", "study", "learning", "tutor"]):
                structured_data['service_type'] = "Academic Support"
            elif any(term in title.lower() for term in ["wellbeing", "mental health", "counselling", "health"]):
                structured_data['service_type'] = "Wellbeing"
            elif any(term in title.lower() for term in ["career", "employment", "job", "placement"]):
                structured_data['service_type'] = "Career Services"
            elif any(term in title.lower() for term in ["admin", "enrolment", "student connect", "registry"]):
                structured_data['service_type'] = "Administrative"
            elif any(term in title.lower() for term in ["international", "visa", "overseas"]):
                structured_data['service_type'] = "International Support"
            else:
                structured_data['service_type'] = "General Support"
        
        elif category == "fees-scholarships":
            # Extract fee/scholarship information
            patterns = {
                'amounts': [r'\$\s*([\d,]+(?:\.\d{2})?)'],
                'eligibility': [r'eligib(?:le|ility)[:\s]*([^.]{50,300})'],
                'application_deadline': [r'deadline[:\s]*([^.;\n]+)',
                                       r'due\s+(?:date|by)[:\s]*([^.;\n]+)',
                                       r'apply\s+by[:\s]*([^.;\n]+)'],
                'contact_info': [r'contact[:\s]*([^.]{20,100})']
            }
            
            amounts = re.findall(patterns['amounts'][0], text_content)
            if amounts:
                structured_data['amounts'] = amounts[:5]  # Limit to 5 amounts
            
            for field, field_patterns in patterns.items():
                if field == 'amounts':
                    continue
                for pattern in field_patterns:
                    match = re.search(pattern, text_content, re.IGNORECASE)
                    if match:
                        structured_data[field] = match.group(1).strip()
                        break
        
        elif category == "faq":
            # Extract FAQ-specific information
            # Look for Q&A patterns
            qa_patterns = [
                r'Q[:\s]*([^?]+\?)\s*A[:\s]*([^.]{50,500})',
                r'Question[:\s]*([^?]+\?)\s*Answer[:\s]*([^.]{50,500})'
            ]
            
            qa_pairs = []
            for pattern in qa_patterns:
                matches = re.findall(pattern, text_content, re.IGNORECASE | re.DOTALL)
                for question, answer in matches:
                    qa_pairs.append({
                        "question": question.strip(),
                        "answer": answer.strip()
                    })
            
            if qa_pairs:
                structured_data['qa_pairs'] = qa_pairs[:10]  # Limit to 10 Q&A pairs
        
        elif category == "enrollment":
            # Extract enrollment-specific information
            patterns = {
                'deadlines': [r'deadline[:\s]*([^.;\n]+)', 
                             r'due\s+(?:date|by)[:\s]*([^.;\n]+)',
                             r'close[s]?\s+on[:\s]*([^.;\n]+)'],
                'requirements': [r'requirement[s]?[:\s]*([^.]{100,500})'],
                'steps': [r'step[s]?\s*\d+[:\s]*([^.]{50,200})'],
                'contact_info': [r'(?:contact|enquir)[^.]*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})']
            }
            
            for field, field_patterns in patterns.items():
                for pattern in field_patterns:
                    match = re.search(pattern, text_content, re.IGNORECASE)
                    if match:
                        structured_data[field] = match.group(1).strip()
                        break
        
        # Add source URL
        canonical_link = soup.find('link', {'rel': 'canonical'})
        if canonical_link:
            structured_data['source_url'] = canonical_link.get('href')
        
        return structured_data
    
    def determine_subcategory(self, category: str, title: str, structured_data: Dict) -> str:
        """Determine more specific subcategory"""
        title_lower = title.lower()
        
        if category == "policies":
            return structured_data.get('policy_type', 'Policy')
        
        elif category == "student-support":
            return structured_data.get('service_type', 'Support Service')
        
        elif category == "fees-scholarships":
            if "scholarship" in title_lower:
                return "Scholarship"
            elif "fee" in title_lower:
                return "Fees Information"
            else:
                return "Financial Information"
        
        elif category == "faq":
            if "student" in title_lower:
                return "Student FAQ"
            elif "academic" in title_lower:
                return "Academic FAQ"
            elif "enrollment" in title_lower or "admission" in title_lower:
                return "Enrollment FAQ"
            else:
                return "General FAQ"
        
        elif category == "enrollment":
            if "application" in title_lower:
                return "Application Process"
            elif "deadline" in title_lower:
                return "Important Dates"
            else:
                return "Enrollment Information"
        
        elif category == "academic-info":
            if "calendar" in title_lower:
                return "Academic Calendar"
            elif "exam" in title_lower:
                return "Examination Information"
            elif "assessment" in title_lower:
                return "Assessment Information"
            else:
                return "Academic Information"
        
        else:
            return category.replace('-', ' ').title()
    
    def calculate_priority(self, category: str, structured_data: Dict, content_length: int, title: str) -> int:
        """Calculate priority score for content"""
        priority = 5  # Base priority
        
        # Higher priority for certain categories
        priority_categories = {
            "policies": 8,
            "student-support": 8,
            "enrollment": 9,
            "fees-scholarships": 7,
            "faq": 7,
            "academic-info": 6,
        }
        
        if category in priority_categories:
            priority = priority_categories[category]
        
        # Boost priority for certain keywords in title
        high_priority_terms = ["deadline", "important", "urgent", "required", "mandatory"]
        if any(term in title.lower() for term in high_priority_terms):
            priority += 1
        
        # Boost priority for structured data richness
        if len(structured_data) > 3:
            priority += 1
        
        # Boost priority for longer, more detailed content
        if content_length > 1000:
            priority += 1
        
        return min(priority, 10)  # Cap at 10
    
    def generate_tags(self, category: str, title: str, content: str, structured_data: Dict) -> List[str]:
        """Generate comprehensive tags for the content"""
        tags = [category]
        
        # Add content-based tags
        content_lower = content.lower()
        if 'policy' in content_lower or 'procedure' in content_lower:
            tags.append('policy')
        if 'student' in content_lower:
            tags.append('student')
        if 'support' in content_lower or 'service' in content_lower:
            tags.append('support')
        if 'deadline' in content_lower:
            tags.append('deadline')
        if 'requirement' in content_lower:
            tags.append('requirement')
        if 'international' in content_lower:
            tags.append('international')
        if 'fee' in content_lower or 'cost' in content_lower:
            tags.append('financial')
        if 'scholarship' in content_lower:
            tags.append('scholarship')
        if 'exam' in content_lower:
            tags.append('examination')
        if 'enrol' in content_lower:
            tags.append('enrollment')
        
        # Add structured data tags
        if structured_data.get('policy_type'):
            tags.append(structured_data['policy_type'].lower())
        if structured_data.get('service_type'):
            tags.append(structured_data['service_type'].lower().replace(' ', '_'))
        
        # Add title-based tags
        title_lower = title.lower()
        if 'faq' in title_lower:
            tags.append('faq')
        if 'how to' in title_lower:
            tags.append('guide')
        if '?' in title:
            tags.append('question')
        
        return list(set(tags[:15]))  # Limit and deduplicate tags
    
    def extract_content_from_page(self, url: str) -> Optional[Dict]:
        """Extract all relevant content from a page and format for AcademicInformation table"""
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
            
            # Skip if this is program content
            if category is None:
                return None
            
            # Extract structured data
            structured_data = self.extract_structured_data(soup, content, category, title)
            
            # Determine subcategory
            subcategory = self.determine_subcategory(category, title, structured_data)
            
            # Generate tags
            tags = self.generate_tags(category, title, content, structured_data)
            
            # Calculate priority
            priority = self.calculate_priority(category, structured_data, len(content), title)
            
            # Extract all links for further crawling
            links = []
            for link in soup.find_all('a', href=True):
                href = link.get('href')
                full_url = urljoin(url, href)
                if self.is_valid_rmit_url(full_url) and self.should_crawl_url(full_url):
                    links.append(full_url)
            
            # Format for AcademicInformation table
            return {
                'title': title[:500],  # Limit title length
                'content': content[:8000],  # More content for academic info
                'category': category,
                'subcategory': subcategory,
                'tags': tags,
                'priority': priority,
                'structuredData': structured_data,
                'sourceUrl': url,
                'embedding': None,  # Will be populated later for RAG
                'isActive': True,
                'createdAt': datetime.now().isoformat(),
                'updatedAt': datetime.now().isoformat(),
                'links': links  # For crawler, not saved to DB
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
                        # Remove links before saving to avoid storing unnecessary data
                        links = content_data.pop('links', [])
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
                    for link in links:
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
            # Return essential URLs for academic info
            return [
                "https://www.rmit.edu.au/students",
                "https://www.rmit.edu.au/students/support-and-facilities",
                "https://www.rmit.edu.au/students/contact-and-help",
                "https://www.rmit.edu.au/about/governance-and-management/policies",
                "https://policies.rmit.edu.au/browse"
            ]
    
    def scrape_academic_information(self):
        """Main method to scrape RMIT academic information"""
        self.print_banner()
        
        # Get URLs from sitemap
        start_urls = self.fetch_sitemap_urls()
        
        # Add important URLs for academic information
        additional_urls = [
            "https://www.rmit.edu.au/about/governance-and-management/policies",
            "https://policies.rmit.edu.au/browse",
            "https://www.rmit.edu.au/students/support-and-facilities",
            "https://www.rmit.edu.au/students/contact-and-help",
            "https://www.rmit.edu.au/students/wellbeing-support",
            "https://www.rmit.edu.au/students/academic-support",
            "https://www.rmit.edu.au/study-with-us/international-students",
            "https://www.rmit.edu.au/students/student-essentials"
        ]
        
        # Combine sitemap URLs with additional important URLs
        for url in additional_urls:
            if url not in start_urls:
                start_urls.append(url)
        
        # Add all URLs to queue with priority
        logger.info(f"{Fore.YELLOW}Adding {len(start_urls)} URLs from sitemap to crawl queue...")
        
        # Prioritize certain URLs (add them first)
        priority_patterns = ['policies', 'students', 'support', 'faq', 'help', 'contact']
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
            
            # Check if we have enough content already
            if current_total >= 6000:
                logger.info(f"{Fore.GREEN}✓ Collected comprehensive academic information ({current_total} items), stopping...")
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
        print(f"{Fore.YELLOW}✨ Academic Information Scraping Complete! ✨")
        print(f"{Fore.GREEN}Total items collected: {self.stats['total']}")
        print(f"{Fore.BLUE}Total URLs visited: {len(self.visited_urls)}")
        print(f"{Fore.YELLOW}Duplicates avoided: {self.stats['duplicates']}")
        print(f"\n{Fore.CYAN}Content breakdown:")
        for category, count in sorted(self.stats.items(), key=lambda x: x[1], reverse=True):
            if category not in ["total", "duplicates"] and count > 0:
                print(f"  {Fore.WHITE}{category}: {Fore.GREEN}{count}")
        print(f"{Fore.CYAN}{'='*80}{Style.RESET_ALL}\n")
    
    def save_to_database_format(self):
        """Save data in format compatible with AcademicInformation table"""
        
        # Save to file
        with open(self.output_file, 'w', encoding='utf-8') as f:
            json.dump(self.all_content, f, ensure_ascii=False, indent=2)
        
        logger.info(f"\n{Fore.GREEN}✓ Saved {len(self.all_content)} records to: {self.output_file}")
        
        # Save detailed summary
        summary_file = self.output_dir / "academic_information_summary.json"
        summary = {
            "scrape_date": datetime.now().isoformat(),
            "total_items": self.stats["total"],
            "total_urls_visited": len(self.visited_urls),
            "duplicates_avoided": self.stats["duplicates"],
            "content_breakdown": {cat: count for cat, count in self.stats.items() 
                               if cat not in ["total", "duplicates"]},
            "output_file": str(self.output_file),
            "sample_items": {
                category: [
                    {
                        "title": item['title'],
                        "category": item['category'],
                        "subcategory": item['subcategory'],
                        "priority": item['priority'],
                        "tags": item['tags'][:5],
                        "structured_data_keys": list(item['structuredData'].keys()) if item['structuredData'] else []
                    }
                    for item in self.all_content 
                    if item['category'] == category
                ][:3]
                for category in CONFIG["content_categories"]
                if any(item['category'] == category for item in self.all_content)
            }
        }
        
        with open(summary_file, 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        logger.info(f"{Fore.GREEN}✓ Saved summary to: {summary_file}")
        logger.info(f"\n{Fore.YELLOW}📁 Output files ready in: {CONFIG['output_dir']}/")
        logger.info(f"{Fore.CYAN}Use {self.output_file.name} for your AcademicInformation table seeding{Style.RESET_ALL}")


# Main execution
if __name__ == "__main__":
    scraper = RMITAcademicInfoScraper()
    
    try:
        scraper.scrape_academic_information()
        
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