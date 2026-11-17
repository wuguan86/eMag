from pathlib import Path
from PIL import Image, ImageDraw

# 使用自制的几何包装箱图形，避免将平台商标误作扩展官方身份。
output = Path(__file__).resolve().parents[1] / "public" / "icons"
output.mkdir(parents=True, exist_ok=True)
for size in (16, 48, 128):
    scale = 4
    image = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    drawing = ImageDraw.Draw(image)
    dimension = size * scale
    drawing.rounded_rectangle((0, 0, dimension - 1, dimension - 1), radius=dimension * 0.22, fill="#1d4ed8")
    points = [(0.5, 0.19), (0.78, 0.35), (0.78, 0.65), (0.5, 0.82), (0.22, 0.65), (0.22, 0.35), (0.5, 0.19)]
    drawing.line([(int(x * dimension), int(y * dimension)) for x, y in points], fill="white", width=max(2, round(dimension * 0.055)), joint="curve")
    for start, end in [((0.22, 0.35), (0.5, 0.51)), ((0.78, 0.35), (0.5, 0.51)), ((0.5, 0.51), (0.5, 0.81))]:
        drawing.line([(round(x * dimension), round(y * dimension)) for x, y in (start, end)], fill="white", width=max(2, round(dimension * 0.05)))
    image.resize((size, size), Image.Resampling.LANCZOS).save(output / f"icon{size}.png")
