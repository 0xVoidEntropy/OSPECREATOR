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
MIN_SPECIMEN_AREA_RATIO = 0.03   # ignore contours smaller than 3% of page area
MAX_SPECIMEN_AREA_RATIO = 0.85   # ignore near-full-page contours (likely background)
OVERLAP_MERGE_THRESHOLD = 0.4    # merge boxes that overlap more than this (IoU-ish)
# Filenames are still capped for filesystem safety; the full OCR text always
# goes into the card's Answer field regardless of this limit.
MAX_FILENAME_LEN = 150


def pil_to_cv(img: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def box_overlap_ratio(a, b) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    a_area = (ax2 - ax1) * (ay2 - ay1)
    b_area = (bx2 - bx1) * (by2 - by1)
    smaller = min(a_area, b_area)
    return inter / smaller if smaller else 0.0


def merge_overlapping_boxes(boxes):
    """Collapse boxes that substantially overlap into their union, so a
    single specimen photo doesn't get detected as several fragments."""
    boxes = sorted(boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]), reverse=True)
    merged = []
    for box in boxes:
        found = False
        for i, m in enumerate(merged):
            if box_overlap_ratio(box, m) > OVERLAP_MERGE_THRESHOLD:
                x1 = min(box[0], m[0]); y1 = min(box[1], m[1])
                x2 = max(box[2], m[2]); y2 = max(box[3], m[3])
                merged[i] = (x1, y1, x2, y2)
                found = True
                break
        if not found:
            merged.append(box)
    return merged


def find_specimen_boxes(cv_img: np.ndarray):
    """Heuristic: specimen photos/diagrams are dense, roughly box-shaped
    regions distinct from thin text lines. Returns ALL qualifying regions
    on the page (not just the single best one), left-to-right, top-to-bottom,
    so multi-specimen slides aren't missed."""
    gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    page_area = h * w

    edges = cv2.Canny(gray, 30, 100)
    edges = cv2.dilate(edges, np.ones((9, 9), np.uint8), iterations=2)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates = []
    for c in contours:
        x, y, cw, ch = cv2.boundingRect(c)
        area = cw * ch
        ratio = area / page_area
        if ratio < MIN_SPECIMEN_AREA_RATIO or ratio > MAX_SPECIMEN_AREA_RATIO:
            continue
        aspect = cw / ch if ch else 0
        if aspect < 0.3 or aspect > 3.5:
            continue  # skip thin text-line-shaped boxes
        roi_edges = edges[y:y + ch, x:x + cw]
        density = cv2.countNonZero(roi_edges) / area
        if density < 0.04:
            continue  # too sparse to be a real image (likely empty space)
        pad = int(0.015 * w)
        candidates.append((
            max(0, x - pad),
            max(0, y - pad),
            min(w, x + cw + pad),
            min(h, y + ch + pad),
        ))

    boxes = merge_overlapping_boxes(candidates)
    boxes.sort(key=lambda b: (b[1], b[0]))  # reading order: top-to-bottom, left-to-right
    return boxes


def ocr_text_region(cv_img: np.ndarray, region) -> str:
    x1, y1, x2, y2 = region
    if x2 <= x1 or y2 <= y1:
        return ""
    crop = cv_img[y1:y2, x1:x2]
    if crop.size == 0:
        return ""
    return pytesseract.image_to_string(crop).strip()


def ocr_caption_near(cv_img: np.ndarray, box) -> str:
    """OCR the strip of text just below (or, if none, above/beside) the
    specimen box — that's where slides usually name a specimen/lesion."""
    h, w = cv_img.shape[:2]
    x1, y1, x2, y2 = box
    strip_h = int(0.12 * h)
    strip_w = int(0.18 * w)

    below = ocr_text_region(cv_img, (x1, y2, x2, min(h, y2 + strip_h)))
    if below:
        return below

    above = ocr_text_region(cv_img, (x1, max(0, y1 - strip_h), x2, y1))
    if above:
        return above

    right = ocr_text_region(cv_img, (x2, y1, min(w, x2 + strip_w), y2))
    if right:
        return right

    left = ocr_text_region(cv_img, (max(0, x1 - strip_w), y1, x1, y2))
    return left


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
    """Normalize whitespace only — keep the FULL text, no truncation,
    no clause-cutting. This is what goes in the card's Answer field."""
    text = text.replace("\n", " ").strip()
    text = re.sub(r"\s+", " ", text)
    return text


def sanitize_filename(name: str) -> str:
    name = re.sub(r"[^\w\s-]", "", name).strip().replace(" ", "_")
    name = name[:MAX_FILENAME_LEN]
    return name or "specimen"


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
total_specimens = 0

for i, page in enumerate(pages):
    cv_img = pil_to_cv(page)
    boxes = find_specimen_boxes(cv_img)

    if not boxes:
        skipped += 1
        print(f"Page {i + 1}/{len(pages)}… no specimen found")
        continue

    print(f"Page {i + 1}/{len(pages)}… {len(boxes)} specimen(s) found")

    page_title = None  # computed lazily, shared across specimens on this page

    for box in boxes:
        caption = clean_caption(ocr_caption_near(cv_img, box))
        if not caption:
            if page_title is None:
                page_title = clean_caption(ocr_full_page_title(cv_img))
            caption = page_title or "Specimen"

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
        total_specimens += 1

        note = genanki.Note(
            model=model,
            fields=[f"<img src='{os.path.basename(img_path)}'>", caption],
        )
        deck.add_note(note)

package = genanki.Package(deck)
package.media_files = media_files
package.write_to_file(ANKI_FILE)

print(f"✅ Done! {total_specimens} specimens extracted, {skipped} pages skipped.")
print(f"Images saved in {OUTPUT_DIR}/ named by their on-slide caption.")
print(f"Import {ANKI_FILE} into Anki.")
