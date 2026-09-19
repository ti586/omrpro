// src/pages/ExamBuilderPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { examAPI, classAPI } from '../services/api';
import AnswerCardPreview from '../components/AnswerCardPreview';

const TYPES = [
  { value:'multiple_choice', label:'Múltipla (A-D)', icon:'🔘' },
  { value:'true_false',      label:'Certo/Errado',   icon:'✔️' },
  { value:'numeric',         label:'Numérica',        icon:'🔢' },
];

const S = {
  page:  { padding:'24px', fontFamily:'inherit' },
  card:  { background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)', borderRadius:'12px', padding:'18px', marginBottom:'16px' },
  inp:   { width:'100%', background:'#0f1117', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'8px', padding:'9px 12px', color:'#e8eaf0', fontSize:'13px', outline:'none', fontFamily:'inherit', boxSizing:'border-box' },
  lbl:   { fontSize:'11px', color:'#8892a4', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px', display:'block', marginBottom:'5px' },
  btn:   (on) => ({ padding:'7px 10px', borderRadius:'7px', cursor:'pointer', fontSize:'12px', fontWeight:600, fontFamily:'inherit', background: on?'rgba(79,142,247,0.18)':'transparent', color: on?'#60a5fa':'#8892a4', border:`1.5px solid ${on?'#4f8ef7':'rgba(255,255,255,0.12)'}` }),
  err:   { background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'8px', padding:'12px 16px', color:'#f87171', fontSize:'13px', marginBottom:'14px' },
};

export default function ExamBuilderPage() {
  const navigate = useNavigate();
  const csvRef   = useRef();

  const [classes,   setClasses]   = useState([]);
  const [questions, setQuestions] = useState([]);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [csvError,  setCsvError]  = useState('');

  const [meta, setMeta] = useState({
    title:'', subjectId:'', classIds:[], examDate:'', totalScore:10, passingScore:5,
  });
  const [cardCfg, setCardCfg] = useState({
    show_name:true, show_enrollment:true, show_class:true,
    show_date:true, show_qr:true, show_signature:false, orientation:'portrait',
  });
  const [newQ, setNewQ] = useState({ type:'multiple_choice', answer:'A', score:1, c:'0', d:'0', u:'0' });

  useEffect(() => {
    classAPI.list()
      .then(({ data }) => setClasses(data ?? []))
      .catch(() => setClasses([]));
  }, []);

  // ── Add single question ──────────────────────────────────
  const addQ = () => {
    let ans = newQ.answer;
    if (newQ.type === 'numeric') {
      if (newQ.c==='' || newQ.d==='' || newQ.u==='') { setError('Preencha C, D e U da questão numérica.'); return; }
      ans = `${newQ.c}${newQ.d}${newQ.u}`;
    }
    if (newQ.type === 'true_false' && !['C','E'].includes(ans)) ans = 'C';
    setError('');
    setQuestions(prev => [...prev, { number: prev.length+1, type:newQ.type, correctAnswer:ans, score:+newQ.score }]);
  };

  const removeQ = (idx) => setQuestions(prev =>
    prev.filter((_,i)=>i!==idx).map((q,i)=>({...q,number:i+1}))
  );

  // ── Import questions from CSV/XLSX spreadsheet ───────────
  // Expected columns: Questao | Alternativa | Peso
  // OR: number | answer | score
  const handleSpreadsheet = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError('');
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      // Detect separator
      const sep = lines[0].includes(';') ? ';' : ',';
      const header = lines[0].toLowerCase().split(sep).map(h => h.trim().replace(/"/g,''));
      const dataLines = lines.slice(1);

      // Map header columns
      const iNum = header.findIndex(h => h.includes('quest') || h.includes('numer') || h==='n' || h==='#' || h==='number');
      const iAns = header.findIndex(h => h.includes('altern') || h.includes('answer') || h.includes('gabar') || h.includes('resp'));
      const iPeso= header.findIndex(h => h.includes('peso') || h.includes('score') || h.includes('pont') || h.includes('valor'));

      if (iAns === -1) {
        setCsvError('Coluna de alternativa/gabarito não encontrada. Use cabeçalho: Questao, Alternativa, Peso');
        return;
      }

      const imported = [];
      let lineNum = 2;
      for (const line of dataLines) {
        if (!line) { lineNum++; continue; }
        const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g,''));
        const rawAns   = cols[iAns]?.toUpperCase().trim();
        const rawScore = iPeso !== -1 ? parseFloat(cols[iPeso]) : 1;
        const score    = isNaN(rawScore) ? 1 : rawScore;

        if (!rawAns) { lineNum++; continue; }

        // Detect type
        let type = 'multiple_choice';
        let answer = rawAns;
        if (['C','E','CERTO','ERRADO','TRUE','FALSE','V','F'].includes(rawAns)) {
          type = 'true_false';
          answer = ['C','CERTO','TRUE','V'].includes(rawAns) ? 'C' : 'E';
        } else if (/^\d{1,3}$/.test(rawAns)) {
          type = 'numeric';
          answer = rawAns.padStart(3,'0').slice(-3);
        } else if (!['A','B','C','D'].includes(rawAns)) {
          setCsvError(`Linha ${lineNum}: alternativa inválida "${rawAns}". Use A/B/C/D, C/E ou número.`);
          return;
        }

        imported.push({ number: imported.length+1, type, correctAnswer: answer, score });
        lineNum++;
      }

      if (!imported.length) {
        setCsvError('Nenhuma questão encontrada no arquivo. Verifique o formato.');
        return;
      }
      setQuestions(imported);
      setCsvError('');
    } catch (err) {
      setCsvError('Erro ao ler o arquivo: ' + err.message);
    }
    e.target.value = '';
  };

  // ── Save ────────────────────────────────────────────────
  const save = async (publish=false) => {
    setError('');
    if (!meta.title.trim())    return setError('Nome da prova é obrigatório.');
    if (!meta.classIds.length) return setError('Selecione ao menos uma turma.');
    if (!questions.length)     return setError('Adicione questões ou importe uma planilha.');

    setSaving(true);
    try {
      const { data: exam } = await examAPI.create({
        title:        meta.title.trim(),
        subjectId:    meta.subjectId || undefined,
        classIds:     meta.classIds,
        examDate:     meta.examDate || undefined,
        totalScore:   meta.totalScore,
        passingScore: meta.passingScore,
        cardConfig:   cardCfg,
        questions:    questions.map(q=>({ number:q.number, type:q.type, correctAnswer:q.correctAnswer, score:q.score })),
      });
      if (publish) await examAPI.publish(exam.id);
      navigate(`/exams/${exam.id}`);
    } catch (err) {
      const d = err.response?.data;
      setError(d?.error ?? d?.errors?.map(e=>e.msg).join('; ') ?? 'Erro ao salvar. Tente novamente.');
    } finally { setSaving(false); }
  };

  const toggleClass = (id) => setMeta(m=>({
    ...m, classIds: m.classIds.includes(id) ? m.classIds.filter(c=>c!==id) : [...m.classIds, id]
  }));

  const totalWeight = questions.reduce((s,q)=>s+q.score,0);

  return (
    <div style={S.page}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'20px'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:800}}>Criar Nova Prova</div>
          <div style={{fontSize:'13px',color:'#8892a4',marginTop:'2px'}}>Preencha os dados e adicione as questões</div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button onClick={()=>save(false)} disabled={saving}
            style={{padding:'9px 18px',borderRadius:'8px',background:'rgba(255,255,255,0.06)',color:'#e8eaf0',border:'1px solid rgba(255,255,255,0.15)',cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:'inherit',opacity:saving?0.6:1}}>
            💾 Salvar rascunho
          </button>
          <button onClick={()=>save(true)} disabled={saving}
            style={{padding:'9px 18px',borderRadius:'8px',background:'#4f8ef7',color:'#fff',border:'none',cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:'inherit',opacity:saving?0.6:1}}>
            🚀 {saving?'Salvando…':'Publicar prova'}
          </button>
        </div>
      </div>

      {error && <div style={S.err}>⚠️ {error}</div>}

      <div style={{display:'grid',gridTemplateColumns:'1fr 400px',gap:'20px',alignItems:'start'}}>

        {/* ── LEFT ─────────────────────────────────────────── */}
        <div>

          {/* Dados */}
          <div style={S.card}>
            <div style={{fontWeight:700,fontSize:'14px',marginBottom:'14px'}}>Dados da Prova</div>

            <div style={{marginBottom:'12px'}}>
              <label style={S.lbl}>Nome da prova *</label>
              <input style={S.inp} value={meta.title} placeholder="Ex: Matemática — Bimestral 1"
                onChange={e=>setMeta(m=>({...m,title:e.target.value}))} />
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'12px'}}>
              <div>
                <label style={S.lbl}>Disciplina</label>
                <select style={S.inp} value={meta.subjectId} onChange={e=>setMeta(m=>({...m,subjectId:e.target.value}))}>
                  <option value="">Nenhuma</option>
                  {['Matemática','Física','Química','Biologia','História','Geografia','Português','Inglês'].map(s=>(
                    <option key={s} value={s.toLowerCase()}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={S.lbl}>Data da prova</label>
                <input type="date" style={S.inp} value={meta.examDate}
                  onChange={e=>setMeta(m=>({...m,examDate:e.target.value}))} />
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'12px'}}>
              <div>
                <label style={S.lbl}>Nota total</label>
                <input type="number" style={S.inp} min="1" max="100" step="0.5"
                  value={meta.totalScore} onChange={e=>setMeta(m=>({...m,totalScore:+e.target.value}))} />
              </div>
              <div>
                <label style={S.lbl}>Nota mínima (aprovação)</label>
                <input type="number" style={S.inp} min="0" step="0.5"
                  value={meta.passingScore} onChange={e=>setMeta(m=>({...m,passingScore:+e.target.value}))} />
              </div>
            </div>

            <div>
              <label style={S.lbl}>
                Turmas * {classes.length===0 && <span style={{fontWeight:400,color:'#4a5568'}}>(nenhuma turma cadastrada)</span>}
              </label>
              <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
                {classes.map(cls=>{
                  const sel = meta.classIds.includes(cls.id);
                  return (
                    <button key={cls.id} type="button" onClick={()=>toggleClass(cls.id)}
                      style={{padding:'5px 14px',borderRadius:'20px',fontSize:'12px',fontWeight:600,
                              cursor:'pointer',fontFamily:'inherit',
                              background:sel?'rgba(79,142,247,0.15)':'transparent',
                              color:sel?'#60a5fa':'#8892a4',
                              border:`1.5px solid ${sel?'#4f8ef7':'rgba(255,255,255,0.15)'}`}}>
                      {cls.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Importar planilha */}
          <div style={S.card}>
            <div style={{fontWeight:700,fontSize:'14px',marginBottom:'6px'}}>📊 Importar Gabarito por Planilha</div>
            <div style={{fontSize:'12px',color:'#8892a4',marginBottom:'10px'}}>
              Arquivo CSV com 3 colunas: <strong style={{color:'#e8eaf0'}}>Questao, Alternativa, Peso</strong>
              <br/>Alternativas aceitas: A B C D (múltipla) · C E (certo/errado) · número 000-999 (numérica)
            </div>

            {/* Template download hint */}
            <div style={{background:'rgba(79,142,247,0.06)',border:'1px solid rgba(79,142,247,0.15)',
                         borderRadius:'8px',padding:'10px 12px',marginBottom:'10px',fontSize:'12px',color:'#8892a4'}}>
              💡 Exemplo de conteúdo do CSV:
              <pre style={{margin:'6px 0 0',color:'#60a5fa',fontSize:'11px',lineHeight:'1.6'}}>
{`Questao,Alternativa,Peso
1,A,1
2,C,1
3,E,0.5
4,B,1
5,158,2`}
              </pre>
            </div>

            <input ref={csvRef} type="file" accept=".csv,.txt" style={{display:'none'}} onChange={handleSpreadsheet} />
            <button type="button" onClick={()=>csvRef.current?.click()}
              style={{padding:'9px 18px',borderRadius:'8px',background:'rgba(34,197,94,0.12)',
                      color:'#4ade80',border:'1px solid rgba(34,197,94,0.25)',cursor:'pointer',
                      fontSize:'13px',fontWeight:600,fontFamily:'inherit'}}>
              📂 Selecionar arquivo CSV
            </button>
            {csvError && <div style={{color:'#f87171',fontSize:'12px',marginTop:'8px'}}>⚠️ {csvError}</div>}
            {questions.length > 0 && (
              <div style={{color:'#4ade80',fontSize:'12px',marginTop:'8px'}}>
                ✅ {questions.length} questões carregadas — peso total: {totalWeight.toFixed(1)}
              </div>
            )}
          </div>

          {/* Adicionar questão manualmente */}
          <div style={S.card}>
            <div style={{fontWeight:700,fontSize:'14px',marginBottom:'12px'}}>➕ Adicionar Questão Manualmente</div>

            <div style={{display:'flex',gap:'6px',marginBottom:'12px'}}>
              {TYPES.map(t=>(
                <button key={t.value} type="button"
                  onClick={()=>setNewQ(q=>({...q,type:t.value,answer:t.value==='true_false'?'C':'A'}))}
                  style={{...S.btn(newQ.type===t.value),flex:1}}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            <div style={{display:'flex',gap:'10px',alignItems:'flex-end'}}>
              {/* MC */}
              {newQ.type==='multiple_choice' && (
                <div style={{flex:2}}>
                  <label style={S.lbl}>Gabarito</label>
                  <div style={{display:'flex',gap:'6px'}}>
                    {['A','B','C','D'].map(opt=>(
                      <button key={opt} type="button" onClick={()=>setNewQ(q=>({...q,answer:opt}))}
                        style={{flex:1,padding:'9px 0',borderRadius:'7px',cursor:'pointer',fontSize:'15px',
                                fontWeight:800,fontFamily:'inherit',
                                background:newQ.answer===opt?'#4f8ef7':'rgba(255,255,255,0.05)',
                                color:newQ.answer===opt?'#fff':'#8892a4',
                                border:`1.5px solid ${newQ.answer===opt?'#4f8ef7':'rgba(255,255,255,0.12)'}`}}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* CE */}
              {newQ.type==='true_false' && (
                <div style={{flex:2}}>
                  <label style={S.lbl}>Gabarito</label>
                  <div style={{display:'flex',gap:'6px'}}>
                    {[['C','✔ Certo','#16a34a'],['E','✘ Errado','#dc2626']].map(([opt,lbl,col])=>(
                      <button key={opt} type="button" onClick={()=>setNewQ(q=>({...q,answer:opt}))}
                        style={{flex:1,padding:'9px 0',borderRadius:'7px',cursor:'pointer',fontSize:'13px',
                                fontWeight:700,fontFamily:'inherit',
                                background:newQ.answer===opt?col:'rgba(255,255,255,0.05)',
                                color:newQ.answer===opt?'#fff':'#8892a4',
                                border:'1.5px solid rgba(255,255,255,0.12)'}}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Numeric */}
              {newQ.type==='numeric' && (
                <div style={{flex:2}}>
                  <label style={S.lbl}>Resposta (C · D · U)</label>
                  <div style={{display:'flex',gap:'6px'}}>
                    {['c','d','u'].map((d,i)=>(
                      <div key={d} style={{flex:1,textAlign:'center'}}>
                        <div style={{fontSize:'10px',color:'#8892a4',marginBottom:'3px'}}>{['Centena','Dezena','Unidade'][i]}</div>
                        <input type="number" min="0" max="9"
                          value={newQ[d]}
                          onChange={e=>setNewQ(q=>({...q,[d]:e.target.value}))}
                          style={{...S.inp,textAlign:'center',fontSize:'18px',fontWeight:800,padding:'6px 0'}} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{flex:1}}>
                <label style={S.lbl}>Peso</label>
                <input type="number" min="0.5" max="10" step="0.5"
                  value={newQ.score} onChange={e=>setNewQ(q=>({...q,score:+e.target.value}))}
                  style={S.inp} />
              </div>
              <button type="button" onClick={addQ}
                style={{padding:'0 20px',height:'40px',borderRadius:'8px',background:'#4f8ef7',
                        color:'#fff',border:'none',cursor:'pointer',fontWeight:700,
                        fontSize:'18px',flexShrink:0,fontFamily:'inherit'}}>
                +
              </button>
            </div>
          </div>

          {/* Question list */}
          <div style={S.card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
              <div style={{fontWeight:700,fontSize:'14px'}}>
                Questões <span style={{color:'#4f8ef7'}}>({questions.length})</span>
              </div>
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                {questions.length>0 && (
                  <span style={{fontSize:'12px',color:'#8892a4'}}>
                    Peso total: <strong style={{color:'#e8eaf0'}}>{totalWeight.toFixed(1)}</strong>
                  </span>
                )}
                {questions.length>0 && (
                  <button type="button" onClick={()=>setQuestions([])}
                    style={{fontSize:'11px',padding:'3px 8px',borderRadius:'5px',cursor:'pointer',
                            background:'rgba(239,68,68,0.1)',color:'#f87171',
                            border:'1px solid rgba(239,68,68,0.2)',fontFamily:'inherit'}}>
                    Limpar tudo
                  </button>
                )}
              </div>
            </div>
            {questions.length===0 ? (
              <div style={{textAlign:'center',padding:'24px',color:'#4a5568',fontSize:'13px'}}>
                Nenhuma questão. Importe uma planilha ou adicione manualmente acima.
              </div>
            ) : (
              <div style={{maxHeight:'340px',overflowY:'auto'}}>
                {questions.map((q,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 10px',
                                       borderRadius:'7px',marginBottom:'4px',background:'#1e2638',
                                       border:'1px solid rgba(255,255,255,0.06)'}}>
                    <span style={{fontWeight:800,color:'#4f8ef7',minWidth:'28px',fontSize:'13px'}}>Q.{q.number}</span>
                    <span style={{fontSize:'11px',color:'#8892a4',flex:1}}>
                      {TYPES.find(t=>t.value===q.type)?.icon} {TYPES.find(t=>t.value===q.type)?.label}
                    </span>
                    <span style={{fontWeight:700,background:'rgba(79,142,247,0.12)',color:'#60a5fa',
                                  padding:'2px 10px',borderRadius:'5px',fontSize:'12px',minWidth:'48px',textAlign:'center'}}>
                      {q.correctAnswer}
                    </span>
                    <span style={{fontSize:'11px',color:'#8892a4',minWidth:'52px'}}>
                      Peso: <strong style={{color:'#e8eaf0'}}>{q.score}</strong>
                    </span>
                    <button type="button" onClick={()=>removeQ(i)}
                      style={{fontSize:'12px',padding:'3px 7px',borderRadius:'5px',cursor:'pointer',
                              background:'rgba(239,68,68,0.1)',color:'#f87171',
                              border:'1px solid rgba(239,68,68,0.2)',fontFamily:'inherit'}}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT — config + preview ──────────────────────── */}
        <div style={{position:'sticky',top:'16px'}}>

          <div style={S.card}>
            <div style={{fontWeight:700,fontSize:'14px',marginBottom:'12px'}}>Configuração do Cartão</div>
            <div style={{display:'flex',flexDirection:'column',gap:'7px',marginBottom:'12px'}}>
              {[
                {k:'show_name',       l:'Nome do aluno'},
                {k:'show_enrollment', l:'Matrícula'},
                {k:'show_class',      l:'Turma'},
                {k:'show_date',       l:'Data da prova'},
                {k:'show_qr',         l:'QR Code'},
                {k:'show_signature',  l:'Assinatura'},
              ].map(({k,l})=>(
                <label key={k} style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',cursor:'pointer'}}>
                  <input type="checkbox" checked={cardCfg[k]}
                    onChange={e=>setCardCfg(c=>({...c,[k]:e.target.checked}))}
                    style={{accentColor:'#4f8ef7'}} />
                  {l}
                </label>
              ))}
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              {['portrait','landscape'].map(o=>(
                <button key={o} type="button" onClick={()=>setCardCfg(c=>({...c,orientation:o}))}
                  style={{...S.btn(cardCfg.orientation===o),flex:1}}>
                  {o==='portrait'?'📄 Retrato':'🖼 Paisagem'}
                </button>
              ))}
            </div>
          </div>

          <div style={S.card}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
              <div style={{fontWeight:700,fontSize:'14px'}}>Pré-visualização</div>
              <span style={{fontSize:'11px',color:'#4f8ef7',background:'rgba(79,142,247,0.1)',padding:'2px 8px',borderRadius:'4px'}}>Tempo real</span>
            </div>
            <div style={{overflowX:'auto'}}>
              <div style={{width:'360px',margin:'0 auto'}}>
                <AnswerCardPreview
                  examTitle={meta.title||'Nome da Prova'}
                  questions={questions}
                  cardConfig={cardCfg}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
