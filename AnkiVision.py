import os
import re
import json
import base64
import requests
import fitz  # PyMuPDF
import pytesseract
import genanki
from io import BytesIO
from PIL import Image

# === SETTINGS ===
PDF_FILE = "Sauce.pdf"
OUTPUT_DIR = "pdf_images"
ANKI_FILE = "pdf_cards.apkg"
ZOOM = 3.0
MIN_IMG_WIDTH_PT = 80
MIN_IMG_HEIGHT_PT = 80

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
VISION_MODEL = "google/gemini-2.0-flash"  # paid, ~$0.0002/image

PROMPT = """You are a pathology/histology instructor describing a specimen
image from a medical lecture slide for a flashcard. The slide's on-screen
caption (if any) was OCR'd as: "{caption}"

Look closely at the image and respond with strict JSON only, no markdown:
{{
  "identification": "what the specimen/structure is (organ, tissue, organism, etc.)",
  "gross_description": "gross/macroscopic appearance — color, shape, texture, size cues (empty string if this is a microscopic/histology image instead)",
  "microscopic_description": "microscopic/histologic findings — cell types, staining pattern, architecture (empty string if this is a gross specimen photo instead)",
  "diagnosis": "the most likely disease/diagnosis this image illustrates",
  "arrows": "if the image has any arrows, arrowheads, circles, or labels pointing to something, describe each one and what it indicates — its color if relevant and what structure/finding it marks. Empty string if there are none."
}}
Be specific and use correct medical terminology. If you are uncertain about
the diagnosis, say so rather than guessing confidently."""


def image_to_data_url(img: Image.Image) -> str:
    buf = BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


def ask_vision_model(img: Image.Image, caption: str) -> dict:
    if not OPENROUTER_API_KEY:
        return {}
    try:
        res = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            },
            json={
                "model": VISION_MODEL,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": PROMPT.format(caption=caption or "none")},
                        {"type": "image_url", "image_url": {"url": image_to_data_url(img)}},
                    ],
                }],
                "max_tokens": 700,
            },
            timeout=45,
        )
        res.raise_for_status()
        content = res.json()["choices"][0]["message"]["content"]
        match = re.search(r"\{.*\}", content, re.DOTALL)
        return json.loads(match.group(0)) if match else {}
    except Exception as e:
        print(f"  ⚠ vision call failed: {e}")
        return {}


def sanitize_filename(name: str) -> str:
    name = re.sub(r"[^\w\s-]", "", name).strip().replace(" ", "_")
    return name[:150] or "specimen"


def clean_caption(text: str) -> str:
    text = text.replace("\n", " ").strip()
    return re.sub(r"\s+", " ", text)


def ocr_region(page_img: Image.Image, box) -> str:
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(page_img.width, x2), min(page_img.height, y2)
    if x2 <= x1 or y2 <= y1:
        return ""
    return pytesseract.image_to_string(page_img.crop((x1, y1, x2, y2))).strip()


def ocr_caption_near(page_img: Image.Image, box) -> str:
    x1, y1, x2, y2 = box
    w, h = page_img.width, page_img.height
    strip_h = 0.12 * h
    strip_w = 0.22 * w
    for region in (
        (x1, y2, x2, min(h, y2 + strip_h)),
        (x1, max(0, y1 - strip_h), x2, y1),
        (x2, y1, min(w, x2 + strip_w), y2),
        (max(0, x1 - strip_w), y1, x1, y2),
    ):
        text = ocr_region(page_img, region)
        if text:
            return text
    return ""


def build_answer_html(ai: dict, fallback_caption: str) -> str:
    if not ai:
        return fallback_caption or "Specimen"
    rows = []
    if ai.get("identification"):
        rows.append(f"<b>Identification:</b> {ai['identification']}")
    if ai.get("gross_description"):
        rows.append(f"<b>Gross:</b> {ai['gross_description']}")
    if ai.get("microscopic_description"):
        rows.append(f"<b>Microscopic:</b> {ai['microscopic_description']}")
    if ai.get("diagnosis"):
        rows.append(f"<b>Diagnosis:</b> {ai['diagnosis']}")
    if ai.get("arrows"):
        rows.append(f"<b>Arrows/markers:</b> {ai['arrows']}")
    return "<br><br>".join(rows) if rows else (fallback_caption or "Specimen")


os.makedirs(OUTPUT_DIR, exist_ok=True)
doc = fitz.open(PDF_FILE)

deck = genanki.Deck(1234567890, "PDF Flashcards")
model = genanki.Model(
    987654321,
    "Specimen Image Model",
    fields=[{"name": "Question"}, {"name": "Answer"}],
    templates=[{
        "name": "Card 1",
        "qfmt": "{{Question}}",
        "afmt": "{{FrontSide}}<hr id='answer'>{{Answer}}",
    }],
)

media_files = []
used_names = set()
total_specimens = 0
pages_with_none = 0

if not OPENROUTER_API_KEY:
    print("⚠ OPENROUTER_API_KEY not set — cards will fall back to OCR captions only.")
    print("  export OPENROUTER_API_KEY=sk-or-... before running for full AI descriptions.")

for page_index in range(len(doc)):
    page = doc[page_index]
    img_infos = page.get_image_info(xrefs=True)

    real_images = []
    for info in img_infos:
        bbox = info["bbox"]
        w_pt, h_pt = bbox[2] - bbox[0], bbox[3] - bbox[1]
        if w_pt < MIN_IMG_WIDTH_PT or h_pt < MIN_IMG_HEIGHT_PT:
            continue
        real_images.append((info["xref"], bbox))

    if not real_images:
        pages_with_none += 1
        print(f"Page {page_index + 1}/{len(doc)}… no embedded specimen image")
        continue

    print(f"Page {page_index + 1}/{len(doc)}… {len(real_images)} specimen(s) found")

    pix = page.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM))
    page_img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

    for xref, bbox in real_images:
        scaled_box = tuple(c * ZOOM for c in bbox)
        x1, y1, x2, y2 = [int(v) for v in scaled_box]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(page_img.width, x2), min(page_img.height, y2)
        if x2 <= x1 or y2 <= y1:
            continue
        cropped = page_img.crop((x1, y1, x2, y2))

        ocr_caption = clean_caption(ocr_caption_near(page_img, scaled_box))
        ai_result = ask_vision_model(cropped, ocr_caption)
        answer_html = build_answer_html(ai_result, ocr_caption)

        name_source = ai_result.get("diagnosis") or ai_result.get("identification") or ocr_caption or "specimen"
        base_name = sanitize_filename(name_source)
        name = base_name
        n = 2
        while name in used_names:
            name = f"{base_name}_{n}"
            n += 1
        used_names.add(name)

        img_path = os.path.join(OUTPUT_DIR, f"{name}.png")
        cropped.save(img_path, "PNG")
        media_files.append(img_path)
        total_specimens += 1

        note = genanki.Note(
            model=model,
            fields=[f"<img src='{os.path.basename(img_path)}'>", answer_html],
        )
        deck.add_note(note)

package = genanki.Package(deck)
package.media_files = media_files
package.write_to_file(ANKI_FILE)

print(f"✅ Done! {total_specimens} specimens extracted, {pages_with_none} pages had none.")
print(f"Images saved in {OUTPUT_DIR}/ named by AI diagnosis/identification.")
print(f"Import {ANKI_FILE} into Anki.")
