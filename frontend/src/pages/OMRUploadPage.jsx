// src/pages/OMRUploadPage.jsx
import { useCallback, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useOMR } from '../hooks/useOMR';

const STATUS_META = {
  pending:    { label: 'Aguardando',    color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  queued:     { label: 'Na fila',       color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  processing: { label: 'Processando',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  graded:     { label: 'Corrigido',     color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  error:      { label: 'Erro',          color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  manual_review: { label: 'Revisar',   color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
};

export default function OMRUploadPage() {
  const { examId } = useParams();
  const { upload, cards, progress, isProcessing, uploadProgress, reset } = useOMR(examId);
  const [isDragging, setIsDragging] = useState(false);
  const [omrConfig, setOmrConfig]   = useState({
    sensitivity: 7,
    tolerance:   'medium',
    perspective: 'auto',
    detectMultiple: true,
    ignoreNoise:    true,
    antiFraud:      true,
    useAI:          false,
  });
  const inputRef = useRef(null);

  // ── Drag-drop ────────────────────────────────────────────
  const onDragOver  = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = ()  => setIsDragging(false);
  const onDrop      = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = [...e.dataTransfer.files].filter((f) =>
      /\.(jpe?g|png|tiff?|bmp)$/i.test(f.name),
    );
    if (files.length) upload(files);
  }, [upload]);

  const onFileSelect = (e) => {
    const files = [...e.target.files];
    if (files.length) upload(files);
  };

  // ── Metrics ──────────────────────────────────────────────
  const graded  = cards.filter((c) => c.status === 'graded');
  const errors  = cards.filter((c) => c.status === 'error');
  const reviews = cards.filter((c) => c.status === 'manual_review');
  const avgScore = graded.length
    ? (graded.reduce((s, c) => s + (c.totalScore ?? 0), 0) / graded.length).toFixed(1)
    : null;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'24px' }}>
        <div>
          <div style={{ fontSize:'20px', fontWeight:800 }}>Leitura Óptica — OMR</div>
          <div style={{ fontSize:'13px', color:'#8892a4', marginTop:'2px' }}>
            Carregue os cartões digitalizados para correção automática em tempo real
          </div>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          {cards.length > 0 && (
            <button onClick={reset}
              style={{ padding:'8px 14px', borderRadius:'8px', background:'rgba(239,68,68,0.1)',
                       color:'#f87171', border:'1px solid rgba(239,68,68,0.2)', cursor:'pointer',
                       fontSize:'13px', fontWeight:600 }}>
              ✕ Limpar fila
            </button>
          )}
          <Link to={`/exams/${examId}/report`}
            style={{ padding:'8px 16px', borderRadius:'8px', background:'rgba(79,142,247,0.12)',
                     color:'#60a5fa', border:'1px solid rgba(79,142,247,0.2)', textDecoration:'none',
                     fontSize:'13px', fontWeight:600 }}>
            📊 Ver Relatório
          </Link>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:'20px', alignItems:'start' }}>

        {/* LEFT — Upload + Queue */}
        <div>

          {/* Metrics strip */}
          {cards.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px', marginBottom:'16px' }}>
              {[
                { label:'Total',       value: progress.total,   color:'#60a5fa' },
                { label:'Corrigidos',  value: progress.done,    color:'#4ade80' },
                { label:'Erros',       value: progress.errors,  color:'#f87171' },
                { label:'Média',       value: avgScore ?? '—',  color:'#c084fc' },
              ].map((m) => (
                <div key={m.label} style={{ background:'#1e2638', border:'1px solid rgba(255,255,255,0.07)',
                  borderRadius:'10px', padding:'14px 16px' }}>
                  <div style={{ fontSize:'11px', color:'#8892a4', textTransform:'uppercase',
                                letterSpacing:'0.5px', fontWeight:600 }}>{m.label}</div>
                  <div style={{ fontSize:'26px', fontWeight:800, color:m.color, marginTop:'4px' }}>{m.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Overall progress bar */}
          {isProcessing && (
            <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                          borderRadius:'10px', padding:'16px', marginBottom:'16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px' }}>
                <span style={{ fontSize:'13px', fontWeight:700 }}>Processando cartões…</span>
                <span style={{ fontSize:'13px', color:'#4f8ef7', fontWeight:700 }}>{progress.percent}%</span>
              </div>
              <div style={{ background:'#0f1117', borderRadius:'4px', height:'8px', overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:'4px', background:'linear-gradient(90deg,#4f8ef7,#6c47ff)',
                              width:`${progress.percent}%`, transition:'width 0.3s' }} />
              </div>
              <div style={{ fontSize:'11px', color:'#8892a4', marginTop:'6px' }}>
                {progress.done} de {progress.total} cartões concluídos
                {progress.errors > 0 && ` · ${progress.errors} com erro`}
              </div>
            </div>
          )}

          {/* Drop zone */}
          {!isProcessing && (
            <div
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? '#4f8ef7' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: '12px', padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
                background: isDragging ? 'rgba(79,142,247,0.05)' : 'transparent',
                transition: 'all 0.2s', marginBottom: '16px',
              }}
            >
              <div style={{ fontSize:'48px', marginBottom:'12px' }}>📷</div>
              <div style={{ fontSize:'16px', fontWeight:700, marginBottom:'6px' }}>
                Arraste os cartões escaneados aqui
              </div>
              <div style={{ fontSize:'13px', color:'#8892a4', marginBottom:'16px' }}>
                Suporta JPG, PNG, TIFF · Scanner de alta resolução ou foto por celular
              </div>
              <div style={{ display:'flex', gap:'10px', justifyContent:'center' }}>
                <button style={{ padding:'9px 18px', borderRadius:'8px', background:'#4f8ef7',
                                 color:'#fff', border:'none', cursor:'pointer', fontSize:'13.5px',
                                 fontWeight:600 }}>
                  📂 Selecionar arquivos
                </button>
                <button style={{ padding:'9px 18px', borderRadius:'8px',
                                 background:'rgba(255,255,255,0.06)',
                                 color:'#e8eaf0', border:'1px solid rgba(255,255,255,0.12)',
                                 cursor:'pointer', fontSize:'13.5px', fontWeight:600 }}>
                  📷 Usar câmera
                </button>
              </div>
              <input ref={inputRef} type="file" multiple accept="image/*"
                     style={{ display:'none' }} onChange={onFileSelect} />
            </div>
          )}

          {/* Card queue table */}
          {cards.length > 0 && (
            <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                          borderRadius:'12px', overflow:'hidden' }}>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid rgba(255,255,255,0.07)',
                            display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontWeight:700, fontSize:'14px' }}>Fila de Processamento</span>
                <span style={{ fontSize:'12px', color:'#8892a4' }}>{cards.length} cartões</span>
              </div>
              <div style={{ maxHeight:'420px', overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
                      {['Arquivo','Aluno','Nota','% Acerto','Confiança','Status',''].map((h) => (
                        <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'11px',
                                             color:'#8892a4', textTransform:'uppercase',
                                             letterSpacing:'0.5px', fontWeight:600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map((card) => {
                      const meta = STATUS_META[card.status] ?? STATUS_META.pending;
                      return (
                        <tr key={card.id}
                          style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding:'11px 14px', color:'#8892a4', fontSize:'12px' }}>
                            {card.fileName ?? card.id.slice(0, 12) + '…'}
                          </td>
                          <td style={{ padding:'11px 14px', fontWeight:600 }}>
                            {card.studentName ?? <span style={{ color:'#4a5568' }}>—</span>}
                          </td>
                          <td style={{ padding:'11px 14px', fontWeight:800,
                                       color: card.totalScore >= 5 ? '#4ade80'
                                              : card.totalScore != null ? '#f87171' : '#4a5568' }}>
                            {card.totalScore?.toFixed(1) ?? '—'}
                          </td>
                          <td style={{ padding:'11px 14px', color:'#8892a4' }}>
                            {card.percentage != null ? `${card.percentage.toFixed(0)}%` : '—'}
                          </td>
                          <td style={{ padding:'11px 14px' }}>
                            {card.confidence != null ? (
                              <div>
                                <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                                  <div style={{ flex:1, background:'rgba(255,255,255,0.07)',
                                               borderRadius:'3px', height:'4px', width:'60px' }}>
                                    <div style={{ height:'100%', borderRadius:'3px',
                                                  width:`${card.confidence * 100}%`,
                                                  background: card.confidence > 0.8 ? '#4ade80'
                                                              : card.confidence > 0.6 ? '#fbbf24' : '#f87171' }} />
                                  </div>
                                  <span style={{ fontSize:'11px', color:'#8892a4' }}>
                                    {(card.confidence * 100).toFixed(0)}%
                                  </span>
                                </div>
                              </div>
                            ) : '—'}
                          </td>
                          <td style={{ padding:'11px 14px' }}>
                            <span style={{ padding:'3px 9px', borderRadius:'20px', fontSize:'11.5px',
                                           fontWeight:600, color:meta.color, background:meta.bg }}>
                              {card.status === 'processing' ? '⚙️ ' : ''}{meta.label}
                            </span>
                          </td>
                          <td style={{ padding:'11px 14px' }}>
                            {card.status === 'error' && (
                              <button style={{ fontSize:'12px', color:'#60a5fa', background:'none',
                                              border:'none', cursor:'pointer' }}>
                                ↺ Tentar novamente
                              </button>
                            )}
                            {card.status === 'manual_review' && (
                              <button style={{ fontSize:'12px', color:'#a78bfa', background:'none',
                                              border:'none', cursor:'pointer' }}>
                                ✏️ Revisar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — OMR config */}
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

          {/* Pipeline steps */}
          <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                        borderRadius:'12px', padding:'16px' }}>
            <div style={{ fontWeight:700, fontSize:'14px', marginBottom:'14px' }}>Pipeline OMR</div>
            {[
              { icon:'📁', title:'Upload e validação',      sub:'JPG/PNG/TIFF aceitos' },
              { icon:'🔧', title:'Pré-processamento',       sub:'Escala cinza · Denoise · Threshold' },
              { icon:'📐', title:'Correção de perspectiva', sub:'Homografia 4 pontos' },
              { icon:'📱', title:'Decodificação QR Code',   sub:'ID da prova e aluno' },
              { icon:'🔍', title:'Detecção de bolhas',      sub:'Threshold adaptativo por bolha' },
              { icon:'✅', title:'Correção automática',     sub:'Gabarito × marcações' },
              { icon:'📊', title:'Geração de relatório',    sub:'PDF + Excel por turma' },
            ].map((step, i) => (
              <div key={i} style={{ display:'flex', gap:'10px', marginBottom:'10px',
                                    alignItems:'flex-start' }}>
                <div style={{ width:'30px', height:'30px', borderRadius:'50%', flexShrink:0,
                              background:'rgba(79,142,247,0.1)', display:'flex',
                              alignItems:'center', justifyContent:'center', fontSize:'14px' }}>
                  {step.icon}
                </div>
                <div>
                  <div style={{ fontSize:'12.5px', fontWeight:600 }}>{step.title}</div>
                  <div style={{ fontSize:'11px', color:'#8892a4', marginTop:'1px' }}>{step.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Config */}
          <div style={{ background:'#1a2035', border:'1px solid rgba(255,255,255,0.07)',
                        borderRadius:'12px', padding:'16px' }}>
            <div style={{ fontWeight:700, fontSize:'14px', marginBottom:'14px' }}>⚙️ Configuração</div>

            <div style={{ marginBottom:'12px' }}>
              <label style={{ fontSize:'11px', color:'#8892a4', textTransform:'uppercase',
                              letterSpacing:'0.4px', fontWeight:600, display:'block', marginBottom:'5px' }}>
                Sensibilidade ({omrConfig.sensitivity}/10)
              </label>
              <input type="range" min="1" max="10" value={omrConfig.sensitivity}
                onChange={(e) => setOmrConfig((c) => ({ ...c, sensitivity: +e.target.value }))}
                style={{ width:'100%', accentColor:'#4f8ef7' }} />
            </div>

            <div style={{ marginBottom:'12px' }}>
              <label style={{ fontSize:'11px', color:'#8892a4', textTransform:'uppercase',
                              letterSpacing:'0.4px', fontWeight:600, display:'block', marginBottom:'5px' }}>
                Tolerância a Ruído
              </label>
              <select value={omrConfig.tolerance}
                onChange={(e) => setOmrConfig((c) => ({ ...c, tolerance: e.target.value }))}
                style={{ width:'100%', background:'#0f1117', border:'1px solid rgba(255,255,255,0.12)',
                         borderRadius:'8px', padding:'8px 10px', color:'#e8eaf0', fontSize:'13px' }}>
                <option value="low">Baixa (scanner HD)</option>
                <option value="medium">Média (foto smartphone)</option>
                <option value="high">Alta (imagens danificadas)</option>
              </select>
            </div>

            <div style={{ marginBottom:'12px' }}>
              <label style={{ fontSize:'11px', color:'#8892a4', textTransform:'uppercase',
                              letterSpacing:'0.4px', fontWeight:600, display:'block', marginBottom:'5px' }}>
                Correção de Perspectiva
              </label>
              <select value={omrConfig.perspective}
                onChange={(e) => setOmrConfig((c) => ({ ...c, perspective: e.target.value }))}
                style={{ width:'100%', background:'#0f1117', border:'1px solid rgba(255,255,255,0.12)',
                         borderRadius:'8px', padding:'8px 10px', color:'#e8eaf0', fontSize:'13px' }}>
                <option value="auto">Automática (recomendado)</option>
                <option value="manual">Manual</option>
                <option value="off">Desligada</option>
              </select>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {[
                { key:'detectMultiple', label:'Detectar múltiplas marcações' },
                { key:'ignoreNoise',    label:'Ignorar sujeiras (&lt;3px)' },
                { key:'antiFraud',      label:'Anti-fraude: detectar duplicatas' },
                { key:'useAI',          label:'IA para marcações ambíguas' },
              ].map(({ key, label }) => (
                <label key={key} style={{ display:'flex', alignItems:'center', gap:'8px',
                                          fontSize:'13px', cursor:'pointer' }}>
                  <input type="checkbox" checked={omrConfig[key]}
                    onChange={(e) => setOmrConfig((c) => ({ ...c, [key]: e.target.checked }))}
                    style={{ accentColor:'#4f8ef7' }} />
                  <span dangerouslySetInnerHTML={{ __html: label }} />
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
