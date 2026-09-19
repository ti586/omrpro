// src/components/AppShell.jsx
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';

const NAV_SECTIONS = [
  {
    title: 'Principal',
    items: [
      { to: '/',          icon: '📊', label: 'Dashboard',   exact: true },
      { to: '/exams',     icon: '📝', label: 'Provas' },
      { to: '/exams/new', icon: '✏️', label: 'Nova Prova' },
    ],
  },
  {
    title: 'Cadastro',
    items: [
      { to: '/students', icon: '👤', label: 'Alunos' },
      { to: '/classes',  icon: '👥', label: 'Turmas' },
      { to: '/schools',  icon: '🏫', label: 'Escolas' },
    ],
  },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const location         = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const sideW = collapsed ? 64 : 220;

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#0f1117', color:'#e8eaf0',
                  fontFamily:'Segoe UI, system-ui, sans-serif' }}>

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside style={{
        width: sideW, minWidth: sideW, background:'#161b27',
        borderRight:'1px solid rgba(255,255,255,0.07)',
        display:'flex', flexDirection:'column',
        transition:'width 0.2s', overflow:'hidden',
      }}>

        {/* Logo */}
        <div style={{ padding:'18px 14px', borderBottom:'1px solid rgba(255,255,255,0.07)',
                      display:'flex', alignItems:'center', gap:10, justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <div style={{ width:34, height:34, borderRadius:9, flexShrink:0,
                        background:'linear-gradient(135deg,#4f8ef7,#6c47ff)',
                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>
            📋
          </div>
          {!collapsed && (
            <div>
              <div style={{ fontSize:15, fontWeight:700, letterSpacing:'-0.3px' }}>OMR·Pro</div>
              <div style={{ fontSize:10, color:'#8892a4', letterSpacing:'0.5px',
                            textTransform:'uppercase' }}>Correção Automática</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ padding:'10px 8px', flex:1, overflowY:'auto' }}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              {!collapsed && (
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.2)', textTransform:'uppercase',
                              letterSpacing:'1px', padding:'10px 10px 6px', fontWeight:600 }}>
                  {section.title}
                </div>
              )}
              {section.items.map(({ to, icon, label, exact }) => (
                <NavLink key={to} to={to} end={exact}
                  style={({ isActive }) => ({
                    display:'flex', alignItems:'center',
                    gap: collapsed ? 0 : 9,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    padding: collapsed ? '10px 0' : '9px 10px',
                    borderRadius:8, marginBottom:2, textDecoration:'none',
                    fontSize:13.5, fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#4f8ef7' : '#8892a4',
                    background: isActive ? 'rgba(79,142,247,0.12)' : 'transparent',
                    transition:'all 0.15s',
                  })}>
                  <span style={{ fontSize:16, width:18, textAlign:'center', flexShrink:0 }}>{icon}</span>
                  {!collapsed && label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User + collapse */}
        <div style={{ borderTop:'1px solid rgba(255,255,255,0.07)' }}>
          {!collapsed && (
            <div style={{ padding:'12px 14px', display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:30, height:30, borderRadius:'50%', flexShrink:0,
                            background:'linear-gradient(135deg,#4f8ef7,#6c47ff)',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:13, fontWeight:700, color:'#fff' }}>
                {user?.name?.[0] ?? 'U'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, whiteSpace:'nowrap',
                              overflow:'hidden', textOverflow:'ellipsis' }}>
                  {user?.name ?? 'Usuário'}
                </div>
                <div style={{ fontSize:11, color:'#8892a4', textTransform:'capitalize' }}>
                  {user?.role}
                </div>
              </div>
            </div>
          )}
          <div style={{ display:'flex', padding:'6px 8px', gap:6 }}>
            <button onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? 'Expandir' : 'Recolher'}
              style={{ flex:1, padding:'7px', borderRadius:7, cursor:'pointer', fontSize:14,
                       background:'rgba(255,255,255,0.04)', color:'#8892a4',
                       border:'1px solid rgba(255,255,255,0.07)' }}>
              {collapsed ? '→' : '←'}
            </button>
            {!collapsed && (
              <button onClick={handleLogout}
                style={{ flex:1, padding:'7px 10px', borderRadius:7, cursor:'pointer',
                         fontSize:12, fontWeight:600,
                         background:'rgba(239,68,68,0.08)', color:'#f87171',
                         border:'1px solid rgba(239,68,68,0.15)' }}>
                Sair
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Topbar */}
        <header style={{ height:56, background:'#161b27',
                         borderBottom:'1px solid rgba(255,255,255,0.07)',
                         display:'flex', alignItems:'center',
                         justifyContent:'space-between', padding:'0 24px', flexShrink:0 }}>
          <div style={{ fontSize:15, fontWeight:700 }}>
            {getPageTitle(location.pathname)}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ position:'relative' }}>
              <input placeholder="🔍  Buscar…"
                style={{ background:'#1e2638', border:'1px solid rgba(255,255,255,0.1)',
                         borderRadius:8, padding:'7px 12px', color:'#e8eaf0',
                         fontSize:13, outline:'none', width:200 }} />
            </div>
            <button onClick={() => navigate('/exams/new')}
              style={{ padding:'7px 14px', borderRadius:8, background:'#4f8ef7',
                       color:'#fff', border:'none', cursor:'pointer',
                       fontSize:13, fontWeight:600 }}>
              + Nova Prova
            </button>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex:1, overflowY:'auto', background:'#0f1117' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function getPageTitle(path) {
  if (path === '/')             return 'Dashboard';
  if (path === '/exams')        return 'Provas';
  if (path === '/exams/new')    return 'Nova Prova';
  if (path.includes('/omr'))    return 'Leitura OMR';
  if (path.includes('/report')) return 'Relatório';
  if (path.includes('/exams'))  return 'Detalhes da Prova';
  if (path === '/students')     return 'Alunos';
  if (path === '/classes')      return 'Turmas';
  if (path === '/schools')      return 'Escolas';
  return 'OMR·Pro';
}
