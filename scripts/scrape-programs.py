import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import json
import re
import time
from datetime import datetime

# ---- Configuration ----
INPUT_FILE   = "C:/Users/garv1/Desktop/chatbot/AIChatBot/programs_url.txt"
OUTPUT_FILE  = "C:/Users/garv1/Desktop/chatbot/AIChatBot/rmit_knowledge_base/programs_data.json"
MAX_WORKERS  = 5
RATE_LIMIT   = 0.2    # seconds between requests per thread
TIMEOUT      = 30     # seconds per HTTP request
USER_AGENT   = "RMIT Program Details Scraper"
# ------------------------

def load_program_urls(filepath: str):
    """
    Read one URL per line from the file, skip blanks/comments,
    parse the trailing '-<code>' as the program code.
    """
    programs = []
    # matches e.g. "-bp250" or "-MC001"
    pattern = re.compile(r'-([A-Za-z]{2}\d{2,3})$')
    for lineno, raw in enumerate(Path(filepath).read_text(encoding="utf-8").splitlines(), start=1):
        url = raw.strip()
        if not url or url.startswith("#"):
            continue
        m = pattern.search(url)
        if not m:
            print(f"⚠️ Skipping line {lineno}: cannot extract code from `{url}`")
            continue
        code = m.group(1).upper()
        programs.append({"code": code, "url": url})
    return programs

def clean_text(text: str) -> str:
    return re.sub(r'\s+', ' ', text or '').strip()

def extract_section(soup: BeautifulSoup, header_regex: re.Pattern):
    """Grab the text under the first matching header until the next header."""
    header = soup.find(lambda tag:
                       tag.name in ["h1","h2","h3","strong"] and header_regex.search(tag.get_text()))
    if not header:
        return None
    parts = []
    sib = header.find_next_sibling()
    while sib and sib.name not in ["h1","h2","h3","strong"]:
        txt = sib.get_text(separator=" ", strip=True)
        if txt:
            parts.append(txt)
        sib = sib.find_next_sibling()
    return clean_text(" ".join(parts)) or None

def normalize_url(url: str) -> str:
    """
    Auto-correct common typos in the RMIT program URLs:
    - fix 'bacheelor-degrees' -> 'bachelor-degrees'
    - collapse duplicated suffixes like '-bp221-bp221' -> '-bp221'
    """
    url = url.replace("bacheelor-degrees", "bachelor-degrees")
    # if the last segment repeats, e.g. "...-bp221-bp221", reduce to single
    url = re.sub(r"(-[A-Za-z]{2}\d{2,3})-\1$", r"\1", url, flags=re.IGNORECASE)
    return url

def scrape_program(program):
    code, raw_url = program["code"], program["url"]
    url = normalize_url(raw_url)
    try:
        time.sleep(RATE_LIMIT)
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Title
        title_el = soup.select_one("h1.program-summary__heading")
        title = clean_text(title_el.get_text()) if title_el else None

        # Level inference
        if code.startswith("BP"):
            level = "BACHELOR"
        elif code.startswith("MC"):
            level = "MASTER"
        elif code.startswith("DR"):
            level = "DOCTORATE"
        else:
            level = "OTHER"

        # Duration (e.g. "3 years full-time")
        dm = re.search(r'(\d+\s+years?.*?)(?:\||$)', resp.text, re.IGNORECASE)
        duration = clean_text(dm.group(1)) if dm else None

        # Delivery modes
        txt = resp.text.lower()
        modes = []
        for key, label in [("online","ONLINE"),("on campus","ON_CAMPUS"),
                           ("face-to-face","ON_CAMPUS"),("blended","BLENDED"),("hybrid","BLENDED")]:
            if key in txt and label not in modes:
                modes.append(label)
        if not modes:
            modes = ["ON_CAMPUS"]

        # Campus list
        campuses = []
        for camp in ["Melbourne City","Bundoora","Brunswick","Online","Vietnam"]:
            if camp.lower() in txt:
                campuses.append(camp)
        if not campuses:
            campuses = ["Melbourne City"]

        # RAG sections
        description       = extract_section(soup, re.compile(r'description|overview', re.I))
        careerOutcomes    = extract_section(soup, re.compile(r'career outcomes?|employment', re.I))
        entryRequirements = extract_section(soup, re.compile(r'(entry|admission) requirements?', re.I))
        fees              = extract_section(soup, re.compile(r'\bfee\b', re.I))

        # Coordinator email & phone
        full_text = soup.get_text(" ", strip=True)
        email_m = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', full_text)
        phone_m = re.search(r'Phone[:\s]*([\d\-\+\s\(\)]{7,})', full_text)
        coordinatorEmail = email_m.group(0) if email_m else None
        coordinatorPhone = clean_text(phone_m.group(1)) if phone_m else None

        # Name just before the email if present
        coordinatorName = None
        if email_m:
            snippet = full_text[:email_m.start()]
            names = re.findall(r'([A-Z][a-z]+(?: [A-Z][a-z]+)+)\s*$', snippet)
            if names:
                coordinatorName = names[-1]

        now = datetime.utcnow().isoformat()
        return {
            # omit `id` so Prisma generates its cuid()
            "code": code,
            "title": title,
            "level": level,
            "duration": duration,
            "deliveryMode": modes,
            "campus": campuses,
            "description": description,
            "careerOutcomes": careerOutcomes,
            "entryRequirements": entryRequirements,
            "fees": fees,
            "coordinatorName": coordinatorName,
            "coordinatorEmail": coordinatorEmail,
            "coordinatorPhone": coordinatorPhone,
            "structuredData": None,
            "tags": [],
            "schoolId": None,
            "sourceUrl": url,
            "embedding": None,
            "isActive": True,
            "createdAt": now,
            "updatedAt": now
        }

    except Exception as e:
        print(f"✗ Failed {code} @ {url}: {e}")
        return None

def main():
    programs = load_program_urls(INPUT_FILE)
    print(f"🔎 Loaded {len(programs)} program URLs.")
    results = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(scrape_program, p): p for p in programs}
        for future in as_completed(futures):
            res = future.result()
            if res:
                results.append(res)

    # Write out JSON
    out_path = Path(OUTPUT_FILE)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Scraped {len(results)} programs → {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
