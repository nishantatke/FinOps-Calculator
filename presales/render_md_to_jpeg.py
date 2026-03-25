from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import textwrap


BASE_DIR = Path(__file__).resolve().parent
INPUT_FILES = [
    BASE_DIR / "COST_OPTIMIZATION_ARCHITECTURE_AND_ALGORITHM.md",
    BASE_DIR / "FINOPS_ONE_PAGER_VISUAL.md",
]


def load_font(size: int):
    candidates = [
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/calibri.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for f in candidates:
        p = Path(f)
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def to_lines(text: str, max_chars: int = 110):
    out = []
    for raw in text.splitlines():
        if not raw.strip():
            out.append("")
            continue
        if raw.startswith("```"):
            out.append(raw)
            continue
        wrapped = textwrap.wrap(raw, width=max_chars, replace_whitespace=False, drop_whitespace=False)
        if wrapped:
            out.extend(wrapped)
        else:
            out.append(raw)
    return out


def render_markdown_to_jpeg(md_path: Path, high_res: bool = False):
    content = md_path.read_text(encoding="utf-8")
    lines = to_lines(content)

    if high_res:
        title_font = load_font(50)
        body_font = load_font(30)
        mono_font = load_font(27)
        margin = 90
        width = 2800
        line_height = 46
        title_height = 120
        quality = 95
    else:
        title_font = load_font(36)
        body_font = load_font(22)
        mono_font = load_font(20)
        margin = 60
        width = 1800
        line_height = 34
        title_height = 80
        quality = 92

    height = max(1200, margin * 2 + title_height + line_height * (len(lines) + 2))

    image = Image.new("RGB", (width, height), color=(246, 249, 247))
    draw = ImageDraw.Draw(image)

    y = margin
    title = md_path.stem.replace("_", " ")
    draw.text((margin, y), title, font=title_font, fill=(12, 77, 54))
    y += title_height

    for line in lines:
        use_mono = line.strip().startswith("```") or line.startswith("    ")
        font = mono_font if use_mono else body_font
        fill = (28, 43, 35) if not use_mono else (30, 42, 70)
        draw.text((margin, y), line, font=font, fill=fill)
        y += line_height

    suffix = "_HD" if high_res else ""
    out_path = md_path.with_name(f"{md_path.stem}{suffix}.jpeg")
    image.save(out_path, "JPEG", quality=quality, optimize=True)
    return out_path


def main():
    outputs = []
    for fp in INPUT_FILES:
        if fp.exists():
            outputs.append(render_markdown_to_jpeg(fp, high_res=False))
            outputs.append(render_markdown_to_jpeg(fp, high_res=True))
    for out in outputs:
        print(str(out))


if __name__ == "__main__":
    main()
