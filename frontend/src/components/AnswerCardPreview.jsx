// src/components/AnswerCardPreview.jsx
export default function AnswerCardPreview({ examTitle, questions = [], cardConfig = {} }) {
  const mcQs  = questions.filter(q => q.type === 'multiple_choice');
  const ceQs  = questions.filter(q => q.type === 'true_false');
  const numQs = questions.filter(q => q.type === 'numeric');

  const sc = 0.5; // scale factor

  const px = (pt) => `${pt * sc}px`;

  const wrap = {
    background: '#fff',
    borderRadius: '6px',
    overflow: 'hidden',
    color: '#111',
    fontFamily: 'Arial, sans-serif',
    width: '360px',
    minWidth: '360px',
    maxWidth: '360px',
    boxSizing: 'border-box',
    boxShadow: '0 2px 16px rgba(0,0,0,0.3)',
    userSelect: 'none',
    fontSize: px(10),
  };

  const bubble = (label, filled, correct) => {
    let bg = '#fff', border = '#374151', color = '#374151';
    if (filled && correct)   { bg = '#16a34a'; border = '#16a34a'; color = '#fff'; }
    else if (filled)         { bg = '#1a1f35'; border = '#1a1f35'; color = '#fff'; }
    return (
      <div key={label} style={{
        width: px(11), height: px(11), borderRadius: '50%',
        border: `${px(1.2)} solid ${border}`, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: px(5.5), fontWeight: 700, color, flexShrink: 0,
      }}>{label}</div>
    );
  };

  const mcCols  = mcQs.length > 16 ? 3 : mcQs.length > 8 ? 2 : 1;
  const ceCols  = ceQs.length > 12 ? 3 : ceQs.length > 6 ? 2 : 1;

  return (
    <div style={wrap}>
      {/* Corners */}
      <div style={{display:'flex',justifyContent:'space-between',padding:`${px(4)} ${px(6)} 0`}}>
        <div style={{width:px(10),height:px(10),border:`${px(2)} solid #000`,borderRight:'none',borderBottom:'none'}} />
        <div style={{width:px(10),height:px(10),border:`${px(2)} solid #000`,borderLeft:'none',borderBottom:'none'}} />
      </div>

      {/* Header */}
      <div style={{background:'#1a1f35',color:'#fff',padding:`${px(8)} ${px(12)}`,
                   display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:px(7),opacity:0.6,textTransform:'uppercase',letterSpacing:'1px',fontWeight:700}}>
            Colégio — OMR·Pro
          </div>
          <div style={{fontSize:px(12),fontWeight:800,marginTop:px(2)}}>
            {(examTitle||'Nome da Prova').slice(0,40)}
          </div>
        </div>
        {/* QR placeholder */}
        {cardConfig.show_qr !== false && (
          <div style={{width:px(38),height:px(38),background:'#111',display:'grid',
                       gridTemplateColumns:'1fr 1fr 1fr',gap:px(1.5),padding:px(4),borderRadius:px(3)}}>
            {[1,0,1,0,1,0,1,0,0].map((d,i)=>(
              <div key={i} style={{borderRadius:px(1),background:d?'#fff':'transparent'}} />
            ))}
          </div>
        )}
      </div>

      {/* Fields */}
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',borderBottom:`${px(1.5)} solid #e5e7eb`}}>
        {[
          {show: cardConfig.show_name      !== false, label:'Nome do Aluno'},
          {show: cardConfig.show_enrollment!== false, label:'Matrícula'},
          {show: (cardConfig.show_class !== false || cardConfig.show_date !== false), label:'Turma / Data'},
        ].filter(f=>f.show).map((f,i)=>(
          <div key={i} style={{padding:`${px(6)} ${px(8)}`,borderRight:`${px(1)} solid #e5e7eb`}}>
            <div style={{fontSize:px(6.5),textTransform:'uppercase',letterSpacing:'0.8px',color:'#6b7280',fontWeight:700}}>{f.label}</div>
            <div style={{height:px(14),borderBottom:`${px(1.5)} solid #374151`,marginTop:px(2)}} />
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{padding:`${px(6)} ${px(10)}`}}>
        {questions.length === 0 && (
          <div style={{textAlign:'center',padding:px(16),color:'#9ca3af',fontSize:px(8)}}>
            Adicione questões para visualizar
          </div>
        )}

        {/* Multiple choice */}
        {mcQs.length > 0 && (
          <>
            <div style={{fontSize:px(6.5),textTransform:'uppercase',letterSpacing:'0.8px',
                         color:'#6b7280',fontWeight:700,margin:`${px(5)} 0 ${px(3)}`}}>
              Múltipla Escolha
            </div>
            <div style={{display:'grid',gridTemplateColumns:`repeat(${mcCols},1fr)`,gap:`${px(1)} ${px(8)}`}}>
              {mcQs.map(q=>(
                <div key={q.number} style={{display:'flex',alignItems:'center',gap:px(4),height:px(13)}}>
                  <span style={{fontSize:px(7),fontWeight:700,color:'#374151',minWidth:px(14),textAlign:'right'}}>
                    {q.number}
                  </span>
                  {['A','B','C','D'].map(opt=>bubble(opt,false,opt===q.correctAnswer))}
                </div>
              ))}
            </div>
          </>
        )}

        {/* True/False */}
        {ceQs.length > 0 && (
          <>
            <div style={{fontSize:px(6.5),textTransform:'uppercase',letterSpacing:'0.8px',
                         color:'#6b7280',fontWeight:700,margin:`${px(5)} 0 ${px(3)}`}}>
              Certo / Errado
            </div>
            <div style={{display:'grid',gridTemplateColumns:`repeat(${ceCols},1fr)`,gap:`${px(1)} ${px(8)}`}}>
              {ceQs.map(q=>(
                <div key={q.number} style={{display:'flex',alignItems:'center',gap:px(4),height:px(13)}}>
                  <span style={{fontSize:px(7),fontWeight:700,color:'#374151',minWidth:px(14),textAlign:'right'}}>
                    {q.number}
                  </span>
                  {['C','E'].map(opt=>bubble(opt,false,opt===q.correctAnswer))}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Numeric */}
        {numQs.length > 0 && (
          <>
            <div style={{fontSize:px(6.5),textTransform:'uppercase',letterSpacing:'0.8px',
                         color:'#6b7280',fontWeight:700,margin:`${px(5)} 0 ${px(3)}`}}>
              Questões Numéricas
            </div>
            <div style={{display:'flex',gap:px(10),flexWrap:'wrap'}}>
              {numQs.map(q=>(
                <div key={q.number} style={{display:'flex',gap:px(4),alignItems:'flex-start'}}>
                  <div style={{fontSize:px(7),fontWeight:700,color:'#374151',marginTop:px(8)}}>{q.number}</div>
                  {['C','D','U'].map((col,ci)=>(
                    <div key={col} style={{display:'flex',flexDirection:'column',gap:px(2),alignItems:'center'}}>
                      <div style={{fontSize:px(6),color:'#6b7280',fontWeight:700}}>{col}</div>
                      {[0,1,2,3,4,5,6,7,8,9].map(d=>(
                        <div key={d} style={{
                          width:px(10),height:px(10),borderRadius:'50%',
                          border:`${px(1)} solid #d1d5db`,
                          display:'flex',alignItems:'center',justifyContent:'center',
                          fontSize:px(5.5),color:'#374151',fontWeight:700,
                          background: String(d)===q.correctAnswer?.[ci]?'#1a1f35':'#fff',
                          color: String(d)===q.correctAnswer?.[ci]?'#fff':'#374151',
                        }}>{d}</div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer corners */}
      <div style={{display:'flex',justifyContent:'space-between',padding:`0 ${px(6)} ${px(4)}`}}>
        <div style={{width:px(10),height:px(10),border:`${px(2)} solid #000`,borderRight:'none',borderTop:'none'}} />
        <div style={{fontSize:px(6),color:'#9ca3af',alignSelf:'flex-end',paddingBottom:px(2)}}>OMR·Pro</div>
        <div style={{width:px(10),height:px(10),border:`${px(2)} solid #000`,borderLeft:'none',borderTop:'none'}} />
      </div>
    </div>
  );
}
