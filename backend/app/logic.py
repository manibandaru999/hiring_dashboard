from __future__ import annotations
from pathlib import Path
from typing import Any
import datetime
import os
import threading
import time
from dateutil import parser
import numpy as np
import pandas as pd
from .config import SOURCE_DIR, DEFAULT_FILE_NAME, DATE_COLUMNS, NUMERIC_COLUMNS, REQUIRED_COLUMNS, WAITING_STAGES

# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def normalize_text(v: object) -> str:
    return "" if pd.isna(v) else str(v).strip()


def standardize_round_status(status_str: str, feedback_str: str) -> tuple[str, str]:
    s = normalize_text(status_str).lower().strip()
    f = normalize_text(feedback_str).strip()
    if not s or s in {'nan', 'null', '—', ''}:
        return '', f
    is_clear_val = any(x in s for x in ['clear', 'select', 'pass', 'join', 'offer', 'shortlist', 'done', 'completed'])
    is_reject_val = any(x in s for x in ['reject', 'fail', 'not clear', 'rejedt'])
    is_hold_val = 'hold' in s
    is_declined_val = 'decline' in s
    is_scheduled_val = any(x in s for x in ['schedule', 'reschedule', 'book'])
    is_inactive_val = any(x in s for x in ['inactive', 'dropped', 'redirect', 'no show', 'cancelled', 'cancel'])
    if is_clear_val: std_status = 'Cleared'
    elif is_reject_val: std_status = 'Rejected'
    elif is_hold_val: std_status = 'On Hold'
    elif is_declined_val: std_status = 'Declined'
    elif is_scheduled_val: std_status = 'Scheduled'
    elif is_inactive_val: std_status = 'Inactive'
    else: std_status = 'Pending'
    simple_words = {'cleared', 'clear', 'selected', 'select', 'passed', 'pass', 'done', 'completed', 'rejected', 'reject', 'failed', 'fail', 'not cleared', 'on hold', 'hold', 'pending hold', 'declined', 'decline', 'scheduled', 'schedule', 'inactive'}
    if s not in simple_words and len(s) > 3:
        f = f"{status_str} | {f}" if f else status_str
    return std_status, f


def standardize_overall_status(status_str: str, comment_str: str) -> tuple[str, str]:
    s = normalize_text(status_str).lower().strip()
    c = normalize_text(comment_str).strip()
    if not s or s in {'nan', 'null', '—', ''}:
        return '', c
    is_select_val = any(x in s for x in ['clear', 'select', 'pass', 'join', 'offer', 'shortlist', 'done', 'completed', 'team'])
    is_reject_val = any(x in s for x in ['reject', 'fail', 'not clear', 'rejedt'])
    is_hold_val = 'hold' in s
    is_declined_val = any(x in s for x in ['decline', 'no show'])
    is_scheduled_val = any(x in s for x in ['schedule', 'reschedule', 'book'])
    is_inactive_val = any(x in s for x in ['inactive', 'dropped', 'redirect', 'cancelled', 'cancel', 'not attached'])
    if is_select_val: std_status = 'Selected'
    elif is_reject_val: std_status = 'Rejected'
    elif is_hold_val: std_status = 'On Hold'
    elif is_declined_val: std_status = 'Declined'
    elif is_scheduled_val: std_status = 'Scheduled'
    elif is_inactive_val: std_status = 'Inactive'
    else: std_status = 'Pending'
    simple_words = {'selected', 'select', 'cleared', 'clear', 'joined', 'offered', 'rejected', 'reject', 'failed', 'fail', 'not cleared', 'on hold', 'hold', 'declined', 'decline', 'scheduled', 'schedule', 'inactive'}
    if s not in simple_words and len(s) > 3:
        c = f"{status_str} | {c}" if c else status_str
    return std_status, c


def is_clear(v): return normalize_text(v).lower() in {"cleared","clear","selected","passed","pass","done","completed"}
def is_reject(v): return normalize_text(v).lower() in {"rejected","reject","failed","fail","not cleared"}
def is_hold(v): return normalize_text(v).lower() in {"on hold","hold","pending hold","candidate hold","client hold"}
def is_closed(v): return normalize_text(v).lower() in {"selected","rejected","declined","on hold","hold","inactive"}
def is_conducted(v):
    s = normalize_text(v).lower()
    return s in {"cleared","clear","selected","passed","pass","done","completed","rejected","reject","failed","fail","not cleared","on hold","hold","pending hold","candidate hold","client hold"}
def pct(n,d): return 0.0 if not d or pd.isna(d) else round((n/d)*100,1)
def safe_days(end,start): return (end-start).dt.days.where(start.notna() & end.notna())


def notice_bucket(v):
    s=normalize_text(v).lower(); digs=''.join(ch for ch in s if ch.isdigit())
    if 'immediate' in s or s in {'0','0 days'}: return 'Immediate'
    if not digs: return 'Unknown'
    d=int(digs)
    return '<= 15 Days' if d<=15 else '16-30 Days' if d<=30 else '31-60 Days' if d<=60 else '60+ Days'


# ---------------------------------------------------------------------------
# Vectorized status sets (for np.select usage)
# ---------------------------------------------------------------------------
_CLEAR_SET = {"cleared","clear","selected","passed","pass","done","completed"}
_REJECT_SET = {"rejected","reject","failed","fail","not cleared"}
_HOLD_SET = {"on hold","hold","pending hold","candidate hold","client hold"}


# ---------------------------------------------------------------------------
# Fast vectorized date parsing
# ---------------------------------------------------------------------------

def parse_date_series(s: pd.Series) -> pd.Series:
    """Parse a date series efficiently.

    Strategy:
    1. Try a fast bulk vectorized parse covering the majority of values.
    2. For cells that remain NaT, fall back to the original per-cell parser
       (handles exotic formats like DD-MMM, MMM-DD, Excel serial numbers, etc.)
    """
    import re

    current_year = datetime.datetime.now().year

    def _parse_single_val(val):
        """Fallback for exotic formats that pd.to_datetime cannot handle."""
        if pd.isna(val):
            return pd.NaT
        if isinstance(val, (datetime.datetime, datetime.date)):
            return pd.to_datetime(val)
        val_str = str(val).strip()
        if val_str.lower() in ['nat', 'nan', 'null', '']:
            return pd.NaT

        # 1. DD-MMM (e.g. 14-Oct, 04-Nov) → append current year
        m1 = re.match(r'^(\d{1,2})[-/\s]([A-Za-z]{3})$', val_str)
        if m1:
            day_str, month_str = m1.groups()
            try:
                return pd.to_datetime(parser.parse(f"{day_str} {month_str} {current_year}"))
            except Exception:
                pass

        # 2. MMM-DD (e.g. Oct-14) → append current year
        m2 = re.match(r'^([A-Za-z]{3})[-/\s](\d{1,2})$', val_str)
        if m2:
            month_str, day_str = m2.groups()
            try:
                return pd.to_datetime(parser.parse(f"{month_str} {day_str} {current_year}"))
            except Exception:
                pass

        # 3. Month-Year (Jun-2026, Jun/2026, Jun 2026)
        m3 = re.match(r'^([A-Za-z]{3})[-/\s](\d{4})$', val_str)
        if m3:
            month_str, year_val = m3.groups()
            try:
                return pd.to_datetime(parser.parse(f"{month_str} 1, {year_val}"))
            except Exception:
                pass

        # 4. Year-Month (2026-Jun)
        m4 = re.match(r'^(\d{4})[-/\s]([A-Za-z]{3})$', val_str)
        if m4:
            year_val, month_str = m4.groups()
            try:
                return pd.to_datetime(parser.parse(f"{month_str} 1, {year_val}"))
            except Exception:
                pass

        # 5. Year-Month numeric (2026-06, 2026/06)
        m5 = re.match(r'^(\d{4})[-/](\d{2})$', val_str)
        if m5:
            year, month = m5.groups()
            try:
                return pd.to_datetime(f"{year}-{month}-01")
            except Exception:
                pass

        # 6. Month-Year numeric (06-2026, 06/2026)
        m6 = re.match(r'^(\d{2})[-/](\d{4})$', val_str)
        if m6:
            month, year = m6.groups()
            try:
                return pd.to_datetime(f"{year}-{month}-01")
            except Exception:
                pass

        # 7. Excel serial number (float in range 30000-60000)
        try:
            num_val = float(val)
            if 30000 <= num_val <= 60000:
                return pd.to_datetime(num_val, unit='D', origin='1899-12-30')
        except (ValueError, TypeError):
            pass

        try:
            return pd.to_datetime(parser.parse(val_str, dayfirst=True))
        except Exception:
            return pd.to_datetime(val, errors='coerce')

    # --- Fast path: vectorized bulk parse covers YYYY-MM-DD and most ISO formats ---
    result = pd.to_datetime(s, errors='coerce')

    # --- Slow path: only process cells that failed the fast parse ---
    nat_mask = result.isna() & s.notna() & (s.astype(str).str.strip().str.lower() != '') & (s.astype(str).str.strip().str.lower() != 'nan')
    if nat_mask.any():
        result = result.copy()
        result[nat_mask] = s[nat_mask].apply(_parse_single_val)

    return result


# ---------------------------------------------------------------------------
# Vectorized pipeline stage & progression level (replaces df.apply row-by-row)
# ---------------------------------------------------------------------------

def _build_pipeline_vectorized(d: pd.DataFrame) -> pd.Series:
    """Compute 'Current Pipeline Stage' using np.select (fully vectorized)."""

    overall = d['Overall Status'].str.lower()

    # Boolean masks for overall status outcomes (closed states)
    cond_selected   = overall == 'selected'
    cond_rejected   = overall == 'rejected'
    cond_declined   = overall == 'declined'
    cond_hold       = overall.isin(['on hold', 'hold'])
    cond_inactive   = overall == 'inactive'

    l1_cleared  = d['L1 Cleared Flag']
    l2_cleared  = d['L2 Cleared Flag']
    cl1_cleared = d['Client L1 Cleared Flag']
    cl2_cleared = d['Client L2 Cleared Flag']

    l1_done  = d['L1 Completed Flag']
    l2_done  = d['L2 Completed Flag']
    cl1_done = d['Client L1 Completed Flag']
    cl2_done = d['Client L2 Completed Flag']

    l1_rej  = d['L1 Status'].str.lower().isin(_REJECT_SET)
    l2_rej  = d['L2 Status'].str.lower().isin(_REJECT_SET)
    cl1_rej = d['Client L1 Status'].str.lower().isin(_REJECT_SET)
    cl2_rej = d['Client L2 Status'].str.lower().isin(_REJECT_SET)

    conditions = [
        cond_selected,
        cond_rejected,
        cond_declined,
        cond_hold,
        cond_inactive,
        ~l1_done,
        l1_rej,
        l1_cleared & ~l2_done,
        l2_rej,
        l2_cleared & ~cl1_done,
        cl1_rej,
        cl1_cleared & ~cl2_done,
        cl2_rej,
        cl2_done & (overall == ''),
    ]
    choices = [
        'Closed - Selected',
        'Closed - Rejected',
        'Closed - Declined',
        'Closed - On Hold',
        'Closed - Inactive',
        'Waiting for L1',
        'Closed - Rejected at L1',
        'Cleared L1 - Waiting for L2',
        'Closed - Rejected at L2',
        'Cleared L2 - Waiting for Client L1',
        'Closed - Rejected at Client L1',
        'Cleared Client L1 - Waiting for Client L2',
        'Closed - Rejected at Client L2',
        'Client L2 Completed - Waiting for Final Decision',
    ]
    return pd.Series(
        np.select(conditions, choices, default='In Progress / Needs Review'),
        index=d.index
    )


def _build_progression_vectorized(d: pd.DataFrame) -> pd.Series:
    """Compute 'Progression Level' using np.select (fully vectorized)."""
    conditions = [
        d['Client L2 Completed Flag'],
        d['Client L1 Completed Flag'],
        d['L2 Completed Flag'],
        d['L1 Completed Flag'],
    ]
    choices = [
        'Progressed to Client L2',
        'Progressed to Client L1',
        'Progressed to L2',
        'Progressed to L1',
    ]
    return pd.Series(
        np.select(conditions, choices, default='Profile Received Only'),
        index=d.index
    )


# ---------------------------------------------------------------------------
# Notice period bucket (vectorized)
# ---------------------------------------------------------------------------

def _notice_bucket_vectorized(series: pd.Series) -> pd.Series:
    """Vectorized version of notice_bucket()."""
    s = series.fillna('').astype(str).str.lower().str.strip()
    nums = s.str.extract(r'(\d+)', expand=False).fillna('').apply(lambda x: int(x) if x else -1)

    result = pd.Series('Unknown', index=series.index)
    result[s.str.contains('immediate') | s.isin({'0', '0 days'})] = 'Immediate'
    result[(nums >= 0) & (nums <= 15)] = '<= 15 Days'
    result[(nums > 15) & (nums <= 30)] = '16-30 Days'
    result[(nums > 30) & (nums <= 60)] = '31-60 Days'
    result[nums > 60] = '60+ Days'
    return result


# ---------------------------------------------------------------------------
# Data cleaning
# ---------------------------------------------------------------------------

def clean(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()

    # Ensure all required columns exist
    for c in REQUIRED_COLUMNS:
        if c not in d.columns:
            d[c] = np.nan

    # --- Date columns: fast vectorized parse ---
    for c in DATE_COLUMNS:
        d[c] = parse_date_series(d[c])

    # --- Numeric columns ---
    for c in NUMERIC_COLUMNS:
        d[c] = pd.to_numeric(d[c], errors='coerce')

    # --- Text columns: vectorized normalization (fillna + astype + strip) ---
    text_cols = [c for c in d.columns if c not in DATE_COLUMNS + NUMERIC_COLUMNS]
    for c in text_cols:
        d[c] = d[c].fillna('').astype(str).str.strip()

    # Standardize round statuses (still needs paired iteration — vectorized where possible)
    for prefix in ['L1', 'L2', 'Client L1', 'Client L2']:
        status_col = f"{prefix} Status"
        feedback_col = f"{prefix} Feedback"
        if status_col in d.columns and feedback_col in d.columns:
            res = [standardize_round_status(s, f) for s, f in zip(d[status_col], d[feedback_col])]
            d[status_col] = [r[0] for r in res]
            d[feedback_col] = [r[1] for r in res]

    # Standardize overall status
    if 'Overall Status' in d.columns and 'Final Comments' in d.columns:
        res = [standardize_overall_status(s, c) for s, c in zip(d['Overall Status'], d['Final Comments'])]
        d['Overall Status'] = [r[0] for r in res]
        d['Final Comments'] = [r[1] for r in res]

    today = pd.Timestamp.today().normalize()

    # --- Flag columns (vectorized) ---
    d['L1 Cleared Flag']     = d['L1 Status'].str.lower().isin(_CLEAR_SET)
    d['L2 Cleared Flag']     = d['L2 Status'].str.lower().isin(_CLEAR_SET)
    d['Client L1 Cleared Flag'] = d['Client L1 Status'].str.lower().isin(_CLEAR_SET)
    d['Client L2 Cleared Flag'] = d['Client L2 Status'].str.lower().isin(_CLEAR_SET)

    d['L1 Completed Flag']     = d['L1 Date'].notna()     | (d['L1 Status'] != '')
    d['L2 Completed Flag']     = d['L2 Date'].notna()     | (d['L2 Status'] != '')
    d['Client L1 Completed Flag'] = d['Client L1 Date'].notna() | (d['Client L1 Status'] != '')
    d['Client L2 Completed Flag'] = d['Client L2 Date'].notna() | (d['Client L2 Status'] != '')

    overall_lower = d['Overall Status'].str.lower()
    d['Closed Flag']   = overall_lower.isin({'selected','rejected','declined','on hold','hold','inactive'})
    d['Selected Flag'] = overall_lower == 'selected'
    d['Rejected Flag'] = overall_lower == 'rejected'
    d['Declined Flag'] = overall_lower == 'declined'
    d['On Hold Flag']  = overall_lower.isin(['on hold','hold'])

    # --- Aging & cycle time (vectorized) ---
    last = d[['Client L2 Date','Client L1 Date','L2 Date','L1 Date','Profile Received Date']].bfill(axis=1).iloc[:, 0]
    end  = pd.to_datetime(np.where(d['Closed Flag'], last, today), errors='coerce')
    end  = pd.Series(end, index=d.index)

    d['Candidate Aging Days']       = safe_days(end, d['Profile Received Date'])
    d['Days From Profile To L1']    = safe_days(d['L1 Date'], d['Profile Received Date'])
    d['Days From L1 To L2']         = safe_days(d['L2 Date'], d['L1 Date'])
    d['Days From L2 To Client L1']  = safe_days(d['Client L1 Date'], d['L2 Date'])
    d['Days From Client L1 To Client L2'] = safe_days(d['Client L2 Date'], d['Client L1 Date'])
    d['Total Hiring Cycle Time']    = safe_days(pd.Series(last, index=d.index), d['Profile Received Date'])

    # --- Pipeline / Progression (fully vectorized — replaces df.apply(axis=1)) ---
    d['Current Pipeline Stage'] = _build_pipeline_vectorized(d)
    d['Progression Level']      = _build_progression_vectorized(d)

    # --- Notice Period (vectorized) ---
    d['Notice Period Bucket'] = _notice_bucket_vectorized(d['Notice Period'])

    # --- CTC derived ---
    d['CTC Gap'] = d['Expected CTC'] - d['Current CTC']
    d['Hike %']  = np.where(
        (d['Current CTC'].fillna(0) > 0) & d['Expected CTC'].notna(),
        ((d['Expected CTC'] - d['Current CTC']) / d['Current CTC']) * 100,
        np.nan
    )

    # --- SLA bucket ---
    d['SLA Bucket'] = pd.cut(
        d['Candidate Aging Days'].fillna(0),
        bins=[-1, 7, 15, 30, 60, 999999],
        labels=['0-7 Days', '8-15 Days', '16-30 Days', '31-60 Days', '60+ Days']
    )

    d['Candidate ID'] = d.index.astype(str)
    return d


# ---------------------------------------------------------------------------
# Optional columns enrichment
# ---------------------------------------------------------------------------

OPTIONAL_DATE_COLUMNS = [
    'PR Date', 'PR Shared Date', 'Offer Date', 'Joined Date', 'Selection Decision Date',
    'Position Open Date', 'Target Closure Date'
]
OPTIONAL_TEXT_COLUMNS = [
    'Project Name', 'FDS', 'VP', 'Client', 'PR Number', 'PR Status', 'Position Status',
    'Offer Status', 'Candidate Source', 'TA Partner', 'Hiring Priority'
]
OPTIONAL_NUMERIC_COLUMNS = ['Open Positions', 'Required Positions', 'Budget CTC']


def _clean_string_series(series: pd.Series) -> pd.Series:
    return series.fillna('').astype(str).str.strip()


def _fill_blank_from_series(target: pd.Series, fallback: pd.Series, default: str) -> pd.Series:
    target_clean   = _clean_string_series(target)
    fallback_clean = _clean_string_series(fallback)
    filled = target_clean.where(target_clean.ne(''), fallback_clean)
    return filled.where(filled.ne(''), default)


def _fill_blank_from_condition(target: pd.Series, condition: pd.Series, true_value: str, false_value: str) -> pd.Series:
    target_clean = _clean_string_series(target)
    fallback = pd.Series(np.where(condition.fillna(False), true_value, false_value), index=target.index)
    return target_clean.where(target_clean.ne(''), fallback)


def enrich_optional_columns(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()

    for c in OPTIONAL_TEXT_COLUMNS:
        if c not in d.columns:
            d[c] = ''
        d[c] = _clean_string_series(d[c])

    for c in OPTIONAL_DATE_COLUMNS:
        if c not in d.columns:
            d[c] = pd.NaT
        d[c] = parse_date_series(d[c])

    for c in OPTIONAL_NUMERIC_COLUMNS:
        if c not in d.columns:
            d[c] = np.nan
        d[c] = pd.to_numeric(d[c], errors='coerce')

    if d['Project Name'].eq('').all():
        d['Project Name'] = _fill_blank_from_series(d['Project Name'], d['Role Applied'], 'Unassigned Project')
    else:
        d['Project Name'] = d['Project Name'].where(d['Project Name'].ne(''), 'Unassigned Project')

    d['FDS']    = d['FDS'].where(d['FDS'].ne(''), 'Unmapped FDS')
    d['VP']     = _fill_blank_from_series(d['VP'], d['Director'], 'Unmapped VP')
    d['Client'] = d['Client'].where(d['Client'].ne(''), 'Internal / Not Available')
    d['PR Number']  = d['PR Number'].where(d['PR Number'].ne(''), 'PR Not Available')
    d['PR Status']  = d['PR Status'].where(d['PR Status'].ne(''), 'Not Updated')
    d['Position Status'] = _fill_blank_from_condition(d['Position Status'], d['Closed Flag'], 'Closed', 'Active')
    d['Offer Status']    = _fill_blank_from_condition(d['Offer Status'], d['Selected Flag'], 'Offer in Progress', 'Not Offered')
    d['Offer Released Flag'] = d['Offer Status'].str.lower().isin(['offered', 'joined', 'declined', 'offer in progress']) | d['Offer Date'].notna()
    d['Joined Flag']         = d['Offer Status'].str.lower().eq('joined') | d['Joined Date'].notna()

    d['Open Positions']    = d['Open Positions'].fillna(1)
    d['Required Positions'] = d['Required Positions'].fillna(d['Open Positions'])

    d['Interview Count'] = (
        d['L1 Completed Flag'].astype(int)
        + d['L2 Completed Flag'].astype(int)
        + d['Client L1 Completed Flag'].astype(int)
        + d['Client L2 Completed Flag'].astype(int)
    )

    d['Profile Month'] = d['Profile Received Date'].dt.to_period('M').astype(str).replace('NaT', '')
    d['Profile Week']  = d['Profile Received Date'].dt.to_period('W').astype(str).replace('NaT', '')
    d['Profile Year']  = d['Profile Received Date'].dt.year.fillna(0).astype(int).astype(str).replace('0', '')

    d['Selection Decision Date'] = d['Selection Decision Date'].fillna(
        d[['Client L2 Date', 'Client L1 Date', 'L2 Date', 'L1 Date', 'Profile Received Date']].bfill(axis=1).iloc[:, 0]
    )

    return d


# ---------------------------------------------------------------------------
# In-memory cache with mtime-based file-watch invalidation
# ---------------------------------------------------------------------------

class _DataCache:
    """Thread-safe cache that reloads only when the source Excel changes on disk."""

    def __init__(self):
        self._df: pd.DataFrame | None = None
        self._mtime: float = -1.0
        self._lock = threading.Lock()

    def _source_path(self) -> Path:
        p = SOURCE_DIR / DEFAULT_FILE_NAME
        if not p.exists():
            files = sorted(SOURCE_DIR.glob('*.xlsx'))
            if not files:
                raise FileNotFoundError(f'Place {DEFAULT_FILE_NAME} in {SOURCE_DIR}')
            p = files[0]
        return p

    def get(self) -> pd.DataFrame:
        p = self._source_path()
        mtime = p.stat().st_mtime

        # Fast path: no lock needed if mtime unchanged and df exists
        if self._df is not None and mtime == self._mtime:
            return self._df

        with self._lock:
            # Double-check inside lock
            if self._df is not None and mtime == self._mtime:
                return self._df
            # Reload from disk
            df = enrich_optional_columns(clean(pd.read_excel(p, sheet_name=0)))
            self._df    = df
            self._mtime = mtime
        return self._df


_cache = _DataCache()


def load_data() -> pd.DataFrame:
    """Return the processed DataFrame, loading from disk only when the file changes."""
    return _cache.get()


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

def _safe_num(v):
    """Convert float nan/inf to None so JSON serialization never fails."""
    if isinstance(v, float) and (v != v or v == float('inf') or v == float('-inf')):
        return None
    return v


def sanitize_json(obj):
    """Recursively walk dicts/lists and replace nan/inf floats with None."""
    if isinstance(obj, dict):
        return {k: sanitize_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_json(i) for i in obj]
    return _safe_num(obj)


def serialize(df):
    out = df.copy()
    for c in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[c]):
            out[c] = out[c].dt.strftime('%Y-%m-%d')
        else:
            out[c] = out[c].apply(lambda x: x.strftime('%Y-%m-%d') if isinstance(x, pd.Timestamp) and pd.notna(x) else x)
    records = out.replace({np.nan: None, pd.NaT: None}).to_dict(orient='records')
    return sanitize_json(records)


# ---------------------------------------------------------------------------
# Filtering (no unnecessary .copy())
# ---------------------------------------------------------------------------

def apply_filters(df: pd.DataFrame, q: dict) -> pd.DataFrame:
    mask = pd.Series(True, index=df.index)

    if q.get('startDate'):
        mask &= df['Profile Received Date'] >= pd.to_datetime(q['startDate'])
    if q.get('endDate'):
        mask &= df['Profile Received Date'] <= pd.to_datetime(q['endDate'])

    for key, col in {
        'role':      'Role Applied',
        'director':  'Director',
        'manager':   'Manager',
        'vp':        'VP',
        'project':   'Project Name',
        'ta':        'TA Partner',
        'stage':     'Current Pipeline Stage',
        'notice':    'Notice Period Bucket'
    }.items():
        val = q.get(key)
        if val and val != 'All' and col in df.columns:
            mask &= df[col].astype(str) == str(val)

    return df[mask]


# ---------------------------------------------------------------------------
# Summary / analytics functions
# ---------------------------------------------------------------------------

def core(df):
    t   = len(df)
    sel = int(df['Selected Flag'].sum()) if t else 0
    offered = int(df['Offer Released Flag'].sum()) if t else 0
    joined  = int(df['Joined Flag'].sum()) if t else 0

    def _mean(col):
        v = df[col].dropna().mean() if t else 0
        return 0 if (v != v or v is None) else round(float(v), 1)

    return {
        'total': t,
        'active': int((~df['Closed Flag']).sum()) if t else 0,
        'selected': sel,
        'rejected': int(df['Rejected Flag'].sum()) if t else 0,
        'declined': int(df['Declined Flag'].sum()) if t else 0,
        'on_hold':  int(df['On Hold Flag'].sum()) if t else 0,
        'avg_aging': _mean('Candidate Aging Days'),
        'avg_cycle': _mean('Total Hiring Cycle Time'),
        'selection_rate': pct(sel, t),
        'avg_hike': _mean('Hike %'),
        'offers_released': offered,
        'joined': joined,
    }


def round_summary(df):
    rows = []
    for rnd, date, status in [
        ('L1',       'L1 Date',        'L1 Status'),
        ('L2',       'L2 Date',        'L2 Status'),
        ('Client L1','Client L1 Date', 'Client L1 Status'),
        ('Client L2','Client L2 Date', 'Client L2 Status'),
    ]:
        m   = df[date].notna() | (df[status].astype(str).str.strip() != '')
        s   = df.loc[m, status].str.lower()
        sch = int(m.sum())
        clr = int(s.isin(_CLEAR_SET).sum())
        rej = int(s.isin(_REJECT_SET).sum())
        hld = int(s.isin(_HOLD_SET).sum())
        pend = max(sch - clr - rej - hld, 0)
        rows.append({
            'round': rnd, 'scheduled': sch, 'cleared': clr, 'rejected': rej,
            'hold': hld, 'pending': pend,
            'clearRate': pct(clr, sch), 'rejectRate': pct(rej, sch), 'holdRate': pct(hld, sch)
        })
    return rows


def progression_summary(df):
    t = len(df)
    specs = [
        ('Applied',          t),
        ('L1 Cleared',       df['L1 Cleared Flag'].sum()),
        ('L2 Cleared',       df['L2 Cleared Flag'].sum()),
        ('Client L1 Cleared',df['Client L1 Cleared Flag'].sum()),
        ('Client L2 Cleared',df['Client L2 Cleared Flag'].sum()),
        ('Selected',         df['Selected Flag'].sum()),
    ]
    return [{'stage': s, 'count': int(c), 'percent': pct(c, t)} for s, c in specs]


def waiting_summary(df):
    q = (
        df[df['Current Pipeline Stage'].isin(WAITING_STAGES)]
        .groupby('Current Pipeline Stage')
        .agg(
            candidates=('Candidate Name', 'count'),
            avgAging=('Candidate Aging Days', 'mean'),
            maxAging=('Candidate Aging Days', 'max')
        )
        .reset_index()
    )
    q = (
        pd.DataFrame({'Current Pipeline Stage': WAITING_STAGES})
        .merge(q, on='Current Pipeline Stage', how='left')
        .fillna(0)
    )
    q['avgAging'] = q['avgAging'].round(1)
    q['maxAging'] = q['maxAging'].round(1)
    return q.rename(columns={'Current Pipeline Stage': 'stage'}).to_dict(orient='records')


def group_summary(df, col):
    if df.empty:
        return []
    g = (
        df.groupby(col)
        .agg(
            pipeline=('Candidate Name', 'count'),
            selected=('Selected Flag', 'sum'),
            rejected=('Rejected Flag', 'sum'),
            active=('Closed Flag', lambda s: int((~s).sum())),
            avgAging=('Candidate Aging Days', 'mean')
        )
        .reset_index()
        .sort_values('pipeline', ascending=False)
    )
    g['avgAging'] = g['avgAging'].round(1)
    return g.to_dict(orient='records')


def role_summary(df):
    if df.empty:
        return []
    g = (
        df.groupby('Role Applied')
        .agg(
            candidates=('Candidate Name', 'count'),
            active=('Closed Flag', lambda s: int((~s).sum())),
            selected=('Selected Flag', 'sum'),
            rejected=('Rejected Flag', 'sum'),
            avgAging=('Candidate Aging Days', 'mean')
        )
        .reset_index()
        .rename(columns={'Role Applied': 'role'})
        .sort_values('candidates', ascending=False)
    )
    g['selectionRate'] = g.apply(lambda r: pct(r['selected'], r['candidates']), axis=1)
    g['avgAging'] = g['avgAging'].round(1)
    return g.to_dict(orient='records')


def panel_summary(df):
    """Vectorized panel summary — no Python lambdas inside groupby."""
    frames = []
    for rnd, panel, status in [
        ('L1',       'L1 Panel',       'L1 Status'),
        ('L2',       'L2 Panel',       'L2 Status'),
        ('Client L1','Client L1 Panel','Client L1 Status'),
        ('Client L2','Client L2 Panel','Client L2 Status'),
    ]:
        tmp = df[df[panel].astype(str).str.strip() != ''].copy()
        if tmp.empty:
            continue

        # Pre-compute boolean flag columns for the round
        tmp['_clr'] = tmp[status].str.lower().isin(_CLEAR_SET)
        tmp['_rej'] = tmp[status].str.lower().isin(_REJECT_SET)
        tmp['_hld'] = tmp[status].str.lower().isin(_HOLD_SET)

        o = (
            tmp.groupby(panel)
            .agg(
                interviews=('Candidate Name', 'count'),
                cleared=('_clr', 'sum'),
                rejected=('_rej', 'sum'),
                hold=('_hld', 'sum'),
                avgAging=('Candidate Aging Days', 'mean')
            )
            .reset_index()
            .rename(columns={panel: 'panel'})
        )
        o['cleared']  = o['cleared'].astype(int)
        o['rejected'] = o['rejected'].astype(int)
        o['hold']     = o['hold'].astype(int)
        o['pending']  = (o['interviews'] - o['cleared'] - o['rejected'] - o['hold']).clip(lower=0)
        o['successRate'] = o.apply(lambda r: pct(r['cleared'], r['interviews']), axis=1)
        o['avgAging'] = o['avgAging'].round(1)
        o['round'] = rnd
        frames.append(o)

    return [] if not frames else pd.concat(frames, ignore_index=True).to_dict(orient='records')


def filters(df):
    def vals(c):
        return sorted([x for x in df[c].dropna().astype(str).unique().tolist() if x])
    mn = df['Profile Received Date'].min()
    mx = df['Profile Received Date'].max()
    return {
        'roles':          vals('Role Applied'),
        'directors':      vals('Director'),
        'managers':       vals('Manager'),
        'vps':            vals('VP'),
        'projects':       vals('Project Name'),
        'taPartners':     vals('TA Partner'),
        'stages':         vals('Current Pipeline Stage'),
        'noticeBuckets':  vals('Notice Period Bucket'),
        'minDate': mn.strftime('%Y-%m-%d') if pd.notna(mn) else None,
        'maxDate': mx.strftime('%Y-%m-%d') if pd.notna(mx) else None,
    }


# ---------------------------------------------------------------------------
# BRS / Advanced analytics
# ---------------------------------------------------------------------------

def brs_analytics(df: pd.DataFrame) -> dict:
    total_candidates = len(df)
    selected = int(df['Selected Flag'].sum()) if total_candidates else 0
    rejected = int(df['Rejected Flag'].sum()) if total_candidates else 0
    active   = int((~df['Closed Flag']).sum()) if total_candidates else 0

    open_positions_series = df.groupby(['Project Name', 'FDS', 'Role Applied'], dropna=False).agg(
        openPositions=('Open Positions', 'max'),
        candidates=('Candidate Name', 'count'),
        active=('Closed Flag', lambda s: int((~s).sum())),
        selected=('Selected Flag', 'sum'),
        rejected=('Rejected Flag', 'sum'),
        avgAging=('Candidate Aging Days', 'mean')
    ).reset_index()
    open_positions_series['openPositions'] = open_positions_series['openPositions'].fillna(open_positions_series['candidates'])
    open_positions_series['fulfillmentRate'] = open_positions_series.apply(lambda r: pct(r['selected'], r['openPositions']), axis=1)
    open_positions_series['avgAging'] = open_positions_series['avgAging'].round(1)

    project_summary = df.groupby(['Project Name', 'FDS'], dropna=False).agg(
        candidates=('Candidate Name', 'count'),
        openPositions=('Open Positions', 'max'),
        selected=('Selected Flag', 'sum'),
        rejected=('Rejected Flag', 'sum'),
        active=('Closed Flag', lambda s: int((~s).sum())),
        avgAging=('Candidate Aging Days', 'mean'),
        interviews=('Interview Count', 'sum')
    ).reset_index().sort_values('active', ascending=False)
    project_summary['openPositions']  = project_summary['openPositions'].fillna(project_summary['candidates'])
    project_summary['fulfillmentRate'] = project_summary.apply(lambda r: pct(r['selected'], r['openPositions']), axis=1)
    project_summary['rejectionRate']   = project_summary.apply(lambda r: pct(r['rejected'], r['candidates']), axis=1)
    project_summary['avgAging'] = project_summary['avgAging'].round(1)

    hierarchy = df.groupby(['VP', 'Director', 'Manager'], dropna=False).agg(
        candidates=('Candidate Name', 'count'),
        selected=('Selected Flag', 'sum'),
        rejected=('Rejected Flag', 'sum'),
        active=('Closed Flag', lambda s: int((~s).sum())),
        avgAging=('Candidate Aging Days', 'mean')
    ).reset_index().sort_values('candidates', ascending=False)
    hierarchy['selectionRate'] = hierarchy.apply(lambda r: pct(r['selected'], r['candidates']), axis=1)
    hierarchy['avgAging'] = hierarchy['avgAging'].round(1)

    stage_age = pd.DataFrame([
        {'stage': 'Profile → L1',      'avgDays': round(df['Days From Profile To L1'].dropna().mean(), 1) if len(df) else 0, 'maxDays': round(df['Days From Profile To L1'].dropna().max(), 1) if df['Days From Profile To L1'].notna().any() else 0, 'candidates': int(df['Days From Profile To L1'].notna().sum())},
        {'stage': 'L1 → L2',           'avgDays': round(df['Days From L1 To L2'].dropna().mean(), 1) if len(df) else 0, 'maxDays': round(df['Days From L1 To L2'].dropna().max(), 1) if df['Days From L1 To L2'].notna().any() else 0, 'candidates': int(df['Days From L1 To L2'].notna().sum())},
        {'stage': 'L2 → Client L1',    'avgDays': round(df['Days From L2 To Client L1'].dropna().mean(), 1) if len(df) else 0, 'maxDays': round(df['Days From L2 To Client L1'].dropna().max(), 1) if df['Days From L2 To Client L1'].notna().any() else 0, 'candidates': int(df['Days From L2 To Client L1'].notna().sum())},
        {'stage': 'Client L1 → Client L2', 'avgDays': round(df['Days From Client L1 To Client L2'].dropna().mean(), 1) if len(df) else 0, 'maxDays': round(df['Days From Client L1 To Client L2'].dropna().max(), 1) if df['Days From Client L1 To Client L2'].notna().any() else 0, 'candidates': int(df['Days From Client L1 To Client L2'].notna().sum())},
        {'stage': 'Total Cycle',        'avgDays': round(df['Total Hiring Cycle Time'].dropna().mean(), 1) if len(df) else 0, 'maxDays': round(df['Total Hiring Cycle Time'].dropna().max(), 1) if df['Total Hiring Cycle Time'].notna().any() else 0, 'candidates': int(df['Total Hiring Cycle Time'].notna().sum())},
    ])

    def trend(freq, label):
        if df.empty or df['Profile Received Date'].dropna().empty:
            return []
        temp = df.dropna(subset=['Profile Received Date']).copy()
        if freq == 'D':
            temp['period'] = temp['Profile Received Date'].dt.strftime('%Y-%m-%d')
        elif freq == 'W':
            temp['period'] = temp['Profile Received Date'].dt.to_period('W').astype(str)
        elif freq == 'M':
            temp['period'] = temp['Profile Received Date'].dt.to_period('M').astype(str)
        else:
            temp['period'] = temp['Profile Received Date'].dt.year.astype(str)
        g = temp.groupby('period').agg(
            profiles=('Candidate Name', 'count'),
            selected=('Selected Flag', 'sum'),
            rejected=('Rejected Flag', 'sum'),
            interviews=('Interview Count', 'sum'),
            avgAging=('Candidate Aging Days', 'mean')
        ).reset_index()
        g['avgAging'] = g['avgAging'].round(1)
        g['grain'] = label
        return g.to_dict(orient='records')

    pr = df.groupby(['PR Number', 'PR Status', 'Role Applied'], dropna=False).agg(
        candidates=('Candidate Name', 'count'),
        selected=('Selected Flag', 'sum'),
        active=('Closed Flag', lambda s: int((~s).sum())),
        rejected=('Rejected Flag', 'sum'),
        avgAging=('Candidate Aging Days', 'mean')
    ).reset_index().sort_values('candidates', ascending=False)
    pr['selectionRate'] = pr.apply(lambda r: pct(r['selected'], r['candidates']), axis=1)
    pr['avgAging'] = pr['avgAging'].round(1)

    offer = df.groupby('Offer Status', dropna=False).agg(
        candidates=('Candidate Name', 'count'),
        selected=('Selected Flag', 'sum'),
        joined=('Joined Date', lambda s: int(s.notna().sum())),
        avgAging=('Candidate Aging Days', 'mean')
    ).reset_index().sort_values('candidates', ascending=False)
    offer['avgAging'] = offer['avgAging'].round(1)

    panel_ratio = pd.DataFrame(panel_summary(df))
    if not panel_ratio.empty:
        panel_ratio['selectionRejectRatio'] = panel_ratio.apply(
            lambda r: round((r['cleared'] / max(r['rejected'], 1)), 2), axis=1
        )
        panel_ratio = panel_ratio.sort_values(['successRate', 'interviews'], ascending=[False, False])

    proj_funnel = []
    for project, sub in df.groupby('Project Name'):
        t = len(sub)
        proj_funnel.append({
            'project':          project,
            'applied':          t,
            'l1Cleared':        int(sub['L1 Cleared Flag'].sum()),
            'l2Cleared':        int(sub['L2 Cleared Flag'].sum()),
            'clientL1Cleared':  int(sub['Client L1 Cleared Flag'].sum()),
            'clientL2Cleared':  int(sub['Client L2 Cleared Flag'].sum()),
            'selected':         int(sub['Selected Flag'].sum()),
            'conversionRate':   pct(int(sub['Selected Flag'].sum()), t),
        })

    return {
        'summary': {
            'openPositions':        int(open_positions_series['openPositions'].fillna(0).sum()) if not open_positions_series.empty else 0,
            'activeHiringProjects': int(project_summary[project_summary['active'] > 0]['Project Name'].nunique()) if not project_summary.empty else 0,
            'totalCandidates':      total_candidates,
            'activeCandidates':     active,
            'selected':             selected,
            'rejected':             rejected,
            'selectionRate':        pct(selected, total_candidates),
            'rejectionRate':        pct(rejected, total_candidates),
            'avgStageAge':          round(stage_age['avgDays'].replace([np.inf, -np.inf], 0).fillna(0).mean(), 1) if not stage_age.empty else 0,
        },
        'projectSummary':      project_summary.to_dict(orient='records'),
        'openPositionSummary': open_positions_series.to_dict(orient='records'),
        'hierarchy':           hierarchy.to_dict(orient='records'),
        'stageAge':            stage_age.to_dict(orient='records'),
        'dailyTrend':          trend('D', 'Daily'),
        'weeklyTrend':         trend('W', 'Weekly'),
        'monthlyTrend':        trend('M', 'Monthly'),
        'yearlyTrend':         trend('Y', 'Yearly'),
        'prSummary':           pr.to_dict(orient='records'),
        'offerProgress':       offer.to_dict(orient='records'),
        'panelRatio':          [] if panel_ratio.empty else panel_ratio.to_dict(orient='records'),
        'projectFunnel':       proj_funnel,
    }


def get_hierarchy_analytics(df: pd.DataFrame) -> list:
    if df.empty:
        return []
    proj_positions = df.groupby('Project Name', dropna=False)['Open Positions'].max().fillna(0).to_dict()
    grouped  = df.groupby(['VP', 'Director', 'Manager', 'Project Name'], dropna=False)
    records  = []
    for (vp, dir_name, mgr, proj), group in grouped:
        c_count = len(group)
        sel_count = int(group['Selected Flag'].sum())

        # Vectorized scheduled / conducted counts
        sch_count = int(
            (group['L1 Date'].notna() | (group['L1 Status'] != '')).sum() +
            (group['L2 Date'].notna() | (group['L2 Status'] != '')).sum() +
            (group['Client L1 Date'].notna() | (group['Client L1 Status'] != '')).sum() +
            (group['Client L2 Date'].notna() | (group['Client L2 Status'] != '')).sum()
        )
        cond_count = int(
            group['L1 Status'].str.lower().isin({
                "cleared","clear","selected","passed","pass","done","completed",
                "rejected","reject","failed","fail","not cleared",
                "on hold","hold","pending hold","candidate hold","client hold"
            }).sum() * 4  # placeholder — computed per round below
        )
        # Accurate conducted count per round (vectorized)
        conducted_set = {
            "cleared","clear","selected","passed","pass","done","completed",
            "rejected","reject","failed","fail","not cleared",
            "on hold","hold","pending hold","candidate hold","client hold"
        }
        cond_count = int(sum(
            group[f'{r} Status'].str.lower().isin(conducted_set).sum()
            for r in ['L1', 'L2', 'Client L1', 'Client L2']
        ))

        open_pos = proj_positions.get(proj, 0)
        records.append({
            'vp':              vp or 'Unknown VP',
            'director':        dir_name or 'Unknown Director',
            'manager':         mgr or 'Unknown Manager',
            'project':         proj or 'Unknown Project',
            'openPositions':   int(open_pos),
            'profilesReceived': c_count,
            'selected':        sel_count,
            'scheduled':       sch_count,
            'conducted':       cond_count,
        })
    return records


def get_interviews_list(df: pd.DataFrame) -> list:
    """Build the interviews list using vectorized concat instead of iterrows()."""
    base_cols = ['Candidate ID', 'Candidate Name', 'VP', 'Director', 'Manager',
                 'Project Name', 'TA Partner', 'Role Applied']

    frames = []
    for round_name in ['L1', 'L2', 'Client L1', 'Client L2']:
        date_col     = f'{round_name} Date'
        panel_col    = f'{round_name} Panel'
        status_col   = f'{round_name} Status'
        feedback_col = f'{round_name} Feedback'

        # Only include rows where at least one round field is populated
        mask = (
            df[date_col].notna() |
            (df[panel_col].astype(str).str.strip() != '') |
            (df[status_col].astype(str).str.strip() != '')
        )
        sub = df.loc[mask, base_cols + [date_col, panel_col, status_col, feedback_col]].copy()
        if sub.empty:
            continue

        sub['round']    = round_name
        sub['date']     = sub[date_col].apply(
            lambda x: x.strftime('%Y-%m-%d') if pd.notna(x) and hasattr(x, 'strftime') else None
        )
        sub['panel']    = sub[panel_col].fillna('').astype(str)
        sub['status']   = sub[status_col].fillna('Pending').astype(str)
        sub['feedback'] = sub[feedback_col].fillna('').astype(str)

        sub = sub.rename(columns={
            'Candidate ID':  'candidateId',
            'Candidate Name':'candidateName',
            'VP':            'vp',
            'Director':      'director',
            'Manager':       'manager',
            'Project Name':  'project',
            'TA Partner':    'ta',
            'Role Applied':  'role',
        })
        frames.append(sub[['candidateId','candidateName','vp','director','manager',
                            'project','ta','role','round','date','panel','status','feedback']])

    if not frames:
        return []
    result = pd.concat(frames, ignore_index=True)
    return result.replace({np.nan: None}).to_dict(orient='records')
