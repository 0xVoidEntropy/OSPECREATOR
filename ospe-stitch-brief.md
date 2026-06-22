# OSPE Study Helper — Website Page Inventory (for Google Stitch)

## Stack & Design System
Next.js App Router, React 19, Tailwind v4 (no config file, no component library — everything hand-built). Dark-mode-only: navy background #0a0f1e, cyan/blue primary accent, violet for admin actions, emerald for success/flashcards, amber for hints/warnings, red for errors/destructive actions. Uses lucide-react icons plus emoji for subject icons. Heavy rounded corners (rounded-xl/2xl), gradient icon badges, sticky blurred headers, no persistent shared nav — each page builds its own header.

---

## Page 1: `/` — Splash / Redirect
Pure loading screen. Centered spinner with "Loading OSPE Study Helper..." text. Checks session in background and redirects to /dashboard (logged in) or /auth (logged out). No interactive elements.

---

## Page 2: `/auth` — Login / Signup / Password Reset
Centered card (max-width ~28rem) over a dark background with three large blurred radial gradient blobs (cyan, violet, blue) for ambiance.
- Gradient icon badge (cyan→blue) with a microscope icon at top of card
- Title "OSPE Study Helper", subtitle "IMS — Integrated Medical Sciences"
- Tab switcher pill: Sign In / Sign Up (hidden when in "forgot password" mode, which shows "Reset Password" heading instead)
- Form fields, each icon-prefixed: Full Name (signup only), Email, Password (hidden in forgot mode), cyan focus ring
- Error state: red alert box with icon. Success/info message: green box.
- Submit button: full-width gradient cyan→blue, shows spinner + contextual label while loading
- "Forgot password?" link (login mode only); mode-toggle link ("Sign up free" / "Sign in")
- Three feature chips below the card: All Subjects / 5-min Stations / Track Progress
- Small credit line at the very bottom

---

## Page 3: `/dashboard` — Main Hub
- Sticky navbar: logo badge (gradient cyan→blue, microscope icon), app name + subtitle, user name/email, Sign Out button
- Welcome header: "Welcome back, {name}" + subtitle
- Stats row, 3 columns: Total Questions (cyan), Answered (emerald), Progress % (violet) — each an icon badge + big number + label
- Admin-only: "Manage subjects" toggle revealing a flat overview list of all subjects (name/icon/year/block/question count)
- Overall progress bar with gradient fill + "Reset all progress" button (confirm dialog)
- Quick Actions, 2 cards: "5-min Station Simulation" (cyan gradient) and "Admin Import" (violet gradient, admin-only)
- "Study by Subject" — 3-level folder drill-down: Year folders → Block folders → Subject card grid. Subject cards are gradient-bordered tiles (color keyed per subject) showing icon, answered/total badge, name, description, progress bar, question count, hover chevron animation
- Breadcrumb trail with back arrows between folder levels
- Footer credit line

---

## Page 4: `/subjects/[subjectId]` — Subject Question Browser
- Two full-screen overlays available: image zoom modal, and a PDF/lecture viewer modal (iframe with "open in new tab" link)
- Header: back link, subject icon + name, "{answered}/{total} answered" subtitle, "Reset Progress" button, "5-min Simulation" button
- Subject progress bar (colored per subject)
- "Study by Lab" section: grid of lecture cards (file icon, title, per-lab progress bar, "n/total done", external-link icon to open PDF) — clicking filters questions to that lab
- Station filter chips ("All Stations" + numbered chips)
- Answered filter tabs: All / Unanswered / Answered (with counts)
- Question cards, each with: station number badge, difficulty pill (color-coded), "Done" badge if answered, auto-matched slide image (click to zoom), question text with clickable highlighted medical terms, hint/answer reveal toggle buttons with expanding panels (amber hint box, cyan answer box), sub-question support (same reveal pattern per sub-item), and Missed (red) / Got it (emerald) buttons bottom-right
- Empty state: icon + "No questions found"

---

## Page 5: `/simulation` — Timed Station Exam
**Setup screen:**
- Back link, clock icon badge, "OSPE Station Simulation" title, "5 minutes per station" subtitle
- Mode picker: two toggle cards — "Random by Block" vs "Choose Subjects"
- Random mode: Year→Block folder drill, then a summary chip with question count + "Change" link
- Custom mode: subjects grouped by Year/Block as labeled sections, each subject a toggle chip
- "Start Simulation" button, disabled until valid selection

**Live exam screen:**
- Thin timer progress bar across very top (cyan, turns red + pulses under 60s)
- Header: exit (X) button, "Station n of total" label, mono countdown timer badge, thin overall-progress bar
- Row of small numbered station chips, color-coded by running score, current station ringed
- Subject badge + station badge + live "x/y correct" ratio badge
- Auto-matched slide image
- Question text (with highlighted medical terms)
- Hint reveal (amber) and Answer reveal (cyan) toggle buttons
- Sub-question grading: bulk "Got it all" / "Don't know any" buttons, then per-sub-question rows with reveal-answer toggle and red/emerald grading buttons. Single big Missed/Got it buttons for non-sub-question stations
- Prev/Next navigation, Next becomes "Finish" on last station
- Progress auto-saves so a refresh resumes mid-exam

**Results screen:**
- Trophy icon badge, "Station Complete!" heading
- Big grade fraction "{score}/25" with progress bar
- Scrollable per-station breakdown list (colored score chips + percentage)
- "Try Again" and "Dashboard" buttons

---

## Page 6: `/flashcards` — Flashcard Study (currently disabled — redirects to dashboard, but full UI exists in code)
**Setup screen:** back link, icon badge (emerald/teal gradient), "Flashcards" title, subject multi-select chips, card count, "Start Flashcards" button (disabled if 0 cards)

**Study screen:** top bar with Exit, card counter "n / total", shuffle button. Clickable flip card — front shows optional image + question + "Tap to reveal answer"; back shows amber hint + cyan answer + "Tap to flip back". Prev/Next buttons below.

---

## Page 7: `/chat` — AI Chat
- Header: back arrow, "AI Chat" title, model-name subtitle
- Message list: user bubbles right-aligned blue, assistant bubbles left-aligned slate, speech-bubble corner styling
- Empty state "Start a conversation"; loading state shows spinner inside an assistant-style bubble
- Bottom input bar with text field + Send button, Enter-to-send

---

## Page 8: `/upload` — Single Lecture Upload
Two-column layout:
- Left: "Add Lecture" form — subject dropdown, lecture title input, PDF dropzone, inline status boxes (error/success/processing), submit button "Upload & Extract Slides" (violet→purple gradient). Embedded live progress card while slides extract and questions generate (polling status text). "How it works" info box.
- Right: "Uploaded Lectures" list — file icon, title, subject icon+name, external-link icon, delete button (confirm dialog). Empty state if none.

---

## Page 9: `/admin` — Bulk Curriculum Import (admin-only)
- Header: back arrow, "Admin — Curriculum Import" title
- Import form: Year select + Block name input, whole-folder picker styled as a dashed dropzone (auto-detects subjects from subfolder names)
- Live preview of detected subject groups (icon, name, file count, filenames) once a folder is selected
- Submit button "Import N file(s)"
- Progress panel: live extraction log (color-coded success/fail/info lines), embedded current-file progress indicator
- All Lectures list: title, question count + date, Review link, Delete button (confirm dialog)
- Empty state: "No lectures uploaded yet."

---

## Page 10: `/admin/review/[lectureId]` — Question Review & Edit (admin-only)
- Header: back button, "Review — {lectureTitle}", subtitle with question count + instructions
- Per-question cards: station number badge, Save button (disabled unless changed), Delete button (confirm dialog)
- Image crop editor: drag-to-crop interactive box over the slide image with live crop preview pane, "Adjust crop"/"Done cropping" toggle, "Clear crop" button
- Editable textareas: question text, answer (HTML allowed)
- If no sub-questions: editable hint input
- If sub-questions: per-sub-question editable fields (label, question, hint, answer), each in a left-bordered block
- Empty state: "No questions found for this lecture yet."

---

## Page 11: `/setup` — One-Click DB Setup (dev/ops tool, not end-user facing)
- Centered card, gear icon badge, "One-Click Setup" title
- Numbered 3-step instructions with external Supabase signup link
- Amber warning box about service_role key sensitivity
- Password-style input for the key, "Run Setup" button (gradient, spinner while loading)
- Result state: success (emerald) or partial-failure (amber) banner, bullet checklist of completed steps, error list if any, env-var reminder, "Go to the App" link or "Try Again" button

---

## Shared / Global Elements
- **Global floating glossary popup**: the one light/white card in an otherwise all-dark app. Triggered by clicking highlighted medical terms anywhere in question/answer text. Draggable, shows definition + optional Wikipedia thumbnail + "Read more" link + close button.
- **No shared nav/sidebar** — every page implements its own sticky header independently.
- **Consistent state patterns** across pages: loading (spinner + descriptive text), empty (icon + gray message), error (red box), success (emerald box), disabled buttons dimmed.
- **Two separate persistent credit lines**: a very subtle global watermark (bottom-right, almost invisible) and a per-page footer credit line — treat both as fixed branding, not to be redesigned away.
- **Color-coding logic reused everywhere**: subject brand colors (hex stored per-subject) map to gradient/border/badge classes; score/progress ratios map to a red→orange→amber→lime→emerald gradient scale.
