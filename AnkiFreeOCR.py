import os
import re
import cv2
import numpy as np
import pytesseract
import genanki
from pdf2image import convert_from_path
from PIL import Image

# === SETTINGS ===
PDF_FILE = "Sauce.pdf"
OUTPUT_DIR = "pdf_images"
ANKI_FILE = "pdf_cards.apkg"
DPI = 200

# Tweak these if specimens get mis-cropped on your slide layout
MIN_SPECIMEN_AREA_RATIO = 0.05   # ignore contours smaller than 5% of page area
MAX_SPECIMEN_AREA_RATIO = 0.85   # ignore near-full-page contours (likely background)


def pil_to_cv(img: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def find_specimen_box(cv_img: np.ndarray):
    """Heuristic: the specimen photo/diagram is usually the largest solid
    (non-text, non-background) rectangular block on the slide. Text lines
    are thin and wide; the specimen image is a denser, more square blob."""
    gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    page_area = h * w

    edges = cv2.Canny(gray, 30, 100)
    edges = cv2.dilate(edges, np.ones((9, 9), np.uint8), iterations=2)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best = None
    best_score = 0
    for c in contours:
        x, y, cw, ch = cv2.boundingRect(c)
        area = cw * ch
        ratio = area / page_area
        if ratio < MIN_SPECIMEN_AREA_RATIO or ratio > MAX_SPECIMEN_AREA_RATIO:
            continue
        aspect = cw / ch if ch else 0
        if aspect < 0.3 or aspect > 3.5:
            continue  # skip thin text-line-shaped boxes
        # prefer boxes with more internal detail (real images have more edges)
        roi_edges = edges[y:y + ch, x:x + cw]
        density = cv2.countNonZero(roi_edges) / area
        score = area * (0.3 + density)
        if score > best_score:
            best_score = score
            best = (x, y, cw, ch)

    if best is None:
        return None
    x, y, cw, ch = best
    pad = int(0.02 * w)
    return (
        max(0, x - pad),
        max(0, y - pad),
        min(w, x + cw + pad),
        min(h, y + ch + pad),
    )


def ocr_caption_near(cv_img: np.ndarray, box) -> str:
    """OCR the strip of text just below (or, if none, above) the specimen
    box — that's typically where the slide names the specimen/lesion."""
    h, w = cv_img.shape[:2]
    x1, y1, x2, y2 = box
    strip_h = int(0.12 * h)

    below = cv_img[y2:min(h, y2 + strip_h), x1:x2]
    text = pytesseract.image_to_string(below).strip()
    if text:
        return text

    above = cv_img[max(0, y1 - strip_h):y1, x1:x2]
    text = pytesseract.image_to_string(above).strip()
    return text


def ocr_full_page_title(cv_img: np.ndarray) -> str:
    """Fallback: largest-font text line on the page, found via OCR word
    bounding-box heights (titles render taller than body text)."""
    data = pytesseract.image_to_data(cv_img, output_type=pytesseract.Output.DICT)
    lines = {}
    for i, txt in enumerate(data["text"]):
        txt = txt.strip()
        if not txt:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, {"words": [], "heights": []})
        lines[key]["words"].append(txt)
        lines[key]["heights"].append(data["height"][i])
    if not lines:
        return "Specimen"
    best_key = max(lines, key=lambda k: max(lines[k]["heights"]))
    return " ".join(lines[best_key]["words"])


def clean_caption(text: str) -> str:
    text = text.replace("\n", " ").strip()
    text = re.sub(r"\s+", " ", text)
    # keep only the first short clause — captions are often one phrase
    text = re.split(r"[.;:]", text)[0]
    return text[:80].strip()


def sanitize_filename(name: str) -> str:
    name = re.sub(r"[^\w\s-]", "", name).strip().replace(" ", "_")
    return name[:60] or "specimen"


os.makedirs(OUTPUT_DIR, exist_ok=True)
pages = convert_from_path(PDF_FILE, dpi=DPI)

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
skipped = 0

for i, page in enumerate(pages):
    print(f"Page {i + 1}/{len(pages)}…")
    cv_img = pil_to_cv(page)
    box = find_specimen_box(cv_img)

    if box is None:
        skipped += 1
        continue

    caption = clean_caption(ocr_caption_near(cv_img, box))
    if not caption:
        caption = clean_caption(ocr_full_page_title(cv_img))
    if not caption:
        caption = "Specimen"

    x1, y1, x2, y2 = box
    cropped = page.crop((x1, y1, x2, y2))

    base_name = sanitize_filename(caption)
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
        fields=[f"<img src='{os.path.basename(img_path)}'>", caption],
    )
    deck.add_note(note)

package = genanki.Package(deck)
package.media_files = media_files
package.write_to_file(ANKI_FILE)

print(f"✅ Done! {len(media_files)} specimens extracted, {skipped} pages skipped.")
print(f"Images saved in {OUTPUT_DIR}/ named by their on-slide caption.")
print(f"Import {ANKI_FILE} into Anki.")
