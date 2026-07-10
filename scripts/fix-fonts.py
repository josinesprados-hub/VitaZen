import re

path = '/home/z/my-project/scripts/audit-report.py'
with open(path, 'r') as f:
    content = f.read()

# Remove Tinos and Liberation font registrations
content = content.replace("pdfmetrics.registerFont(TFont('Tinos', f'{FONT_DIR}/truetype/english/Tinos-Regular.ttf'))", "")
content = content.replace("pdfmetrics.registerFont(TFont('Tinos-Bold', f'{FONT_DIR}/truetype/english/Tinos-Bold.ttf'))", "")
content = content.replace("pdfmetrics.registerFont(TFont('Tinos-Italic', f'{FONT_DIR}/truetype/english/Tinos-Italic.ttf'))", "")
content = content.replace("pdfmetrics.registerFont(TFont('Tinos-BoldItalic', f'{FONT_DIR}/truetype/english/Tinos-BoldItalic.ttf'))", "")
content = content.replace("registerFontFamily('Tinos', ...)", "")
content = content.replace("pdfmetrics.registerFont(TFont('LiberationSans', f'{FONT_DIR}/truetype/liberation/LiberationSans-Regular.ttf'))", "")
content = content.replace("pdfmetrics.registerFont(TFont('LiberationSans-Bold', f'{FONT_DIR}/truetype/liberation/LiberationSans-Bold.ttf'))", "")
content = content.replace("registerFontFamily('LiberationSans', normal='LiberationSans', bold='LiberationSans-Bold')", "")

# Add DejaVuSans registration
old = "pdfmetrics.registerFont(TFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSans.ttf'))\npdfmetrics.registerFont(TFont('DejaVuSans-Bold', f'{FONT_DIR}/truetype/dejavu/DejaVuSans-Bold.ttf'))\nregisterFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans-Bold')"
new = """pdfmetrics.registerFont(TFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TFont('DejaVuSans-Bold', f'{FONT_DIR}/truetype/dejavu/DejaVuSans-Bold.ttf'))
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans-Bold')"""

content = content.replace(old, new)

# Fix fontName references: NotoSansSC-Bold -> DejaVuSans-Bold
content = content.replace("fontName='NotoSansSC-Bold'", "fontName='DejaVuSans-Bold'")

# Replace Tinos fontName references with DejaVuSans
content = content.replace("fontName='Tinos'", "fontName='DejaVuSans'")
content = content.replace("fontName='Tinos-Bold'", "fontName='DejaVuSans-Bold'")
content = content.replace("fontName='Tinos-Italic'", "fontName='DejaVuSans'")  # italic mapping

with open(path, 'w') as f:
    f.write(content)
print('Fixed fonts successfully')