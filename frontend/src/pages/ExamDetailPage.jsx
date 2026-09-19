// src/pages/ExamDetailPage.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { examAPI, cardAPI } from '../services/api';

export default function ExamDetailPage() {
  const { examId } = useParams();
  const navigate   = useNavigate();
  const [exam,    setExam]    = useState(null);
  const [cards,   setCards]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [genPDF,  setGenPDF]  = useState(false);
  const [tab,     setTab]     = useState('overview');

  useEffect(() => {
    Promise.all([examAPI.get(examId), cardAPI.list(examId, { limit: 100 })])
      .then(([e, c]) => { setExam(e.data); setCards(c.data.cards ?? []); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [examId]);

  const handleGeneratePDF = async (classId) => {
    setGenPDF(true);
    try {
      const { data } = await examAPI.generatePDF(examId, { classId });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a   = document.createElement('a');
      a.href = url; a.download = `cartoes-${examId.slice(0,8)}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Erro ao gerar PDF: ' + (err.response?.data?.error ?? err.message));
    } finally {
      setGenPDF(false);
    }
  };

  const handlePublish = async () => {
    if (!confirm('Publicar esta prova? Os cartões-resposta poderão ser gerados.')) return;
    try {
      const { data } = await examAPI.publish(examId);
      setExam(data);
    } catch (err) {
      alert('Erro: ' + (err.response?.data?.error ?? err.message));
    }
  };

  if (loading) return (
    <div style={{ padding:40, textAlign:'center', color:'#8892a4' }}>Carregando prova…</div>
  );
  if (!exam) return (
    <div style={{ padding:40, textAlign:'center', color:'#f87171' }}>Prova não encontrada.</div>
  );

  const tabStyle = (t) => ({
    padding:'7px 16px', borderRadius:6, fontSize:13, fontWeight:600,
    cursor:'pointer', color: tab === t ? '#e8eaf0' : '#8892a4',
    background: tab === t ? '#1a2035' : 'transparent', border:'none',
    boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
  });

  const mcQs  = (exam.questions ?? []).filter((q) => q.type === 'multiple_choice');
  const ceQs  = (exam.questions ?? []).filter((q) => q.type === 'true_false');
  const numQs = (exam.questions ?? []).filter((q) => q.type === 'numeric');
  const gradedCards = cards.filter((c) => c.status === 'graded');

  return (
    <div style={{ padding:24, maxWidth:1100 }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <button onClick={() => navigate('/exams')}
            style={{ fontSize:12, color:'#8892a4', background:'none', border:'none',
                     cursor:'pointer', marginBottom:8, padding:0 }}>
            ← Voltar às provas
          </button>
          <div style={{ fontSize:20, fontWeight:800 }}>{exam.title}</div>
          <div style={{ fontSize:13, color:'#8892a4', marginTop:4 }}>
            {exam.subject_name ?? 'Sem disciplina'}
            {exam.exam_date ? ` · ${new Date(exam.exam_date).toLocaleDateString('pt-BR')}` : ''}
            {' · '}{exam.questions?.length ?? 0} questões
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
          {exam.status === 'draft' && (
            <button onClick={handlePublish}
              style={{ padding:'8px 16px', borderRadius:8, background:'#4f8ef7',
                       color:'#fff', border:'none', cursor:'pointer', fontSize:13, fontWeight:600 }}>
              🚀 Publicar
            </button>
          )}
          {(exam.status === 'published' || exam.status === 'graded') && (
            <>
              <button onClick={() => handleGeneratePDF()} disabled={genPDF}
                style={{ padding:'8px 14px', borderRadius:8, fontSize:13, fontWeight:600,
                         cursor:'pointer', background:'rgba(255,255,255,0.06)',
                         color:'#e8eaf0', border:'1px solid rgba(255,255,255,0.12)' }}>
                {genPDF ? '⏳ Gerando…' : '📥 Gerar PDF (todos)'}
              </button>
              <button onClick={() => navigate(`/exams/${examId}/omr`)}
                style={{ padding:'8px 14px', borderRadius:8, fontSize:13, fontWeight:600,
                         cursor:'pointer', background:'rgba(79,142,247,0.12)',
                         color:'#60a5fa', border:'1px solid rgba(79,142,247,0.2)' }}>
                📷 Iniciar OMR
              </button>
            </>
          )}
          {exam.status === 'graded' && (
            <button onClick={() => navigate(`/exams/${examId}/report`)}
              style={{ padding:'8px 14px', borderRadius:8, fontSize:13, fontWeight:600,
                       cursor:'pointer', background:'rgba(34,197,94,0.1)',
                       color:'#4ade80', border:'1px solid rgba(34,197,94,0.2)' }}>
              📊 Ver Relatório
            </button>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Questões',    value: exam.questions?.length ?? 0,  color:'#60a5fa' },
          { label:'Múltipla',    value: mcQs.length,                  color:'#a78bfa' },
          { label:'Certo/Errado',value: ceQs.length,                  color:'#fbbf24' },
          { label:'Numérica',    value: numQs.length,                  color:'#34d399' },
          { label:'Corrigidos',  value: gradedCards.length,            color:'#4ade80' },
        ].map((m) => (
          <div key={m.label} style={{ background:'#1e2638', border:'1px solid rgba(255,255,255,0.07)',
                                       borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:11, color:'#8892a4', textTransform:'uppercase',
                          letterSpacing:'0.5px', fontWeight:600 }}>{m.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:m.color, marginTop:4 }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, background:'#0f1117', padding:4,
                    borderRadius:8, marginBottom:16, width:'fit-content' }}>
        <button style={tabStyle('overview')} onClick={() => setTab('overview')}>Visão Geral</button>
        <button style={tabStyle('questions')} onClick={() => setTab('questions')}>Gabarito</button>
        <button style={tabStyle('cards')} onClick={() => setTab('cards')}>Cartões ({cards.length})</button>
        <button style={tabStyle('classes')} onClick={() => setTab('classes')}>Turmas</button>
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                        borderRadius:12, padding:18 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Informações</div>
            {[
              ['Título',        exam.title],
              ['Disciplina',    exam.subject_name ?? '—'],
              ['Data',          exam.exam_date ? new Date(exam.exam_date).toLocaleDateString('pt-BR') : '—'],
              ['Nota máxima',   exam.total_score],
              ['Nota mínima',   exam.passing_score],
              ['Status',        exam.status],
              ['Criado por',    exam.created_by_name],
            ].map(([k, v]) => (
              <div key={k} style={{ display:'flex', justifyContent:'space-between',
                                    padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.04)',
                                    fontSize:13 }}>
                <span style={{ color:'#8892a4' }}>{k}</span>
                <span style={{ fontWeight:600 }}>{String(v)}</span>
              </div>
            ))}
          </div>
          <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                        borderRadius:12, padding:18 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Estatísticas</div>
            {exam.stats ? [
              ['Corrigidos', exam.stats.graded_count],
              ['Média',      Number(exam.stats.avg_score ?? 0).toFixed(1)],
              ['Aprovados',  exam.stats.pass_count],
              ['Reprovados', exam.stats.fail_count],
            ].map(([k, v]) => (
              <div key={k} style={{ display:'flex', justifyContent:'space-between',
                                    padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.04)',
                                    fontSize:13 }}>
                <span style={{ color:'#8892a4' }}>{k}</span>
                <span style={{ fontWeight:700 }}>{v}</span>
              </div>
            )) : (
              <div style={{ color:'#4a5568', fontSize:13 }}>
                Estatísticas disponíveis após a correção.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Gabarito */}
      {tab === 'questions' && (
        <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                      borderRadius:12, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
                {['#','Tipo','Gabarito','Peso','Anulada'].map((h) => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11,
                                       color:'#8892a4', textTransform:'uppercase',
                                       letterSpacing:'0.5px', fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(exam.questions ?? []).map((q) => (
                <tr key={q.id}
                  style={{ borderBottom:'1px solid rgba(255,255,255,0.04)',
                           opacity: q.is_nullified ? 0.5 : 1 }}>
                  <td style={{ padding:'10px 14px', fontWeight:800, color:'#60a5fa' }}>{q.number}</td>
                  <td style={{ padding:'10px 14px', color:'#8892a4' }}>
                    {q.type === 'multiple_choice' ? '🔘 Múltipla' :
                     q.type === 'true_false'      ? '✔️ C/E' : '🔢 Numérica'}
                  </td>
                  <td style={{ padding:'10px 14px' }}>
                    <span style={{ padding:'3px 10px', borderRadius:5, fontWeight:700,
                                   background:'rgba(34,197,94,0.1)', color:'#4ade80',
                                   fontSize:12 }}>
                      {q.correct_answer}
                    </span>
                  </td>
                  <td style={{ padding:'10px 14px', color:'#8892a4' }}>{q.score}</td>
                  <td style={{ padding:'10px 14px' }}>
                    {q.is_nullified && (
                      <span style={{ padding:'2px 8px', borderRadius:4, fontSize:11,
                                     background:'rgba(239,68,68,0.1)', color:'#f87171' }}>
                        Anulada
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cards */}
      {tab === 'cards' && (
        <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                      borderRadius:12, overflow:'hidden' }}>
          {!cards.length ? (
            <div style={{ padding:40, textAlign:'center', color:'#4a5568' }}>
              Nenhum cartão enviado ainda.{' '}
              <button onClick={() => navigate(`/exams/${examId}/omr`)}
                style={{ color:'#60a5fa', background:'none', border:'none',
                         cursor:'pointer', fontWeight:600 }}>
                Iniciar leitura OMR →
              </button>
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
                  {['Aluno','Matrícula','Turma','Nota','%','Status',''].map((h) => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11,
                                         color:'#8892a4', textTransform:'uppercase',
                                         letterSpacing:'0.5px', fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cards.map((c) => (
                  <tr key={c.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding:'10px 14px', fontWeight:600 }}>{c.student_name ?? '—'}</td>
                    <td style={{ padding:'10px 14px', color:'#8892a4', fontSize:12 }}>{c.enrollment_code ?? '—'}</td>
                    <td style={{ padding:'10px 14px', color:'#8892a4' }}>{c.class_name ?? '—'}</td>
                    <td style={{ padding:'10px 14px', fontWeight:800, fontSize:15,
                                 color: (c.total_score ?? 0) >= 5 ? '#4ade80' : c.total_score != null ? '#f87171' : '#4a5568' }}>
                      {c.total_score != null ? Number(c.total_score).toFixed(1) : '—'}
                    </td>
                    <td style={{ padding:'10px 14px', color:'#8892a4' }}>
                      {c.percentage != null ? `${c.percentage}%` : '—'}
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600,
                                     color: c.status==='graded'?'#4ade80':c.status==='error'?'#f87171':'#fbbf24',
                                     background: c.status==='graded'?'rgba(34,197,94,0.1)':c.status==='error'?'rgba(239,68,68,0.1)':'rgba(251,191,36,0.1)' }}>
                        {c.status}
                      </span>
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      {c.status === 'error' && (
                        <button onClick={() => cardAPI.retry(c.id).then(load)}
                          style={{ fontSize:11, color:'#60a5fa', background:'none',
                                   border:'none', cursor:'pointer' }}>↺ Retry</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Classes */}
      {tab === 'classes' && (
        <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                      borderRadius:12, padding:18 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Turmas vinculadas</div>
          {(exam.classes ?? []).filter(Boolean).map((c) => (
            <div key={c.id} style={{ display:'flex', justifyContent:'space-between',
                                     padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.05)',
                                     fontSize:13 }}>
              <span style={{ fontWeight:600 }}>{c.name}</span>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => handleGeneratePDF(c.id)} disabled={genPDF}
                  style={{ fontSize:12, padding:'4px 10px', borderRadius:6, cursor:'pointer',
                           background:'rgba(255,255,255,0.05)', color:'#8892a4',
                           border:'1px solid rgba(255,255,255,0.1)' }}>
                  📥 PDF desta turma
                </button>
              </div>
            </div>
          ))}
          {!(exam.classes?.filter(Boolean).length) && (
            <div style={{ color:'#4a5568', fontSize:13 }}>Nenhuma turma vinculada.</div>
          )}
        </div>
      )}
    </div>
  );
}
