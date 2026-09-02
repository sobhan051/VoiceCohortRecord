"""Shared question-visibility (dependency) evaluator.

Rules live on ``questions.visibility_rules`` (JSONB) and look like:

    {
        "logic": "all",   # "all" = AND over rules, "any" = OR
        "rules": [
            {"v_code": "R1", "values": ["1"]},
            {"v_code": "R4", "values": ["1", "2"], "deactive_options": ["3"]}
        ]
    }

Semantics (mirrored 1:1 in static/app.js):
- Multiple rules are combined with AND (logic="all") or OR (logic="any").
- Multiple values inside one rule are OR'd (R4 == 1 OR R4 == 2).
- A parent whose answer is missing/empty/"N/A" fails its rule.
- MultiSelect parents store "1,3" — the rule passes if ANY selected code matches.
- Grouped (repeated-entry) parents store "BASE_0", "BASE_1", ... — a rule on
  such a parent passes if ANY stored entry matches.
- Each rule may carry ``deactive_options``: a list of option codes of the
  current question that should be disabled while the rule's parent answer
  matches. Use this for "if A24 ∈ {2,3,4} then disable option 1 and 3 of A25".

``normalize_answers`` is the backend correction step: it forces "N/A" onto
non-applicable answers and strips bogus "N/A" values from applicable ones, so
even if the extraction model misjudges a dependency, the stored data is right.
"""
import json
import re

_INDEXED_RE = re.compile(r"^(.+?)_(\d+)$")


def parse_rules(raw):
    """Validate/normalize a raw visibility_rules value. Returns
    {"logic": "all"|"any", "rules": [...]} or None when absent/invalid.

    Each rule may carry an optional ``deactive_options`` list: when the rule's
    parent question evaluates to TRUE (matches one of ``values``), those option
    codes of the current question are disabled.
    """
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return None
    if not isinstance(raw, dict):
        return None
    raw_rules = raw.get("rules")
    if not isinstance(raw_rules, list):
        return None
    rules = []
    for r in raw_rules:
        if not isinstance(r, dict):
            continue
        v_code = r.get("v_code")
        values = r.get("values")
        if not v_code or not isinstance(values, list) or not values:
            continue
        rule = {"v_code": str(v_code), "values": [str(v) for v in values]}
        deactive = r.get("deactive_options")
        if isinstance(deactive, list) and deactive:
            rule["deactive_options"] = [str(v) for v in deactive]
        rules.append(rule)
    if not rules:
        return None
    logic = raw.get("logic", "all")
    if logic not in ("all", "any"):
        logic = "all"
    return {"logic": logic, "rules": rules}


def _effective_answer(v_code, answers):
    """Answer for a parent v_code, collapsing grouped BASE_0/BASE_1 entries
    into one comma-joined value (multi-select-like semantics)."""
    direct = answers.get(v_code)
    if direct not in (None, ""):
        return direct
    entries = []
    for key, val in answers.items():
        m = _INDEXED_RE.match(str(key))
        if m and m.group(1) == v_code and val not in (None, ""):
            entries.append((int(m.group(2)), val))
    if not entries:
        return None
    entries.sort(key=lambda e: e[0])
    return ",".join(str(v) for _, v in entries)


def _rule_ok(rule, answers):
    value = _effective_answer(rule["v_code"], answers)
    if value is None:
        return False
    value = str(value).strip()
    if value == "" or value.upper() == "N/A":
        return False
    allowed = [str(v) for v in rule["values"]]
    if "," in value:
        selected = [v.strip() for v in value.split(",") if v.strip()]
        return any(v in allowed for v in selected)
    return value in allowed


def is_applicable(rules, answers):
    """True when the question these rules belong to applies given ``answers``."""
    rules = parse_rules(rules)
    if not rules:
        return True
    results = [_rule_ok(r, answers) for r in rules["rules"]]
    return any(results) if rules["logic"] == "any" else all(results)


def normalize_answers(questions, answers):
    """Apply every question's visibility rules to an answer set.

    - dependency NOT met  -> value forced to "N/A"
    - dependency met      -> a stored "N/A" value is removed

    Rules may reference parents recorded in any section, so pass the FULL
    answer set, not just one section's answers. Only keys belonging to the
    given ``questions`` are touched.

    Returns ``(normalized_answers, applicable_map)`` where applicable_map
    maps each rules-bearing v_code to True/False.
    """
    answers = dict(answers or {})
    applicable_map = {}
    for q in questions:
        rules = parse_rules(getattr(q, "visibility_rules", None))
        if not rules:
            continue
        v_code = q.v_code
        ok = is_applicable(rules, answers)
        applicable_map[v_code] = ok
        own_keys = [
            k for k in answers
            if k == v_code
            or (_INDEXED_RE.match(str(k)) and _INDEXED_RE.match(str(k)).group(1) == v_code)
        ]
        if ok:
            for k in own_keys:
                if str(answers[k]).strip().upper() == "N/A":
                    del answers[k]
        else:
            for k in own_keys:
                answers[k] = "N/A"
    return answers, applicable_map


def get_deactive_options(rules, answers):
    """Collect every option code that should be deactivated on the question
    that owns these rules. Each rule may list ``deactive_options``; if the
    rule's parent answer matches the rule, those options become inactive.

    Returns a list of option codes (possibly empty, de-duplicated, order
    preserved).
    """
    rules = parse_rules(rules)
    if not rules:
        return []
    out = []
    seen = set()
    for r in rules["rules"]:
        deactive = r.get("deactive_options")
        if not deactive:
            continue
        if _rule_ok(r, answers):
            for opt in deactive:
                if opt not in seen:
                    seen.add(opt)
                    out.append(opt)
    return out
