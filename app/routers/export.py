"""Admin export endpoint.

Lets an admin pull data out of the PostgreSQL database in three formats:

- ``sql``   : a plain-SQL dump (whole database OR selected tables).
- ``csv``   : comma-separated values.  One CSV file per selected table;
              multiple tables are bundled into a single **ZIP archive**.
- ``xlsx``  : Excel workbook with one worksheet per selected table.

Tables are restricted to the application's own schema (the
``Base.metadata.tables`` registry) so the admin cannot pull arbitrary
tables living in the database.
"""
import csv
import io
import json
import re
import subprocess
import zipfile
from datetime import datetime
from typing import Dict, Iterable, List, Optional, Set, Tuple

import pandas as pd
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import MetaData, Table, inspect, select, text
from sqlalchemy.orm import Session

from app import models  # noqa: F401  -- imported so model classes register on Base.metadata
from app.db.base import Base
from app.db.session import engine, get_db

router = APIRouter(prefix="/api/admin/export")


# ---------------------------------------------------------------------------
# Catalog: list every app-owned table and its columns
# ---------------------------------------------------------------------------

def _app_metadata() -> MetaData:
    """Return the SQLAlchemy MetaData containing only the application tables.

    ``Base.metadata`` includes every model that has been imported in this
    process — the same set ``create_all`` writes. That's the safe surface
    we want to expose to the export UI.
    """
    return Base.metadata


@router.get("/tables")
async def list_tables(db: Session = Depends(get_db)):
    """Return one entry per app table: name + ordered column list with type."""
    md = _app_metadata()
    insp = inspect(engine)
    db_tables: Set[str] = set(insp.get_table_names(schema="public"))
    result = []
    for table in md.sorted_tables:
        name = table.name
        if name not in db_tables:
            continue
        cols = []
        for col in table.columns:
            cols.append({
                "name": col.name,
                "type": str(col.type),
                "nullable": col.nullable,
                "primary_key": col.primary_key,
            })
        result.append({"name": name, "columns": cols})
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SAFE_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _quote_ident(name: str) -> str:
    """Validate + double-quote a SQL identifier to prevent injection."""
    if not _SAFE_IDENT.match(name):
        raise ValueError(f"Invalid SQL identifier: {name!r}")
    return '"' + name.replace('"', '""') + '"'


def _resolve_tables(names: Iterable[str]) -> List[Table]:
    md = _app_metadata()
    tables: List[Table] = []
    for n in names:
        if n not in md.tables:
            raise ValueError(f"Unknown table: {n!r}")
        tables.append(md.tables[n])
    return tables


def _validate_columns(table: Table, cols: Iterable[str]) -> List[str]:
    """Keep only columns that exist on the table; preserve caller order."""
    out: List[str] = []
    for c in cols:
        if c in table.c:
            out.append(c)
        else:
            raise ValueError(f"Column {c!r} not found on table {table.name!r}")
    return out


def _fetch_single_table(
    db: Session, t: Table, cols: List[str], where: Optional[str]
) -> Tuple[List[str], List[Dict]]:
    """Fetch all rows from one table and return (fieldnames, data_rows)."""
    sel_cols = [t.c[c] for c in cols]
    stmt = select(*sel_cols)
    if where:
        stmt = stmt.where(text(where))
    rows = db.execute(stmt).fetchall()
    fieldnames = cols
    data_rows = [dict(zip(fieldnames, r)) for r in rows]
    return fieldnames, data_rows


def _strip_ext(name: str) -> str:
    """Strip a trailing .csv or .xlsx extension (case-insensitive)."""
    for ext in (".csv", ".xlsx"):
        if name.lower().endswith(ext):
            return name[:-len(ext)]
    return name


def _write_csv(buf: io.StringIO, fieldnames: List[str], data_rows: List[Dict]) -> None:
    """Write rows to a CSV file object, casting datetimes to strings."""
    writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in data_rows:
        safe = {}
        for k in fieldnames:
            v = row.get(k)
            if isinstance(v, datetime):
                safe[k] = v.isoformat()
            elif v is None:
                safe[k] = ""
            else:
                safe[k] = v
        writer.writerow(safe)


# ---------------------------------------------------------------------------
# CSV / XLSX export request body
# ---------------------------------------------------------------------------

class ExportPayload(BaseModel):
    tables: List[str] = Field(..., description="List of table names to export")
    columns: Dict[str, List[str]] = Field(default_factory=dict, description="columns[table_name] = list of column names; null/missing = all columns")
    join_key: Optional[str] = None
    joins: Optional[List[Dict[str, str]]] = None
    where: Optional[str] = Field(default=None, description="Optional raw WHERE clause; identifiers must be quoted already")
    filename: Optional[str] = None


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------

@router.post("/csv")
async def export_csv(payload: ExportPayload, db: Session = Depends(get_db)):
    try:
        tables = _resolve_tables(payload.tables)
    except ValueError as exc:
        return Response(content=json.dumps({"error": str(exc)}), status_code=400, media_type="application/json")

    if not tables:
        return Response(content=json.dumps({"error": "No tables provided"}), status_code=400, media_type="application/json")

    # Resolve columns per table (validate against model metadata)
    table_cols: Dict[str, List[str]] = {}
    for t in tables:
        if payload.columns.get(t.name):
            try:
                table_cols[t.name] = _validate_columns(t, payload.columns[t.name])
            except ValueError as exc:
                return Response(content=json.dumps({"error": str(exc)}), status_code=400, media_type="application/json")
        else:
            table_cols[t.name] = [c.name for c in t.columns]

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    # Single table -> one CSV response.
    if len(tables) == 1:
        t = tables[0]
        fieldnames, data_rows = _fetch_single_table(db, t, table_cols[t.name], payload.where)
        buf = io.StringIO()
        _write_csv(buf, fieldnames, data_rows)
        filename = payload.filename or f"vcr_export_{t.name}_{ts}.csv"
        return Response(
            content=buf.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # Multiple tables -> ZIP archive, one CSV file per selected table.
    raw_name = _strip_ext(payload.filename or "")
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for t in tables:
            fieldnames, data_rows = _fetch_single_table(db, t, table_cols[t.name], payload.where)
            csv_buf = io.StringIO()
            _write_csv(csv_buf, fieldnames, data_rows)
            fname = (f"{raw_name}_{t.name}" if raw_name else f"vcr_export_{t.name}_{ts}") + ".csv"
            zf.writestr(fname, csv_buf.getvalue())

    zip_filename = f"{raw_name}.zip" if raw_name else f"vcr_export_{ts}.zip"
    return Response(
        content=zip_buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'},
    )


# ---------------------------------------------------------------------------
# XLSX export
# ---------------------------------------------------------------------------

@router.post("/xlsx")
async def export_xlsx(payload: ExportPayload, db: Session = Depends(get_db)):
    try:
        tables = _resolve_tables(payload.tables)
    except ValueError as exc:
        return Response(content=json.dumps({"error": str(exc)}), status_code=400, media_type="application/json")

    if not tables:
        return Response(content=json.dumps({"error": "No tables provided"}), status_code=400, media_type="application/json")

    # Resolve columns per table
    table_cols: Dict[str, List[str]] = {}
    for t in tables:
        if payload.columns.get(t.name):
            try:
                table_cols[t.name] = _validate_columns(t, payload.columns[t.name])
            except ValueError as exc:
                return Response(content=json.dumps({"error": str(exc)}), status_code=400, media_type="application/json")
        else:
            table_cols[t.name] = [c.name for c in t.columns]

    # Pre-compute all data outside the ExcelWriter context so that
    # database errors surface cleanly instead of producing an empty
    # workbook that openpyxl rejects.
    raw_name = _strip_ext(payload.filename or "")
    sheets_data: List[Tuple[str, List[str], List[Dict]]] = []
    used_sheets: Set[str] = set()
    for t in tables:
        fieldnames, data_rows = _fetch_single_table(db, t, table_cols[t.name], payload.where)
        # Build a unique sheet name (Excel: max 31 chars, no duplicates).
        if raw_name:
            base = raw_name[:28]
        else:
            base = t.name[:31]
        sheet = base
        suffix = 1
        while sheet in used_sheets:
            suffix += 1
            sheet = f"{base[:28]}_{suffix}"
        used_sheets.add(sheet)
        sheets_data.append((sheet, fieldnames, data_rows))

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        for sheet, fieldnames, data_rows in sheets_data:
            df = pd.DataFrame(data_rows, columns=fieldnames)
            if not df.empty:
                for col in df.columns:
                    df[col] = df[col].apply(
                        lambda v: v.isoformat() if isinstance(v, datetime) else v
                    )
            df.to_excel(writer, sheet_name=sheet, index=False)

    buf.seek(0)
    filename = f"{raw_name}.xlsx" if raw_name else f"vcr_export_{datetime.now():%Y%m%d_%H%M%S}.xlsx"
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# SQL export (raw INSERTs from SQLAlchemy Core)
# ---------------------------------------------------------------------------

@router.post("/sql")
async def export_sql(payload: ExportPayload, db: Session = Depends(get_db)):
    """Dump the selected tables as plain SQL (DDL + INSERTs).

    When ``tables`` is empty, every app table is dumped. Inserts are
    batched 500 rows at a time. No pg_dump needed.
    """
    try:
        tables = _resolve_tables(payload.tables) if payload.tables else _resolve_tables([t.name for t in _app_metadata().sorted_tables])
    except ValueError as exc:
        return Response(content=json.dumps({"error": str(exc)}), status_code=400, media_type="application/json")

    if not tables:
        return Response(content=json.dumps({"error": "No tables provided"}), status_code=400, media_type="application/json")

    parts: List[str] = []
    parts.append(f"-- VCR export generated {datetime.now().isoformat()}\n")
    parts.append("BEGIN;\n")

    for t in tables:
        cols = payload.columns.get(t.name) or [c.name for c in t.columns]
        try:
            cols = _validate_columns(t, cols)
        except ValueError as exc:
            return Response(content=json.dumps({"error": str(exc)}), status_code=400, media_type="application/json")

        sel_cols = [t.c[c] for c in cols]
        rows = db.execute(select(*sel_cols)).fetchall()
        if not rows:
            parts.append(f"\n-- table {t.name} is empty; skipping\n")
            continue
        col_list = ", ".join(_quote_ident(c) for c in cols)
        parts.append(f"\n-- {t.name} ({len(rows)} rows)\n")
        batch: List[str] = []
        for r in rows:
            values = []
            for v in r:
                if v is None:
                    values.append("NULL")
                elif isinstance(v, (int, float)):
                    values.append(str(v))
                elif isinstance(v, bool):
                    values.append("TRUE" if v else "FALSE")
                elif isinstance(v, datetime):
                    values.append(f"'{v.isoformat()}'")
                else:
                    s = str(v).replace("'", "''")
                    values.append(f"'{s}'")
            batch.append(f"({', '.join(values)})")
            if len(batch) >= 500:
                parts.append(
                    f"INSERT INTO {_quote_ident(t.name)} ({col_list}) VALUES\n  "
                    + ",\n  ".join(batch) + ";\n"
                )
                batch = []
        if batch:
            parts.append(
                f"INSERT INTO {_quote_ident(t.name)} ({col_list}) VALUES\n  "
                + ",\n  ".join(batch) + ";\n"
            )

    parts.append("\nCOMMIT;\n")
    filename = payload.filename or f"vcr_export_{datetime.now():%Y%m%d_%H%M%S}.sql"
    return Response(
        content="".join(parts),
        media_type="application/sql; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Full SQL backup using pg_dump (the most faithful PostgreSQL dump)
# ---------------------------------------------------------------------------

@router.get("/pgdump")
async def export_pgdump():
    """Run ``pg_dump`` against the configured DATABASE_URL and stream it back.

    Falls back to a plain-SQL reconstruction if ``pg_dump`` isn't available
    on PATH or if pg_dump fails for any other reason.
    """
    from app.core.config import DATABASE_URL
    if not DATABASE_URL:
        return Response(content=json.dumps({"error": "DATABASE_URL not configured"}), status_code=500, media_type="application/json")

    try:
        proc = subprocess.run(
            ["pg_dump", DATABASE_URL, "--no-owner", "--no-privileges"],
            capture_output=True,
            timeout=120,
            check=False,
        )
        if proc.returncode == 0 and proc.stdout:
            filename = f"vcr_pgdump_{datetime.now():%Y%m%d_%H%M%S}.sql"
            return Response(
                content=proc.stdout,
                media_type="application/sql; charset=utf-8",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )
        # pg_dump failed — fall through to the in-process dump.
        err = proc.stderr.decode("utf-8", errors="replace")[:500]
    except FileNotFoundError:
        err = "pg_dump binary not found on PATH"
    except Exception as exc:
        err = f"pg_dump failed: {exc}"

    # Fallback: in-process SQL dump of every app table
    payload = ExportPayload(tables=[])
    fallback = await export_sql(payload, db=next(get_db()))
    if isinstance(fallback, Response) and fallback.status_code == 200:
        headers = dict(fallback.headers)
        headers["Content-Disposition"] = (
            f'attachment; filename="vcr_pgdump_fallback_{datetime.now():%Y%m%d_%H%M%S}.sql"'
        )
        headers["X-PgDump-Error"] = err
        return Response(content=fallback.body, headers=headers, media_type="application/sql; charset=utf-8")
    return Response(content=json.dumps({"error": "pg_dump failed and fallback failed", "pg_dump_error": err}), status_code=500, media_type="application/json")
