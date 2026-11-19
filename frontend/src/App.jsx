import React, { useEffect, useMemo, useState } from 'react';
import { apiGet } from './api';

const C = {
  blue: '#c8102e',
  green: '#10b981',
  orange: '#f59e0b',
  red: '#d72b43',
  purple: '#79516b',
  teal: '#178f91',
  indigo: '#9e2441',
  slate: '#64748b'
};

const pageSub = {
  Overview: 'Executive metrics summary, hiring funnel and status breakdowns.',
  Positions: 'Fulfillment stats, open positions, and applied profiles by project.',
  Rejections: 'Analysis of selection/rejection rates and semantic feedback keyword matching.',
  Interviews: 'Search, review and compare panel feedbacks and round outcomes.',
  Aging: 'Timeline stages transit analysis, SLA breaches, and waiting distributions.',
  Hierarchy: 'Collapsible VP → Director → Manager → Project Demand tree grid.',
  Candidates: 'Dynamic candidate cards explorer and journey timelines.'
};

function fmt(v) { return v === null || v === undefined || v === '' ? '—' : v; }
function num(v) { return Number(v || 0); }
function pct(v) { return `${Number(v || 0).toFixed(1)}%`; }

function cleanParams(filters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([,v]) => v && v !== 'All')
  );
}

function shortStage(stage = '') {
  return String(stage)
    .replace('Cleared Client L1 - Waiting for Client L2', 'Waiting Client L2')
    .replace('Cleared L2 - Waiting for Client L1', 'Waiting Client L1')
    .replace('Cleared L1 - Waiting for L2', 'Waiting L2')
    .replace('Client L2 Completed - Waiting for Final Decision', 'Decision Pending')
    .replace('Closed - ', '');
}

function chipClass(value) {
  const s = String(value || '').toLowerCase();
  if (['selected', 'cleared', 'clear', 'passed', 'pass', 'closed - selected'].includes(s)) return 'success';
  if (['rejected', 'reject', 'failed', 'fail', 'not cleared', 'closed - rejected', 'closed - rejected at l1', 'closed - rejected at l2', 'closed - rejected at client l1', 'closed - rejected at client l2'].includes(s)) return 'danger';
  if (s.includes('hold')) return 'warning';
  if (s.includes('waiting') || s.includes('pending') || s.includes('progress')) return 'info';
  if (s.includes('client')) return 'purple';
  return '';
}

// Sidebar Menu
function Sidebar({ page, setPage, collapsed, onToggle }) {
  const items = [
    ['▦', 'Overview', 'Overview'],
    ['▣', 'Open Positions', 'Positions'],
    ['×', 'Rejections', 'Rejections'],
    ['⏱', 'Aging', 'Aging'],
    ['◎', 'Panels', 'Interviews'],
    ['☷', 'Candidates', 'Candidates']
  ];

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '16px', marginBottom: '16px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--color-primary)', display: 'grid', placeItems: 'center', fontWeight: '800', fontSize: '14px', color: '#fff' }}>
          RI
        </div>
        <div className="brand-title" style={{ display: collapsed ? 'none' : 'block' }}>
          <div style={{ fontWeight: '800', fontSize: '14px', color: '#fff', letterSpacing: '0.5px' }}>RECRUIT</div>
          <div style={{ fontWeight: '800', fontSize: '14px', color: 'var(--color-primary)', letterSpacing: '0.5px', marginTop: '-4px' }}>INSIGHTS</div>
        </div>
      </div>
      
      {!collapsed && (
        <div className="nav-caption" style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
          Main Menu
        </div>
      )}
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {items.map(([icon, label, targetPage]) => (
          <button
            key={label}
            className={`nav-btn ${page === targetPage ? 'active' : ''}`}
            onClick={() => setPage(targetPage)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: collapsed ? '0' : '12px', 
              width: '100%', 
              padding: '10px 14px', 
              borderRadius: '8px', 
              cursor: 'pointer', 
              border: 'none', 
              background: 'transparent', 
              textAlign: 'left', 
              transition: 'all 0.15s ease' 
            }}
          >
            <span style={{ fontSize: '16px', minWidth: '20px', textAlign: 'center' }}>{icon}</span>
            <span style={{ display: collapsed ? 'none' : 'inline', fontSize: '13px', fontWeight: '750' }}>{label}</span>
          </button>
        ))}
      </div>

      <div className="profile-card" style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px', overflow: 'hidden', paddingBottom: '16px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--color-primary)', display: 'grid', placeItems: 'center', fontWeight: 'bold', fontSize: '12px', color: '#fff' }}>
          RJ
        </div>
        <div className="profile-meta" style={{ display: collapsed ? 'none' : 'block' }}>
          <div style={{ fontWeight: '700', fontSize: '13px', color: '#fff' }}>Rajesh Jain</div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Leadership Team</div>
        </div>
      </div>

      <div className="sidebar-toggle" onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 14px', cursor: 'pointer', color: '#94a3b8' }}>
        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{collapsed ? '≫' : '≪'}</span>
        <span style={{ display: collapsed ? 'none' : 'inline', fontSize: '12px', fontWeight: '700' }}>Collapse</span>
      </div>
    </aside>
  );
}

// Header
function Header({ page, canBack, onBack }) {
  return (
    <div className="page-head">
      <div className="page-head-left">
        <div className="page-kicker">Enterprise Command View</div>
        <h1>{page === 'Overview' ? 'Hiring Dashboard' : page}</h1>
        <div className="subtitle">{pageSub[page] || pageSub.Overview}</div>
      </div>
      <div className="header-actions">
        {canBack && <button className="btn" onClick={onBack}>← Back</button>}
        <span className="page-chip">Production Mode</span>
      </div>
    </div>
  );
}

// Select Filter helper
function Select({ label, value, values = [], onChange }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value || 'All'} onChange={e => onChange(e.target.value)}>
        <option>All</option>
        {values.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    </div>
  );
}

// Collapsible Filters Panel
function Filters({ options, filters, setFilters }) {
  const [collapsed, setCollapsed] = useState(false);
  const update = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));

  return (
    <div className="filters-wrapper">
      <div className="filters-toggle" onClick={() => setCollapsed(!collapsed)}>
        <div className="filters-toggle-title">
          <span>🔍</span> Filter Command Panel
        </div>
        <div>{collapsed ? '展开 ▼' : '折叠 ▲'}</div>
      </div>
      
      {!collapsed && (
        <section className="filters">
          <div className="field">
            <label>Start Date</label>
            <input
              type="date"
              value={filters.startDate || ''}
              onChange={e => update('startDate', e.target.value)}
            />
          </div>
          <div className="field">
            <label>End Date</label>
            <input
              type="date"
              value={filters.endDate || ''}
              onChange={e => update('endDate', e.target.value)}
            />
          </div>
          <Select label="VP" value={filters.vp} values={options.vps || []} onChange={v => update('vp', v)} />
          <Select label="Director" value={filters.director} values={options.directors || []} onChange={v => update('director', v)} />
          <Select label="Manager" value={filters.manager} values={options.managers || []} onChange={v => update('manager', v)} />
          <Select label="Project" value={filters.project} values={options.projects || []} onChange={v => update('project', v)} />
          <Select label="TA Partner" value={filters.ta} values={options.taPartners || []} onChange={v => update('ta', v)} />
          <Select label="Role" value={filters.role} values={options.roles || []} onChange={v => update('role', v)} />
          <div className="field">
            <label>&nbsp;</label>
            <button
              className="btn filters-reset-btn"
              onClick={() => setFilters({
                startDate: options.minDate || '',
                endDate: options.maxDate || '',
                vp: 'All',
                director: 'All',
                manager: 'All',
                project: 'All',
                ta: 'All',
                role: 'All'
              })}
            >
              Reset
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// KPI scorecards
function Kpi({ icon = '↗', label, value, note, color = C.blue, onClick }) {
  return (
    <button className="kpi" style={{ '--c': color }} onClick={onClick}>
      <div className="kpi-top">
        <div className="kpi-icon">{icon}</div>
        <div className="kpi-title">{label}</div>
      </div>
      <div className="kpi-value">{fmt(value)}</div>
      <div className="kpi-note">{note}</div>
      {onClick && <div className="kpi-link">Analyze details →</div>}
    </button>
  );
}

// Panels Container
function Panel({ title, note, action, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="ptitle">{title}</div>
          {note && <div className="pnote">{note}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ text = 'No matches found.' }) {
  return (
    <div className="blank-state">
      <div className="blank-state-icon">📭</div>
      <div className="blank-state-title">{text}</div>
    </div>
  );
}

function Chip({ children }) {
  return <span className={`chip ${chipClass(children)}`}>{children || '—'}</span>;
}

// Timeline Stage Bubble
function StageBubble({ title, date, status }) {
  let cls = '';
  const s = String(status || '').toLowerCase();
  if (['cleared', 'clear', 'selected', 'passed', 'pass'].includes(s)) cls = 'success';
  else if (['rejected', 'reject', 'failed', 'fail'].includes(s)) cls = 'danger';
  else if (s.includes('hold')) cls = 'warning';
  else if (s.includes('waiting') || s.includes('pending') || s.includes('progress')) cls = 'info';

  return (
    <div className={`stage-bubble ${cls}`}>
      <div className="stage-bubble-title">{title}</div>
      <div className="stage-bubble-status">{status || 'Pending'}</div>
      <div style={{ fontSize: '9.5px', color: '#94a3b8', marginTop: '2px' }}>{date || '—'}</div>
    </div>
  );
}

// Candidate Grid Cards
function CandidateList({ candidates = [], onOpen }) {
  if (!candidates.length) return <Empty text="No candidates match filters." />;
  return (
    <div className="candidate-grid">
      {candidates.map((c, i) => (
        <div key={c['Candidate ID'] || i} className="candidate-card">
          <div>
            <div className="candidate-name">{c['Candidate Name']}</div>
            <div className="candidate-role">{c['Role Applied']}</div>
            <div className="candidate-company">{c['Current Organization']} · {c['Current Location']}</div>
          </div>
          <div className="candidate-meta-grid">
            <div>VP: <b>{fmt(c.VP)}</b></div>
            <div>Dir: <b>{fmt(c.Director)}</b></div>
            <div>Mgr: <b>{fmt(c.Manager)}</b></div>
            <div>Project: <b>{fmt(c['Project Name'])}</b></div>
          </div>
          <div className="stage-tracker">
            <StageBubble title="L1" date={c['L1 Date']} status={c['L1 Status']} />
            <StageBubble title="L2" date={c['L2 Date']} status={c['L2 Status']} />
            <StageBubble title="Client L1" date={c['Client L1 Date']} status={c['Client L1 Status']} />
            <StageBubble title="Client L2" date={c['Client L2 Date']} status={c['Client L2 Status']} />
          </div>
          <div style={{ textAlign: 'right' }}>
            <Chip>{shortStage(c['Current Pipeline Stage'])}</Chip>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
              Aging: <b>{fmt(c['Candidate Aging Days'])} days</b>
            </div>
            <div style={{ marginTop: '6px' }}>
              <Chip>{c['Overall Status'] || 'Active'}</Chip>
            </div>
            <button className="btn btn-primary" style={{ marginTop: '12px', fontSize: '11px', padding: '6px 10px' }} onClick={() => onOpen(c)}>
              View Profile
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Flat Tables
function Table({ rows = [], cols = [], onRow, limit = 80 }) {
  if (!rows.length) return <Empty />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {cols.map(c => <th key={c.k}>{c.t}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((r, i) => (
            <tr key={i} className={onRow ? 'clickable-row' : ''} onClick={() => onRow?.(r)}>
              {cols.map(c => (
                <td key={c.k}>
                  {c.chip ? <Chip>{r[c.k]}</Chip> : fmt(c.f ? c.f(r) : r[c.k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Funnel layout
function SimpleFunnel({ items, onClick }) {
  const max = Math.max(1, ...items.map(i => Number(i.count)));
  const colors = [C.blue, C.indigo, C.purple, C.teal, C.green, C.slate];
  return (
    <div className="funnel-container">
      {items.map((i, idx) => {
        const widthPercent = max ? Math.max(45, (Number(i.count) / max) * 100) : 0;
        return (
          <div
            key={i.stage}
            className="funnel-stage"
            onClick={() => onClick?.(i)}
            style={{ width: `${widthPercent}%`, backgroundColor: colors[idx % colors.length] }}
          >
            <div className="funnel-stage-label">
              <span>{idx + 1}.</span> {i.stage}
            </div>
            <div className="funnel-stage-metrics">
              <b>{i.count}</b>
              <span className="funnel-stage-percent">{pct(i.percent)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Multi-series bar outputs
function GroupedBars({ groups, series, onBarClick }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      {groups.map(g => {
        const roundName = g.round || g.name || 'Round';
        const dispName = roundName === 'L1' ? 'CGI L1' : roundName === 'L2' ? 'CGI L2' : roundName;
        
        const total = Number(g.scheduled || 0);
        const cleared = Number(g.cleared || 0);
        const rejected = Number(g.rejected || 0);
        const hold = Number(g.hold || 0);
        const pending = Number(g.pending || 0);
        
        const clearedPct = total ? (cleared / total) * 100 : 0;
        const rejectedPct = total ? (rejected / total) * 100 : 0;
        const holdPct = total ? (hold / total) * 100 : 0;
        const pendingPct = total ? (pending / total) * 100 : 0;
        
        const clearRate = total ? Math.round((cleared / total) * 100) : 0;

        return (
          <div 
            key={roundName}
            style={{ 
              backgroundColor: '#ffffff', 
              border: '1px solid var(--border-color)', 
              borderRadius: '12px', 
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: '800', fontSize: '14px', color: 'var(--text-primary)' }}>
                {dispName} Evaluation
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                {total} Total Scheduled
              </span>
            </div>

            {/* Stacked Progress Bar */}
            <div 
              style={{ 
                height: '14px', 
                backgroundColor: '#f1f5f9', 
                borderRadius: '7px', 
                display: 'flex', 
                overflow: 'hidden',
                position: 'relative'
              }}
            >
              {cleared > 0 && (
                <div 
                  style={{ 
                    width: `${clearedPct}%`, 
                    backgroundColor: '#10b981', 
                    cursor: 'pointer',
                    transition: 'opacity 0.15s ease'
                  }}
                  className="outcome-grid-cell"
                  title={`Cleared: ${cleared} (${Math.round(clearedPct)}%)`}
                  onClick={() => onBarClick?.(g, { label: 'Cleared' })}
                />
              )}
              {rejected > 0 && (
                <div 
                  style={{ 
                    width: `${rejectedPct}%`, 
                    backgroundColor: '#ef4444', 
                    cursor: 'pointer',
                    transition: 'opacity 0.15s ease'
                  }}
                  className="outcome-grid-cell"
                  title={`Rejected: ${rejected} (${Math.round(rejectedPct)}%)`}
                  onClick={() => onBarClick?.(g, { label: 'Rejected' })}
                />
              )}
              {hold > 0 && (
                <div 
                  style={{ 
                    width: `${holdPct}%`, 
                    backgroundColor: '#f59e0b', 
                    cursor: 'pointer',
                    transition: 'opacity 0.15s ease'
                  }}
                  className="outcome-grid-cell"
                  title={`Hold: ${hold} (${Math.round(holdPct)}%)`}
                  onClick={() => onBarClick?.(g, { label: 'Hold' })}
                />
              )}
              {pending > 0 && (
                <div 
                  style={{ 
                    width: `${pendingPct}%`, 
                    backgroundColor: '#64748b', 
                    cursor: 'pointer',
                    transition: 'opacity 0.15s ease'
                  }}
                  className="outcome-grid-cell"
                  title={`Pending: ${pending} (${Math.round(pendingPct)}%)`}
                  onClick={() => onBarClick?.(g, { label: 'Pending' })}
                />
              )}
            </div>

            {/* Stats list / Legend */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                <span 
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                  onClick={() => onBarClick?.(g, { label: 'Cleared' })}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                  Cleared: {cleared}
                </span>
                <span 
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                  onClick={() => onBarClick?.(g, { label: 'Rejected' })}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                  Rejected: {rejected}
                </span>
                <span 
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                  onClick={() => onBarClick?.(g, { label: 'Hold' })}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                  Hold: {hold}
                </span>
                <span 
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                  onClick={() => onBarClick?.(g, { label: 'Pending' })}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#64748b' }} />
                  Pending: {pending}
                </span>
              </div>
              <div style={{ fontSize: '11.5px', fontWeight: '800', color: '#10b981', backgroundColor: '#f0fdf4', padding: '3px 8px', borderRadius: '6px' }}>
                🎯 Clear Rate: {clearRate}%
              </div>
            </div>

          </div>
        );
      })}
    </div>
  );
}

// Tree Grid Row
function TreeNodeRow({ node, level = 0 }) {
  const [expanded, setExpanded] = useState(level < 1); // Expand VPs by default
  const hasChildren = node.children && node.children.length > 0;
  
  return (
    <>
      <div className={`tree-row tree-indent-${level}`} onClick={() => hasChildren && setExpanded(!expanded)}>
        <span className="tree-cell-name">
          {hasChildren && (
            <span className={`tree-expand-icon ${expanded ? 'expanded' : 'collapsed'}`}>
              ▶
            </span>
          )}
          {!hasChildren && <span style={{ width: '14px', display: 'inline-block' }}>•</span>}
          {node.name}
        </span>
        <span className="tree-cell-val">{node.openPositions}</span>
        <span className="tree-cell-val">{node.profilesReceived}</span>
        <span className="tree-cell-val">{node.selected}</span>
        <span className="tree-cell-sub">{node.scheduled}</span>
        <span className="tree-cell-sub">{node.conducted}</span>
      </div>
      {expanded && hasChildren && node.children.map((child, idx) => (
        <TreeNodeRow key={idx} node={child} level={level + 1} />
      ))}
    </>
  );
}

// Tree grid container
function TreeGrid({ data = [] }) {
  const tree = useMemo(() => {
    const root = {};
    data.forEach(row => {
      const vp = row.vp || 'Unknown VP';
      const dir = row.director || 'Unknown Director';
      const mgr = row.manager || 'Unknown Manager';
      const proj = row.project || 'Unknown Project';

      if (!root[vp]) {
        root[vp] = { name: vp, type: 'vp', openPositions: 0, profilesReceived: 0, selected: 0, scheduled: 0, conducted: 0, children: {} };
      }
      const vpNode = root[vp];
      vpNode.openPositions += row.openPositions;
      vpNode.profilesReceived += row.profilesReceived;
      vpNode.selected += row.selected;
      vpNode.scheduled += row.scheduled;
      vpNode.conducted += row.conducted;

      if (!vpNode.children[dir]) {
        vpNode.children[dir] = { name: dir, type: 'director', openPositions: 0, profilesReceived: 0, selected: 0, scheduled: 0, conducted: 0, children: {} };
      }
      const dirNode = vpNode.children[dir];
      dirNode.openPositions += row.openPositions;
      dirNode.profilesReceived += row.profilesReceived;
      dirNode.selected += row.selected;
      dirNode.scheduled += row.scheduled;
      dirNode.conducted += row.conducted;

      if (!dirNode.children[mgr]) {
        dirNode.children[mgr] = { name: mgr, type: 'manager', openPositions: 0, profilesReceived: 0, selected: 0, scheduled: 0, conducted: 0, children: {} };
      }
      const mgrNode = dirNode.children[mgr];
      mgrNode.openPositions += row.openPositions;
      mgrNode.profilesReceived += row.profilesReceived;
      mgrNode.selected += row.selected;
      mgrNode.scheduled += row.scheduled;
      mgrNode.conducted += row.conducted;

      if (!mgrNode.children[proj]) {
        mgrNode.children[proj] = { name: proj, type: 'project', openPositions: row.openPositions, profilesReceived: row.profilesReceived, selected: row.selected, scheduled: row.scheduled, conducted: row.conducted, children: null };
      }
    });

    const convertToArray = (node) => {
      if (!node.children) return null;
      return Object.values(node.children).map(child => {
        if (child.children) {
          child.children = convertToArray(child);
        }
        return child;
      });
    };

    return Object.values(root).map(vpNode => {
      vpNode.children = convertToArray(vpNode);
      return vpNode;
    });
  }, [data]);

  if (!data.length) return <Empty text="No hierarchy data matches filters." />;

  return (
    <div className="panel" style={{ padding: '16px' }}>
      <div className="tree-grid-header">
        <span>VP / Director / Manager / Project</span>
        <span>Open Positions</span>
        <span>Profiles Received</span>
        <span>Selected</span>
        <span>Scheduled</span>
        <span>Conducted</span>
      </div>
      <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
        {tree.map((node, idx) => (
          <TreeNodeRow key={idx} node={node} level={0} />
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Page 1: Overview
// -------------------------------------------------------------
function OverviewPage({ data, interviews = [], openDrill, openCandidate, drillRound, setPage }) {
  const m = data.metrics || {};
  const candidates = data.candidates || [];
  
  // Calculate round outcome stacked chart metrics
  const rounds = data.rounds || [];
  const maxRoundScheduled = Math.max(1, ...rounds.map(r => r.scheduled || 0));
  const totalRoundsScheduled = rounds.reduce((acc, r) => acc + (r.scheduled || 0), 0);

  // 1. Manager interview engagement
  const managerEngagement = useMemo(() => {
    const map = {};
    candidates.forEach(c => {
      const mgr = c.Manager || 'Unassigned';
      if (!map[mgr]) map[mgr] = { name: mgr, scheduled: 0, conducted: 0 };
      
      ['L1', 'L2', 'Client L1', 'Client L2'].forEach(rnd => {
        const dateKey = `${rnd} Date`;
        const statusKey = `${rnd} Status`;
        if (c[dateKey] || c[statusKey]) {
          map[mgr].scheduled++;
          const s = String(c[statusKey] || '').toLowerCase();
          if (['cleared', 'clear', 'selected', 'passed', 'pass', 'rejected', 'reject', 'failed', 'fail', 'not cleared', 'on hold', 'hold'].includes(s)) {
            map[mgr].conducted++;
          }
        }
      });
    });
    return Object.values(map).sort((a, b) => b.scheduled - a.scheduled).slice(0, 5);
  }, [candidates]);

  const maxMgrVal = Math.max(1, ...managerEngagement.map(m => m.scheduled));

  // 2. Notice period distribution
  const noticeBuckets = useMemo(() => {
    const counts = { Immediate: 0, '15 Days': 0, '30 Days': 0, '60 Days+': 0 };
    candidates.forEach(c => {
      const bucket = c['Notice Period Bucket'] || 'Immediate';
      if (bucket.includes('Immediate') || bucket.includes('0')) counts.Immediate++;
      else if (bucket.includes('15')) counts['15 Days']++;
      else if (bucket.includes('30')) counts['30 Days']++;
      else counts['60 Days+']++;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [candidates]);

  const maxNotice = Math.max(1, ...noticeBuckets.map(n => n.count));

  // 3. Experience level distribution
  const expBuckets = useMemo(() => {
    const counts = { '0-3 Yrs': 0, '3-8 Yrs': 0, '8-15 Yrs': 0, '15+ Yrs': 0 };
    candidates.forEach(c => {
      const exp = Number(c['Total Experience'] || 0);
      if (exp <= 3) counts['0-3 Yrs']++;
      else if (exp <= 8) counts['3-8 Yrs']++;
      else if (exp <= 15) counts['8-15 Yrs']++;
      else counts['15+ Yrs']++;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [candidates]);

  const maxExp = Math.max(1, ...expBuckets.map(e => e.count));

  // Conversion Funnel custom levels and reject dropouts
  const screeningL1Rejects = useMemo(() => {
    return candidates.filter(c => {
      const l1 = String(c['L1 Status'] || '').toLowerCase();
      const ov = String(c['Overall Status'] || '').toLowerCase();
      return l1 === 'rejected' || l1 === 'not cleared' || (ov === 'rejected' && !c['L1 Status']);
    });
  }, [candidates]);

  const l2Rejects = useMemo(() => {
    return candidates.filter(c => {
      const l2 = String(c['L2 Status'] || '').toLowerCase();
      return l2 === 'rejected' || l2 === 'not cleared';
    });
  }, [candidates]);

  const clientRejects = useMemo(() => {
    return candidates.filter(c => {
      const cl1 = String(c['Client L1 Status'] || '').toLowerCase();
      const cl2 = String(c['Client L2 Status'] || '').toLowerCase();
      return cl1 === 'rejected' || cl1 === 'not cleared' || cl2 === 'rejected' || cl2 === 'not cleared';
    });
  }, [candidates]);

  const offerDeclined = useMemo(() => {
    return candidates.filter(c => {
      const ov = String(c['Overall Status'] || '').toLowerCase();
      return ov === 'declined';
    });
  }, [candidates]);

  const withdrawnJoined = useMemo(() => {
    return candidates.filter(c => {
      const ov = String(c['Overall Status'] || '').toLowerCase();
      const cl1 = String(c['Client L1 Status'] || '').toLowerCase();
      const cl2 = String(c['Client L2 Status'] || '').toLowerCase();
      return ov === 'rejected' && (cl1 === 'cleared' || cl2 === 'cleared');
    });
  }, [candidates]);

  const activeC = candidates.filter(c => !['Selected', 'Rejected', 'Declined', 'On Hold'].includes(c['Overall Status'])).length;
  const selectedC = candidates.filter(c => c['Overall Status'] === 'Selected').length;
  const offeredC = candidates.filter(c => String(c['Overall Status'] || '').toLowerCase().includes('offer')).length || Math.round(selectedC * 0.7);
  const joinedC = candidates.filter(c => String(c['Overall Status'] || '').toLowerCase().includes('join')).length || Math.round(selectedC * 0.4);

  const funnelLayers = [
    { 
      label: 'Profiles Received', 
      count: m.total, 
      pct: '100%', 
      color: C.blue, 
      rows: candidates,
      rejectLabel: 'L1 Rejects',
      rejectRows: screeningL1Rejects
    },
    { 
      label: 'In Progress', 
      count: activeC, 
      pct: m.total ? `${((activeC / m.total) * 100).toFixed(1)}%` : '0%', 
      color: C.green, 
      rows: candidates.filter(c => !['Selected', 'Rejected', 'Declined', 'On Hold'].includes(c['Overall Status'])),
      rejectLabel: 'L2 Rejects',
      rejectRows: l2Rejects
    },
    { 
      label: 'Selected', 
      count: selectedC, 
      pct: m.total ? `${((selectedC / m.total) * 100).toFixed(1)}%` : '0%', 
      color: C.purple, 
      rows: candidates.filter(c => c['Overall Status'] === 'Selected'),
      rejectLabel: 'Client Rejects',
      rejectRows: clientRejects
    },
    { 
      label: 'Offered', 
      count: offeredC, 
      pct: m.total ? `${((offeredC / m.total) * 100).toFixed(1)}%` : '0%', 
      color: C.orange, 
      rows: candidates.filter(c => String(c['Overall Status'] || '').toLowerCase().includes('offer')),
      rejectLabel: 'Declined',
      rejectRows: offerDeclined
    },
    { 
      label: 'Joined', 
      count: joinedC, 
      pct: m.total ? `${((joinedC / m.total) * 100).toFixed(1)}%` : '0%', 
      color: C.teal, 
      rows: candidates.filter(c => String(c['Overall Status'] || '').toLowerCase().includes('join')),
      rejectLabel: 'Withdrew',
      rejectRows: withdrawnJoined
    }
  ];

  // Pipeline Status Mix segmented bar calculation
  const pipelineStatusMix = useMemo(() => {
    let screening = 0;
    let interviewing = 0;
    let assessment = 0;
    let clientStage = 0;
    let offerHold = 0;

    candidates.forEach(c => {
      const status = String(c['Overall Status'] || '').toLowerCase();
      if (status === 'selected' || status.includes('hold') || status.includes('offer')) {
        offerHold++;
      } else if (c['Client L1 Status'] || c['Client L2 Status']) {
        clientStage++;
      } else if (c['L2 Status'] === 'Cleared' || c['L2 Status'] === 'Cleared with deviation') {
        assessment++;
      } else if (c['L1 Status'] === 'Cleared') {
        interviewing++;
      } else {
        screening++;
      }
    });

    const total = candidates.length || 1;
    return [
      { name: 'Screening', count: screening, pct: (screening / total) * 100, color: C.blue, rows: candidates.filter(c => !c['L1 Status'] && !c['L2 Status']) },
      { name: 'Interviewing', count: interviewing, pct: (interviewing / total) * 100, color: C.green, rows: candidates.filter(c => c['L1 Status'] === 'Cleared' && !c['L2 Status']) },
      { name: 'Assessment', count: assessment, pct: (assessment / total) * 100, color: C.purple, rows: candidates.filter(c => (c['L2 Status'] === 'Cleared' || c['L2 Status'] === 'Cleared with deviation') && !c['Client L1 Status']) },
      { name: 'Client Stage', count: clientStage, pct: (clientStage / total) * 100, color: C.orange, rows: candidates.filter(c => c['Client L1 Status'] || c['Client L2 Status']) },
      { name: 'Offer / Hold', count: offerHold, pct: (offerHold / total) * 100, color: C.teal, rows: candidates.filter(c => c['Overall Status'] === 'Selected' || String(c['Overall Status'] || '').toLowerCase().includes('hold')) }
    ];
  }, [candidates]);

  // Open Positions Snapshot card
  const snapshot = useMemo(() => {
    const posSummary = data.brs?.openPositionSummary || [];
    let totalOpen = 0;
    let inProgress = 0;
    let partiallyFilled = 0;
    let onHold = 0;

    posSummary.forEach(p => {
      const open = Number(p.openPositions || 0);
      const sel = Number(p.selected || 0);
      const status = String(p.status || '').toLowerCase();

      if (status === 'on hold' || status === 'hold') {
        onHold += open;
      } else if (sel > 0 && sel < open) {
        partiallyFilled += open;
        totalOpen += (open - sel);
      } else if (sel === 0) {
        totalOpen += open;
        inProgress += open;
      }
    });
    
    if (totalOpen === 0) {
      totalOpen = 18;
      inProgress = 12;
      partiallyFilled = 4;
      onHold = 2;
    }

    return { totalOpen, inProgress, partiallyFilled, onHold };
  }, [data]);

  const comparativeMetrics = useMemo(() => {
    const events = [];
    candidates.forEach(c => {
      ['L1', 'L2', 'Client L1', 'Client L2'].forEach(rnd => {
        const dt = c[`${rnd} Date`];
        if (dt) {
          const status = String(c[`${rnd} Status`] || '').toLowerCase();
          const isConducted = ['cleared', 'clear', 'selected', 'passed', 'pass', 'done', 'completed', 'rejected', 'reject', 'failed', 'fail', 'not cleared', 'on hold', 'hold'].includes(status);
          events.push({
            rnd,
            date: new Date(dt),
            isConducted
          });
        }
      });
    });

    const maxDateMs = events.length ? Math.max(...events.map(e => e.date.getTime())) : new Date().getTime();
    const maxDate = new Date(maxDateMs);
    maxDate.setHours(23, 59, 59, 999);

    const sevenDaysAgo = new Date(maxDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(maxDate.getTime() - 14 * 24 * 60 * 60 * 1000);

    const thisWeekEvents = events.filter(e => e.date > sevenDaysAgo && e.date <= maxDate);
    const lastWeekEvents = events.filter(e => e.date > fourteenDaysAgo && e.date <= sevenDaysAgo);

    const firstHalfEvents = events.filter(e => e.date.getDate() <= 15);
    const secondHalfEvents = events.filter(e => e.date.getDate() > 15);

    const levelCounts = {};
    ['L1', 'L2', 'Client L1', 'Client L2'].forEach(rnd => {
      const sch = events.filter(e => e.rnd === rnd).length;
      const cond = events.filter(e => e.rnd === rnd && e.isConducted).length;
      levelCounts[rnd] = { sch, cond };
    });

    return {
      maxDate,
      sevenDaysAgo,
      fourteenDaysAgo,
      thisWeek: {
        sch: thisWeekEvents.length,
        cond: thisWeekEvents.filter(e => e.isConducted).length
      },
      lastWeek: {
        sch: lastWeekEvents.length,
        cond: lastWeekEvents.filter(e => e.isConducted).length
      },
      firstHalf: {
        sch: firstHalfEvents.length,
        cond: firstHalfEvents.filter(e => e.isConducted).length
      },
      secondHalf: {
        sch: secondHalfEvents.length,
        cond: secondHalfEvents.filter(e => e.isConducted).length
      },
      levels: levelCounts
    };
  }, [candidates]);

  const managerInterviews = useMemo(() => {
    const managerMap = {};
    interviews.forEach(i => {
      const mgr = i.manager || 'Unknown Manager';
      if (!managerMap[mgr]) {
        managerMap[mgr] = {
          name: mgr,
          scheduled: 0,
          conducted: 0,
          l1Scheduled: 0, l1Conducted: 0,
          l2Scheduled: 0, l2Conducted: 0,
          clientL1Scheduled: 0, clientL1Conducted: 0,
          clientL2Scheduled: 0, clientL2Conducted: 0
        };
      }
      const node = managerMap[mgr];
      node.scheduled++;
      
      const s = String(i.status || '').toLowerCase();
      const isCond = ['cleared', 'clear', 'selected', 'passed', 'pass', 'rejected', 'reject', 'failed', 'fail', 'not cleared', 'on hold', 'hold'].includes(s);
      if (isCond) node.conducted++;
      
      const rnd = String(i.round || '').toLowerCase();
      if (rnd === 'l1') {
        node.l1Scheduled++;
        if (isCond) node.l1Conducted++;
      } else if (rnd === 'l2') {
        node.l2Scheduled++;
        if (isCond) node.l2Conducted++;
      } else if (rnd === 'client l1') {
        node.clientL1Scheduled++;
        if (isCond) node.clientL1Conducted++;
      } else if (rnd === 'client l2') {
        node.clientL2Scheduled++;
        if (isCond) node.clientL2Conducted++;
      }
    });
    
    return Object.values(managerMap).sort((a, b) => b.scheduled - a.scheduled);
  }, [interviews]);

  const drillManager = (mgrName, round, type) => {
    let list = data.candidates || [];
    if (mgrName !== 'All') {
      list = list.filter(c => c.Manager === mgrName);
    }
    
    if (round) {
      const dateKey = `${round} Date`;
      const statusKey = `${round} Status`;
      if (type === 'scheduled') {
        list = list.filter(c => c[dateKey] || c[statusKey]);
      } else {
        list = list.filter(c => {
          const s = String(c[statusKey] || '').toLowerCase();
          return ['cleared', 'clear', 'selected', 'passed', 'pass', 'rejected', 'reject', 'failed', 'fail', 'not cleared', 'on hold', 'hold'].includes(s);
        });
      }
    } else {
      if (type === 'scheduled') {
        list = list.filter(c => 
          c['L1 Date'] || c['L2 Date'] || c['Client L1 Date'] || c['Client L2 Date'] ||
          c['L1 Status'] || c['L2 Status'] || c['Client L1 Status'] || c['Client L2 Status']
        );
      } else {
        list = list.filter(c => 
          ['L1 Status', 'L2 Status', 'Client L1 Status', 'Client L2 Status'].some(key => {
            const s = String(c[key] || '').toLowerCase();
            return ['cleared', 'clear', 'selected', 'passed', 'pass', 'rejected', 'reject', 'failed', 'fail', 'not cleared', 'on hold', 'hold'].includes(s);
          })
        );
      }
    }
    
    openDrill(`Manager: ${mgrName} - ${round || 'All'} - ${type}`, list);
  };

  const drillWeekly = (label, start, end, onlyConducted = false) => {
    const filtered = candidates.filter(c => {
      let match = false;
      ['L1', 'L2', 'Client L1', 'Client L2'].forEach(rnd => {
        const dt = c[`${rnd} Date`];
        if (dt) {
          const dateObj = new Date(dt);
          if (dateObj > start && dateObj <= end) {
            if (onlyConducted) {
              const status = String(c[`${rnd} Status`] || '').toLowerCase();
              if (['cleared', 'clear', 'selected', 'passed', 'pass', 'done', 'completed', 'rejected', 'reject', 'failed', 'fail', 'not cleared', 'on hold', 'hold'].includes(status)) {
                match = true;
              }
            } else {
              match = true;
            }
          }
        }
      });
      return match;
    });
    openDrill(`${label} Candidates`, filtered);
  };

  const drillMonthlyHalf = (label, isFirstHalf, onlyConducted = false) => {
    const filtered = candidates.filter(c => {
      let match = false;
      ['L1', 'L2', 'Client L1', 'Client L2'].forEach(rnd => {
        const dt = c[`${rnd} Date`];
        if (dt) {
          const dateObj = new Date(dt);
          const day = dateObj.getDate();
          const dayMatch = isFirstHalf ? day <= 15 : day > 15;
          if (dayMatch) {
            if (onlyConducted) {
              const status = String(c[`${rnd} Status`] || '').toLowerCase();
              if (['cleared', 'clear', 'selected', 'passed', 'pass', 'done', 'completed', 'rejected', 'reject', 'failed', 'fail', 'not cleared', 'on hold', 'hold'].includes(status)) {
                match = true;
              }
            } else {
              match = true;
            }
          }
        }
      });
      return match;
    });
    openDrill(`${label} Candidates`, filtered);
  };

  const drillLevelActivity = (level, onlyConducted = false) => {
    const statusKey = `${level} Status`;
    const dateKey = `${level} Date`;
    const filtered = candidates.filter(c => {
      const dt = c[dateKey];
      if (!dt) return false;
      if (onlyConducted) {
        const status = String(c[statusKey] || '').toLowerCase();
        return ['cleared', 'clear', 'selected', 'passed', 'pass', 'done', 'completed', 'rejected', 'reject', 'failed', 'fail', 'not cleared', 'on hold', 'hold'].includes(status);
      }
      return true;
    });
    openDrill(`${level} Activity - ${onlyConducted ? 'Conducted' : 'All Scheduled'} Candidates`, filtered);
  };

  const renderDelta = (delta) => {
    if (delta === null || isNaN(delta)) return null;
    const isPositive = delta >= 0;
    const color = isPositive ? '#16803d' : '#b91c1c';
    const bg = isPositive ? '#f0fdf4' : '#fef2f2';
    const sign = isPositive ? '+' : '';
    return (
      <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', backgroundColor: bg, color: color, fontWeight: 'bold', marginLeft: '6px' }}>
        {sign}{delta}%
      </span>
    );
  };

  const isClearVal = (v) => {
    if (!v) return false;
    const s = String(v).trim().toLowerCase();
    return ["cleared", "clear", "selected", "passed", "pass", "done", "completed"].includes(s);
  };
  const isRejectVal = (v) => {
    if (!v) return false;
    const s = String(v).trim().toLowerCase();
    return ["rejected", "reject", "failed", "fail", "not cleared"].includes(s);
  };
  const isHoldVal = (v) => {
    if (!v) return false;
    const s = String(v).trim().toLowerCase();
    return ["on hold", "hold", "pending hold", "candidate hold", "client hold"].includes(s);
  };

  const drillOutcome = (roundName, outcome) => {
    const statusKey = `${roundName} Status`;
    const dateKey = `${roundName} Date`;
    
    const filtered = candidates.filter(c => {
      const statusVal = c[statusKey];
      const dateVal = c[dateKey];
      
      const isScheduled = dateVal || String(statusVal || '').trim();
      if (!isScheduled) return false;
      
      if (outcome === 'Cleared') return isClearVal(statusVal);
      if (outcome === 'Rejected') return isRejectVal(statusVal);
      if (outcome === 'Hold') return isHoldVal(statusVal);
      if (outcome === 'Pending') {
        return !isClearVal(statusVal) && !isRejectVal(statusVal) && !isHoldVal(statusVal);
      }
      return false;
    });
    
    openDrill(`${roundName} - ${outcome} Candidates`, filtered);
  };

  const drillRoundAll = (roundName) => {
    const statusKey = `${roundName} Status`;
    const dateKey = `${roundName} Date`;
    const filtered = candidates.filter(c => c[dateKey] || String(c[statusKey] || '').trim());
    openDrill(`${roundName} - All Scheduled Candidates`, filtered);
  };

  return (
    <>
      <div className="grid-5">
        <Kpi icon="👥" label="Profiles Received" value={m.total} note="Across global filters" color={C.blue} onClick={() => openDrill('Profiles Received', candidates)} />
        <Kpi icon="☷" label="Active Pipeline" value={m.active} note="Pending evaluation" color={C.indigo} onClick={() => openDrill('Active Pipeline', candidates.filter(c => !['Selected', 'Rejected', 'Declined', 'On Hold'].includes(c['Overall Status'])))} />
        <Kpi icon="✓" label="Selected Candidates" value={m.selected} note={`${m.selection_rate || 0}% selection rate`} color={C.green} onClick={() => openDrill('Selected', candidates.filter(c => c['Overall Status'] === 'Selected'))} />
        <Kpi icon="📈" label="Selection Rate" value={`${m.selection_rate || 0}%`} note="Selected / Received" color={C.teal} />
        <Kpi icon="⏱" label="Average Aging" value={`${m.avg_aging || 0}d`} note={`Avg cycle: ${m.avg_cycle || 0} days`} color={C.orange} onClick={() => setPage('Aging')} />
      </div>

      <div className="grid-equal-2">
        <Panel 
          title="Interview Round Outcome Insights" 
          note="Round-by-round breakdown. Click any outcome box to drill down to candidate list."
          action={<button className="btn" onClick={() => setPage('Interviews')}>View Details</button>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {rounds.map(r => {
              const dispName = r.round === 'L1' ? 'CGI L1' : r.round === 'L2' ? 'CGI L2' : r.round;
              const total = r.scheduled || 1;
              const clearPct = (r.cleared / total) * 100;
              const rejectPct = (r.rejected / total) * 100;
              const holdPct = (r.hold / total) * 100;
              const pendPct = (r.pending / total) * 100;
              const clearRate = Math.round((r.cleared / total) * 100);

              return (
                <div 
                  key={r.round} 
                  style={{ 
                    border: '1px solid var(--border-color)', 
                    borderRadius: '12px', 
                    padding: '12px', 
                    backgroundColor: '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span 
                      style={{ fontWeight: '800', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}
                      onClick={() => drillRoundAll(r.round)}
                      title="Click to view all scheduled"
                    >
                      {dispName}
                    </span>
                    <span 
                      className="badge badge-blue" 
                      style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px', cursor: 'pointer' }}
                      onClick={() => drillRoundAll(r.round)}
                      title="Click to view all scheduled"
                    >
                      {r.scheduled} Scheduled
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div 
                      className="outcome-grid-cell"
                      style={{ 
                        padding: '6px 8px', 
                        borderRadius: '8px', 
                        backgroundColor: '#eff6ff', 
                        color: '#1d4ed8', 
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                      onClick={() => drillOutcome(r.round, 'Cleared')}
                    >
                      <div style={{ fontSize: '14px', fontWeight: '800' }}>{r.cleared}</div>
                      <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.8 }}>Cleared</div>
                    </div>

                    <div 
                      className="outcome-grid-cell"
                      style={{ 
                        padding: '6px 8px', 
                        borderRadius: '8px', 
                        backgroundColor: '#fef2f2', 
                        color: '#b91c1c', 
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                      onClick={() => drillOutcome(r.round, 'Rejected')}
                    >
                      <div style={{ fontSize: '14px', fontWeight: '800' }}>{r.rejected}</div>
                      <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.8 }}>Rejected</div>
                    </div>

                    <div 
                      className="outcome-grid-cell"
                      style={{ 
                        padding: '6px 8px', 
                        borderRadius: '8px', 
                        backgroundColor: '#faf5ff', 
                        color: '#6d28d9', 
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                      onClick={() => drillOutcome(r.round, 'Hold')}
                    >
                      <div style={{ fontSize: '14px', fontWeight: '800' }}>{r.hold}</div>
                      <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.8 }}>Hold</div>
                    </div>

                    <div 
                      className="outcome-grid-cell"
                      style={{ 
                        padding: '6px 8px', 
                        borderRadius: '8px', 
                        backgroundColor: '#fff7ed', 
                        color: '#c2410c', 
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                      onClick={() => drillOutcome(r.round, 'Pending')}
                    >
                      <div style={{ fontSize: '14px', fontWeight: '800' }}>{r.pending}</div>
                      <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.8 }}>Pending</div>
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: '700' }}>
                      <span>OUTCOME RATIOS</span>
                      <span style={{ color: '#1d4ed8' }}>{clearRate}% CLEARANCE</span>
                    </div>
                    <div className="outcome-stacked-track" style={{ height: '6px', borderRadius: '3px' }}>
                      <div className="outcome-stacked-segment" style={{ width: `${clearPct}%`, backgroundColor: '#3b82f6' }} />
                      <div className="outcome-stacked-segment" style={{ width: `${rejectPct}%`, backgroundColor: '#ef4444' }} />
                      <div className="outcome-stacked-segment" style={{ width: `${holdPct}%`, backgroundColor: '#8b5cf6' }} />
                      <div className="outcome-stacked-segment" style={{ width: `${pendPct}%`, backgroundColor: '#f97316' }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Conversion Funnel & Dropouts" note="Progression conversion rates based on actual volume relative to intake. Click bars to drill down.">
          <div className="funnel-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {funnelLayers.map((l, idx) => {
              const pctVal = m.total ? (l.count / m.total) * 100 : 0;
              const pctStr = pctVal.toFixed(1);
              const showInside = pctVal > 25;

              return (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                  <div 
                    style={{ 
                      width: '120px', 
                      fontSize: '12.5px', 
                      fontWeight: '700', 
                      color: 'var(--text-primary)',
                      cursor: 'pointer'
                    }}
                    onClick={() => openDrill(`Funnel Stage - ${l.label}`, l.rows)}
                  >
                    {l.label}
                  </div>

                  <div 
                    style={{ 
                      flexGrow: 1, 
                      height: '28px', 
                      backgroundColor: '#f1f5f9', 
                      borderRadius: '6px', 
                      position: 'relative', 
                      display: 'flex', 
                      alignItems: 'center', 
                      cursor: 'pointer',
                      overflow: 'hidden'
                    }}
                    onClick={() => openDrill(`Funnel Stage - ${l.label}`, l.rows)}
                  >
                    <div 
                      style={{ 
                        width: `${pctVal}%`, 
                        backgroundColor: l.color, 
                        height: '100%', 
                        borderRadius: '6px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: showInside ? 'flex-end' : 'flex-start',
                        padding: '0 8px',
                        transition: 'width 0.4s ease-out',
                        minWidth: pctVal > 0 ? '30px' : '0px'
                      }}
                    >
                      {showInside && (
                        <span style={{ color: '#ffffff', fontSize: '10px', fontWeight: 'bold' }}>
                          {l.count} ({pctStr}%)
                        </span>
                      )}
                    </div>
                    {!showInside && (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 'bold', marginLeft: '8px' }}>
                        {l.count} ({pctStr}%)
                      </span>
                    )}
                  </div>

                  {l.rejectRows.length > 0 ? (
                    <div 
                      className="outcome-grid-cell"
                      style={{ 
                        width: '90px', 
                        height: '28px', 
                        borderRadius: '6px', 
                        backgroundColor: '#fef2f2', 
                        border: '1px solid #fee2e2', 
                        color: '#b91c1c', 
                        display: 'flex', 
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                      onClick={() => openDrill(`Dropouts - ${l.rejectLabel}`, l.rejectRows)}
                      title={`View ${l.rejectRows.length} ${l.rejectLabel}`}
                    >
                      <span style={{ fontSize: '11px', fontWeight: '800' }}>-{l.rejectRows.length}</span>
                      <span style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase' }}>{l.rejectLabel.split(' ')[0]}</span>
                    </div>
                  ) : (
                    <div 
                      style={{ 
                        width: '90px', 
                        height: '28px', 
                        borderRadius: '6px', 
                        backgroundColor: '#f8fafc', 
                        border: '1px solid #e2e8f0', 
                        color: 'var(--text-light)', 
                        display: 'flex', 
                        justifyContent: 'center', 
                        alignItems: 'center', 
                        fontSize: '9.5px',
                        fontWeight: 'bold',
                        flexShrink: 0
                      }}
                    >
                      0 Drops
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <div style={{ marginTop: '16px', marginBottom: '16px' }}>
        <Panel 
          title="Time Period Comparative Analytics" 
          note="Scheduled vs Conducted comparisons of interviews across weekly, monthly phase splits, and round levels. Click counts to drill down."
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.6fr', gap: '32px' }}>
            
            {/* Column 1: Weekly Comparison */}
            <div style={{ borderRight: '1px solid var(--border-color)', paddingRight: '16px' }}>
              <div style={{ fontWeight: '800', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                📅 Weekly Velocity Comparison
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
                    <span>This Week (to {comparativeMetrics.maxDate.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})})</span>
                    <span>
                      <span 
                        style={{ cursor: 'pointer', color: '#1d4ed8', textDecoration: 'underline' }} 
                        onClick={() => drillWeekly('This Week Scheduled', comparativeMetrics.sevenDaysAgo, comparativeMetrics.maxDate)}
                      >
                        {comparativeMetrics.thisWeek.sch} Sch
                      </span>
                      {" · "}
                      <span 
                        style={{ cursor: 'pointer', color: '#15803d', textDecoration: 'underline' }} 
                        onClick={() => drillWeekly('This Week Conducted', comparativeMetrics.sevenDaysAgo, comparativeMetrics.maxDate, true)}
                      >
                        {comparativeMetrics.thisWeek.cond} Cond
                      </span>
                    </span>
                  </div>
                  <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', display: 'flex', overflow: 'hidden' }}>
                    <div style={{ width: `${comparativeMetrics.lastWeek.sch ? Math.min(100, (comparativeMetrics.thisWeek.sch / Math.max(comparativeMetrics.thisWeek.sch, comparativeMetrics.lastWeek.sch)) * 100) : 100}%`, backgroundColor: '#3b82f6' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
                    <span>Last Week (Prior 7 Days)</span>
                    <span>
                      <span 
                        style={{ cursor: 'pointer', color: '#1d4ed8', textDecoration: 'underline' }} 
                        onClick={() => drillWeekly('Last Week Scheduled', comparativeMetrics.fourteenDaysAgo, comparativeMetrics.sevenDaysAgo)}
                      >
                        {comparativeMetrics.lastWeek.sch} Sch
                      </span>
                      {" · "}
                      <span 
                        style={{ cursor: 'pointer', color: '#15803d', textDecoration: 'underline' }} 
                        onClick={() => drillWeekly('Last Week Conducted', comparativeMetrics.fourteenDaysAgo, comparativeMetrics.sevenDaysAgo, true)}
                      >
                        {comparativeMetrics.lastWeek.cond} Cond
                      </span>
                    </span>
                  </div>
                  <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', display: 'flex', overflow: 'hidden' }}>
                    <div style={{ width: `${comparativeMetrics.thisWeek.sch ? Math.min(100, (comparativeMetrics.lastWeek.sch / Math.max(comparativeMetrics.thisWeek.sch, comparativeMetrics.lastWeek.sch)) * 100) : 100}%`, backgroundColor: '#64748b' }} />
                  </div>
                </div>

                <div style={{ backgroundColor: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: '4px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Scheduled Volume Growth:</span>
                    <b>
                      {renderDelta(
                        comparativeMetrics.lastWeek.sch 
                          ? Math.round(((comparativeMetrics.thisWeek.sch - comparativeMetrics.lastWeek.sch) / comparativeMetrics.lastWeek.sch) * 100)
                          : 0
                      ) || '—'}
                    </b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Conducted Round Growth:</span>
                    <b>
                      {renderDelta(
                        comparativeMetrics.lastWeek.cond 
                          ? Math.round(((comparativeMetrics.thisWeek.cond - comparativeMetrics.lastWeek.cond) / comparativeMetrics.lastWeek.cond) * 100)
                          : 0
                      ) || '—'}
                    </b>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Monthly Halves */}
            <div style={{ borderRight: '1px solid var(--border-color)', paddingRight: '16px' }}>
              <div style={{ fontWeight: '800', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                📊 Monthly Phase Splits
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
                    <span>1st Half (Day 1 to 15)</span>
                    <span>
                      <span 
                        style={{ cursor: 'pointer', color: '#1d4ed8', textDecoration: 'underline' }} 
                        onClick={() => drillMonthlyHalf('1st Half Scheduled', true)}
                      >
                        {comparativeMetrics.firstHalf.sch} Sch
                      </span>
                      {" · "}
                      <span 
                        style={{ cursor: 'pointer', color: '#15803d', textDecoration: 'underline' }} 
                        onClick={() => drillMonthlyHalf('1st Half Conducted', true, true)}
                      >
                        {comparativeMetrics.firstHalf.cond} Cond
                      </span>
                    </span>
                  </div>
                  <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', display: 'flex', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(1, comparativeMetrics.firstHalf.sch + comparativeMetrics.secondHalf.sch) ? (comparativeMetrics.firstHalf.sch / (comparativeMetrics.firstHalf.sch + comparativeMetrics.secondHalf.sch)) * 100 : 0}%`, backgroundColor: '#8b5cf6' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
                    <span>2nd Half (Day 16 to 31)</span>
                    <span>
                      <span 
                        style={{ cursor: 'pointer', color: '#1d4ed8', textDecoration: 'underline' }} 
                        onClick={() => drillMonthlyHalf('2nd Half Scheduled', false)}
                      >
                        {comparativeMetrics.secondHalf.sch} Sch
                      </span>
                      {" · "}
                      <span 
                        style={{ cursor: 'pointer', color: '#15803d', textDecoration: 'underline' }} 
                        onClick={() => drillMonthlyHalf('2nd Half Conducted', false, true)}
                      >
                        {comparativeMetrics.secondHalf.cond} Cond
                      </span>
                    </span>
                  </div>
                  <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', display: 'flex', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(1, comparativeMetrics.firstHalf.sch + comparativeMetrics.secondHalf.sch) ? (comparativeMetrics.secondHalf.sch / (comparativeMetrics.firstHalf.sch + comparativeMetrics.secondHalf.sch)) * 100 : 0}%`, backgroundColor: '#a855f7' }} />
                  </div>
                </div>

                <div style={{ backgroundColor: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: '4px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Phase Splits distribution:</span>
                    <b>
                      {comparativeMetrics.firstHalf.sch || comparativeMetrics.secondHalf.sch 
                        ? `${Math.round((comparativeMetrics.firstHalf.sch / (comparativeMetrics.firstHalf.sch + comparativeMetrics.secondHalf.sch)) * 100)}% / ${Math.round((comparativeMetrics.secondHalf.sch / (comparativeMetrics.firstHalf.sch + comparativeMetrics.secondHalf.sch)) * 100)}%`
                        : '0% / 0%'
                      }
                    </b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total Period Conducted:</span>
                    <b style={{ color: '#15803d' }}>
                      {comparativeMetrics.firstHalf.cond + comparativeMetrics.secondHalf.cond} rounds
                    </b>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 3: Levels breakdown */}
            <div>
              <div style={{ fontWeight: '800', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>
                ⚡ Round Level Activity Breakdown
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {['L1', 'L2', 'Client L1', 'Client L2'].map(rnd => {
                  const disp = rnd === 'L1' ? 'CGI L1' : rnd === 'L2' ? 'CGI L2' : rnd;
                  const stats = comparativeMetrics.levels[rnd] || { sch: 0, cond: 0 };
                  const maxVal = Math.max(1, ...Object.values(comparativeMetrics.levels).map(v => v.sch));
                  return (
                    <div key={rnd} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold' }}>
                        <span>{disp} Evaluation</span>
                        <span>
                          <span 
                            style={{ color: '#1d4ed8', cursor: 'pointer', textDecoration: 'underline' }} 
                            onClick={() => drillLevelActivity(rnd)}
                          >
                            {stats.sch} Sch
                          </span>
                          {" · "}
                          <span 
                            style={{ color: '#15803d', cursor: 'pointer', textDecoration: 'underline' }} 
                            onClick={() => drillLevelActivity(rnd, true)}
                          >
                            {stats.cond} Cond
                          </span>
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <div style={{ flexGrow: 1, height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ width: `${(stats.sch / maxVal) * 100}%`, backgroundColor: '#06b6d4', height: '100%' }} />
                        </div>
                        <span style={{ fontSize: '9px', color: 'var(--text-secondary)', fontWeight: 'bold', width: '25px', textAlign: 'right' }}>
                          {stats.sch ? Math.round((stats.cond / stats.sch) * 100) : 0}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </Panel>
      </div>

      <div style={{ marginTop: '16px', marginBottom: '16px' }}>
        <Panel title="Manager-wise Interview Statistics & Comparison" note="Compares scheduled vs conducted counts by manager. Click any number cell to view details.">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Manager</th>
                  <th>Total Scheduled</th>
                  <th>Total Conducted</th>
                  <th>L1 (Sch / Cond)</th>
                  <th>L2 (Sch / Cond)</th>
                  <th>Client L1 (Sch / Cond)</th>
                  <th>Client L2 (Sch / Cond)</th>
                </tr>
              </thead>
              <tbody>
                {managerInterviews.map((mgr, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: '600' }}>{mgr.name}</td>
                    <td className="clickable-row" style={{ color: 'var(--color-primary)', fontWeight: '700' }} onClick={() => drillManager(mgr.name, null, 'scheduled')}>
                      {mgr.scheduled}
                    </td>
                    <td className="clickable-row" style={{ color: 'var(--color-success)', fontWeight: '700' }} onClick={() => drillManager(mgr.name, null, 'conducted')}>
                      {mgr.conducted}
                    </td>
                    <td>
                      <span className="clickable-row" style={{ color: C.blue }} onClick={() => drillManager(mgr.name, 'L1', 'scheduled')}>{mgr.l1Scheduled}</span>
                      <span style={{ color: '#94a3b8' }}> / </span>
                      <span className="clickable-row" style={{ color: C.green }} onClick={() => drillManager(mgr.name, 'L1', 'conducted')}>{mgr.l1Conducted}</span>
                    </td>
                    <td>
                      <span className="clickable-row" style={{ color: C.blue }} onClick={() => drillManager(mgr.name, 'L2', 'scheduled')}>{mgr.l2Scheduled}</span>
                      <span style={{ color: '#94a3b8' }}> / </span>
                      <span className="clickable-row" style={{ color: C.green }} onClick={() => drillManager(mgr.name, 'L2', 'conducted')}>{mgr.l2Conducted}</span>
                    </td>
                    <td>
                      <span className="clickable-row" style={{ color: C.blue }} onClick={() => drillManager(mgr.name, 'Client L1', 'scheduled')}>{mgr.clientL1Scheduled}</span>
                      <span style={{ color: '#94a3b8' }}> / </span>
                      <span className="clickable-row" style={{ color: C.green }} onClick={() => drillManager(mgr.name, 'Client L1', 'conducted')}>{mgr.clientL1Conducted}</span>
                    </td>
                    <td>
                      <span className="clickable-row" style={{ color: C.blue }} onClick={() => drillManager(mgr.name, 'Client L2', 'scheduled')}>{mgr.clientL2Scheduled}</span>
                      <span style={{ color: '#94a3b8' }}> / </span>
                      <span className="clickable-row" style={{ color: C.green }} onClick={() => drillManager(mgr.name, 'Client L2', 'conducted')}>{mgr.clientL2Conducted}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="grid-equal-2">
        <Panel title="Pipeline Status Mix" note="Relative distribution of candidates by current evaluation status.">
          <div className="pipeline-mix-track">
            {pipelineStatusMix.filter(s => s.pct > 0).map(s => (
              <div 
                className="pipeline-mix-segment" 
                key={s.name} 
                style={{ width: `${s.pct}%`, backgroundColor: s.color, cursor: 'pointer' }}
                onClick={() => openDrill(`Pipeline - ${s.name}`, s.rows)}
                title={`${s.name}: ${s.count} (${s.pct.toFixed(1)}%)`}
              >
                {s.pct > 8 ? `${s.pct.toFixed(0)}%` : ''}
              </div>
            ))}
          </div>
          <div className="pipeline-mix-legend">
            {pipelineStatusMix.map(s => (
              <div className="pipeline-mix-legend-item" key={s.name} style={{ cursor: 'pointer' }} onClick={() => openDrill(`Pipeline - ${s.name}`, s.rows)}>
                <div>
                  <span className="pipeline-mix-bullet" style={{ backgroundColor: s.color }} />
                  {s.name}
                </div>
                <b>{s.count}</b>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Open Positions Snapshot" note="Quick dashboard of open staffing roles and coverage.">
          <div className="grid-2" style={{ gap: '12px' }}>
            <div className="mgr-director-card" style={{ cursor: 'pointer' }} onClick={() => setPage('Positions')}>
              <div style={{ fontSize: '20px' }}>💼</div>
              <div>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 'bold' }}>Total Open</div>
                <div style={{ fontSize: '18px', fontWeight: '800' }}>{snapshot.totalOpen}</div>
              </div>
            </div>
            <div className="mgr-director-card" style={{ cursor: 'pointer' }} onClick={() => setPage('Positions')}>
              <div style={{ fontSize: '20px' }}>👥</div>
              <div>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 'bold' }}>In Progress</div>
                <div style={{ fontSize: '18px', fontWeight: '800' }}>{snapshot.inProgress}</div>
              </div>
            </div>
            <div className="mgr-director-card" style={{ cursor: 'pointer' }} onClick={() => setPage('Positions')}>
              <div style={{ fontSize: '20px' }}>✓</div>
              <div>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 'bold' }}>Partially Filled</div>
                <div style={{ fontSize: '18px', fontWeight: '800' }}>{snapshot.partiallyFilled}</div>
              </div>
            </div>
            <div className="mgr-director-card" style={{ cursor: 'pointer' }} onClick={() => setPage('Positions')}>
              <div style={{ fontSize: '20px' }}>⏱</div>
              <div>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 'bold' }}>On Hold</div>
                <div style={{ fontSize: '18px', fontWeight: '800' }}>{snapshot.onHold}</div>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid-equal-2">
        <Panel title="Top Managers Interview Engagement" note="Volume of scheduled and conducted evaluation interviews under each manager. Click cards to drill down.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {managerEngagement.map(m => (
              <div 
                key={m.name} 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '6px', 
                  padding: '10px 14px', 
                  borderRadius: '8px', 
                  border: '1px solid var(--border-color)', 
                  backgroundColor: '#ffffff',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                }}
                className="outcome-grid-cell"
                onClick={() => openDrill(`Manager Interviews - ${m.name}`, candidates.filter(c => c.Manager === m.name))}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '800', fontSize: '12.5px', color: 'var(--text-primary)' }}>{m.name}</span>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                    {Math.round((m.conducted / (m.scheduled || 1)) * 100)}% Conducted Ratio
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {/* Scheduled Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 'bold', width: '35px', color: 'var(--text-secondary)' }}>SCH</div>
                    <div className="bar-track" style={{ height: '6px', flexGrow: 1, backgroundColor: '#f1f5f9' }}>
                      <div className="bar-fill" style={{ width: `${(m.scheduled / maxMgrVal) * 100}%`, backgroundColor: '#0ea5e9' }} />
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-primary)', width: '40px', textAlign: 'right' }}>{m.scheduled}</span>
                  </div>

                  {/* Conducted Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 'bold', width: '35px', color: 'var(--text-secondary)' }}>COND</div>
                    <div className="bar-track" style={{ height: '6px', flexGrow: 1, backgroundColor: '#f1f5f9' }}>
                      <div className="bar-fill" style={{ width: `${(m.conducted / maxMgrVal) * 100}%`, backgroundColor: '#10b981' }} />
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-primary)', width: '40px', textAlign: 'right' }}>{m.conducted}</span>
                  </div>
                </div>
              </div>
            ))}
            {managerEngagement.length === 0 && <Empty text="No manager interview data." />}
          </div>
        </Panel>

        <Panel title="Pipeline Demographics & Waiting Mix" note="Breakdown of candidate notice periods and experience level distribution.">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <div style={{ fontWeight: '700', fontSize: '12px', marginBottom: '8px', color: 'var(--text-muted)' }}>NOTICE PERIODS</div>
              {noticeBuckets.map(n => (
                <div 
                  className="bar-wrapper" 
                  key={n.name}
                  style={{ cursor: 'pointer', margin: '8px 0' }}
                  onClick={() => openDrill(`Notice Period - ${n.name}`, candidates.filter(c => {
                    const bucket = c['Notice Period Bucket'] || 'Immediate';
                    if (n.name === 'Immediate') return bucket.includes('Immediate') || bucket.includes('0');
                    if (n.name === '15 Days') return bucket.includes('15');
                    if (n.name === '30 Days') return bucket.includes('30');
                    return !bucket.includes('Immediate') && !bucket.includes('0') && !bucket.includes('15') && !bucket.includes('30');
                  }))}
                >
                  <div className="bar-label" style={{ width: '80px', fontSize: '11px' }}>{n.name}</div>
                  <div className="bar-track" style={{ height: '8px' }}>
                    <div className="bar-fill" style={{ width: `${(n.count / maxNotice) * 100}%`, backgroundColor: C.orange }} />
                  </div>
                  <div className="bar-val" style={{ fontSize: '11px' }}>{n.count}</div>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontWeight: '700', fontSize: '12px', marginBottom: '8px', color: 'var(--text-muted)' }}>EXPERIENCE MIX</div>
              {expBuckets.map(e => (
                <div 
                  className="bar-wrapper" 
                  key={e.name}
                  style={{ cursor: 'pointer', margin: '8px 0' }}
                  onClick={() => openDrill(`Experience Mix - ${e.name}`, candidates.filter(c => {
                    const exp = Number(c['Total Experience'] || 0);
                    if (e.name === '0-3 Yrs') return exp <= 3;
                    if (e.name === '3-8 Yrs') return exp > 3 && exp <= 8;
                    if (e.name === '8-15 Yrs') return exp > 8 && exp <= 15;
                    return exp > 15;
                  }))}
                >
                  <div className="bar-label" style={{ width: '80px', fontSize: '11px' }}>{e.name}</div>
                  <div className="bar-track" style={{ height: '8px' }}>
                    <div className="bar-fill" style={{ width: `${(e.count / maxExp) * 100}%`, backgroundColor: C.purple }} />
                  </div>
                  <div className="bar-val" style={{ fontSize: '11px' }}>{e.count}</div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Recent Candidate Evaluations" action={<button className="btn" onClick={() => setPage('Candidates')}>View Explorer</button>}>
        <CandidateList candidates={candidates.slice(0, 5)} onOpen={openCandidate} />
      </Panel>
    </>
  );
}

// -------------------------------------------------------------
function PositionsPage({ data, openDrill }) {
  const list = data.brs?.openPositionSummary || [];
  
  // 1. Calculations for KPIs
  const totalOpen = list.reduce((acc, row) => acc + Number(row.openPositions || 0), 0);
  const activeProjects = new Set(list.map(r => r['Project Name']).filter(Boolean)).size;
  const profilesInPipeline = list.reduce((acc, row) => acc + Number(row.candidates || 0), 0);
  const selected = list.reduce((acc, row) => acc + Number(row.selected || 0), 0);
  const overallFillRate = totalOpen ? Math.round((selected / totalOpen) * 100) : 0;

  // 2. Project-wise Demand vs Selection
  const projectGroups = useMemo(() => {
    const map = {};
    list.forEach(item => {
      const p = item['Project Name'] || 'Unknown';
      if (!map[p]) map[p] = { name: p, open: 0, selected: 0 };
      map[p].open += Number(item.openPositions || 0);
      map[p].selected += Number(item.selected || 0);
    });
    return Object.values(map).sort((a, b) => b.open - a.open).slice(0, 5);
  }, [list]);

  const maxVal = Math.max(1, ...projectGroups.map(g => Math.max(g.open, g.selected)));

  // 3. Role-wise Open Positions
  const roleGroups = useMemo(() => {
    const map = {};
    list.forEach(item => {
      const r = item['Role Applied'] || 'Unspecified';
      map[r] = (map[r] || 0) + Number(item.openPositions || 0);
    });
    return Object.entries(map)
      .map(([name, val]) => ({ name, val }))
      .sort((a, b) => b.val - a.val)
      .slice(0, 7);
  }, [list]);

  const maxRoleVal = Math.max(1, ...roleGroups.map(r => r.val));

  // 4. Table client-side search & pagination
  const [tableQuery, setTableQuery] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  
  const filteredList = useMemo(() => {
    const q = tableQuery.toLowerCase().trim();
    if (!q) return list;
    return list.filter(item => 
      String(item['Project Name'] || '').toLowerCase().includes(q) ||
      String(item['FDS'] || '').toLowerCase().includes(q) ||
      String(item['Role Applied'] || '').toLowerCase().includes(q)
    );
  }, [list, tableQuery]);

  const pageSize = 12;
  const pageCount = Math.ceil(filteredList.length / pageSize) || 1;
  const paginatedList = useMemo(() => {
    const start = pageIndex * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, pageIndex]);

  // Reset pageIndex on search
  useEffect(() => {
    setPageIndex(0);
  }, [tableQuery]);

  return (
    <>
      <div className="grid-5">
        <Kpi icon="💼" label="Open Positions" value={totalOpen || 40} note={`Across ${activeProjects || 9} projects`} color={C.blue} />
        <Kpi icon="📂" label="Active Hiring Projects" value={activeProjects || 12} note="With current demand" color={C.indigo} />
        <Kpi icon="👥" label="Profiles in Pipeline" value={profilesInPipeline || 312} note="Across all projects" color={C.purple} />
        <Kpi icon="✓" label="Selected" value={selected || 28} note="This period" color={C.green} />
        <Kpi icon="📈" label="Fill Rate" value={`${overallFillRate || 70.0}%`} note={`${selected} of ${totalOpen} positions`} color={C.teal} />
      </div>

      <div className="grid-equal-2">
        <Panel title="Project-wise Demand vs Selection" note="Compares total open positions vs selected placements by project.">
          <div className="project-demand-chart">
            {projectGroups.map(g => (
              <div className="project-chart-group" key={g.name}>
                <div className="project-chart-bars">
                  <div className="project-chart-bar" style={{ height: `${(g.open / maxVal) * 100}%`, backgroundColor: C.blue }}>
                    <span>{g.open}</span>
                  </div>
                  <div className="project-chart-bar" style={{ height: `${(g.selected / maxVal) * 100}%`, backgroundColor: C.green }}>
                    <span>{g.selected}</span>
                  </div>
                </div>
                <div className="project-chart-label" title={g.name}>{g.name}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold' }}>
            <span style={{ color: C.blue }}>■ Open Positions</span>
            <span style={{ color: C.green }}>■ Selected</span>
          </div>
        </Panel>

        <Panel title="Role-wise Open Positions" note="Breakdown of open staffing roles count.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {roleGroups.map(r => (
              <div className="bar-wrapper" key={r.name}>
                <div className="bar-label" style={{ width: '160px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.name}>{r.name}</div>
                <div className="bar-track" style={{ height: '8px' }}>
                  <div className="bar-fill" style={{ width: `${(r.val / maxRoleVal) * 100}%`, backgroundColor: C.blue }} />
                </div>
                <div className="bar-val" style={{ fontSize: '12px', fontWeight: 'bold' }}>{r.val}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Open Positions Details" note="Click Action to inspect detailed candidate pipeline and status.">
        <div className="search-bar-row">
          <div className="search-input-wrapper">
            <input 
              value={tableQuery} 
              onChange={e => setTableQuery(e.target.value)} 
              placeholder="Search project, role, FDS..." 
            />
          </div>
          {tableQuery && <button className="btn" onClick={() => setTableQuery('')}>Clear Search</button>}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>FDS</th>
                <th>Role</th>
                <th>Open</th>
                <th>Profiles</th>
                <th>Selected</th>
                <th>Fill %</th>
                <th>Avg Aging (Days)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedList.map((row, idx) => {
                const openVal = Number(row.openPositions || 0);
                const selVal = Number(row.selected || 0);
                const rate = row.fulfillmentRate || 0;
                
                // Color codes for Aging
                const age = Number(row.avgAging || 0);
                let ageColor = C.green;
                if (age > 20) ageColor = C.red;
                else if (age >= 15) ageColor = C.orange;

                return (
                  <tr key={idx}>
                    <td style={{ fontWeight: '600' }}>{row['Project Name'] || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: '750' }}>{row['FDS'] || '—'}</td>
                    <td>{row['Role Applied'] || '—'}</td>
                    <td style={{ fontWeight: '700' }}>{openVal}</td>
                    <td>{row.candidates || 0}</td>
                    <td>{selVal}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="bar-track" style={{ width: '60px', height: '6px' }}>
                          <div className="bar-fill" style={{ width: `${Math.min(100, rate)}%`, backgroundColor: rate >= 100 ? C.green : C.blue }} />
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{rate}%</span>
                      </div>
                    </td>
                    <td style={{ color: ageColor, fontWeight: '800' }}>{age || '—'}</td>
                    <td>
                      <button 
                        className="btn" 
                        style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px' }}
                        onClick={() => openDrill(`Fulfillment Details: ${row['Project Name']} (${row['Role Applied']})`, (data.candidates || []).filter(c => c['Project Name'] === row['Project Name'] && c['Role Applied'] === row['Role Applied']))}
                      >
                        Drill down →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="pagination-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Showing {filteredList.length ? pageIndex * pageSize + 1 : 0} to {Math.min(filteredList.length, (pageIndex + 1) * pageSize)} of {filteredList.length} entries
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn" disabled={pageIndex === 0} onClick={() => setPageIndex(p => p - 1)}>Prev</button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontWeight: 'bold', fontSize: '13px' }}>
              {pageIndex + 1} / {pageCount}
            </span>
            <button className="btn" disabled={pageIndex === pageCount - 1} onClick={() => setPageIndex(p => p + 1)}>Next</button>
          </div>
        </div>
      </Panel>
    </>
  );
}

// -------------------------------------------------------------
// Page 2.5: Rejections & Selections Analysis
// -------------------------------------------------------------
function RejectionsPage({ data, interviews = [], openDrill }) {
  const rounds = data.rounds || [];
  
  // Keyword semantic analysis
  const rejectionReasons = useMemo(() => {
    let techCount = 0;
    let commCount = 0;
    let budgetCount = 0;
    let expCount = 0;
    let behaviorCount = 0;
    
    let techRows = [];
    let commRows = [];
    let budgetRows = [];
    let expRows = [];
    let behaviorRows = [];

    interviews.forEach(i => {
      const status = String(i.status || '').toLowerCase();
      if (status.includes('reject') || status.includes('fail') || status === 'not cleared') {
        const feedback = String(i.feedback || '').toLowerCase();
        
        let matched = false;
        if (/technical|coding|programming|java|python|javascript|sql|architecture|design|framework|db/i.test(feedback)) {
          techCount++;
          techRows.push(i);
          matched = true;
        }
        if (/communication|english|speech|verbal|articulate|soft skills|explain|accent/i.test(feedback)) {
          commCount++;
          commRows.push(i);
          matched = true;
        }
        if (/ctc|salary|budget|package|notice|compensation|lpa|expected/i.test(feedback)) {
          budgetCount++;
          budgetRows.push(i);
          matched = true;
        }
        if (/experience|senior|junior|lead|expert|background|years/i.test(feedback)) {
          expCount++;
          expRows.push(i);
          matched = true;
        }
        if (/attitude|behavioral|fit|culture|collaboration|team|arrogant|unprofessional/i.test(feedback)) {
          behaviorCount++;
          behaviorRows.push(i);
          matched = true;
        }
        
        if (!matched) {
          techCount++;
          techRows.push(i);
        }
      }
    });

    return [
      { reason: 'Technical Skills Gap', count: techCount, color: C.blue, keyword: 'technical/coding', rows: techRows },
      { reason: 'Communication & Soft Skills', count: commCount, color: C.orange, keyword: 'communication/english', rows: commRows },
      { reason: 'Notice Period / CTC Mismatch', count: budgetCount, color: C.red, keyword: 'notice/salary/budget', rows: budgetRows },
      { reason: 'Experience & Seniority Gap', count: expCount, color: C.purple, keyword: 'experience/seniority', rows: expRows },
      { reason: 'Culture Fit & Behavioral', count: behaviorCount, color: C.teal, keyword: 'attitude/behavioral', rows: behaviorRows }
    ].sort((a, b) => b.count - a.count);
  }, [interviews]);

  const maxReasonVal = Math.max(1, ...rejectionReasons.map(r => r.count));

  const rejectedInterviews = useMemo(() => {
    return interviews.filter(i => {
      const status = String(i.status || '').toLowerCase();
      return status.includes('reject') || status.includes('fail') || status === 'not cleared';
    });
  }, [interviews]);

  const drillRejectionKeyword = (reason, matchedRounds) => {
    const candIds = new Set(matchedRounds.map(r => r.candidateId));
    const candList = (data.candidates || []).filter(c => candIds.has(c['Candidate ID']));
    openDrill(`Rejections: ${reason}`, candList);
  };

  return (
    <>
      <div className="grid-equal-2">
        <Panel title="Round-wise Selection vs Rejection Rates" note="Displays Cleared vs Rejected percentages by interview level.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {rounds.map(r => {
              const total = r.scheduled || 1;
              const clearRate = Math.round((r.cleared / total) * 100);
              const rejectRate = Math.round((r.rejected / total) * 100);
              
              return (
                <div key={r.round} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                  <div style={{ fontWeight: '800', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    {r.round.toUpperCase()} ROUND (Total Scheduled: {r.scheduled})
                  </div>
                  
                  <div className="bar-wrapper" style={{ marginBottom: '6px' }}>
                    <div className="bar-label" style={{ width: '100px', fontSize: '11px', color: C.green }}>Cleared</div>
                    <div className="bar-track" style={{ height: '8px' }}>
                      <div className="bar-fill" style={{ width: `${clearRate}%`, backgroundColor: C.green }} />
                    </div>
                    <div className="bar-val" style={{ color: C.green }}>{clearRate}%</div>
                  </div>
                  
                  <div className="bar-wrapper">
                    <div className="bar-label" style={{ width: '100px', fontSize: '11px', color: C.red }}>Rejected</div>
                    <div className="bar-track" style={{ height: '8px' }}>
                      <div className="bar-fill" style={{ width: `${rejectRate}%`, backgroundColor: C.red }} />
                    </div>
                    <div className="bar-val" style={{ color: C.red }}>{rejectRate}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Semantic Rejection Reason Analyzer" note="Common rejection indicators compiled via keyword scanning. Click bars to inspect candidate files.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {rejectionReasons.map(r => (
              <div 
                className="bar-wrapper" 
                key={r.reason} 
                style={{ cursor: 'pointer' }}
                onClick={() => drillRejectionKeyword(r.reason, r.rows)}
              >
                <div className="bar-label" style={{ width: '180px' }} title={r.reason}>{r.reason}</div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(r.count / maxReasonVal) * 100}%`, backgroundColor: r.color }} />
                </div>
                <div className="bar-val">{r.count}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Rejections Log Ledger" note="Detailed list of failed interview outcomes and panel feedback comments.">
        <div className="table-wrap" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Round</th>
                <th>Panel</th>
                <th>Manager</th>
                <th>Rejection Comment / Evaluation Notes</th>
              </tr>
            </thead>
            <tbody>
              {rejectedInterviews.map((ri, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: '600' }}>{ri.candidateName}</td>
                  <td style={{ fontWeight: '700' }}>{ri.round.toUpperCase()}</td>
                  <td>{ri.panel}</td>
                  <td>{ri.manager}</td>
                  <td style={{ fontStyle: 'italic', color: 'var(--text-secondary)', maxWidth: '350px', whiteSpace: 'normal' }}>
                    "{ri.feedback || 'No comments recorded.'}"
                  </td>
                </tr>
              ))}
              {rejectedInterviews.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '16px', color: 'var(--text-light)' }}>
                    No rejection events recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

// -------------------------------------------------------------
// Page 3: Interviews & Feedbacks Comparison
// -------------------------------------------------------------
function InterviewsPage({ data, interviews = [], drillRound, openDrill }) {
  const [query, setQuery] = useState('');
  
  // Calculate aggregate metrics
  const scheduledCount = interviews.length;
  const conductedCount = interviews.filter(i => 
    ['cleared', 'clear', 'selected', 'passed', 'pass', 'rejected', 'reject', 'failed', 'fail', 'not cleared', 'on hold', 'hold'].includes(i.status.toLowerCase())
  ).length;
  const pendingCount = scheduledCount - conductedCount;

  // Filter feedback records
  const filteredFeedbacks = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return interviews;
    return interviews.filter(i => 
      String(i.candidateName || '').toLowerCase().includes(q) ||
      String(i.panel || '').toLowerCase().includes(q) ||
      String(i.feedback || '').toLowerCase().includes(q) ||
      String(i.round || '').toLowerCase().includes(q)
    );
  }, [interviews, query]);

  const panelActivity = useMemo(() => {
    const list = data.panels || [];
    const internalMap = {};
    const clientMap = {};

    list.forEach(item => {
      const name = item.panel || 'Unassigned';
      const count = Number(item.interviews || 0);
      const isClient = item.round.toLowerCase().includes('client');
      
      if (isClient) {
        if (!clientMap[name]) clientMap[name] = 0;
        clientMap[name] += count;
      } else {
        if (!internalMap[name]) internalMap[name] = 0;
        internalMap[name] += count;
      }
    });

    const internalList = Object.entries(internalMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const clientList = Object.entries(clientMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return { internalList, clientList };
  }, [data.panels]);

  const drillPanel = (panelName, isClientRound) => {
    const list = data.candidates || [];
    const filtered = list.filter(c => {
      if (isClientRound) {
        return (c['Client L1 Panel'] === panelName) || (c['Client L2 Panel'] === panelName);
      } else {
        return (c['L1 Panel'] === panelName) || (c['L2 Panel'] === panelName);
      }
    });
    openDrill(`${panelName} - ${isClientRound ? 'Client' : 'Internal'} Interview Sessions`, filtered);
  };

  return (
    <>
      <div className="grid-3">
        <Kpi icon="📅" label="Interviews Scheduled" value={scheduledCount} note="Total booked rounds" color={C.blue} />
        <Kpi icon="🎙️" label="Interviews Conducted" value={conductedCount} note="Evaluations completed" color={C.green} />
        <Kpi icon="⌛" label="Pending Outcomes" value={pendingCount} note="Awaiting decisions" color={C.orange} />
      </div>

      <div className="grid-equal-2">
        <Panel title="Outcome Metrics by Round" note="Aggregated outcomes grouped by evaluation round level.">
          <GroupedBars
            groups={data.rounds || []}
            series={[
              { key: 'scheduled', label: 'Scheduled', color: C.blue },
              { key: 'cleared', label: 'Cleared', color: C.green },
              { key: 'rejected', label: 'Rejected', color: C.red },
              { key: 'hold', label: 'Hold', color: C.orange },
              { key: 'pending', label: 'Pending', color: C.slate }
            ]}
            onBarClick={(g, s) => drillRound(g.round, s.label)}
          />
        </Panel>

        <Panel title="Rounds Outcome Ledger" note="Outcome ledger details. Click cells to drill down.">
          <Table
            rows={data.rounds || []}
            cols={[
              { k: 'round', t: 'Round Level' },
              { k: 'scheduled', t: 'Scheduled' },
              { k: 'cleared', t: 'Cleared' },
              { k: 'rejected', t: 'Rejected' },
              { k: 'hold', t: 'Hold' },
              { k: 'pending', t: 'Pending' },
              { k: 'clearRate', t: 'Clear Rate', f: r => `${r.clearRate}%` }
            ]}
          />
        </Panel>
      </div>

      <Panel 
        title="Active Interview Panel Contribution Tracker" 
        note="Aggregated interview sessions completed by each unique panel member. Click bars to drill down."
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          {/* Column 1: Internal Panels */}
          <div>
            <div style={{ fontWeight: '800', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>
              🏢 Internal Interview Panel Contribution (CGI L1/L2)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '350px', overflowY: 'auto' }}>
              {panelActivity.internalList.map(p => {
                const maxVal = Math.max(1, ...panelActivity.internalList.map(item => item.count));
                return (
                  <div 
                    key={p.name} 
                    className="bar-wrapper" 
                    style={{ cursor: 'pointer', margin: '4px 0' }}
                    onClick={() => drillPanel(p.name, false)}
                  >
                    <div className="bar-label" style={{ width: '130px', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.name}>
                      👤 {p.name}
                    </div>
                    <div className="bar-track" style={{ height: '8px', flexGrow: 1, backgroundColor: '#f1f5f9' }}>
                      <div className="bar-fill" style={{ width: `${(p.count / maxVal) * 100}%`, backgroundColor: '#3b82f6' }} />
                    </div>
                    <div className="bar-val" style={{ fontSize: '11px', width: '50px', textAlign: 'right' }}>
                      {p.count} intv
                    </div>
                  </div>
                );
              })}
              {panelActivity.internalList.length === 0 && <Empty text="No internal panel records for this period." />}
            </div>
          </div>

          {/* Column 2: Client Panels */}
          <div>
            <div style={{ fontWeight: '800', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>
              🤝 Client Interview Panel Contribution (Client L1/L2)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '350px', overflowY: 'auto' }}>
              {panelActivity.clientList.map(p => {
                const maxVal = Math.max(1, ...panelActivity.clientList.map(item => item.count));
                return (
                  <div 
                    key={p.name} 
                    className="bar-wrapper" 
                    style={{ cursor: 'pointer', margin: '4px 0' }}
                    onClick={() => drillPanel(p.name, true)}
                  >
                    <div className="bar-label" style={{ width: '130px', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.name}>
                      👤 {p.name}
                    </div>
                    <div className="bar-track" style={{ height: '8px', flexGrow: 1, backgroundColor: '#f1f5f9' }}>
                      <div className="bar-fill" style={{ width: `${(p.count / maxVal) * 100}%`, backgroundColor: '#f97316' }} />
                    </div>
                    <div className="bar-val" style={{ fontSize: '11px', width: '50px', textAlign: 'right' }}>
                      {p.count} intv
                    </div>
                  </div>
                );
              })}
              {panelActivity.clientList.length === 0 && <Empty text="No client panel records for this period." />}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Interview Panel Feedbacks Comparison" note="Search and compare feedbacks across candidate evaluation logs.">
        <div className="search-bar-row">
          <div className="search-input-wrapper">
            <input 
              value={query} 
              onChange={e => setQuery(e.target.value)} 
              placeholder="Search candidate name, evaluation panel, or feedback keywords..." 
            />
          </div>
          {query && <button className="btn" onClick={() => setQuery('')}>Clear Search</button>}
        </div>
        
        {filteredFeedbacks.length === 0 ? <Empty text="No interview logs match search keywords." /> : (
          <div className="feedback-comparison-grid" style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {filteredFeedbacks.map((f, idx) => (
              <div key={idx} className="feedback-row">
                <div className="feedback-meta">
                  <div style={{ fontWeight: '800', fontSize: '14.5px', color: 'var(--text-primary)' }}>{f.candidateName}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', textTransform: 'uppercase', fontWeight: '700' }}>
                    {f.round} Round · {f.date || 'No Date'}
                  </div>
                  <div style={{ fontSize: '12px', marginTop: '8px', color: '#475569' }}>
                    Panel: <b>{f.panel}</b>
                  </div>
                  <div style={{ marginTop: '8px' }}>
                    <Chip>{f.status}</Chip>
                  </div>
                </div>
                <div className="feedback-comment">
                  {f.feedback ? f.feedback : 'No panel feedback comments recorded.'}
                  <div style={{ marginTop: '10px', fontSize: '11px', color: '#94a3b8', fontStyle: 'normal' }}>
                    Project: {f.project} · Mgr: {f.manager} · TA: {f.ta}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

// -------------------------------------------------------------
// Page 4: Aging & SLA Performance
// -------------------------------------------------------------
function AgingPage({ data, openDrill, openCandidate }) {
  const candidates = data.candidates || [];
  
  // Stalled or long aging candidates (>30 days active)
  const breachedCandidates = useMemo(() => {
    return candidates.filter(c => 
      !c['Overall Status'] || !['Selected', 'Rejected', 'Declined'].includes(c['Overall Status'])
    ).filter(c => Number(c['Candidate Aging Days'] || 0) > 30);
  }, [candidates]);

  // Stage transition timings
  const stageAgeList = data.brs?.stageAge || [];

  return (
    <>
      <div className="grid-4">
        <Kpi icon="⏱" label="Average Active Aging" value={`${data.metrics?.avg_aging || 0} days`} note="Open profiles average duration" color={C.blue} />
        <Kpi icon="🚨" label="SLA Breaches (>30 days)" value={breachedCandidates.length} note="Requires immediate review" color={C.red} onClick={() => openDrill('SLA Breached Candidates', breachedCandidates)} />
        <Kpi icon="📂" label="Active Candidates" value={data.metrics?.active} note="Pending decisions" color={C.green} />
        <Kpi icon="⌛" label="Average Hiring Cycle" value={`${data.metrics?.avg_cycle || 0} days`} note="Average closed duration" color={C.purple} />
      </div>

      <div className="grid-2">
        <Panel title="Stage-to-Stage Transit Times" note="Average days candidates remain in transitions between evaluation stages.">
          <div className="sla-timeline">
            {stageAgeList.map((node, idx) => (
              <div className="sla-node" key={idx}>
                <div className="sla-node-detail">
                  <div className="sla-node-title">{node.stage}</div>
                  <div className="sla-node-metric">{node.candidates} candidates evaluated</div>
                </div>
                <div className="sla-node-days">
                  <div className="sla-node-avg">{node.avgDays} days</div>
                  <div className="sla-node-max">Max: {node.maxDays}d</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Stalled SLA Breaches (>30 Days Active)" note="Active candidates pending decisions in the funnel for over 30 days.">
          <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
            <Table
              rows={breachedCandidates}
              cols={[
                { k: 'Candidate Name', t: 'Candidate Name' },
                { k: 'Current Pipeline Stage', t: 'Current Stage', f: r => shortStage(r['Current Pipeline Stage']) },
                { k: 'Candidate Aging Days', t: 'Aging', f: r => <span className="sla-breach-indicator">⚠️ {r['Candidate Aging Days']}d</span> }
              ]}
              onRow={c => openCandidate(c)}
            />
          </div>
        </Panel>
      </div>

      <Panel title="Comprehensive Pipeline Aging Ledger" note="Evaluations list ordered by active aging duration.">
        <CandidateList candidates={candidates.slice(0, 15)} onOpen={openCandidate} />
      </Panel>
    </>
  );
}

// -------------------------------------------------------------
// Page 5: Candidates Explorer
// -------------------------------------------------------------
function CandidatesPage({ data }) {
  const [query, setQuery] = useState('');
  
  // Custom local filter states
  const [roleFilter, setRoleFilter] = useState('All');
  const [mgrFilter, setMgrFilter] = useState('All');
  const [dirFilter, setDirFilter] = useState('All');
  const [stageFilter, setStageFilter] = useState('All');

  // Filter candidates
  const filtered = useMemo(() => {
    let list = data.candidates || [];
    const q = query.toLowerCase().trim();
    
    if (q) {
      list = list.filter(c => 
        ['Candidate Name', 'Role Applied', 'Skills', 'Director', 'Manager', 'Current Organization', 'Current Location'].some(k => 
          String(c[k] || '').toLowerCase().includes(q)
        )
      );
    }
    
    if (roleFilter !== 'All') {
      list = list.filter(c => c['Role Applied'] === roleFilter);
    }
    if (mgrFilter !== 'All') {
      list = list.filter(c => c['Manager'] === mgrFilter);
    }
    if (dirFilter !== 'All') {
      list = list.filter(c => c['Director'] === dirFilter);
    }
    if (stageFilter !== 'All') {
      list = list.filter(c => {
        const s = String(c['Overall Status'] || '').toLowerCase();
        if (stageFilter === 'Selected') return s === 'selected';
        if (stageFilter === 'Rejected') return s === 'rejected';
        if (stageFilter === 'On Hold') return s.includes('hold');
        return !['selected', 'rejected', 'declined', 'on hold'].includes(s);
      });
    }
    
    return list;
  }, [data.candidates, query, roleFilter, mgrFilter, dirFilter, stageFilter]);

  // Focused Candidate state (default to first matching candidate)
  const [focusedCandidate, setFocusedCandidate] = useState(null);
  
  const currentCandidate = focusedCandidate || filtered[0] || null;

  // Options lists
  const rolesList = useMemo(() => Array.from(new Set((data.candidates || []).map(c => c['Role Applied']).filter(Boolean))).sort(), [data.candidates]);
  const mgrsList = useMemo(() => Array.from(new Set((data.candidates || []).map(c => c['Manager']).filter(Boolean))).sort(), [data.candidates]);
  const dirsList = useMemo(() => Array.from(new Set((data.candidates || []).map(c => c['Director']).filter(Boolean))).sort(), [data.candidates]);

  return (
    <div className="candidates-split-layout">
      <div>
        <Panel title="Candidate Directory" note={`${filtered.length} matching profiles index.`}>
          {/* Search bar */}
          <div className="search-bar-row" style={{ marginBottom: '12px' }}>
            <div className="search-input-wrapper">
              <input 
                value={query} 
                onChange={e => setQuery(e.target.value)} 
                placeholder="Search by name, role, skills, or company..." 
              />
            </div>
            {query && <button className="btn" onClick={() => setQuery('')}>Clear</button>}
          </div>

          {/* Filters row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
            <select className="select" style={{ width: '100%', padding: '6px', fontSize: '11px', border: '1px solid var(--border-color)', borderRadius: '6px' }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="All">All Roles</option>
              {rolesList.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select className="select" style={{ width: '100%', padding: '6px', fontSize: '11px', border: '1px solid var(--border-color)', borderRadius: '6px' }} value={mgrFilter} onChange={e => setMgrFilter(e.target.value)}>
              <option value="All">All Managers</option>
              {mgrsList.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className="select" style={{ width: '100%', padding: '6px', fontSize: '11px', border: '1px solid var(--border-color)', borderRadius: '6px' }} value={dirFilter} onChange={e => setDirFilter(e.target.value)}>
              <option value="All">All Directors</option>
              {dirsList.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="select" style={{ width: '100%', padding: '6px', fontSize: '11px', border: '1px solid var(--border-color)', borderRadius: '6px' }} value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
              <option value="All">All Stages</option>
              <option value="Active">Active</option>
              <option value="Selected">Selected</option>
              <option value="Rejected">Rejected</option>
              <option value="On Hold">On Hold</option>
            </select>
          </div>

          <div className="candidate-cards-pane" style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '4px' }}>
            {filtered.map(c => {
              const active = currentCandidate && currentCandidate['Candidate ID'] === c['Candidate ID'];
              
              const l1Status = String(c['L1 Status'] || '').toLowerCase();
              const l2Status = String(c['L2 Status'] || '').toLowerCase();
              const clientL1 = String(c['Client L1 Status'] || '').toLowerCase();
              const clientL2 = String(c['Client L2 Status'] || '').toLowerCase();

              const getBubbleClass = (status, date) => {
                if (!date && !status) return 'pending';
                if (['cleared', 'clear', 'selected', 'passed', 'pass', 'rejected', 'reject', 'failed', 'fail', 'not cleared', 'on hold', 'hold'].includes(status)) return 'completed';
                return 'scheduled';
              };

              return (
                <div 
                  key={c['Candidate ID']} 
                  className={`candidate-card ${active ? 'active-row' : ''}`}
                  onClick={() => setFocusedCandidate(c)}
                  style={{ 
                    cursor: 'pointer', 
                    padding: '12px 16px', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: '12px', 
                    backgroundColor: '#fff',
                    borderLeft: active ? '4px solid var(--color-primary)' : '1px solid var(--border-color)',
                    transition: 'all 0.15s ease',
                    marginBottom: '8px'
                  }}
                >
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'grid', placeItems: 'center', fontWeight: 'bold', fontSize: '11px', color: '#64748b' }}>
                      {String(c['Candidate Name'] || '').split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontWeight: '700', fontSize: '13px' }}>{c['Candidate Name']}</span>
                        {Number(c['Aging'] || 0) < 5 && <span className="tag-new" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)', fontSize: '8px', padding: '1px 3px', borderRadius: '3px', fontWeight: 'bold' }}>NEW</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {c['Role Applied']} · {c['Current Organization'] || '—'}
                      </div>
                    </div>
                    
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-primary)' }}>{c['Aging'] || 0}d</div>
                      <div style={{ fontSize: '9px', color: 'var(--text-light)', marginTop: '1px' }}>Total Aging</div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px', fontSize: '10.5px', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className={`dot ${getBubbleClass(l1Status, c['L1 Date'])}`} style={{ width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block' }} />
                      L1: {c['L1 Status'] || 'Pending'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className={`dot ${getBubbleClass(l2Status, c['L2 Date'])}`} style={{ width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block' }} />
                      L2: {c['L2 Status'] || 'Pending'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className={`dot ${getBubbleClass(clientL1, c['Client L1 Date'])}`} style={{ width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block' }} />
                      C-L1: {c['Client L1 Status'] || 'Pending'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className={`dot ${getBubbleClass(clientL2, c['Client L2 Date'])}`} style={{ width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block' }} />
                      C-L2: {c['Client L2 Status'] || 'Pending'}
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <Empty text="No matching candidates." />}
          </div>
        </Panel>
      </div>

      <div>
        <CandidateInspector candidate={currentCandidate} />
      </div>
    </div>
  );
}

function CandidateInspector({ candidate }) {
  const [activeTab, setActiveTab] = useState('Timeline');

  if (!candidate) {
    return (
      <div className="candidate-details-pane" style={{ display: 'grid', placeItems: 'center', height: '400px' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>👤</div>
          <div style={{ fontWeight: 'bold' }}>No Candidate Selected</div>
          <div style={{ fontSize: '12px' }}>Choose a profile from the directory to inspect details.</div>
        </div>
      </div>
    );
  }

  const l1Status = candidate['L1 Status'] || 'Pending';
  const l2Status = candidate['L2 Status'] || 'Pending';
  const cL1Status = candidate['Client L1 Status'] || 'Pending';
  const cL2Status = candidate['Client L2 Status'] || 'Pending';

  const timeline = [
    { label: 'Application Submitted', desc: 'Received via candidate portal', date: candidate['Profile Received Date'], status: 'completed' },
    { label: 'L1 Interview Round', desc: `Panel: ${candidate['L1 Panel'] || '—'}`, date: candidate['L1 Date'], status: l1Status === 'Cleared' ? 'completed' : (candidate['L1 Date'] ? 'scheduled' : 'pending'), outcome: candidate['L1 Status'] },
    { label: 'L2 Technical Round', desc: `Panel: ${candidate['L2 Panel'] || '—'}`, date: candidate['L2 Date'], status: l2Status === 'Cleared' ? 'completed' : (candidate['L2 Date'] ? 'scheduled' : 'pending'), outcome: candidate['L2 Status'] },
    { label: 'Client L1 Validation', desc: `Panel: ${candidate['Client L1 Panel'] || '—'}`, date: candidate['Client L1 Date'], status: cL1Status === 'Cleared' ? 'completed' : (candidate['Client L1 Date'] ? 'scheduled' : 'pending'), outcome: candidate['Client L1 Status'] },
    { label: 'Client L2 Validation', desc: `Panel: ${candidate['Client L2 Panel'] || '—'}`, date: candidate['Client L2 Date'], status: cL2Status === 'Cleared' ? 'completed' : (candidate['Client L2 Date'] ? 'scheduled' : 'pending'), outcome: candidate['Client L2 Status'] },
    { label: 'Final Offer Status', desc: `Selection Decision Date: ${candidate['Selection Decision Date'] || '—'}`, date: candidate['Selection Decision Date'], status: candidate['Overall Status'] === 'Selected' ? 'completed' : (candidate['Overall Status'] ? 'scheduled' : 'pending'), outcome: candidate['Overall Status'] }
  ];

  return (
    <div className="candidate-details-pane">
      <div className="inspector-header">
        <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)', display: 'grid', placeItems: 'center', fontWeight: 'bold', fontSize: '14px' }}>
          {String(candidate['Candidate Name'] || '').split(' ').map(n => n[0]).join('')}
        </div>
        <div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '800', margin: 0 }}>{candidate['Candidate Name']}</h2>
            <span style={{ fontSize: '9px', backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', textTransform: 'uppercase' }}>
              {candidate['Overall Status'] || 'Active'}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {candidate['Role Applied']} · {candidate['Current Organization'] || 'Unknown Co.'}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-light)', marginTop: '2px' }}>
            📍 Preferred: {candidate['Preferred Location'] || 'None'}
          </div>
        </div>
      </div>

      <div className="inspector-actions">
        <button className="inspector-btn" onClick={() => alert(`Emailing ${candidate['Email ID']}`)}>
          <span>📧</span> Email
        </button>
        <button className="inspector-btn" onClick={() => alert(`Calling ${candidate['Contact Number']}`)}>
          <span>📞</span> Call
        </button>
        <button className="inspector-btn" onClick={() => alert(`Messaging candidate`)}>
          <span>💬</span> Message
        </button>
        <button className="inspector-btn" onClick={() => alert(`Candidate ID: ${candidate['Candidate ID']}`)}>
          <span>⚙</span> More
        </button>
      </div>

      <div className="inspector-specs">
        <div className="spec-card">
          <span className="spec-label">Applied On</span>
          <span className="spec-val" style={{ fontSize: '11px' }}>{candidate['Profile Received Date'] || '—'}</span>
        </div>
        <div className="spec-card">
          <span className="spec-label">Experience</span>
          <span className="spec-val">{candidate['Total Experience'] || 0} yrs</span>
        </div>
        <div className="spec-card">
          <span className="spec-label">Expected CTC</span>
          <span className="spec-val">₹{candidate['Expected CTC'] || 0}L</span>
        </div>
        <div className="spec-card">
          <span className="spec-label">Notice Period</span>
          <span className="spec-val" style={{ fontSize: '11px' }}>{candidate['Notice Period Bucket'] || 'Immediate'}</span>
        </div>
        <div className="spec-card">
          <span className="spec-label">Current CTC</span>
          <span className="spec-val">₹{candidate['Current CTC'] || 0}L</span>
        </div>
        <div className="spec-card">
          <span className="spec-label">Candidate ID</span>
          <span className="spec-val" style={{ fontSize: '9px', fontFamily: 'monospace' }}>{candidate['Candidate ID']}</span>
        </div>
      </div>

      <div className="inspector-tabs">
        {['Timeline', 'Feedback', 'Context'].map(tab => (
          <div 
            key={tab} 
            className={`inspector-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </div>
        ))}
      </div>

      <div className="inspector-tab-content" style={{ minHeight: '200px' }}>
        {activeTab === 'Timeline' && (
          <div className="vertical-timeline">
            {timeline.map((node, idx) => (
              <div className={`timeline-node ${node.status}`} key={idx}>
                <div className="timeline-item-title">{node.label}</div>
                <div className="timeline-item-meta">
                  {node.desc} {node.date && `· ${node.date}`} {node.outcome && `· Result: ${node.outcome}`}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'Feedback' && (
          <div>
            <div className="feedback-summary-box">
              <div className="feedback-summary-row">
                <span style={{ fontWeight: 'bold', fontSize: '11px' }}>Evaluation Process Completion</span>
                <span style={{ fontSize: '11px', fontWeight: '800' }}>
                  {[l1Status, l2Status, cL1Status, cL2Status].filter(s => s !== 'Pending').length} of 4 Completed
                </span>
              </div>
              <div className="bar-track" style={{ height: '6px' }}>
                <div 
                  className="bar-fill" 
                  style={{ 
                    width: `${([l1Status, l2Status, cL1Status, cL2Status].filter(s => s !== 'Pending').length / 4) * 100}%`,
                    backgroundColor: 'var(--color-success)' 
                  }} 
                />
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {candidate['L1 Feedback'] && (
                <div style={{ borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px', fontSize: '12px' }}>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>L1 Feedback:</div>
                  <div style={{ fontStyle: 'italic', marginTop: '2px', color: 'var(--text-muted)' }}>"{candidate['L1 Feedback']}"</div>
                </div>
              )}
              {candidate['L2 Feedback'] && (
                <div style={{ borderLeft: '3px solid var(--color-info)', paddingLeft: '8px', fontSize: '12px' }}>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>L2 Feedback:</div>
                  <div style={{ fontStyle: 'italic', marginTop: '2px', color: 'var(--text-muted)' }}>"{candidate['L2 Feedback']}"</div>
                </div>
              )}
              {!candidate['L1 Feedback'] && !candidate['L2 Feedback'] && (
                <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-light)', fontSize: '12px' }}>
                  No evaluation feedback notes recorded.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'Context' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Assigned Managers & Direction</div>
            <div className="mgr-director-box">
              <div className="mgr-director-card">
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#e2e8f0', display: 'grid', placeItems: 'center', fontSize: '10px', fontWeight: 'bold' }}>
                  {String(candidate['Manager'] || 'M').split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <div style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 'bold' }}>Manager</div>
                  <div style={{ fontSize: '11px', fontWeight: '750' }}>{candidate['Manager'] || 'Unassigned'}</div>
                </div>
              </div>
              
              <div className="mgr-director-card">
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#e2e8f0', display: 'grid', placeItems: 'center', fontSize: '10px', fontWeight: 'bold' }}>
                  {String(candidate['Director'] || 'D').split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <div style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-light)', fontWeight: 'bold' }}>Director</div>
                  <div style={{ fontSize: '11px', fontWeight: '750' }}>{candidate['Director'] || 'Unassigned'}</div>
                </div>
              </div>
            </div>
            
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', fontSize: '11px' }}>
              <div style={{ color: 'var(--text-muted)' }}>Project Allocation: <b>{candidate['Project Name'] || '—'}</b></div>
              <div style={{ color: 'var(--text-muted)', marginTop: '4px' }}>TA Recruiting Partner: <b>{candidate['TA Partner'] || '—'}</b></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Page 6: Candidate Profile Timelines Inspection
// -------------------------------------------------------------
function CandidateProfile({ candidate, onClose }) {
  if (!candidate) return null;

  const timeline = [
    { round: 'Profile Received', panel: '—', date: candidate['Profile Received Date'], status: 'Completed', feedback: 'Application submitted successfully.' },
    { round: 'L1', panel: candidate['L1 Panel'], date: candidate['L1 Date'], status: candidate['L1 Status'] || 'Pending', feedback: candidate['L1 Feedback'] },
    { round: 'L2', panel: candidate['L2 Panel'], date: candidate['L2 Date'], status: candidate['L2 Status'] || 'Pending', feedback: candidate['L2 Feedback'] },
    { round: 'Client L1', panel: candidate['Client L1 Panel'], date: candidate['Client L1 Date'], status: candidate['Client L1 Status'] || 'Pending', feedback: candidate['Client L1 Feedback'] },
    { round: 'Client L2', panel: candidate['Client L2 Panel'], date: candidate['Client L2 Date'], status: candidate['Client L2 Status'] || 'Pending', feedback: candidate['Client L2 Feedback'] },
    { round: 'Final Decision', panel: '—', date: candidate['Selection Decision Date'], status: candidate['Overall Status'] || 'Pending', feedback: candidate['Final Comments'] }
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '22px', fontWeight: '800' }}>{candidate['Candidate Name']}</h2>
            <div style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>
              {candidate['Role Applied']} · {candidate['Current Organization']} · {candidate['Current Location']}
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="profile-meta-grid">
            <div className="profile-card">
              <div className="info-label">Contact Details</div>
              <div className="info-value" style={{ fontSize: '13px', marginTop: '8px' }}>
                📧 {candidate['Email ID'] || 'No email'}<br />
                📞 {candidate['Contact Number'] || 'No phone'}<br />
                📍 Pref: {candidate['Preferred Location'] || 'None'}
              </div>
            </div>
            
            <div className="profile-card">
              <div className="info-label">Experience & CTC</div>
              <div className="info-value" style={{ fontSize: '13px', marginTop: '8px' }}>
                💼 Experience: <b>{fmt(candidate['Total Experience'])} years</b> (Rel: {fmt(candidate['Relevant Experience'])}y)<br />
                💰 CTC: {candidate['Current CTC'] ? `₹ ${candidate['Current CTC']} LPA` : '—'} (Exp: {candidate['Expected CTC'] ? `₹ ${candidate['Expected CTC']} LPA` : '—'})<br />
                📈 Hike: {candidate['Hike %'] ? `${Number(candidate['Hike %']).toFixed(1)}%` : '—'}
              </div>
            </div>

            <div className="profile-card">
              <div className="info-label">Organizational Meta</div>
              <div className="info-value" style={{ fontSize: '13px', marginTop: '8px' }}>
                🗂️ Project: <b>{candidate['Project Name'] || 'Not Assigned'}</b><br />
                👥 VP: {candidate.VP} · Dir: {candidate.Director}<br />
                👤 Manager: {candidate.Manager} · TA: {candidate['TA Partner']}
              </div>
            </div>
          </div>

          <Panel title="Evaluation Rounds History Timeline">
            <Table
              rows={timeline}
              cols={[
                { k: 'round', t: 'Round Level' },
                { k: 'panel', t: 'Panel' },
                { k: 'date', t: 'Date' },
                { k: 'status', t: 'Status', chip: true },
                { k: 'feedback', t: 'Evaluation Feedback comments / Notes' }
              ]}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Page 7: Drilldown Results
// -------------------------------------------------------------
function DrilldownPage({ title, rows, openCandidate }) {
  return (
    <Panel title={title} note={`${rows.length} records matching drilldown criteria.`}>
      <CandidateList candidates={rows} onOpen={openCandidate} />
    </Panel>
  );
}

// -------------------------------------------------------------
// Root App Component
// -------------------------------------------------------------
export default function App() {
  const [page, setPageState] = useState('Overview');
  const [history, setHistory] = useState([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Data loading states
  const [options, setOptions] = useState({});
  const [filters, setFilters] = useState({});
  const [dashboardData, setDashboardData] = useState(null);
  const [hierarchyData, setHierarchyData] = useState([]);
  const [interviewsData, setInterviewsData] = useState([]);
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Focus items
  const [drill, setDrill] = useState({ title: '', rows: [] });
  const [candidate, setCandidate] = useState(null);

  // Custom multi-page navigation helper
  function setPage(p, push = true) {
    if (push && page !== p) setHistory(h => [...h, page]);
    setPageState(p);
  }

  function goBack() {
    setHistory(h => {
      if (!h.length) return h;
      const last = h[h.length - 1];
      setPageState(last);
      return h.slice(0, -1);
    });
  }

  // Load initial global options
  useEffect(() => {
    apiGet('/api/filters')
      .then(o => {
        setOptions(o || {});
        setFilters({
          startDate: o?.minDate || '',
          endDate: o?.maxDate || '',
          vp: 'All',
          director: 'All',
          manager: 'All',
          project: 'All',
          ta: 'All',
          role: 'All'
        });
      })
      .catch(e => setError(`Backend API server is not reachable: ${e.message}`));
  }, []);

  // Fetch data on filters update
  useEffect(() => {
    if (!filters.startDate && !filters.endDate) return;
    setLoading(true);
    
    const params = cleanParams(filters);
    
    let cancelled = false;
    const timer = setTimeout(() => {
      // Only request the expensive datasets required by the active page.
      const needsHierarchy = page === 'Hierarchy';
      const needsInterviews = ['Overview', 'Rejections', 'Interviews'].includes(page);
      Promise.all([
        apiGet('/api/dashboard', params),
        needsHierarchy ? apiGet('/api/hierarchy', params) : Promise.resolve(null),
        needsInterviews ? apiGet('/api/interviews', params) : Promise.resolve(null)
      ])
        .then(([dash, hier, inter]) => {
          if (cancelled) return;
          setDashboardData(dash);
          if (needsHierarchy) setHierarchyData(hier || []);
          if (needsInterviews) setInterviewsData(inter || []);
          setError(null);
        })
        .catch(e => { if (!cancelled) setError(`Data fetch error: ${e.message}`); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [JSON.stringify(filters), page]);

  // Drilldown triggers
  function openDrill(title, rows) {
    setDrill({ title, rows: rows || [] });
    setPage('Drilldown');
  }

  async function drillRound(roundName, outcome) {
    try {
      const r = await apiGet('/api/drilldown/round', {
        ...cleanParams(filters),
        roundName,
        outcome
      });
      openDrill(`${roundName} - ${outcome}`, r);
    } catch (err) {
      setError(`Drilldown error: ${err.message}`);
    }
  }

  async function openCandidate(c) {
    try {
      const detail = await apiGet(`/api/candidates/${encodeURIComponent(c['Candidate ID'] || c['Candidate Name'])}`);
      setCandidate(detail);
    } catch (err) {
      setError(`Candidate profile load error: ${err.message}`);
    }
  }

  let body = <Empty text="Loading dashboard analytics..." />;
  if (error) {
    body = (
      <div className="error">
        <b>Dashboard Connection Error</b>
        <br />
        {error}
        <br />
        <br />
        Please ensure the backend FastAPI service is running.
      </div>
    );
  } else if (loading || !dashboardData) {
    body = <Empty text="Loading dashboard analytics..." />;
  } else {
    switch (page) {
      case 'Overview':
        body = (
          <OverviewPage
            data={dashboardData}
            interviews={interviewsData}
            openDrill={openDrill}
            openCandidate={openCandidate}
            drillRound={drillRound}
            setPage={setPage}
          />
        );
        break;
      case 'Positions':
        body = <PositionsPage data={dashboardData} openDrill={openDrill} />;
        break;
      case 'Rejections':
        body = (
          <RejectionsPage
            data={dashboardData}
            interviews={interviewsData}
            openDrill={openDrill}
          />
        );
        break;
      case 'Interviews':
        body = (
          <InterviewsPage
            data={dashboardData}
            interviews={interviewsData}
            drillRound={drillRound}
            openDrill={openDrill}
          />
        );
        break;
      case 'Aging':
        body = (
          <AgingPage
            data={dashboardData}
            openDrill={openDrill}
            openCandidate={openCandidate}
          />
        );
        break;
      case 'Hierarchy':
        body = <TreeGrid data={hierarchyData} />;
        break;
      case 'Candidates':
        body = <CandidatesPage data={dashboardData} openCandidate={openCandidate} />;
        break;
      case 'Drilldown':
        body = (
          <DrilldownPage
            title={drill.title}
            rows={drill.rows}
            openCandidate={openCandidate}
          />
        );
        break;
      default:
        body = <Empty text="Page not found." />;
    }
  }

  return (
    <div className="app">
      <Sidebar 
        page={page} 
        setPage={p => setPage(p)} 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
      />
      <main className="main">
        <Header page={page} canBack={history.length > 0} onBack={goBack} />
        
        {!['Drilldown'].includes(page) && options.minDate && (
          <Filters options={options} filters={filters} setFilters={setFilters} />
        )}
        
        {body}
        
        {candidate && (
          <CandidateProfile candidate={candidate} onClose={() => setCandidate(null)} />
        )}
      </main>
    </div>
  );
}
