// src/pages/ClassesPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { classAPI, studentAPI } from '../services/api';

export default function ClassesPage() {
  const [classes,  setClasses]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [detail,   setDetail]   = useState(null); // selected class
  const [form,     setForm]     = useState({ name:'', grade:'', year: new Date().getFullYear() });
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await classAPI.list();
      setClasses(data ?? []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (cls) => {
    try {
      const { data } = await classAPI.get(cls.id);
      setDetail(data);
    } catch (err) { console.error(err); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await classAPI.create(form);
      setShowForm(false);
      setForm({ name:'', grade:'', year: new Date().getFullYear() });
      load();
    } catch (err) {
      alert(err.response?.data?.error ?? 'Erro ao criar turma.');
    } finally { setSaving(false); }
  };

  const inp = {
    width:'100%', background:'#0f1117', border:'1px solid rgba(255,255,255,0.12)',
    borderRadius:8, padding:'9px 12px', color:'#e8eaf0', fontSize:13.5,
    outline:'none', boxSizing:'border-box', fontFamily:'inherit',
  };

  return (
    <div style={{ padding:24, maxWidth:1100 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800 }}>Turmas</div>
          <div style={{ fontSize:13, color:'#8892a4', marginTop:2 }}>
            {classes.length} turma{classes.length !== 1 ? 's' : ''} ativa{classes.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ padding:'8px 16px', borderRadius:8, background:'#4f8ef7', color:'#fff',
                   border:'none', cursor:'pointer', fontSize:13, fontWeight:600 }}>
          + Nova Turma
        </button>
      </div>

      {/* Grid of class cards */}
      {loading ? (
        <div style={{ padding:40, textAlign:'center', color:'#8892a4' }}>Carregando…</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:14 }}>
          {classes.map((cls) => (
            <div key={cls.id}
              onClick={() => openDetail(cls)}
              style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                       borderRadius:12, padding:18, cursor:'pointer', transition:'border-color 0.15s' }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor='rgba(79,142,247,0.4)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor='rgba(255,255,255,0.07)'}>

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
                            marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:800 }}>{cls.name}</div>
                  <div style={{ fontSize:12, color:'#8892a4', marginTop:2 }}>{cls.grade ?? '—'}</div>
                </div>
                <div style={{ background:'rgba(79,142,247,0.1)', color:'#60a5fa',
                              padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                  {cls.year}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[
                  { label:'Alunos',  value: cls.student_count ?? 0, icon:'👤' },
                  { label:'Provas',  value: cls.exam_count ?? 0,    icon:'📝' },
                ].map((m) => (
                  <div key={m.label} style={{ background:'rgba(255,255,255,0.03)',
                                              borderRadius:8, padding:'10px 12px' }}>
                    <div style={{ fontSize:18, marginBottom:4 }}>{m.icon}</div>
                    <div style={{ fontSize:20, fontWeight:800 }}>{m.value}</div>
                    <div style={{ fontSize:11, color:'#8892a4' }}>{m.label}</div>
                  </div>
                ))}
              </div>

              {cls.teacher_name && (
                <div style={{ marginTop:12, fontSize:12, color:'#8892a4' }}>
                  👨‍🏫 {cls.teacher_name}
                </div>
              )}
            </div>
          ))}

          {!classes.length && (
            <div style={{ gridColumn:'1/-1', padding:40, textAlign:'center', color:'#4a5568' }}>
              Nenhuma turma criada ainda.
            </div>
          )}
        </div>
      )}

      {/* Create form modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:100,
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.1)',
                        borderRadius:14, padding:28, width:400 }}>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:18 }}>Nova Turma</div>
            <form onSubmit={handleCreate}>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, color:'#8892a4', fontWeight:600, display:'block',
                                marginBottom:5, textTransform:'uppercase' }}>Nome da Turma *</label>
                <input style={inp} required placeholder="Ex: 3EM A" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, color:'#8892a4', fontWeight:600, display:'block',
                                marginBottom:5, textTransform:'uppercase' }}>Série / Nível</label>
                <input style={inp} placeholder="Ex: 3° Ensino Médio" value={form.grade}
                  onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))} />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:11, color:'#8892a4', fontWeight:600, display:'block',
                                marginBottom:5, textTransform:'uppercase' }}>Ano letivo</label>
                <input type="number" style={inp} min="2000" max="2099" value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: +e.target.value }))} />
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button type="button" onClick={() => setShowForm(false)}
                  style={{ flex:1, padding:10, borderRadius:8, cursor:'pointer', fontSize:13,
                           background:'rgba(255,255,255,0.05)', color:'#8892a4',
                           border:'1px solid rgba(255,255,255,0.1)', fontFamily:'inherit' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex:1, padding:10, borderRadius:8, cursor:'pointer', fontSize:13,
                           fontWeight:700, background:'#4f8ef7', color:'#fff',
                           border:'none', fontFamily:'inherit' }}>
                  {saving ? 'Criando…' : 'Criar Turma'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Class detail panel */}
      {detail && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:100,
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.1)',
                        borderRadius:14, padding:28, width:520, maxHeight:'80vh',
                        overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                          marginBottom:18 }}>
              <div style={{ fontWeight:800, fontSize:17 }}>{detail.name}</div>
              <button onClick={() => setDetail(null)}
                style={{ background:'none', border:'none', cursor:'pointer',
                         color:'#8892a4', fontSize:20 }}>✕</button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:18 }}>
              {[
                { label:'Série',   value: detail.grade ?? '—' },
                { label:'Ano',     value: detail.year },
                { label:'Alunos',  value: (detail.students ?? []).filter(Boolean).length },
              ].map((m) => (
                <div key={m.label} style={{ background:'rgba(255,255,255,0.04)',
                                            borderRadius:8, padding:'10px 12px' }}>
                  <div style={{ fontSize:11, color:'#8892a4', marginBottom:3 }}>{m.label}</div>
                  <div style={{ fontSize:18, fontWeight:800 }}>{m.value}</div>
                </div>
              ))}
            </div>

            <div style={{ fontWeight:700, fontSize:13, marginBottom:10 }}>Alunos matriculados</div>
            <div style={{ maxHeight:300, overflowY:'auto' }}>
              {(detail.students ?? []).filter(Boolean).length === 0 ? (
                <div style={{ fontSize:13, color:'#4a5568', padding:'12px 0' }}>
                  Nenhum aluno nesta turma.
                </div>
              ) : (
                (detail.students ?? []).filter(Boolean).map((s) => (
                  <div key={s.id} style={{ display:'flex', justifyContent:'space-between',
                                           padding:'9px 0', borderBottom:'1px solid rgba(255,255,255,0.04)',
                                           fontSize:13 }}>
                    <span style={{ fontWeight:600 }}>{s.name}</span>
                    <span style={{ color:'#8892a4', fontSize:12 }}>{s.enrollment_code}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
