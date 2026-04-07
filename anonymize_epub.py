# A script to rewrite a copyrighted epub to keep the structure but remove
# all of the copyrighted text, replacing it with lorem ipsum.

import sys
import zipfile
import tempfile
import os
import re
import random

LOREM_WORDS = [
    "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
    "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
    "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud", "exercitation",
    "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo", "consequat",
    "duis", "aute", "irure", "in", "reprehenderit", "voluptate", "velit", "esse",
    "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint", "occaecat", "cupidatat",
    "non", "proident", "sunt", "culpa", "qui", "officia", "deserunt", "mollit", "anim", "id", "est", "laborum"
]

def generate_lorem_like(text):
    def replace_word(match):
        word = match.group(0)
        replacement = random.choice(LOREM_WORDS)
        if word.istitle():
            replacement = replacement.capitalize()
        elif word.isupper() and len(word) > 1:
            replacement = replacement.upper()
        return replacement

    return re.sub(r'[a-zA-Z]+', replace_word, text)

def anonymize_text_respecting_entities(text):
    parts = []
    last_end = 0
    # Match HTML/XML entities so we don't scramble them
    for match in re.finditer(r'&[a-zA-Z0-9#]+;', text):
        start = match.start()
        end = match.end()
        before = text[last_end:start]
        parts.append(generate_lorem_like(before))
        parts.append(match.group(0))
        last_end = end
    parts.append(generate_lorem_like(text[last_end:]))
    return "".join(parts)

def anonymize_html(html_str):
    parts = []
    last_end = 0
    in_style_or_script = False
    
    # Regex to robustly match tags, comments, CDATA, and processing instructions
    tag_pattern = re.compile(
        r'(?s)<!--.*?-->|'        # Comments
        r'<!\[CDATA\[.*?\]\]>|'   # CDATA
        r'<\?.*?\?>|'             # Processing instructions
        r'<[^>]+>'                # Regular tags
    )
    
    for match in tag_pattern.finditer(html_str):
        start = match.start()
        end = match.end()
        
        # Process text before the tag
        text = html_str[last_end:start]
        if text.strip() and not in_style_or_script:
            text = anonymize_text_respecting_entities(text)
            
        parts.append(text)
        
        # Determine if we're inside a style or script tag
        tag_content = match.group(0)
        parts.append(tag_content)
        
        tag_lower = tag_content.lower()
        if tag_lower.startswith('<style') or tag_lower.startswith('<script'):
            in_style_or_script = True
        elif tag_lower.startswith('</style') or tag_lower.startswith('</script'):
            in_style_or_script = False
            
        last_end = end
        
    # Process remaining text after the last tag
    text = html_str[last_end:]
    if text.strip() and not in_style_or_script:
        text = anonymize_text_respecting_entities(text)
    parts.append(text)
    
    return ''.join(parts)

def anonymize_epub(input_path, output_path):
    print(f"Anonymizing '{input_path}' -> '{output_path}'")
    with tempfile.TemporaryDirectory() as tmpdir:
        # Extract the EPUB
        with zipfile.ZipFile(input_path, 'r') as z:
            z.extractall(tmpdir)
            
        # Process all text-like files inside the EPUB
        for root, dirs, files in os.walk(tmpdir):
            for file in files:
                file_path = os.path.join(root, file)
                
                # HTML, XML, NCX (TOC), OPF (Metadata)
                if file.lower().endswith(('.html', '.xhtml', '.htm', '.xml', '.ncx', '.opf')):
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                    except UnicodeDecodeError:
                        try:
                            # Fallback if book isn't strictly utf-8
                            with open(file_path, 'r', encoding='latin-1') as f:
                                content = f.read()
                        except:
                            continue
                            
                    new_content = anonymize_html(content)
                        
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                        
        # Re-pack the EPUB
        mimetype_path = os.path.join(tmpdir, 'mimetype')
        with zipfile.ZipFile(output_path, 'w') as zout:
            # The 'mimetype' file must be first and uncompressed
            if os.path.exists(mimetype_path):
                zout.write(mimetype_path, 'mimetype', compress_type=zipfile.ZIP_STORED)
                
            for root, dirs, files in os.walk(tmpdir):
                for file in files:
                    file_path = os.path.join(root, file)
                    # Convert to forward slashes for EPUB internal paths
                    arcname = os.path.relpath(file_path, tmpdir).replace('\\', '/')
                    if arcname == 'mimetype':
                        continue
                    # Compress all other files
                    zout.write(file_path, arcname, compress_type=zipfile.ZIP_DEFLATED)
                    
    print(f"Successfully saved anonymized EPUB to '{output_path}'")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python anonymize_epub.py <input.epub> <output.epub>")
        sys.exit(1)
        
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    if not os.path.exists(input_file):
        print(f"Error: Input file '{input_file}' not found.")
        sys.exit(1)
        
    anonymize_epub(input_file, output_file)
