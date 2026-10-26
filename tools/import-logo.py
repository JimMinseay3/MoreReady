"""Prepare the supplied transparent wordmark for the renderer's CSS mask."""
from pathlib import Path
import sys
from PIL import Image

root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1])
image = Image.open(source).convert("RGBA")
# Ignore almost invisible export specks when finding the content bounds.
# Preserve every pixel inside the crop, including the original antialiasing.
bounds = image.getchannel("A").point(lambda alpha: 255 if alpha > 8 else 0).getbbox()
if bounds is None:
    raise ValueError("The supplied logo has no visible pixels")
left, top, right, bottom = bounds
bounds = (max(0, left - 2), max(0, top - 2),
          min(image.width, right + 2), min(image.height, bottom + 2))
output = root / "src" / "renderer" / "assets" / "moreready-logo.png"
output.parent.mkdir(parents=True, exist_ok=True)
image.crop(bounds).save(output)
print(f"Logo prepared: {output}, bounds={bounds}, size={right - left + 4}x{bottom - top + 4}")
