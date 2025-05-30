import requests
from bs4 import BeautifulSoup
import os
import re
import json
import time
import hashlib
from urllib.parse import urljoin, urlparse
from typing import List, Tuple, Dict, Set, Optional
from datetime import datetime
import logging
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('scraper.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Configuration
CONFIG = {
    "output_dir": "rmit_knowledge_base",
    "state_file": "scraper_state.json",
    "chunk_size": 2000,  # Characters per chunk for embeddings
    "chunk_overlap": 200,  # Overlap between chunks
    "max_retries": 3,
    "timeout": 30,
    "validate_data": True,
    "incremental_mode": True,  # Enable incremental updates
    "user_agent": "Educational Knowledge Base Crawler (Contact: your-email@example.com)",
    "focused_mode": True,  # Enable for faster, more targeted scraping
    "max_urls_per_category": 300,  # Limit URLs per category
    "max_crawl_depth": 3,  # Reduced depth for focused mode
    "crawl_timeout_minutes": 30  # Maximum time for crawling phase
}

# Data validation patterns
VALIDATION_PATTERNS = {
    "course_code": {
        "patterns": [
            r'^[A-Z]{2,4}\d{3,4}$',  # BP094, COSC1234
            r'^[A-Z]\d{4,5}$'         # C4415
        ],
        "examples": ["BP094", "MC200", "C4415"]
    },
    "duration": {
        "patterns": [
            r'(\d+\.?\d*)\s*(year|month|week|day|semester)s?',
            r'(full-time|part-time)\s*:\s*(\d+)\s*(months|years)',
            r'duration[:\s]+(\d+\s*-\s*\d+\s*(?:years|months))',
            r'length\s*of\s*study[:\s]+(\d+\s*to\s*\d+\s*(?:years|months))'
        ],
        "examples": ["3 years", "6-12 months", "1.5 years", "full-time: 2 years"]
    },
    "fees": {
        "patterns": [
            r'\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?',  # $12,345.67
            r'\d{1,6}(?:\.\d{2})?\s*(?:AUD|USD)',  # 12345.67 AUD
            r'[A-Z\$\£\€]\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?',  # AUD 12,345.67
            r'tuition\s*fee[:\s]*[A-Z\$\£\€]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)'
        ],
        "transform": lambda x: re.sub(r'[^\d.]', '', x),  # Extract numeric part
        "examples": ["$32,000", "15500.00 AUD", "AUD 32000"]
    },
    "credit_points": {
        "patterns": [
            r'^\d{1,4}$',
            r'(\d+)\s*(credit\s*points|cp|points)'
        ],
        "examples": ["96", "192 CP", "384 credit points"]
    },
    "atar": {
        "patterns": [
            r'^\d{1,2}(\.\d{1,2})?$'
        ],
        "examples": ["75.00", "85.5", "90"]
    }
}

# Setup with category-specific configurations
base_urls = {
    "course-information": {
        "url": "https://www.rmit.edu.au/study-with-us",
        "keywords": ["course", "program", "subject", "curriculum", "syllabus", "study plan", "timetable",
                   "elective", "core", "prerequisite", "credit point", "handbook", "outline", "degree",
                   "bachelor", "master", "diploma", "certificate", "associate", "graduate", "postgraduate",
                   "undergraduate", "vocational", "tafe", "vet", "pathway", "career", "employment",
                   "admission", "requirements", "duration", "fees", "structure", "major", "minor",
                   "entry requirements", "atar", "selection rank", "english requirements"],
        "url_patterns": [
            "/course/", "/program/", "/study/", "/curriculum/", "/handbook/", "/timetable/",
            "/architecture/", "/art/", "/aviation/", "/biomedical-sciences/", "/building/",
            "/business/", "/communication/", "/design/", "/education/", "/engineering/",
            "/environment/", "/fashion/", "/health/", "/information-technology/", "/law/",
            "/media/", "/property/", "/psychology/", "/science/", "/social-and-community/",
            "/levels-of-study/", "/undergraduate/", "/postgraduate/", "/vocational-study/",
            "/certificates/", "/diplomas/", "/bachelor/", "/master/", "/graduate/",
            "/associate-degree/", "/pathways/", "/dual-degree/", "/double-degree/",
            # Specific course patterns
            "/arts-management/", "/fine-and-visual-art/", "/photography/", "/graphic-design/",
            "/interior-design/", "/fashion-design/", "/industrial-design/", "/animation/",
            "/games-design/", "/digital-media/", "/film-and-television/", "/music/",
            "/creative-writing/", "/journalism/", "/public-relations/", "/advertising/",
            "/marketing/", "/accounting/", "/finance/", "/management/", "/economics/",
            "/computer-science/", "/software-engineering/", "/cybersecurity/", "/data-science/",
            "/artificial-intelligence/", "/information-systems/", "/network-engineering/",
            "/civil-engineering/", "/mechanical-engineering/", "/electrical-engineering/",
            "/aerospace-engineering/", "/chemical-engineering/", "/environmental-engineering/",
            "/biomedical-engineering/", "/materials-engineering/", "/mining-engineering/",
            "/nursing/", "/pharmacy/", "/physiotherapy/", "/psychology/", "/social-work/",
            "/education/", "/teaching/", "/early-childhood/", "/primary/", "/secondary/",
            "/applied-science/", "/biotechnology/", "/chemistry/", "/physics/", "/mathematics/",
            "/statistics/", "/nanotechnology/", "/food-technology/", "/environmental-science/"
        ],
        "extraction_rules": {
            "prerequisites": [
                r'prerequisite[s]?[:\s]+([^.]+)',
                r'entry requirement[s]?[:\s]+([^.]+)',
                r'admission requirement[s]?[:\s]+([^.]+)'
            ],
            "career_outcomes": [
                r'career[s]?[:\s]+([^.]+)',
                r'employment outcome[s]?[:\s]+([^.]+)',
                r'graduate[s]? work as[:\s]+([^.]+)'
            ],
            "study_mode": [
                r'(full[- ]?time|part[- ]?time|online|on[- ]?campus|blended|flexible)'
            ]
        }
    },
    # Quick mode - only direct course pages
    "quick-course-scan": {
        "url": "https://www.rmit.edu.au/study-with-us/levels-of-study",
        "keywords": ["course", "program", "degree", "bachelor", "master", "diploma", "certificate"],
        "url_patterns": [
            "/course/c\\d+", "/course/[a-z]+\\d+",  # Direct course codes only
            "/program/bp\\d+", "/program/mc\\d+", "/program/gc\\d+"
        ],
        "extraction_rules": {}
    }
}

# MASTER RULE: Always include URLs containing specific base paths
master_include_patterns = [
    "/study-with-us",
    "/levels-of-study",
    "/course/",
    "/program/"
]

# Course-specific patterns that should always be included
course_specific_patterns = [
    r"c\d+",  # Course codes like c4415, c5411
    r"bp\d+", # Bachelor program codes
    r"mc\d+", # Master course codes
    r"gc\d+", # Graduate certificate codes
    r"gd\d+", # Graduate diploma codes
    r"ad\d+", # Associate degree codes
]

# Create output directories
Path(CONFIG["output_dir"]).mkdir(exist_ok=True)
Path(f"{CONFIG['output_dir']}/chunks").mkdir(exist_ok=True)

class ScraperState:
    """Manages scraper state for incremental updates"""
    
    def __init__(self, state_file: str):
        self.state_file = state_file
        self.state = self.load_state()
    
    def load_state(self) -> Dict:
        """Load previous scraping state"""
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, 'r') as f:
                    return json.load(f)
            except:
                logger.warning("Could not load state file, starting fresh")
        return {
            "last_run": None,
            "scraped_urls": {},
            "content_hashes": {}
        }
    
    def save_state(self):
        """Save current state"""
        self.state["last_run"] = datetime.now().isoformat()
        with open(self.state_file, 'w') as f:
            json.dump(self.state, f, indent=2)
    
    def get_url_hash(self, url: str, content: str) -> str:
        """Generate hash for URL content"""
        return hashlib.md5(f"{url}:{content}".encode()).hexdigest()
    
    def is_content_changed(self, url: str, content: str) -> bool:
        """Check if content has changed since last scrape"""
        current_hash = self.get_url_hash(url, content)
        previous_hash = self.state["content_hashes"].get(url)
        return current_hash != previous_hash
    
    def update_content_hash(self, url: str, content: str):
        """Update content hash for URL"""
        self.state["content_hashes"][url] = self.get_url_hash(url, content)
    
    def mark_url_scraped(self, url: str):
        """Mark URL as scraped with timestamp"""
        self.state["scraped_urls"][url] = datetime.now().isoformat()

def validate_field(field_name: str, value: str) -> Tuple[bool, Optional[str]]:
    """Validate a field against expected patterns"""
    if field_name not in VALIDATION_PATTERNS:
        return True, value  # No validation rules, accept as-is
    
    rules = VALIDATION_PATTERNS[field_name]
    
    # Apply transformation if exists
    if "transform" in rules:
        value = rules["transform"](value)
    
    # Check patterns
    for pattern in rules["patterns"]:
        if re.match(pattern, value, re.IGNORECASE):
            return True, value
    
    logger.warning(f"Validation failed for {field_name}: '{value}' (expected format like: {rules['examples']})")
    return False, None

def chunk_text(text: str, chunk_size: int = 2000, overlap: int = 200) -> List[Dict[str, any]]:
    """Split text into chunks for embeddings"""
    chunks = []
    text_length = len(text)
    
    if text_length <= chunk_size:
        return [{"text": text, "chunk_index": 0, "total_chunks": 1}]
    
    start = 0
    chunk_index = 0
    
    while start < text_length:
        end = min(start + chunk_size, text_length)
        
        # Try to break at sentence boundary
        if end < text_length:
            # Look for sentence end
            last_period = text.rfind('.', start, end)
            if last_period > start + chunk_size // 2:  # Only if we're past halfway
                end = last_period + 1
        
        chunk = text[start:end].strip()
        if chunk:
            chunks.append({
                "text": chunk,
                "chunk_index": chunk_index,
                "start_char": start,
                "end_char": end
            })
            chunk_index += 1
        
        start = end - overlap if end < text_length else end
    
    # Add total chunks to each chunk
    for chunk in chunks:
        chunk["total_chunks"] = len(chunks)
    
    return chunks

def normalize_url(url: str) -> str:
    """Normalize URL for consistent comparison"""
    # Remove fragment and trailing slash
    normalized = url.split('#')[0].rstrip('/')
    # Remove common query parameters that don't affect content
    if '?' in normalized:
        base, query = normalized.split('?', 1)
        # Keep query params that might affect content (like course codes)
        important_params = []
        for param in query.split('&'):
            if '=' in param:
                key, value = param.split('=', 1)
                if key.lower() in ['id', 'code', 'course', 'program']:
                    important_params.append(param)
        if important_params:
            normalized = base + '?' + '&'.join(important_params)
        else:
            normalized = base
    return normalized

def is_course_code_url(url: str) -> bool:
    """Check if URL contains a course code pattern"""
    url_lower = url.lower()
    return any(re.search(pattern, url_lower) for pattern in course_specific_patterns)

def is_relevant_url(url: str, category_data: Dict) -> bool:
    """Check if URL is relevant to the category using patterns and keywords"""
    parsed = urlparse(url)
    
    # Basic validation
    if not parsed.scheme or not parsed.netloc:
        return False
    if not parsed.netloc.endswith("rmit.edu.au"):
        return False
    
    # Remove fragment and clean the URL for analysis
    clean_url = url.split('#')[0].split('?')[0]
    
    # Skip actual file downloads
    actual_file_extensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar', 
                             '.jpg', '.jpeg', '.png', '.gif', '.svg', '.mp4', '.mp3']
    if any(clean_url.lower().endswith(ext) for ext in actual_file_extensions):
        return False
    
    url_lower = clean_url.lower()
    
    # Check master include patterns first
    if any(pattern in url_lower for pattern in master_include_patterns):
        return True
    
    # Check if it's a course code URL (high priority)
    if is_course_code_url(url):
        return True
    
    # Check URL patterns for this category
    if any(pattern in url_lower for pattern in category_data["url_patterns"]):
        return True
    
    # Check full URL (including domain parts) against keywords
    full_url_text = url_lower.replace('/', ' ').replace('-', ' ').replace('_', ' ')
    if any(keyword.lower() in full_url_text for keyword in category_data["keywords"]):
        return True
    
    # Check path components against keywords
    parsed_clean = urlparse(clean_url)
    path_components = [comp for comp in parsed_clean.path.split('/') if comp]
    path_text = ' '.join(path_components).lower().replace('-', ' ').replace('_', ' ')
    if any(keyword.lower() in path_text for keyword in category_data["keywords"]):
        return True
    
    return False

def check_robots_txt(domain: str) -> Dict[str, any]:
    """Check robots.txt for crawling permissions"""
    robots_url = f"https://{domain}/robots.txt"
    allowed_paths = []
    disallowed_paths = []
    crawl_delay = 0
    
    try:
        response = requests.get(robots_url, timeout=10)
        if response.status_code == 200:
            lines = response.text.split('\n')
            user_agent_applies = False
            
            for line in lines:
                line = line.strip()
                if line.startswith('User-agent:'):
                    # Check if rules apply to our crawler
                    agent = line.split(':', 1)[1].strip()
                    user_agent_applies = agent == '*' or 'bot' in agent.lower()
                elif user_agent_applies:
                    if line.startswith('Disallow:'):
                        path = line.split(':', 1)[1].strip()
                        if path:
                            disallowed_paths.append(path)
                    elif line.startswith('Allow:'):
                        path = line.split(':', 1)[1].strip()
                        if path:
                            allowed_paths.append(path)
                    elif line.startswith('Crawl-delay:'):
                        try:
                            crawl_delay = float(line.split(':', 1)[1].strip())
                        except:
                            pass
            
            logger.info(f"Checked robots.txt - found {len(disallowed_paths)} disallowed paths")
            if crawl_delay > 0:
                logger.info(f"Recommended crawl delay: {crawl_delay} seconds")
    except:
        logger.warning("Could not fetch robots.txt - proceeding with caution")
    
    return {
        'allowed': allowed_paths,
        'disallowed': disallowed_paths,
        'crawl_delay': crawl_delay
    }

def crawl_for_links(start_url: str, category_data: Dict, state: ScraperState, 
                   max_depth: int = 4, delay: float = 0.5, max_urls: int = 500) -> List[str]:
    """Crawl for all relevant links starting from a URL"""
    visited = set()
    to_visit = [(start_url, 0)]  # (url, depth)
    all_relevant_urls = []
    
    # Add URL limits and progress tracking
    start_time = time.time()
    urls_found_at_depth = {i: 0 for i in range(max_depth + 1)}
    
    while to_visit and len(all_relevant_urls) < max_urls:
        current_url, depth = to_visit.pop(0)
        
        # Normalize the URL
        normalized = normalize_url(current_url)
        
        # Skip if already visited or depth exceeded
        if normalized in visited or depth > max_depth:
            continue
            
        visited.add(normalized)
        
        # Check if URL is relevant
        if not is_relevant_url(current_url, category_data):
            continue
        
        # Check if we need to re-scrape (incremental mode)
        if CONFIG["incremental_mode"] and normalized in state.state["scraped_urls"]:
            last_scraped = state.state["scraped_urls"][normalized]
            logger.info(f"  URL previously scraped on {last_scraped}: {current_url}")
            # Still add to list for content change detection
        
        all_relevant_urls.append(current_url)
        logger.info(f"  Found relevant URL (depth {depth}): {current_url}")
        
        # Only crawl deeper if we haven't exceeded max depth
        if depth < max_depth:
            try:
                # Rate limiting
                time.sleep(delay)
                
                headers = {'User-Agent': CONFIG["user_agent"]}
                response = requests.get(current_url, headers=headers, timeout=CONFIG["timeout"])
                response.raise_for_status()
                
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Find all links
                for a_tag in soup.find_all('a', href=True):
                    href = a_tag['href']
                    absolute_url = urljoin(current_url, href)
                    normalized_new = normalize_url(absolute_url)
                    
                    # Only add if not visited
                    if normalized_new not in visited:
                        # Prioritize course-related URLs
                        if is_course_code_url(absolute_url) or any(
                            pattern in absolute_url.lower() 
                            for pattern in ["/levels-of-study/", "/course/", "/program/"]
                        ):
                            # Add to front of queue for priority processing
                            to_visit.insert(0, (absolute_url, depth + 1))
                        else:
                            to_visit.append((absolute_url, depth + 1))
                
            except Exception as e:
                logger.error(f"Error crawling {current_url}: {e}")
    
    logger.info(f"Total unique relevant URLs found: {len(all_relevant_urls)}")
    return all_relevant_urls

def is_relevant_content(content: List[Tuple[str, str]], category_data: Dict) -> bool:
    """Check if content is relevant to the category using keywords"""
    combined_text = ' '.join([text for _, text in content]).lower()
    
    # For course information, be more lenient
    if category_data.get("url") and "study-with-us" in category_data["url"]:
        # Look for course-specific indicators
        course_indicators = [
            'course', 'program', 'degree', 'study', 'qualification', 'career',
            'prerequisite', 'admission', 'duration', 'fees', 'structure',
            'credit', 'subject', 'unit', 'semester', 'pathway', 'graduate'
        ]
        
        course_matches = sum(
            1 for indicator in course_indicators 
            if re.search(r'\b' + re.escape(indicator.lower()) + r'\b', combined_text)
        )
        
        if course_matches >= 2:
            return True
    
    # Count keyword matches (whole words only)
    keyword_matches = sum(
        1 for keyword in category_data["keywords"] 
        if re.search(r'\b' + re.escape(keyword.lower()) + r'\b', combined_text)
    )
    
    # Consider content relevant if at least 2 keyword matches found
    return keyword_matches >= 2

def clean_and_extract_content(soup: BeautifulSoup, page_name: str) -> List[Tuple[str, str]]:
    """Extract meaningful content from the soup object"""
    
    # Remove unwanted elements
    unwanted_selectors = [
        'script', 'style', 'nav', 'header', 'footer', 'aside',
        '.nav', '.navigation', '.menu', '.breadcrumb', '.sidebar',
        '.header', '.footer', '.banner', '.social', '.share',
        '[class*="nav"]', '[class*="menu"]', '[class*="breadcrumb"]',
        '[id*="nav"]', '[id*="menu"]', '[class*="skip"]',
        '.cookie-banner', '.popup', '.modal', '.alert',
        '[class*="cookie"]', '[class*="popup"]', '[class*="banner"]'
    ]
    
    for selector in unwanted_selectors:
        for element in soup.select(selector):
            element.decompose()
    
    # Find the main content area
    content_areas = []
    
    # Try different content selectors in order of preference
    content_selectors = [
        'main',
        '[role="main"]',
        '.main-content',
        '.page-content',
        '.content-area',
        '.course-content',
        '.program-content',
        'article',
        '.container .row',
        '.content',
        '.study-area',
        '.course-details'
    ]
    
    for selector in content_selectors:
        elements = soup.select(selector)
        if elements:
            content_areas.extend(elements)
            break
    
    # If no specific content area found, look for divs with substantial text
    if not content_areas:
        all_divs = soup.find_all('div')
        for div in all_divs:
            text = div.get_text(strip=True)
            if len(text) > 200:
                content_areas.append(div)
        
        # Sort by text length and take the largest ones
        content_areas.sort(key=lambda x: len(x.get_text(strip=True)), reverse=True)
        content_areas = content_areas[:5]
    
    # Extract structured content
    structured_content = []
    
    for area in content_areas:
        # Find tables first (often contain important course data)
        tables = area.find_all('table')
        for table in tables:
            # Extract table headers
            headers = []
            header_row = table.find('thead')
            if header_row:
                headers = [th.get_text(strip=True) for th in header_row.find_all(['th', 'td'])]
            
            # Extract table rows
            for row in table.find_all('tr'):
                cells = row.find_all(['td', 'th'])
                row_text = ' | '.join([cell.get_text(strip=True) for cell in cells])
                if row_text and len(row_text) > 5:
                    structured_content.append(('paragraph', row_text))
        
        # Find headings and paragraphs
        elements = area.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'li', 'td', 'dt', 'dd', 'span'])
        
        for element in elements:
            text = element.get_text(strip=True)
            
            # Skip if text is too short
            if len(text) < 5:
                continue
                
            # Skip common navigation phrases
            nav_phrases = [
                'skip to content', 'search', 'menu', 'home', 'about', 'contact',
                'login', 'register', 'sign in', 'sign up', 'copyright', '©',
                'facebook', 'twitter', 'linkedin', 'instagram', 'youtube'
            ]
            
            if any(phrase in text.lower() for phrase in nav_phrases):
                continue
            
            # Skip if text is mostly repeated characters or numbers
            if len(set(text.replace(' ', ''))) < 3:
                continue
            
            # Determine if it's a heading
            tag_name = element.name.lower()
            if tag_name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                structured_content.append(('heading', text))
            elif len(text) < 100 and (text.isupper() or element.get('class') and any('heading' in str(cls) for cls in element.get('class'))):
                structured_content.append(('heading', text))
            else:
                structured_content.append(('paragraph', text))
    
    # Remove duplicates while preserving order
    seen = set()
    unique_content = []
    for content_type, text in structured_content:
        if text not in seen:
            seen.add(text)
            unique_content.append((content_type, text))
    
    return unique_content

def extract_structured_data(content_items: List[Tuple[str, str]], url: str, category_data: Dict) -> Dict:
    """Extract structured course data using advanced patterns"""
    structured_data = {}
    full_text = ' '.join([text for _, text in content_items])
    
    # Try to extract course code from URL first
    course_code_match = re.search(r'([a-z]+\d+)', url.lower())
    if course_code_match:
        code = course_code_match.group(1).upper()
        is_valid, validated_code = validate_field("course_code", code)
        if is_valid:
            structured_data['course_code'] = validated_code
    
    # Extract using category-specific rules
    if "extraction_rules" in category_data:
        for field, patterns in category_data["extraction_rules"].items():
            for pattern in patterns:
                matches = re.findall(pattern, full_text, re.IGNORECASE | re.MULTILINE)
                if matches:
                    # Clean and store the first match
                    value = matches[0].strip()
                    if len(value) > 10:  # Reasonable length
                        structured_data[field] = value
                    break
    
    # Standard field extraction with validation
    extraction_patterns = {
        "duration": [
            r'duration[:\s]+(\d+(?:\.\d+)?\s*(?:year|month|week|day)s?)',
            r'(\d+(?:\.\d+)?\s*(?:year|month|week|day)s?)\s*(?:full|part)[- ]?time',
            r'length[:\s]+(\d+(?:\.\d+)?\s*(?:year|month|week|day|semester)s?)',
            r'(\d+\s*-\s*\d+\s*(?:months|years))',  # 1-2 years
            r'(full-time|part-time)\s*(\d+)\s*(months|years)'  # full-time 2 years
        ],
        "fees": [
            r'fees?[:\s]+\$?\s*([\d,]+(?:\.\d{2})?)',  # $12,345.67
            r'tuition[:\s]+\$?\s*([\d,]+(?:\.\d{2})?)',  # Tuition: $32,000
            r'\$?\s*([\d,]+(?:\.\d{2})?)\s*per\s*(?:year|semester|course)',  # 15,500 per year
            r'annual\s*fee[:\s]+\$?\s*([\d,]+(?:\.\d{2})?)',  # Annual fee: $32,000
            r'[A-Z]{3}\s*\$?\s*([\d,]+(?:\.\d{2})?)'  # AUD 32,000
        ],
        "credit_points": [
            r'(\d+)\s*credit\s*points?',
            r'credit\s*points?[:\s]+(\d+)',
            r'total\s*credits?[:\s]+(\d+)',
            r'cp[:\s]+(\d+)',  # Added CP abbreviation
            r'points[:\s]+(\d+)'  # More generic
        ],
        "atar": [
            r'atar[:\s]+(\d{1,2}(?:\.\d{1,2})?)',
            r'selection\s*rank[:\s]+(\d{1,2}(?:\.\d{1,2})?)',
            r'minimum\s*atar[:\s]+(\d{1,2}(?:\.\d{1,2})?)'
        ],
        "campus": [
            r'campus(?:es)?[:\s]+([^.;]+)',
            r'location[s]?[:\s]+([^.;]+)',
            r'delivered\s*at[:\s]+([^.;]+)'
        ],
        "intake": [
            r'intake[s]?[:\s]+([^.;]+)',
            r'start[s]?\s*date[s]?[:\s]+([^.;]+)',
            r'commence[s]?[:\s]+([^.;]+)'
        ]
    }
    
    for field, patterns in extraction_patterns.items():
        if field not in structured_data:  # Don't overwrite existing data
            for pattern in patterns:
                match = re.search(pattern, full_text, re.IGNORECASE)
                if match:
                    value = match.group(1).strip()
                    # Validate if validation rules exist
                    if field in VALIDATION_PATTERNS:
                        is_valid, validated_value = validate_field(field, value)
                        if is_valid and validated_value:
                            structured_data[field] = validated_value
                            break
                    else:
                        structured_data[field] = value
                        break
    
    # Extract subjects/units if present
    subject_patterns = [
        r'(?:core|compulsory)\s*(?:subject|unit)s?[:\s]+([^.]+)',
        r'(?:elective|optional)\s*(?:subject|unit)s?[:\s]+([^.]+)'
    ]
    
    subjects = []
    for pattern in subject_patterns:
        matches = re.findall(pattern, full_text, re.IGNORECASE)
        for match in matches:
            # Split by common delimiters
            items = re.split(r'[,;•·]|\n', match)
            subjects.extend([item.strip() for item in items if len(item.strip()) > 3])
    
    if subjects:
        structured_data['subjects'] = list(set(subjects))[:20]  # Limit to 20 subjects
    
    return structured_data

def save_chunks(page_data: Dict, category_name: str, page_index: int):
    """Save page content as chunks for embedding"""
    chunks_dir = Path(f"{CONFIG['output_dir']}/chunks/{category_name}")
    chunks_dir.mkdir(exist_ok=True)
    
    # Create full text from sections
    full_text = page_data.get("full_text", "")
    
    # Generate chunks
    chunks = chunk_text(full_text, CONFIG["chunk_size"], CONFIG["chunk_overlap"])
    
    # Save chunks with metadata
    for chunk in chunks:
        chunk_data = {
            "page_title": page_data["title"],
            "page_url": page_data["url"],
            "page_index": page_index,
            "chunk_index": chunk["chunk_index"],
            "total_chunks": chunk["total_chunks"],
            "text": chunk["text"],
            "structured_data": page_data.get("structured_data", {}),
            "metadata": {
                "start_char": chunk.get("start_char"),
                "end_char": chunk.get("end_char"),
                "category": category_name
            }
        }
        
        # Save individual chunk file
        chunk_filename = f"page_{page_index:04d}_chunk_{chunk['chunk_index']:03d}.json"
        chunk_path = chunks_dir / chunk_filename
        
        with open(chunk_path, 'w', encoding='utf-8') as f:
            json.dump(chunk_data, f, ensure_ascii=False, indent=2)

def save_as_json(all_content: List[Tuple[str, List[Tuple[str, str]], str]], 
                 category_name: str, category_data: Dict, metadata: Dict = None) -> Path:
    """Save content as JSON for AI consumption with chunking"""
    json_data = {
        "category": category_name,
        "scrape_date": datetime.now().isoformat(),
        "total_pages": len(all_content),
        "metadata": metadata or {},
        "pages": []
    }
    
    for page_index, (page_title, content_items, url) in enumerate(all_content):
        page_data = {
            "title": page_title,
            "url": url,
            "content_sections": [],
            "structured_data": {}
        }
        
        # Extract structured data with validation
        page_data["structured_data"] = extract_structured_data(content_items, url, category_data)
        
        # Group content by sections
        current_section = {"heading": None, "paragraphs": []}
        
        for content_type, text in content_items:
            # Clean text for AI processing
            cleaned_text = ' '.join(text.split())  # Normalize whitespace
            
            if content_type == 'heading':
                # Save previous section if it has content
                if current_section["paragraphs"]:
                    page_data["content_sections"].append(current_section)
                current_section = {"heading": cleaned_text, "paragraphs": []}
            else:
                current_section["paragraphs"].append(cleaned_text)
        
        # Don't forget the last section
        if current_section["paragraphs"] or current_section["heading"]:
            page_data["content_sections"].append(current_section)
        
        # FIXED: Add full text for easy searching - safely handles None values
        full_text_parts = []
        for section in page_data["content_sections"]:
            heading = section.get("heading") or ""  # Convert None to empty string
            paragraphs = " ".join(section.get("paragraphs", []))
            full_text_parts.append(f"{heading} {paragraphs}".strip())
        
        page_data["full_text"] = " ".join(full_text_parts)
        
        # Save chunks for this page
        save_chunks(page_data, category_name, page_index)
        
        json_data["pages"].append(page_data)
    
    # Add validation summary to metadata
    if CONFIG["validate_data"]:
        validation_summary = {
            "total_validated_fields": sum(
                len(page.get("structured_data", {})) 
                for page in json_data["pages"]
            ),
            "pages_with_course_codes": sum(
                1 for page in json_data["pages"] 
                if "course_code" in page.get("structured_data", {})
            ),
            "pages_with_fees": sum(
                1 for page in json_data["pages"] 
                if "fees" in page.get("structured_data", {})
            ),
            "pages_with_duration": sum(
                1 for page in json_data["pages"] 
                if "duration" in page.get("structured_data", {})
            )
        }
        json_data["metadata"]["validation_summary"] = validation_summary
    
    # Save main JSON file
    safe_name = re.sub(r'[\\/*?:"<>|]', "_", category_name)
    json_path = Path(f"{CONFIG['output_dir']}/{safe_name}.json")
    
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)
    
    logger.info(f"Saved JSON for AI: {json_path}")
    
    # Save minified version
    minified_path = Path(f"{CONFIG['output_dir']}/{safe_name}_min.json")
    with open(minified_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, ensure_ascii=False, separators=(',', ':'))
    
    logger.info(f"Saved minified JSON: {minified_path}")
    
    # Save metadata file
    meta_path = Path(f"{CONFIG['output_dir']}/{safe_name}_metadata.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({
            "category": category_name,
            "scrape_date": json_data["scrape_date"],
            "statistics": json_data["metadata"],
            "config_used": CONFIG,
            "total_chunks": sum(len(chunk_text(page["full_text"], CONFIG["chunk_size"], CONFIG["chunk_overlap"])) 
                              for page in json_data["pages"])
        }, f, ensure_ascii=False, indent=2)
    
    return json_path

def retry_request(url: str, headers: Dict, max_retries: int = 3) -> Optional[requests.Response]:
    """Retry failed requests with exponential backoff and handle 404s"""
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=headers, timeout=CONFIG["timeout"])
            
            # Handle 404 specifically
            if response.status_code == 404:
                logger.warning(f"URL not found (404): {url}")
                return None
                
            response.raise_for_status()
            return response
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                logger.warning(f"URL not found (404): {url}")
                return None
            elif attempt == max_retries - 1:
                raise
        except requests.exceptions.RequestException as e:
            if attempt == max_retries - 1:
                raise
                
        wait_time = 2 ** attempt  # Exponential backoff
        logger.warning(f"Request failed (attempt {attempt+1}/{max_retries}), retrying in {wait_time}s: {e}")
        time.sleep(wait_time)
    return None

def process_category(category_name: str, category_data: Dict, state: ScraperState, crawl_delay: float = 0.5):
    """Process a category and save as JSON for AI consumption"""
    logger.info(f"\nProcessing category: {category_name}")
    logger.info(f"Starting at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    all_content = []
    processed_urls = set()  # Track URLs we've actually processed content from
    errors = []  # Track errors for debugging
    skipped_unchanged = 0  # Track unchanged content

    main_url = category_data["url"]
    
    # Crawl for all relevant URLs
    logger.info("Starting crawl for relevant URLs...")
    max_depth = CONFIG["max_crawl_depth"] if CONFIG["focused_mode"] else 5
    max_urls = CONFIG["max_urls_per_category"] if CONFIG["focused_mode"] else 800
    
    urls_to_process = crawl_for_links(
        main_url, 
        category_data, 
        state, 
        max_depth=max_depth,
        delay=crawl_delay,
        max_urls=max_urls
    )
    
    # Sort URLs to process course codes last (they tend to have the most detailed info)
    urls_to_process.sort(key=lambda x: (is_course_code_url(x), x))
    
    for i, url in enumerate(urls_to_process):
        # Normalize URL for tracking
        normalized = normalize_url(url)
        
        # Skip if we've already processed this URL's content
        if normalized in processed_urls:
            logger.info(f"  Skipping duplicate ({i+1}/{len(urls_to_process)}): {url}")
            continue
            
        logger.info(f"  Processing ({i+1}/{len(urls_to_process)}): {url}")
        processed_urls.add(normalized)
        
        try:
            # Rate limiting
            time.sleep(crawl_delay)
            
            headers = {'User-Agent': CONFIG["user_agent"]}
            response = retry_request(url, headers, CONFIG["max_retries"])
            
            if not response:
                raise Exception("Failed after all retries")
            
            # Check if content has changed (incremental mode)
            content_text = response.text
            if CONFIG["incremental_mode"] and not state.is_content_changed(url, content_text):
                logger.info(f"    ✗ Content unchanged, skipping")
                skipped_unchanged += 1
                continue
            
            soup = BeautifulSoup(content_text, 'html.parser')
            
            # Create a page title
            if url == main_url:
                page_title = category_name.replace('-', ' ').title()
            else:
                # Better title extraction for course pages
                title_tag = soup.find('title')
                if title_tag and title_tag.text.strip():
                    page_title = title_tag.text.strip()
                    # Clean RMIT suffix if present
                    page_title = re.sub(r'\s*[-|]\s*RMIT University.*$', '', page_title)
                else:
                    parsed_url = urlparse(url)
                    path_parts = [comp for comp in parsed_url.path.strip('/').split('/') if comp]
                    if path_parts:
                        # Check if last part is a course code
                        if re.search(r'[a-z]\d+', path_parts[-1]):
                            page_title = f"Course: {path_parts[-1].upper()}"
                        else:
                            page_title = ' '.join([comp.replace('-', ' ').title() for comp in path_parts[-2:]])
                    else:
                        page_title = "Additional Information"
            
            # Extract content
            content_items = clean_and_extract_content(soup, page_title)
            
            # Check if content is relevant
            if content_items and (is_relevant_content(content_items, category_data) or len(content_items) >= 5):
                # Store with URL for reference
                all_content.append((page_title, content_items, url))
                
                # Update state
                state.update_content_hash(url, content_text)
                state.mark_url_scraped(url)
                
                logger.info(f"    ✓ Added content ({len(content_items)} items)")
            else:
                logger.info(f"    ✗ Excluded - not relevant enough ({len(content_items)} items)")
            
        except requests.exceptions.RequestException as e:
            error_msg = f"Network error for {url}: {str(e)}"
            logger.error(f"    ✗ {error_msg}")
            errors.append(error_msg)
        except Exception as e:
            error_msg = f"Processing error for {url}: {str(e)}"
            logger.error(f"    ✗ {error_msg}")
            errors.append(error_msg)
    
    if not all_content:
        logger.warning(f"No relevant content found for category {category_name}")
        return
    
    logger.info(f"\nSummary:")
    logger.info(f"  Total pages with content: {len(all_content)}")
    logger.info(f"  Total URLs processed: {len(processed_urls)}")
    logger.info(f"  Unchanged content skipped: {skipped_unchanged}")
    logger.info(f"  Total errors: {len(errors)}")
    
    # Save as JSON for AI consumption
    metadata = {
        "total_urls_found": len(urls_to_process),
        "urls_processed": len(processed_urls),
        "pages_with_content": len(all_content),
        "unchanged_skipped": skipped_unchanged,
        "errors": len(errors),
        "error_details": errors[:10],  # First 10 errors for debugging
        "crawl_delay_used": crawl_delay,
        "incremental_mode": CONFIG["incremental_mode"],
        "validation_enabled": CONFIG["validate_data"]
    }
    
    json_path = save_as_json(all_content, category_name, category_data, metadata)
    
    # Save state
    state.save_state()
    
    logger.info(f"\nCompleted processing {category_name}")
    logger.info(f"Data saved for AI knowledge base at: {json_path}")

def generate_summary_report():
    """Generate a summary report of all scraped data"""
    output_dir = Path(CONFIG["output_dir"])
    report = {
        "generated_at": datetime.now().isoformat(),
        "categories": {}
    }
    
    # Analyze each category file
    for json_file in output_dir.glob("*.json"):
        if json_file.name.endswith("_min.json") or json_file.name.endswith("_metadata.json"):
            continue
            
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            category_name = data.get("category", json_file.stem)
            report["categories"][category_name] = {
                "total_pages": data.get("total_pages", 0),
                "scrape_date": data.get("scrape_date"),
                "courses_found": sum(1 for page in data.get("pages", []) 
                                   if "course_code" in page.get("structured_data", {})),
                "sample_courses": [
                    {
                        "title": page["title"],
                        "code": page["structured_data"].get("course_code"),
                        "duration": page["structured_data"].get("duration"),
                        "fees": page["structured_data"].get("fees")
                    }
                    for page in data.get("pages", [])[:5]
                    if "course_code" in page.get("structured_data", {})
                ]
            }
        except Exception as e:
            logger.error(f"Error processing {json_file}: {e}")
    
    # Save report
    report_path = output_dir / "scraping_summary.json"
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    
    logger.info(f"\nGenerated summary report: {report_path}")

# Main execution
if __name__ == "__main__":
    print("""
╔═══════════════════════════════════════════════════════════════╗
║        RMIT Course Information Scraper for AI Knowledge Base   ║
║                    Advanced Version with:                      ║
║    • Incremental Updates  • Data Validation  • Chunking       ║
╚═══════════════════════════════════════════════════════════════╝
    """)
    
    # Initialize state management
    state = ScraperState(CONFIG["state_file"])
    
    if CONFIG["incremental_mode"] and state.state["last_run"]:
        logger.info(f"Last run: {state.state['last_run']}")
        logger.info(f"Previously scraped URLs: {len(state.state['scraped_urls'])}")
    
    # Check robots.txt before processing
    logger.info("\nChecking robots.txt compliance...")
    robots_info = check_robots_txt("www.rmit.edu.au")
    recommended_delay = max(0.5, robots_info.get('crawl_delay', 0.5))
    
    logger.info(f"\nUsing crawl delay: {recommended_delay} seconds")
    
    # Process each category
    for name, data in base_urls.items():
        try:
            process_category(name, data, state, recommended_delay)
        except KeyboardInterrupt:
            logger.warning("\nScraping interrupted by user")
            state.save_state()
            break
        except Exception as e:
            logger.error(f"Error processing category {name}: {e}")
    
    # Generate summary report
    generate_summary_report()
    
    print("\n" + "="*60)
    print("SCRAPING COMPLETED!")
    print("="*60)
    print(f"\nOutput directory: {CONFIG['output_dir']}/")
    print("\nFiles created:")
    print("  • Main JSON files (formatted for readability)")
    print("  • Minified JSON files (for production)")
    print("  • Metadata files (scraping statistics)")
    print("  • Chunk files (for embeddings)")
    print("  • Summary report (scraping_summary.json)")
    print("\nFeatures used:")
    print(f"  • Incremental updates: {'✓' if CONFIG['incremental_mode'] else '✗'}")
    print(f"  • Data validation: {'✓' if CONFIG['validate_data'] else '✗'}")
    print(f"  • Chunking for embeddings: ✓ (size: {CONFIG['chunk_size']})")
    print("\n" + "="*60)