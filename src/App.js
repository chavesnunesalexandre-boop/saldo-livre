import { useState, useEffect, useRef } from "react";
import { db, auth } from "./firebase";
import { collection, doc, onSnapshot, setDoc, deleteDoc, getDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { Html5Qrcode } from "html5-qrcode";

// ─── Constantes ───────────────────────────────────────────────────────────────
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const HOJE = new Date();
const FORMAS_PAG = ["💳 Crédito","📱 Pix","🏦 Débito","🔄 Déb. Automático","📄 Boleto","💵 Dinheiro","📤 TED/DOC"];
const CONTAS_LISTA = ["C6","Inter","Caixa","XP","Santander"];
const CARTOES_LISTA = ["C6","XP","Nubank","Inter","Outro"];
// Membros agora vêm do Firebase: familias/{familyCode}/membros — sem lista fixa.
const TIPOS_INVEST = ["Renda Fixa","Ações","FII","Previdência","Outros"];
const TIPOS_DEDUCAO_IR = ["Saúde/Médico","Educação","Previdência Privada","Doação","Outro"];

const CATS_RECEITA = [
  {id:"salario",     label:"Salário",              icon:"💰", color:"#10b981"},
  {id:"aluguel_rec", label:"Aluguel Recebido",      icon:"🏢", color:"#34d399"},
  {id:"reembolso",   label:"Reembolso de Despesas", icon:"↩️", color:"#6ee7b7"},
  {id:"investimento",label:"Rendimento Investimento",icon:"📈", color:"#059669"},
  {id:"outras_rec",  label:"Outras Receitas",       icon:"💡", color:"#a7f3d0"},
];
const CATS_DESPESA = [
  {id:"alimentacao_r",  label:"Alimentação Regular",    icon:"🍽️", color:"#10b981"},
  {id:"alimentacao_nr", label:"Alimentação Não Regular", icon:"🍕", color:"#34d399"},
  {id:"saude",          label:"Saúde",                   icon:"🏥", color:"#e879f9"},
  {id:"medicamento",    label:"Medicamento",             icon:"💊", color:"#f472b6"},
  {id:"educacao",       label:"Educação",                icon:"📚", color:"#a78bfa"},
  {id:"moradia",        label:"Moradia",                 icon:"🏠", color:"#fde68a"},
  {id:"transporte",     label:"Transporte",              icon:"🚗", color:"#fbbf24"},
  {id:"veiculo",        label:"Manutenção Veículo",      icon:"🔧", color:"#fb923c"},
  {id:"assinatura",     label:"Assinatura",              icon:"📱", color:"#60a5fa"},
  {id:"limpeza",        label:"Limpeza",                 icon:"🧹", color:"#94a3b8"},
  {id:"higiene",        label:"Higiene Pessoal",         icon:"🧴", color:"#7dd3fc"},
  {id:"vestuario",      label:"Vestuário",               icon:"👕", color:"#f9a8d4"},
  {id:"lazer",          label:"Lazer",                   icon:"🎬", color:"#86efac"},
  {id:"tecnologia",     label:"Tecnologia",              icon:"💻", color:"#67e8f9"},
  {id:"papelaria",      label:"Papelaria",               icon:"📝", color:"#d8b4fe"},
  {id:"dizimo",         label:"Dízimo/Oferta",           icon:"🙏", color:"#f59e0b"},
  {id:"aporte",         label:"Aporte/Investimento",     icon:"📈", color:"#3b82f6"},
  {id:"outras",         label:"Outras",                  icon:"📦", color:"#6e7681"},
];
const TODAS_CATS = [...CATS_RECEITA,...CATS_DESPESA];
const getCat = (id,extra=[]) => [...TODAS_CATS,...extra].find(c=>c.id===id)||{label:"—",icon:"•",color:"#6e7681"};

const fmt = n => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(+n||0);
const fmtDate = d => d ? new Date(d+"T00:00:00").toLocaleDateString("pt-BR") : "";
const addM = (m,a,n=1) => { let nm=m+n; return {mes:((nm%12)+12)%12, ano:a+Math.floor(nm/12+(nm<0&&nm%12!==0?1:0))}; };
const todayStr = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const famPath = (fc,col) => `familias/${fc}/${col}`;
const cmpMonth = (m1,a1,m2,a2) => a1*12+m1-(a2*12+m2);

// ─── Cadastro Base ────────────────────────────────────────────────────────────
const BASE_TIPOS = {
  receita_fixa:   {label:"Receita Fixa",     icon:"💰", color:"#10b981", lancTipo:"entrada"},
  despesa_fixa:   {label:"Despesa Fixa",     icon:"📌", color:"#ef4444", lancTipo:"saida"},
  prevista:       {label:"Despesa Prevista", icon:"◷",  color:"#a855f7", lancTipo:"saida"},
  parcela_cartao: {label:"Parcela Cartão",   icon:"💳", color:"#f97316", lancTipo:"cartao"},
};

// Gera os pré-lançamentos (pendentes) do mês a partir do Cadastro Base.
// - receita_fixa / despesa_fixa: pendente todo mês enquanto ativo (some ao confirmar via _baseId)
// - prevista: pendente a partir do mês de início; baixa automática conforme gastos confirmados da categoria
// - parcela_cartao: pendente nos meses corretos até a última parcela
function getMonthView(baseItems, lancs, mes, ano, gastosPorCat){
  const jaConfirmado=(biId)=>lancs.some(l=>l._baseId===biId&&l.status==="confirmado"&&(
    l.tipo==="cartao" ? (l.mesFatura===mes&&l.anoFatura===ano) : (l.mes===mes&&l.ano===ano)
  ));
  const pend=[];
  baseItems.forEach(bi=>{
    if(bi.ativo===false) return;
    if(bi.tipo==="receita_fixa"||bi.tipo==="despesa_fixa"){
      if(jaConfirmado(bi.id)) return;
      pend.push({_baseId:bi.id, baseTipo:bi.tipo, desc:bi.desc, valorPrevisto:+bi.valorPrevisto||0, catId:bi.catId, membro:bi.membro});
    } else if(bi.tipo==="prevista"){
      if(cmpMonth(mes,ano,bi.mesInicio||0,bi.anoInicio||ano)<0) return;
      const gasto=bi.catId?(gastosPorCat[bi.catId]||0):0;
      const restante=Math.max(0,(+bi.valorPrevisto||0)-gasto);
      if(restante<=0) return; // coberta — baixa automática
      pend.push({_baseId:bi.id, baseTipo:"prevista", desc:bi.desc, valorPrevisto:restante, valorOriginal:+bi.valorPrevisto||0, gasto, catId:bi.catId, membro:bi.membro});
    } else if(bi.tipo==="parcela_cartao"){
      const offset=cmpMonth(mes,ano,bi.mesFatura??mes,bi.anoFatura??ano);
      const num=(+bi.parcelaAtual||1)+offset;
      if(offset<0||num>(+bi.parcelas||1)) return;
      if(jaConfirmado(bi.id)) return;
      pend.push({_baseId:bi.id, baseTipo:"parcela_cartao", desc:`${bi.desc} (${num}/${bi.parcelas})`, valorPrevisto:+bi.valorPrevisto||0, catId:bi.catId, membro:bi.membro, cartao:bi.cartao, parcelaNum:num});
    }
  });
  return pend;
}

// ─── Estilos base ─────────────────────────────────────────────────────────────
const PURPLE = "#6c63ff";
const S = {
  inp: {background:"#f8f9ff",border:"1.5px solid #e0e0f0",borderRadius:10,padding:"10px 14px",color:"#1f2937",fontSize:13,fontFamily:"inherit",width:"100%",outline:"none"},
  btn: (bg,c="#fff")=>({background:bg,color:c,border:"none",borderRadius:12,padding:"11px 18px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}),
};

// ─── Componentes UI ───────────────────────────────────────────────────────────
function Toast({msg,ok}){
  return <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:ok?"#065f46":"#7f1d1d",color:"#fff",borderRadius:12,padding:"10px 20px",fontSize:13,fontWeight:700,boxShadow:"0 4px 20px rgba(0,0,0,0.2)",whiteSpace:"nowrap"}}>{msg}</div>;
}

function Modal({title,children,onClose,maxW=520}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:500,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:"0 0 0 0"}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:"24px 24px 0 0",padding:"24px 20px 32px",width:"100%",maxWidth:maxW,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 -8px 40px rgba(0,0,0,0.15)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:16,fontWeight:800,color:"#1f2937"}}>{title}</div>
          <button onClick={onClose} style={{background:"#f3f4f6",border:"none",borderRadius:50,width:32,height:32,cursor:"pointer",fontSize:16,color:"#6b7280",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({label,children,half}){
  return(
    <div style={{marginBottom:12,flex:half?"1":undefined}}>
      <label style={{fontSize:11,color:"#6b7280",display:"block",marginBottom:4,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}</label>
      {children}
    </div>
  );
}

function CatTag({catId,extra=[]}){
  const c=getCat(catId,extra);
  return <span style={{background:c.color+"20",color:c.color,borderRadius:20,padding:"2px 8px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{c.icon} {c.label}</span>;
}

function ChipSelect({options,value,onChange}){
  return(
    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
      {options.map(o=>(
        <button key={o} onClick={()=>onChange(o)} type="button" style={{padding:"6px 12px",borderRadius:20,border:`1.5px solid ${value===o?PURPLE:"#e0e0f0"}`,background:value===o?PURPLE:"#fff",color:value===o?"#fff":"#374151",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
          {o}
        </button>
      ))}
    </div>
  );
}

// ─── Tela de Login ────────────────────────────────────────────────────────────
function LoginScreen({onLogin,existingUser}){
  const [modo,setModo]=useState("entrar");
  const [user,setUser]=useState(existingUser||null);
  const [email,setEmail]=useState("");
  const [senha,setSenha]=useState("");
  const [code,setCode]=useState("");
  const [modoFam,setModoFam]=useState("entrar");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  useEffect(()=>{ if(existingUser){setUser(existingUser);setModo("familia");} },[existingUser]);

  const handleAuth=async()=>{
    if(!email.trim()||!senha){setErr("Preencha email e senha.");return;}
    setLoading(true);setErr("");
    try{
      const r=modo==="criar"
        ? await createUserWithEmailAndPassword(auth,email.trim(),senha)
        : await signInWithEmailAndPassword(auth,email.trim(),senha);
      setUser(r.user);setModo("familia");
    }catch(e){
      const msgs={"auth/email-already-in-use":"Email já cadastrado.","auth/wrong-password":"Senha incorreta.","auth/user-not-found":"Email não encontrado.","auth/weak-password":"Senha fraca (mín. 6 caracteres).","auth/invalid-email":"Email inválido.","auth/invalid-credential":"Email ou senha incorretos."};
      setErr(msgs[e.code]||"Erro: "+e.code);
    }
    setLoading(false);
  };

  const handleFamilia=async()=>{
    const c=code.trim().toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"");
    if(!c){setErr("Digite um código válido.");return;}
    setLoading(true);setErr("");
    try{
      const ref=doc(db,"familias",c);
      const snap=await getDoc(ref);
      if(modoFam==="criar"){
        if(snap.exists()){setErr("Código já existe. Escolha outro.");setLoading(false);return;}
        await setDoc(ref,{criadoEm:Date.now(),criadoPor:user.uid});
      } else {
        if(!snap.exists()){setErr("Código não encontrado.");setLoading(false);return;}
      }
      localStorage.setItem("sl2_family",c);
      onLogin(user,c);
    }catch(e){setErr("Erro ao acessar.");}
    setLoading(false);
  };

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#6c63ff 0%,#a78bfa 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;margin:0;padding:0}input{outline:none;font-family:inherit}`}</style>
      <div style={{background:"#fff",borderRadius:24,padding:"36px 28px",width:"100%",maxWidth:380,boxShadow:"0 24px 80px rgba(0,0,0,0.2)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:48,marginBottom:8}}>💚</div>
          <div style={{fontSize:26,fontWeight:900,color:"#1f2937",letterSpacing:"-0.5px"}}>Saldo Livre</div>
          <div style={{fontSize:13,color:"#6b7280",marginTop:4}}>Controle Financeiro Familiar</div>
        </div>

        {modo!=="familia"&&(
          <>
            <div style={{display:"flex",gap:6,marginBottom:20,background:"#f3f4f6",borderRadius:12,padding:4}}>
              {[["entrar","Entrar"],["criar","Criar conta"]].map(([k,l])=>(
                <button key={k} onClick={()=>{setModo(k);setErr("");}} style={{flex:1,padding:"9px 0",borderRadius:9,border:"none",fontFamily:"inherit",fontWeight:700,fontSize:13,cursor:"pointer",background:modo===k?"#fff":"transparent",color:modo===k?"#1f2937":"#6b7280",boxShadow:modo===k?"0 2px 8px rgba(0,0,0,0.08)":"none",transition:"all .15s"}}>
                  {l}
                </button>
              ))}
            </div>
            <Field label="Email"><input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="seu@email.com" style={S.inp} onKeyDown={e=>e.key==="Enter"&&handleAuth()}/></Field>
            <Field label="Senha"><input value={senha} onChange={e=>setSenha(e.target.value)} type="password" placeholder={modo==="criar"?"Mínimo 6 caracteres":"Sua senha"} style={S.inp} onKeyDown={e=>e.key==="Enter"&&handleAuth()}/></Field>
            {err&&<div style={{fontSize:12,color:"#ef4444",marginTop:8,background:"#fef2f2",borderRadius:8,padding:"8px 12px"}}>{err}</div>}
            <button onClick={handleAuth} disabled={loading} style={{...S.btn(`linear-gradient(135deg,${PURPLE},#a78bfa)`),width:"100%",marginTop:16,padding:"13px 0",fontSize:14,opacity:loading?.7:1}}>
              {loading?"Aguarde...":(modo==="criar"?"Criar conta":"Entrar")}
            </button>
          </>
        )}

        {modo==="familia"&&(
          <>
            <div style={{background:"#f0fdf4",borderRadius:10,padding:"10px 14px",marginBottom:18,fontSize:13,color:"#065f46",fontWeight:600}}>
              ✓ {user?.email}
            </div>
            <div style={{display:"flex",gap:6,marginBottom:16,background:"#f3f4f6",borderRadius:12,padding:4}}>
              {[["entrar","Entrar na família"],["criar","Criar família"]].map(([k,l])=>(
                <button key={k} onClick={()=>{setModoFam(k);setErr("");}} style={{flex:1,padding:"9px 0",borderRadius:9,border:"none",fontFamily:"inherit",fontWeight:700,fontSize:12,cursor:"pointer",background:modoFam===k?"#fff":"transparent",color:modoFam===k?"#1f2937":"#6b7280",boxShadow:modoFam===k?"0 2px 8px rgba(0,0,0,0.08)":"none"}}>
                  {l}
                </button>
              ))}
            </div>
            <Field label={modoFam==="criar"?"Crie um código para sua família":"Código da família"}>
              <input value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleFamilia()} placeholder={modoFam==="criar"?"Ex: familia-nunes-2026":"Código fornecido pelo responsável"} style={S.inp}/>
            </Field>
            {err&&<div style={{fontSize:12,color:"#ef4444",marginTop:8,background:"#fef2f2",borderRadius:8,padding:"8px 12px"}}>{err}</div>}
            <button onClick={handleFamilia} disabled={loading} style={{...S.btn(`linear-gradient(135deg,${PURPLE},#a78bfa)`),width:"100%",marginTop:16,padding:"13px 0",opacity:loading?.7:1}}>
              {loading?"Aguarde...":(modoFam==="criar"?"Criar família":"Entrar")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Onboarding ───────────────────────────────────────────────────────────────
function OnboardingScreen({familyCode,onConcluir}){
  const fp=col=>famPath(familyCode,col);
  const CORES={"C6":"#ef4444","Inter":"#f97316","Caixa":"#3b82f6","XP":"#10b981","Santander":"#8b5cf6"};
  const [saldos,setSaldos]=useState({"C6":"","Inter":"","Caixa":"","XP":"","Santander":""});
  const [membros,setMembros]=useState([]);
  const [novoMembro,setNovoMembro]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);

  const addMembro=()=>{
    const n=novoMembro.trim(); if(!n) return;
    if(membros.some(m=>m.nome.toLowerCase()===n.toLowerCase())){ setErr("Membro já adicionado."); return; }
    setMembros(p=>[...p,{id:String(Date.now()),nome:n}]); setNovoMembro(""); setErr("");
  };
  const remMembro=(id)=>setMembros(p=>p.filter(m=>m.id!==id));

  const handleConcluir=async()=>{
    if(membros.length===0){ setErr("Adicione pelo menos 1 membro da família."); return; }
    setLoading(true);
    for(const m of membros){ await setDoc(doc(db,fp("membros"),m.id),{id:m.id,nome:m.nome}); }
    for(const [id,saldo] of Object.entries(saldos)){
      if(saldo!==""){
        await setDoc(doc(db,fp("contas"),id),{id,saldo:+saldo},{merge:true});
      }
    }
    // Marca onboarding como concluído
    await setDoc(doc(db,`familias/${familyCode}`),{onboardingConcluido:true},{merge:true});
    setLoading(false);
    onConcluir();
  };

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#6c63ff 0%,#a78bfa 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <div style={{background:"#fff",borderRadius:24,padding:"32px 24px",width:"100%",maxWidth:400,boxShadow:"0 24px 80px rgba(0,0,0,0.2)"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:40,marginBottom:8}}>👋</div>
          <div style={{fontSize:22,fontWeight:900,color:"#1f2937",letterSpacing:"-0.5px"}}>Bem-vindo!</div>
          <div style={{fontSize:13,color:"#6b7280",marginTop:6,lineHeight:1.5}}>Vamos configurar sua família.</div>
        </div>

        {/* Membros */}
        <div style={{marginBottom:18}}>
          <label style={{fontSize:11,color:"#6b7280",display:"block",marginBottom:8,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>👥 Membros da família</label>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <input value={novoMembro} onChange={e=>setNovoMembro(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addMembro()} placeholder="Nome (ex: Alexandre)" style={S.inp}/>
            <button type="button" onClick={addMembro} style={{...S.btn(`linear-gradient(135deg,${PURPLE},#a78bfa)`),padding:"0 18px",fontSize:18,flexShrink:0}}>+</button>
          </div>
          {membros.length===0
            ? <div style={{fontSize:12,color:"#9ca3af",padding:"2px 0 0 2px"}}>Adicione pelo menos 1 membro.</div>
            : membros.map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,background:"#f8f9ff",border:"1.5px solid #e0e0f0",borderRadius:10,padding:"8px 12px",marginBottom:6}}>
                <span style={{flex:1,fontSize:13,fontWeight:700,color:"#1f2937"}}>👤 {m.nome}</span>
                <button type="button" onClick={()=>remMembro(m.id)} style={{background:"#fef2f2",border:"none",borderRadius:8,color:"#ef4444",padding:"4px 8px",cursor:"pointer",fontSize:11}}>✕</button>
              </div>
            ))
          }
        </div>

        <div style={{height:1,background:"#f0f0f5",margin:"4px 0 16px"}}/>
        <div style={{fontSize:13,fontWeight:800,color:"#374151",marginBottom:12}}>🏦 Saldo inicial das contas <span style={{fontWeight:600,color:"#9ca3af"}}>(opcional)</span></div>

        {CONTAS_LISTA.map(id=>{
          const cor=CORES[id]||PURPLE;
          return(
            <div key={id} style={{marginBottom:12}}>
              <label style={{fontSize:11,color:"#6b7280",display:"block",marginBottom:4,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>
                <span style={{color:cor}}>●</span> {id}
              </label>
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:13,color:"#9ca3af",fontWeight:600}}>R$</span>
                <input
                  type="number"
                  value={saldos[id]}
                  onChange={e=>setSaldos(p=>({...p,[id]:e.target.value}))}
                  placeholder="0,00"
                  style={{...S.inp,paddingLeft:36,borderColor:saldos[id]?cor:"#e0e0f0"}}
                />
              </div>
            </div>
          );
        })}

        {err&&<div style={{fontSize:12,color:"#ef4444",marginTop:6,marginBottom:4,background:"#fef2f2",borderRadius:8,padding:"8px 12px"}}>{err}</div>}
        <button onClick={handleConcluir} disabled={loading} style={{...S.btn(`linear-gradient(135deg,${PURPLE},#a78bfa)`),width:"100%",padding:"13px 0",fontSize:14,marginTop:8,opacity:loading?.7:1}}>
          {loading?"Salvando...":"✓ Começar a usar"}
        </button>
        <button onClick={handleConcluir} disabled={loading} style={{width:"100%",background:"none",border:"none",color:"#9ca3af",fontSize:13,fontWeight:600,marginTop:10,cursor:"pointer",padding:"8px 0"}}>
          Pular saldos (membros obrigatórios) →
        </button>
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App(){
  const [user,setUser]=useState(null);
  const [familyCode,setFamilyCode]=useState(()=>localStorage.getItem("sl2_family")||null);
  const [authReady,setAuthReady]=useState(false);
  const [onboarding,setOnboarding]=useState(false);

  useEffect(()=>{
    return onAuthStateChanged(auth,u=>{
      setUser(u);setAuthReady(true);
      if(!u){setFamilyCode(null);localStorage.removeItem("sl2_family");}
    });
  },[]);

  const handleLogin=async(u,c)=>{
    setUser(u);setFamilyCode(c);
    // Verifica se é família nova (sem onboarding concluído)
    const snap=await getDoc(doc(db,`familias/${c}`));
    if(snap.exists()&&!snap.data().onboardingConcluido){
      setOnboarding(true);
    }
  };
  const handleLogout=async()=>{await signOut(auth);setFamilyCode(null);localStorage.removeItem("sl2_family");setOnboarding(false);};

  if(!authReady) return <div style={{background:"linear-gradient(135deg,#6c63ff,#a78bfa)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:"Inter,sans-serif",fontSize:16,fontWeight:700}}>💚 Carregando...</div>;
  if(!user||!familyCode) return <LoginScreen onLogin={handleLogin} existingUser={user}/>;
  if(onboarding) return <OnboardingScreen familyCode={familyCode} onConcluir={()=>setOnboarding(false)}/>;
  return <MainApp familyCode={familyCode} user={user} onLogout={handleLogout}/>;
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function MainApp({familyCode,user,onLogout}){
  const [tab,setTab]=useState("inicio");
  const [viewMes,setViewMes]=useState(HOJE.getMonth());
  const [viewAno,setViewAno]=useState(HOJE.getFullYear());
  const [lancs,setLancs]=useState([]);
  const [baseItems,setBaseItems]=useState([]);
  const [customCats,setCustomCats]=useState([]);
  const [contas,setContas]=useState([]);
  const [investimentos,setInvestimentos]=useState([]);
  const [membros,setMembros]=useState([]);
  const [config,setConfig]=useState({});
  const [analises,setAnalises]=useState([]);
  const [consultorOpen,setConsultorOpen]=useState(false);
  const [consultorLoading,setConsultorLoading]=useState(false);
  const [consultorErro,setConsultorErro]=useState("");
  const [badgeVisto,setBadgeVisto]=useState(false);
  const autoRan=useRef(false);
  const [loading,setLoading]=useState(true);
  const [toast,setToast]=useState(null);
  const [modal,setModal]=useState(null); // {tipo, data}

  const fp=col=>famPath(familyCode,col);
  const toast2=(msg,ok=true)=>{setToast({msg,ok});setTimeout(()=>setToast(null),2600);};
  const nomesMembros=membros.map(m=>m.nome).filter(Boolean);
  const diaFechamento=+config.diaFechamento||31;
  const vencimentos=config.vencimentos||{};

  useEffect(()=>{
    const fp=col=>famPath(familyCode,col);
    const unsubs=[
      onSnapshot(collection(db,fp("lancamentos")),s=>setLancs(s.docs.map(d=>({id:d.id,...d.data()})))),
      onSnapshot(collection(db,fp("baseItems")),s=>setBaseItems(s.docs.map(d=>({id:d.id,...d.data()})))),
      onSnapshot(collection(db,fp("categorias")),s=>setCustomCats(s.docs.map(d=>({id:d.id,...d.data()})))),
      onSnapshot(collection(db,fp("contas")),s=>setContas(s.docs.map(d=>({id:d.id,...d.data()})))),
      onSnapshot(collection(db,fp("investimentos")),s=>setInvestimentos(s.docs.map(d=>({id:d.id,...d.data()})))),
      onSnapshot(collection(db,fp("membros")),s=>setMembros(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.nome||"").localeCompare(b.nome||"")))),
      onSnapshot(doc(db,"familias",familyCode),s=>setConfig(s.data()||{})),
      onSnapshot(collection(db,fp("analises")),s=>setAnalises(s.docs.map(d=>({id:d.id,...d.data()})))),
    ];
    setLoading(false);
    return()=>unsubs.forEach(u=>u());
  },[familyCode]);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const saveLanc=async(data)=>{
    const {id,...rest}=data;
    const entry={...rest,valor:+rest.valor||0,updatedAt:Date.now()};
    await setDoc(doc(db,fp("lancamentos"),id||String(Date.now())),entry);
    toast2(id?"Atualizado!":"Lançamento salvo!"); setModal(null);
  };
  const deleteLanc=async(id)=>{await deleteDoc(doc(db,fp("lancamentos"),String(id)));toast2("Removido.");};
  const importNFe=async(items)=>{
    const base=Date.now();
    await Promise.all(items.map((it,i)=>setDoc(doc(db,fp("lancamentos"),String(base+i)),{
      tipo:"saida", desc:it.nome, valor:+it.valor||0, catId:it.catId||"alimentacao_nr",
      formaPag:"💳 Crédito", contaId:"", membro:nomesMembros[0]||"", mes:viewMes, ano:viewAno,
      data:todayStr(), status:"confirmado", origem:"nfe", updatedAt:base+i
    })));
    toast2(`${items.length} lançamento(s) importado(s)!`); setModal(null);
  };
  const saveBase=async(data)=>{
    const {id,...rest}=data;
    await setDoc(doc(db,fp("baseItems"),id||String(Date.now())),{...rest,valorPrevisto:+rest.valorPrevisto||0,ativo:rest.ativo!==false});
    toast2(id?"Atualizado!":"Cadastrado!"); setModal(null);
  };
  const deleteBase=async(id)=>{await deleteDoc(doc(db,fp("baseItems"),String(id)));toast2("Removido.");};
  const saveMembro=async(nome)=>{
    const n=(nome||"").trim(); if(!n) return;
    if(membros.some(m=>(m.nome||"").toLowerCase()===n.toLowerCase())){ toast2("Membro já existe.",false); return; }
    const id=String(Date.now());
    await setDoc(doc(db,fp("membros"),id),{id,nome:n});
    toast2("Membro adicionado!");
  };
  const deleteMembro=async(id)=>{await deleteDoc(doc(db,fp("membros"),String(id)));toast2("Membro removido.");};
  const saveConfigFin=async(patch)=>{ await setDoc(doc(db,`familias/${familyCode}`),patch,{merge:true}); toast2("Configurações salvas!"); };
  const confirmarPendente=async(p,valorReal)=>{
    const tm=BASE_TIPOS[p.baseTipo]||BASE_TIPOS.despesa_fixa;
    const entry={
      tipo:tm.lancTipo, desc:p.desc, valor:+valorReal||0, catId:p.catId||"",
      membro:p.membro||nomesMembros[0]||"", status:"confirmado", _baseId:p._baseId,
      mes:viewMes, ano:viewAno, data:todayStr(), updatedAt:Date.now(),
    };
    if(tm.lancTipo==="cartao"){ entry.cartao=p.cartao||CARTOES_LISTA[0]; entry.mesFatura=viewMes; entry.anoFatura=viewAno; entry.parcelas=1; }
    await setDoc(doc(db,fp("lancamentos"),String(Date.now())),entry);
    toast2("Confirmado!"); setModal(null);
  };
  const saveContaSaldo=async(contaId,saldo)=>{
    const valor=Number(saldo);
    if(!Number.isFinite(valor)) return;
    await setDoc(doc(db,fp("contas"),contaId),{id:contaId,saldo:valor,updatedAt:Date.now()},{merge:true});
    toast2(`Saldo de ${contaId} salvo!`);
  };
  const saveTransferencia=async(data)=>{
    const id=String(Date.now());
    const {contaOrigem,contaDestino,valor,desc,data:dt,mes,ano}=data;
    // Saída da conta origem
    await setDoc(doc(db,fp("lancamentos"),id+"_s"),{tipo:"saida",desc:desc||`Transferência → ${contaDestino}`,valor:+valor,contaId:contaOrigem,formaPag:"TED/DOC",catId:"outras",mes:+mes,ano:+ano,data:dt,membro:nomesMembros[0]||"",status:"confirmado",updatedAt:Date.now()});
    // Entrada na conta destino
    await setDoc(doc(db,fp("lancamentos"),id+"_e"),{tipo:"entrada",desc:desc||`Transferência ← ${contaOrigem}`,valor:+valor,contaId:contaDestino,formaPag:"TED/DOC",catId:"outras_rec",mes:+mes,ano:+ano,data:dt,membro:nomesMembros[0]||"",status:"confirmado",updatedAt:Date.now()});
    // Atualiza saldos
    const co=contas.find(c=>c.id===contaOrigem);
    const cd=contas.find(c=>c.id===contaDestino);
    if(co) await saveContaSaldo(contaOrigem,(+co.saldo||0)-(+valor));
    if(cd) await saveContaSaldo(contaDestino,(+cd.saldo||0)+(+valor));
    toast2("Transferência registrada!"); setModal(null);
  };
  const saveInvest=async(data)=>{
    const {id,...rest}=data;
    await setDoc(doc(db,fp("investimentos"),id||String(Date.now())),{...rest,valor:+rest.valor||0});
    toast2(id?"Atualizado!":"Investimento salvo!"); setModal(null);
  };
  const deleteInvest=async(id)=>{await deleteDoc(doc(db,fp("investimentos"),String(id)));toast2("Removido.");};

  // ── Cálculos ───────────────────────────────────────────────────────────────
  const allCats=[...TODAS_CATS,...customCats];
  const lancsDoMes=lancs.filter(l=>l.mes===viewMes&&l.ano===viewAno);
  const confirmados=lancsDoMes.filter(l=>l.status==="confirmado");

  // Gastos por categoria (para abate de previstas)
  const gastosPorCat={};
  confirmados.forEach(l=>{
    if(l.tipo==="saida"||l.tipo==="cartao"){
      if(l.splits&&l.splits.length>0) l.splits.forEach(s=>{ if(s.catId) gastosPorCat[s.catId]=(gastosPorCat[s.catId]||0)+(+s.valor||0); });
      else if(l.catId) gastosPorCat[l.catId]=(gastosPorCat[l.catId]||0)+(+l.valor||0);
    }
  });

  // Pré-lançamentos do mês (Cadastro Base)
  const pendentes=getMonthView(baseItems,lancs,viewMes,viewAno,gastosPorCat);
  const previstasPendentes=pendentes.filter(p=>p.baseTipo==="prevista").map(p=>({id:p._baseId,desc:p.desc,valorPrevisto:p.valorOriginal,restante:p.valorPrevisto}));

  const totalEntradas=confirmados.filter(l=>l.tipo==="entrada").reduce((s,l)=>s+(+l.valor||0),0);
  const totalSaidas=confirmados.filter(l=>l.tipo==="saida").reduce((s,l)=>s+(+l.valor||0),0);
  const totalCartao=lancs.filter(l=>l.tipo==="cartao"&&l.mesFatura===viewMes&&l.anoFatura===viewAno).reduce((s,l)=>s+(+l.valor||0),0);
  const totalDizimo=confirmados.filter(l=>l.catId==="dizimo").reduce((s,l)=>s+(+l.valor||0),0);
  const totalPrevistas=previstasPendentes.reduce((s,p)=>s+p.restante,0);
  const totalContas=CONTAS_LISTA.reduce((s,c)=>{const ct=contas.find(x=>x.id===c);return s+(ct?+ct.saldo||0:0);},0);
  const saldoLivre=totalContas-totalCartao-totalPrevistas;

  const totalInvestido=investimentos.reduce((s,i)=>s+(+i.saldoAtual||0),0);

  // Por dia — usa configurações financeiras da família (dia de fechamento + vencimentos)
  const now=new Date();
  const isNow=viewMes===now.getMonth()&&viewAno===now.getFullYear();
  const ultimoDiaMes=new Date(viewAno,viewMes+1,0).getDate();
  const diasAteDia=(dia)=>{ const d=Math.max(1,Math.min(+dia||31,ultimoDiaMes)); if(!isNow) return d; return now.getDate()<=d?Math.max(1,d-now.getDate()):Math.max(1,Math.ceil((new Date(viewAno,viewMes+1,d)-now)/86400000)); };
  const diasFim=diasAteDia(diaFechamento);
  const diasVenc=Math.min(...CARTOES_LISTA.map(c=>diasAteDia(+(vencimentos[c]||25))));
  const saldoProximo=saldoLivre; // simplificado
  const vpdVista=saldoLivre/Math.max(1,diasFim);
  const vpdCartao=saldoProximo/Math.max(1,diasVenc);

  // ── Consultor IA ────────────────────────────────────────────────────────────
  const buildDados=(mes,ano)=>{
    const conf=lancs.filter(l=>l.mes===mes&&l.ano===ano&&l.status==="confirmado");
    const gpc={};
    conf.forEach(l=>{ if(l.tipo==="saida"||l.tipo==="cartao"){ if(l.splits&&l.splits.length) l.splits.forEach(s=>{if(s.catId)gpc[s.catId]=(gpc[s.catId]||0)+(+s.valor||0);}); else if(l.catId) gpc[l.catId]=(gpc[l.catId]||0)+(+l.valor||0); } });
    const ent=conf.filter(l=>l.tipo==="entrada").reduce((s,l)=>s+(+l.valor||0),0);
    const sai=conf.filter(l=>l.tipo==="saida").reduce((s,l)=>s+(+l.valor||0),0);
    const cart=lancs.filter(l=>l.tipo==="cartao"&&l.mesFatura===mes&&l.anoFatura===ano).reduce((s,l)=>s+(+l.valor||0),0);
    const prev=getMonthView(baseItems,lancs,mes,ano,gpc).filter(p=>p.baseTipo==="prevista");
    const totalPrev=prev.reduce((s,p)=>s+p.valorPrevisto,0);
    const gastosPorCategoria=Object.entries(gpc).map(([catId,valor])=>({nome:getCat(catId,customCats).label,valor:Math.round(valor*100)/100,percentual:0})).sort((x,y)=>y.valor-x.valor);
    const totGasto=gastosPorCategoria.reduce((s,c)=>s+c.valor,0)||1;
    gastosPorCategoria.forEach(c=>{c.percentual=Math.round(c.valor/totGasto*100);});
    const historico3Meses=[1,2,3].map(i=>{ const r=addM(mes,ano,-i); const c=lancs.filter(l=>l.status==="confirmado"&&l.mes===r.mes&&l.ano===r.ano); return { mes:MESES[r.mes], ano:r.ano, entradas:Math.round(c.filter(l=>l.tipo==="entrada").reduce((s,l)=>s+(+l.valor||0),0)*100)/100, saidas:Math.round(c.filter(l=>l.tipo==="saida").reduce((s,l)=>s+(+l.valor||0),0)*100)/100, cartao:Math.round(lancs.filter(l=>l.tipo==="cartao"&&l.mesFatura===r.mes&&l.anoFatura===r.ano).reduce((s,l)=>s+(+l.valor||0),0)*100)/100 }; });
    return { mesReferencia:`${MESES[mes]} ${ano}`, totalEntradas:Math.round(ent*100)/100, totalSaidas:Math.round(sai*100)/100, totalCartao:Math.round(cart*100)/100, saldoLivre:Math.round((totalContas-cart-totalPrev)*100)/100, gastosPorCategoria, historico3Meses, totalInvestido:Math.round(totalInvestido*100)/100, previstasPendentes:prev.map(p=>({desc:p.desc,restante:Math.round(p.valorPrevisto*100)/100})) };
  };
  const gerarAnalise=async(mes,ano)=>{
    setConsultorLoading(true); setConsultorErro("");
    try{
      const dados=buildDados(mes,ano);
      const r=await fetch("/api/consultor",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(dados)});
      const j=await r.json();
      if(j.error) throw new Error(j.error);
      await setDoc(doc(db,fp("analises"),`${mes}-${ano}`),{...j,mes,ano,data:Date.now()});
    }catch(e){ setConsultorErro("Falha ao gerar análise: "+e.message); }
    setConsultorLoading(false);
  };
  const abrirConsultor=()=>{
    setConsultorOpen(true); setBadgeVisto(true); setConsultorErro("");
    const id=`${viewMes}-${viewAno}`;
    if(!analises.some(a=>a.id===id)&&!consultorLoading) gerarAnalise(viewMes,viewAno);
  };
  const mesAtualId=`${HOJE.getMonth()}-${HOJE.getFullYear()}`;
  const mostrarBadge=analises.some(a=>a.id===mesAtualId)&&!badgeVisto;
  useEffect(()=>{
    if(loading) return;
    const mA=HOJE.getMonth(), aA=HOJE.getFullYear();
    if(analises.some(a=>a.id===`${mA}-${aA}`)) return;
    const nConf=lancs.filter(l=>l.status==="confirmado"&&l.mes===mA&&l.ano===aA).length;
    if(nConf>=5&&!autoRan.current){ autoRan.current=true; gerarAnalise(mA,aA); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[loading,analises,lancs]);

  if(loading) return <div style={{background:"linear-gradient(135deg,#6c63ff,#a78bfa)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:"Inter,sans-serif",fontSize:16,fontWeight:700}}>💚 Carregando...</div>;

  return(
    <div style={{minHeight:"100vh",background:"#f0f4ff",fontFamily:"'Inter','Segoe UI',sans-serif",color:"#1f2937",paddingBottom:80,maxWidth:480,margin:"0 auto"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box;margin:0;padding:0}input,select,button{font-family:inherit;outline:none}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#c7d2fe;border-radius:4px}.hover-card:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(0,0,0,0.1)!important;transition:all .2s}`}</style>

      {toast&&<Toast msg={toast.msg} ok={toast.ok}/>}

      {/* Modais */}
      {modal?.tipo==="lancamento"&&<LancForm data={modal.data} onSave={saveLanc} onClose={()=>setModal(null)} allCats={allCats} viewMes={viewMes} viewAno={viewAno} onImportNFe={importNFe} membros={nomesMembros}/>}
      {modal?.tipo==="base"&&<BaseForm data={modal.data} onSave={saveBase} onClose={()=>setModal(null)} allCats={allCats} membros={nomesMembros}/>}
      {modal?.tipo==="confirmarPendente"&&<ConfirmPendenteModal pendente={modal.data} onConfirm={v=>confirmarPendente(modal.data,v)} onClose={()=>setModal(null)}/>}
      {modal?.tipo==="transferencia"&&<TransfForm data={modal.data} onSave={saveTransferencia} onClose={()=>setModal(null)} contas={contas} viewMes={viewMes} viewAno={viewAno}/>}
      {modal?.tipo==="investimento"&&<InvestForm data={modal.data} onSave={saveInvest} onClose={()=>setModal(null)}/>}
      {modal?.tipo==="relatorioIR"&&<RelatorioIR lancs={lancs} onClose={()=>setModal(null)}/>}
      {consultorOpen&&<ConsultorFinanceiro analises={analises} atualId={`${viewMes}-${viewAno}`} mesLabel={`${MESES[viewMes]} ${viewAno}`} loading={consultorLoading} erro={consultorErro} onGerar={()=>gerarAnalise(viewMes,viewAno)} onClose={()=>setConsultorOpen(false)}/>}

      {/* INÍCIO */}
      {tab==="inicio"&&(
        <>
          {/* Header */}
          <div style={{background:`linear-gradient(135deg,${PURPLE} 0%,#a78bfa 100%)`,padding:"24px 20px 48px",borderRadius:"0 0 32px 32px",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-40,right:-40,width:160,height:160,background:"rgba(255,255,255,0.08)",borderRadius:"50%"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:mostrarBadge?12:20,position:"relative",zIndex:1}}>
              <div>
                <div style={{color:"rgba(255,255,255,0.75)",fontSize:13,fontWeight:500}}>Olá,</div>
                <div style={{color:"#fff",fontSize:20,fontWeight:900}}>{user?.email?.split("@")[0]} 👋</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button onClick={abrirConsultor} style={{position:"relative",background:"rgba(255,255,255,0.15)",border:"none",borderRadius:50,height:38,padding:"0 14px",cursor:"pointer",color:"#fff",fontSize:13,fontWeight:800,display:"flex",alignItems:"center",gap:6}}>
                  🤖 Consultor
                  {mostrarBadge&&<span style={{position:"absolute",top:-2,right:-2,width:11,height:11,background:"#ef4444",border:"2px solid #8b7ff0",borderRadius:"50%"}}/>}
                </button>
                <button onClick={()=>setTab("config")} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:50,width:38,height:38,cursor:"pointer",color:"#fff",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>⚙️</button>
              </div>
            </div>
            {mostrarBadge&&(
              <div onClick={abrirConsultor} style={{background:"rgba(255,255,255,0.18)",borderRadius:12,padding:"8px 12px",marginBottom:14,cursor:"pointer",color:"#fff",fontSize:12,fontWeight:700,position:"relative",zIndex:1}}>
                📊 Nova análise disponível
              </div>
            )}
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,marginBottom:16,position:"relative",zIndex:1}}>
              <button onClick={()=>{const r=addM(viewMes,viewAno,-1);setViewMes(r.mes);setViewAno(r.ano);}} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
              <div style={{color:"#fff",fontSize:17,fontWeight:700}}>{MESES[viewMes]} {viewAno}</div>
              <button onClick={()=>{const r=addM(viewMes,viewAno,1);setViewMes(r.mes);setViewAno(r.ano);}} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
            </div>
            <div style={{textAlign:"center",position:"relative",zIndex:1}}>
              <div style={{color:"rgba(255,255,255,0.7)",fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:600}}>Saldo Livre</div>
              <div style={{color:"#fff",fontSize:42,fontWeight:900,letterSpacing:"-1px",margin:"4px 0 2px"}}>{fmt(saldoLivre)}</div>
              <div style={{color:"rgba(255,255,255,0.6)",fontSize:12}}>💚 disponível este mês</div>
            </div>
          </div>

          <div style={{padding:"0 16px"}}>
            {/* Cards rápidos */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:-28,marginBottom:20}}>
              {[
                {icon:"💰",label:"Entradas",val:totalEntradas,color:"#10b981",bg:"#d1fae5"},
                {icon:"💸",label:"Saídas",val:totalSaidas,color:"#ef4444",bg:"#fee2e2"},
                {icon:"💳",label:"Cartões",val:totalCartao,color:"#f97316",bg:"#ffedd5"},
                {icon:"🙏",label:"Dízimo",val:totalDizimo,color:"#f59e0b",bg:"#fef3c7"},
              ].map(({icon,label,val,color,bg})=>(
                <div key={label} className="hover-card" style={{background:"#fff",borderRadius:20,padding:"14px 14px",boxShadow:"0 4px 16px rgba(0,0,0,0.07)"}}>
                  <div style={{width:34,height:34,borderRadius:12,background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,marginBottom:10}}>{icon}</div>
                  <div style={{fontSize:10,color:"#9ca3af",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>{label}</div>
                  <div style={{fontSize:16,fontWeight:900,color}}>{fmt(val)}</div>
                </div>
              ))}
            </div>

            {/* Previstas pendentes */}
            {previstasPendentes.length>0&&(
              <div style={{marginBottom:20}}>
                <div style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  ⏳ Previstas em aberto
                  <span style={{background:"#ede9fe",color:"#7c3aed",fontSize:11,fontWeight:700,borderRadius:20,padding:"2px 8px"}}>{previstasPendentes.length}</span>
                </div>
                {previstasPendentes.map(p=>(
                  <div key={p.id} style={{background:"#faf5ff",border:"1.5px solid #ede9fe",borderRadius:16,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:3,alignSelf:"stretch",background:"#a855f7",borderRadius:2,flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#1f2937"}}>{p.desc}</div>
                      <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>Previsto {fmt(p.valorPrevisto)} · gasto {fmt((p.valorPrevisto||0)-p.restante)} → falta {fmt(p.restante)}</div>
                    </div>
                    <div style={{fontSize:13,fontWeight:900,color:"#a855f7"}}>{fmt(p.restante)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Ritmo de gasto */}
            <div style={{marginBottom:20}}>
              <div style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:10}}>📊 Ritmo de gasto</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[
                  {label:"💵 À vista / dia",val:vpdVista,sub:`÷ ${diasFim} dias`,semana:vpdVista*7,color:"#10b981"},
                  {label:"💳 Cartão / dia",val:vpdCartao,sub:`÷ ${diasVenc} dias`,semana:vpdCartao*7,color:"#f97316"},
                ].map(({label,val,sub,semana,color})=>(
                  <div key={label} style={{background:"#fff",borderRadius:16,padding:"14px",boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
                    <div style={{fontSize:10,color:"#9ca3af",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>{label}</div>
                    <div style={{fontSize:20,fontWeight:900,color:val>=0?color:"#ef4444"}}>{fmt(val)}</div>
                    <div style={{fontSize:10,color:"#9ca3af",marginTop:3}}>{sub}</div>
                    <div style={{fontSize:12,fontWeight:700,color:val>=0?color:"#ef4444",marginTop:8,paddingTop:8,borderTop:"1px solid #f3f4f6"}}>{fmt(semana)} / semana</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top categorias */}
            {(()=>{
              const totCat={};
              confirmados.filter(l=>l.tipo==="saida"||l.tipo==="cartao").forEach(l=>{
                if(l.splits&&l.splits.length>0) l.splits.forEach(s=>{if(s.catId)totCat[s.catId]=(totCat[s.catId]||0)+(+s.valor||0);});
                else if(l.catId) totCat[l.catId]=(totCat[l.catId]||0)+(+l.valor||0);
              });
              const entries=Object.entries(totCat).sort((a,b)=>b[1]-a[1]).slice(0,4);
              const total=entries.reduce((s,[,v])=>s+v,0);
              if(!entries.length) return null;
              return(
                <div style={{marginBottom:20}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:10,display:"flex",justifyContent:"space-between"}}>
                    🏷️ Top categorias
                    <span style={{fontSize:12,color:PURPLE,fontWeight:600,cursor:"pointer"}} onClick={()=>setTab("gastos")}>Ver todas →</span>
                  </div>
                  {entries.map(([catId,valor])=>{
                    const c=getCat(catId,customCats);
                    const pct=total>0?Math.round(valor/total*100):0;
                    return(
                      <div key={catId} style={{background:"#fff",borderRadius:12,padding:"10px 12px",marginBottom:6,boxShadow:"0 2px 6px rgba(0,0,0,0.04)"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                          <div style={{fontSize:12,fontWeight:700,color:"#374151"}}>{c.icon} {c.label}</div>
                          <div style={{fontSize:12,fontWeight:900,color:c.color}}>{fmt(valor)}</div>
                        </div>
                        <div style={{height:4,background:"#f3f4f6",borderRadius:4,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${pct}%`,background:c.color,borderRadius:4}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Últimos lançamentos */}
            <div style={{marginBottom:20}}>
              <div style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:10,display:"flex",justifyContent:"space-between"}}>
                📋 Últimos lançamentos
                <span style={{fontSize:12,color:PURPLE,fontWeight:600,cursor:"pointer"}} onClick={()=>setTab("gastos")}>Ver todos →</span>
              </div>
              {lancsDoMes.filter(l=>l.status==="confirmado").sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,5).map(l=>{
                const c=getCat(l.catId,customCats);
                const isEntrada=l.tipo==="entrada";
                return(
                  <div key={l.id} style={{background:"#fff",borderRadius:12,padding:"10px 12px",marginBottom:6,boxShadow:"0 2px 6px rgba(0,0,0,0.04)",display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:38,height:38,borderRadius:12,background:c.color+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{c.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#1f2937",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{l.desc}</div>
                      <div style={{fontSize:10,color:"#9ca3af",marginTop:1}}>{l.formaPag||""}{l.contaId?` · ${l.contaId}`:""}{l.data?` · ${fmtDate(l.data)}`:""}</div>
                    </div>
                    <div style={{fontSize:13,fontWeight:900,color:isEntrada?"#10b981":"#ef4444",flexShrink:0}}>{isEntrada?"+":"-"}{fmt(l.valor)}</div>
                  </div>
                );
              })}
              {lancsDoMes.filter(l=>l.status==="confirmado").length===0&&(
                <div style={{textAlign:"center",color:"#9ca3af",padding:"24px 0",fontSize:13}}>Nenhum lançamento confirmado em {MESES[viewMes]}</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* GASTOS */}
      {tab==="gastos"&&(
        <TabGastos lancs={lancs} lancsDoMes={lancsDoMes} viewMes={viewMes} viewAno={viewAno} setViewMes={setViewMes} setViewAno={setViewAno} customCats={customCats} allCats={allCats} onEdit={l=>setModal({tipo:"lancamento",data:l})} onDelete={deleteLanc} previstasPendentes={previstasPendentes} pendentes={pendentes} onConfirmar={p=>setModal({tipo:"confirmarPendente",data:p})}/>
      )}

      {/* CARTÕES */}
      {tab==="cartoes"&&(
        <TabCartoes lancs={lancs} viewMes={viewMes} viewAno={viewAno} setViewMes={setViewMes} setViewAno={setViewAno} customCats={customCats} allCats={allCats} onEdit={l=>setModal({tipo:"lancamento",data:{...l,tipo:"cartao"}})} onDelete={deleteLanc} onNovaCompra={()=>setModal({tipo:"lancamento",data:{tipo:"cartao",mes:viewMes,ano:viewAno}})}/>
      )}

      {/* CONTAS */}
      {tab==="contas"&&(
        <TabContas contas={contas} lancs={lancs} viewMes={viewMes} viewAno={viewAno} setViewMes={setViewMes} setViewAno={setViewAno} onAjustarSaldo={saveContaSaldo} onTransferencia={()=>setModal({tipo:"transferencia",data:{}})} onPagarFatura={()=>setModal({tipo:"transferencia",data:{tipo:"fatura"}})} customCats={customCats}/>
      )}

      {/* INVESTIMENTOS */}
      {tab==="investimentos"&&(
        <TabInvestimentos investimentos={investimentos} totalInvestido={totalInvestido} onNovo={()=>setModal({tipo:"investimento",data:{}})} onEdit={i=>setModal({tipo:"investimento",data:i})} onDelete={deleteInvest} onRelatorioIR={()=>setModal({tipo:"relatorioIR",data:{}})}/>
      )}

      {/* CONFIGURAÇÕES */}
      {tab==="config"&&(
        <TabConfig baseItems={baseItems} customCats={customCats} user={user} familyCode={familyCode} membros={membros} onAddMembro={saveMembro} onDelMembro={deleteMembro} config={config} onSaveConfig={saveConfigFin} onAdd={tipo=>setModal({tipo:"base",data:{tipo}})} onEdit={b=>setModal({tipo:"base",data:{...b}})} onDelete={deleteBase} onLogout={onLogout}/>
      )}

      {/* FAB */}
      {["inicio","gastos","cartoes"].includes(tab)&&(
        <button onClick={()=>setModal({tipo:"lancamento",data:{mes:viewMes,ano:viewAno,tipo:tab==="cartoes"?"cartao":"saida"}})} style={{position:"fixed",bottom:72,right:"calc(50% - 224px)",width:52,height:52,background:`linear-gradient(135deg,${PURPLE},#a78bfa)`,border:"none",borderRadius:18,cursor:"pointer",fontSize:26,color:"#fff",boxShadow:"0 8px 24px rgba(108,99,255,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>+</button>
      )}

      {/* Bottom Nav */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"#fff",borderTop:"1px solid #f3f4f6",padding:"8px 0 16px",display:"flex",justifyContent:"space-around",zIndex:100,boxShadow:"0 -4px 20px rgba(0,0,0,0.06)"}}>
        {[
          {key:"inicio",icon:"🏠",label:"Início"},
          {key:"gastos",icon:"📋",label:"Gastos"},
          {key:"cartoes",icon:"💳",label:"Cartões"},
          {key:"contas",icon:"🏦",label:"Contas"},
          {key:"investimentos",icon:"📈",label:"Invest."},
          {key:"config",icon:"⚙️",label:"Ajustes"},
        ].map(({key,icon,label})=>(
          <button key={key} onClick={()=>setTab(key)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",padding:"0 6px"}}>
            <span style={{fontSize:20}}>{icon}</span>
            <span style={{fontSize:10,fontWeight:700,color:tab===key?PURPLE:"#9ca3af"}}>{label}</span>
            {tab===key&&<span style={{width:4,height:4,background:PURPLE,borderRadius:"50%"}}/>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Tab Gastos ───────────────────────────────────────────────────────────────
function TabGastos({lancs,lancsDoMes,viewMes,viewAno,setViewMes,setViewAno,customCats,allCats,onEdit,onDelete,previstasPendentes,pendentes=[],onConfirmar}){
  const [filtro,setFiltro]=useState("todos"); // todos | entradas | saidas | previstas
  const confirmados=lancsDoMes.filter(l=>l.status==="confirmado");
  const view=filtro==="entradas"?confirmados.filter(l=>l.tipo==="entrada"):filtro==="saidas"?confirmados.filter(l=>l.tipo==="saida"||l.tipo==="cartao"):filtro==="previstas"?[]:confirmados;
  return(
    <div>
      <div style={{background:`linear-gradient(135deg,#059669,#34d399)`,padding:"20px 20px 28px",borderRadius:"0 0 28px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{color:"rgba(255,255,255,0.8)",fontSize:13,fontWeight:600}}>Lançamentos</div>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,marginBottom:4}}>
          <button onClick={()=>{const r=addM(viewMes,viewAno,-1);setViewMes(r.mes);setViewAno(r.ano);}} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",width:30,height:30,borderRadius:"50%",cursor:"pointer",fontSize:15}}>‹</button>
          <div style={{color:"#fff",fontSize:16,fontWeight:700}}>{MESES[viewMes]} {viewAno}</div>
          <button onClick={()=>{const r=addM(viewMes,viewAno,1);setViewMes(r.mes);setViewAno(r.ano);}} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",width:30,height:30,borderRadius:"50%",cursor:"pointer",fontSize:15}}>›</button>
        </div>
      </div>
      <div style={{padding:"12px 16px 0"}}>
        {/* Filtros */}
        <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
          {[["todos","Todos"],["entradas","↑ Entradas"],["saidas","↓ Saídas"],["previstas","⏳ Previstas"]].map(([k,l])=>(
            <button key={k} onClick={()=>setFiltro(k)} style={{padding:"6px 14px",borderRadius:20,border:`1.5px solid ${filtro===k?PURPLE:"#e0e0f0"}`,background:filtro===k?PURPLE:"#fff",color:filtro===k?"#fff":"#374151",fontWeight:700,fontSize:11,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
              {l}
            </button>
          ))}
        </div>

        {/* Pendentes do Cadastro Base */}
        {filtro==="todos"&&pendentes.length>0&&(
          <div style={{marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              ⏳ Pendentes
              <span style={{background:"#fef3c7",color:"#b45309",fontSize:11,fontWeight:700,borderRadius:20,padding:"2px 8px"}}>{pendentes.length}</span>
            </div>
            {pendentes.map(p=>{
              const tm=BASE_TIPOS[p.baseTipo]||{};
              const isEntrada=tm.lancTipo==="entrada";
              return(
                <div key={p._baseId} style={{background:"#fff",border:`1.5px dashed ${tm.color}55`,borderRadius:14,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:38,height:38,borderRadius:12,background:tm.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{tm.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.desc}</div>
                    <div style={{fontSize:10,color:"#9ca3af",marginTop:2}}>
                      {tm.label}{p.cartao?` · ${p.cartao}`:""}{p.membro?` · ${p.membro}`:""}
                      {p.baseTipo==="prevista"&&p.gasto>0&&<span> · gasto {fmt(p.gasto)} de {fmt(p.valorOriginal)}</span>}
                    </div>
                  </div>
                  <div style={{fontSize:13,fontWeight:900,color:isEntrada?"#10b981":tm.color,flexShrink:0}}>{isEntrada?"+":"-"}{fmt(p.valorPrevisto)}</div>
                  <button onClick={()=>onConfirmar&&onConfirmar(p)} style={{background:"#d1fae5",border:"none",borderRadius:10,color:"#059669",padding:"8px 10px",cursor:"pointer",fontSize:11,fontWeight:800,flexShrink:0}}>✓ Confirmar</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Previstas */}
        {filtro==="previstas"&&(
          previstasPendentes.length===0
            ? <div style={{textAlign:"center",color:"#9ca3af",padding:"32px 0",fontSize:13}}>Nenhuma prevista pendente 🎉</div>
            : previstasPendentes.map(p=>(
              <div key={p.id} style={{background:"#faf5ff",border:"1.5px solid #ede9fe",borderRadius:14,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:3,alignSelf:"stretch",background:"#a855f7",borderRadius:2}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700}}>{p.desc}</div>
                  <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>Previsto {fmt(p.valorPrevisto)} · falta {fmt(p.restante)}</div>
                  <div style={{height:4,background:"#ede9fe",borderRadius:4,marginTop:6,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${Math.round(((p.valorPrevisto-p.restante)/p.valorPrevisto)*100)}%`,background:"#a855f7",borderRadius:4}}/>
                  </div>
                </div>
                <div style={{fontSize:13,fontWeight:900,color:"#a855f7"}}>{fmt(p.restante)}</div>
              </div>
            ))
        )}

        {/* Lista lançamentos */}
        {filtro!=="previstas"&&(
          view.length===0
            ? <div style={{textAlign:"center",color:"#9ca3af",padding:"32px 0",fontSize:13}}>Nenhum lançamento em {MESES[viewMes]}</div>
            : view.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).map(l=>{
              const c=getCat(l.catId,[...customCats]);
              const isEntrada=l.tipo==="entrada";
              return(
                <div key={l.id} style={{background:"#fff",borderRadius:14,padding:"12px 14px",marginBottom:8,boxShadow:"0 2px 8px rgba(0,0,0,0.05)",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:40,height:40,borderRadius:14,background:c.color+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{c.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{l.desc}</div>
                    <div style={{fontSize:10,color:"#9ca3af",marginTop:2,display:"flex",gap:6,flexWrap:"wrap"}}>
                      {l.formaPag&&<span>{l.formaPag}</span>}
                      {l.contaId&&<span>· {l.contaId}</span>}
                      {l.membro&&<span>· {l.membro}</span>}
                      {l.data&&<span>· {fmtDate(l.data)}</span>}
                      {l.irDedutivel&&<span style={{color:"#f59e0b",fontWeight:700}}>· 📋 IR</span>}
                    </div>
                  </div>
                  <div style={{fontSize:14,fontWeight:900,color:isEntrada?"#10b981":"#ef4444",flexShrink:0}}>{isEntrada?"+":"-"}{fmt(l.valor)}</div>
                  <div style={{display:"flex",gap:4,flexShrink:0}}>
                    <button onClick={()=>onEdit(l)} style={{background:"#f3f4f6",border:"none",borderRadius:8,color:"#6b7280",padding:"5px 7px",cursor:"pointer",fontSize:11}}>✏</button>
                    <button onClick={()=>onDelete(l.id)} style={{background:"#fef2f2",border:"none",borderRadius:8,color:"#ef4444",padding:"5px 7px",cursor:"pointer",fontSize:11}}>✕</button>
                  </div>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}

// ─── Tab Cartões ──────────────────────────────────────────────────────────────
function TabCartoes({lancs,viewMes,viewAno,setViewMes,setViewAno,customCats,allCats,onEdit,onDelete,onNovaCompra}){
  const [cartaoAtivo,setCartaoAtivo]=useState(CARTOES_LISTA[0]);
  const comprasMes=lancs.filter(l=>l.tipo==="cartao"&&l.mesFatura===viewMes&&l.anoFatura===viewAno);
  const comprasCartao=comprasMes.filter(l=>(l.cartao||"C6")===cartaoAtivo);
  const totalBruto=comprasCartao.reduce((s,l)=>s+(+l.valor||0),0);
  return(
    <div>
      <div style={{background:"linear-gradient(135deg,#ea580c,#fb923c)",padding:"20px 20px 28px",borderRadius:"0 0 28px 28px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,marginBottom:4}}>
          <button onClick={()=>{const r=addM(viewMes,viewAno,-1);setViewMes(r.mes);setViewAno(r.ano);}} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",width:30,height:30,borderRadius:"50%",cursor:"pointer",fontSize:15}}>‹</button>
          <div style={{color:"#fff",fontSize:16,fontWeight:700}}>{MESES[viewMes]} {viewAno}</div>
          <button onClick={()=>{const r=addM(viewMes,viewAno,1);setViewMes(r.mes);setViewAno(r.ano);}} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",width:30,height:30,borderRadius:"50%",cursor:"pointer",fontSize:15}}>›</button>
        </div>
        <div style={{textAlign:"center",color:"#fff",fontSize:11,opacity:.8}}>Fatura do mês</div>
        <div style={{textAlign:"center",color:"#fff",fontSize:36,fontWeight:900,letterSpacing:"-1px"}}>{fmt(totalBruto)}</div>
      </div>
      <div style={{padding:"12px 16px 0"}}>
        {/* Seletor cartão */}
        <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto",paddingBottom:4}}>
          {CARTOES_LISTA.map(c=>{
            const t=comprasMes.filter(l=>(l.cartao||"C6")===c).reduce((s,l)=>s+(+l.valor||0),0);
            return(
              <button key={c} onClick={()=>setCartaoAtivo(c)} style={{padding:"8px 14px",borderRadius:12,border:`1.5px solid ${cartaoAtivo===c?"#f97316":"#e0e0f0"}`,background:cartaoAtivo===c?"#fff7ed":"#fff",color:cartaoAtivo===c?"#f97316":"#374151",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
                ▣ {c}{t>0&&<span style={{marginLeft:4,fontSize:10,opacity:.8}}>{fmt(t)}</span>}
              </button>
            );
          })}
          <button onClick={onNovaCompra} style={{padding:"8px 14px",borderRadius:12,border:"none",background:"#f97316",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",flexShrink:0,marginLeft:"auto"}}>+ Compra</button>
        </div>

        {comprasCartao.length===0
          ? <div style={{textAlign:"center",color:"#9ca3af",padding:"32px 0",fontSize:13}}>Nenhuma compra no {cartaoAtivo} em {MESES[viewMes]}</div>
          : comprasCartao.map(l=>{
            const c=getCat(l.catId,customCats);
            return(
              <div key={l.id} style={{background:"#fff",borderRadius:14,padding:"12px 14px",marginBottom:8,boxShadow:"0 2px 8px rgba(0,0,0,0.05)",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:40,height:40,borderRadius:14,background:"#ffedd5",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{c.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{l.desc}</div>
                  <div style={{fontSize:10,color:"#9ca3af",marginTop:2}}>{l.membro||""}{l.data?` · ${fmtDate(l.data)}`:""}</div>
                  <CatTag catId={l.catId} extra={customCats}/>
                </div>
                <div style={{fontSize:14,fontWeight:900,color:"#f97316",flexShrink:0}}>{fmt(l.valor)}</div>
                <div style={{display:"flex",gap:4}}>
                  <button onClick={()=>onEdit(l)} style={{background:"#f3f4f6",border:"none",borderRadius:8,color:"#6b7280",padding:"5px 7px",cursor:"pointer",fontSize:11}}>✏</button>
                  <button onClick={()=>onDelete(l.id)} style={{background:"#fef2f2",border:"none",borderRadius:8,color:"#ef4444",padding:"5px 7px",cursor:"pointer",fontSize:11}}>✕</button>
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}

// ─── Tab Contas ───────────────────────────────────────────────────────────────
function TabContas({contas,lancs,viewMes,viewAno,setViewMes,setViewAno,onAjustarSaldo,onTransferencia,onPagarFatura,customCats}){
  const [contaAtiva,setContaAtiva]=useState(null);
  const totalContas=CONTAS_LISTA.reduce((s,c)=>{const ct=contas.find(x=>x.id===c);return s+(ct?+ct.saldo||0:0);},0);
  const getSaldo=id=>{const c=contas.find(x=>x.id===id);return c?+c.saldo||0:0;};
  const CORES_CONTAS={"C6":"#ef4444","Inter":"#f97316","Caixa":"#3b82f6","XP":"#10b981","Santander":"#8b5cf6"};
  return(
    <div>
      <div style={{background:"linear-gradient(135deg,#2563eb,#60a5fa)",padding:"20px 20px 28px",borderRadius:"0 0 28px 28px"}}>
        <div style={{textAlign:"center"}}>
          <div style={{color:"rgba(255,255,255,0.7)",fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:600}}>Total em contas</div>
          <div style={{color:"#fff",fontSize:36,fontWeight:900,letterSpacing:"-1px",margin:"4px 0"}}>{fmt(totalContas)}</div>
          <div style={{color:"rgba(255,255,255,0.6)",fontSize:12}}>{CONTAS_LISTA.length} contas ativas</div>
        </div>
      </div>
      <div style={{padding:"12px 16px 0"}}>
        {/* Ações rápidas */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <button onClick={onTransferencia} style={{background:"#ede9fe",border:"none",borderRadius:14,padding:"12px",color:PURPLE,fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>⇄ Transferência</button>
          <button onClick={onPagarFatura} style={{background:"#fff7ed",border:"none",borderRadius:14,padding:"12px",color:"#f97316",fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>💳 Pagar Fatura</button>
        </div>

        {/* Cards de contas */}
        {CONTAS_LISTA.map(id=>{
          const saldo=getSaldo(id);
          const cor=CORES_CONTAS[id]||PURPLE;
          const lancsConta=lancs.filter(l=>l.contaId===id&&l.mes===viewMes&&l.ano===viewAno&&l.status==="confirmado");
          const isOpen=contaAtiva===id;
          return(
            <div key={id} style={{background:"#fff",borderRadius:16,padding:"14px",marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,cursor:"pointer"}} onClick={()=>setContaAtiva(isOpen?null:id)}>
                <div style={{fontSize:14,fontWeight:800,color:"#1f2937"}}>🏦 {id}</div>
                <div style={{fontSize:18,fontWeight:900,color:saldo>=0?cor:"#ef4444"}}>{fmt(saldo)}</div>
              </div>
              <div style={{height:3,background:"#f3f4f6",borderRadius:2,marginBottom:10,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.min(100,Math.abs(saldo)/Math.max(1,totalContas)*100)}%`,background:cor,borderRadius:2}}/>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input type="number" placeholder="Ajustar saldo" defaultValue={saldo||""} onBlur={e=>onAjustarSaldo(id,e.target.value)} onKeyDown={e=>e.key==="Enter"&&onAjustarSaldo(id,e.target.value)} style={{...S.inp,fontSize:12,padding:"7px 10px",flex:1}}/>
                <button onClick={()=>setContaAtiva(isOpen?null:id)} style={{background:cor+"20",border:"none",borderRadius:10,padding:"7px 12px",color:cor,fontWeight:700,fontSize:11,cursor:"pointer"}}>{isOpen?"▲":"▼"} {lancsConta.length}</button>
              </div>
              {isOpen&&lancsConta.length>0&&(
                <div style={{marginTop:10,borderTop:"1px solid #f3f4f6",paddingTop:10}}>
                  {lancsConta.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).map(l=>{
                    const isEntrada=l.tipo==="entrada";
                    return(
                      <div key={l.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #f9fafb"}}>
                        <div>
                          <div style={{fontSize:12,fontWeight:600}}>{l.desc}</div>
                          <div style={{fontSize:10,color:"#9ca3af"}}>{l.formaPag||""}{l.data?` · ${fmtDate(l.data)}`:""}</div>
                        </div>
                        <div style={{fontSize:13,fontWeight:800,color:isEntrada?"#10b981":"#ef4444"}}>{isEntrada?"+":"-"}{fmt(l.valor)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab Investimentos ────────────────────────────────────────────────────────
function TabInvestimentos({investimentos,totalInvestido,onNovo,onEdit,onDelete,onRelatorioIR}){
  const porTipo={};
  TIPOS_INVEST.forEach(t=>{porTipo[t]=investimentos.filter(i=>i.tipo===t).reduce((s,i)=>s+(+i.saldoAtual||0),0);});
  const CORES_INV={"Renda Fixa":"#10b981","Ações":"#3b82f6","FII":"#8b5cf6","Previdência":"#f59e0b","Outros":"#6b7280"};
  return(
    <div>
      <div style={{background:"linear-gradient(135deg,#4338ca,#818cf8)",padding:"20px 20px 28px",borderRadius:"0 0 28px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <div style={{color:"rgba(255,255,255,0.8)",fontSize:13,fontWeight:600}}>Patrimônio investido</div>
          <button onClick={onRelatorioIR} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:20,padding:"6px 12px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>📋 Rel. IR</button>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{color:"rgba(255,255,255,0.7)",fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:600}}>Total investido</div>
          <div style={{color:"#fff",fontSize:38,fontWeight:900,letterSpacing:"-1px",margin:"4px 0"}}>{fmt(totalInvestido)}</div>
        </div>
      </div>
      <div style={{padding:"12px 16px 0"}}>
        {/* Por tipo */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:10,display:"flex",justifyContent:"space-between"}}>
            Por tipo
            <button onClick={onNovo} style={{background:PURPLE,border:"none",borderRadius:20,padding:"5px 12px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Adicionar</button>
          </div>
          {TIPOS_INVEST.map(tipo=>{
            const val=porTipo[tipo]||0;
            const pct=totalInvestido>0?Math.round(val/totalInvestido*100):0;
            const cor=CORES_INV[tipo];
            return(
              <div key={tipo} style={{background:"#fff",borderRadius:14,padding:"14px",marginBottom:8,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#1f2937",display:"flex",alignItems:"center",gap:8}}>
                    <span style={{background:cor+"20",padding:"4px 8px",borderRadius:8,fontSize:12}}>📊</span>{tipo}
                  </div>
                  <div style={{fontSize:16,fontWeight:900,color:cor}}>{fmt(val)}</div>
                </div>
                <div style={{fontSize:10,color:"#9ca3af",marginBottom:6}}>{pct}% do total</div>
                <div style={{height:4,background:"#f3f4f6",borderRadius:4,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:cor,borderRadius:4}}/>
                </div>
              </div>
            );
          })}
        </div>

        {/* Lista */}
        {investimentos.length>0&&(
          <div>
            <div style={{fontSize:14,fontWeight:700,color:"#374151",marginBottom:10}}>Meus investimentos</div>
            {investimentos.map(i=>{
              const cor=CORES_INV[i.tipo]||PURPLE;
              return(
                <div key={i.id} style={{background:"#fff",borderRadius:14,padding:"12px 14px",marginBottom:8,boxShadow:"0 2px 8px rgba(0,0,0,0.05)",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:40,height:40,borderRadius:14,background:cor+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>📊</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700}}>{i.nome}</div>
                    <div style={{fontSize:10,color:"#9ca3af",marginTop:2}}>{i.tipo}{i.instituicao?` · ${i.instituicao}`:""}</div>
                  </div>
                  <div style={{fontSize:14,fontWeight:900,color:cor}}>{fmt(i.saldoAtual)}</div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>onEdit(i)} style={{background:"#f3f4f6",border:"none",borderRadius:8,color:"#6b7280",padding:"5px 7px",cursor:"pointer",fontSize:11}}>✏</button>
                    <button onClick={()=>onDelete(i.id)} style={{background:"#fef2f2",border:"none",borderRadius:8,color:"#ef4444",padding:"5px 7px",cursor:"pointer",fontSize:11}}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Forms ────────────────────────────────────────────────────────────────────
// ─── Leitor de NF-e ─────────────────────────────────────────────────────────────
const NFE_KEYWORDS = [
  {cat:"alimentacao_r",  kws:["arroz","feijao","feijão","leite","pao","pão","ovo","carne","frango","fruta","legume","verdura","cafe","café","acucar","açúcar","farinha","oleo","óleo","macarrao","macarrão","queijo","manteiga","tomate","cebola","batata","alface"]},
  {cat:"alimentacao_nr", kws:["refrigerante","cerveja","chocolate","salgad","biscoito","bolacha","sorvete","pizza","lanche","doce","bala","suco","energetico","energético","whisky","vinho","vodka"]},
  {cat:"medicamento",    kws:["dipirona","paracetamol","remedio","remédio","generico","genérico","comprimido","pomada","xarope","antibiotico","antibiótico","ibuprofeno","amoxicilina","losartana","omeprazol"]},
  {cat:"higiene",        kws:["sabonete","shampoo","xampu","condicionador","creme dental","papel higienico","papel higiênico","fralda","absorvente","desodorante","escova de dente"]},
  {cat:"limpeza",        kws:["detergente","sabao","sabão","amaciante","agua sanitaria","água sanitária","desinfetante","esponja","alvejante","limpador","multiuso"]},
  {cat:"vestuario",      kws:["camisa","calca","calça","blusa","sapato","tenis","tênis","meia","vestido","bermuda"]},
];
function sugerirCategoria(nome){
  const n=(nome||"").toLowerCase();
  for(const g of NFE_KEYWORDS){ if(g.kws.some(k=>n.includes(k))) return g.cat; }
  return "alimentacao_nr";
}
// Parser NF-e/NFC-e — cobre o layout padrao "Projeto NFC-e" adotado por SP, DF e MG
// (tabela #tabResult com spans .txtTit / .Rqtd / .RvlUnit / .valor) e variacoes genericas.
function parseNFe(html){
  try{
    const docp=new DOMParser().parseFromString(html||"","text/html");
    const num=t=>{ if(t==null) return 0; const s=String(t).replace(/[^0-9.,]/g,"").replace(/\.(?=\d{3}(\D|$))/g,"").replace(",","."); return parseFloat(s)||0; };
    const txt=el=>el?el.textContent.replace(/\s+/g," ").trim():"";
    const itens=[];
    // Linhas de itens: tabela padrao #tabResult; senao qualquer <tr> que contenha .txtTit
    let rows=docp.querySelectorAll("#tabResult tr");
    if(!rows.length) rows=docp.querySelectorAll("tr");
    rows.forEach(tr=>{
      const nomeEl=tr.querySelector(".txtTit, .txtTit2");
      if(!nomeEl) return;
      const nome=txt(nomeEl).replace(/\s*\(?\s*c[oó]digo:?.*$/i,"").trim();
      if(!nome) return;
      const qtd=num(txt(tr.querySelector(".Rqtd")))||1;
      const vlUnit=num(txt(tr.querySelector(".RvlUnit")));
      let valor=num(txt(tr.querySelector(".valor")));
      if(!valor&&vlUnit) valor=Math.round(vlUnit*qtd*100)/100;
      itens.push({nome, qtd, vlUnit, valor, catId:sugerirCategoria(nome)});
    });
    return itens;
  }catch(e){ return []; }
}

// Redimensiona a foto no cliente antes de enviar a IA (reduz payload e custo de tokens).
function fileToResizedBase64(file, maxDim=1500, quality=0.72){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    const url=URL.createObjectURL(file);
    img.onload=()=>{
      let w=img.width, h=img.height;
      if(w>=h&&w>maxDim){ h=Math.round(h*maxDim/w); w=maxDim; }
      else if(h>maxDim){ w=Math.round(w*maxDim/h); h=maxDim; }
      const c=document.createElement("canvas");
      c.width=w; c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      URL.revokeObjectURL(url);
      const dataUrl=c.toDataURL("image/jpeg",quality);
      resolve({base64:dataUrl.split(",")[1], mediaType:"image/jpeg"});
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error("Nao foi possivel ler a imagem")); };
    img.src=url;
  });
}
function LeitorNFe({allCats,onClose,onImport}){
  const [aba,setAba]=useState("qr");
  const [itens,setItens]=useState(null);
  const [loading,setLoading]=useState(false);
  const [loadingIA,setLoadingIA]=useState(false);
  const [erro,setErro]=useState("");
  const [fotoFile,setFotoFile]=useState(null);

  const buscarNFe=async(url)=>{
    setErro(""); setLoading(true);
    try{
      const r=await fetch(`/api/nfe?url=${encodeURIComponent(url)}`);
      const j=await r.json();
      if(j.error) throw new Error(j.error);
      const parsed=parseNFe(j.html||"");
      if(parsed.length) setItens(parsed);
      else setErro("Não encontrei os itens no HTML da nota — alguns portais carregam via JavaScript. Use a aba Foto + IA abaixo.");
    }catch(e){ setErro("Falha ao buscar a nota: "+e.message); }
    setLoading(false);
  };

  // Câmera (aba QR Code)
  useEffect(()=>{
    if(aba!=="qr"||itens) return;
    let ativo=true;
    const scanner=new Html5Qrcode("nfe-qr-reader");
    scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:220,height:220}},
      (decoded)=>{ if(!ativo) return; ativo=false; scanner.stop().catch(()=>{}); buscarNFe(decoded); },
      ()=>{}
    ).catch(()=>setErro("Não foi possível acessar a câmera. Use a aba Foto."));
    return ()=>{ ativo=false; scanner.stop().then(()=>scanner.clear()).catch(()=>{}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[aba,itens]);

  const handleFoto=async(e)=>{
    const file=e.target.files&&e.target.files[0];
    if(!file) return;
    setFotoFile(file); setErro(""); setLoading(true);
    try{
      const h=new Html5Qrcode("nfe-file-reader");
      const decoded=await h.scanFile(file,false);
      await buscarNFe(decoded);
    }catch(err){ setErro("Não li o QR Code da foto. Você ainda pode extrair os itens com IA abaixo."); setLoading(false); }
  };

  const analisarComIA=async()=>{
    if(!fotoFile) return;
    setErro(""); setLoadingIA(true);
    try{
      const {base64,mediaType}=await fileToResizedBase64(fotoFile);
      const r=await fetch("/api/nfe-vision",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image:base64,mediaType})});
      const j=await r.json();
      if(j.error) throw new Error(j.error);
      const arr=(j.itens||[]).map(it=>({nome:it.nome,qtd:it.qtd||1,valor:+it.valor||0,catId:sugerirCategoria(it.nome)}));
      if(arr.length) setItens(arr);
      else setErro("A IA não encontrou itens. Tente uma foto mais nítida do cupom inteiro.");
    }catch(e){ setErro("Falha na extração por IA: "+e.message); }
    setLoadingIA(false);
  };

  const setItemCat=(i,catId)=>setItens(arr=>arr.map((it,j)=>j===i?{...it,catId}:it));
  const total=(itens||[]).reduce((s,it)=>s+(+it.valor||0),0);
  const catsDespesa=[...CATS_DESPESA,...allCats.filter(c=>c.custom)];

  return(
    <Modal title="📷 Ler NF-e" onClose={onClose} maxW={520}>
      {!itens&&(
        <>
          <div style={{display:"flex",gap:6,marginBottom:16,background:"#f3f4f6",borderRadius:12,padding:4}}>
            {[["qr","🔳 QR Code"],["foto","📸 Foto"]].map(([k,l])=>(
              <button key={k} type="button" onClick={()=>{setAba(k);setErro("");}} style={{flex:1,padding:"9px 0",borderRadius:9,border:"none",fontFamily:"inherit",fontWeight:700,fontSize:13,cursor:"pointer",background:aba===k?"#fff":"transparent",color:aba===k?"#1f2937":"#6b7280",boxShadow:aba===k?"0 2px 8px rgba(0,0,0,0.08)":"none"}}>{l}</button>
            ))}
          </div>
          {aba==="qr"&&(
            <div>
              <div id="nfe-qr-reader" style={{width:"100%",borderRadius:12,overflow:"hidden"}}/>
              <div style={{fontSize:12,color:"#6b7280",textAlign:"center",marginTop:10}}>Aponte a câmera para o QR Code da nota fiscal.</div>
            </div>
          )}
          {aba==="foto"&&(
            <div style={{textAlign:"center",padding:"8px 0"}}>
              <div id="nfe-file-reader" style={{display:"none"}}/>
              <label style={{display:"inline-block",...S.btn(`linear-gradient(135deg,${PURPLE},#a78bfa)`),padding:"13px 22px",cursor:"pointer"}}>
                📸 Tirar / escolher foto
                <input type="file" accept="image/*" capture="environment" onChange={handleFoto} style={{display:"none"}}/>
              </label>
              <div style={{fontSize:12,color:"#6b7280",marginTop:12}}>Fotografe o QR Code da nota fiscal.</div>
            </div>
          )}
          {loading&&<div style={{textAlign:"center",color:PURPLE,fontWeight:700,marginTop:14}}>Buscando dados da nota…</div>}
          {erro&&<div style={{background:"#fef2f2",border:"1.5px solid #fecaca",color:"#b91c1c",borderRadius:12,padding:"10px 12px",fontSize:12,marginTop:14}}>{erro}</div>}
          {fotoFile&&!loading&&(
            <button type="button" onClick={analisarComIA} disabled={loadingIA} style={{...S.btn("linear-gradient(135deg,#7c3aed,#a78bfa)"),width:"100%",padding:"12px 0",fontSize:13,marginTop:12,opacity:loadingIA?.7:1}}>
              {loadingIA?"🤖 Analisando a foto com IA…":"🤖 Extrair itens da foto com IA"}
            </button>
          )}
        </>
      )}
      {itens&&(
        <>
          <div style={{fontSize:13,color:"#374151",fontWeight:700,marginBottom:10}}>{itens.length} item(ns) · Total {fmt(total)}</div>
          {itens.length===0
            ? <div style={{textAlign:"center",color:"#9ca3af",padding:"20px 0",fontSize:13}}>Nenhum item reconhecido na nota.</div>
            : <div style={{maxHeight:"42vh",overflowY:"auto",marginBottom:14}}>
                {itens.map((it,i)=>(
                  <div key={i} style={{background:"#f8f9ff",border:"1.5px solid #e0e0f0",borderRadius:12,padding:"10px 12px",marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:6}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#1f2937",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.nome}</div>
                      <div style={{fontSize:13,fontWeight:900,color:"#ef4444",flexShrink:0}}>{fmt(it.valor)}</div>
                    </div>
                    <select value={it.catId} onChange={e=>setItemCat(i,e.target.value)} style={{...S.inp,fontSize:12,padding:"7px 10px"}}>
                      {catsDespesa.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
          }
          {itens.length>0&&(
            <button type="button" onClick={()=>onImport(itens)} style={{...S.btn(`linear-gradient(135deg,${PURPLE},#a78bfa)`),width:"100%",padding:"13px 0",fontSize:14}}>
              ✓ Importar {itens.length} lançamento(s)
            </button>
          )}
          <button type="button" onClick={()=>{setItens(null);setErro("");}} style={{...S.btn("#f3f4f6","#374151"),width:"100%",padding:"11px 0",marginTop:8}}>← Ler outra nota</button>
        </>
      )}
    </Modal>
  );
}

function LancForm({data,onSave,onClose,allCats,viewMes,viewAno,onImportNFe,membros=[]}){
  const [f,setF]=useState({tipo:"saida",desc:"",valor:"",catId:"",formaPag:"📱 Pix",contaId:"C6",cartao:"C6",membro:membros[0]||"",mes:viewMes,ano:viewAno,data:todayStr(),status:"confirmado",parcelas:1,irDedutivel:false,irTipo:"",...data});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const [showNFe,setShowNFe]=useState(false);
  const isCartao=f.tipo==="cartao";
  const isEntrada=f.tipo==="entrada";
  const handleData=v=>{set("data",v);if(v){const d=new Date(v+"T00:00:00");set("mes",d.getMonth());set("ano",d.getFullYear());}};
  const catsFiltradas=isEntrada?CATS_RECEITA:[...CATS_DESPESA,...(allCats.filter(c=>c.custom))];
  const sugestaoIR=["saude","medicamento","educacao","dizimo"].includes(f.catId);
  return(
    <Modal title={f.id?"Editar Lançamento":"Novo Lançamento"} onClose={onClose}>
      {!f.id&&(
        <button type="button" onClick={()=>setShowNFe(true)} style={{width:"100%",marginBottom:16,padding:"12px 0",borderRadius:12,border:`1.5px dashed ${PURPLE}`,background:"#f5f3ff",color:PURPLE,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
          📷 Ler NF-e
        </button>
      )}
      {showNFe&&<LeitorNFe allCats={allCats} onClose={()=>setShowNFe(false)} onImport={items=>{setShowNFe(false);if(onImportNFe) onImportNFe(items);}}/>}
      {/* Tipo */}
      <div style={{display:"flex",gap:6,marginBottom:16,background:"#f3f4f6",borderRadius:12,padding:4}}>
        {[["entrada","↑ Entrada"],["saida","↓ Saída"],["cartao","💳 Cartão"]].map(([k,l])=>(
          <button key={k} onClick={()=>set("tipo",k)} style={{flex:1,padding:"9px 0",borderRadius:9,border:"none",fontFamily:"inherit",fontWeight:700,fontSize:12,cursor:"pointer",background:f.tipo===k?"#fff":"transparent",color:f.tipo===k?"#1f2937":"#6b7280",boxShadow:f.tipo===k?"0 2px 8px rgba(0,0,0,0.08)":"none"}}>
            {l}
          </button>
        ))}
      </div>
      <Field label="Descrição"><input value={f.desc} onChange={e=>set("desc",e.target.value)} placeholder="Ex: Supermercado, Salário..." style={S.inp}/></Field>
      <div style={{display:"flex",gap:10}}>
        <Field label={isCartao?"Valor total (R$)":"Valor (R$)"} half><input value={f.valor} onChange={e=>set("valor",e.target.value)} type="number" placeholder="0,00" style={S.inp}/></Field>
        <Field label="Data" half><input value={f.data||""} onChange={e=>handleData(e.target.value)} type="date" style={S.inp}/></Field>
      </div>
      {isCartao&&(
        <div style={{display:"flex",gap:10}}>
          <Field label="Cartão" half><select value={f.cartao} onChange={e=>set("cartao",e.target.value)} style={S.inp}>{CARTOES_LISTA.map(c=><option key={c}>{c}</option>)}</select></Field>
          <Field label="Nº parcelas" half><input value={f.parcelas} onChange={e=>set("parcelas",Math.max(1,+e.target.value||1))} type="number" min="1" max="60" style={S.inp}/></Field>
        </div>
      )}
      {!isCartao&&(
        <>
          <Field label="Forma de pagamento"><ChipSelect options={FORMAS_PAG} value={f.formaPag} onChange={v=>set("formaPag",v)}/></Field>
          <Field label="Conta"><select value={f.contaId} onChange={e=>set("contaId",e.target.value)} style={S.inp}><option value="">— Sem vínculo —</option>{CONTAS_LISTA.map(c=><option key={c}>{c}</option>)}</select></Field>
        </>
      )}
      <div style={{display:"flex",gap:10}}>
        <Field label="Membro" half><select value={f.membro} onChange={e=>set("membro",e.target.value)} style={S.inp}>{membros.length?membros.map(m=><option key={m}>{m}</option>):<option value="">— Cadastre em ⚙️ Ajustes —</option>}</select></Field>
        <Field label="Categoria" half>
          <select value={f.catId} onChange={e=>set("catId",e.target.value)} style={S.inp}>
            <option value="">— Categoria —</option>
            {catsFiltradas.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
        </Field>
      </div>
      {/* Sugestão IR */}
      {sugestaoIR&&!isEntrada&&(
        <div style={{background:"#fefce8",border:"1.5px solid #fef08a",borderRadius:12,padding:"10px 12px",marginBottom:12}}>
          <div style={{fontSize:12,color:"#854d0e",fontWeight:700,marginBottom:6}}>💡 Esta despesa pode ser dedutível no IR</div>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:"#1f2937"}}>
            <input type="checkbox" checked={f.irDedutivel} onChange={e=>set("irDedutivel",e.target.checked)} style={{width:15,height:15,accentColor:PURPLE}}/>
            Marcar como dedutível
          </label>
          {f.irDedutivel&&(
            <select value={f.irTipo} onChange={e=>set("irTipo",e.target.value)} style={{...S.inp,marginTop:8,fontSize:12}}>
              <option value="">Tipo de dedução</option>
              {TIPOS_DEDUCAO_IR.map(t=><option key={t}>{t}</option>)}
            </select>
          )}
        </div>
      )}
      {/* IR manual */}
      {!sugestaoIR&&!isEntrada&&(
        <div style={{marginBottom:12}}>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:"#6b7280"}}>
            <input type="checkbox" checked={f.irDedutivel} onChange={e=>set("irDedutivel",e.target.checked)} style={{width:14,height:14,accentColor:PURPLE}}/>
            📋 Marcar como dedutível no IR
          </label>
          {f.irDedutivel&&(
            <select value={f.irTipo} onChange={e=>set("irTipo",e.target.value)} style={{...S.inp,marginTop:8,fontSize:12}}>
              <option value="">Tipo de dedução</option>
              {TIPOS_DEDUCAO_IR.map(t=><option key={t}>{t}</option>)}
            </select>
          )}
        </div>
      )}
      <button onClick={()=>onSave(f)} style={{...S.btn(`linear-gradient(135deg,${PURPLE},#a78bfa)`),width:"100%",padding:"13px 0",fontSize:14,marginTop:4}}>
        {f.id?"Salvar alterações":"✓ Registrar"}
      </button>
    </Modal>
  );
}

function BaseForm({data,onSave,onClose,allCats,membros=[]}){
  const [f,setF]=useState({tipo:"prevista",desc:"",valorPrevisto:"",catId:"",membro:membros[0]||"",mesInicio:HOJE.getMonth(),anoInicio:HOJE.getFullYear(),cartao:CARTOES_LISTA[0],parcelas:1,parcelaAtual:1,mesFatura:HOJE.getMonth(),anoFatura:HOJE.getFullYear(),ativo:true,...data});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const tm=BASE_TIPOS[f.tipo]||BASE_TIPOS.prevista;
  const isParcela=f.tipo==="parcela_cartao";
  const cats=f.tipo==="receita_fixa"?CATS_RECEITA:[...CATS_DESPESA,...allCats.filter(c=>c.custom)];
  return(
    <Modal title={`${f.id?"Editar":"Novo"}: ${tm.icon} ${tm.label}`} onClose={onClose}>
      {!f.id&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
          {Object.entries(BASE_TIPOS).map(([k,t])=>(
            <button key={k} type="button" onClick={()=>set("tipo",k)} style={{padding:"7px 12px",borderRadius:20,border:`1.5px solid ${f.tipo===k?t.color:"#e0e0f0"}`,background:f.tipo===k?t.color+"15":"#fff",color:f.tipo===k?t.color:"#6b7280",fontWeight:700,fontSize:11,cursor:"pointer"}}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      )}
      <Field label="Descrição"><input value={f.desc} onChange={e=>set("desc",e.target.value)} placeholder={f.tipo==="receita_fixa"?"Ex: Salário, Aluguel recebido...":f.tipo==="despesa_fixa"?"Ex: Escola, Plano de saúde...":isParcela?"Ex: Geladeira, Notebook...":"Ex: Conta de luz, Medicamentos..."} style={S.inp}/></Field>
      <div style={{display:"flex",gap:10}}>
        <Field label={isParcela?"Valor da parcela (R$)":"Valor previsto (R$)"} half><input value={f.valorPrevisto} onChange={e=>set("valorPrevisto",e.target.value)} type="number" placeholder="0,00" style={S.inp}/></Field>
        <Field label="Membro" half><select value={f.membro} onChange={e=>set("membro",e.target.value)} style={S.inp}>{membros.length?membros.map(m=><option key={m}>{m}</option>):<option value="">— Cadastre em ⚙️ Ajustes —</option>}</select></Field>
      </div>
      <Field label="Categoria">
        <select value={f.catId} onChange={e=>set("catId",e.target.value)} style={S.inp}>
          <option value="">— Categoria —</option>
          {cats.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
        </select>
      </Field>
      {f.tipo==="prevista"&&(
        <>
          <div style={{display:"flex",gap:10}}>
            <Field label="Mês início" half><select value={f.mesInicio} onChange={e=>set("mesInicio",+e.target.value)} style={S.inp}>{MESES.map((m,i)=><option key={i} value={i}>{m}</option>)}</select></Field>
            <Field label="Ano início" half><input value={f.anoInicio} onChange={e=>set("anoInicio",+e.target.value)} type="number" style={S.inp}/></Field>
          </div>
          <div style={{background:"#faf5ff",border:"1.5px solid #ede9fe",borderRadius:12,padding:"10px 12px",marginBottom:12,fontSize:12,color:"#6b21a8"}}>
            ◷ Aparece todo mês a partir de {MESES[f.mesInicio]}/{f.anoInicio}. Baixa automática conforme os gastos confirmados da categoria atingem o valor previsto.
          </div>
        </>
      )}
      {isParcela&&(
        <>
          <div style={{display:"flex",gap:10}}>
            <Field label="Cartão" half><select value={f.cartao} onChange={e=>set("cartao",e.target.value)} style={S.inp}>{CARTOES_LISTA.map(c=><option key={c}>{c}</option>)}</select></Field>
            <Field label="Total de parcelas" half><input value={f.parcelas} onChange={e=>set("parcelas",Math.max(1,+e.target.value||1))} type="number" min="1" max="60" style={S.inp}/></Field>
          </div>
          <div style={{display:"flex",gap:10}}>
            <Field label="Parcela atual" half><input value={f.parcelaAtual} onChange={e=>set("parcelaAtual",Math.max(1,+e.target.value||1))} type="number" min="1" style={S.inp}/></Field>
            <Field label="Mês da fatura atual" half><select value={f.mesFatura} onChange={e=>set("mesFatura",+e.target.value)} style={S.inp}>{MESES.map((m,i)=><option key={i} value={i}>{m}</option>)}</select></Field>
          </div>
          <Field label="Ano da fatura"><input value={f.anoFatura} onChange={e=>set("anoFatura",+e.target.value)} type="number" style={S.inp}/></Field>
          <div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:12,padding:"10px 12px",marginBottom:12,fontSize:12,color:"#9a3412"}}>
            💳 Parcela {f.parcelaAtual}/{f.parcelas} na fatura de {MESES[f.mesFatura]}/{f.anoFatura}. Gera pendente todo mês até a última parcela.
          </div>
        </>
      )}
      {(f.tipo==="receita_fixa"||f.tipo==="despesa_fixa")&&(
        <div style={{background:f.tipo==="receita_fixa"?"#d1fae5":"#fee2e2",border:`1.5px solid ${f.tipo==="receita_fixa"?"#a7f3d0":"#fecaca"}`,borderRadius:12,padding:"10px 12px",marginBottom:12,fontSize:12,color:f.tipo==="receita_fixa"?"#065f46":"#991b1b"}}>
          {tm.icon} Gera um pendente todo mês enquanto estiver ativo. Confirme com o valor real quando {f.tipo==="receita_fixa"?"receber":"pagar"}.
        </div>
      )}
      {f.id&&<label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:"#6b7280",marginBottom:12}}><input type="checkbox" checked={f.ativo!==false} onChange={e=>set("ativo",e.target.checked)} style={{width:15,height:15,accentColor:PURPLE}}/>Item ativo (desmarque para encerrar sem apagar)</label>}
      <button onClick={()=>onSave(f)} style={{...S.btn(`linear-gradient(135deg,${PURPLE},#a78bfa)`),width:"100%",padding:"13px 0",fontSize:14}}>
        {f.id?"Salvar":"Cadastrar"}
      </button>
    </Modal>
  );
}

// ─── Modal de confirmação de pendente ────────────────────────────────────────
function ConfirmPendenteModal({pendente,onConfirm,onClose}){
  const [valor,setValor]=useState(String(pendente.valorPrevisto||""));
  const tm=BASE_TIPOS[pendente.baseTipo]||{};
  return(
    <Modal title="✓ Confirmar lançamento" onClose={onClose} maxW={420}>
      <div style={{background:"#f8f9ff",border:"1.5px solid #e0e0f0",borderRadius:12,padding:"12px 14px",marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:800,color:"#1f2937"}}>{pendente.desc}</div>
        <div style={{fontSize:11,color:"#9ca3af",marginTop:3}}>{tm.icon} {tm.label}{pendente.cartao?` · ${pendente.cartao}`:""} · previsto {fmt(pendente.valorPrevisto)}</div>
      </div>
      <Field label="Valor real (R$)"><input value={valor} onChange={e=>setValor(e.target.value)} type="number" autoFocus style={S.inp} onKeyDown={e=>e.key==="Enter"&&+valor>0&&onConfirm(+valor)}/></Field>
      <button onClick={()=>onConfirm(+valor||0)} disabled={!(+valor>0)} style={{...S.btn("linear-gradient(135deg,#059669,#34d399)"),width:"100%",padding:"13px 0",fontSize:14,opacity:+valor>0?1:.5}}>
        ✓ Confirmar {tm.lancTipo==="entrada"?"recebimento":"pagamento"}
      </button>
    </Modal>
  );
}

// ─── Consultor Financeiro IA ─────────────────────────────────────────────────
function ConsultorFinanceiro({analises,atualId,mesLabel,loading,erro,onGerar,onClose}){
  const sorted=[...analises].sort((x,y)=>(y.data||0)-(x.data||0));
  const [view,setView]=useState("atual");
  const [selId,setSelId]=useState(atualId);
  const a=sorted.find(x=>x.id===selId)||sorted.find(x=>x.id===atualId)||null;
  const corNota=n=>n>=7?"#10b981":n>=5?"#f59e0b":"#ef4444";
  const PIE=["#6c63ff","#10b981","#f97316","#ef4444","#a855f7","#0ea5e9","#f59e0b","#ec4899","#14b8a6"];
  const ICON={positivo:"✅",alerta:"⚠️",neutro:"ℹ️"};
  const AVA={ok:{c:"#10b981",l:"ok"},alto:{c:"#f59e0b",l:"alto"},critico:{c:"#ef4444",l:"crítico"}};
  const pill={background:"rgba(255,255,255,0.18)",border:"none",borderRadius:50,color:"#fff",padding:"8px 12px",cursor:"pointer",fontSize:12,fontWeight:800};
  let pieGrad="#e5e7eb";
  if(a&&a.categorias&&a.categorias.length){ let acc=0; const stops=a.categorias.map((c,i)=>{const st=acc;acc=Math.min(100,acc+(+c.percentual||0));return `${PIE[i%PIE.length]} ${st}% ${acc}%`;}); pieGrad=`conic-gradient(${stops.join(",")})`; }
  const nota=a?Math.round((+a.notaSaude||0)*10)/10:0;
  return(
    <div style={{position:"fixed",inset:0,background:"#f0f4ff",zIndex:600,overflowY:"auto",fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <div style={{background:`linear-gradient(135deg,${PURPLE},#a78bfa)`,padding:"18px 16px",position:"sticky",top:0,zIndex:2,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{color:"#fff",fontSize:18,fontWeight:900}}>🤖 Consultor</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setView(view==="historico"?"atual":"historico")} style={pill}>📅 Histórico</button>
          <button onClick={onClose} style={{...pill,width:36,padding:"8px 0",textAlign:"center"}}>✕</button>
        </div>
      </div>
      <div style={{maxWidth:480,margin:"0 auto",padding:16}}>
        {erro&&<div style={{background:"#fef2f2",border:"1.5px solid #fecaca",color:"#b91c1c",borderRadius:12,padding:"10px 12px",fontSize:12,marginBottom:14}}>{erro}</div>}
        {view==="historico"?(
          <div>
            <div style={{fontSize:15,fontWeight:800,color:"#374151",marginBottom:12}}>📅 Análises anteriores</div>
            {sorted.length===0?<div style={{textAlign:"center",color:"#9ca3af",padding:"24px 0",fontSize:13}}>Nenhuma análise ainda.</div>
            :sorted.map(an=>(
              <button key={an.id} onClick={()=>{setSelId(an.id);setView("atual");}} style={{width:"100%",textAlign:"left",background:"#fff",border:"1.5px solid #f0f0f5",borderRadius:14,padding:"12px 14px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:corNota(an.notaSaude)+"20",color:corNota(an.notaSaude),display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:900,flexShrink:0}}>{Math.round(an.notaSaude)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#1f2937"}}>{MESES[an.mes]} {an.ano}</div>
                  <div style={{fontSize:11,color:"#9ca3af",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{an.resumo}</div>
                </div>
              </button>
            ))}
          </div>
        ):loading&&!a?(
          <div style={{textAlign:"center",padding:"60px 0"}}>
            <div style={{fontSize:32,marginBottom:12}}>🤖</div>
            <div style={{fontSize:14,fontWeight:700,color:PURPLE}}>Analisando suas finanças…</div>
            <div style={{fontSize:12,color:"#9ca3af",marginTop:6}}>Isso leva alguns segundos.</div>
          </div>
        ):!a?(
          <div style={{textAlign:"center",padding:"48px 0"}}>
            <div style={{fontSize:32,marginBottom:12}}>📊</div>
            <div style={{fontSize:14,color:"#6b7280",marginBottom:16}}>Ainda não há análise para {mesLabel}.</div>
            <button onClick={onGerar} style={{...S.btn(`linear-gradient(135deg,${PURPLE},#a78bfa)`),padding:"12px 24px",fontSize:14}}>🤖 Gerar análise</button>
          </div>
        ):(
          <>
            <div style={{display:"flex",alignItems:"center",gap:16,background:"#fff",borderRadius:20,padding:"18px",marginBottom:16,boxShadow:"0 4px 16px rgba(0,0,0,0.06)"}}>
              <div style={{width:84,height:84,borderRadius:"50%",background:`conic-gradient(${corNota(nota)} ${nota*10}%, #e5e7eb 0)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <div style={{width:64,height:64,borderRadius:"50%",background:"#fff",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:24,fontWeight:900,color:corNota(nota)}}>{nota}</span>
                  <span style={{fontSize:9,color:"#9ca3af",fontWeight:700}}>/ 10</span>
                </div>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:"#9ca3af",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>Saúde financeira</div>
                <div style={{fontSize:15,fontWeight:800,color:corNota(nota)}}>{nota>=7?"Muito boa 💚":nota>=5?"Atenção 💛":"Crítica ❤️"}</div>
                <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>{MESES[a.mes]} {a.ano}{a.data?` · ${new Date(a.data).toLocaleDateString("pt-BR")}`:""}</div>
              </div>
            </div>
            <div style={{background:`${PURPLE}10`,border:`1.5px solid ${PURPLE}30`,borderRadius:16,padding:"14px 16px",marginBottom:16,fontSize:14,fontWeight:600,color:"#374151",lineHeight:1.5}}>{a.resumo}</div>
            {a.categorias&&a.categorias.length>0&&(
              <div style={{background:"#fff",borderRadius:20,padding:"18px",marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
                <div style={{fontSize:14,fontWeight:800,color:"#374151",marginBottom:14}}>🥧 Gastos por categoria</div>
                <div style={{display:"flex",alignItems:"center",gap:18}}>
                  <div style={{width:120,height:120,borderRadius:"50%",background:pieGrad,flexShrink:0,boxShadow:"inset 0 0 0 1px rgba(0,0,0,0.04)"}}/>
                  <div style={{flex:1}}>
                    {a.categorias.map((c,i)=>{const av=AVA[c.avaliacao]||AVA.ok;return(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        <span style={{width:10,height:10,borderRadius:3,background:PIE[i%PIE.length],flexShrink:0}}/>
                        <span style={{flex:1,fontSize:11,fontWeight:700,color:"#374151",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.nome}</span>
                        <span style={{fontSize:11,fontWeight:800,color:"#6b7280"}}>{c.percentual}%</span>
                        <span style={{fontSize:9,fontWeight:800,color:av.c,background:av.c+"18",borderRadius:6,padding:"1px 5px"}}>{av.l}</span>
                      </div>
                    );})}
                  </div>
                </div>
              </div>
            )}
            {a.insights&&a.insights.length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:800,color:"#374151",marginBottom:10}}>💡 Insights</div>
                {a.insights.map((ins,i)=>(
                  <div key={i} style={{display:"flex",gap:10,background:"#fff",borderRadius:14,padding:"12px 14px",marginBottom:8,boxShadow:"0 2px 6px rgba(0,0,0,0.04)"}}>
                    <span style={{fontSize:16,flexShrink:0}}>{ICON[ins.tipo]||"ℹ️"}</span>
                    <span style={{fontSize:13,color:"#374151",lineHeight:1.5}}>{ins.texto}</span>
                  </div>
                ))}
              </div>
            )}
            {a.sugestoes&&a.sugestoes.length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:800,color:"#374151",marginBottom:10}}>🎯 Sugestões</div>
                {a.sugestoes.map((s,i)=>(
                  <div key={i} style={{display:"flex",gap:10,background:"#fff",borderRadius:14,padding:"12px 14px",marginBottom:8,boxShadow:"0 2px 6px rgba(0,0,0,0.04)"}}>
                    <span style={{width:22,height:22,borderRadius:"50%",background:PURPLE,color:"#fff",fontSize:11,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</span>
                    <span style={{fontSize:13,color:"#374151",lineHeight:1.5}}>{s}</span>
                  </div>
                ))}
              </div>
            )}
            {a.comparacao&&(
              <div style={{background:"#fff",borderRadius:16,padding:"14px 16px",marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
                <div style={{fontSize:13,fontWeight:800,color:"#374151",marginBottom:6}}>📈 Comparação com meses anteriores</div>
                <div style={{fontSize:13,color:"#6b7280",lineHeight:1.5}}>{a.comparacao}</div>
              </div>
            )}
            <button onClick={onGerar} disabled={loading} style={{...S.btn(`linear-gradient(135deg,${PURPLE},#a78bfa)`),width:"100%",padding:"13px 0",fontSize:14,marginBottom:24,opacity:loading?.6:1}}>
              {loading?"Atualizando…":"🔄 Atualizar análise"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Configurações Financeiras ───────────────────────────────────────────────
function ConfigFinanceira({config,onSave}){
  const [dia,setDia]=useState(config.diaFechamento||31);
  const [venc,setVenc]=useState({...config.vencimentos});
  useEffect(()=>{ setDia(config.diaFechamento||31); setVenc({...config.vencimentos}); },[config]);
  const setV=(c,v)=>setVenc(p=>({...p,[c]:v}));
  const clamp=(v,d)=>Math.max(1,Math.min(31,Math.round(+v||d)));
  const salvar=()=>{
    const vobj={}; CARTOES_LISTA.forEach(c=>{ vobj[c]=clamp(venc[c],25); });
    onSave({diaFechamento:clamp(dia,31), vencimentos:vobj});
  };
  return(
    <div style={{marginBottom:18}}>
      <div style={{fontSize:14,fontWeight:800,color:"#374151",marginBottom:4}}>⚙️ Configurações Financeiras</div>
      <div style={{fontSize:11,color:"#9ca3af",marginBottom:12}}>Usadas nos cálculos de "livre por dia" do painel.</div>
      <Field label="Dia de fechamento do mês (1–31)">
        <input value={dia} onChange={e=>setDia(e.target.value)} type="number" min="1" max="31" style={S.inp}/>
      </Field>
      <div style={{fontSize:11,color:"#6b7280",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",margin:"4px 0 8px"}}>Vencimento por cartão</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {CARTOES_LISTA.map(c=>(
          <Field key={c} label={c} half>
            <input value={venc[c]??25} onChange={e=>setV(c,e.target.value)} type="number" min="1" max="31" style={S.inp}/>
          </Field>
        ))}
      </div>
      <button onClick={salvar} style={{...S.btn(`linear-gradient(135deg,${PURPLE},#a78bfa)`),width:"100%",padding:"12px 0",fontSize:13,marginTop:6}}>💾 Salvar configurações</button>
      <div style={{height:1,background:"#f0f0f5",margin:"16px 0 0"}}/>
    </div>
  );
}

// ─── Tab Configurações ────────────────────────────────────────────────────────
function TabConfig({baseItems,customCats,user,familyCode,membros=[],onAddMembro,onDelMembro,config={},onSaveConfig,onAdd,onEdit,onDelete,onLogout}){
  const [novoMembro,setNovoMembro]=useState("");
  const addM2=()=>{ const n=novoMembro.trim(); if(!n) return; onAddMembro&&onAddMembro(n); setNovoMembro(""); };
  return(
    <div>
      <div style={{background:"linear-gradient(135deg,#475569,#94a3b8)",padding:"20px 20px 28px",borderRadius:"0 0 28px 28px"}}>
        <div style={{textAlign:"center"}}>
          <div style={{color:"rgba(255,255,255,0.7)",fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:600}}>Configurações</div>
          <div style={{color:"#fff",fontSize:24,fontWeight:900,margin:"4px 0"}}>⚙️ Ajustes</div>
          <div style={{color:"rgba(255,255,255,0.6)",fontSize:12}}>{user?.email} · família <strong>{familyCode}</strong></div>
        </div>
      </div>
      <div style={{padding:"16px 16px 0"}}>
        {/* Membros */}
        <div style={{fontSize:14,fontWeight:800,color:"#374151",marginBottom:10}}>👥 Membros</div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <input value={novoMembro} onChange={e=>setNovoMembro(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addM2()} placeholder="Nome do membro" style={S.inp}/>
          <button onClick={addM2} style={{...S.btn(`linear-gradient(135deg,${PURPLE},#a78bfa)`),padding:"0 18px",fontSize:18,flexShrink:0}}>+</button>
        </div>
        {membros.length===0
          ? <div style={{fontSize:12,color:"#9ca3af",marginBottom:18,padding:"0 2px"}}>Nenhum membro cadastrado.</div>
          : <div style={{marginBottom:18}}>{membros.map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1.5px solid #f0f0f5",borderRadius:10,padding:"8px 12px",marginBottom:6,boxShadow:"0 2px 6px rgba(0,0,0,0.04)"}}>
                <span style={{flex:1,fontSize:13,fontWeight:700,color:"#1f2937"}}>👤 {m.nome}</span>
                <button onClick={()=>onDelMembro&&onDelMembro(m.id)} style={{background:"#fef2f2",border:"none",borderRadius:8,color:"#ef4444",padding:"5px 7px",cursor:"pointer",fontSize:11}}>✕</button>
              </div>
            ))}</div>
        }
        <div style={{height:1,background:"#f0f0f5",marginBottom:16}}/>

        {/* Cadastro Base */}
        <div style={{fontSize:14,fontWeight:800,color:"#374151",marginBottom:4}}>📦 Cadastro Base</div>
        <div style={{fontSize:11,color:"#9ca3af",marginBottom:14}}>Itens recorrentes que geram pendentes automáticos todo mês.</div>
        {Object.entries(BASE_TIPOS).map(([tipo,tm])=>{
          const items=baseItems.filter(b=>b.tipo===tipo);
          return(
            <div key={tipo} style={{marginBottom:18}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:13,fontWeight:700,color:tm.color}}>{tm.icon} {tm.label} {items.length>0&&<span style={{color:"#9ca3af",fontWeight:600}}>({items.length})</span>}</div>
                <button onClick={()=>onAdd(tipo)} style={{background:tm.color+"15",border:`1.5px solid ${tm.color}40`,borderRadius:10,color:tm.color,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:800}}>+ Adicionar</button>
              </div>
              {items.length===0
                ? <div style={{fontSize:12,color:"#c4c8d4",padding:"8px 0 0 4px"}}>Nenhum item cadastrado.</div>
                : items.map(b=>{
                  const c=getCat(b.catId,customCats);
                  const inativo=b.ativo===false;
                  return(
                    <div key={b.id} style={{background:"#fff",borderRadius:12,padding:"10px 12px",marginBottom:6,boxShadow:"0 2px 6px rgba(0,0,0,0.04)",display:"flex",alignItems:"center",gap:10,opacity:inativo?.55:1}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:700,color:"#1f2937",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                          {b.desc}{tipo==="parcela_cartao"&&` (${b.parcelaAtual||1}/${b.parcelas||1})`}
                          {inativo&&<span style={{marginLeft:6,background:"#f3f4f6",color:"#9ca3af",fontSize:9,fontWeight:800,borderRadius:6,padding:"1px 6px",verticalAlign:"middle"}}>ENCERRADO</span>}
                        </div>
                        <div style={{fontSize:10,color:"#9ca3af",marginTop:2}}>
                          {b.catId&&`${c.icon} ${c.label} · `}{b.membro||""}{tipo==="parcela_cartao"&&b.cartao?` · ${b.cartao}`:""}{tipo==="prevista"?` · desde ${MESES[b.mesInicio||0]}/${b.anoInicio||""}`:""}
                        </div>
                      </div>
                      <div style={{fontSize:12,fontWeight:900,color:tm.color,flexShrink:0}}>{fmt(b.valorPrevisto)}</div>
                      <div style={{display:"flex",gap:4,flexShrink:0}}>
                        <button onClick={()=>onEdit(b)} style={{background:"#f3f4f6",border:"none",borderRadius:8,color:"#6b7280",padding:"5px 7px",cursor:"pointer",fontSize:11}}>✏</button>
                        <button onClick={()=>onDelete(b.id)} style={{background:"#fef2f2",border:"none",borderRadius:8,color:"#ef4444",padding:"5px 7px",cursor:"pointer",fontSize:11}}>✕</button>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          );
        })}
        {/* Configurações Financeiras */}
        <ConfigFinanceira config={config} onSave={onSaveConfig}/>

        {/* Sair */}
        <div style={{borderTop:"1.5px solid #e5e7eb",marginTop:8,paddingTop:16,marginBottom:20}}>
          <div style={{fontSize:14,fontWeight:800,color:"#374151",marginBottom:10}}>🚪 Sair</div>
          <button onClick={onLogout} style={{...S.btn("#fef2f2","#ef4444"),width:"100%",padding:"13px 0",fontSize:13,border:"1.5px solid #fecaca"}}>
            ⎋ Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
}

function TransfForm({data,onSave,onClose,contas,viewMes,viewAno}){
  const [f,setF]=useState({contaOrigem:"C6",contaDestino:"Inter",valor:"",desc:"",data:todayStr(),mes:viewMes,ano:viewAno,tipo:"transferencia",...data});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const isFatura=f.tipo==="fatura";
  return(
    <Modal title={isFatura?"Pagar Fatura do Cartão":"Transferência entre Contas"} onClose={onClose} maxW={420}>
      <div style={{background:isFatura?"#fff7ed":"#f0f4ff",border:`1.5px solid ${isFatura?"#fed7aa":"#c7d2fe"}`,borderRadius:14,padding:"12px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
        <div style={{flex:1,background:"#fff",borderRadius:10,padding:"8px 12px",textAlign:"center"}}>
          <div style={{fontSize:10,color:"#9ca3af",marginBottom:2}}>De</div>
          <select value={f.contaOrigem} onChange={e=>set("contaOrigem",e.target.value)} style={{...S.inp,padding:"4px 8px",fontSize:12,textAlign:"center",background:"transparent",border:"none"}}>
            {CONTAS_LISTA.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{fontSize:20,color:isFatura?"#f97316":PURPLE}}>→</div>
        <div style={{flex:1,background:"#fff",borderRadius:10,padding:"8px 12px",textAlign:"center"}}>
          <div style={{fontSize:10,color:"#9ca3af",marginBottom:2}}>{isFatura?"Cartão":"Para"}</div>
          {isFatura
            ? <select value={f.contaDestino} onChange={e=>set("contaDestino",e.target.value)} style={{...S.inp,padding:"4px 8px",fontSize:12,textAlign:"center",background:"transparent",border:"none"}}>{CARTOES_LISTA.map(c=><option key={c}>{c}</option>)}</select>
            : <select value={f.contaDestino} onChange={e=>set("contaDestino",e.target.value)} style={{...S.inp,padding:"4px 8px",fontSize:12,textAlign:"center",background:"transparent",border:"none"}}>{CONTAS_LISTA.filter(c=>c!==f.contaOrigem).map(c=><option key={c}>{c}</option>)}</select>
          }
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <Field label="Valor (R$)" half><input value={f.valor} onChange={e=>set("valor",e.target.value)} type="number" placeholder="0,00" style={S.inp} autoFocus/></Field>
        <Field label="Data" half><input value={f.data||""} onChange={e=>{set("data",e.target.value);if(e.target.value){const d=new Date(e.target.value+"T00:00:00");set("mes",d.getMonth());set("ano",d.getFullYear());}}} type="date" style={S.inp}/></Field>
      </div>
      <Field label="Descrição (opcional)"><input value={f.desc} onChange={e=>set("desc",e.target.value)} placeholder={isFatura?"Pagamento fatura":"Descrição da transferência"} style={S.inp}/></Field>
      <button onClick={()=>onSave(f)} style={{...S.btn(isFatura?"linear-gradient(135deg,#f97316,#ea580c)":`linear-gradient(135deg,${PURPLE},#a78bfa)`),width:"100%",padding:"13px 0",fontSize:14,marginTop:4}}>
        ✓ {isFatura?"Registrar pagamento":"Transferir"}
      </button>
    </Modal>
  );
}

function InvestForm({data,onSave,onClose}){
  const [f,setF]=useState({nome:"",tipo:"Renda Fixa",instituicao:"",saldoAtual:"",ultimaAtualizacao:todayStr(),...data});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const CORES={"Renda Fixa":"#10b981","Ações":"#3b82f6","FII":"#8b5cf6","Previdência":"#f59e0b","Outros":"#6b7280"};
  return(
    <Modal title={f.id?"Editar Investimento":"Novo Investimento"} onClose={onClose} maxW={420}>
      <Field label="Nome"><input value={f.nome} onChange={e=>set("nome",e.target.value)} placeholder="Ex: CDB Inter, PETR4, HGLG11..." style={S.inp}/></Field>
      <Field label="Tipo">
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {TIPOS_INVEST.map(t=>(
            <button key={t} onClick={()=>set("tipo",t)} type="button" style={{padding:"6px 12px",borderRadius:20,border:`1.5px solid ${f.tipo===t?CORES[t]:"#e0e0f0"}`,background:f.tipo===t?CORES[t]+"20":"#fff",color:f.tipo===t?CORES[t]:"#374151",fontWeight:700,fontSize:11,cursor:"pointer"}}>
              {t}
            </button>
          ))}
        </div>
      </Field>
      <div style={{display:"flex",gap:10}}>
        <Field label="Instituição" half><input value={f.instituicao} onChange={e=>set("instituicao",e.target.value)} placeholder="Ex: Inter, XP, B3..." style={S.inp}/></Field>
        <Field label="Saldo atual (R$)" half><input value={f.saldoAtual} onChange={e=>set("saldoAtual",e.target.value)} type="number" placeholder="0,00" style={S.inp}/></Field>
      </div>
      <Field label="Última atualização"><input value={f.ultimaAtualizacao||""} onChange={e=>set("ultimaAtualizacao",e.target.value)} type="date" style={S.inp}/></Field>
      <button onClick={()=>onSave(f)} style={{...S.btn(`linear-gradient(135deg,#4338ca,#818cf8)`),width:"100%",padding:"13px 0",fontSize:14,marginTop:4}}>
        {f.id?"Salvar":"✓ Adicionar"}
      </button>
    </Modal>
  );
}

function RelatorioIR({lancs,onClose}){
  const anos=[...new Set(lancs.map(l=>l.ano))].sort((a,b)=>b-a);
  const [anoSel,setAnoSel]=useState(anos[0]||HOJE.getFullYear());
  const dedutiveis=lancs.filter(l=>l.irDedutivel&&l.ano===anoSel&&l.status==="confirmado");
  const porTipo={};
  TIPOS_DEDUCAO_IR.forEach(t=>{porTipo[t]=dedutiveis.filter(l=>l.irTipo===t).reduce((s,l)=>s+(+l.valor||0),0);});
  const total=dedutiveis.reduce((s,l)=>s+(+l.valor||0),0);
  const CORES_IR={"Saúde/Médico":"#e879f9","Educação":"#a78bfa","Previdência Privada":"#3b82f6","Doação":"#10b981","Outro":"#6b7280"};
  return(
    <Modal title="📋 Relatório IR" onClose={onClose}>
      <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
        <span style={{fontSize:12,color:"#6b7280",fontWeight:600}}>Ano-base:</span>
        <select value={anoSel} onChange={e=>setAnoSel(+e.target.value)} style={{...S.inp,width:"auto",padding:"6px 10px",fontSize:13}}>
          {anos.map(a=><option key={a}>{a}</option>)}
        </select>
      </div>
      <div style={{background:`linear-gradient(135deg,#4338ca,#818cf8)`,borderRadius:16,padding:"16px",marginBottom:16,textAlign:"center"}}>
        <div style={{color:"rgba(255,255,255,0.7)",fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:600}}>Total dedutível {anoSel}</div>
        <div style={{color:"#fff",fontSize:32,fontWeight:900,letterSpacing:"-1px",margin:"4px 0"}}>{fmt(total)}</div>
        <div style={{color:"rgba(255,255,255,0.6)",fontSize:11}}>{dedutiveis.length} lançamento(s)</div>
      </div>
      {TIPOS_DEDUCAO_IR.map(tipo=>{
        const val=porTipo[tipo]||0;
        const items=dedutiveis.filter(l=>l.irTipo===tipo);
        if(!val) return null;
        return(
          <div key={tipo} style={{background:"#fff",border:"1.5px solid #f3f4f6",borderRadius:14,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1f2937"}}>{tipo}</div>
              <div style={{fontSize:15,fontWeight:900,color:CORES_IR[tipo]||PURPLE}}>{fmt(val)}</div>
            </div>
            {items.map(l=>(
              <div key={l.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#6b7280",padding:"3px 0",borderBottom:"1px solid #f9fafb"}}>
                <span>{l.desc}{l.data?` · ${fmtDate(l.data)}`:""}</span>
                <span style={{fontWeight:700,color:"#374151"}}>{fmt(l.valor)}</span>
              </div>
            ))}
          </div>
        );
      })}
      {dedutiveis.length===0&&(
        <div style={{textAlign:"center",color:"#9ca3af",padding:"24px 0",fontSize:13}}>Nenhum lançamento marcado como dedutível em {anoSel}</div>
      )}
    </Modal>
  );
}
