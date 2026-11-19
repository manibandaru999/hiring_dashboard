from __future__ import annotations
from pathlib import Path
from functools import lru_cache
from typing import Any
import numpy as np
import pandas as pd
from .config import SOURCE_DIR, DEFAULT_FILE_NAME, DATE_COLUMNS, NUMERIC_COLUMNS, REQUIRED_COLUMNS, WAITING_STAGES

def normalize_text(v: object) -> str:
    return "" if pd.isna(v) else str(v).strip()
def is_clear(v): return normalize_text(v).lower() in {"cleared","clear","selected","passed","pass","done","completed"}
def is_reject(v): return normalize_text(v).lower() in {"rejected","reject","failed","fail","not cleared"}
def is_hold(v): return normalize_text(v).lower() in {"on hold","hold","pending hold","candidate hold","client hold"}
def is_closed(v): return normalize_text(v).lower() in {"selected","rejected","declined","on hold","hold"}
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

def progression(row):
    if row.get('Client L2 Completed Flag',False): return 'Progressed to Client L2'
    if row.get('Client L1 Completed Flag',False): return 'Progressed to Client L1'
    if row.get('L2 Completed Flag',False): return 'Progressed to L2'
    if row.get('L1 Completed Flag',False): return 'Progressed to L1'
    return 'Profile Received Only'

def pipeline(row):
    overall=normalize_text(row.get('Overall Status')).lower()
    if overall=='selected': return 'Closed - Selected'
    if overall=='rejected': return 'Closed - Rejected'
    if overall=='declined': return 'Closed - Declined'
    if overall in {'on hold','hold'}: return 'Closed - On Hold'
    if not row.get('L1 Completed Flag',False): return 'Waiting for L1'
    if is_reject(row.get('L1 Status')): return 'Closed - Rejected at L1'
    if row.get('L1 Cleared Flag',False) and not row.get('L2 Completed Flag',False): return 'Cleared L1 - Waiting for L2'
    if is_reject(row.get('L2 Status')): return 'Closed - Rejected at L2'
    if row.get('L2 Cleared Flag',False) and not row.get('Client L1 Completed Flag',False): return 'Cleared L2 - Waiting for Client L1'
    if is_reject(row.get('Client L1 Status')): return 'Closed - Rejected at Client L1'
    if row.get('Client L1 Cleared Flag',False) and not row.get('Client L2 Completed Flag',False): return 'Cleared Client L1 - Waiting for Client L2'
    if is_reject(row.get('Client L2 Status')): return 'Closed - Rejected at Client L2'
    if row.get('Client L2 Completed Flag',False) and normalize_text(row.get('Overall Status'))=='': return 'Client L2 Completed - Waiting for Final Decision'
    return 'In Progress / Needs Review'

def clean(df: pd.DataFrame) -> pd.DataFrame:
    d=df.copy()
    for c in REQUIRED_COLUMNS:
        if c not in d.columns: d[c]=np.nan
    for c in DATE_COLUMNS: d[c]=pd.to_datetime(d[c],errors='coerce')
    for c in NUMERIC_COLUMNS: d[c]=pd.to_numeric(d[c],errors='coerce')
    for c in [x for x in d.columns if x not in DATE_COLUMNS+NUMERIC_COLUMNS]: d[c]=d[c].apply(normalize_text)
    today=pd.Timestamp.today().normalize()
    d['L1 Cleared Flag']=d['L1 Status'].apply(is_clear); d['L2 Cleared Flag']=d['L2 Status'].apply(is_clear)
    d['Client L1 Cleared Flag']=d['Client L1 Status'].apply(is_clear); d['Client L2 Cleared Flag']=d['Client L2 Status'].apply(is_clear)
    d['L1 Completed Flag']=d['L1 Date'].notna() | (d['L1 Status']!=''); d['L2 Completed Flag']=d['L2 Date'].notna() | (d['L2 Status']!='')
    d['Client L1 Completed Flag']=d['Client L1 Date'].notna() | (d['Client L1 Status']!=''); d['Client L2 Completed Flag']=d['Client L2 Date'].notna() | (d['Client L2 Status']!='')
    d['Closed Flag']=d['Overall Status'].apply(is_closed); d['Selected Flag']=d['Overall Status'].str.lower().eq('selected'); d['Rejected Flag']=d['Overall Status'].str.lower().eq('rejected')
    d['Declined Flag']=d['Overall Status'].str.lower().eq('declined'); d['On Hold Flag']=d['Overall Status'].str.lower().isin(['on hold','hold'])
    last=d[['Client L2 Date','Client L1 Date','L2 Date','L1 Date','Profile Received Date']].bfill(axis=1).iloc[:,0]
    end=pd.Series(np.where(d['Closed Flag'],last,today), index=d.index); end=pd.to_datetime(end,errors='coerce')
    d['Candidate Aging Days']=safe_days(end,d['Profile Received Date']); d['Days From Profile To L1']=safe_days(d['L1 Date'],d['Profile Received Date'])
    d['Days From L1 To L2']=safe_days(d['L2 Date'],d['L1 Date']); d['Days From L2 To Client L1']=safe_days(d['Client L1 Date'],d['L2 Date']); d['Days From Client L1 To Client L2']=safe_days(d['Client L2 Date'],d['Client L1 Date']); d['Total Hiring Cycle Time']=safe_days(pd.Series(last,index=d.index),d['Profile Received Date'])
    # Ordered vectorized conditions preserve the precedence of pipeline() and progression().
    overall = d['Overall Status'].str.lower()
    l1_reject = d['L1 Status'].str.lower().isin(['rejected','reject','failed','fail','not cleared'])
    l2_reject = d['L2 Status'].str.lower().isin(['rejected','reject','failed','fail','not cleared'])
    cl1_reject = d['Client L1 Status'].str.lower().isin(['rejected','reject','failed','fail','not cleared'])
    cl2_reject = d['Client L2 Status'].str.lower().isin(['rejected','reject','failed','fail','not cleared'])
    d['Current Pipeline Stage'] = np.select([
        overall.eq('selected'), overall.eq('rejected'), overall.eq('declined'),
        overall.isin(['on hold','hold']),
        ~d['L1 Completed Flag'], l1_reject,
        d['L1 Cleared Flag'] & ~d['L2 Completed Flag'], l2_reject,
        d['L2 Cleared Flag'] & ~d['Client L1 Completed Flag'], cl1_reject,
        d['Client L1 Cleared Flag'] & ~d['Client L2 Completed Flag'], cl2_reject,
        d['Client L2 Completed Flag'] & overall.eq('')
    ], [
        'Closed - Selected', 'Closed - Rejected', 'Closed - Declined',
        'Closed - On Hold', 'Waiting for L1', 'Closed - Rejected at L1',
        'Cleared L1 - Waiting for L2', 'Closed - Rejected at L2',
        'Cleared L2 - Waiting for Client L1', 'Closed - Rejected at Client L1',
        'Cleared Client L1 - Waiting for Client L2', 'Closed - Rejected at Client L2',
        'Client L2 Completed - Waiting for Final Decision'
    ], default='In Progress / Needs Review')
    d['Progression Level'] = np.select([
        d['Client L2 Completed Flag'], d['Client L1 Completed Flag'],
        d['L2 Completed Flag'], d['L1 Completed Flag']
    ], [
        'Progressed to Client L2', 'Progressed to Client L1',
        'Progressed to L2', 'Progressed to L1'
    ], default='Profile Received Only')
    d['Notice Period Bucket']=d['Notice Period'].apply(notice_bucket)
    d['CTC Gap']=d['Expected CTC']-d['Current CTC']; d['Hike %']=np.where((d['Current CTC'].fillna(0)>0)&d['Expected CTC'].notna(),((d['Expected CTC']-d['Current CTC'])/d['Current CTC'])*100,np.nan)
    d['SLA Bucket']=pd.cut(d['Candidate Aging Days'].fillna(0),bins=[-1,7,15,30,60,999999],labels=['0-7 Days','8-15 Days','16-30 Days','31-60 Days','60+ Days'])
    d['Candidate ID']=d.index.astype(str)
    return d

@lru_cache(maxsize=2)
def _load_data_cached(path: str, modified_ns: int, size: int):
    """Parse the Excel workbook once per file version, not once per request."""
    return clean(pd.read_excel(path, sheet_name=0))

def load_data():
    p=SOURCE_DIR/DEFAULT_FILE_NAME
    if not p.exists():
        files=sorted(SOURCE_DIR.glob('*.xlsx'))
        if not files: raise FileNotFoundError(f'Place {DEFAULT_FILE_NAME} in {SOURCE_DIR}')
        p=files[0]
    stat=p.stat()
    return _load_data_cached(str(p.resolve()), stat.st_mtime_ns, stat.st_size)

def serialize(df):
    out=df.copy()
    for c in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[c]): out[c]=out[c].dt.strftime('%Y-%m-%d')
    return out.replace({np.nan:None}).to_dict(orient='records')

def apply_filters(df, q):
    w=df.copy()
    if q.get('startDate'): w=w[w['Profile Received Date']>=pd.to_datetime(q['startDate'])]
    if q.get('endDate'): w=w[w['Profile Received Date']<=pd.to_datetime(q['endDate'])]
    for key,col in {
        'role':'Role Applied',
        'director':'Director',
        'manager':'Manager',
        'vp':'VP',
        'project':'Project Name',
        'ta':'TA Partner',
        'stage':'Current Pipeline Stage',
        'notice':'Notice Period Bucket'
    }.items():
        val=q.get(key)
        if val and val!='All': w=w[w[col].astype(str)==str(val)]
    return w

def core(df):
    t=len(df); sel=int(df['Selected Flag'].sum()) if t else 0
    return {'total':t,'active':int((~df['Closed Flag']).sum()) if t else 0,'selected':sel,'rejected':int(df['Rejected Flag'].sum()) if t else 0,'declined':int(df['Declined Flag'].sum()) if t else 0,'on_hold':int(df['On Hold Flag'].sum()) if t else 0,'avg_aging':round(df['Candidate Aging Days'].dropna().mean(),1) if t else 0,'avg_cycle':round(df['Total Hiring Cycle Time'].dropna().mean(),1) if t else 0,'selection_rate':pct(sel,t),'avg_hike':round(df['Hike %'].dropna().mean(),1) if t else 0}

def round_summary(df):
    rows=[]
    for rnd,date,status in [('L1','L1 Date','L1 Status'),('L2','L2 Date','L2 Status'),('Client L1','Client L1 Date','Client L1 Status'),('Client L2','Client L2 Date','Client L2 Status')]:
        m=df[date].notna() | (df[status].astype(str).str.strip()!=''); s=df.loc[m,status]; sch=int(m.sum()); clr=int(s.apply(is_clear).sum()); rej=int(s.apply(is_reject).sum()); hold=int(s.apply(is_hold).sum()); pend=max(sch-clr-rej-hold,0)
        rows.append({'round':rnd,'scheduled':sch,'cleared':clr,'rejected':rej,'hold':hold,'pending':pend,'clearRate':pct(clr,sch),'rejectRate':pct(rej,sch),'holdRate':pct(hold,sch)})
    return rows

def progression_summary(df):
    t=len(df); specs=[('Applied',t),('L1 Cleared',df['L1 Cleared Flag'].sum()),('L2 Cleared',df['L2 Cleared Flag'].sum()),('Client L1 Cleared',df['Client L1 Cleared Flag'].sum()),('Client L2 Cleared',df['Client L2 Cleared Flag'].sum()),('Selected',df['Selected Flag'].sum())]
    return [{'stage':s,'count':int(c),'percent':pct(c,t)} for s,c in specs]

def waiting_summary(df):
    q=df[df['Current Pipeline Stage'].isin(WAITING_STAGES)].groupby('Current Pipeline Stage').agg(candidates=('Candidate Name','count'),avgAging=('Candidate Aging Days','mean'),maxAging=('Candidate Aging Days','max')).reset_index()
    q=pd.DataFrame({'Current Pipeline Stage':WAITING_STAGES}).merge(q,on='Current Pipeline Stage',how='left').fillna(0); q['avgAging']=q['avgAging'].round(1); q['maxAging']=q['maxAging'].round(1)
    return q.rename(columns={'Current Pipeline Stage':'stage'}).to_dict(orient='records')

def group_summary(df,col):
    if df.empty: return []
    g=df.groupby(col).agg(pipeline=('Candidate Name','count'),selected=('Selected Flag','sum'),rejected=('Rejected Flag','sum'),active=('Closed Flag',lambda s:int((~s).sum())),avgAging=('Candidate Aging Days','mean')).reset_index().sort_values('pipeline',ascending=False); g['avgAging']=g['avgAging'].round(1)
    return g.to_dict(orient='records')

def role_summary(df):
    if df.empty: return []
    g=df.groupby('Role Applied').agg(candidates=('Candidate Name','count'),active=('Closed Flag',lambda s:int((~s).sum())),selected=('Selected Flag','sum'),rejected=('Rejected Flag','sum'),avgAging=('Candidate Aging Days','mean')).reset_index().rename(columns={'Role Applied':'role'}).sort_values('candidates',ascending=False); g['selectionRate']=g.apply(lambda r:pct(r['selected'],r['candidates']),axis=1); g['avgAging']=g['avgAging'].round(1)
    return g.to_dict(orient='records')

def panel_summary(df):
    frames=[]
    for rnd,panel,status in [('L1','L1 Panel','L1 Status'),('L2','L2 Panel','L2 Status'),('Client L1','Client L1 Panel','Client L1 Status'),('Client L2','Client L2 Panel','Client L2 Status')]:
        tmp=df[df[panel].astype(str).str.strip()!=''].copy()
        if tmp.empty: continue
        o=tmp.groupby(panel).agg(interviews=('Candidate Name','count'),cleared=(status,lambda s:int(sum(is_clear(x) for x in s))),rejected=(status,lambda s:int(sum(is_reject(x) for x in s))),hold=(status,lambda s:int(sum(is_hold(x) for x in s))),avgAging=('Candidate Aging Days','mean')).reset_index().rename(columns={panel:'panel'}); o['pending']=o['interviews']-o['cleared']-o['rejected']-o['hold']; o['successRate']=o.apply(lambda r:pct(r['cleared'],r['interviews']),axis=1); o['avgAging']=o['avgAging'].round(1); o['round']=rnd; frames.append(o)
    return [] if not frames else pd.concat(frames,ignore_index=True).to_dict(orient='records')

def filters(df):
    def vals(c): return sorted([x for x in df[c].dropna().astype(str).unique().tolist() if x])
    mn=df['Profile Received Date'].min(); mx=df['Profile Received Date'].max()
    return {
        'roles':vals('Role Applied'),
        'directors':vals('Director'),
        'managers':vals('Manager'),
        'vps':vals('VP'),
        'projects':vals('Project Name'),
        'taPartners':vals('TA Partner'),
        'stages':vals('Current Pipeline Stage'),
        'noticeBuckets':vals('Notice Period Bucket'),
        'minDate':mn.strftime('%Y-%m-%d') if pd.notna(mn) else None,
        'maxDate':mx.strftime('%Y-%m-%d') if pd.notna(mx) else None
    }

# ============================================================
# BRS / Advanced analytics extensions
# ============================================================
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
    """Return a normalized string series with nulls converted to empty strings."""
    return series.fillna('').astype(str).str.strip()


def _fill_blank_from_series(target: pd.Series, fallback: pd.Series, default: str) -> pd.Series:
    """Fill blank target values from fallback series, then use default for remaining blanks."""
    target_clean = _clean_string_series(target)
    fallback_clean = _clean_string_series(fallback)
    filled = target_clean.where(target_clean.ne(''), fallback_clean)
    return filled.where(filled.ne(''), default)


def _fill_blank_from_condition(target: pd.Series, condition: pd.Series, true_value: str, false_value: str) -> pd.Series:
    """Fill blank target values using a boolean condition."""
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
        d[c] = pd.to_datetime(d[c], errors='coerce')

    for c in OPTIONAL_NUMERIC_COLUMNS:
        if c not in d.columns:
            d[c] = np.nan
        d[c] = pd.to_numeric(d[c], errors='coerce')

    # Safe fallback logic. Avoid Series/ndarray inside replace(), which causes
    # pandas TypeError in newer versions.
    if d['Project Name'].eq('').all():
        d['Project Name'] = _fill_blank_from_series(d['Project Name'], d['Role Applied'], 'Unassigned Project')
    else:
        d['Project Name'] = d['Project Name'].where(d['Project Name'].ne(''), 'Unassigned Project')

    d['FDS'] = d['FDS'].where(d['FDS'].ne(''), 'Unmapped FDS')
    d['VP'] = _fill_blank_from_series(d['VP'], d['Director'], 'Unmapped VP')
    d['Client'] = d['Client'].where(d['Client'].ne(''), 'Internal / Not Available')
    d['PR Number'] = d['PR Number'].where(d['PR Number'].ne(''), 'PR Not Available')
    d['PR Status'] = d['PR Status'].where(d['PR Status'].ne(''), 'Not Updated')
    d['Position Status'] = _fill_blank_from_condition(d['Position Status'], d['Closed Flag'], 'Closed', 'Active')
    d['Offer Status'] = _fill_blank_from_condition(d['Offer Status'], d['Selected Flag'], 'Offer in Progress', 'Not Offered')

    # Numeric fallbacks for BRS position analytics.
    d['Open Positions'] = d['Open Positions'].fillna(1)
    d['Required Positions'] = d['Required Positions'].fillna(d['Open Positions'])

    # Derived interview activity counts per candidate.
    d['Interview Count'] = (
        d['L1 Completed Flag'].astype(int)
        + d['L2 Completed Flag'].astype(int)
        + d['Client L1 Completed Flag'].astype(int)
        + d['Client L2 Completed Flag'].astype(int)
    )

    d['Profile Month'] = d['Profile Received Date'].dt.to_period('M').astype(str).replace('NaT', '')
    d['Profile Week'] = d['Profile Received Date'].dt.to_period('W').astype(str).replace('NaT', '')
    d['Profile Year'] = d['Profile Received Date'].dt.year.fillna(0).astype(int).astype(str).replace('0', '')

    d['Selection Decision Date'] = d['Selection Decision Date'].fillna(
        d[['Client L2 Date', 'Client L1 Date', 'L2 Date', 'L1 Date', 'Profile Received Date']].bfill(axis=1).iloc[:, 0]
    )

    return d

def load_data():
    p=SOURCE_DIR/DEFAULT_FILE_NAME
    if not p.exists():
        files=sorted(SOURCE_DIR.glob('*.xlsx'))
        if not files: raise FileNotFoundError(f'Place {DEFAULT_FILE_NAME} in {SOURCE_DIR}')
        p=files[0]
    return enrich_optional_columns(clean(pd.read_excel(p,sheet_name=0)))

def brs_analytics(df: pd.DataFrame) -> dict:
    total_candidates = len(df)
    selected = int(df['Selected Flag'].sum()) if total_candidates else 0
    rejected = int(df['Rejected Flag'].sum()) if total_candidates else 0
    active = int((~df['Closed Flag']).sum()) if total_candidates else 0

    open_positions_series = df.groupby(['Project Name','FDS','Role Applied'], dropna=False).agg(
        openPositions=('Open Positions', 'max'),
        candidates=('Candidate Name','count'),
        active=('Closed Flag', lambda s:int((~s).sum())),
        selected=('Selected Flag','sum'),
        rejected=('Rejected Flag','sum'),
        avgAging=('Candidate Aging Days','mean')
    ).reset_index()
    open_positions_series['openPositions'] = open_positions_series['openPositions'].fillna(open_positions_series['candidates'])
    open_positions_series['fulfillmentRate'] = open_positions_series.apply(lambda r: pct(r['selected'], r['openPositions']), axis=1)
    open_positions_series['avgAging'] = open_positions_series['avgAging'].round(1)

    # Project/FDS active hiring summary
    project_summary = df.groupby(['Project Name','FDS'], dropna=False).agg(
        candidates=('Candidate Name','count'),
        openPositions=('Open Positions','max'),
        selected=('Selected Flag','sum'),
        rejected=('Rejected Flag','sum'),
        active=('Closed Flag', lambda s:int((~s).sum())),
        avgAging=('Candidate Aging Days','mean'),
        interviews=('Interview Count','sum')
    ).reset_index().sort_values('active', ascending=False)
    project_summary['openPositions'] = project_summary['openPositions'].fillna(project_summary['candidates'])
    project_summary['fulfillmentRate'] = project_summary.apply(lambda r: pct(r['selected'], r['openPositions']), axis=1)
    project_summary['rejectionRate'] = project_summary.apply(lambda r: pct(r['rejected'], r['candidates']), axis=1)
    project_summary['avgAging'] = project_summary['avgAging'].round(1)

    # Role hierarchy VP -> Director -> Manager
    hierarchy = df.groupby(['VP','Director','Manager'], dropna=False).agg(
        candidates=('Candidate Name','count'),
        selected=('Selected Flag','sum'),
        rejected=('Rejected Flag','sum'),
        active=('Closed Flag', lambda s:int((~s).sum())),
        avgAging=('Candidate Aging Days','mean')
    ).reset_index().sort_values('candidates', ascending=False)
    hierarchy['selectionRate'] = hierarchy.apply(lambda r: pct(r['selected'], r['candidates']), axis=1)
    hierarchy['avgAging'] = hierarchy['avgAging'].round(1)

    # Age between stages
    stage_age = pd.DataFrame([
        {'stage':'Profile → L1','avgDays':round(df['Days From Profile To L1'].dropna().mean(),1) if len(df) else 0,'maxDays':round(df['Days From Profile To L1'].dropna().max(),1) if df['Days From Profile To L1'].notna().any() else 0,'candidates':int(df['Days From Profile To L1'].notna().sum())},
        {'stage':'L1 → L2','avgDays':round(df['Days From L1 To L2'].dropna().mean(),1) if len(df) else 0,'maxDays':round(df['Days From L1 To L2'].dropna().max(),1) if df['Days From L1 To L2'].notna().any() else 0,'candidates':int(df['Days From L1 To L2'].notna().sum())},
        {'stage':'L2 → Client L1','avgDays':round(df['Days From L2 To Client L1'].dropna().mean(),1) if len(df) else 0,'maxDays':round(df['Days From L2 To Client L1'].dropna().max(),1) if df['Days From L2 To Client L1'].notna().any() else 0,'candidates':int(df['Days From L2 To Client L1'].notna().sum())},
        {'stage':'Client L1 → Client L2','avgDays':round(df['Days From Client L1 To Client L2'].dropna().mean(),1) if len(df) else 0,'maxDays':round(df['Days From Client L1 To Client L2'].dropna().max(),1) if df['Days From Client L1 To Client L2'].notna().any() else 0,'candidates':int(df['Days From Client L1 To Client L2'].notna().sum())},
        {'stage':'Total Cycle','avgDays':round(df['Total Hiring Cycle Time'].dropna().mean(),1) if len(df) else 0,'maxDays':round(df['Total Hiring Cycle Time'].dropna().max(),1) if df['Total Hiring Cycle Time'].notna().any() else 0,'candidates':int(df['Total Hiring Cycle Time'].notna().sum())},
    ])

    # Time trends daily/weekly/monthly/yearly
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
            profiles=('Candidate Name','count'),
            selected=('Selected Flag','sum'),
            rejected=('Rejected Flag','sum'),
            interviews=('Interview Count','sum'),
            avgAging=('Candidate Aging Days','mean')
        ).reset_index()
        g['avgAging'] = g['avgAging'].round(1)
        g['grain'] = label
        return g.to_dict(orient='records')

    # PR Analytics
    pr = df.groupby(['PR Number','PR Status','Role Applied'], dropna=False).agg(
        candidates=('Candidate Name','count'),
        selected=('Selected Flag','sum'),
        active=('Closed Flag', lambda s:int((~s).sum())),
        rejected=('Rejected Flag','sum'),
        avgAging=('Candidate Aging Days','mean')
    ).reset_index().sort_values('candidates', ascending=False)
    pr['selectionRate'] = pr.apply(lambda r:pct(r['selected'], r['candidates']), axis=1)
    pr['avgAging'] = pr['avgAging'].round(1)

    # Offer progress pipeline
    offer = df.groupby('Offer Status', dropna=False).agg(
        candidates=('Candidate Name','count'),
        selected=('Selected Flag','sum'),
        joined=('Joined Date', lambda s:int(s.notna().sum())),
        avgAging=('Candidate Aging Days','mean')
    ).reset_index().sort_values('candidates', ascending=False)
    offer['avgAging'] = offer['avgAging'].round(1)

    # Panel selection/rejection ratio
    panel_ratio = pd.DataFrame(panel_summary(df))
    if not panel_ratio.empty:
        panel_ratio['selectionRejectRatio'] = panel_ratio.apply(lambda r: round((r['cleared'] / max(r['rejected'], 1)), 2), axis=1)
        panel_ratio = panel_ratio.sort_values(['successRate','interviews'], ascending=[False,False])

    # Funnel by project
    proj_funnel = []
    for project, sub in df.groupby('Project Name'):
        t=len(sub)
        proj_funnel.append({
            'project': project,
            'applied': t,
            'l1Cleared': int(sub['L1 Cleared Flag'].sum()),
            'l2Cleared': int(sub['L2 Cleared Flag'].sum()),
            'clientL1Cleared': int(sub['Client L1 Cleared Flag'].sum()),
            'clientL2Cleared': int(sub['Client L2 Cleared Flag'].sum()),
            'selected': int(sub['Selected Flag'].sum()),
            'conversionRate': pct(int(sub['Selected Flag'].sum()), t),
        })

    return {
        'summary': {
            'openPositions': int(open_positions_series['openPositions'].fillna(0).sum()) if not open_positions_series.empty else 0,
            'activeHiringProjects': int(project_summary[project_summary['active'] > 0]['Project Name'].nunique()) if not project_summary.empty else 0,
            'totalCandidates': total_candidates,
            'activeCandidates': active,
            'selected': selected,
            'rejected': rejected,
            'selectionRate': pct(selected, total_candidates),
            'rejectionRate': pct(rejected, total_candidates),
            'avgStageAge': round(stage_age['avgDays'].replace([np.inf,-np.inf],0).fillna(0).mean(),1) if not stage_age.empty else 0,
        },
        'projectSummary': project_summary.to_dict(orient='records'),
        'openPositionSummary': open_positions_series.to_dict(orient='records'),
        'hierarchy': hierarchy.to_dict(orient='records'),
        'stageAge': stage_age.to_dict(orient='records'),
        'dailyTrend': trend('D', 'Daily'),
        'weeklyTrend': trend('W', 'Weekly'),
        'monthlyTrend': trend('M', 'Monthly'),
        'yearlyTrend': trend('Y', 'Yearly'),
        'prSummary': pr.to_dict(orient='records'),
        'offerProgress': offer.to_dict(orient='records'),
        'panelRatio': [] if panel_ratio.empty else panel_ratio.to_dict(orient='records'),
        'projectFunnel': proj_funnel,
    }

def get_hierarchy_analytics(df: pd.DataFrame) -> list:
    if df.empty: return []
    proj_positions = df.groupby('Project Name', dropna=False)['Open Positions'].max().fillna(0).to_dict()
    grouped = df.groupby(['VP', 'Director', 'Manager', 'Project Name'], dropna=False)
    records = []
    for (vp, dir_name, mgr, proj), group in grouped:
        c_count = len(group)
        sel_count = int(group['Selected Flag'].sum())
        sch_count = int(
            (group['L1 Date'].notna() | (group['L1 Status'] != '')).sum() +
            (group['L2 Date'].notna() | (group['L2 Status'] != '')).sum() +
            (group['Client L1 Date'].notna() | (group['Client L1 Status'] != '')).sum() +
            (group['Client L2 Date'].notna() | (group['Client L2 Status'] != '')).sum()
        )
        cond_count = int(
            group['L1 Status'].apply(is_conducted).sum() +
            group['L2 Status'].apply(is_conducted).sum() +
            group['Client L1 Status'].apply(is_conducted).sum() +
            group['Client L2 Status'].apply(is_conducted).sum()
        )
        open_pos = proj_positions.get(proj, 0)
        records.append({
            'vp': vp or 'Unknown VP',
            'director': dir_name or 'Unknown Director',
            'manager': mgr or 'Unknown Manager',
            'project': proj or 'Unknown Project',
            'openPositions': int(open_pos),
            'profilesReceived': c_count,
            'selected': sel_count,
            'scheduled': sch_count,
            'conducted': cond_count
        })
    return records

def get_interviews_list(df: pd.DataFrame) -> list:
    records = []
    for _, row in df.iterrows():
        for round_name in ['L1', 'L2', 'Client L1', 'Client L2']:
            date_val = row.get(f'{round_name} Date')
            panel_val = row.get(f'{round_name} Panel')
            status_val = row.get(f'{round_name} Status')
            feedback_val = row.get(f'{round_name} Feedback')
            if pd.notna(date_val) or (panel_val and str(panel_val).strip() != '') or (status_val and str(status_val).strip() != ''):
                records.append({
                    'candidateId': str(row.get('Candidate ID') or ''),
                    'candidateName': row.get('Candidate Name'),
                    'vp': row.get('VP'),
                    'director': row.get('Director'),
                    'manager': row.get('Manager'),
                    'project': row.get('Project Name'),
                    'ta': row.get('TA Partner'),
                    'role': row.get('Role Applied'),
                    'round': round_name,
                    'date': date_val.strftime('%Y-%m-%d') if pd.notna(date_val) and hasattr(date_val, 'strftime') else str(date_val or ''),
                    'panel': str(panel_val or ''),
                    'status': str(status_val or 'Pending'),
                    'feedback': str(feedback_val or '')
                })
    return records

