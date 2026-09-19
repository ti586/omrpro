// src/pages/SchoolsPage.jsx
import { useState, useEffect } from 'react';
import { schoolAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function SchoolsPage() {
  const { user }   = useAuth();
  const [school,   setSchool]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [form,     setForm]     = useState({});
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    schoolAPI.get(user?.schoolId)
      .then(({ data }) => { setSchool(data); setForm({ name: data.name, city: data.city, state: data.state }); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await schoolAPI.update(school.id, form);
      setSchool(data);
      setEditing(false);
    } catch (err) {
      alert(err.response?.data?.error ?? 'Erro ao salvar.');
    } finally { setSaving(false); }
  };

  const inp = {
    width:'100%', background:'#0f1117', border:'1px solid rgba(255,255,255,0.12)',
    borderRadius:8, padding:'9px 12px', color:'#e8eaf0', fontSize:13.5,
    outline:'none', boxSizing:'border-box', fontFamily:'inherit',
  };

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'#8892a4' }}>Carregando…</div>;
  if (!school) return <div style={{ padding:40, textAlign:'center', color:'#f87171' }}>Escola não encontrada.</div>;

  const planColors = { free:'#8892a4', pro:'#60a5fa', enterprise:'#c084fc' };

  return (
    <div style={{ padding:24, maxWidth:800 }}>
      <div style={{ fontSize:20, fontWeight:800, marginBottom:20 }}>Escola</div>

      {/* School card */}
      <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                    borderRadius:12, padding:24, marginBottom:16 }}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
                      marginBottom:20 }}>
          <div style={{ display:'flex', gap:14, alignItems:'center' }}>
            <div style={{ width:56, height:56, borderRadius:12,
                          background:'linear-gradient(135deg,#4f8ef7,#6c47ff)',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:26 }}>
              🏫
            </div>
            <div>
              <div style={{ fontSize:20, fontWeight:800 }}>{school.name}</div>
              <div style={{ fontSize:13, color:'#8892a4', marginTop:2 }}>
                {school.city}{school.state ? `, ${school.state}` : ''}
                {' · '}
                <span style={{ color: planColors[school.plan] ?? '#8892a4',
                               fontWeight:600, textTransform:'uppercase',
                               fontSize:11 }}>
                  Plano {school.plan}
                </span>
              </div>
            </div>
          </div>
          <button onClick={() => setEditing(true)}
            style={{ padding:'7px 14px', borderRadius:8, cursor:'pointer', fontSize:13,
                     fontWeight:600, background:'rgba(255,255,255,0.05)', color:'#8892a4',
                     border:'1px solid rgba(255,255,255,0.1)' }}>
            ✏️ Editar
          </button>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          {[
            { label:'Usuários',    value: school.user_count    ?? 0, icon:'👤', color:'#60a5fa' },
            { label:'Turmas',      value: school.class_count   ?? 0, icon:'👥', color:'#fbbf24' },
            { label:'Alunos',      value: school.student_count ?? 0, icon:'🎓', color:'#4ade80' },
            { label:'Provas',      value: school.exam_count    ?? 0, icon:'📝', color:'#a78bfa' },
          ].map((m) => (
            <div key={m.label} style={{ background:'rgba(255,255,255,0.03)',
                                        borderRadius:10, padding:'14px 16px' }}>
              <div style={{ fontSize:20, marginBottom:6 }}>{m.icon}</div>
              <div style={{ fontSize:24, fontWeight:800, color:m.color }}>{m.value}</div>
              <div style={{ fontSize:11, color:'#8892a4', marginTop:3,
                            textTransform:'uppercase', letterSpacing:'0.5px' }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Info details */}
      <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                    borderRadius:12, padding:20 }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Informações</div>
        {[
          ['Código da escola', school.code],
          ['Cidade',           school.city ?? '—'],
          ['Estado',           school.state ?? '—'],
          ['Plano',            school.plan],
          ['Status',           school.is_active ? 'Ativa' : 'Inativa'],
        ].map(([k, v]) => (
          <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0',
                                borderBottom:'1px solid rgba(255,255,255,0.04)', fontSize:13 }}>
            <span style={{ color:'#8892a4' }}>{k}</span>
            <span style={{ fontWeight:600 }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Edit modal */}
      {editing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:100,
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.1)',
                        borderRadius:14, padding:28, width:420 }}>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:18 }}>Editar Escola</div>
            <form onSubmit={handleSave}>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, color:'#8892a4', fontWeight:600, display:'block',
                                marginBottom:5, textTransform:'uppercase' }}>Nome</label>
                <input style={inp} value={form.name ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, color:'#8892a4', fontWeight:600, display:'block',
                                marginBottom:5, textTransform:'uppercase' }}>Cidade</label>
                <input style={inp} value={form.city ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:11, color:'#8892a4', fontWeight:600, display:'block',
                                marginBottom:5, textTransform:'uppercase' }}>Estado (UF)</label>
                <input style={inp} maxLength={2} value={form.state ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))} />
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button type="button" onClick={() => setEditing(false)}
                  style={{ flex:1, padding:10, borderRadius:8, cursor:'pointer', fontSize:13,
                           background:'rgba(255,255,255,0.05)', color:'#8892a4',
                           border:'1px solid rgba(255,255,255,0.1)', fontFamily:'inherit' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex:1, padding:10, borderRadius:8, cursor:'pointer', fontSize:13,
                           fontWeight:700, background:'#4f8ef7', color:'#fff',
                           border:'none', fontFamily:'inherit' }}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
