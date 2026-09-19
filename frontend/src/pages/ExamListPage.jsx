// src/pages/ExamListPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { examAPI } from '../services/api';

const STATUS_OPTS = [
  { value: '',          label: 'Todos os status' },
  { value: 'draft',     label: 'Rascunho' },
  { value: 'published', label: 'Publicada' },
  { value: 'reading',   label: 'Em leitura' },
  { value: 'graded',    label: 'Corrigida' },
  { value: 'archived',  label: 'Arquivada' },
];

const STATUS_STYLE = {
  draft:     { color:'#8892a4', bg:'rgba(136,146,164,0.1)',  label:'Rascunho'  },
  published: { color:'#60a5fa', bg:'rgba(96,165,250,0.1)',   label:'Publicada' },
  reading:   { color:'#fbbf24', bg:'rgba(251,191,36,0.1)',   label:'Em leitura'},
  graded:    { color:'#4ade80', bg:'rgba(74,222,128,0.1)',   label:'Corrigida' },
  archived:  { color:'#6b7280', bg:'rgba(107,114,128,0.08)', label:'Arquivada' },
};

export default function ExamListPage() {
  const [exams,   setExams]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [status,  setStatus]  = useState('');
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await examAPI.list({ status: status || undefined, page, limit: 20 });
      setExams(data.exams ?? []);
      setTotal(data.pagination?.total ?? 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? exams.filter((e) => e.title.toLowerCase().includes(search.toLowerCase()))
    : exams;

  const inp = { background:'#1a2035', border:'1px solid rgba(255,255,255,0.1)',
                borderRadius:8, padding:'8px 12px', color:'#e8eaf0', fontSize:13, outline:'none' };

  return (
    <div style={{ padding:24, maxWidth:1100 }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800 }}>Provas</div>
          <div style={{ fontSize:13, color:'#8892a4', marginTop:2 }}>
            {total} prova{total !== 1 ? 's' : ''} encontrada{total !== 1 ? 's' : ''}
          </div>
        </div>
        <button onClick={() => navigate('/exams/new')}
          style={{ padding:'9px 18px', borderRadius:8, background:'#4f8ef7',
                   color:'#fff', border:'none', cursor:'pointer', fontSize:13.5, fontWeight:600 }}>
          + Nova Prova
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:16 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍  Buscar por nome…" style={{ ...inp, flex:1 }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          style={{ ...inp, minWidth:160 }}>
          {STATUS_OPTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button onClick={load}
          style={{ ...inp, cursor:'pointer', padding:'8px 14px', fontWeight:600, color:'#60a5fa' }}>
          ↺ Atualizar
        </button>
      </div>

      {/* Table */}
      <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                    borderRadius:12, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
              {['Prova','Disciplina','Questões','Turmas','Corrigidos','Média','Status','Ações'].map((h) => (
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11,
                                     color:'#8892a4', textTransform:'uppercase',
                                     letterSpacing:'0.5px', fontWeight:600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding:32, textAlign:'center', color:'#8892a4' }}>
                Carregando…
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:'#4a5568' }}>
                Nenhuma prova encontrada.{' '}
                <button onClick={() => navigate('/exams/new')}
                  style={{ color:'#60a5fa', background:'none', border:'none',
                           cursor:'pointer', fontWeight:600, fontSize:13 }}>
                  Criar agora →
                </button>
              </td></tr>
            ) : filtered.map((exam, i) => {
              const st  = STATUS_STYLE[exam.status] ?? STATUS_STYLE.draft;
              const pct = exam.card_count > 0
                ? Math.round((exam.graded_count / exam.card_count) * 100) : 0;

              return (
                <tr key={exam.id}
                  style={{ borderBottom:'1px solid rgba(255,255,255,0.04)',
                           background: i % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent',
                           cursor:'pointer' }}
                  onClick={() => navigate(`/exams/${exam.id}`)}>

                  <td style={{ padding:'13px 14px' }}>
                    <div style={{ fontWeight:600 }}>{exam.title}</div>
                    <div style={{ fontSize:11, color:'#8892a4', marginTop:2 }}>
                      {exam.exam_date
                        ? new Date(exam.exam_date).toLocaleDateString('pt-BR')
                        : 'Sem data'}
                    </div>
                  </td>
                  <td style={{ padding:'13px 14px', color:'#8892a4' }}>
                    {exam.subject_name ?? '—'}
                  </td>
                  <td style={{ padding:'13px 14px', fontWeight:700 }}>
                    {exam.question_count ?? 0}
                  </td>
                  <td style={{ padding:'13px 14px', color:'#8892a4' }}>
                    {exam.classes?.filter(Boolean).map((c) => c.name).join(', ') || '—'}
                  </td>
                  <td style={{ padding:'13px 14px' }}>
                    {exam.graded_count > 0 ? (
                      <div>
                        <div style={{ fontSize:12, marginBottom:4 }}>
                          {exam.graded_count} / {exam.card_count}
                        </div>
                        <div style={{ background:'rgba(255,255,255,0.07)', borderRadius:3,
                                      height:4, width:80, overflow:'hidden' }}>
                          <div style={{ height:'100%', borderRadius:3,
                                        background: pct === 100 ? '#22c55e' : '#4f8ef7',
                                        width:`${pct}%` }} />
                        </div>
                      </div>
                    ) : (
                      <span style={{ color:'#4a5568' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding:'13px 14px', fontWeight:800,
                               color: exam.avg_score >= 5 ? '#4ade80'
                                    : exam.avg_score     ? '#f87171' : '#4a5568',
                               fontSize:15 }}>
                    {exam.avg_score ? Number(exam.avg_score).toFixed(1) : '—'}
                  </td>
                  <td style={{ padding:'13px 14px' }}>
                    <span style={{ padding:'3px 9px', borderRadius:20, fontSize:11.5,
                                   fontWeight:600, color:st.color, background:st.bg }}>
                      {st.label}
                    </span>
                  </td>
                  <td style={{ padding:'13px 14px' }}>
                    <div style={{ display:'flex', gap:5 }} onClick={(e) => e.stopPropagation()}>
                      {exam.status === 'published' && (
                        <button onClick={() => navigate(`/exams/${exam.id}/omr`)}
                          style={{ fontSize:11, padding:'4px 9px', borderRadius:6, cursor:'pointer',
                                   background:'rgba(79,142,247,0.1)', color:'#60a5fa',
                                   border:'1px solid rgba(79,142,247,0.2)', fontWeight:600 }}>
                          OMR
                        </button>
                      )}
                      {exam.status === 'graded' && (
                        <button onClick={() => navigate(`/exams/${exam.id}/report`)}
                          style={{ fontSize:11, padding:'4px 9px', borderRadius:6, cursor:'pointer',
                                   background:'rgba(34,197,94,0.1)', color:'#4ade80',
                                   border:'1px solid rgba(34,197,94,0.2)', fontWeight:600 }}>
                          Relatório
                        </button>
                      )}
                      <button onClick={() => navigate(`/exams/${exam.id}`)}
                        style={{ fontSize:11, padding:'4px 9px', borderRadius:6, cursor:'pointer',
                                 background:'rgba(255,255,255,0.05)', color:'#8892a4',
                                 border:'1px solid rgba(255,255,255,0.1)', fontWeight:600 }}>
                        Ver
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {total > 20 && (
          <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,0.07)',
                        display:'flex', justifyContent:'space-between', alignItems:'center',
                        fontSize:13, color:'#8892a4' }}>
            <span>Página {page} de {Math.ceil(total / 20)}</span>
            <div style={{ display:'flex', gap:6 }}>
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
                style={{ padding:'5px 12px', borderRadius:6, cursor:'pointer',
                         background:'rgba(255,255,255,0.05)', color:'#e8eaf0',
                         border:'1px solid rgba(255,255,255,0.1)',
                         opacity: page === 1 ? 0.4 : 1 }}>
                ← Anterior
              </button>
              <button disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}
                style={{ padding:'5px 12px', borderRadius:6, cursor:'pointer',
                         background:'rgba(255,255,255,0.05)', color:'#e8eaf0',
                         border:'1px solid rgba(255,255,255,0.1)',
                         opacity: page * 20 >= total ? 0.4 : 1 }}>
                Próxima →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
