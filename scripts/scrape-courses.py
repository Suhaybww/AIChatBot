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
    "courses_file": "courses_data.json",
    "schools_file": "schools_data.json",
    "max_retries": 3,
    "timeout": 30,
    "rate_limit": 0.2,  # Conservative rate limit
    "user_agent": "Educational Course Details Scraper",
    "max_workers": 5,   # Conservative thread count
    "save_progress_every": 20
}

class RMITCourseDetailsScraper:
    """Database-optimized concurrent scraper for RMIT course details"""
    
    def __init__(self):
        self.courses = []
        self.schools = {}  # Track unique schools
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
        
        # Full output paths
        self.courses_file = self.output_dir / CONFIG["courses_file"]
        self.schools_file = self.output_dir / CONFIG["schools_file"]
        
        print(f"{Fore.GREEN}✓ Database-optimized scraper initialized successfully{Style.RESET_ALL}")
    
    def print_banner(self):
        """Print a colorful banner"""
        print(f"\n{Fore.CYAN}{'='*80}")
        print(f"{Fore.YELLOW}✨ RMIT Course Details Scraper (Database-Optimized) ✨")
        print(f"{Fore.GREEN}🎓 Extracting course data for direct database insertion")
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

    def determine_course_level(self, course_code: str, content: str) -> str:
        """Determine course level (UNDERGRADUATE/POSTGRADUATE) from course code and content"""
        if not course_code:
            return "UNDERGRADUATE"  # Default
        
        # Extract numeric part
        numeric_match = re.search(r'(\d+)', course_code)
        if numeric_match:
            numeric_part = numeric_match.group(1)
            first_digit = int(numeric_part[0]) if numeric_part else 0
            
            # RMIT convention: 1000-4999 = undergraduate, 5000+ = postgraduate
            if first_digit >= 5:
                return "POSTGRADUATE"
            elif first_digit >= 1:
                return "UNDERGRADUATE"
        
        # Check content for indicators
        content_lower = content.lower()
        postgrad_indicators = ['master', 'postgraduate', 'graduate diploma', 'phd', 'doctorate']
        if any(indicator in content_lower for indicator in postgrad_indicators):
            return "POSTGRADUATE"
        
        return "UNDERGRADUATE"
    
    def extract_delivery_modes(self, content: str) -> List[str]:
        """Extract delivery modes from content"""
        content_lower = content.lower()
        modes = []
        
        mode_patterns = {
            "ON_CAMPUS": ["on campus", "on-campus", "face-to-face", "in-person", "campus"],
            "ONLINE": ["online", "distance", "remote", "virtual", "e-learning"],
            "BLENDED": ["blended", "hybrid", "mixed mode", "flexible"],
            "DISTANCE": ["distance", "correspondence", "external"]
        }
        
        for mode, patterns in mode_patterns.items():
            if any(pattern in content_lower for pattern in patterns):
                modes.append(mode)
        
        # Default to ON_CAMPUS if none found
        return modes if modes else ["ON_CAMPUS"]
    
    def extract_campus_locations(self, content: str) -> List[str]:
        """Extract campus locations from content"""
        content_lower = content.lower()
        campuses = []
        
        # RMIT campus patterns
        campus_patterns = [
            "melbourne city", "city campus", "melbourne cbd",
            "brunswick", "bundoora", "point cook",
            "vietnam", "hanoi", "ho chi minh",
            "online", "distance"
        ]
        
        for pattern in campus_patterns:
            if pattern in content_lower:
                # Normalize campus names
                if "melbourne" in pattern or "city" in pattern or "cbd" in pattern:
                    campuses.append("Melbourne City")
                elif "brunswick" in pattern:
                    campuses.append("Brunswick")
                elif "bundoora" in pattern:
                    campuses.append("Bundoora")
                elif "point cook" in pattern:
                    campuses.append("Point Cook")
                elif "vietnam" in pattern or "hanoi" in pattern:
                    campuses.append("Vietnam")
                elif "ho chi minh" in pattern:
                    campuses.append("Vietnam")
                elif "online" in pattern:
                    campuses.append("Online")
        
        # Remove duplicates and default
        campuses = list(set(campuses))
        return campuses if campuses else ["Melbourne City"]
    
    def extract_credit_points(self, content: str) -> Optional[int]:
        """Extract credit points from content"""
        patterns = [
            r'(\d+)\s*credit\s*points?',
            r'credit\s*points?[:\s]*(\d+)',
            r'(\d+)\s*cp\b',
            r'\b(\d+)\s*credits?\b'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                points = int(match.group(1))
                # Validate reasonable credit points (typically 6, 12, 24, etc.)
                if 3 <= points <= 48:
                    return points
        
        return None

    def extract_course_code_from_url(self, url: str) -> str:
        """Extract course code directly from the URL - this is the definitive source"""
        # RMIT course URLs typically follow patterns like:
        # https://www1.rmit.edu.au/courses/053239
        # https://www.rmit.edu.au/study-with-us/levels-of-study/undergraduate-study/bachelor-degrees/bachelor-of-information-technology-bp094
        
        # First try to extract from the course ID pattern
        course_id_match = re.search(r'/courses/(\d+)', url)
        if course_id_match:
            course_id = course_id_match.group(1)
            # The course ID might be the code itself, or we need to map it
            return course_id
        
        # Try to extract from URL path with course code pattern (like bp094, cosc1234)
        code_in_path = re.search(r'[-/]([a-z]{2,4}\d{3,5})(?:-|$|/)', url.lower())
        if code_in_path:
            return code_in_path.group(1).upper()
        
        # Look for course code anywhere in the URL
        url_code_match = re.search(r'\b([a-z]{2,4}\d{3,5})\b', url.lower())
        if url_code_match:
            return url_code_match.group(1).upper()
        
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
    
    def extract_school_info(self, soup: BeautifulSoup) -> Dict[str, str]:
        """Extract school information and return structured data - improved validation"""
        school_info = {
            "name": "",
            "shortName": "",
            "faculty": "",
            "description": "",
            "website": ""
        }
        
        # Define known RMIT schools for validation
        known_rmit_schools = [
            "School of Accounting, Information Systems and Supply Chain",
            "School of Economics, Finance and Marketing", 
            "School of Management",
            "School of Business IT and Logistics",
            "School of Graduate Business",
            "School of Computing Technologies",
            "School of Science",
            "School of Engineering",
            "School of Aerospace, Mechanical and Manufacturing Engineering",
            "School of Civil, Environmental and Chemical Engineering",
            "School of Electrical and Biomedical Engineering",
            "School of Architecture and Urban Design",
            "School of Art",
            "School of Design",
            "School of Fashion and Textiles",
            "School of Media and Communication",
            "School of Education",
            "School of Health and Biomedical Sciences",
            "School of Nursing and Midwifery",
            "School of Psychology and Public Health",
            "School of Property, Construction and Project Management",
            "School of Mathematical and Geospatial Sciences",
            "School of Applied Sciences"
        ]
        
        # More precise patterns that require "School of" prefix
        school_patterns = [
            r'school of ([a-zA-Z\s,&-]{10,80}?)(?:\s|$|\.|\n|,)',  # Require "School of" and limit length
            r'department of ([a-zA-Z\s,&-]{10,60}?)(?:\s|$|\.|\n|,)',
            r'faculty of ([a-zA-Z\s,&-]{10,60}?)(?:\s|$|\.|\n|,)',
            r'college of ([a-zA-Z\s,&-]{10,60}?)(?:\s|$|\.|\n|,)'
        ]
        
        # Check breadcrumbs and navigation first (most reliable)
        priority_selectors = ['.breadcrumb', '.nav', '[class*="school"]', '[class*="department"]']
        
        for selector in priority_selectors:
            elements = soup.select(selector)
            for element in elements:
                text = element.get_text(strip=True)
                for pattern in school_patterns:
                    match = re.search(pattern, text, re.IGNORECASE)
                    if match:
                        full_name = self.clean_text(match.group(1)).strip().title()
                        
                        # Validate extracted school name
                        if self.is_valid_school_name(full_name, known_rmit_schools):
                            school_info["name"] = f"School of {full_name}"
                            school_info["shortName"] = self.generate_school_short_name(full_name)
                            break
                            
                if school_info["name"]:
                    break
            if school_info["name"]:
                break
        
        # If no valid school found, try exact matches with known schools
        if not school_info["name"]:
            page_text = soup.get_text()
            for known_school in known_rmit_schools:
                if known_school.lower() in page_text.lower():
                    school_info["name"] = known_school
                    # Extract the part after "School of"
                    if "School of" in known_school:
                        short_part = known_school.replace("School of ", "")
                        school_info["shortName"] = self.generate_school_short_name(short_part)
                    else:
                        school_info["shortName"] = known_school
                    break
        
        # Determine faculty based on school name
        if school_info["name"]:
            school_info["faculty"] = self.determine_faculty_from_school(school_info["name"])
        
        return school_info
    
    def is_valid_school_name(self, name: str, known_schools: List[str]) -> bool:
        """Validate if extracted text is a legitimate school name"""
        if not name or len(name) < 5:
            return False
            
        # Check if it's too long or contains invalid patterns
        if len(name) > 80:
            return False
            
        # Reject if it contains course-related terms
        invalid_terms = [
            'course', 'assessment', 'student', 'grade', 'enrolment', 'credit',
            'learning', 'outcome', 'prerequisite', 'coordinator', 'email',
            'building', 'level', 'room', 'lab', 'facility', 'equipment',
            'program option', 'postgraduate', 'undergraduate', 'bachelor',
            'master', 'diploma', 'certificate', 'provides', 'resources',
            'support', 'preparing', 'accessible', 'through', 'relevant'
        ]
        
        name_lower = name.lower()
        if any(term in name_lower for term in invalid_terms):
            return False
            
        # Check if it's close to a known school (fuzzy matching)
        for known in known_schools:
            known_part = known.replace("School of ", "").lower()
            if known_part in name_lower or name_lower in known_part:
                return True
                
        # Allow if it contains typical school department words
        valid_terms = [
            'accounting', 'business', 'management', 'engineering', 'science',
            'computing', 'technology', 'design', 'art', 'architecture',
            'health', 'nursing', 'education', 'media', 'communication',
            'economics', 'finance', 'marketing', 'mathematics', 'psychology'
        ]
        
        return any(term in name_lower for term in valid_terms)
    
    def generate_school_short_name(self, full_name: str) -> str:
        """Generate appropriate short name for school"""
        # Remove common words and keep key terms
        words = full_name.split()
        
        # If it's a compound name, take the last significant word
        skip_words = ['and', 'of', 'the', '&']
        significant_words = [w for w in words if w.lower() not in skip_words]
        
        if len(significant_words) == 1:
            return significant_words[0]
        elif len(significant_words) <= 3:
            return ' '.join(significant_words)
        else:
            # Take first and last significant words
            return f"{significant_words[0]} {significant_words[-1]}"
    
    def determine_faculty_from_school(self, school_name: str) -> str:
        """Determine faculty based on school name"""
        name_lower = school_name.lower()
        
        if any(term in name_lower for term in ["computing", "engineering", "science", "technology", "aerospace", "mechanical", "manufacturing", "civil", "environmental", "chemical", "electrical", "biomedical", "mathematical", "geospatial", "applied sciences"]):
            return "Science, Engineering and Technology"
        elif any(term in name_lower for term in ["business", "management", "economics", "finance", "marketing", "accounting", "information systems", "supply chain", "graduate business", "it", "logistics"]):
            return "Business and Law"
        elif any(term in name_lower for term in ["design", "art", "communication", "media", "architecture", "urban design", "fashion", "textiles"]):
            return "Design and Social Context"
        elif any(term in name_lower for term in ["health", "medical", "nursing", "midwifery", "psychology", "public health"]):
            return "Health and Biomedical Sciences"
        elif any(term in name_lower for term in ["education"]):
            return "Education"
        elif any(term in name_lower for term in ["property", "construction", "project management"]):
            return "Property, Construction and Project Management"
        else:
            return ""
    
    def extract_coordinator_info(self, soup: BeautifulSoup) -> Dict[str, str]:
        """Extract course coordinator information"""
        coordinator_info = {
            "coordinatorName": "",
            "coordinatorEmail": "",
            "coordinatorPhone": ""
        }

        # Combine all possible text from page
        page_text = soup.get_text(separator=' ', strip=True)

        # Extract email
        email_match = re.search(r'(?i)Course Coordinator Email[:\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', page_text)
        if email_match:
            coordinator_info["coordinatorEmail"] = email_match.group(1)

        # Extract phone number
        phone_match = re.search(r'(?i)Course Coordinator Phone[:\s]*(\+?[\d\s\-\(\)]{8,})', page_text)
        if phone_match:
            coordinator_info["coordinatorPhone"] = self.clean_text(phone_match.group(1))

        # Extract name (assume it comes before 'Course Coordinator')
        name_match = re.search(r'(?i)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?=\s*Course Coordinator)', page_text)
        if name_match:
            coordinator_info["coordinatorName"] = name_match.group(1).strip()

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
        labels = ['course description', 'description', 'overview']
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
    
    def extract_learning_outcomes(self, soup: BeautifulSoup) -> str:
        """Extract learning outcomes from course content"""
        outcomes_text = ""
        
        # Look for learning outcomes sections
        for tag in soup.find_all(['strong', 'h2', 'h3', 'h4']):
            tag_text = tag.get_text(strip=True).lower()
            if any(phrase in tag_text for phrase in ["learning outcomes", "course outcomes", "objectives", "what you'll learn"]):
                # Get following content
                current = tag.find_parent()
                outcomes_parts = []
                
                while current:
                    current = current.find_next_sibling()
                    if not current or current.name in ['h1', 'h2']:
                        break
                    if current.name in ['div', 'p', 'ul', 'ol']:
                        text = current.get_text(separator=' ', strip=True)
                        if len(text) > 20:
                            outcomes_parts.append(text)
                
                if outcomes_parts:
                    outcomes_text = " ".join(outcomes_parts)
                    break
        
        return self.clean_text(outcomes_text[:1500]) if outcomes_text else ""
    
    def extract_assessment_info(self, soup: BeautifulSoup) -> Dict[str, str]:
        """Extract assessment-related information"""
        assessment_info = {
            "assessmentTasks": "",
            "hurdleRequirement": ""
        }

        # Extract ASSESSMENT TASKS
        task_blocks = []
        for tag in soup.find_all(['strong', 'h2', 'h3']):
            tag_text = tag.get_text(strip=True).lower()
            if any(label in tag_text for label in ["assessment tasks", "assignments", "task details", "assessment"]):
                current = tag.find_parent()
                while current:
                    current = current.find_next_sibling()
                    if not current or current.name not in ['div', 'p', 'ul', 'ol']:
                        break
                    text = current.get_text(separator=' ', strip=True)
                    if len(text) < 20:
                        continue
                    text = re.sub(r'\n+', ' ', text)
                    text = re.sub(r'\s+', ' ', text)
                    task_blocks.append(self.clean_text(text))
                break

        if task_blocks:
            combined_tasks = " ".join(task_blocks)
            assessment_info["assessmentTasks"] = combined_tasks[:3000].strip()

        # Extract HURDLE REQUIREMENT
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
                        assessment_info["hurdleRequirement"] = self.clean_text(text[:1500]).strip()
                        break
                break

        return assessment_info

    def extract_prerequisites_corequisites(self, soup: BeautifulSoup) -> Dict[str, str]:
        """Enhanced extraction of prerequisites and corequisites"""
        requirements = {
            "prerequisites": "",
            "corequisites": ""
        }

        # Method 1: Look for specific HTML sections with prerequisites
        prereq_sections = soup.find_all(['div', 'section', 'p', 'td'], 
                                      class_=re.compile(r'(prerequisite|pre-requisite)', re.I))
        
        for section in prereq_sections:
            text = section.get_text(separator=' ', strip=True)
            if len(text) > 10 and len(text) < 800:
                requirements["prerequisites"] = self.clean_text(text)
                break

        # Method 2: Look for headers followed by content
        prereq_headers = ['prerequisites', 'pre-requisites', 'required prior study', 
                         'prior study required', 'admission requirements', 'entry requirements']
        
        for header_text in prereq_headers:
            # Find headers (h1-h6, strong, b, th)
            headers = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'th'])
            for header in headers:
                if header_text in header.get_text(strip=True).lower():
                    # Look for content after this header
                    prereq_content = self.extract_content_after_header(header)
                    if prereq_content:
                        requirements["prerequisites"] = prereq_content
                        break
            if requirements["prerequisites"]:
                break

        # Method 3: Look in table cells
        if not requirements["prerequisites"]:
            table_cells = soup.find_all(['td', 'th'])
            for cell in table_cells:
                cell_text = cell.get_text(strip=True).lower()
                if any(term in cell_text for term in ['prerequisite', 'pre-requisite', 'prior study']):
                    # Get the next cell or same cell content
                    content = ""
                    next_cell = cell.find_next_sibling(['td', 'th'])
                    if next_cell:
                        content = next_cell.get_text(separator=' ', strip=True)
                    else:
                        # Content might be in the same cell after the label
                        full_cell = cell.get_text(separator=' ', strip=True)
                        match = re.search(r'(?:prerequisite|pre-requisite)[:\s]+(.*)', full_cell, re.I)
                        if match:
                            content = match.group(1)
                    
                    if content and len(content) > 5 and len(content) < 600:
                        requirements["prerequisites"] = self.clean_text(content)
                        break

        # Method 4: Pattern matching in full page text
        if not requirements["prerequisites"]:
            page_text = soup.get_text(separator=' ', strip=True)
            
            # More comprehensive patterns for prerequisites
            prereq_patterns = [
                r'Prerequisites?[:\s]+((?:(?!Co-?requisites?|Admission|Assessment|Duration|Delivery|Campus|Overview|Description|Learning|Assessment).){1,500})',
                r'Required prior study[:\s]+((?:(?!Co-?requisites?|Admission|Assessment|Duration|Delivery|Campus|Overview|Description|Learning|Assessment).){1,500})',
                r'Pre-requisites?[:\s]+((?:(?!Co-?requisites?|Admission|Assessment|Duration|Delivery|Campus|Overview|Description|Learning|Assessment).){1,500})',
                r'Entry requirements[:\s]+((?:(?!Co-?requisites?|Prerequisites?|Duration|Delivery|Campus|Overview|Description|Learning|Assessment).){1,500})',
                r'Admission requirements[:\s]+((?:(?!Co-?requisites?|Prerequisites?|Duration|Delivery|Campus|Overview|Description|Learning|Assessment).){1,500})'
            ]
            
            for pattern in prereq_patterns:
                match = re.search(pattern, page_text, re.IGNORECASE | re.DOTALL)
                if match:
                    prereq_text = match.group(1).strip()
                    # Clean up common end markers
                    prereq_text = re.sub(r'\s*(Co-?requisites?|Assessment|Duration|Campus|Overview|Delivery).*', '', prereq_text, flags=re.I)
                    if len(prereq_text) > 5 and len(prereq_text) < 600:
                        requirements["prerequisites"] = self.clean_text(prereq_text)
                        break

        # Method 5: Look for course codes patterns (might indicate prerequisites)
        if not requirements["prerequisites"]:
            # Look for patterns like "COSC1076 OR COSC1078" which likely indicate prerequisites
            course_code_patterns = soup.find_all(text=re.compile(r'\b[A-Z]{2,4}\d{3,5}(?:\s+(?:OR|AND|or|and)\s+[A-Z]{2,4}\d{3,5})*\b'))
            for pattern in course_code_patterns:
                text = pattern.strip()
                if len(text) > 5 and len(text) < 200 and ('OR' in text or 'AND' in text or 'or' in text or 'and' in text):
                    requirements["prerequisites"] = self.clean_text(text)
                    break

        # COREQUISITES EXTRACTION (similar comprehensive approach)
        # Method 1: Look for specific HTML sections
        coreq_sections = soup.find_all(['div', 'section', 'p', 'td'], 
                                     class_=re.compile(r'(corequisite|co-requisite)', re.I))
        
        for section in coreq_sections:
            text = section.get_text(separator=' ', strip=True)
            if len(text) > 10 and len(text) < 600:
                requirements["corequisites"] = self.clean_text(text)
                break

        # Method 2: Headers for corequisites
        if not requirements["corequisites"]:
            coreq_headers = ['corequisites', 'co-requisites', 'required concurrent study', 
                           'concurrent study required', 'co requisites']
            
            for header_text in coreq_headers:
                headers = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'th'])
                for header in headers:
                    if header_text in header.get_text(strip=True).lower():
                        coreq_content = self.extract_content_after_header(header)
                        if coreq_content:
                            requirements["corequisites"] = coreq_content
                            break
                if requirements["corequisites"]:
                    break

        # Method 3: Pattern matching for corequisites
        if not requirements["corequisites"]:
            page_text = soup.get_text(separator=' ', strip=True)
            coreq_patterns = [
                r'Co-?requisites?[:\s]+((?:(?!Prerequisites?|Admission|Assessment|Duration|Delivery|Campus|Overview|Description|Learning|Assessment).){1,500})',
                r'Required concurrent study[:\s]+((?:(?!Prerequisites?|Admission|Assessment|Duration|Delivery|Campus|Overview|Description|Learning|Assessment).){1,500})',
                r'Concurrent study[:\s]+((?:(?!Prerequisites?|Admission|Assessment|Duration|Delivery|Campus|Overview|Description|Learning|Assessment).){1,500})'
            ]
            
            for pattern in coreq_patterns:
                match = re.search(pattern, page_text, re.IGNORECASE | re.DOTALL)
                if match:
                    coreq_text = match.group(1).strip()
                    coreq_text = re.sub(r'\s*(Prerequisites?|Assessment|Duration|Campus|Overview|Delivery).*', '', coreq_text, flags=re.I)
                    if len(coreq_text) > 5 and len(coreq_text) < 600:
                        requirements["corequisites"] = self.clean_text(coreq_text)
                        break

        return requirements

    def extract_content_after_header(self, header_element) -> str:
        """Extract content that appears after a header element"""
        content_parts = []
        
        # Try to get the next sibling elements
        current = header_element.find_parent()
        if not current:
            current = header_element
        
        # Look for the next elements that might contain the content
        for _ in range(5):  # Check up to 5 next siblings
            current = current.find_next_sibling()
            if not current:
                break
            
            # Stop if we hit another header
            if current.name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                break
            
            if current.name in ['p', 'div', 'ul', 'ol', 'li']:
                text = current.get_text(separator=' ', strip=True)
                if len(text) > 10:
                    content_parts.append(text)
                    # If we have enough content, stop
                    if len(' '.join(content_parts)) > 100:
                        break
        
        combined_content = ' '.join(content_parts)
        if len(combined_content) > 5 and len(combined_content) < 600:
            return self.clean_text(combined_content)
        
        return ""
    
    def track_school(self, school_info: Dict[str, str]) -> Optional[str]:
        """Track unique schools and return school ID"""
        if not school_info["name"]:
            return None
        
        school_name = school_info["name"]
        
        with self.lock:
            if school_name not in self.schools:
                # Generate a unique ID for the school
                school_id = f"school_{len(self.schools) + 1}"
                self.schools[school_name] = {
                    "id": school_id,
                    "name": school_name,
                    "shortName": school_info["shortName"],
                    "faculty": school_info["faculty"],
                    "description": school_info["description"],
                    "website": school_info["website"],
                    "createdAt": datetime.now().isoformat(),
                    "updatedAt": datetime.now().isoformat()
                }
            
            return self.schools[school_name]["id"]
    
    def scrape_single_url(self, url: str) -> Optional[Dict]:
        """Scrape a single URL and return database-ready course data"""
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
            
            # Extract all data - prioritize URL for course code
            course_code = self.extract_course_code_from_url(url)
            course_title = self.extract_course_title(soup)
            
            # Skip if no valid course code or title
            if not course_code or not course_title:
                return None
            
            # Get full page content for analysis
            full_content = soup.get_text(separator=' ', strip=True)
            
            # Extract school information
            school_info = self.extract_school_info(soup)
            school_id = self.track_school(school_info)
            
            # Extract coordinator information
            coordinator_info = self.extract_coordinator_info(soup)
            
            # Extract course description and learning outcomes
            description = self.extract_course_description(soup)
            learning_outcomes = self.extract_learning_outcomes(soup)
            
            # Extract assessment information
            assessment_info = self.extract_assessment_info(soup)
            
            # Extract prerequisites and corequisites
            requirements = self.extract_prerequisites_corequisites(soup)
            
            # Determine course properties
            level = self.determine_course_level(course_code, full_content)
            delivery_modes = self.extract_delivery_modes(full_content)
            campuses = self.extract_campus_locations(full_content)
            credit_points = self.extract_credit_points(full_content)
            
            # Build course data matching database schema
            course_data = {
                # Required fields
                "id": f"course_{course_code.lower()}",  # Generate unique ID
                "code": course_code,
                "title": course_title,
                "level": level,
                
                # Optional fields
                "creditPoints": credit_points,
                "deliveryMode": delivery_modes,
                "campus": campuses,
                "description": description,
                "learningOutcomes": learning_outcomes,
                "assessmentTasks": assessment_info["assessmentTasks"],
                "hurdleRequirement": assessment_info["hurdleRequirement"],
                "prerequisites": requirements["prerequisites"],
                "corequisites": requirements["corequisites"],
                
                # Coordinator information
                "coordinatorName": coordinator_info["coordinatorName"],
                "coordinatorEmail": coordinator_info["coordinatorEmail"], 
                "coordinatorPhone": coordinator_info["coordinatorPhone"],
                
                # Metadata
                "schoolId": school_id,
                "sourceUrl": url,
                "isActive": True,
                "embedding": None,  # Will be generated later
                
                # Timestamps
                "createdAt": datetime.now().isoformat(),
                "updatedAt": datetime.now().isoformat()
            }
            
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
                        course_code = result.get('code', 'Unknown')
                        course_title = result.get('title', 'Unknown')[:40]
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
                schools_copy = dict(self.schools)
            
            self.save_database_files(courses_copy, schools_copy)
            
            print(f"{Fore.BLUE}💾 Progress saved: {len(courses_copy)} courses, {len(schools_copy)} schools{Style.RESET_ALL}")
            
        except Exception as e:
            print(f"{Fore.RED}✗ Error saving progress: {e}{Style.RESET_ALL}")
    
    def save_database_files(self, courses_data: List[Dict], schools_data: Dict):
        """Save data in database-ready format"""
        
        # Save courses data
        with open(self.courses_file, 'w', encoding='utf-8') as f:
            json.dump(courses_data, f, ensure_ascii=False, indent=2)
        
        # Convert schools dict to list format for database seeding
        schools_list = list(schools_data.values())
        with open(self.schools_file, 'w', encoding='utf-8') as f:
            json.dump(schools_list, f, ensure_ascii=False, indent=2)
    
    def save_results(self):
        """Save extracted course data to JSON files"""
        try:
            self.save_database_files(self.courses, self.schools)
            
            print(f"\n{Fore.GREEN}✓ Saved {len(self.courses)} course records to: {self.courses_file}{Style.RESET_ALL}")
            print(f"{Fore.GREEN}✓ Saved {len(self.schools)} school records to: {self.schools_file}{Style.RESET_ALL}")
            
            # Save summary
            summary = {
                "scrape_date": datetime.now().isoformat(),
                "total_courses": len(self.courses),
                "total_schools": len(self.schools),
                "statistics": self.stats,
                "configuration": {
                    "max_workers": CONFIG["max_workers"],
                    "rate_limit": CONFIG["rate_limit"],
                    "timeout": CONFIG["timeout"]
                },
                "database_schema_version": "1.0",
                "files_generated": {
                    "courses": str(self.courses_file),
                    "schools": str(self.schools_file)
                },
                "sample_course": self.courses[0] if self.courses else None,
                "sample_school": list(self.schools.values())[0] if self.schools else None
            }
            
            summary_file = self.output_dir / "course_scraping_summary.json"
            with open(summary_file, 'w', encoding='utf-8') as f:
                json.dump(summary, f, ensure_ascii=False, indent=2)
            
            print(f"{Fore.GREEN}✓ Saved summary to: {summary_file}{Style.RESET_ALL}")
            
        except Exception as e:
            print(f"{Fore.RED}✗ Error saving results: {e}{Style.RESET_ALL}")
    
    def print_final_stats(self, elapsed_time: float):
        """Print final scraping statistics"""
        print(f"\n{Fore.CYAN}{'='*80}")
        print(f"{Fore.YELLOW}✨ Database-Optimized Scraping Complete! ✨")
        print(f"{Fore.GREEN}Total URLs processed: {self.stats['total_urls']}")
        print(f"{Fore.GREEN}Successful extractions: {self.stats['successful']}")
        print(f"{Fore.GREEN}Unique schools found: {len(self.schools)}")
        print(f"{Fore.RED}Failed extractions: {self.stats['failed']}")
        success_rate = (self.stats['successful']/self.stats['total_urls']*100) if self.stats['total_urls'] > 0 else 0
        print(f"{Fore.BLUE}Success rate: {success_rate:.1f}%")
        print(f"\n{Fore.MAGENTA}⏱️  Performance Metrics:")
        print(f"{Fore.MAGENTA}Total time: {elapsed_time:.2f} seconds")
        if self.stats['total_urls'] > 0:
            print(f"{Fore.MAGENTA}Average time per URL: {elapsed_time/self.stats['total_urls']:.2f} seconds")
            print(f"{Fore.MAGENTA}URLs per minute: {self.stats['total_urls']/(elapsed_time/60):.1f}")
        print(f"{Fore.MAGENTA}Concurrent workers: {CONFIG['max_workers']}")
        print(f"\n{Fore.CYAN}Database-ready files:")
        print(f"{Fore.CYAN}- Courses: {self.courses_file}")
        print(f"{Fore.CYAN}- Schools: {self.schools_file}")
        print(f"{Fore.CYAN}{'='*80}{Style.RESET_ALL}\n")


# Main execution
if __name__ == "__main__":
    print(f"{Fore.CYAN}🚀 RMIT Database-Optimized Course Scraper Starting...{Style.RESET_ALL}")
    
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