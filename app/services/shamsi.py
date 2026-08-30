"""Shamsi (Jalali) ↔ Gregorian conversion helpers."""
import re
from datetime import date

try:
    import jdatetime
except ImportError:
    jdatetime = None


def parse_shamsi(s: str):
    """Parse Shamsi date string to Gregorian date.

    Accepts: '1382', '1382/05/14', '1382-05-14', '1382/5/2', with Persian digits.
    Returns date or None.
    """
    if not s:
        return None
    # Persian digits -> ascii
    s = s.strip().replace(" ", "")
    persian = "۰۱۲۳۴۵۶۷۸۹"
    for i, ch in enumerate(persian):
        s = s.replace(ch, str(i))
    # year only
    if re.fullmatch(r"\d{4}", s):
        s = f"{s}/01/01"
    m = re.fullmatch(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})", s)
    if not m:
        return None
    jy, jm, jd = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1200 <= jy <= 1500 and 1 <= jm <= 12 and 1 <= jd <= 31):
        return None
    if jdatetime is None:
        return None
    try:
        jd_obj = jdatetime.date(jy, jm, jd)
        g = jd_obj.togregorian()
        return date(g.year, g.month, g.day)
    except Exception:
        return None


def gregorian_to_shamsi_str(d: date) -> str:
    if not d or jdatetime is None:
        return d.isoformat() if d else ""
    try:
        jd_obj = jdatetime.date.fromgregorian(date=d)
        return f"{jd_obj.year:04d}/{jd_obj.month:02d}/{jd_obj.day:02d}"
    except Exception:
        return d.isoformat()


def calc_age(birth_date: date) -> int | None:
    if not birth_date:
        return None
    today = date.today()
    age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
    return age if age >= 0 else None
