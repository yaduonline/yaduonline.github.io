from pathlib import Path
import re

for p in Path('.').rglob('*.html'):
    if p.parts[0] == 'inc':
        continue
    text = p.read_text('utf-8')
    text = text.replace('&copy; 2024', '&copy; 2026').replace('&copy; 2025', '&copy; 2026')
    text, hcount = re.subn(r'<header>.*?</header>', '<div id="site-header"></div>', text, flags=re.DOTALL)
    text, fcount = re.subn(r'<footer>.*?</footer>', '<div id="site-footer"></div>\n    <script src="/inc/include.js"></script>', text, flags=re.DOTALL)
    if '<div id="site-header"></div>' not in text:
        text = re.sub(r'<body(.*?)>', r'<body\1>\n    <div id="site-header"></div>', text, flags=re.DOTALL, count=1)
    if '<div id="site-footer"></div>' not in text:
        text = re.sub(r'</body>', '    <div id="site-footer"></div>\n    <script src="/inc/include.js"></script>\n</body>', text, count=1)
    text = re.sub(r'<link\s+rel="stylesheet"\s+href="[^"]*style\.css"\s*>', '<link rel="stylesheet" href="/style.css">', text)
    p.write_text(text, 'utf-8')
    print(p, hcount, fcount)

print('done')