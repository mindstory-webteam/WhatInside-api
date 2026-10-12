"""Turn raw OCR text from a package label into reviewable, structured fields.

Design rules (from the product spec):
* Dates are classified by the label next to them (MFG/MFD/DOM/PKD, EXP/Use By,
  Best Before…). An unlabelled date is *never* treated as an expiry date.
* Manufacturing dates are never used as expiry dates.
* Day/month order that could go either way is marked ambiguous.
* Month-only dates ("EXP 06/2026") and relative shelf-life text
  ("Best before 6 months from MFG") are offered as suggestions but never
  auto-filled.
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
    # MAY 2025 / MAY-25 (month precision only)
    ("mon_y", re.compile(rf"\b({MONTH_RE})\.?{SEP}*(\d{{4}}|'?\d{{2}})\b", re.I)),
    # 06/2026 (month precision only)
    ("num_my", re.compile(r"\b(\d{1,2})[\/\-\.](\d{4})\b")),
]
RELATIVE_RE = re.compile(
    r"(?:best\s*before|use\s*(?:by|within)|expir\w*|consume\s*within|shelf\s*life)[^\d]{0,30}"
    r"(\d{1,3})\s*(day|days|month|months|week|weeks|year|years)\b",
    re.I,
)
QTY_RE = re.compile(
    r"(?P<label>net\s*(?:qty|quantity|wt|weight|vol(?:ume)?|content)s?\.?\s*[:\-]?\s*)?"
    r"(?P<num>\d+(?:[.,]\d+)?)\s*(?P<unit>kg|kgs|gms|gm|grams|g|ml|ltr|litres?|liters?|l|pcs|pieces|nos|oz|lbs?)\b",
    re.I,
)
UNIT_MAP = {"kg": "kg", "kgs": "kg", "g": "g", "gm": "g", "gms": "g", "grams": "g", "ml": "ml", "l": "l",
            "ltr": "l", "litre": "l", "litres": "l", "liter": "l", "liters": "l", "pcs": "pcs", "pieces": "pcs",
            "nos": "pcs", "oz": "oz", "lb": "lb", "lbs": "lb"}
BATCH_RE = re.compile(r"(?:batch\s*(?:no|number|#)?|b\.\s*no|lot\s*(?:no|number|#)?)\.?\s*[:.\-#]?\s*"
                      r"(?P<value>[A-Z0-9][A-Z0-9\-\/]{1,19})", re.I)
KNOWN_BRANDS = ["nestlé", "nestle", "amul", "milma", "britannia", "mother dairy", "nandini", "aavin", "heritage",
                "parle", "tata", "haldiram's", "haldirams", "mtr", "dabur", "patanjali", "kellogg's", "kelloggs",
                "maggi", "cadbury", "lays", "kissan", "everest", "eastern", "brahmins", "double horse", "nirapara",
                "aashirvaad", "fortune", "saffola", "hershey's", "kraft", "heinz", "danone", "epigamia",
                "go cheese", "del monte", "pepsico", "coca-cola", "colgate", "dove", "surf excel", "ariel"]
NOISE_RE = re.compile(r"(ingredients|nutrition|energy|protein|fat|carbohydrate|mrp|rs\.?|₹|incl|taxes|fssai|"
                      r"lic\.?\s*no|customer|care|marketed|manufactured\s*by|store|keep|refrigerat|www\.|@|"
                      r"veg|non-veg|serving|per\s*100)", re.I)


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


def _year(y: str) -> int:
    y = y.lstrip("'")
    n = int(y)
    return n + 2000 if len(y) == 2 else n


def _safe_date(y, m, d):
    try:
        return date(y, m, d)
    except ValueError:
        return None


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
                if not 1 <= month <= 12:
                    continue
                precision = "month"
                alts = [f"{y:04d}-{month:02d}"]  # month only: do not guess a day
            if value is None and precision == "day":
                continue
            if precision == "day" and not 1990 <= value.year <= 2100:
                continue
            taken.append((s, e))
            yield s, e, m.group(0), value, precision, ambiguous, alts


def _label_kind(match) -> str:
    return next(k for k, v in match.groupdict().items() if v)


def extract_dates(lines: list[str], prefer_dmy: bool = True) -> list[DateCandidate]:
    candidates: list[DateCandidate] = []
    pending_label: str | None = None  # label on a line by itself applies to the next line
    for idx, line in enumerate(lines):
        labels = [(m.start(), _label_kind(m)) for m in LABEL_RE.finditer(line)]
        found = list(_parse_dates(line, prefer_dmy))
        for s, _e, raw, value, precision, ambiguous, alts in sorted(found, key=lambda x: x[0]):
            preceding = [k for pos, k in labels if pos < s]
            label = preceding[-1] if preceding else (pending_label or "unknown")
            candidates.append(DateCandidate(
                raw=raw, line=idx, label=label, value=value.isoformat() if value else None, precision=precision,
                ambiguous=ambiguous, alternatives=alts,
                note="Day and month could be swapped." if ambiguous else (
                    "Only month and year are printed — choose the exact day." if precision == "month" else ""),
            ))
        if labels and not found:
            pending_label = labels[-1][1]
        else:
            pending_label = None
    return candidates


def _resolve_with_consistency(cands: list[DateCandidate]) -> None:
    """If MFG and expiry were both read, use 'MFG ≤ expiry' to settle day/month order."""
    mfg = [c for c in cands if c.label in ("manufacturing", "packed") and c.value]
    exp = [c for c in cands if c.label in ("expiry", "use_by", "best_before") and c.value]
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
    exact = [c for c in matches if c.precision == "day" and c.value]
    distinct = {c.value for c in exact}
    if len(distinct) > 1:
        return Field(None, "none", "label", "Several dates were found for this field — choose one.")
    if not exact:
        return Field(None, "none", "label", matches[0].note)
    c = exact[0]
    if c.ambiguous:
        return Field(c.value, "low", "label", c.note)
    if c.note:
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
    return (Field(num, conf, "label" if score == 2 else "pattern"),
            Field(UNIT_MAP[m.group("unit").lower()], conf, "label" if score == 2 else "pattern"))


def _name_and_brand(lines: list[str]) -> tuple[Field, Field]:
    text_lines = [
        ln.strip() for ln in lines
        if len(re.sub(r"[^A-Za-zÀ-ÿഀ-ൿ]", "", ln)) >= 3 and not LABEL_RE.search(ln)
        and not NOISE_RE.search(ln) and not QTY_RE.search(ln) and not BATCH_RE.search(ln)
    ][:6]
    brand = Field()
    for ln in text_lines:
        if ln.lower().strip(" .,:") in KNOWN_BRANDS or any(ln.lower().startswith(b + " ") for b in KNOWN_BRANDS):
            match = next(b for b in KNOWN_BRANDS if ln.lower().startswith(b))
            brand = Field(ln[: len(match)].strip(), "medium", "known_brand")
            remainder = ln[len(match):].strip(" -:")
            if remainder:
                return Field(remainder.title(), "low", "heuristic", "Check the product name."), brand
            text_lines = [x for x in text_lines if x != ln]
            break
    if not text_lines:
        return Field(), brand
    name = Field(text_lines[0].title() if text_lines[0].isupper() else text_lines[0], "low", "heuristic",
                 "Product name guessed from the largest text block — please check.")
    if brand.value is None and len(text_lines) > 1:
        brand = Field(text_lines[0], "low", "heuristic", "Brand guessed from the first line — please check.")
        name = Field(text_lines[1].title() if text_lines[1].isupper() else text_lines[1], "low", "heuristic",
                     "Product name guessed — please check.")
    return name, brand


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
            mfg.confidence = "medium"
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
                                        precision="relative", note=note))
        warnings.append("Shelf life is printed relative to the manufacturing date. Confirm the date yourself.")
        break

    unlabelled = [c for c in candidates if c.label == "unknown"]
    if unlabelled:
        warnings.append("Some dates have no label (MFG/EXP). They were not used automatically — choose if needed.")
    if expiry.value is None and best_before.value is None:
        warnings.append("No expiry or best-before date could be confirmed from the image. Enter it manually.")
    if any(c.ambiguous for c in candidates):
        warnings.append("Some dates could be read as day/month or month/day. Please check them.")

    qty, unit = _quantity(raw_text)
    name, brand = _name_and_brand(lines)
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
