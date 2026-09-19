// src/pages/ReportPage.jsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useExamReport } from '../hooks/useOMR.js';

const DIST_LABELS = ['0–2','2–4','4–5','5–6','6–8','8–10'];

function ScoreBar({ value, max, color = '#4f8ef7', height = 6 }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ background:'rgba(255,255,255,0.07)', borderRadius:'4px', height, overflow:'hidden' }}>
      <div style={{ height:'100%', borderRadius:'4px', background:color, width:`${pct}%`,
                    transition:'width 0.4s' }} />
    </div>
  );
}

function Metric({ label, value, color, sub }) {
  return (
    <div style={{ background:'#1e2638', border:'1px solid rgba(255,255,255,0.07)',
                  borderRadius:'10px', padding:'16px 18px' }}>
      <div style={{ fontSize:'11px', color:'#8892a4', textTransform:'uppercase',
                    letterSpacing:'0.5px', fontWeight:600 }}>{label}</div>
      <div style={{ fontSize:'28px', fontWeight:800, color, marginTop:'4px', lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:'11px', color:'#8892a4', marginTop:'5px' }}>{sub}</div>}
    </div>
  );
}

function Badge({ children, color, bg, border }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:'20px',
                   fontSize:'11.5px', fontWeight:600, color, background:bg, border:`1px solid ${border}` }}>
      {children}
    </span>
  );
}

export default function ReportPage() {
  const { examId }    = useParams();
  const { report, loading, error, exportExcel, exportPDF } = useExamReport(examId);
  const [tab, setTab] = useState('students'); // 'students'|'questions'|'ranking'
  const [classFilter, setClassFilter] = useState('');
  const [search, setSearch] = useState('');

  if (loading) return (
    <div style={{ padding:'40px', textAlign:'center', color:'#8892a4' }}>
      Carregando relatório…
    </div>
  );
  if (error) return (
    <div style={{ padding:'40px', color:'#f87171' }}>Erro: {error}</div>
  );

  const summary   = report?.summary ?? {};
  const students  = (report?.students ?? [])
    .filter((s) => !classFilter || s.class_name === classFilter)
    .filter((s) => !search || s.student_name?.toLowerCase().includes(search.toLowerCase()));
  const questions = report?.questions ?? [];

  const classes   = [...new Set((report?.students ?? []).map((s) => s.class_name).filter(Boolean))];

  // Score distribution for bar chart
  const distBuckets = [0,0,0,0,0,0];
  (report?.students ?? []).forEach((s) => {
    const score = s.total_score ?? 0;
    if      (score < 2)  distBuckets[0]++;
    else if (score < 4)  distBuckets[1]++;
    else if (score < 5)  distBuckets[2]++;
    else if (score < 6)  distBuckets[3]++;
    else if (score < 8)  distBuckets[4]++;
    else                 distBuckets[5]++;
  });
  const maxBucket = Math.max(...distBuckets, 1);

  const tabStyle = (t) => ({
    padding: '7px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600,
    cursor: 'pointer', color: tab === t ? '#e8eaf0' : '#8892a4',
    background: tab === t ? '#1a2035' : 'transparent',
    border: 'none', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
  });

  return (
    <div style={{ padding:'24px', maxWidth:'1200px' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div>
          <div style={{ fontSize:'20px', fontWeight:800 }}>Relatório da Prova</div>
          <div style={{ fontSize:'13px', color:'#8892a4', marginTop:'2px' }}>
            {summary.graded_count ?? 0} de {summary.total_students ?? 0} cartões corrigidos
          </div>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={() => exportExcel(classFilter)}
            style={{ padding:'8px 14px', borderRadius:'8px', background:'rgba(34,197,94,0.1)',
                     color:'#4ade80', border:'1px solid rgba(34,197,94,0.2)', cursor:'pointer',
                     fontSize:'13px', fontWeight:600 }}>
            📊 Exportar Excel
          </button>
          <button onClick={() => exportPDF(classFilter)}
            style={{ padding:'8px 14px', borderRadius:'8px', background:'rgba(79,142,247,0.1)',
                     color:'#60a5fa', border:'1px solid rgba(79,142,247,0.2)', cursor:'pointer',
                     fontSize:'13px', fontWeight:600 }}>
            📄 Exportar PDF
          </button>
        </div>
      </div>

      {/* Summary metrics */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'12px', marginBottom:'20px' }}>
        <Metric label="Média da Turma"  value={summary.avg_score?.toFixed(1) ?? '—'}  color="#4ade80" />
        <Metric label="Maior Nota"      value={summary.max_score?.toFixed(1) ?? '—'}  color="#60a5fa" />
        <Metric label="Menor Nota"      value={summary.min_score?.toFixed(1) ?? '—'}  color="#f87171" />
        <Metric label="Aprovados"        value={summary.pass_count ?? '—'}  color="#4ade80"
                sub={`≥ nota mínima`} />
        <Metric label="Reprovados"       value={summary.fail_count ?? '—'}  color="#f87171"
                sub={`desvio: ${summary.std_deviation?.toFixed(2) ?? '—'}`} />
      </div>

      {/* Charts row */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'20px' }}>

        {/* Score distribution */}
        <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                      borderRadius:'12px', padding:'18px' }}>
          <div style={{ fontWeight:700, fontSize:'14px', marginBottom:'16px' }}>
            Distribuição de Notas
          </div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:'8px', height:'110px' }}>
            {distBuckets.map((count, i) => {
              const colors = ['#f87171','#fb923c','#fbbf24','#a3e635','#4ade80','#34d399'];
              const pct    = (count / maxBucket) * 100;
              return (
                <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center' }}>
                  <div style={{ fontSize:'10px', color:'#8892a4', marginBottom:'3px', fontWeight:700 }}>
                    {count}
                  </div>
                  <div style={{ width:'100%', background:colors[i], borderRadius:'4px 4px 0 0',
                                height:`${Math.max(pct, 4)}%`, transition:'height 0.5s' }} />
                  <div style={{ fontSize:'9px', color:'#8892a4', marginTop:'5px' }}>
                    {DIST_LABELS[i]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hardest questions */}
        <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                      borderRadius:'12px', padding:'18px' }}>
          <div style={{ fontWeight:700, fontSize:'14px', marginBottom:'14px' }}>
            Questões com Maior Erro
          </div>
          {questions
            .filter((q) => !q.is_nullified)
            .sort((a, b) => (b.error_rate ?? 0) - (a.error_rate ?? 0))
            .slice(0, 5)
            .map((q) => (
              <div key={q.number} style={{ marginBottom:'10px' }}>
                <div style={{ display:'flex', justifyContent:'space-between',
                              fontSize:'12.5px', marginBottom:'4px' }}>
                  <span>
                    <strong>Q.{q.number}</strong>
                    <span style={{ color:'#8892a4', marginLeft:'8px', fontSize:'11px' }}>
                      {q.type === 'multiple_choice' ? 'Múltipla' : q.type === 'true_false' ? 'C/E' : 'Numérica'}
                    </span>
                    <span style={{ marginLeft:'8px', background:'rgba(79,142,247,0.1)',
                                   color:'#60a5fa', padding:'1px 7px', borderRadius:'4px',
                                   fontSize:'11px', fontWeight:700 }}>
                      {q.correct_answer}
                    </span>
                  </span>
                  <span style={{ color: q.error_rate > 70 ? '#f87171' : q.error_rate > 40 ? '#fbbf24' : '#4ade80',
                                 fontWeight:700 }}>
                    {q.error_rate ?? 0}% erro
                  </span>
                </div>
                <ScoreBar value={q.error_rate ?? 0} max={100}
                  color={q.error_rate > 70 ? '#ef4444' : q.error_rate > 40 ? '#f59e0b' : '#22c55e'} />
              </div>
            ))}
          {!questions.length && (
            <div style={{ color:'#4a5568', fontSize:'13px', textAlign:'center', padding:'20px 0' }}>
              Dados disponíveis após correção
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:'2px', background:'#0f1117', padding:'4px',
                    borderRadius:'8px', marginBottom:'16px', width:'fit-content' }}>
        <button style={tabStyle('students')} onClick={() => setTab('students')}>Por Aluno</button>
        <button style={tabStyle('questions')} onClick={() => setTab('questions')}>Por Questão</button>
        <button style={tabStyle('ranking')} onClick={() => setTab('ranking')}>Ranking</button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:'10px', marginBottom:'14px' }}>
        <input placeholder="🔍  Buscar aluno…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.12)',
                   borderRadius:'8px', padding:'8px 12px', color:'#e8eaf0',
                   fontSize:'13px', outline:'none', width:'220px' }} />
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}
          style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.12)',
                   borderRadius:'8px', padding:'8px 12px', color:'#e8eaf0',
                   fontSize:'13px', outline:'none' }}>
          <option value="">Todas as turmas</option>
          {classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Students tab */}
      {tab === 'students' && (
        <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                      borderRadius:'12px', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
                {['Aluno','Matrícula','Turma','Acertos','Erros','Brancos','Nota','% Acerto','Confiança OMR','Status'].map((h) => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'11px',
                                       color:'#8892a4', textTransform:'uppercase',
                                       letterSpacing:'0.5px', fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr key={s.card_id ?? i}
                  style={{ borderBottom:'1px solid rgba(255,255,255,0.04)',
                           background: i % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                  <td style={{ padding:'11px 14px', fontWeight:600 }}>{s.student_name ?? '—'}</td>
                  <td style={{ padding:'11px 14px', color:'#8892a4', fontSize:'12px' }}>{s.enrollment_code ?? '—'}</td>
                  <td style={{ padding:'11px 14px', color:'#8892a4' }}>{s.class_name ?? '—'}</td>
                  <td style={{ padding:'11px 14px', color:'#4ade80', fontWeight:700 }}>{s.correct_count ?? '—'}</td>
                  <td style={{ padding:'11px 14px', color:'#f87171', fontWeight:700 }}>{s.wrong_count ?? '—'}</td>
                  <td style={{ padding:'11px 14px', color:'#8892a4' }}>{s.blank_count ?? '—'}</td>
                  <td style={{ padding:'11px 14px', fontWeight:800,
                               color: (s.total_score ?? 0) >= 5 ? '#4ade80' : '#f87171',
                               fontSize:'15px' }}>
                    {s.total_score?.toFixed(1) ?? '—'}
                  </td>
                  <td style={{ padding:'11px 14px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                      <ScoreBar value={s.percentage ?? 0} max={100} height={5}
                        color={(s.percentage ?? 0) >= 50 ? '#22c55e' : '#ef4444'} />
                      <span style={{ fontSize:'12px', color:'#8892a4', minWidth:'36px' }}>
                        {s.percentage?.toFixed(0) ?? 0}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding:'11px 14px', fontSize:'12px', color:'#8892a4' }}>
                    {s.omr_confidence != null ? `${(s.omr_confidence * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td style={{ padding:'11px 14px' }}>
                    {(s.total_score ?? 0) >= 5
                      ? <Badge color="#4ade80" bg="rgba(34,197,94,0.1)" border="rgba(34,197,94,0.2)">✓ Aprovado</Badge>
                      : <Badge color="#f87171" bg="rgba(239,68,68,0.1)" border="rgba(239,68,68,0.2)">✗ Reprovado</Badge>
                    }
                  </td>
                </tr>
              ))}
              {!students.length && (
                <tr><td colSpan={10} style={{ padding:'32px', textAlign:'center', color:'#4a5568' }}>
                  Nenhum aluno encontrado
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Questions tab */}
      {tab === 'questions' && (
        <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                      borderRadius:'12px', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
                {['Questão','Tipo','Gabarito','Peso','Total Respostas','Acertos','% Erro','Situação'].map((h) => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'11px',
                                       color:'#8892a4', textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {questions.map((q, i) => (
                <tr key={q.number}
                  style={{ borderBottom:'1px solid rgba(255,255,255,0.04)',
                           background: i % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent',
                           opacity: q.is_nullified ? 0.5 : 1 }}>
                  <td style={{ padding:'11px 14px', fontWeight:800, color:'#60a5fa' }}>Q.{q.number}</td>
                  <td style={{ padding:'11px 14px', color:'#8892a4', fontSize:'12px' }}>
                    {q.type === 'multiple_choice' ? '🔘 Múltipla' : q.type === 'true_false' ? '✔️ C/E' : '🔢 Numérica'}
                  </td>
                  <td style={{ padding:'11px 14px' }}>
                    <Badge color="#4ade80" bg="rgba(34,197,94,0.1)" border="rgba(34,197,94,0.2)">
                      {q.correct_answer}
                    </Badge>
                  </td>
                  <td style={{ padding:'11px 14px', color:'#8892a4' }}>{q.score}</td>
                  <td style={{ padding:'11px 14px', color:'#8892a4' }}>{q.total_answers ?? 0}</td>
                  <td style={{ padding:'11px 14px', color:'#4ade80', fontWeight:700 }}>{q.correct_count ?? 0}</td>
                  <td style={{ padding:'11px 14px' }}>
                    <span style={{ fontWeight:700, color: (q.error_rate ?? 0) > 70 ? '#f87171'
                                                         : (q.error_rate ?? 0) > 40 ? '#fbbf24' : '#4ade80' }}>
                      {q.error_rate ?? 0}%
                    </span>
                  </td>
                  <td style={{ padding:'11px 14px' }}>
                    {q.is_nullified
                      ? <Badge color="#f87171" bg="rgba(239,68,68,0.1)" border="rgba(239,68,68,0.2)">⊘ Anulada</Badge>
                      : (q.error_rate ?? 0) > 70
                        ? <Badge color="#f87171" bg="rgba(239,68,68,0.1)" border="rgba(239,68,68,0.2)">⚠ Difícil</Badge>
                        : <Badge color="#4ade80" bg="rgba(34,197,94,0.1)" border="rgba(34,197,94,0.2)">✓ Normal</Badge>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ranking tab */}
      {tab === 'ranking' && (
        <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                      borderRadius:'12px', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
                {['#','Aluno','Turma','Nota','% Acerto',''].map((h) => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'11px',
                                       color:'#8892a4', textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...(report?.students ?? [])]
                .filter((s) => !classFilter || s.class_name === classFilter)
                .sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0))
                .slice(0, 20)
                .map((s, i) => (
                  <tr key={s.card_id ?? i}
                    style={{ borderBottom:'1px solid rgba(255,255,255,0.04)',
                             background: i < 3 ? 'rgba(79,142,247,0.03)' : 'transparent' }}>
                    <td style={{ padding:'11px 14px', fontWeight:800,
                                 color: i === 0 ? '#fbbf24' : i === 1 ? '#9ca3af' : i === 2 ? '#b45309' : '#4a5568',
                                 fontSize:'15px' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}°`}
                    </td>
                    <td style={{ padding:'11px 14px', fontWeight:600 }}>{s.student_name ?? '—'}</td>
                    <td style={{ padding:'11px 14px', color:'#8892a4' }}>{s.class_name ?? '—'}</td>
                    <td style={{ padding:'11px 14px', fontWeight:800, fontSize:'16px',
                                 color: (s.total_score ?? 0) >= 5 ? '#4ade80' : '#f87171' }}>
                      {s.total_score?.toFixed(1) ?? '—'}
                    </td>
                    <td style={{ padding:'11px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                        <ScoreBar value={s.percentage ?? 0} max={100} height={6}
                          color={(s.percentage ?? 0) >= 50 ? '#22c55e' : '#ef4444'} />
                        <span style={{ fontSize:'12px', color:'#8892a4', minWidth:'36px' }}>
                          {s.percentage?.toFixed(0) ?? 0}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding:'11px 14px' }}>
                      {(s.total_score ?? 0) >= 5
                        ? <Badge color="#4ade80" bg="rgba(34,197,94,0.1)" border="rgba(34,197,94,0.2)">Aprovado</Badge>
                        : <Badge color="#f87171" bg="rgba(239,68,68,0.1)" border="rgba(239,68,68,0.2)">Reprovado</Badge>
                      }
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
