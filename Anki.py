import os
import re
import json
import base64
import requests
import genanki
from io import BytesIO
from pdf2image import convert_from_path
from PIL import Image

# === SETTINGS ===
PDF_FILE = "Sauce.pdf"
OUTPUT_DIR = "pdf_images"
ANKI_FILE = "pdf_cards.apkg"
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
VISION_MODEL = "google/gemini-2.0-flash"

# === PROMPT ===
# Ask the model to find the specimen/lesion region and name it.
# Returns a crop box in percentages (0-100) of the image, plus a short label.
PROMPT = (
    "You are looking at a slide from a pathology/histology/anatomy lecture. "
    "If this slide shows a specimen, gross lesion, or histology image worth "
    "studying, respond with strict JSON only:\n"
    '{"has_specimen": true, "label": "short disease/lesion/structure name", '
    '"crop": {"x": 0, "y": 0, "w": 100, "h": 100}}\n'
    "x/y/w/h are percentages of the full image describing the bounding box "
    "tightly around the specimen/image area (excluding title text, captions, "
    "logos, slide numbers). If there is no specimen/diagram worth a flashcard "
    '(e.g. a text-only or title slide), respond with {"has_specimen": false}. '
    "No markdown, no explanation — JSON only."
)


def image_to_data_url(img: Image.Image) -> str:
    buf = BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


def ask_vision_model(img: Image.Image) -> dict:
    if not OPENROUTER_API_KEY:
        return {"has_specimen": False}
    try:
        res = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            },
            json={
                "model": VISION_MODEL,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": PROMPT},
                            {"type": "image_url", "image_url": {"url": image_to_data_url(img)}},
                        ],
                    }
                ],
                "max_tokens": 300,
            },
            timeout=30,
        )
        res.raise_for_status()
        content = res.json()["choices"][0]["message"]["content"]
        match = re.search(r"\{.*\}", content, re.DOTALL)
        return json.loads(match.group(0)) if match else {"has_specimen": False}
    except Exception as e:
        print(f"  ⚠ vision call failed: {e}")
        return {"has_specimen": False}


def crop_image(img: Image.Image, crop: dict) -> Image.Image:
    w, h = img.size
    x = max(0, crop.get("x", 0)) / 100 * w
    y = max(0, crop.get("y", 0)) / 100 * h
    cw = max(1, crop.get("w", 100)) / 100 * w
    ch = max(1, crop.get("h", 100)) / 100 * h
    box = (int(x), int(y), int(min(w, x + cw)), int(min(h, y + ch)))
    return img.crop(box)


def sanitize_filename(name: str) -> str:
    name = re.sub(r"[^\w\s-]", "", name).strip().replace(" ", "_")
    return name[:60] or "specimen"


# Step 1: Convert PDF to images
os.makedirs(OUTPUT_DIR, exist_ok=True)
pages = convert_from_path(PDF_FILE, dpi=200)

# Step 2: Create Anki deck/model — front = cropped specimen image, back = name
deck = genanki.Deck(1234567890, "PDF Flashcards")

model = genanki.Model(
    987654321,
    "Specimen Image Model",
    fields=[{"name": "Question"}, {"name": "Answer"}],
    templates=[
        {
            "name": "Card 1",
            "qfmt": "{{Question}}",
            "afmt": "{{FrontSide}}<hr id='answer'>{{Answer}}",
        }
    ],
)

media_files = []
used_names = set()
skipped = 0

for i, page in enumerate(pages):
    print(f"Page {i + 1}/{len(pages)}…")
    result = ask_vision_model(page)

    if not result.get("has_specimen"):
        skipped += 1
        continue

    label = result.get("label", "Specimen").strip() or "Specimen"
    crop = result.get("crop") or {"x": 0, "y": 0, "w": 100, "h": 100}
    cropped = crop_image(page, crop)

    base_name = sanitize_filename(label)
    name = base_name
    n = 2
    while name in used_names:
        name = f"{base_name}_{n}"
        n += 1
    used_names.add(name)

    img_path = os.path.join(OUTPUT_DIR, f"{name}.png")
    cropped.save(img_path, "PNG")
    media_files.append(img_path)

    note = genanki.Note(
        model=model,
        fields=[f"<img src='{os.path.basename(img_path)}'>", label],
    )
    deck.add_note(note)

# Step 3: Package into .apkg
package = genanki.Package(deck)
package.media_files = media_files
package.write_to_file(ANKI_FILE)

print(f"✅ Done! {len(media_files)} cards created, {skipped} pages skipped (no specimen).")
print(f"Import {ANKI_FILE} into Anki.")
