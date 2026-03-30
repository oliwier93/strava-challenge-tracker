"""Generate app icon: bold 'S' in Strava orange on dark background."""
from PIL import Image, ImageDraw, ImageFont

SIZE = 256
BG = (26, 26, 46)       # #1a1a2e
FG = (252, 76, 2)       # #fc4c02

img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Rounded rectangle background
draw.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=48, fill=BG)

# Try system fonts for a bold S
font = None
for name in ['arialbd.ttf', 'segoeui.ttf', 'calibrib.ttf', 'arial.ttf']:
    try:
        font = ImageFont.truetype(name, 190)
        break
    except OSError:
        continue

if not font:
    font = ImageFont.load_default()

# Center the S
bbox = draw.textbbox((0, 0), 'S', font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
x = (SIZE - tw) // 2 - bbox[0]
y = (SIZE - th) // 2 - bbox[1]

draw.text((x, y), 'S', fill=FG, font=font)

# Save as .ico with multiple sizes
img.save('icon.ico', format='ICO',
         sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# Also save PNG for reference
img.save('icon.png')

print(f'Created icon.ico and icon.png')
