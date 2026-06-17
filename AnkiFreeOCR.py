import os
import re
import io
import fitz  # PyMuPDF
import pytesseract
import genanki
from PIL import Image

# === SETTINGS ===
PDF_FILE = "Sauce.pdf"
OUTPUT_DIR = "pdf_images"
ANKI_FILE = "pdf_cards.apkg"
ZOOM = 2.0  # render resolution multiplier, used only for OCR-ing captions

# Embedded images smaller than this (in PDF points, 72pt = 1 inch) are
# skipped — these are almost always bullet icons, logos, or decorative
# borders, not specimen photos.
MIN_IMG_WIDTH_PT = 80
MIN_IMG_HEIGHT_PT = 80


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
    """Look for the on-slide caption directly below/above/right/left of
    the embedded image's bounding box, in that order."""
    x1, y1, x2, y2 = box
    w, h = page_img.width, page_img.height
    strip_h = 0.12 * h
    strip_w = 0.22 * w

    for region in (
        (x1, y2, x2, min(h, y2 + strip_h)),          # below
        (x1, max(0, y1 - strip_h), x2, y1),           # above
        (x2, y1, min(w, x2 + strip_w), y2),           # right
        (max(0, x1 - strip_w), y1, x1, y2),           # left
    ):
        text = ocr_region(page_img, region)
        if text:
            return text
    return ""


def ocr_full_page_title(page_img: Image.Image) -> str:
    data = pytesseract.image_to_data(page_img, output_type=pytesseract.Output.DICT)
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
seen_xrefs_this_page = set()
total_specimens = 0
pages_with_none = 0

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
    page_title = None

    for xref, bbox in real_images:
        base = doc.extract_image(xref)
        img_bytes = base["image"]
        ext = base["ext"]

        scaled_box = tuple(c * ZOOM for c in bbox)
        caption = clean_caption(ocr_caption_near(page_img, scaled_box))
        if not caption:
            if page_title is None:
                page_title = clean_caption(ocr_full_page_title(page_img))
            caption = page_title or "Specimen"

        base_name = sanitize_filename(caption)
        name = base_name
        n = 2
        while name in used_names:
            name = f"{base_name}_{n}"
            n += 1
        used_names.add(name)

        img_path = os.path.join(OUTPUT_DIR, f"{name}.{ext}")
        with open(img_path, "wb") as f:
            f.write(img_bytes)
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

print(f"✅ Done! {total_specimens} specimens extracted, {pages_with_none} pages had none.")
print(f"Images saved in {OUTPUT_DIR}/ named by their on-slide caption.")
print(f"Import {ANKI_FILE} into Anki.")
