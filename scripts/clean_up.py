import json

INPUT_FILE = 'academic_information.json'
OUTPUT_FILE = 'academic_information_cleaned.json'

UNWANTED_PATTERNS = [
    "SKIP TO",
    "Skip to content",
    "CONTENT RMIT Australia R",
    "CONTENT RMIT Australia RMIT"
]

def should_remove(value: str) -> bool:
    return any(pattern in value for pattern in UNWANTED_PATTERNS)

def clean_data(obj):
    if isinstance(obj, dict):
        return {
            key: clean_data(val)
            for key, val in obj.items()
            if not (isinstance(val, str) and should_remove(val))
        }
    elif isinstance(obj, list):
        return [clean_data(item) for item in obj]
    else:
        return obj

def main():
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    cleaned_data = clean_data(data)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(cleaned_data, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    main()
