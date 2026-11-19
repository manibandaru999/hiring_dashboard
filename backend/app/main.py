from __future__ import annotations
from typing import Optional
import math
import numpy as np
import pandas as pd
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from .logic import (
    load_data, serialize, apply_filters, core, round_summary, 
    progression_summary, waiting_summary, group_summary, role_summary, 
    panel_summary, filters, is_clear, is_reject, is_hold, brs_analytics,
    get_hierarchy_analytics, get_interviews_list
)

def json_safe(value):
    """Replace non-finite Pandas/NumPy values with JSON null recursively."""
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if value is None or value is pd.NaT or value is pd.NA:
        return None
    if isinstance(value, (float, np.floating)):
        return None if not math.isfinite(float(value)) else float(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, pd.Timestamp):
        return None if pd.isna(value) else value.isoformat()
    return value


app=FastAPI(title='Recruit Hiring Dashboard API')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_credentials=True, allow_methods=['*'], allow_headers=['*'])

def qdict(startDate=None,endDate=None,role=None,director=None,manager=None,stage=None,notice=None,vp=None,project=None,ta=None):
    return {
        'startDate':startDate,'endDate':endDate,'role':role,'director':director,
        'manager':manager,'stage':stage,'notice':notice,'vp':vp,'project':project,'ta':ta
    }

@app.get('/api/health')
def health(): return {'status':'ok'}

@app.get('/api/filters')
def get_filters(): return filters(load_data())

@app.get('/api/dashboard')
def dashboard(
    startDate:Optional[str]=None,endDate:Optional[str]=None,role:Optional[str]=None,
    director:Optional[str]=None,manager:Optional[str]=None,stage:Optional[str]=None,
    notice:Optional[str]=None,vp:Optional[str]=None,project:Optional[str]=None,ta:Optional[str]=None
):
    df=apply_filters(load_data(),qdict(startDate,endDate,role,director,manager,stage,notice,vp,project,ta))
    return json_safe({
        'metrics':core(df),
        'rounds':round_summary(df),
        'progression':progression_summary(df),
        'waitingQueue':waiting_summary(df),
        'directors':group_summary(df,'Director'),
        'managers':group_summary(df,'Manager'),
        'roles':role_summary(df),
        'panels':panel_summary(df),
        'brs':brs_analytics(df),
        'candidates':serialize(df.sort_values(['Candidate Aging Days','Profile Received Date'],ascending=[False,False]).head(150))
    })

@app.get('/api/hierarchy')
def hierarchy_endpoint(
    startDate:Optional[str]=None,endDate:Optional[str]=None,role:Optional[str]=None,
    director:Optional[str]=None,manager:Optional[str]=None,stage:Optional[str]=None,
    notice:Optional[str]=None,vp:Optional[str]=None,project:Optional[str]=None,ta:Optional[str]=None
):
    df=apply_filters(load_data(),qdict(startDate,endDate,role,director,manager,stage,notice,vp,project,ta))
    return json_safe(get_hierarchy_analytics(df))

@app.get('/api/interviews')
def interviews_endpoint(
    startDate:Optional[str]=None,endDate:Optional[str]=None,role:Optional[str]=None,
    director:Optional[str]=None,manager:Optional[str]=None,stage:Optional[str]=None,
    notice:Optional[str]=None,vp:Optional[str]=None,project:Optional[str]=None,ta:Optional[str]=None
):
    df=apply_filters(load_data(),qdict(startDate,endDate,role,director,manager,stage,notice,vp,project,ta))
    return json_safe(get_interviews_list(df))

@app.get('/api/candidates')
def candidates(
    search:Optional[str]=None,startDate:Optional[str]=None,endDate:Optional[str]=None,
    role:Optional[str]=None,director:Optional[str]=None,manager:Optional[str]=None,
    stage:Optional[str]=None,notice:Optional[str]=None,vp:Optional[str]=None,
    project:Optional[str]=None,ta:Optional[str]=None
):
    df=apply_filters(load_data(),qdict(startDate,endDate,role,director,manager,stage,notice,vp,project,ta))
    if search:
        s=search.lower(); cols=['Candidate Name','Email ID','Role Applied','Skills','Director','Manager','L1 Panel','L2 Panel','Client L1 Panel','Client L2 Panel','Final Comments','Current Organization','Current Location']
        mask=pd.Series(False,index=df.index)
        for c in cols:
            if c in df.columns: mask=mask|df[c].astype(str).str.lower().str.contains(s,na=False)
        df=df[mask]
    return json_safe(serialize(df.sort_values('Candidate Aging Days',ascending=False)))

@app.get('/api/candidates/{candidate_id}')
def candidate_detail(candidate_id:str):
    df=load_data(); m=df[df['Candidate ID'].astype(str)==str(candidate_id)]
    if m.empty: m=df[df['Candidate Name'].astype(str)==str(candidate_id)]
    return {'error':'Candidate not found'} if m.empty else json_safe(serialize(m)[0])

@app.get('/api/drilldown/round')
def drill_round(
    roundName:str=Query(...), outcome:str='Scheduled', startDate:Optional[str]=None,
    endDate:Optional[str]=None,role:Optional[str]=None,director:Optional[str]=None,
    manager:Optional[str]=None,stage:Optional[str]=None,notice:Optional[str]=None,
    vp:Optional[str]=None,project:Optional[str]=None,ta:Optional[str]=None
):
    df=apply_filters(load_data(),qdict(startDate,endDate,role,director,manager,stage,notice,vp,project,ta)); date=f'{roundName} Date'; status=f'{roundName} Status'; base=df[date].notna() | (df[status].astype(str).str.strip()!='')
    if outcome=='Cleared': out=df[base & df[status].apply(is_clear)]
    elif outcome=='Rejected': out=df[base & df[status].apply(is_reject)]
    elif outcome=='Hold': out=df[base & df[status].apply(is_hold)]
    elif outcome=='Pending': out=df[base & ~df[status].apply(is_clear) & ~df[status].apply(is_reject) & ~df[status].apply(is_hold)]
    else: out=df[base]
    return json_safe(serialize(out))

@app.get('/api/drilldown/stage')
def drill_stage(
    stageValue:str, startDate:Optional[str]=None,endDate:Optional[str]=None,
    role:Optional[str]=None,director:Optional[str]=None,manager:Optional[str]=None,
    notice:Optional[str]=None,vp:Optional[str]=None,project:Optional[str]=None,ta:Optional[str]=None
):
    df=apply_filters(load_data(),qdict(startDate,endDate,role,director,manager,None,notice,vp,project,ta)); return json_safe(serialize(df[df['Current Pipeline Stage']==stageValue]))

@app.get('/api/drilldown/director')
def drill_director(directorName:str): return json_safe(serialize(load_data().query('Director == @directorName')))
@app.get('/api/drilldown/manager')
def drill_manager(managerName:str): return json_safe(serialize(load_data().query('Manager == @managerName')))

@app.get('/api/brs')
def brs(
    startDate:Optional[str]=None,endDate:Optional[str]=None,role:Optional[str]=None,
    director:Optional[str]=None,manager:Optional[str]=None,stage:Optional[str]=None,
    notice:Optional[str]=None,vp:Optional[str]=None,project:Optional[str]=None,ta:Optional[str]=None
):
    df=apply_filters(load_data(),qdict(startDate,endDate,role,director,manager,stage,notice,vp,project,ta))
    return json_safe(brs_analytics(df))
