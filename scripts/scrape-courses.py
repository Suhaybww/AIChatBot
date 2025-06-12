import requests
from bs4 import BeautifulSoup, NavigableString, Tag
import json
import time
import re
from typing import Dict, List, Optional
from datetime import datetime
import logging
from pathlib import Path
import colorama
from colorama import Fore, Style
from urllib.parse import urljoin, urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

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
        'CRITICAL': Fore.RED
    }
    
    def format(self, record):
        log_color = self.COLORS.get(record.levelname, '')
        record.levelname = f"{log_color}{record.levelname}{Style.RESET_ALL}"
        record.msg = f"{log_color}{record.msg}{Style.RESET_ALL}"
        return super().format(record)

# Setup logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

console_handler = logging.StreamHandler()
console_handler.setFormatter(ColoredFormatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(console_handler)

file_handler = logging.FileHandler('rmit_course_scraper.log')
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

# Configuration - Simplified for reliability
CONFIG = {
    "url_file": "sorted_urls.txt",
    "output_dir": "rmit_knowledge_base",
    "output_file": "rmit_course_details.json",
    "max_retries": 3,
    "timeout": 30,
    "rate_limit": 0.2,  # Conservative rate limit
    "user_agent": "Educational Course Details Scraper",
    "max_workers": 5,   # Conservative thread count
    "save_progress_every": 20
}

class RMITCourseDetailsScraper:
    """Simplified concurrent scraper for RMIT course details"""
    
    def __init__(self):
        self.courses = []
        self.stats = {
            "total_urls": 0,
            "successful": 0,
            "failed": 0,
            "skipped": 0
        }
        
        # Thread safety
        self.lock = threading.Lock()
        
        # Create output directory
        self.output_dir = Path(CONFIG["output_dir"])
        self.output_dir.mkdir(exist_ok=True)
        
        # Full output path
        self.output_file = self.output_dir / CONFIG["output_file"]
        
        print(f"{Fore.GREEN}✓ Scraper initialized successfully{Style.RESET_ALL}")
    
    def print_banner(self):
        """Print a colorful banner"""
        print(f"\n{Fore.CYAN}{'='*80}")
        print(f"{Fore.YELLOW}✨ RMIT Course Details Scraper (Concurrent) ✨")
        print(f"{Fore.GREEN}🎓 Extracting detailed course information from specific URLs")
        print(f"{Fore.MAGENTA}Reading URLs from: {CONFIG['url_file']}")
        print(f"{Fore.MAGENTA}Output directory: {CONFIG['output_dir']}")
        print(f"{Fore.BLUE}Max concurrent workers: {CONFIG['max_workers']}")
        print(f"{Fore.CYAN}{'='*80}{Style.RESET_ALL}\n")
    
    def load_urls_from_file(self) -> List[str]:
        """Load URLs from text file"""
        try:
            url_file = Path(CONFIG["url_file"])
            print(f"{Fore.BLUE}📂 Looking for URL file: {url_file.absolute()}")
            
            if not url_file.exists():
                print(f"{Fore.RED}✗ File {CONFIG['url_file']} not found!")
                return []
            
            with open(url_file, 'r', encoding='utf-8') as f:
                urls = [line.strip() for line in f if line.strip() and not line.startswith('#')]
            
            print(f"{Fore.GREEN}✓ Loaded {len(urls)} URLs from {CONFIG['url_file']}")
            if len(urls) > 0:
                print(f"{Fore.CYAN}📋 Sample URLs:")
                for i, url in enumerate(urls[:3]):
                    print(f"  {i+1}. {url}")
                if len(urls) > 3:
                    print(f"  ... and {len(urls)-3} more")
            
            return urls
        except Exception as e:
            print(f"{Fore.RED}✗ Error reading file: {e}")
            return []
    
    def clean_text(self, text: str) -> str:
        """Clean and normalize text content but preserve paragraph breaks"""
        if not text:
            return ""

        # Normalize Windows and Mac newlines to \n
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        # Replace multiple newlines with just one newline to keep paragraphs
        text = re.sub(r'\n+', '\n', text)
        # Remove unwanted characters but keep basic punctuation including %
        text = re.sub(r'[^\w\s\-\.,;:()\[\]@%\n]', '', text)
        # Strip trailing spaces on each line and remove extra spaces
        lines = [ ' '.join(line.split()) for line in text.split('\n') ]
        # Join lines back with single newline
        text = '\n'.join(lines).strip()
        return text

    def extract_course_code(self, soup: BeautifulSoup, url: str) -> str:
        """Extract course code from page or URL, including from tables"""
        # First, try existing selectors (headings, titles, etc.)
        selectors = [
            'h1', '.course-title', '.course-code', '.page-title',
            '[class*="code"]', '[id*="code"]'
        ]
        
        for selector in selectors:
            elements = soup.select(selector)
            for element in elements:
                text = element.get_text(strip=True)
                match = re.search(r'\b([A-Z]{2,4}\d{3,5})\b', text)
                if match:
                    return match.group(1)
        
        # Next, look inside all tables for course code
        tables = soup.find_all('table')
        for table in tables:
            # Check all cells in the table
            cells = table.find_all(['td', 'th'])
            for cell in cells:
                text = cell.get_text(strip=True)
                match = re.search(r'\b([A-Z]{2,4}\d{3,5})\b', text)
                if match:
                    return match.group(1)
        
        # As a fallback, try extracting from URL (in case it has digits at the end)
        url_match = re.search(r'/courses/(\d+)', url)
        if url_match:
            return url_match.group(1)
        
        return ""

    def extract_course_title(self, soup: BeautifulSoup) -> str:
        """Extract course title without prefix text"""
        selectors = [
            'h1', '.course-title', '.page-title', 'title',
            '[class*="title"]'
        ]
        
        for selector in selectors:
            element = soup.select_one(selector)
            if element:
                text = element.get_text(strip=True)
                
                # Remove "Course Title:" prefix (case insensitive)
                text = re.sub(r'^Course\s+Title:\s*', '', text, flags=re.IGNORECASE)
                
                # Remove other common prefixes
                text = re.sub(r'^(Course\s+Name:\s*|Title:\s*)', '', text, flags=re.IGNORECASE)
                
                # Clean up title (remove course code if present)
                text = re.sub(r'\b[A-Z]{2,4}\d{3,5}\b', '', text)
                
                # Clean up any remaining formatting
                text = self.clean_text(text)
                
                if text and len(text) > 3:  # Ensure meaningful title (reduced from 10)
                    return text.strip()
        
        return ""
    
    def extract_school(self, soup: BeautifulSoup) -> str:
        """Extract school information"""
        school_patterns = [
            r'school of ([^.\n,;]+)',
            r'department of ([^.\n,;]+)',
            r'faculty of ([^.\n,;]+)',
            r'college of ([^.\n,;]+)'
        ]
        
        # Check breadcrumbs, navigation, or specific elements
        school_selectors = [
            '.breadcrumb', '.nav', '[class*="school"]', 
            '[class*="department"]', '[class*="faculty"]',
            '.course-details', '.course-info'
        ]
        
        for selector in school_selectors:
            elements = soup.select(selector)
            for element in elements:
                text = element.get_text(strip=True).lower()
                for pattern in school_patterns:
                    match = re.search(pattern, text, re.IGNORECASE)
                    if match:
                        school = self.clean_text(match.group(1))
                        if school:
                            return school.title()
        
        # Look in the entire page text as fallback
        page_text = soup.get_text().lower()
        for pattern in school_patterns:
            match = re.search(pattern, page_text, re.IGNORECASE)
            if match:
                school = self.clean_text(match.group(1))
                if school and len(school) < 100:
                    return school.title()
        
        return ""
    
    def extract_coordinator_info(self, soup: BeautifulSoup) -> Dict[str, str]:
        """Extract course coordinator information"""
        coordinator_info = {
            "course_coordinator": "",
            "course_coordinator_email": "",
            "course_coordinator_phone": ""
        }

        # Combine all possible text from page
        page_text = soup.get_text(separator=' ', strip=True)

        # Extract email
        email_match = re.search(r'(?i)Course Coordinator Email[:\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', page_text)
        if email_match:
            coordinator_info["course_coordinator_email"] = email_match.group(1)

        # Extract phone number
        phone_match = re.search(r'(?i)Course Coordinator Phone[:\s]*(\+?[\d\s\-\(\)]{8,})', page_text)
        if phone_match:
            coordinator_info["course_coordinator_phone"] = self.clean_text(phone_match.group(1))

        # Extract name (assume it comes before 'Course Coordinator')
        name_match = re.search(r'(?i)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?=\s*Course Coordinator)', page_text)
        if name_match:
            coordinator_info["course_coordinator"] = name_match.group(1).strip()

        return coordinator_info

    def extract_course_description(self, soup: BeautifulSoup) -> str:
        """Extract course description/overview"""
        description_selectors = [
            '.course-description', '.course-overview', '.description',
            '[class*="description"]', '[class*="overview"]',
            '.course-content', '.course-summary'
        ]

        # First try common CSS class selectors
        for selector in description_selectors:
            element = soup.select_one(selector)
            if element:
                text = element.get_text(separator=' ', strip=True)
                text = self.clean_text(text)
                if text and len(text) > 50:
                    return text[:2000]

        # Look for <strong> or <h2>/<h3> with "Course Description" and grab following text
        labels = ['course description', 'description']
        for tag in soup.find_all(['strong', 'h2', 'h3']):
            tag_text = tag.get_text(strip=True).lower()
            if any(label in tag_text for label in labels):
                # Try to get next sibling with content
                next_el = tag.find_next(string=True)
                if next_el:
                    full_text = next_el.strip()
                    if len(full_text) > 50:
                        return self.clean_text(full_text[:2000])

                # Alternatively, check next element if it's a <p> or <div>
                next_tag = tag.find_parent().find_next_sibling()
                while next_tag and next_tag.name not in ['p', 'div']:
                    next_tag = next_tag.find_next_sibling()
                if next_tag:
                    text = next_tag.get_text(separator=' ', strip=True)
                    if len(text) > 50:
                        return self.clean_text(text[:2000])

        # Fallback: grab long <p> blocks near the top
        for p in soup.find_all('p')[:10]:
            text = p.get_text(strip=True)
            if len(text) > 100 and 'course' in text.lower():
                return self.clean_text(text[:2000])

        return ""
    
    def extract_assessment_info(self, soup: BeautifulSoup) -> Dict[str, str]:
        """Extract assessment-related information, including AND/OR logic."""
        assessment_info = {
            "assessment_tasks": "",
            "hurdle_requirement": ""
        }

        # Extract ASSESSMENT TASKS
        task_blocks = []

        for tag in soup.find_all(['strong', 'h2', 'h3']):
            tag_text = tag.get_text(strip=True).lower()

            if any(label in tag_text for label in ["assessment tasks", "assignments", "task details"]):
                current = tag.find_parent()

                while current:
                    current = current.find_next_sibling()
                    if not current or current.name not in ['div', 'p', 'ul', 'ol']:
                        break
                    text = current.get_text(separator=' ', strip=True)
                    if len(text) < 20:
                        continue

                    # Clean up newlines and excessive whitespace first
                    text = re.sub(r'\n+', ' ', text)
                    text = re.sub(r'\s+', ' ', text)
                    task_blocks.append(self.clean_text(text))
                break

        if task_blocks:
            combined_tasks = " ".join(task_blocks)
            combined_tasks = re.sub(r'\n+', ' ', combined_tasks)
            combined_tasks = re.sub(r'\s+', ' ', combined_tasks)
            assessment_info["assessment_tasks"] = combined_tasks[:3000].strip()

        # Extract HURDLE REQUIREMENT
        hurdle_blocks = []

        for tag in soup.find_all(['strong', 'h2', 'h3']):
            tag_text = tag.get_text(strip=True).lower()

            if "hurdle requirement" in tag_text:
                current = tag.find_parent()
                while current:
                    current = current.find_next_sibling()
                    if not current or current.name not in ['div', 'p']:
                        break
                    text = current.get_text(separator=' ', strip=True)
                    if "in order to pass" in text.lower() or "students are required" in text.lower():
                        text = re.sub(r'\n+', ' ', text)
                        text = re.sub(r'\s+', ' ', text)
                        hurdle_blocks.append(self.clean_text(text))
                        break
                break

        if hurdle_blocks:
            assessment_info["hurdle_requirement"] = hurdle_blocks[0][:1500].strip()

        return assessment_info

    def extract_study_requirements(self, soup: BeautifulSoup) -> Dict[str, str]:
        """Extract study requirements - simplified version"""
        requirements_info = {
            "required_prior_study": "",
            "required_concurrent_study": ""
        }

        # Simplified extraction - look for common patterns
        page_text = soup.get_text(separator=' ', strip=True)
        
        # Prior study
        prior_match = re.search(r'Prerequisites?[:\s]+(.*?)(?=Co-?requisites?|$)', page_text, re.IGNORECASE | re.DOTALL)
        if prior_match:
            requirements_info["required_prior_study"] = self.clean_text(prior_match.group(1)[:500])
        
        # Concurrent study
        concurrent_match = re.search(r'Co-?requisites?[:\s]+(.*?)(?=Prerequisites?|$)', page_text, re.IGNORECASE | re.DOTALL)
        if concurrent_match:
            requirements_info["required_concurrent_study"] = self.clean_text(concurrent_match.group(1)[:500])

        return requirements_info
    
    def scrape_single_url(self, url: str) -> Optional[Dict]:
        """Scrape a single URL - this runs in each thread"""
        try:
            # Create a new session for this thread
            session = requests.Session()
            session.headers.update({
                'User-Agent': CONFIG["user_agent"],
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
            })
            
            # Rate limiting
            time.sleep(CONFIG["rate_limit"])
            
            # Make request
            response = session.get(url, timeout=CONFIG["timeout"])
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()
            
            # Extract all required fields
            course_data = {}
            
            # Basic course information
            course_data["course_title"] = self.extract_course_title(soup)
            course_data["school"] = self.extract_school(soup)
            course_data["course_code"] = self.extract_course_code(soup, url)
            
            # Coordinator information
            coordinator_info = self.extract_coordinator_info(soup)
            course_data.update(coordinator_info)
            
            # Course description
            course_data["course_description"] = self.extract_course_description(soup)
            
            # Assessment information
            assessment_info = self.extract_assessment_info(soup)
            course_data.update(assessment_info)
            
            # Study requirements
            requirements_info = self.extract_study_requirements(soup)
            course_data.update(requirements_info)
            
            # Add metadata
            course_data["source_url"] = url
            course_data["scraped_at"] = datetime.now().isoformat()
            
            return course_data
            
        except Exception as e:
            print(f"{Fore.RED}✗ Error processing {url}: {e}{Style.RESET_ALL}")
            return None
    
    def scrape_all_courses(self):
        """Main method to scrape all courses concurrently"""
        self.print_banner()
        
        # Load URLs from file
        urls = self.load_urls_from_file()
        if not urls:
            print(f"{Fore.RED}✗ No URLs to process!{Style.RESET_ALL}")
            return
        
        self.stats["total_urls"] = len(urls)
        
        print(f"{Fore.YELLOW}📋 Processing {len(urls)} course URLs with {CONFIG['max_workers']} workers...{Style.RESET_ALL}")
        print(f"{Fore.BLUE}🚀 Starting concurrent scraping...{Style.RESET_ALL}\n")
        
        start_time = time.time()
        
        # Use ThreadPoolExecutor for concurrent processing
        with ThreadPoolExecutor(max_workers=CONFIG["max_workers"]) as executor:
            # Submit all tasks
            future_to_url = {executor.submit(self.scrape_single_url, url): url for url in urls}
            
            # Process completed tasks as they finish
            for i, future in enumerate(as_completed(future_to_url), 1):
                url = future_to_url[future]
                
                try:
                    result = future.result()
                    
                    if result:
                        with self.lock:
                            self.courses.append(result)
                            self.stats["successful"] += 1
                        
                        # Print progress
                        course_code = result.get('course_code', 'Unknown')
                        course_title = result.get('course_title', 'Unknown')[:40]
                        print(f"{Fore.GREEN}✓ {i}/{len(urls)} - {course_code}: {course_title}{Style.RESET_ALL}")
                        
                        # Save progress periodically
                        if i % CONFIG["save_progress_every"] == 0:
                            self.save_progress()
                            
                    else:
                        with self.lock:
                            self.stats["failed"] += 1
                        print(f"{Fore.RED}✗ {i}/{len(urls)} - Failed: {url}{Style.RESET_ALL}")
                
                except Exception as e:
                    with self.lock:
                        self.stats["failed"] += 1
                    print(f"{Fore.RED}✗ {i}/{len(urls)} - Exception: {e}{Style.RESET_ALL}")
        
        end_time = time.time()
        elapsed_time = end_time - start_time
        
        # Save final results
        self.save_results()
        
        # Print final statistics
        self.print_final_stats(elapsed_time)
    
    def save_progress(self):
        """Save current progress"""
        try:
            with self.lock:
                courses_copy = self.courses.copy()
            
            with open(self.output_file, 'w', encoding='utf-8') as f:
                json.dump(courses_copy, f, ensure_ascii=False, indent=2)
            
            print(f"{Fore.BLUE}💾 Progress saved: {len(courses_copy)} courses{Style.RESET_ALL}")
            
        except Exception as e:
            print(f"{Fore.RED}✗ Error saving progress: {e}{Style.RESET_ALL}")
    
    def save_results(self):
        """Save extracted course data to JSON file"""
        try:
            with open(self.output_file, 'w', encoding='utf-8') as f:
                json.dump(self.courses, f, ensure_ascii=False, indent=2)
            
            print(f"\n{Fore.GREEN}✓ Saved {len(self.courses)} course records to: {self.output_file}{Style.RESET_ALL}")
            
            # Save summary
            summary = {
                "scrape_date": datetime.now().isoformat(),
                "total_courses": len(self.courses),
                "statistics": self.stats,
                "configuration": {
                    "max_workers": CONFIG["max_workers"],
                    "rate_limit": CONFIG["rate_limit"],
                    "timeout": CONFIG["timeout"]
                },
                "sample_course": self.courses[0] if self.courses else None
            }
            
            summary_file = self.output_file.with_suffix('_summary.json')
            with open(summary_file, 'w', encoding='utf-8') as f:
                json.dump(summary, f, ensure_ascii=False, indent=2)
            
            print(f"{Fore.GREEN}✓ Saved summary to: {summary_file}{Style.RESET_ALL}")
            
        except Exception as e:
            print(f"{Fore.RED}✗ Error saving results: {e}{Style.RESET_ALL}")
    
    def print_final_stats(self, elapsed_time: float):
        """Print final scraping statistics"""
        print(f"\n{Fore.CYAN}{'='*80}")
        print(f"{Fore.YELLOW}✨ Concurrent Scraping Complete! ✨")
        print(f"{Fore.GREEN}Total URLs processed: {self.stats['total_urls']}")
        print(f"{Fore.GREEN}Successful extractions: {self.stats['successful']}")
        print(f"{Fore.RED}Failed extractions: {self.stats['failed']}")
        success_rate = (self.stats['successful']/self.stats['total_urls']*100) if self.stats['total_urls'] > 0 else 0
        print(f"{Fore.BLUE}Success rate: {success_rate:.1f}%")
        print(f"\n{Fore.MAGENTA}⏱️  Performance Metrics:")
        print(f"{Fore.MAGENTA}Total time: {elapsed_time:.2f} seconds")
        if self.stats['total_urls'] > 0:
            print(f"{Fore.MAGENTA}Average time per URL: {elapsed_time/self.stats['total_urls']:.2f} seconds")
            print(f"{Fore.MAGENTA}URLs per minute: {self.stats['total_urls']/(elapsed_time/60):.1f}")
        print(f"{Fore.MAGENTA}Concurrent workers: {CONFIG['max_workers']}")
        print(f"\n{Fore.CYAN}Output file: {self.output_file}")
        print(f"{Fore.CYAN}{'='*80}{Style.RESET_ALL}\n")


# Main execution
if __name__ == "__main__":
    print(f"{Fore.CYAN}🚀 RMIT Course Scraper Starting...{Style.RESET_ALL}")
    
    # Create sample URL file if it doesn't exist
    if not Path(CONFIG["url_file"]).exists():
        sample_urls = [
            "https://www1.rmit.edu.au/courses/053239",
            "https://www1.rmit.edu.au/courses/053378"
        ]
        
        print(f"{Fore.YELLOW}📝 Creating sample {CONFIG['url_file']}...{Style.RESET_ALL}")
        with open(CONFIG["url_file"], 'w') as f:
            f.write("# RMIT Course URLs to scrape\n")
            f.write("# One URL per line, lines starting with # are ignored\n\n")
            for url in sample_urls:
                f.write(f"{url}\n")
        
        print(f"{Fore.YELLOW}✓ Created sample {CONFIG['url_file']} with example URLs{Style.RESET_ALL}")
        print(f"{Fore.CYAN}Please add your course URLs to this file and run the script again{Style.RESET_ALL}")
    
    try:
        scraper = RMITCourseDetailsScraper()
        scraper.scrape_all_courses()
        
    except KeyboardInterrupt:
        print(f"\n{Fore.YELLOW}⚠️ Scraping interrupted by user{Style.RESET_ALL}")
        
    except Exception as e:
        print(f"\n{Fore.RED}✗ Fatal error: {e}{Style.RESET_ALL}")
        import traceback
        traceback.print_exc()
        raise