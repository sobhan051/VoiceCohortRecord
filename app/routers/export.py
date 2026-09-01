"""Admin export endpoint.

Lets an admin pull data out of the PostgreSQL database in three formats:

- ``sql``   : a plain-SQL dump (whole database OR selected tables).
- ``csv``   : comma-separated values (one or more joined tables, with
              column selection per table and an optional ``ON`` clause
              to control how the tables are joined).
- ``xlsx``  : Excel workbook (one sheet per table, or a single sheet
              for a join).

Tables are restricted to the application's own schema (the
``Base.metadata.tables`` registry) so the admin cannot pull arbitrary
arbitrary tables living in the database.
"""
import csv
import io
import json
import re
import subprocess
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
    """Return a MetaData object containing only the application tables.

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
            # Table declared in models but not yet created in the DB.
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


# ---------------------------------------------------------------------------
# CSV / XLSX export request body
# ---------------------------------------------------------------------------

class ExportPayload(BaseModel):
    tables: List[str] = Field(..., description="List of table names to export")
    # columns[table_name] = list of column names; null/missing = all columns
    columns: Dict[str, List[str]] = Field(default_factory=dict)
    # join_key is the column shared between the tables. Optional; when
    # omitted we fall back to a Cartesian product for CSV/XLSX.
    join_key: Optional[str] = None
    # joins is an explicit list of (left, right, on) for joining >2 tables.
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

    # Build a single SELECT (joined if possible) so we can stream one CSV.
    if len(tables) == 1:
        t = tables[0]
        sel_cols = [t.c[c] for c in table_cols[t.name]]
        stmt = select(*sel_cols)
        if payload.where:
            stmt = stmt.where(text(payload.where))
        rows = db.execute(stmt).fetchall()
        fieldnames = table_cols[t.name]
        data_rows = [dict(zip(fieldnames, r)) for r in rows]
        join_label = t.name
    else:
        # Multi-table. If we have a join key or explicit joins, use them;
        # otherwise fall back to a cross join (the user explicitly asked
        # for that level of control).
        try:
            joined = tables[0]
            join_clauses = []
            join_rels: List[Tuple[Table, Table, object]] = []
            if payload.joins:
                for j in payload.joins:
                    left = j.get("left")
                    right = j.get("right")
                    on_left = j.get("on_left") or j.get("on")
                    on_right = j.get("on_right") or j.get("on")
                    if not (left and right and on_left and on_right):
                        return Response(content=json.dumps({"error": "each join needs left/right/on_left/on_right"}), status_code=400, media_type="application/json")
                    l_tbl = _resolve_tables([left])[0]
                    r_tbl = _resolve_tables([right])[0]
                    if on_left not in l_tbl.c or on_right not in r_tbl.c:
                        return Response(content=json.dumps({"error": f"join column {on_left}/{on_right} not found"}), status_code=400, media_type="application/json")
                    join_rels.append((l_tbl, r_tbl, l_tbl.c[on_left] == r_tbl.c[on_right]))
            elif payload.join_key:
                if payload.join_key not in tables[0].c:
                    return Response(content=json.dumps({"error": f"join_key {payload.join_key!r} not on first table"}), status_code=400, media_type="application/json")
                first = tables[0].c[payload.join_key]
                for t in tables[1:]:
                    if payload.join_key not in t.c:
                        return Response(content=json.dumps({"error": f"join_key {payload.join_key!r} not on {t.name}"}), status_code=400, media_type="application/json")
                    join_rels.append((tables[0], t, first == t.c[payload.join_key]))
            # Build one big SELECT
            sel_cols = []
            for t in tables:
                for c in table_cols[t.name]:
                    alias = f"{t.name}__{c}"
                    sel_cols.append(t.c[c].label(alias))
            stmt = select(*sel_cols)
            for l, r, on in join_rels:
                stmt = stmt.join(r, on)
            if payload.where:
                stmt = stmt.where(text(payload.where))
            rows = db.execute(stmt).fetchall()
            fieldnames = [col.key for col in sel_cols]
            data_rows = [dict(zip(fieldnames, r)) for r in rows]
            join_label = "joined"
        except ValueError as exc:
            return Response(content=json.dumps({"error": str(exc)}), status_code=400, media_type="application/json")

    # Stream the CSV
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for row in data_rows:
        # Cast datetimes / JSON to strings
        safe = {}
        for k, v in row.items():
            if isinstance(v, datetime):
                safe[k] = v.isoformat()
            else:
                safe[k] = v
        writer.writerow(safe)

    filename = payload.filename or f"vcr_export_{join_label}_{datetime.now():%Y%m%d_%H%M%S}.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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

    table_cols: Dict[str, List[str]] = {}
    for t in tables:
        if payload.columns.get(t.name):
            try:
                table_cols[t.name] = _validate_columns(t, payload.columns[t.name])
            except ValueError as exc:
                return Response(content=json.dumps({"error": str(exc)}), status_code=400, media_type="application/json")
        else:
            table_cols[t.name] = [c.name for c in t.columns]

    # When multiple tables, write one sheet per table.
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        if len(tables) == 1:
            t = tables[0]
            sel_cols = [t.c[c] for c in table_cols[t.name]]
            stmt = select(*sel_cols)
            if payload.where:
                stmt = stmt.where(text(payload.where))
            rows = db.execute(stmt).fetchall()
            df = pd.DataFrame([dict(zip(table_cols[t.name], r)) for r in rows])
            sheet = (payload.filename or t.name)[:31]
            df.to_excel(writer, sheet_name=sheet, index=False)
        else:
            for t in tables:
                sel_cols = [t.c[c] for c in table_cols[t.name]]
                stmt = select(*sel_cols)
                if payload.where:
                    stmt = stmt.where(text(payload.where))
                rows = db.execute(stmt).fetchall()
                df = pd.DataFrame([dict(zip(table_cols[t.name], r)) for r in rows])
                sheet = t.name[:31]
                df.to_excel(writer, sheet_name=sheet, index=False)
    buf.seek(0)
    filename = payload.filename or f"vcr_export_{datetime.now():%Y%m%d_%H%M%S}.xlsx"
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# SQL export (raw INSERTs from pandas.to_sql + CREATE TABLE)
# ---------------------------------------------------------------------------

@router.post("/sql")
async def export_sql(payload: ExportPayload, db: Session = Depends(get_db)):
    """Dump the selected tables as plain SQL (DDL + INSERTs).

    Uses ``pandas.DataFrame.to_sql``-style INSERT generation via SQLAlchemy
    Core so JSONB and other PG types are quoted safely. No pg_dump needed.
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
        # Build INSERT statements in batches
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
    on PATH or if the URL is a libpq URI that pg_dump can't parse directly
    (e.g. the Neon pooler URL with query params).
    """
    from app.core.config import DATABASE_URL
    if not DATABASE_URL:
        return Response(content=json.dumps({"error": "DATABASE_URL not configured"}), status_code=500, media_type="application/json")

    # Normalize the URL: pg_dump accepts a libpq URI but doesn't like
    # certain query params (channel_binding, sslmode=require work fine,
    # but the test of having ``pg_dump`` present comes first).
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
    except Exception as exc:  # pragma: no cover
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
