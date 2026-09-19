// src/pages/DashboardPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportAPI, examAPI } from '../services/api';

function Metric({ icon, label, value, color, trend }) {
  return (
    <div style={{ background:'#1e2638', border:'1px solid rgba(255,255,255,0.07)',
                  borderRadius:12, padding:'16px 18px' }}>
      <div style={{ fontSize:22, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:11, color:'#8892a4', textTransform:'uppercase',
                    letterSpacing:'0.5px', fontWeight:600 }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:800, color, marginTop:4, lineHeight:1 }}>{value}</div>
      {trend && <div style={{ fontSize:11, color:'#4ade80', marginTop:6 }}>↑ {trend}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    draft:     { label:'Rascunho',   color:'#8892a4', bg:'rgba(136,146,164,0.1)' },
    published: { label:'Publicada',  color:'#60a5fa', bg:'rgba(96,165,250,0.1)' },
    reading:   { label:'Leitura',    color:'#fbbf24', bg:'rgba(251,191,36,0.1)' },
    graded:    { label:'Corrigida',  color:'#4ade80', bg:'rgba(74,222,128,0.1)' },
    archived:  { label:'Arquivada',  color:'#6b7280', bg:'rgba(107,114,128,0.08)' },
  };
  const m = map[status] ?? map.draft;
  return (
    <span style={{ padding:'3px 9px', borderRadius:20, fontSize:11.5, fontWeight:600,
                   color:m.color, background:m.bg }}>
      {m.label}
    </span>
  );
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [exams,     setExams]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      reportAPI.dashboard(),
      examAPI.list({ limit: 6 }),
    ])
      .then(([d, e]) => {
        setDashboard(d.data);
        setExams(e.data.exams ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding:40, textAlign:'center', color:'#8892a4' }}>Carregando…</div>
  );

  const byStatus   = dashboard?.examsByStatus ?? {};
  const cardStatus = dashboard?.cardsByStatus ?? {};
  const totalExams = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const totalCards = Object.values(cardStatus).reduce((a, b) => a + b, 0);
  const gradedCards= cardStatus.graded ?? 0;
  const avgScore   = dashboard?.avgScore ? Number(dashboard.avgScore).toFixed(1) : '—';
  const avgConf    = dashboard?.avgConfidence
    ? `${(dashboard.avgConfidence * 100).toFixed(0)}%` : '—';

  return (
    <div style={{ padding:24, maxWidth:1200 }}>

      {/* Metrics */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
        <Metric icon="📝" label="Provas Ativas" value={totalExams}
          color="#60a5fa" trend={`${byStatus.published ?? 0} publicadas`} />
        <Metric icon="📷" label="Cartões Processados" value={gradedCards}
          color="#4ade80" trend={`de ${totalCards} enviados`} />
        <Metric icon="⭐" label="Média Geral" value={avgScore}
          color="#fbbf24" />
        <Metric icon="🎯" label="Confiança OMR" value={avgConf}
          color="#c084fc" trend="taxa de leitura" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:16 }}>

        {/* Recent exams */}
        <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                      borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'16px 18px', borderBottom:'1px solid rgba(255,255,255,0.07)',
                        display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:700, fontSize:14 }}>Provas Recentes</span>
            <button onClick={() => navigate('/exams')}
              style={{ fontSize:12, color:'#60a5fa', background:'none', border:'none',
                       cursor:'pointer', fontWeight:600 }}>
              Ver todas →
            </button>
          </div>

          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                {['Prova','Questões','Corrigidos','Média','Status',''].map((h) => (
                  <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:11,
                                       color:'#8892a4', textTransform:'uppercase',
                                       letterSpacing:'0.5px', fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr key={exam.id}
                  style={{ borderBottom:'1px solid rgba(255,255,255,0.04)',
                           cursor:'pointer' }}
                  onClick={() => navigate(`/exams/${exam.id}`)}>
                  <td style={{ padding:'12px 14px' }}>
                    <div style={{ fontWeight:600 }}>{exam.title}</div>
                    <div style={{ fontSize:11, color:'#8892a4', marginTop:2 }}>
                      {exam.subject_name ?? 'Sem disciplina'}
                      {exam.exam_date ? ` · ${new Date(exam.exam_date).toLocaleDateString('pt-BR')}` : ''}
                    </div>
                  </td>
                  <td style={{ padding:'12px 14px', color:'#8892a4' }}>
                    {exam.question_count ?? 0}
                  </td>
                  <td style={{ padding:'12px 14px', color:'#8892a4' }}>
                    {exam.graded_count ?? 0}
                    {exam.card_count ? <span style={{ color:'#4a5568' }}> / {exam.card_count}</span> : ''}
                  </td>
                  <td style={{ padding:'12px 14px', fontWeight:700,
                               color: exam.avg_score >= 5 ? '#4ade80' : exam.avg_score ? '#f87171' : '#4a5568' }}>
                    {exam.avg_score ? Number(exam.avg_score).toFixed(1) : '—'}
                  </td>
                  <td style={{ padding:'12px 14px' }}>
                    <StatusBadge status={exam.status} />
                  </td>
                  <td style={{ padding:'12px 14px' }}>
                    {exam.status === 'published' && (
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/exams/${exam.id}/omr`); }}
                        style={{ fontSize:12, padding:'4px 10px', borderRadius:6, cursor:'pointer',
                                 background:'rgba(79,142,247,0.12)', color:'#60a5fa',
                                 border:'1px solid rgba(79,142,247,0.2)', fontWeight:600 }}>
                        OMR
                      </button>
                    )}
                    {exam.status === 'graded' && (
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/exams/${exam.id}/report`); }}
                        style={{ fontSize:12, padding:'4px 10px', borderRadius:6, cursor:'pointer',
                                 background:'rgba(34,197,94,0.1)', color:'#4ade80',
                                 border:'1px solid rgba(34,197,94,0.2)', fontWeight:600 }}>
                        Relatório
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!exams.length && (
                <tr><td colSpan={6} style={{ padding:32, textAlign:'center', color:'#4a5568' }}>
                  Nenhuma prova criada ainda.{' '}
                  <button onClick={() => navigate('/exams/new')}
                    style={{ color:'#60a5fa', background:'none', border:'none',
                             cursor:'pointer', fontWeight:600, fontSize:13 }}>
                    Criar agora →
                  </button>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Activity + quick actions */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* Quick actions */}
          <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                        borderRadius:12, padding:16 }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:'#8892a4',
                          textTransform:'uppercase', letterSpacing:'0.5px' }}>
              Ações rápidas
            </div>
            {[
              { icon:'✏️', label:'Nova Prova',       to:'/exams/new',  color:'#4f8ef7' },
              { icon:'👤', label:'Cadastrar Alunos',  to:'/students',   color:'#22c55e' },
              { icon:'👥', label:'Gerenciar Turmas',  to:'/classes',    color:'#f59e0b' },
            ].map(({ icon, label, to, color }) => (
              <button key={to} onClick={() => navigate(to)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:10,
                         padding:'10px 12px', borderRadius:8, marginBottom:6, cursor:'pointer',
                         background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)',
                         color:'#e8eaf0', fontSize:13, fontWeight:600, textAlign:'left',
                         transition:'background 0.15s' }}>
                <span style={{ fontSize:18, width:24, textAlign:'center' }}>{icon}</span>
                {label}
                <span style={{ marginLeft:'auto', color, fontSize:16 }}>→</span>
              </button>
            ))}
          </div>

          {/* Recent activity */}
          <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                        borderRadius:12, padding:16, flex:1 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Atividade Recente</div>
            {(dashboard?.recentActivity ?? []).slice(0, 6).map((log, i) => (
              <div key={i} style={{ display:'flex', gap:10, marginBottom:12 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:'#4f8ef7',
                              marginTop:5, flexShrink:0 }} />
                <div>
                  <div style={{ fontSize:12.5, fontWeight:600 }}>
                    {actionLabel(log.action)}
                  </div>
                  <div style={{ fontSize:11, color:'#8892a4', marginTop:1 }}>
                    {log.user_name} · {timeAgo(log.created_at)}
                  </div>
                </div>
              </div>
            ))}
            {!(dashboard?.recentActivity?.length) && (
              <div style={{ fontSize:13, color:'#4a5568', textAlign:'center', padding:'12px 0' }}>
                Nenhuma atividade registrada
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function actionLabel(action) {
  const map = {
    create_exam:       'Nova prova criada',
    publish_exam:      'Prova publicada',
    import_students_csv: 'Alunos importados via CSV',
    manual_review_card: 'Cartão revisado manualmente',
    login:             'Login realizado',
    logout:            'Logout realizado',
    create_student:    'Aluno cadastrado',
    create_class:      'Turma criada',
  };
  return map[action] ?? action;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'agora';
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)}d`;
}
