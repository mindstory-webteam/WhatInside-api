"""Turn raw OCR text from a package label into reviewable, structured fields.

Design rules (from the product spec):
* Dates are classified by the label next to them (MFG/MFD/DOM/PKD, EXP/Use By,
  Best Before…). Labels are matched on the same line first, then on the line
  directly above or below (printed labels often sit in a column next to their
  values). An unlabelled date is *never* treated as an expiry date.
* Manufacturing dates are never used as expiry dates.
* Day/month order that could go either way is marked ambiguous.
* Month-only dates ("EXP APR 2027") follow the usual labelling convention:
  expiry/best-before → last day of that month, manufacturing → first day.
  They are always returned as *uncertain* with an explanatory note, so the
  review screen highlights them and the user confirms before saving.
* Relative shelf-life text ("Best before 6 months from MFG") is offered as a
  suggestion only and never auto-filled.
* Every field carries a confidence; anything not "high" is uncertain and the
  user must review before saving. Nothing here saves data.
"""
from __future__ import annotations

import calendar
import re
from dataclasses import asdict, dataclass, field
from datetime import date

from dateutil.relativedelta import relativedelta

MONTHS = {m.lower(): i for i, m in enumerate(calendar.month_abbr) if m}
MONTHS.update({m.lower(): i for i, m in enumerate(calendar.month_name) if m})
MONTHS["sept"] = 9
MONTH_RE = "|".join(sorted(MONTHS, key=len, reverse=True))

EXPIRY_LABELS = ("expiry", "use_by", "best_before")
MFG_LABELS = ("manufacturing", "packed")

# label kind -> regex. Order matters: longer/more specific first.
LABELS: list[tuple[str, str]] = [
    ("best_before", r"best\s*before\s*(?:end|date)?|best\s*by|b\.?\s*b\.?\s*e\.?|\bbb\b|bbd"),
    ("use_by", r"use\s*by|use\s*before|\bu\.?b\.?\b"),
    ("expiry", r"exp(?:iry|iration|ires)?\.?\s*(?:date|dt)?|\bexp\b|\bed\b|valid\s*till|expiry\s*on"),
    ("manufacturing", r"mfg\.?\s*(?:date|dt)?|mfd\.?\s*(?:on|date)?|d\.?o\.?m\.?|manufactured\s*(?:on)?|"
                      r"date\s*of\s*(?:mfg|manufacture)|\bmf\b|prod(?:uction)?\.?\s*date"),
    ("packed", r"pkd\.?\s*(?:on|date)?|packed\s*(?:on|date)?|date\s*of\s*pack(?:ing|aging)|d\.?o\.?p\.?"),
]
LABEL_RE = re.compile("|".join(f"(?P<{k}>{p})" for k, p in LABELS), re.IGNORECASE)
# A label is a field heading when it's followed by ":"/"."/"-", the line end, or a capitalised
# value — not when it's part of a sentence ("please check expiry date of products before use").
LABEL_HEADING_RE = re.compile(r"^\s*(?:[:.\-]|$|[A-Z0-9])")

SEP = r"[\/\-\.\s]"
DATE_PATTERNS = [
    # 2025-05-12 (ISO, unambiguous)
    ("ymd", re.compile(r"\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b")),
    # 12 May 2025 / 12-MAY-25 / 12MAY2025
    ("d_mon_y", re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?{SEP}*({MONTH_RE})\.?,?{SEP}*(\d{{4}}|\d{{2}})\b", re.I)),
    # May 12, 2025
    ("mon_d_y", re.compile(rf"\b({MONTH_RE})\.?{SEP}*(\d{{1,2}})(?:st|nd|rd|th)?,?{SEP}+(\d{{4}})\b", re.I)),
    # 12/05/2025, 12-05-25, 12.05.2025
    ("num_dmy", re.compile(r"\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4}|\d{2})\b")),
    # MAY 2025 / MAY-25 / JULY 2025 (month precision only)
    ("mon_y", re.compile(rf"\b({MONTH_RE})\.?{SEP}*(\d{{4}}|'?\d{{2}})\b", re.I)),
    # 06/2026 (month precision only)
    ("num_my", re.compile(r"\b(\d{1,2})[\/\-\.](\d{4})\b")),
]
RELATIVE_RE = re.compile(
    r"(?:best\s*before|use\s*(?:by|within)|expir\w*|consume\s*within|shelf\s*life)[^\d]{0,30}"
    r"(\d{1,3})\s*(day|days|month|months|week|weeks|year|years)\b",
    re.I,
)
QTY_UNITS = (r"kg|kgs|gms|gm|grams|g|ml|ltr|litres?|liters?|l|pcs|pieces|nos|oz|lbs?|"
             r"sets?|kits?|box(?:es)?|packs?|pkts?|strips?|tablets?|tabs|capsules?|bottles?|cans?|dozen")
QTY_RE = re.compile(
    r"(?P<label>net\s*(?:qty|quantity|wt|weight|vol(?:ume)?|content)s?\.?\s*[:\-]?\s*)?"
    rf"(?P<num>\d+(?:[.,]\d+)?)\s*(?P<unit>{QTY_UNITS})\b",
    re.I,
)
UNIT_MAP = {"kg": "kg", "kgs": "kg", "g": "g", "gm": "g", "gms": "g", "grams": "g", "ml": "ml", "l": "l",
            "ltr": "l", "litre": "l", "litres": "l", "liter": "l", "liters": "l", "pcs": "pcs", "pieces": "pcs",
            "nos": "pcs", "oz": "oz", "lb": "lb", "lbs": "lb", "set": "pack", "sets": "pack", "kit": "pack",
            "kits": "pack", "box": "pack", "boxes": "pack", "pack": "pack", "packs": "pack", "pkt": "pack",
            "pkts": "pack", "strip": "pack", "strips": "pack", "tablet": "pcs", "tablets": "pcs", "tabs": "pcs",
            "capsule": "pcs", "capsules": "pcs", "bottle": "bottle", "bottles": "bottle", "can": "can",
            "cans": "can", "dozen": "dozen"}
# Batch/lot values must contain a digit, so "Batch No., Mfg. Date" isn't read as batch "No".
BATCH_RE = re.compile(r"(?:batch|lot|b\.)\s*(?:no|number|#)?\s*[:.\-#]*\s*"
                      r"(?P<value>(?=[A-Z0-9\-\/]*\d)[A-Z0-9][A-Z0-9\-\/]{1,19})\b", re.I)
KNOWN_BRANDS = ["nestlé", "nestle", "amul", "milma", "britannia", "mother dairy", "nandini", "aavin", "heritage",
                "parle", "tata", "haldiram's", "haldirams", "mtr", "dabur", "patanjali", "kellogg's", "kelloggs",
                "maggi", "cadbury", "lays", "kissan", "everest", "eastern", "brahmins", "double horse", "nirapara",
                "aashirvaad", "fortune", "saffola", "hershey's", "kraft", "heinz", "danone", "epigamia",
                "go cheese", "del monte", "pepsico", "coca-cola", "colgate", "dove", "surf excel", "ariel",
                "apollo", "himalaya", "cipla", "dettol", "savlon", "johnson", "hansaplast", "band-aid", "vicks",
                "zandu", "baidyanath", "sun pharma", "dr. reddy", "abbott", "pfizer", "glaxo", "gsk", "mankind",
                "hindustan unilever", "itc", "marico", "godrej", "wipro", "emami", "nivea", "lifebuoy", "lux",
                "vim", "harpic", "lizol", "good day", "sunfeast", "bingo", "kurkure", "bournvita", "horlicks",
                "complan", "boost", "tropicana", "real", "paper boat", "bisleri", "kinley", "aquafina"]
BRAND_LINE_RE = re.compile(r"(?:brand\s*(?:owned\s*by|name)?|marketed\s*by|mkt\.?\s*by|a\s+product\s+of)\s*[:\-]?\s*"
                           r"(?P<rest>.*)$", re.I)
NOISE_RE = re.compile(r"(ingredients|nutrition|energy|protein|fat|carbohydrate|mrp|rs\.?|₹|incl|taxes|fssai|"
                      r"lic\.?\s*no|licen[cs]e|customer|care|marketed|manufactured|brand\s*owned|store|keep|"
                      r"refrigerat|www\.|@|veg|non-veg|serving|per\s*100|contains|particulars|qty|quantity|"
                      r"offer\s*price|price|please|registration|address|e-mail|email|call|toll|"
                      r"\bunit\b|batch|lot\s*no|net\s*w|best\s*before|use\s*by|expiry)", re.I)
MEASURE_RE = re.compile(r"\d\s*(?:mm|cm|m|mg|mcg|g|kg|ml|l|ply|%)\b|\d\s*[xX×]\s*\d", re.I)
LIST_ITEM_RE = re.compile(r"^\s*[\+\*•·«»\-–—>]")


@dataclass
class Field:
    value: object = None
    confidence: str = "none"  # high | medium | low | none
    source: str = ""
    note: str = ""

    @property
    def uncertain(self) -> bool:
        return self.confidence != "high"

    def as_dict(self):
        d = asdict(self)
        d["uncertain"] = self.uncertain
        return d


@dataclass
class DateCandidate:
    raw: str
    line: int
    label: str  # manufacturing | packed | expiry | use_by | best_before | unknown
    value: str | None  # ISO date, or None when it can't be pinned to a day
    precision: str = "day"  # day | month | relative
    ambiguous: bool = False
    alternatives: list[str] = field(default_factory=list)
    note: str = ""
    label_source: str = "same_line"  # same_line | adjacent_line | none


def _year(y: str) -> int:
    y = y.lstrip("'")
    n = int(y)
    return n + 2000 if len(y) == 2 else n


def _safe_date(y, m, d):
    try:
        return date(y, m, d)
    except ValueError:
        return None


def month_bounds(y: int, m: int) -> tuple[date, date]:
    return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


def _parse_dates(line: str, prefer_dmy: bool):
    """Yield (start, end, raw, value, precision, ambiguous, alternatives)."""
    taken: list[tuple[int, int]] = []

    def free(s, e):
        return all(e <= ts or s >= te for ts, te in taken)

    for kind, pat in DATE_PATTERNS:
        for m in pat.finditer(line):
            s, e = m.span()
            if not free(s, e):
                continue
            g = m.groups()
            value, precision, ambiguous, alts = None, "day", False, []
            if kind == "ymd":
                value = _safe_date(int(g[0]), int(g[1]), int(g[2]))
            elif kind == "d_mon_y":
                value = _safe_date(_year(g[2]), MONTHS[g[1].lower()], int(g[0]))
            elif kind == "mon_d_y":
                value = _safe_date(_year(g[2]), MONTHS[g[0].lower()], int(g[1]))
            elif kind == "num_dmy":
                a, b, y = int(g[0]), int(g[1]), _year(g[2])
                dmy, mdy = _safe_date(y, b, a), _safe_date(y, a, b)
                primary, other = (dmy, mdy) if prefer_dmy else (mdy, dmy)
                value = primary or other
                if primary and other and primary != other:
                    ambiguous, alts = True, [other.isoformat()]
            elif kind in ("mon_y", "num_my"):
                if kind == "mon_y":
                    month, y = MONTHS[g[0].lower()], _year(g[1])
                else:
                    month, y = int(g[0]), _year(g[1])
                if not 1 <= month <= 12 or not 1990 <= y <= 2100:
                    continue
                precision = "month"
                first, last = month_bounds(y, month)
                alts = [first.isoformat(), last.isoformat()]
            if value is None and precision == "day":
                continue
            if precision == "day" and not 1990 <= value.year <= 2100:
                continue
            taken.append((s, e))
            yield s, e, m.group(0), value, precision, ambiguous, alts


def _label_kind(match) -> str:
    return next(k for k, v in match.groupdict().items() if v)


def _heading_labels(line: str) -> list[tuple[int, str]]:
    """Labels that look like field headings ("Expiry Date :"), not words inside a sentence."""
    return [(m.start(), _label_kind(m)) for m in LABEL_RE.finditer(line) if LABEL_HEADING_RE.match(line[m.end():])]


def extract_dates(lines: list[str], prefer_dmy: bool = True) -> list[DateCandidate]:
    candidates: list[DateCandidate] = []
    per_line_labels: list[list[tuple[int, str]]] = []
    for idx, line in enumerate(lines):
        labels = [(m.start(), _label_kind(m)) for m in LABEL_RE.finditer(line)]
        per_line_labels.append(labels)
        found = list(_parse_dates(line, prefer_dmy))
        for s, _e, raw, value, precision, ambiguous, alts in sorted(found, key=lambda x: x[0]):
            preceding = [k for pos, k in labels if pos < s]
            label = preceding[-1] if preceding else "unknown"
            candidates.append(DateCandidate(
                raw=raw, line=idx, label=label, value=value.isoformat() if value else None, precision=precision,
                ambiguous=ambiguous, alternatives=alts, label_source="same_line" if preceding else "none",
            ))

    # Pair unlabelled dates with a heading label on an adjacent line that has no date of its own
    # (e.g. "Expiry Date :" printed in a column next to a separate "APR 2027" box).
    lines_with_dates = {c.line for c in candidates}
    used: set[tuple[int, int]] = set()
    for c in candidates:
        if c.label != "unknown":
            continue
        for offset in (-1, 1, -2, 2):
            j = c.line + offset
            if not 0 <= j < len(lines) or j in lines_with_dates:
                continue
            heading = [(pos, k) for pos, k in _heading_labels(lines[j]) if (j, pos) not in used]
            if heading:
                pos, kind = heading[0]
                used.add((j, pos))
                c.label, c.label_source = kind, "adjacent_line"
                break

    for c in candidates:
        _finish_candidate(c)
    return candidates


def _finish_candidate(c: DateCandidate) -> None:
    if c.precision == "month":
        first, last = c.alternatives
        if c.label in EXPIRY_LABELS:
            c.value = last
            c.note = "Only month and year are printed — set to the last day of the month. Please confirm."
        elif c.label in MFG_LABELS:
            c.value = first
            c.note = "Only month and year are printed — set to the first day of the month."
        else:
            c.value = None
            c.note = "Only month and year are printed, with no MFG/EXP label — choose how to use it."
    elif c.ambiguous:
        c.note = "Day and month could be swapped."
    if c.label_source == "adjacent_line" and c.label != "unknown":
        extra = "Label found on the neighbouring line."
        c.note = f"{c.note} {extra}".strip()


def _resolve_with_consistency(cands: list[DateCandidate]) -> None:
    """If MFG and expiry were both read, use 'MFG ≤ expiry' to settle day/month order."""
    mfg = [c for c in cands if c.label in MFG_LABELS and c.value and c.precision == "day"]
    exp = [c for c in cands if c.label in EXPIRY_LABELS and c.value and c.precision == "day"]
    if len(mfg) != 1 or len(exp) != 1:
        return
    m, e = mfg[0], exp[0]
    m_opts = [m.value, *(m.alternatives if m.ambiguous else [])]
    e_opts = [e.value, *(e.alternatives if e.ambiguous else [])]
    options = [(mv, ev) for mv in m_opts for ev in e_opts if date.fromisoformat(mv) <= date.fromisoformat(ev)]
    if len(options) > 1 and m.ambiguous and e.ambiguous:
        # A label uses one date format throughout: both day-first or both month-first.
        options = [(mv, ev) for i, mv in enumerate(m_opts) for j, ev in enumerate(e_opts)
                   if i == j and date.fromisoformat(mv) <= date.fromisoformat(ev)]
    if len(options) == 1:
        for cand, chosen in ((m, options[0][0]), (e, options[0][1])):
            if cand.ambiguous:
                cand.alternatives = [v for v in [cand.value, *cand.alternatives] if v != chosen]
                cand.value = chosen
                cand.ambiguous = False
                cand.note = "Day/month order inferred from the other date on the label — please check."


def _pick(cands: list[DateCandidate], labels: tuple[str, ...]) -> Field:
    matches = [c for c in cands if c.label in labels]
    if not matches:
        return Field()
    usable = [c for c in matches if c.value]
    distinct = {c.value for c in usable}
    if len(distinct) > 1:
        # Prefer a same-line, day-precise reading over weaker ones before giving up.
        strong = {c.value for c in usable if c.precision == "day" and c.label_source == "same_line"}
        if len(strong) != 1:
            return Field(None, "none", "label", "Several dates were found for this field — choose one.")
        usable = [c for c in usable if c.value in strong]
    if not usable:
        return Field(None, "none", "label", matches[0].note)
    c = usable[0]
    if c.ambiguous or c.precision == "month":
        return Field(c.value, "low", "label", c.note)
    if c.note or c.label_source == "adjacent_line":
        return Field(c.value, "medium", "label", c.note)
    return Field(c.value, "high", "label")


def _quantity(text: str) -> tuple[Field, Field]:
    best = None
    for m in QTY_RE.finditer(text):
        score = 2 if m.group("label") else 1
        if best is None or score > best[0]:
            best = (score, m)
    if not best:
        return Field(), Field()
    score, m = best
    num = float(m.group("num").replace(",", "."))
    conf = "high" if score == 2 else "medium"
    src = "label" if score == 2 else "pattern"
    return Field(num, conf, src), Field(UNIT_MAP[m.group("unit").lower()], conf, src)


def _clean_name(s: str) -> str:
    s = re.sub(r"\s+", " ", s).strip(" .,:;-|")
    return s.title() if s.isupper() else s


def _brand(lines: list[str], text: str) -> Field:
    lower = text.lower()
    # 1) A known brand anywhere on the pack (also inside run-together OCR words like "APOLLOHEALTHCO").
    hits = [(lower.find(b), b) for b in KNOWN_BRANDS if b in lower]
    if hits:
        pos, b = min(hits)
        return Field(text[pos:pos + len(b)].strip().title(), "medium", "known_brand")
    # 2) "Brand owned by: X" / "Marketed by: X" — the value on the same or the next line.
    for i, ln in enumerate(lines):
        m = BRAND_LINE_RE.search(ln)
        if not m:
            continue
        rest = m.group("rest").strip()
        if not re.search(r"[A-Za-z]{3,}", rest) and i + 1 < len(lines):
            rest = lines[i + 1]
        rest = LABEL_RE.sub(" ", rest)
        for _kind, pat in DATE_PATTERNS:
            rest = pat.sub(" ", rest)
        words = re.findall(r"[A-Za-z][A-Za-z&'.]{1,}", rest)
        if words:
            name = " ".join(words[:3])
            name = re.sub(r"(LIMITED|LTD|PVT|PRIVATE|INDUSTRIES|INC|CO)\.?$", "", name, flags=re.I).strip()
            if len(name) >= 3:
                return Field(_clean_name(name), "low", "brand_line", "Brand read from the 'Brand owned by' line — check.")
    return Field()


def _name(lines: list[str], brand: Field) -> Field:
    for ln in lines[:12]:
        letters = re.sub(r"[^A-Za-zÀ-ÿഀ-ൿ]", "", ln)
        if len(letters) < 3 or LIST_ITEM_RE.match(ln) or LABEL_RE.search(ln) or NOISE_RE.search(ln):
            continue
        if QTY_RE.search(ln) or BATCH_RE.search(ln) or re.search(r"\d{3,}", ln):
            continue
        # Table rows, measurements and OCR noise are not product names.
        if re.search(r"[|“”¢©®{}\[\]_=~]", ln) or MEASURE_RE.search(ln) or len(ln) > 60:
            continue
        # Mostly-garbage OCR lines have few real words.
        words = re.findall(r"[A-Za-z]{3,}", ln)
        if len(words) < 1 or sum(len(w) for w in words) < 0.5 * len(letters):
            continue
        name = _clean_name(ln)
        if brand.value and name.lower().startswith(str(brand.value).lower()):
            name = _clean_name(name[len(str(brand.value)):])
            if not name:
                continue  # the line is just the brand — the product name is elsewhere
        if 3 <= len(name) <= 60:
            return Field(name, "low", "heuristic", "Product name guessed from the label — please check.")
    return Field(None, "none", "", "No product name found — please type it.")


def normalize_ocr_text(raw_text: str, *, prefer_dmy: bool = True) -> dict:
    raw_text = (raw_text or "")[:20000]
    lines = [ln.strip() for ln in raw_text.replace("\r", "\n").split("\n") if ln.strip()]
    candidates = extract_dates(lines, prefer_dmy)
    _resolve_with_consistency(candidates)

    warnings: list[str] = []
    mfg = _pick(candidates, ("manufacturing",))
    if mfg.value is None and not [c for c in candidates if c.label == "manufacturing"]:
        mfg = _pick(candidates, ("packed",))
        if mfg.value:
            mfg.note = "Packed-on date used as manufacturing date."
            mfg.confidence = "medium" if mfg.confidence == "high" else mfg.confidence
    expiry = _pick(candidates, ("expiry", "use_by"))
    best_before = _pick(candidates, ("best_before",))

    # Relative shelf life ("best before 6 months from MFG") → suggestion only.
    for m in RELATIVE_RE.finditer(raw_text):
        amount, unit = int(m.group(1)), m.group(2).lower()
        note = f"Label says '{m.group(0).strip()}'."
        suggestion = None
        if mfg.value:
            delta = {"day": relativedelta(days=amount), "week": relativedelta(weeks=amount),
                     "month": relativedelta(months=amount), "year": relativedelta(years=amount)}[unit.rstrip("s")]
            suggestion = (date.fromisoformat(mfg.value) + delta).isoformat()
            note += f" Calculated from the manufacturing date: {suggestion}."
        candidates.append(DateCandidate(raw=m.group(0), line=-1, label="best_before", value=suggestion,
                                        precision="relative", note=note, label_source="none"))
        warnings.append("Shelf life is printed relative to the manufacturing date. Confirm the date yourself.")
        break

    if any(c.label == "unknown" for c in candidates):
        warnings.append("Some dates have no label (MFG/EXP). They were not used automatically — choose if needed.")
    if expiry.value is None and best_before.value is None:
        warnings.append("No expiry or best-before date could be confirmed from the image. Enter it manually.")
    if any(c.ambiguous for c in candidates):
        warnings.append("Some dates could be read as day/month or month/day. Please check them.")
    if any(c.precision == "month" and c.label in EXPIRY_LABELS for c in candidates):
        warnings.append("The expiry shows only month and year — it was set to the last day of that month.")

    qty, unit = _quantity(raw_text)
    brand = _brand(lines, raw_text)
    name = _name(lines, brand)
    bm = BATCH_RE.search(raw_text)
    batch = Field(bm.group("value"), "medium", "label") if bm else Field()

    fields = {"name": name, "brand": brand, "quantity": qty, "unit": unit, "manufacturing_date": mfg,
              "expiry_date": expiry, "best_before_date": best_before, "batch_number": batch}
    return {
        "raw_text": raw_text,
        "lines": lines,
        "fields": {k: v.as_dict() for k, v in fields.items()},
        "date_candidates": [asdict(c) for c in candidates],
        "warnings": list(dict.fromkeys(warnings)),
        "requires_review": True,
    }
