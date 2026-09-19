// src/pages/LoginPage.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const { login }  = useAuth();
  const navigate   = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error ?? 'Credenciais inválidas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const inp = {
    width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14,
    background: '#1e2638', border: '1px solid rgba(255,255,255,0.12)',
    color: '#e8eaf0', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  return (
    <div style={{ minHeight:'100vh', background:'#0f1117',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontFamily:'Segoe UI, system-ui, sans-serif' }}>

      {/* Background gradient circles */}
      <div style={{ position:'fixed', top:'-20%', left:'-10%', width:600, height:600,
                    borderRadius:'50%', background:'radial-gradient(circle, rgba(79,142,247,0.08) 0%, transparent 70%)',
                    pointerEvents:'none' }} />
      <div style={{ position:'fixed', bottom:'-20%', right:'-10%', width:500, height:500,
                    borderRadius:'50%', background:'radial-gradient(circle, rgba(108,71,255,0.06) 0%, transparent 70%)',
                    pointerEvents:'none' }} />

      <div style={{ width:400, background:'#1a2035',
                    border:'1px solid rgba(255,255,255,0.07)',
                    borderRadius:16, padding:'40px 36px',
                    boxShadow:'0 24px 64px rgba(0,0,0,0.5)',
                    position:'relative', zIndex:1 }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:56, height:56, borderRadius:14,
                        background:'linear-gradient(135deg,#4f8ef7,#6c47ff)',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:26, margin:'0 auto 14px' }}>
            📋
          </div>
          <div style={{ fontSize:24, fontWeight:800, color:'#e8eaf0' }}>OMR·Pro</div>
          <div style={{ fontSize:13, color:'#8892a4', marginTop:4 }}>
            Sistema de Correção Automática de Provas
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:11, color:'#8892a4', fontWeight:600,
                            display:'block', marginBottom:5,
                            textTransform:'uppercase', letterSpacing:'0.5px' }}>
              E-mail
            </label>
            <input style={inp} type="email" value={email} autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com" required />
          </div>

          <div style={{ marginBottom:24 }}>
            <label style={{ fontSize:11, color:'#8892a4', fontWeight:600,
                            display:'block', marginBottom:5,
                            textTransform:'uppercase', letterSpacing:'0.5px' }}>
              Senha
            </label>
            <input style={inp} type="password" value={password} autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" required />
          </div>

          {error && (
            <div style={{ background:'rgba(239,68,68,0.1)', color:'#f87171',
                          padding:'10px 14px', borderRadius:8, fontSize:13,
                          marginBottom:16, border:'1px solid rgba(239,68,68,0.2)' }}>
              ⚠️ {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{ width:'100%', padding:12, borderRadius:9,
                     background: loading ? 'rgba(79,142,247,0.5)' : '#4f8ef7',
                     color:'#fff', border:'none', cursor: loading ? 'not-allowed' : 'pointer',
                     fontSize:15, fontWeight:700, transition:'background 0.2s',
                     fontFamily:'inherit' }}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <div style={{ marginTop:20, textAlign:'center', fontSize:12, color:'#4a5568' }}>
          Problemas para acessar? Contate o administrador da escola.
        </div>

        {/* Demo hint */}
        <div style={{ marginTop:16, padding:'10px 14px', background:'rgba(79,142,247,0.06)',
                      border:'1px solid rgba(79,142,247,0.12)', borderRadius:8,
                      fontSize:12, color:'#8892a4', textAlign:'center' }}>
          🧪 Demo: <strong style={{ color:'#60a5fa' }}>admin@escola.com</strong>
          {' / '}
          <strong style={{ color:'#60a5fa' }}>Admin@2025</strong>
        </div>
      </div>
    </div>
  );
}
