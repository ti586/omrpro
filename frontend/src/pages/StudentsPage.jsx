// src/pages/StudentsPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { studentAPI, classAPI } from '../services/api';

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [classes,  setClasses]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [classId,  setClassId]  = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ name:'', enrollmentCode:'', birthDate:'', classIds:[] });
  const [saving,   setSaving]   = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        studentAPI.list({ search: search || undefined, classId: classId || undefined }),
        classAPI.list(),
      ]);
      setStudents(s.data.students ?? []);
      setClasses(c.data ?? []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, classId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await studentAPI.create(form);
      setShowForm(false);
      setForm({ name:'', enrollmentCode:'', birthDate:'', classIds:[] });
      load();
    } catch (err) {
      alert(err.response?.data?.error ?? 'Erro ao cadastrar aluno.');
    } finally { setSaving(false); }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const { data } = await studentAPI.import(file);
      alert(`Importados: ${data.created} | Ignorados: ${data.skipped}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error ?? 'Erro ao importar CSV.');
    } finally { setImporting(false); }
  };

  const inp = { width:'100%', background:'#0f1117', border:'1px solid rgba(255,255,255,0.12)',
                borderRadius:8, padding:'9px 12px', color:'#e8eaf0', fontSize:13.5,
                outline:'none', boxSizing:'border-box', fontFamily:'inherit' };

  return (
    <div style={{ padding:24, maxWidth:1100 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800 }}>Alunos</div>
          <div style={{ fontSize:13, color:'#8892a4', marginTop:2 }}>
            {students.length} aluno{students.length !== 1 ? 's' : ''} encontrado{students.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <label style={{ padding:'8px 14px', borderRadius:8, fontSize:13, fontWeight:600,
                          cursor:'pointer', background:'rgba(34,197,94,0.1)', color:'#4ade80',
                          border:'1px solid rgba(34,197,94,0.2)' }}>
            {importing ? '⏳ Importando…' : '📂 Importar CSV'}
            <input type="file" accept=".csv,.txt" style={{ display:'none' }} onChange={handleImport} />
          </label>
          <button onClick={() => setShowForm(true)}
            style={{ padding:'8px 16px', borderRadius:8, background:'#4f8ef7', color:'#fff',
                     border:'none', cursor:'pointer', fontSize:13, fontWeight:600 }}>
            + Novo Aluno
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:16 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍  Buscar por nome ou matrícula…"
          style={{ ...inp, flex:1, padding:'8px 12px' }} />
        <select value={classId} onChange={(e) => setClassId(e.target.value)}
          style={{ ...inp, width:'auto', minWidth:160, padding:'8px 12px' }}>
          <option value="">Todas as turmas</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Create form modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:100,
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.1)',
                        borderRadius:14, padding:28, width:440 }}>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:18 }}>Novo Aluno</div>
            <form onSubmit={handleCreate}>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, color:'#8892a4', fontWeight:600, display:'block',
                                marginBottom:5, textTransform:'uppercase' }}>Nome *</label>
                <input style={inp} required value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, color:'#8892a4', fontWeight:600, display:'block',
                                marginBottom:5, textTransform:'uppercase' }}>Matrícula *</label>
                <input style={inp} required value={form.enrollmentCode}
                  onChange={(e) => setForm((f) => ({ ...f, enrollmentCode: e.target.value }))} />
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, color:'#8892a4', fontWeight:600, display:'block',
                                marginBottom:5, textTransform:'uppercase' }}>Data de Nascimento</label>
                <input type="date" style={inp} value={form.birthDate}
                  onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))} />
              </div>
              <div style={{ marginBottom:18 }}>
                <label style={{ fontSize:11, color:'#8892a4', fontWeight:600, display:'block',
                                marginBottom:8, textTransform:'uppercase' }}>Turmas</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {classes.map((c) => {
                    const sel = form.classIds.includes(c.id);
                    return (
                      <button type="button" key={c.id}
                        onClick={() => setForm((f) => ({
                          ...f, classIds: sel ? f.classIds.filter((id) => id !== c.id) : [...f.classIds, c.id]
                        }))}
                        style={{ padding:'4px 10px', borderRadius:20, fontSize:12, fontWeight:600,
                                 cursor:'pointer',
                                 background: sel ? 'rgba(79,142,247,0.15)' : 'transparent',
                                 color: sel ? '#60a5fa' : '#8892a4',
                                 border: `1.5px solid ${sel ? '#4f8ef7' : 'rgba(255,255,255,0.12)'}` }}>
                        {c.name}
                      </button>
                    );
                  })}
                </div>
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
                  {saving ? 'Salvando…' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                    borderRadius:12, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
              {['Nome','Matrícula','Turmas','Média','Provas',''].map((h) => (
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11,
                                     color:'#8892a4', textTransform:'uppercase',
                                     letterSpacing:'0.5px', fontWeight:600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding:32, textAlign:'center', color:'#8892a4' }}>Carregando…</td></tr>
            ) : students.map((s, i) => (
              <tr key={s.id}
                style={{ borderBottom:'1px solid rgba(255,255,255,0.04)',
                         background: i%2===1 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                <td style={{ padding:'11px 14px', fontWeight:600 }}>{s.name}</td>
                <td style={{ padding:'11px 14px', color:'#8892a4', fontSize:12 }}>{s.enrollment_code}</td>
                <td style={{ padding:'11px 14px', color:'#8892a4', fontSize:12 }}>
                  {(s.classes ?? []).filter(Boolean).map((c) => c.name).join(', ') || '—'}
                </td>
                <td style={{ padding:'11px 14px', fontWeight:700,
                             color: s.avg_score >= 5 ? '#4ade80' : s.avg_score ? '#f87171' : '#4a5568' }}>
                  {s.avg_score ? Number(s.avg_score).toFixed(1) : '—'}
                </td>
                <td style={{ padding:'11px 14px', color:'#8892a4' }}>{s.exams_taken ?? 0}</td>
                <td style={{ padding:'11px 14px' }}>
                  <button onClick={() => studentAPI.update(s.id, { is_active: false }).then(load)}
                    style={{ fontSize:11, color:'#f87171', background:'none', border:'none', cursor:'pointer' }}>
                    Desativar
                  </button>
                </td>
              </tr>
            ))}
            {!loading && !students.length && (
              <tr><td colSpan={6} style={{ padding:32, textAlign:'center', color:'#4a5568' }}>
                Nenhum aluno encontrado.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* CSV hint */}
      <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(79,142,247,0.06)',
                    border:'1px solid rgba(79,142,247,0.12)', borderRadius:8,
                    fontSize:12, color:'#8892a4' }}>
        💡 Para importar muitos alunos de uma vez, use um arquivo CSV com as colunas:
        <strong style={{ color:'#60a5fa' }}> Nome, Matrícula, DataNascimento (DD/MM/AAAA)</strong>
        — um aluno por linha.
      </div>
    </div>
  );
}
