import { useState, useEffect, useCallback } from "react";
import { db, auth } from "./firebase";
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, getDoc
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "firebase/auth";

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const TODAY = new Date();
const CARTOES = ["C6","XP","Nubank","Inter","Outro"];
const MEMBERS = ["Alexandre","Tahis","Família"];

const CATS_DEFAULT = [
  {id:"alimentacao_r",  label:"Alimentação Regular",    icon:"🍽️", color:"#34d399"},
  {id:"alimentacao_nr", label:"Alimentação Não Regular", icon:"🍕", color:"#6ee7b7"},
  {id:"assinatura",     label:"Assinatura",              icon:"📱", color:"#60a5fa"},
  {id:"transporte",     label:"Transporte",              icon:"🚗", color:"#fbbf24"},
  {id:"medicamento",    label:"Medicamento",             icon:"💊", color:"#f472b6"},
  {id:"saude",          label:"Saúde",                   icon:"🏥", color:"#e879f9"},
  {id:"veiculo",        label:"Manutenção Veículo",      icon:"🔧", color:"#fb923c"},
  {id:"limpeza",        label:"Limpeza",                 icon:"🧹", color:"#94a3b8"},
  {id:"higiene",        label:"Higiene Pessoal",         icon:"🧴", color:"#7dd3fc"},
  {id:"educacao",       label:"Educação",                icon:"📚", color:"#a78bfa"},
  {id:"vestuario",      label:"Vestuário",               icon:"👕", color:"#f9a8d4"},
  {id:"lazer",          label:"Lazer",                   icon:"🎬", color:"#86efac"},
  {id:"moradia",        label:"Moradia",                 icon:"🏠", color:"#fde68a"},
  {id:"tecnologia",     label:"Tecnologia",              icon:"💻", color:"#67e8f9"},
  {id:"papelaria",      label:"Papelaria",               icon:"📝", color:"#d8b4fe"},
  {id:"salario",        label:"Salário",                 icon:"💰", color:"#34d399"},
  {id:"aluguel_rec",    label:"Aluguel Recebido",        icon:"🏢", color:"#6ee7b7"},
  {id:"reembolso_cat",  label:"Reembolso",               icon:"↩️", color:"#86efac"},
  {id:"outras",         label:"Outras",                  icon:"📦", color:"#6e7681"},
];
const CAT_COLORS = ["#34d399","#60a5fa","#f87171","#fbbf24","#a78bfa","#fb923c","#f472b6","#86efac","#67e8f9","#fde68a","#d8b4fe","#94a3b8"];
const CAT_ICONS = ["🍽️","🍕","📱","🚗","💊","🏥","🔧","🧹","🧴","📚","👕","🎬","🏠","💻","📝","💰","🏢","↩️","📦","⚡","🎓","🐾","🛒","🎁"];
const FORMAS_PAGAMENTO = ["PIX","TED","Depósito","Cartão de Débito","Dinheiro","Outro"];
const BANCOS_LIST = [{id:"C6",nome:"C6 Bank",cor:"#f87171"},{id:"Inter",nome:"Banco Inter",cor:"#fb923c"},{id:"Caixa",nome:"Caixa Econômica",cor:"#60a5fa"},{id:"XP",nome:"XP Investimentos",cor:"#34d399"},{id:"Santander",nome:"Santander",cor:"#f472b6"}];

const BASE_TIPOS = {
  receita_fixa:    {label:"Receita Fixa",          color:"#34d399", icon:"↑", lancTipo:"receita"},
  despesa_fixa:    {label:"Despesa Fixa",           color:"#f87171", icon:"↓", lancTipo:"despesa"},
  prevista:        {label:"Despesa Prevista",        color:"#f472b6", icon:"◷", lancTipo:"prevista"},
  reembolso_prev:  {label:"Reembolso Previsto",      color:"#86efac", icon:"↩", lancTipo:"reembolso"},
  parcela_cartao:  {label:"Parcela Cartão",         color:"#fb923c", icon:"▣", lancTipo:"cartao"},
  fidelidade:      {label:"Fidelidade Recorrente",  color:"#a78bfa", icon:"✦", lancTipo:"fidelidade"},
  aporte:          {label:"Aporte Recorrente",      color:"#60a5fa", icon:"◎", lancTipo:"aporte"},
  reembolso_fixo:  {label:"Reembolso Recorrente",   color:"#86efac", icon:"↩", lancTipo:"reembolso"},
};
const TIPO_META = {
  receita:    {label:"Receita",    color:"#34d399", icon:"↑", saida:false},
  despesa:    {label:"Despesa",    color:"#f87171", icon:"↓", saida:true},
  cartao:     {label:"Cartão",     color:"#fb923c", icon:"▣", saida:true},
  fidelidade: {label:"Fidelidade", color:"#a78bfa", icon:"✦", saida:true},
  aporte:     {label:"Aporte",     color:"#60a5fa", icon:"◎", saida:true},
  reembolso:  {label:"Reembolso",  color:"#86efac", icon:"↩", saida:false},
  prevista:   {label:"Prevista",   color:"#f472b6", icon:"◷", saida:true},
};

const fmt = (n) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(+n||0);
const addM = (m,a,n=1) => { let nm=m+n; return {mes:((nm%12)+12)%12, ano:a+Math.floor(nm/12+(nm<0&&nm%12!==0?1:0))}; };
const monthKey = (m,a) => `${a}-${String(m+1).padStart(2,"0")}`;
const cmpMonth = (m1,a1,m2,a2) => a1*12+m1-(a2*12+m2);
const famPath = (familyCode, col) => `familias/${familyCode}/${col}`;

// ─── UI Atoms ─────────────────────────────────────────────────────────────────
const inp = {background:"#0d1117",border:"1px solid #21262d",borderRadius:7,padding:"8px 11px",color:"#e6edf3",fontSize:13,fontFamily:"inherit",width:"100%"};
const btn = (bg,c="#fff") => ({background:bg,color:c,border:"none",borderRadius:8,padding:"9px 18px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"});

function Tag({tipo,status}){
  const t=TIPO_META[tipo]||{label:tipo,color:"#6e7681",icon:"•"};
  return <span style={{background:t.color+"20",color:t.color,border:`1px solid ${t.color}35`,borderRadius:5,padding:"2px 7px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{t.icon} {t.label}{status==="previsto"&&<span style={{marginLeft:4,opacity:.7}}>(previsto)</span>}</span>;
}
function CatTag({catId,cats}){
  if(!catId||!cats) return null;
  const c=[...CATS_DEFAULT,...(cats||[])].find(x=>x.id===catId);
  if(!c) return null;
  return <span style={{background:c.color+"18",color:c.color,border:`1px solid ${c.color}30`,borderRadius:5,padding:"2px 7px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{c.icon} {c.label}</span>;
}
function Toast({msg,ok}){return <div style={{position:"fixed",top:16,right:16,zIndex:9999,background:ok?"#0f4a2e":"#4a1010",border:`1px solid ${ok?"#34d399":"#f87171"}`,color:"#fff",borderRadius:8,padding:"9px 18px",fontSize:13,fontWeight:600,boxShadow:"0 4px 20px #00000077"}}>{msg}</div>;}
function Modal({title,children,onClose,maxW=560}){
  return(<div style={{position:"fixed",inset:0,background:"#000000aa",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:12}} onClick={onClose}>
    <div style={{background:"#161b22",border:"1px solid #30363d",borderRadius:16,padding:"22px",width:"100%",maxWidth:maxW,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 24px 80px #000000bb"}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:15,fontWeight:800,color:"#e6edf3"}}>{title}</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#6e7681",cursor:"pointer",fontSize:18}}>✕</button>
      </div>
      {children}
    </div>
  </div>);
}
function Field({label,children}){return <div><label style={{fontSize:11,color:"#6e7681",display:"block",marginBottom:4,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}</label>{children}</div>;}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({onLogin,existingUser}){
  const [modo,setModo]=useState("entrar");
  const [user,setUser]=useState(existingUser||null);
  const [email,setEmail]=useState("");
  const [senha,setSenha]=useState("");
  const [nome,setNome]=useState("");
  const [code,setCode]=useState("");
  const [modoFam,setModoFam]=useState("entrar");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  useEffect(()=>{
    if(existingUser){setUser(existingUser);setModo("familia");}
  },[]);

  const handleAuth=async()=>{
    if(!email.trim()||!senha){setErr("Preencha email e senha.");return;}
    setLoading(true);setErr("");
    try{
      let u;
      if(modo==="criar"){
        if(!nome.trim()){setErr("Informe seu nome.");setLoading(false);return;}
        const r=await createUserWithEmailAndPassword(auth,email.trim(),senha);
        u=r.user;
      } else {
        const r=await signInWithEmailAndPassword(auth,email.trim(),senha);
        u=r.user;
      }
      setUser(u);setModo("familia");
    }catch(e){
      const msgs={"auth/email-already-in-use":"Email já cadastrado. Faça login.","auth/wrong-password":"Senha incorreta.","auth/user-not-found":"Email não encontrado.","auth/weak-password":"Senha muito fraca (mín. 6 caracteres).","auth/invalid-email":"Email inválido.","auth/invalid-credential":"Email ou senha incorretos."};
      setErr(msgs[e.code]||"Erro: "+e.code);
    }
    setLoading(false);
  };

  const handleFamilia=async()=>{
    const c=code.trim().toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"");
    if(!c){setErr("Digite um código válido.");return;}
    setLoading(true);setErr("");
    try{
      const famRef=doc(db,"familias",c);
      const famSnap=await getDoc(famRef);
      if(modoFam==="criar"){
        if(famSnap.exists()){setErr("Código já existe. Escolha outro.");setLoading(false);return;}
        await setDoc(famRef,{criadoEm:Date.now(),criadoPor:user.uid});
      } else {
        if(!famSnap.exists()){setErr("Código não encontrado.");setLoading(false);return;}
      }
      localStorage.setItem("finanunes_family",c);
      onLogin(user,c);
    }catch(e){setErr("Erro ao acessar. Tente novamente.");}
    setLoading(false);
  };

  return(
    <div style={{minHeight:"100vh",background:"#090c10",display:"flex",alignItems:"center",justifyContent:"center",padding:16,fontFamily:"'Sora','Segoe UI',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0}input{outline:none;font-family:inherit}`}</style>
      <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:20,padding:"36px 32px",width:"100%",maxWidth:400,boxShadow:"0 24px 80px #000000aa"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:32,marginBottom:8}}>💚</div>
          <div style={{fontSize:22,fontWeight:800,color:"#e6edf3",letterSpacing:"-0.02em"}}>Saldo Livre</div>
          <div style={{fontSize:13,color:"#6e7681",marginTop:4}}>Controle Financeiro Familiar</div>
        </div>
        {modo!=="familia"&&(
          <>
            <div style={{display:"flex",gap:6,marginBottom:20,background:"#161b22",borderRadius:10,padding:4}}>
              {[["entrar","Entrar"],["criar","Criar conta"]].map(([k,l])=>(
                <button key={k} onClick={()=>{setModo(k);setErr("");}} style={{flex:1,padding:"8px 0",borderRadius:7,border:"none",fontFamily:"inherit",fontWeight:700,fontSize:13,cursor:"pointer",background:modo===k?"#21262d":"transparent",color:modo===k?"#e6edf3":"#6e7681"}}>{l}</button>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {modo==="criar"&&<Field label="Seu nome"><input value={nome} onChange={e=>setNome(e.target.value)} placeholder="Ex: Alexandre" style={inp}/></Field>}
              <Field label="Email"><input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="seu@email.com" style={inp} onKeyDown={e=>e.key==="Enter"&&handleAuth()}/></Field>
              <Field label="Senha"><input value={senha} onChange={e=>setSenha(e.target.value)} type="password" placeholder={modo==="criar"?"Mínimo 6 caracteres":"Sua senha"} style={inp} onKeyDown={e=>e.key==="Enter"&&handleAuth()}/></Field>
            </div>
            {err&&<div style={{fontSize:12,color:"#f87171",marginTop:10,background:"#f8717110",borderRadius:7,padding:"8px 12px"}}>{err}</div>}
            <button onClick={handleAuth} disabled={loading} style={{...btn("linear-gradient(135deg,#238636,#1a7f37)"),width:"100%",marginTop:16,padding:"12px 0",opacity:loading?.7:1}}>
              {loading?"Aguarde...":(modo==="criar"?"Criar conta":"Entrar")}
            </button>
          </>
        )}
        {modo==="familia"&&(
          <>
            <div style={{background:"#161b22",borderRadius:10,padding:"10px 14px",marginBottom:18,fontSize:13,color:"#8b949e"}}>
              ✓ Logado como <strong style={{color:"#e6edf3"}}>{user?.email}</strong>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:16,background:"#161b22",borderRadius:10,padding:4}}>
              {[["entrar","Entrar na família"],["criar","Criar família"]].map(([k,l])=>(
                <button key={k} onClick={()=>{setModoFam(k);setErr("");}} style={{flex:1,padding:"8px 0",borderRadius:7,border:"none",fontFamily:"inherit",fontWeight:700,fontSize:12,cursor:"pointer",background:modoFam===k?"#21262d":"transparent",color:modoFam===k?"#e6edf3":"#6e7681"}}>{l}</button>
              ))}
            </div>
            <Field label={modoFam==="criar"?"Crie um código para sua família":"Código da família"}>
              <input value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleFamilia()} placeholder={modoFam==="criar"?"Ex: familia-nunes-2026":"Código fornecido pelo responsável"} style={inp}/>
            </Field>
            {modoFam==="criar"&&<div style={{fontSize:11,color:"#6e7681",marginTop:6}}>Use letras, números e hífens. Compartilhe com sua família.</div>}
            {err&&<div style={{fontSize:12,color:"#f87171",marginTop:10,background:"#f8717110",borderRadius:7,padding:"8px 12px"}}>{err}</div>}
            <button onClick={handleFamilia} disabled={loading} style={{...btn("linear-gradient(135deg,#1f6feb,#1158c7)"),width:"100%",marginTop:16,padding:"12px 0",opacity:loading?.7:1}}>
              {loading?"Aguarde...":(modoFam==="criar"?"Criar família":"Entrar")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Category Manager Modal ───────────────────────────────────────────────────
function CatModal({cats,familyCode,onClose}){
  const [nova,setNova]=useState({label:"",icon:"📦",color:CAT_COLORS[0]});
  const addCat=async()=>{
    if(!nova.label.trim()) return;
    const id="custom_"+Date.now();
    await setDoc(doc(db,famPath(familyCode,"categorias"),id),{id,label:nova.label.trim(),icon:nova.icon,color:nova.color,custom:true});
    setNova({label:"",icon:"📦",color:CAT_COLORS[0]});
  };
  const delCat=async(id)=>{await deleteDoc(doc(db,famPath(familyCode,"categorias"),id));};
  return(
    <Modal title="🏷️ Gerenciar Categorias" onClose={onClose} maxW={520}>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:12,color:"#6e7681",marginBottom:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>Nova categoria</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,alignItems:"center"}}>
          <input value={nova.label} onChange={e=>setNova(p=>({...p,label:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addCat()} placeholder="Nome da categoria" style={inp}/>
          <select value={nova.icon} onChange={e=>setNova(p=>({...p,icon:e.target.value}))} style={{...inp,width:70,textAlign:"center"}}>{CAT_ICONS.map(ic=><option key={ic} value={ic}>{ic}</option>)}</select>
          <select value={nova.color} onChange={e=>setNova(p=>({...p,color:e.target.value}))} style={{...inp,width:50}}>{CAT_COLORS.map(c=><option key={c} value={c} style={{background:c}}>■</option>)}</select>
        </div>
        <button onClick={addCat} style={{...btn("linear-gradient(135deg,#1f6feb,#1158c7)"),width:"100%",marginTop:10,padding:"10px 0"}}>+ Adicionar categoria</button>
      </div>
      <div style={{borderTop:"1px solid #21262d",paddingTop:14}}>
        <div style={{fontSize:12,color:"#6e7681",marginBottom:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>Categorias personalizadas</div>
        {cats.length===0?<div style={{fontSize:13,color:"#6e7681",textAlign:"center",padding:"16px 0"}}>Nenhuma ainda.</div>
        :cats.map(c=>(
          <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,background:"#0d1117",borderRadius:9,padding:"10px 12px",border:`1px solid ${c.color}25`}}>
            <span style={{fontSize:18}}>{c.icon}</span>
            <span style={{flex:1,fontSize:13,fontWeight:600,color:"#e6edf3"}}>{c.label}</span>
            <span style={{width:14,height:14,borderRadius:3,background:c.color,flexShrink:0}}/>
            <button onClick={()=>delCat(c.id)} style={{background:"#21262d",border:"none",borderRadius:6,color:"#f87171",padding:"4px 8px",cursor:"pointer",fontSize:11}}>✕</button>
          </div>
        ))}
        <div style={{fontSize:11,color:"#6e7681",marginTop:12}}>As {CATS_DEFAULT.length} categorias padrão não podem ser removidas.</div>
      </div>
    </Modal>
  );
}

// ─── Category Select com criação rápida ──────────────────────────────────────
function CatSelect({value,onChange,cats,familyCode}){
  const all=[...CATS_DEFAULT,...(cats||[])];
  const [criando,setCriando]=useState(false);
  const [nova,setNova]=useState({label:"",icon:"📦",color:CAT_COLORS[0]});
  const salvar=async()=>{
    if(!nova.label.trim()) return;
    const id="custom_"+Date.now();
    await setDoc(doc(db,famPath(familyCode,"categorias"),id),{id,label:nova.label.trim(),icon:nova.icon,color:nova.color,custom:true});
    onChange(id);
    setCriando(false);
    setNova({label:"",icon:"📦",color:CAT_COLORS[0]});
  };
  if(criando) return(
    <div style={{background:"#0d1117",border:"1px solid #1f6feb55",borderRadius:8,padding:"10px 12px"}}>
      <div style={{fontSize:11,color:"#60a5fa",marginBottom:8,fontWeight:700}}>Nova categoria</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 60px 44px",gap:6,marginBottom:8}}>
        <input value={nova.label} onChange={e=>setNova(p=>({...p,label:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&salvar()} placeholder="Ex: Cuidado e Beleza" style={inp} autoFocus/>
        <select value={nova.icon} onChange={e=>setNova(p=>({...p,icon:e.target.value}))} style={{...inp,padding:"8px 4px",textAlign:"center"}}>{CAT_ICONS.map(ic=><option key={ic} value={ic}>{ic}</option>)}</select>
        <select value={nova.color} onChange={e=>setNova(p=>({...p,color:e.target.value}))} style={{...inp,padding:"8px 4px"}}>{CAT_COLORS.map(c=><option key={c} value={c} style={{background:c}}>■</option>)}</select>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>setCriando(false)} style={{...btn("#21262d","#8b949e"),flex:1,padding:"7px 0",fontSize:12}}>Cancelar</button>
        <button onClick={salvar} style={{...btn("linear-gradient(135deg,#1f6feb,#1158c7)"),flex:2,padding:"7px 0",fontSize:12}}>✓ Criar e selecionar</button>
      </div>
    </div>
  );
  return(
    <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:6}}>
      <select value={value||""} onChange={e=>onChange(e.target.value)} style={inp}>
        <option value="">— Sem categoria —</option>
        {all.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
      </select>
      <button type="button" onClick={()=>setCriando(true)} title="Criar nova categoria" style={{...btn("#1f6feb"),padding:"8px 12px",fontSize:13,borderRadius:7}}>+</button>
    </div>
  );
}

// ─── Split Editor ─────────────────────────────────────────────────────────────
function SplitEditor({total,splits,onChange,cats,familyCode}){
  const totalSplit=splits.reduce((s,x)=>s+(+x.valor||0),0);
  const resto=Math.round(((+total||0)-totalSplit)*100)/100;
  const add=()=>onChange([...splits,{catId:"",valor:""}]);
  const upd=(i,k,v)=>onChange(splits.map((s,j)=>j===i?{...s,[k]:v}:s));
  const rem=(i)=>onChange(splits.filter((_,j)=>j!==i));
  return(
    <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:"12px 14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontSize:12,color:"#6e7681",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>Divisão por categoria</span>
        <button type="button" onClick={add} style={{...btn("#21262d","#8b949e"),padding:"4px 10px",fontSize:12}}>+ Adicionar</button>
      </div>
      {splits.map((s,i)=>(
        <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 120px 32px",gap:8,marginBottom:8,alignItems:"center"}}>
          <CatSelect value={s.catId} onChange={v=>upd(i,"catId",v)} cats={cats} familyCode={familyCode}/>
          <input value={s.valor} onChange={e=>upd(i,"valor",e.target.value)} type="number" placeholder="R$" style={inp}/>
          <button type="button" onClick={()=>rem(i)} style={{background:"#21262d",border:"none",borderRadius:6,color:"#f87171",cursor:"pointer",fontSize:14,height:36}}>✕</button>
        </div>
      ))}
      {splits.length>0&&(
        <div style={{display:"flex",justifyContent:"space-between",marginTop:8,paddingTop:8,borderTop:"1px solid #21262d",fontSize:12}}>
          <span style={{color:"#6e7681"}}>Total: {fmt(totalSplit)}</span>
          <span style={{color:Math.abs(resto)<0.01?"#34d399":"#fbbf24",fontWeight:700}}>{Math.abs(resto)<0.01?"✓ Completo":`Restante: ${fmt(resto)}`}</span>
        </div>
      )}
    </div>
  );
}

// ─── Plano de Contas Form ─────────────────────────────────────────────────────
function PlanoForm({tipo,data,grupoId,categoriaId,onSave,onClose,grupos,categorias}){
  const [nome,setNome]=useState(data?.nome||"");
  const [cor,setCor]=useState(data?.cor||CAT_COLORS[0]);
  const [gId,setGId]=useState(data?.grupoId||grupoId||"");
  const [cId,setCId]=useState(data?.categoriaId||categoriaId||"");
  const labels={grupo:"Grupo",categoria:"Categoria",subcategoria:"Subcategoria"};
  const cats=categorias.filter(c=>c.grupoId===(tipo==="subcategoria"?gId:gId));
  return(
    <Modal title={`${data?.id?"Editar":"Novo"} ${labels[tipo]||tipo}`} onClose={onClose} maxW={420}>
      <div style={{display:"grid",gap:10}}>
        <Field label="Nome"><input value={nome} onChange={e=>setNome(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onSave({...data,tipo,nome,cor,grupoId:gId,categoriaId:cId})} autoFocus style={inp}/></Field>
        {tipo==="categoria"&&grupos.length>0&&<Field label="Grupo"><select value={gId} onChange={e=>setGId(e.target.value)} style={inp}>{grupos.map(g=><option key={g.id} value={g.id}>{g.nome}</option>)}</select></Field>}
        {tipo==="subcategoria"&&<>
          <Field label="Grupo"><select value={gId} onChange={e=>{setGId(e.target.value);setCId("");}} style={inp}>{grupos.map(g=><option key={g.id} value={g.id}>{g.nome}</option>)}</select></Field>
          <Field label="Categoria"><select value={cId} onChange={e=>setCId(e.target.value)} style={inp}><option value="">— Selecione —</option>{categorias.filter(c=>c.grupoId===gId).map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
        </>}
        <Field label="Cor">
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {CAT_COLORS.map(c=><button key={c} type="button" onClick={()=>setCor(c)} style={{width:28,height:28,borderRadius:6,background:c,border:cor===c?"2px solid #fff":"2px solid transparent",cursor:"pointer"}}/>)}
          </div>
        </Field>
      </div>
      <button onClick={()=>onSave({...data,tipo,nome:nome.trim(),cor,grupoId:gId,categoriaId:cId})} style={{...btn("linear-gradient(135deg,#1f6feb,#1158c7)"),width:"100%",marginTop:14,padding:"11px 0"}}>{data?.id?"Salvar":"Cadastrar"}</button>
    </Modal>
  );
}

// ─── Plano de Contas Tab ──────────────────────────────────────────────────────
function PlanoContaTab({planoConta,onSave,onDelete}){
  const [planoModal,setPlanoModal]=useState(null);
  const grupos=planoConta.filter(p=>p.tipo==="grupo");
  const getCats=(gId)=>planoConta.filter(p=>p.tipo==="categoria"&&p.grupoId===gId);
  const getSubs=(cId)=>planoConta.filter(p=>p.tipo==="subcategoria"&&p.categoriaId===cId);
  const categorias=planoConta.filter(p=>p.tipo==="categoria");

  const rowStyle=(cor)=>({background:"#0d1117",border:`1px solid ${cor||"#21262d"}33`,borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:8,marginBottom:6});
  const indentStyle=(level)=>({marginLeft:level*22,marginBottom:4});

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:13,color:"#6e7681"}}>Estrutura hierárquica: <strong style={{color:"#e6edf3"}}>Grupo → Categoria → Subcategoria</strong></div>
        <button onClick={()=>setPlanoModal({tipo:"grupo",data:{}})} style={{...btn("linear-gradient(135deg,#1f6feb,#1158c7)"),fontSize:12,padding:"7px 14px"}}>+ Grupo</button>
      </div>
      {grupos.length===0&&(
        <div style={{textAlign:"center",color:"#6e7681",padding:"44px 0",border:"1px dashed #21262d",borderRadius:12}}>
          <div style={{fontSize:28,marginBottom:8}}>📂</div><div>Nenhum grupo cadastrado. Clique em <strong>+ Grupo</strong> para começar.</div>
        </div>
      )}
      {grupos.map(g=>(
        <div key={g.id} style={{marginBottom:10}}>
          <div style={{...rowStyle(g.cor),background:"#161b22",border:`1px solid ${g.cor||"#21262d"}55`}}>
            <div style={{width:12,height:12,borderRadius:3,background:g.cor||"#6e7681",flexShrink:0}}/>
            <span style={{flex:1,fontWeight:800,fontSize:14,color:"#e6edf3"}}>{g.nome}</span>
            <span style={{fontSize:11,color:"#6e7681",marginRight:6}}>{getCats(g.id).length} categoria(s)</span>
            <button onClick={()=>setPlanoModal({tipo:"categoria",data:{},grupoId:g.id})} style={{...btn("#1f6feb"),padding:"4px 10px",fontSize:11,marginRight:4}}>+ Cat</button>
            <button onClick={()=>setPlanoModal({tipo:"grupo",data:{...g}})} style={{background:"#21262d",border:"none",borderRadius:6,color:"#8b949e",padding:"4px 8px",cursor:"pointer",fontSize:11,marginRight:4}}>✏</button>
            <button onClick={()=>onDelete(g.id)} style={{background:"#21262d",border:"none",borderRadius:6,color:"#f87171",padding:"4px 8px",cursor:"pointer",fontSize:11}}>✕</button>
          </div>
          {getCats(g.id).map(cat=>(
            <div key={cat.id} style={indentStyle(1)}>
              <div style={{...rowStyle(cat.cor),background:"#0d1117"}}>
                <div style={{width:10,height:10,borderRadius:3,background:cat.cor||"#6e7681",flexShrink:0}}/>
                <span style={{flex:1,fontWeight:700,fontSize:13,color:"#c9d1d9"}}>{cat.nome}</span>
                <span style={{fontSize:11,color:"#6e7681",marginRight:6}}>{getSubs(cat.id).length} sub(s)</span>
                <button onClick={()=>setPlanoModal({tipo:"subcategoria",data:{},grupoId:g.id,categoriaId:cat.id})} style={{...btn("#1f6feb"),padding:"3px 8px",fontSize:10,marginRight:4}}>+ Sub</button>
                <button onClick={()=>setPlanoModal({tipo:"categoria",data:{...cat}})} style={{background:"#21262d",border:"none",borderRadius:6,color:"#8b949e",padding:"3px 7px",cursor:"pointer",fontSize:10,marginRight:4}}>✏</button>
                <button onClick={()=>onDelete(cat.id)} style={{background:"#21262d",border:"none",borderRadius:6,color:"#f87171",padding:"3px 7px",cursor:"pointer",fontSize:10}}>✕</button>
              </div>
              {getSubs(cat.id).map(sub=>(
                <div key={sub.id} style={indentStyle(1)}>
                  <div style={{...rowStyle(sub.cor),padding:"8px 12px"}}>
                    <div style={{width:8,height:8,borderRadius:2,background:sub.cor||"#6e7681",flexShrink:0}}/>
                    <span style={{flex:1,fontSize:12,color:"#8b949e"}}>{sub.nome}</span>
                    <button onClick={()=>setPlanoModal({tipo:"subcategoria",data:{...sub}})} style={{background:"#21262d",border:"none",borderRadius:6,color:"#8b949e",padding:"3px 7px",cursor:"pointer",fontSize:10,marginRight:4}}>✏</button>
                    <button onClick={()=>onDelete(sub.id)} style={{background:"#21262d",border:"none",borderRadius:6,color:"#f87171",padding:"3px 7px",cursor:"pointer",fontSize:10}}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
      {planoModal&&(
        <PlanoForm
          tipo={planoModal.tipo}
          data={planoModal.data}
          grupoId={planoModal.grupoId}
          categoriaId={planoModal.categoriaId}
          grupos={grupos}
          categorias={categorias}
          onSave={(d)=>{onSave(d);setPlanoModal(null);}}
          onClose={()=>setPlanoModal(null)}
        />
      )}
    </div>
  );
}

// ─── Plano de Contas Category Select ─────────────────────────────────────────
function PlanocatSelect({value,onChange,planoConta}){
  const grupos=planoConta.filter(p=>p.tipo==="grupo");
  const getCats=(gId)=>planoConta.filter(p=>p.tipo==="categoria"&&p.grupoId===gId);
  const getSubs=(cId)=>planoConta.filter(p=>p.tipo==="subcategoria"&&p.categoriaId===cId);
  return(
    <select value={value||""} onChange={e=>onChange(e.target.value)} style={inp}>
      <option value="">— Sem categoria —</option>
      {grupos.map(g=>{
        const cats=getCats(g.id);
        if(cats.length===0) return null;
        return cats.map(cat=>{
          const subs=getSubs(cat.id);
          if(subs.length===0) return <option key={cat.id} value={cat.id}>{g.nome} › {cat.nome}</option>;
          return subs.map(sub=><option key={sub.id} value={sub.id}>{g.nome} › {cat.nome} › {sub.nome}</option>);
        });
      })}
    </select>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
function ConfirmModal({lanc,onConfirm,onClose,cats,familyCode}){
  const [valor,setValor]=useState(String(lanc.valorPrevisto||lanc.valor||""));
  const [reembolso,setReembolso]=useState(String(lanc.reembolso||""));
  const [catId,setCatId]=useState(lanc.catId||"");
  const tm=TIPO_META[lanc.tipo]||{};
  return(
    <Modal title={lanc.tipo==="prevista"?"Dar baixa":"Confirmar lançamento"} onClose={onClose} maxW={420}>
      <div style={{background:"#0d1117",borderRadius:10,padding:"12px 14px",marginBottom:16,border:`1px solid ${tm.color||"#30363d"}30`}}>
        <div style={{fontWeight:700,color:"#e6edf3",marginBottom:4}}>{lanc.desc}</div>
        <Tag tipo={lanc.tipo}/>
        {lanc.valorPrevisto&&<span style={{fontSize:12,color:"#6e7681",marginLeft:8}}>Previsto: {fmt(lanc.valorPrevisto)}</span>}
      </div>
      <div style={{display:"grid",gap:10}}>
        <Field label="Valor real (R$)"><input value={valor} onChange={e=>setValor(e.target.value)} type="number" style={inp} autoFocus/></Field>
        {!["receita","reembolso"].includes(lanc.tipo)&&<Field label="Reembolso esperado (R$)"><input value={reembolso} onChange={e=>setReembolso(e.target.value)} type="number" placeholder="0,00" style={inp}/></Field>}
        <Field label="Categoria"><CatSelect value={catId} onChange={setCatId} cats={cats} familyCode={familyCode}/></Field>
        {lanc.tipo==="prevista"&&<div style={{background:"#f472b610",border:"1px solid #f472b630",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#f472b6"}}>✓ Continua nos próximos meses até encerrar no Cadastro Base.</div>}
      </div>
      <div style={{display:"flex",gap:8,marginTop:16}}>
        <button onClick={onClose} style={{...btn("#21262d","#8b949e"),flex:1}}>Cancelar</button>
        <button onClick={()=>onConfirm({...lanc,valor:+valor,reembolso:+reembolso||0,status:"confirmado",catId})} style={{...btn("linear-gradient(135deg,#238636,#1a7f37)"),flex:2}}>{lanc.tipo==="prevista"?"✓ Dar baixa":"✓ Confirmar"}</button>
      </div>
    </Modal>
  );
}

// ─── Base Form ────────────────────────────────────────────────────────────────
function BaseForm({data,onSave,onClose,cats,familyCode}){
  const [f,setF]=useState({tipo:"receita_fixa",desc:"",valorPrevisto:"",membro:MEMBERS[0],cartao:CARTOES[0],parcelas:1,parcelaAtual:1,mesFatura:TODAY.getMonth(),anoFatura:TODAY.getFullYear(),mesInicio:TODAY.getMonth(),anoInicio:TODAY.getFullYear(),ativo:true,catId:"",...data});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  return(
    <Modal title={f.id?"Editar Cadastro Base":"Novo Cadastro Base"} onClose={onClose} maxW={500}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{gridColumn:"1/-1"}}><Field label="Tipo"><select value={f.tipo} onChange={e=>set("tipo",e.target.value)} style={inp}>{Object.entries(BASE_TIPOS).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}</select></Field></div>
        <div style={{gridColumn:"1/-1"}}><Field label="Descrição"><input value={f.desc} onChange={e=>set("desc",e.target.value)} placeholder="Ex: Salário, Netflix..." style={inp}/></Field></div>
        <Field label="Valor previsto (R$)"><input value={f.valorPrevisto} onChange={e=>set("valorPrevisto",e.target.value)} type="number" placeholder="0,00" style={inp}/></Field>
        <Field label="Membro"><select value={f.membro} onChange={e=>set("membro",e.target.value)} style={inp}>{MEMBERS.map(m=><option key={m}>{m}</option>)}</select></Field>
        <div style={{gridColumn:"1/-1"}}><Field label="Categoria"><CatSelect value={f.catId} onChange={v=>set("catId",v)} cats={cats} familyCode={familyCode}/></Field></div>
        {(f.tipo==="prevista"||f.tipo==="reembolso_prev")&&<>
          <Field label="Mês de início"><select value={f.mesInicio} onChange={e=>set("mesInicio",+e.target.value)} style={inp}>{MONTHS_FULL.map((m,i)=><option key={i} value={i}>{m}</option>)}</select></Field>
          <Field label="Ano de início"><input value={f.anoInicio} onChange={e=>set("anoInicio",+e.target.value)} type="number" style={inp}/></Field>
          <div style={{gridColumn:"1/-1",background:"#f472b610",border:"1px solid #f472b630",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#f472b6"}}>Aparece todo mês a partir de {MONTHS_FULL[f.mesInicio]}/{f.anoInicio}.</div>
        </>}
        {f.tipo==="parcela_cartao"&&<>
          <Field label="Cartão"><select value={f.cartao} onChange={e=>set("cartao",e.target.value)} style={inp}>{CARTOES.map(c=><option key={c}>{c}</option>)}</select></Field>
          <Field label="Total parcelas"><input value={f.parcelas} onChange={e=>set("parcelas",Math.max(1,+e.target.value||1))} type="number" min="1" max="60" style={inp}/></Field>
          <Field label="Parcela atual"><input value={f.parcelaAtual} onChange={e=>set("parcelaAtual",Math.max(1,+e.target.value||1))} type="number" min="1" style={inp}/></Field>
          <Field label="Mês da fatura"><select value={f.mesFatura} onChange={e=>set("mesFatura",+e.target.value)} style={inp}>{MONTHS_FULL.map((m,i)=><option key={i} value={i}>{m}</option>)}</select></Field>
          <Field label="Ano"><input value={f.anoFatura} onChange={e=>set("anoFatura",+e.target.value)} type="number" style={inp}/></Field>
        </>}
        {f.id&&<div style={{gridColumn:"1/-1"}}><label style={{display:"flex",alignItems:"center",gap:9,cursor:"pointer",fontSize:13,color:"#8b949e"}}><input type="checkbox" checked={f.ativo!==false} onChange={e=>set("ativo",e.target.checked)} style={{width:15,height:15,accentColor:"#34d399"}}/>Item ativo</label></div>}
      </div>
      <button onClick={()=>onSave(f)} style={{...btn("linear-gradient(135deg,#1f6feb,#1158c7)"),width:"100%",marginTop:14,padding:"11px 0"}}>{f.id?"Salvar":"Cadastrar"}</button>
    </Modal>
  );
}

// ─── Lancamento Form ──────────────────────────────────────────────────────────
function LancForm({data,onSave,onClose,cats,familyCode,planoConta}){
  const todayStr=`${TODAY.getFullYear()}-${String(TODAY.getMonth()+1).padStart(2,"0")}-${String(TODAY.getDate()).padStart(2,"0")}`;
  const [f,setF]=useState({tipo:"receita",desc:"",fornecedor:"",valor:"",membro:MEMBERS[0],mes:TODAY.getMonth(),ano:TODAY.getFullYear(),data:todayStr,status:"confirmado",reembolso:"",isFixa:false,parcelas:1,cartao:CARTOES[0],catId:"",catPlanoId:"",formaPagamento:"PIX",contaId:"",splits:[],...data});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const isCartao=f.tipo==="cartao";
  const isReceita=f.tipo==="receita";
  const valorRef=isCartao?(+f.valorTotal||0):(+f.valor||0);
  const handleData=(v)=>{set("data",v);if(v){const d=new Date(v+"T00:00:00");set("mes",d.getMonth());set("ano",d.getFullYear());}};
  return(
    <Modal title={f.id?"Editar Lançamento":"Novo Lançamento"} onClose={onClose}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{gridColumn:"1/-1"}}><Field label="Tipo"><select value={f.tipo} onChange={e=>set("tipo",e.target.value)} style={inp}>{Object.entries(TIPO_META).filter(([k])=>k!=="prevista").map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}</select></Field></div>
        {isReceita&&<div style={{gridColumn:"1/-1",background:"#34d39910",border:"1px solid #34d39930",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#34d399"}}>↑ Entrada avulsa — só neste mês. Para recorrente, use <strong>Cadastro Base</strong>.</div>}
        <div style={{gridColumn:"1/-1"}}><Field label="Histórico (Descrição)"><input value={f.desc} onChange={e=>set("desc",e.target.value)} placeholder={isReceita?"Ex: Freela, Venda, Bônus...":"Ex: Supermercado, Farmácia..."} style={inp}/></Field></div>
        <div style={{gridColumn:"1/-1"}}><Field label={isReceita?"Cliente / Origem":"Fornecedor / Cliente"}><input value={f.fornecedor||""} onChange={e=>set("fornecedor",e.target.value)} placeholder="Ex: Empresa XYZ, João Silva..." style={inp}/></Field></div>
        {isCartao?<>
          <Field label="Valor total (R$)"><input value={f.valorTotal||""} onChange={e=>set("valorTotal",e.target.value)} type="number" placeholder="Ex: 1200" style={inp}/></Field>
          <Field label="Nº de parcelas"><input value={f.parcelas} onChange={e=>set("parcelas",Math.max(1,+e.target.value||1))} type="number" min="1" max="60" style={inp}/></Field>
          <Field label="Cartão"><select value={f.cartao} onChange={e=>set("cartao",e.target.value)} style={inp}>{CARTOES.map(c=><option key={c}>{c}</option>)}</select></Field>
          {f.valorTotal&&<div style={{gridColumn:"1/-1",background:"#fb923c10",border:"1px solid #fb923c30",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#fb923c"}}>{f.parcelas>1?`${f.parcelas}x de ${fmt((+f.valorTotal||0)/f.parcelas)}`:`À vista: ${fmt(+f.valorTotal||0)}`}</div>}
        </>:<>
          <Field label="Valor (R$)"><input value={f.valor} onChange={e=>set("valor",e.target.value)} type="number" placeholder="0,00" style={inp}/></Field>
          <Field label="Reembolso esperado (R$)"><input value={f.reembolso||""} onChange={e=>set("reembolso",e.target.value)} type="number" placeholder="0,00" style={inp}/></Field>
        </>}
        <Field label="Data"><input value={f.data||""} onChange={e=>handleData(e.target.value)} type="date" style={inp}/></Field>
        <Field label="Membro"><select value={f.membro} onChange={e=>set("membro",e.target.value)} style={inp}>{MEMBERS.map(m=><option key={m}>{m}</option>)}</select></Field>
        <Field label={isCartao?"Mês da 1ª fatura":"Mês de referência"}><select value={f.mes} onChange={e=>set("mes",+e.target.value)} style={inp}>{MONTHS_FULL.map((m,i)=><option key={i} value={i}>{m}</option>)}</select></Field>
        <Field label="Ano"><input value={f.ano} onChange={e=>set("ano",+e.target.value)} type="number" style={inp}/></Field>
        {planoConta&&planoConta.length>0&&<div style={{gridColumn:"1/-1"}}><Field label="Categoria (Plano de Contas)"><PlanocatSelect value={f.catPlanoId} onChange={v=>set("catPlanoId",v)} planoConta={planoConta}/></Field></div>}
        {!isCartao&&valorRef>0&&<div style={{gridColumn:"1/-1"}}><SplitEditor total={valorRef} splits={f.splits} onChange={s=>set("splits",s)} cats={cats} familyCode={familyCode}/></div>}
        {!isCartao&&<div style={{gridColumn:"1/-1"}}><Field label="Forma de movimentação"><select value={f.formaPagamento||""} onChange={e=>set("formaPagamento",e.target.value)} style={inp}><option value="">— Selecione —</option>{FORMAS_PAGAMENTO.map(fp=><option key={fp} value={fp}>{fp}</option>)}</select></Field></div>}
        {!isCartao&&<div style={{gridColumn:"1/-1"}}><Field label="Banco vinculado (afeta saldo automaticamente)"><select value={f.contaId||""} onChange={e=>set("contaId",e.target.value)} style={inp}><option value="">— Não vincular —</option>{BANCOS_LIST.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></Field></div>}
        {isReceita&&<label style={{gridColumn:"1/-1",display:"flex",alignItems:"center",gap:9,cursor:"pointer",fontSize:12,color:"#6e7681"}}><input type="checkbox" checked={f.isFixa} onChange={e=>set("isFixa",e.target.checked)} style={{width:14,height:14,accentColor:"#34d399"}}/>Cadastrar também como Receita Fixa no Base</label>}
      </div>
      <button onClick={()=>onSave(f)} style={{...btn("linear-gradient(135deg,#238636,#1a7f37)"),width:"100%",marginTop:14,padding:"11px 0"}}>{f.id?"Salvar":"Registrar"}</button>
    </Modal>
  );
}

// ─── Conta Movimentação Form ──────────────────────────────────────────────────
function ContaMovForm({data,onSave,onClose,cats,familyCode,viewMes,viewAno,contaAtiva}){
  const CONTAS_LIST=["C6","Inter","Caixa","XP","Santander"];
  const todayStr=`${TODAY.getFullYear()}-${String(TODAY.getMonth()+1).padStart(2,"0")}-${String(TODAY.getDate()).padStart(2,"0")}`;
  const [f,setF]=useState({contaId:contaAtiva,tipo:"entrada",desc:"",valor:"",data:todayStr,mes:viewMes,ano:viewAno,catId:"",...data});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const handleData=(v)=>{set("data",v);if(v){const d=new Date(v+"T00:00:00");set("mes",d.getMonth());set("ano",d.getFullYear());}};
  return(
    <Modal title={f.id?"Editar Movimentação":"Nova Movimentação"} onClose={onClose} maxW={420}>
      <div style={{display:"grid",gap:10}}>
        <Field label="Conta"><select value={f.contaId} onChange={e=>set("contaId",e.target.value)} style={inp}>{CONTAS_LIST.map(c=><option key={c}>{c}</option>)}</select></Field>
        <Field label="Tipo">
          <div style={{display:"flex",gap:8}}>
            {[["entrada","↑ Entrada"],["saida","↓ Saída"]].map(([k,l])=>(
              <button key={k} onClick={()=>set("tipo",k)} style={{flex:1,padding:"9px 0",borderRadius:9,border:"none",fontFamily:"inherit",fontWeight:700,fontSize:13,cursor:"pointer",background:f.tipo===k?(k==="entrada"?"linear-gradient(135deg,#238636,#1a7f37)":"linear-gradient(135deg,#dc2626,#b91c1c)"):"#21262d",color:"#fff"}}>{l}</button>
            ))}
          </div>
        </Field>
        <Field label="Descrição"><input value={f.desc} onChange={e=>set("desc",e.target.value)} placeholder="Ex: Salário, Conta de luz..." style={inp}/></Field>
        <Field label="Valor (R$)"><input value={f.valor} onChange={e=>set("valor",e.target.value)} type="number" placeholder="0,00" style={inp}/></Field>
        <Field label="Data"><input value={f.data||""} onChange={e=>handleData(e.target.value)} type="date" style={inp}/></Field>
        <Field label="Categoria"><CatSelect value={f.catId} onChange={v=>set("catId",v)} cats={cats} familyCode={familyCode}/></Field>
        <button onClick={()=>onSave(f)} style={{...btn("linear-gradient(135deg,#0ea5e9,#0284c7)"),width:"100%",marginTop:4,padding:"11px 0"}}>{f.id?"Salvar":"Registrar"}</button>
      </div>
    </Modal>
  );
}

// ─── Pagar Fatura Modal ───────────────────────────────────────────────────────
function PagarFaturaModal({cartao,mes,ano,totalLiquido,onConfirm,onClose}){
  const [contaId,setContaId]=useState(BANCOS_LIST[0].id);
  return(
    <Modal title="Pagar Fatura do Cartão" onClose={onClose} maxW={420}>
      <div style={{background:"#0d1117",borderRadius:10,padding:"14px 16px",marginBottom:16,border:"1px solid #fb923c30"}}>
        <div style={{fontSize:12,color:"#6e7681",marginBottom:6,fontWeight:600}}>▣ {cartao} — {MONTHS_FULL[mes]} {ano}</div>
        <div style={{fontSize:26,fontWeight:800,color:"#fb923c",fontFamily:"'JetBrains Mono',monospace"}}>{new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(totalLiquido)}</div>
        <div style={{fontSize:11,color:"#6e7681",marginTop:3}}>fatura líquida (bruto − reembolsos)</div>
      </div>
      <div style={{display:"grid",gap:10,marginBottom:16}}>
        <Field label="Débitar da conta bancária">
          <select value={contaId} onChange={e=>setContaId(e.target.value)} style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:7,padding:"8px 11px",color:"#e6edf3",fontSize:13,fontFamily:"inherit",width:"100%"}}>
            {BANCOS_LIST.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </Field>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={onClose} style={{background:"#21262d",color:"#8b949e",border:"none",borderRadius:8,padding:"9px 18px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",flex:1}}>Cancelar</button>
        <button onClick={()=>onConfirm(contaId)} style={{background:"linear-gradient(135deg,#238636,#1a7f37)",color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",flex:2}}>✓ Confirmar pagamento</button>
      </div>
    </Modal>
  );
}

// ─── Categorias Report ────────────────────────────────────────────────────────
function CategoriasReport({lancs,mes,ano,cats}){
  const [aba,setAba]=useState("saidas");
  const allCats=[...CATS_DEFAULT,...cats];
  const getCat=id=>allCats.find(c=>c.id===id)||{label:"Sem categoria",icon:"•",color:"#6e7681"};
  const TIPOS_SAIDA=["despesa","cartao","fidelidade","aporte","prevista"];
  const TIPOS_ENTRADA=["receita","reembolso"];
  const calcTotals=(tipos)=>{
    const totals={};
    lancs.filter(l=>l.mes===mes&&l.ano===ano&&l.status==="confirmado"&&tipos.includes(l.tipo)).forEach(l=>{
      if(l.splits&&l.splits.length>0) l.splits.forEach(s=>{if(s.catId)totals[s.catId]=(totals[s.catId]||0)+(+s.valor||0);});
      else if(l.catId) totals[l.catId]=(totals[l.catId]||0)+(+l.valor||0);
    });
    return totals;
  };
  const totals=aba==="saidas"?calcTotals(TIPOS_SAIDA):calcTotals(TIPOS_ENTRADA);
  const entries=Object.entries(totals).sort((a,b)=>b[1]-a[1]);
  const total=entries.reduce((s,[,v])=>s+v,0);
  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:16,background:"#161b22",borderRadius:10,padding:4}}>
        {[["saidas","↓ Saídas","#f87171"],["entradas","↑ Entradas","#34d399"]].map(([k,l,c])=>(
          <button key={k} onClick={()=>setAba(k)} style={{flex:1,padding:"9px 0",borderRadius:7,border:"none",fontFamily:"inherit",fontWeight:700,fontSize:13,cursor:"pointer",background:aba===k?c+"22":"transparent",color:aba===k?c:"#6e7681",transition:"all .15s"}}>{l}</button>
        ))}
      </div>
      {entries.length===0?(
        <div style={{textAlign:"center",color:"#6e7681",padding:"32px 0",fontSize:13}}>Nenhum lançamento categorizado em {MONTHS_FULL[mes]}.</div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {entries.map(([catId,valor])=>{
            const c=getCat(catId);
            const pct=total>0?Math.round(valor/total*100):0;
            return(
              <div key={catId} style={{background:"#0d1117",border:`1px solid ${c.color}22`,borderRadius:10,padding:"12px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:13,fontWeight:600,color:"#e6edf3"}}>{c.icon} {c.label}</span>
                  <span style={{fontSize:14,fontWeight:800,color:c.color,fontFamily:"'JetBrains Mono',monospace"}}>{fmt(valor)}</span>
                </div>
                <div style={{background:"#21262d",borderRadius:4,height:6,overflow:"hidden"}}>
                  <div style={{background:c.color,height:"100%",width:`${pct}%`,borderRadius:4}}/>
                </div>
                <div style={{fontSize:11,color:"#6e7681",marginTop:4}}>{pct}% do total</div>
              </div>
            );
          })}
          <div style={{background:"#161b22",borderRadius:10,padding:"12px 14px",display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:12,color:"#6e7681",fontWeight:700}}>TOTAL CATEGORIZADO</span>
            <span style={{fontSize:14,fontWeight:800,color:"#e6edf3",fontFamily:"'JetBrains Mono',monospace"}}>{fmt(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App(){
  const [user,setUser]=useState(null);
  const [familyCode,setFamilyCode]=useState(()=>localStorage.getItem("finanunes_family")||null);
  const [authReady,setAuthReady]=useState(false);
  useEffect(()=>{
    const unsub=onAuthStateChanged(auth,u=>{
      setUser(u);setAuthReady(true);
      if(!u){setFamilyCode(null);localStorage.removeItem("finanunes_family");}
    });
    return()=>unsub();
  },[]);
  const handleLogin=(u,code)=>{setUser(u);setFamilyCode(code);};
  const handleLogout=async()=>{await signOut(auth);setFamilyCode(null);localStorage.removeItem("finanunes_family");};
  if(!authReady) return <div style={{background:"#090c10",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#6e7681",fontFamily:"sans-serif"}}>Carregando...</div>;
  if(!user||!familyCode) return <LoginScreen onLogin={handleLogin} existingUser={user}/>;
  return <MainApp familyCode={familyCode} user={user} onLogout={handleLogout}/>;
}

// ─── Main App (autenticado) ───────────────────────────────────────────────────
function MainApp({familyCode,user,onLogout}){
  const [tab,setTab]=useState("painel");
  const [viewMes,setViewMes]=useState(TODAY.getMonth());
  const [viewAno,setViewAno]=useState(TODAY.getFullYear());
  const [baseItems,setBaseItems]=useState([]);
  const [lancs,setLancs]=useState([]);
  const [customCats,setCustomCats]=useState([]);
  const [saldoAnt,setSaldoAnt]=useState(0);
  const [loading,setLoading]=useState(true);
  const [toast,setToast]=useState(null);
  const [baseModal,setBaseModal]=useState(null);
  const [lancModal,setLancModal]=useState(null);
  const [confirmModal,setConfirmModal]=useState(null);
  const [catModal,setCatModal]=useState(false);
  const [cartaoAtivo,setCartaoAtivo]=useState(CARTOES[0]);
  const [drillFilter,setDrillFilter]=useState(null);
  const [contaAtiva,setContaAtiva]=useState("C6");
  const [contas,setContas]=useState([]);
  const [movimentacoes,setMovimentacoes]=useState([]);
  const [contaMovModal,setContaMovModal]=useState(null);
  const [planoConta,setPlanoConta]=useState([]);
  const [pagarFaturaModal,setPagarFaturaModal]=useState(null);

  const fp=(col)=>famPath(familyCode,col);
  const drillDown=(tipos,label,mes,ano)=>{setDrillFilter({tipos,label,mes,ano});setTab("lancamentos");window.scrollTo({top:0,behavior:"smooth"});};

  useEffect(()=>{
    const u1=onSnapshot(collection(db,fp("baseItems")),s=>{setBaseItems(s.docs.map(d=>({id:d.id,...d.data()})));});
    const u2=onSnapshot(collection(db,fp("lancamentos")),s=>{setLancs(s.docs.map(d=>({id:d.id,...d.data()})));});
    const u3=onSnapshot(collection(db,fp("categorias")),s=>{setCustomCats(s.docs.map(d=>({id:d.id,...d.data()})));});
    const u4=onSnapshot(collection(db,fp("contas")),s=>{setContas(s.docs.map(d=>({id:d.id,...d.data()})));});
    const u5=onSnapshot(collection(db,fp("movimentacoes")),s=>{setMovimentacoes(s.docs.map(d=>({id:d.id,...d.data()})));});
    const u6=onSnapshot(collection(db,fp("planoConta")),s=>{setPlanoConta(s.docs.map(d=>({id:d.id,...d.data()})));});
    getDoc(doc(db,`familias/${familyCode}`)).then(r=>{if(r.exists()&&r.data().saldoAnt)setSaldoAnt(r.data().saldoAnt);setLoading(false);});
    return()=>{u1();u2();u3();u4();u5();u6();};
  },[familyCode]);

  const cats=customCats;
  const toast2=(msg,ok=true)=>{setToast({msg,ok});setTimeout(()=>setToast(null),2600);};

  const saveBase=async(data)=>{
    const {id,...rest}=data;
    await setDoc(doc(db,fp("baseItems"),id||String(Date.now())),{...rest,valorPrevisto:+rest.valorPrevisto,ativo:rest.ativo!==false});
    toast2(id?"Atualizado!":"Cadastrado!"); setBaseModal(null);
  };
  const deleteBase=async(id)=>{await deleteDoc(doc(db,fp("baseItems"),String(id)));toast2("Removido.");};

  const saveLanc=async(data)=>{
    if(data.tipo==="cartao"){
      const total=+(data.valorTotal||data.valor)||0;
      if(!total){toast2("Informe o valor.",false);return;}
      const n=Math.max(1,+data.parcelas||1);
      const vlr=parseFloat((total/n).toFixed(2));
      for(let i=0;i<n;i++){
        const {mes:pm,ano:pa}=addM(+data.mes,+data.ano,i);
        await setDoc(doc(db,fp("lancamentos"),String(Date.now()+i*10)),{tipo:"cartao",desc:n>1?`${data.desc} (${i+1}/${n})`:data.desc,valor:vlr,mes:pm,ano:pa,mesFatura:pm,anoFatura:pa,membro:data.membro||MEMBERS[0],cartao:data.cartao||CARTOES[0],status:"confirmado",reembolso:0,catId:data.catId||"",splits:[],data:data.data||""});
      }
      toast2(n>1?`${n} parcela(s) lançada(s)!`:"Registrado!");
    } else {
      const {id,...rest}=data;
      if(!+rest.valor&&!id){toast2("Informe o valor.",false);return;}
      const entry={...rest,valor:+rest.valor,reembolso:+rest.reembolso||0,status:"confirmado",catId:rest.catId||"",splits:rest.splits||[]};
      delete entry.isFixa; delete entry.valorTotal;
      await setDoc(doc(db,fp("lancamentos"),id||String(Date.now())),entry);
      if(data.isFixa&&!id) await setDoc(doc(db,fp("baseItems"),String(Date.now()+1)),{tipo:"receita_fixa",desc:data.desc,valorPrevisto:+data.valor,membro:data.membro,ativo:true,catId:data.catId||""});
      toast2(id?"Atualizado!":"Salvo!");
    }
    setLancModal(null);
  };

  const confirmLanc=async(confirmed)=>{
    const {id,...rest}=confirmed;
    const entry={...rest,status:"confirmado",valor:+confirmed.valor,reembolso:+confirmed.reembolso||0,_baseId:confirmed._baseId||null,catId:confirmed.catId||""};
    delete entry.valorPrevisto;
    await setDoc(doc(db,fp("lancamentos"),String(Date.now())),entry);
    toast2(confirmed.tipo==="prevista"?"Baixa registrada!":"Confirmado!"); setConfirmModal(null);
  };
  const deleteLanc=async(id)=>{await deleteDoc(doc(db,fp("lancamentos"),String(id)));toast2("Removido.");};
  const saveSaldo=async(v)=>{setSaldoAnt(v);await setDoc(doc(db,`familias/${familyCode}`),{saldoAnt:v},{merge:true});};

  const getExpected=useCallback((m,a)=>{
    const result=[];
    for(const bi of baseItems){
      if(bi.ativo===false) continue;
      const bt=BASE_TIPOS[bi.tipo]; if(!bt) continue;
      if(bi.tipo==="prevista"||bi.tipo==="reembolso_prev"){
        if(cmpMonth(m,a,bi.mesInicio||0,bi.anoInicio||TODAY.getFullYear())>=0)
          result.push({_baseId:bi.id,tipo:bt.lancTipo,desc:bi.desc,valorPrevisto:+bi.valorPrevisto,membro:bi.membro,mes:m,ano:a,status:"previsto",catId:bi.catId||""});
      } else if(bi.tipo==="parcela_cartao"){
        const rest=bi.parcelas-bi.parcelaAtual+1;
        for(let i=0;i<rest;i++){
          const {mes:pm,ano:pa}=addM(bi.mesFatura,bi.anoFatura,i);
          if(monthKey(pm,pa)===monthKey(m,a))
            result.push({_baseId:bi.id,tipo:"cartao",desc:`${bi.desc} (${bi.parcelaAtual+i}/${bi.parcelas})`,valorPrevisto:+bi.valorPrevisto,membro:bi.membro,cartao:bi.cartao,mes:m,ano:a,status:"previsto",catId:bi.catId||""});
        }
      } else {
        result.push({_baseId:bi.id,tipo:bt.lancTipo,desc:bi.desc,valorPrevisto:+bi.valorPrevisto,membro:bi.membro,mes:m,ano:a,status:"previsto",catId:bi.catId||""});
      }
    }
    return result;
  },[baseItems]);

  const getMonthView=useCallback((m,a)=>{
    const real=lancs.filter(l=>l.mes===m&&l.ano===a);
    const expct=getExpected(m,a);

    // Para previstas com categoria: calcula quanto já foi gasto na categoria
    const gastosPorCat={};
    real.filter(r=>r.status==="confirmado").forEach(r=>{
      if(r.splits&&r.splits.length>0){
        r.splits.forEach(s=>{if(s.catId)gastosPorCat[s.catId]=(gastosPorCat[s.catId]||0)+(+s.valor||0);});
      } else if(r.catId){
        gastosPorCat[r.catId]=(gastosPorCat[r.catId]||0)+(+r.valor||0);
      }
    });

    const pending=[];
    for(const e of expct){
      // Match por _baseId (qualquer tipo)
      if(e._baseId&&real.some(r=>r._baseId===e._baseId)) continue;
      // Para outros tipos fixos: match por desc+membro+tipo
      if(e.tipo!=="prevista"&&e.tipo!=="reembolso"&&real.some(r=>r.status==="confirmado"&&r.tipo===e.tipo&&r.desc===e.desc&&r.membro===e.membro)) continue;

      // Para previstas: abate pelo gasto real na mesma categoria
      if(e.tipo==="prevista"){
        if(e.catId){
          const gasto=gastosPorCat[e.catId]||0;
          const restante=Math.max(0,(+e.valorPrevisto||0)-gasto);
          if(restante<=0) continue; // já coberto pelos lançamentos reais
          pending.push({...e,valorPrevisto:restante,id:"pending_"+e._baseId+"_"+monthKey(m,a)});
        } else {
          // sem categoria: comportamento antigo (match por desc)
          if(real.some(r=>r.status==="confirmado"&&r.desc===e.desc)) continue;
          pending.push({...e,id:"pending_"+e._baseId+"_"+monthKey(m,a)});
        }
        continue;
      }

      // Para reembolso previsto: match por desc
      if(e.tipo==="reembolso"){
        if(real.some(r=>r.status==="confirmado"&&r.desc===e.desc)) continue;
      }

      pending.push({...e,id:"pending_"+e._baseId+"_"+monthKey(m,a)});
    }

    return [...real,...pending];
  },[lancs,getExpected]);

  const calcBalanco=useCallback((m,a)=>{
    const view=getMonthView(m,a);
    const conf=view.filter(l=>l.status==="confirmado");
    const pend=view.filter(l=>l.status==="previsto");
    const sumC=(ts)=>conf.filter(l=>ts.includes(l.tipo)).reduce((s,l)=>s+(+l.valor||0),0);
    const sumP=(ts)=>pend.filter(l=>ts.includes(l.tipo)).reduce((s,l)=>s+(+l.valorPrevisto||0),0);
    const rec=sumC(["receita"])+sumP(["receita"]);
    const reimb=sumC(["reembolso"])+sumP(["reembolso"]);
    const desp=sumC(["despesa","fixa"])+sumP(["despesa"]);
    const fidel=sumC(["fidelidade"])+sumP(["fidelidade"]);
    const aport=sumC(["aporte"])+sumP(["aporte"]);
    const prev=sumC(["prevista"])+sumP(["prevista"]);
    const cartaoLancs=lancs.filter(l=>l.tipo==="cartao"&&l.mesFatura===m&&l.anoFatura===a);
    const cartaoPend=pend.filter(l=>l.tipo==="cartao");
    const porCartao={};
    [...cartaoLancs,...cartaoPend].forEach(l=>{const nome=l.cartao||"Outro";porCartao[nome]=(porCartao[nome]||0)+(l.status==="previsto"?(+l.valorPrevisto||0):(+l.valor||0));});
    const totalCartao=Object.values(porCartao).reduce((s,v)=>s+v,0);
    const saldo=saldoAnt+rec+reimb-desp-fidel-aport-totalCartao-prev;
    return {rec,reimb,desp,fidel,aport,prev,totalCartao,porCartao,saldo,pendingCount:pend.length};
  },[getMonthView,lancs,saldoAnt]);

  const saveContaMov=async(data)=>{
    const {id,...rest}=data;
    await setDoc(doc(db,fp("movimentacoes"),id||String(Date.now())),{...rest,valor:+rest.valor,ts:Date.now()});
    toast2(id?"Atualizado!":"Movimentação registrada!"); setContaMovModal(null);
  };
  const deleteContaMov=async(mov)=>{await deleteDoc(doc(db,fp("movimentacoes"),mov.id));toast2("Removido.");};
  const updateContaSaldo=async(contaId,saldo)=>{await setDoc(doc(db,fp("contas"),contaId),{id:contaId,saldo:+saldo},{merge:true});};
  const savePlanoConta=async(data)=>{
    const {id,...rest}=data;
    if(!rest.nome?.trim()){toast2("Informe o nome.",false);return;}
    await setDoc(doc(db,fp("planoConta"),id||String(Date.now())),{...rest,nome:rest.nome.trim()});
    toast2(id?"Atualizado!":"Cadastrado!");
  };
  const deletePlanoConta=async(id)=>{await deleteDoc(doc(db,fp("planoConta"),String(id)));toast2("Removido.");};
  const pagarFatura=async(contaId)=>{
    const {cartao,mes,ano,totalLiquido}=pagarFaturaModal;
    const todayStr=`${TODAY.getFullYear()}-${String(TODAY.getMonth()+1).padStart(2,"0")}-${String(TODAY.getDate()).padStart(2,"0")}`;
    await setDoc(doc(db,fp("movimentacoes"),String(Date.now())),{
      contaId,tipo:"saida",valor:totalLiquido,
      desc:`Pagamento fatura ${cartao} ${MONTHS_FULL[mes]}/${ano}`,
      data:todayStr,mes:TODAY.getMonth(),ano:TODAY.getFullYear(),ts:Date.now()
    });
    toast2("Fatura paga! Saldo atualizado.");
    setPagarFaturaModal(null);
  };

  const navPrev=()=>{const r=addM(viewMes,viewAno,-1);setViewMes(r.mes);setViewAno(r.ano);};
  const navNext=()=>{const r=addM(viewMes,viewAno,1);setViewMes(r.mes);setViewAno(r.ano);};
  const nextM=addM(viewMes,viewAno,1);
  const bal0=calcBalanco(viewMes,viewAno);
  const bal1=calcBalanco(nextM.mes,nextM.ano);
  const monthView=getMonthView(viewMes,viewAno);

  if(loading) return <div style={{background:"#090c10",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#6e7681",fontFamily:"sans-serif"}}>Carregando...</div>;

  return(
    <div style={{minHeight:"100vh",background:"#090c10",fontFamily:"'Sora','Segoe UI',sans-serif",color:"#e6edf3",paddingBottom:80}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}input,select{outline:none;font-family:inherit}.row:hover{background:#161b22!important}.gh:hover{opacity:.8}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-thumb{background:#30363d;border-radius:4px}`}</style>

      {toast&&<Toast msg={toast.msg} ok={toast.ok}/>}
      {catModal&&<CatModal cats={cats} familyCode={familyCode} onClose={()=>setCatModal(false)}/>}
      {baseModal&&<BaseForm data={baseModal.data} onSave={saveBase} onClose={()=>setBaseModal(null)} cats={cats} familyCode={familyCode}/>}
      {lancModal&&<LancForm data={lancModal.data} onSave={saveLanc} onClose={()=>setLancModal(null)} cats={cats} familyCode={familyCode} planoConta={planoConta}/>}
      {confirmModal&&<ConfirmModal lanc={confirmModal} onConfirm={confirmLanc} onClose={()=>setConfirmModal(null)} cats={cats} familyCode={familyCode}/>}
      {contaMovModal&&<ContaMovForm data={contaMovModal.data} onSave={saveContaMov} onClose={()=>setContaMovModal(null)} cats={cats} familyCode={familyCode} viewMes={viewMes} viewAno={viewAno} contaAtiva={contaAtiva}/>}
      {pagarFaturaModal&&<PagarFaturaModal {...pagarFaturaModal} onConfirm={pagarFatura} onClose={()=>setPagarFaturaModal(null)}/>}

      {/* Header */}
      <div style={{background:"#0d1117",borderBottom:"1px solid #21262d",padding:"14px 20px",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:1080,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:10,color:"#6e7681",letterSpacing:"0.12em",textTransform:"uppercase"}}>Controle Financeiro</div>
            <div style={{fontSize:18,fontWeight:800,letterSpacing:"-0.02em"}}>Saldo Livre 💚 <span style={{fontSize:12,color:"#6e7681",fontWeight:400}}>#{familyCode}</span></div>
          </div>
          <div style={{display:"flex",gap:3,background:"#161b22",borderRadius:10,padding:3,flexWrap:"nowrap",overflowX:"auto"}}>
            {[["painel","Painel"],["lancamentos","Lançamentos"],["categorias","Categorias"],["cartoes","Cartões"],["contas","Contas"],["plano","Plano"],["base","Base"]].map(([k,l])=>(
              <button key={k} onClick={()=>{setTab(k);if(k!=="lancamentos")setDrillFilter(null);}} style={{padding:"7px 10px",borderRadius:7,border:"none",fontFamily:"inherit",fontWeight:700,fontSize:12,cursor:"pointer",background:tab===k?"#21262d":"transparent",color:tab===k?"#e6edf3":"#6e7681",transition:"all .15s",position:"relative",whiteSpace:"nowrap",flexShrink:0}}>
                {l}{k==="lancamentos"&&bal0.pendingCount>0&&<span style={{position:"absolute",top:2,right:2,background:"#f472b6",color:"#fff",borderRadius:8,padding:"0 4px",fontSize:9,fontWeight:700}}>{bal0.pendingCount}</span>}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {tab==="lancamentos"&&<button onClick={()=>setLancModal({data:{mes:viewMes,ano:viewAno}})} style={{...btn("linear-gradient(135deg,#238636,#1a7f37)"),fontSize:12,padding:"7px 12px"}}>+ Lançamento</button>}
            {tab==="base"&&<button onClick={()=>setBaseModal({data:{}})} style={{...btn("linear-gradient(135deg,#1f6feb,#1158c7)"),fontSize:12,padding:"7px 12px"}}>+ Cadastrar</button>}
            {tab==="categorias"&&<button onClick={()=>setCatModal(true)} style={{...btn("linear-gradient(135deg,#7c3aed,#6d28d9)"),fontSize:12,padding:"7px 12px"}}>+ Categoria</button>}
            {tab==="contas"&&<button onClick={()=>setContaMovModal({data:{contaId:contaAtiva,tipo:"entrada",desc:"",valor:"",mes:viewMes,ano:viewAno,catId:""}})} style={{...btn("linear-gradient(135deg,#0ea5e9,#0284c7)"),fontSize:12,padding:"7px 12px"}}>+ Movimentação</button>}
            {tab==="plano"&&<span style={{fontSize:12,color:"#6e7681"}}>Use os botões na lista</span>}
            <button onClick={onLogout} title="Sair" style={{background:"#21262d",border:"none",borderRadius:8,color:"#6e7681",padding:"7px 10px",cursor:"pointer",fontSize:13}}>⎋</button>
          </div>
        </div>
      </div>

      {/* Month nav */}
      <div style={{maxWidth:1080,margin:"14px auto 0",padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <button onClick={navPrev} className="gh" style={{background:"#161b22",border:"1px solid #21262d",color:"#6e7681",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:15,fontFamily:"inherit"}}>←</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:18,fontWeight:800}}>{MONTHS_FULL[viewMes]} {viewAno}</div>
          <div style={{fontSize:11,color:"#6e7681",marginTop:1}}>mês de referência</div>
        </div>
        <button onClick={navNext} className="gh" style={{background:"#161b22",border:"1px solid #21262d",color:"#6e7681",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:15,fontFamily:"inherit"}}>→</button>
      </div>

      <div style={{maxWidth:1080,margin:"14px auto 0",padding:"0 14px"}}>

        {/* PAINEL */}
        {tab==="painel"&&(()=>{
          const now=new Date(),isNow=viewMes===now.getMonth()&&viewAno===now.getFullYear(),day=now.getDate();
          const ultimoDia=new Date(viewAno,viewMes+1,0).getDate();
          // Se é o mês atual, conta a partir de hoje; senão usa o mês inteiro
          const diasFim=isNow?Math.max(1,ultimoDia-day):ultimoDia;
          const vpdVista=bal0.saldo/diasFim;
          const dias26=isNow?(day<=26?26-day:Math.max(1,Math.ceil((new Date(viewAno,viewMes+1,26)-now)/(864e5)))):26;
          const vpdCartao=bal1.saldo/Math.max(1,dias26);
          return(<div>
            <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:11,padding:"13px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
              <span style={{fontSize:12,color:"#6e7681",fontWeight:600}}>Saldo anterior (R$):</span>
              <input type="number" value={saldoAnt||""} placeholder="0,00" onChange={e=>saveSaldo(+e.target.value)} style={{...inp,width:150,background:"#161b22"}}/>
              <span style={{fontSize:11,color:"#6e7681"}}>saldo inicial de {MONTHS_FULL[viewMes]}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
              {[{label:`${MONTHS_FULL[viewMes]} — Atual`,b:bal0,accent:"#34d399",tag:"ATUAL",m:viewMes,a:viewAno},{label:`${MONTHS_FULL[nextM.mes]} — Projeção`,b:bal1,accent:"#60a5fa",tag:"PRÓXIMO",m:nextM.mes,a:nextM.ano}].map(({label,b,accent,tag,m,a})=>(
                <div key={tag} style={{background:"#0d1117",border:`1px solid ${accent}28`,borderRadius:14,padding:"18px 20px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <span style={{fontSize:13,fontWeight:700,color:accent}}>{label}</span>
                    <span style={{fontSize:10,background:accent+"20",color:accent,borderRadius:4,padding:"2px 8px",fontWeight:700}}>{tag}</span>
                  </div>
                  {[{l:"Entradas",v:b.rec,c:"#34d399",tipos:["receita"]},{l:"Reembolsos",v:b.reimb,c:"#86efac",tipos:["reembolso"]},{l:"Despesas à vista",v:b.desp,c:"#f87171",neg:true,tipos:["despesa","fixa"]},{l:"Previstas",v:b.prev,c:"#f472b6",neg:true,tipos:["prevista"]},{l:"Fidelidade",v:b.fidel,c:"#a78bfa",neg:true,tipos:["fidelidade"]},{l:"Aportes",v:b.aport,c:"#60a5fa",neg:true,tipos:["aporte"]}].map(({l,v,c,neg,tipos})=>(
                    v>0&&<div key={l} onClick={()=>drillDown(tipos,l,m,a)} className="gh" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7,cursor:"pointer",borderRadius:6,padding:"3px 6px",margin:"0 -6px 7px"}}>
                      <span style={{fontSize:12,color:"#8b949e"}}>{l} <span style={{fontSize:10,opacity:.4}}>↗</span></span>
                      <span style={{fontSize:13,fontWeight:700,color:c,fontFamily:"'JetBrains Mono',monospace"}}>{neg?"−":"+"}{fmt(v)}</span>
                    </div>
                  ))}
                  {Object.keys(b.porCartao||{}).length>0&&(
                    <div style={{background:"#fb923c08",border:"1px solid #fb923c20",borderRadius:8,padding:"8px 10px",marginBottom:7}}>
                      <div style={{fontSize:11,color:"#fb923c",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>▣ Faturas Cartão</div>
                      {Object.entries(b.porCartao).map(([nome,v])=>(
                        <div key={nome} onClick={()=>{setCartaoAtivo(nome);setViewMes(m);setViewAno(a);setTab("cartoes");window.scrollTo({top:0,behavior:"smooth"});}} className="gh" style={{display:"flex",justifyContent:"space-between",marginBottom:3,cursor:"pointer",borderRadius:4,padding:"2px 4px",margin:"0 -4px 3px"}}>
                          <span style={{fontSize:12,color:"#8b949e"}}>{nome} <span style={{fontSize:10,opacity:.4}}>↗</span></span>
                          <span style={{fontSize:13,fontWeight:700,color:"#fb923c",fontFamily:"'JetBrains Mono',monospace"}}>−{fmt(v)}</span>
                        </div>
                      ))}
                      {Object.keys(b.porCartao).length>1&&<div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid #fb923c20",paddingTop:4,marginTop:4}}><span style={{fontSize:12,color:"#fb923c",fontWeight:700}}>Total</span><span style={{fontSize:13,fontWeight:700,color:"#fb923c",fontFamily:"'JetBrains Mono',monospace"}}>−{fmt(b.totalCartao)}</span></div>}
                    </div>
                  )}
                  <div style={{borderTop:"1px solid #21262d",marginTop:8,paddingTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,fontWeight:700}}>Saldo / Livre</span>
                    <span style={{fontSize:18,fontWeight:800,color:b.saldo>=0?"#34d399":"#f87171",fontFamily:"'JetBrains Mono',monospace"}}>{fmt(b.saldo)}</span>
                  </div>
                  {b.pendingCount>0&&<div style={{marginTop:8,fontSize:11,color:"#f472b6",background:"#f472b610",borderRadius:6,padding:"6px 10px"}}>⏳ {b.pendingCount} pré-lançamento(s) pendente(s)</div>}
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
              {[{l:"Receitas",v:bal0.rec,c:"#34d399",tipos:["receita"]},{l:"Despesas",v:bal0.desp,c:"#f87171",tipos:["despesa","fixa"]},{l:"Cartões",v:bal0.totalCartao,c:"#fb923c",tipos:["cartao"]},{l:"Previstas",v:bal0.prev,c:"#f472b6",tipos:["prevista"]},{l:"Fidelidade",v:bal0.fidel,c:"#a78bfa",tipos:["fidelidade"]},{l:"Aportes",v:bal0.aport,c:"#60a5fa",tipos:["aporte"]},{l:"Reembolsos",v:bal0.reimb,c:"#86efac",tipos:["reembolso"]},{l:"Saldo Livre",v:bal0.saldo,c:bal0.saldo>=0?"#34d399":"#f87171",sub:bal0.saldo<0?"⚠ negativo":"disponível",tipos:null}].map(({l,v,c,sub,tipos})=>(
                <div key={l} onClick={()=>tipos&&drillDown(tipos,l,viewMes,viewAno)} className={tipos?"gh":""} style={{background:"#0d1117",border:`1px solid ${c}28`,borderRadius:11,padding:"12px 14px",cursor:tipos?"pointer":"default"}}>
                  <div style={{fontSize:10,color:"#6e7681",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>{l}{tipos&&<span style={{marginLeft:4,opacity:.4,fontSize:9}}>↗</span>}</div>
                  <div style={{fontSize:16,fontWeight:800,color:c,fontFamily:"'JetBrains Mono',monospace"}}>{fmt(v)}</div>
                  {sub&&<div style={{fontSize:10,color:"#6e7681",marginTop:2}}>{sub}</div>}
                </div>
              ))}
            </div>
            <div style={{marginTop:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[{title:"💵 Livre à vista por dia",val:vpdVista,sub:`${fmt(bal0.saldo)} ÷ ${diasFim} dias (até dia ${ultimoDia})`,c:"#fbbf24"},{title:"▣ Livre no cartão por dia",val:vpdCartao,sub:`${fmt(bal1.saldo)} ÷ ${dias26} dias (até dia 26)`,c:"#fb923c"}].map(({title,val,sub,c})=>(
                <div key={title} style={{background:"#0d1117",border:`1px solid ${c}30`,borderRadius:12,padding:"16px 20px"}}>
                  <div style={{fontSize:10,color:"#6e7681",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>{title}</div>
                  <div style={{fontSize:26,fontWeight:800,color:val>=0?c:"#f87171",fontFamily:"'JetBrains Mono',monospace"}}>{fmt(val)}</div>
                  <div style={{fontSize:11,color:"#6e7681",marginTop:4}}>{sub}</div>
                  <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #21262d",display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontSize:11,color:"#6e7681"}}>por semana</span>
                    <span style={{fontSize:15,fontWeight:700,color:val>=0?c:"#f87171",fontFamily:"'JetBrains Mono',monospace"}}>{fmt(val*7)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>);
        })()}

        {/* LANÇAMENTOS */}
        {tab==="lancamentos"&&(()=>{
          const fm=drillFilter?.mes??viewMes, fa=drillFilter?.ano??viewAno;
          const view=drillFilter?getMonthView(fm,fa).filter(l=>drillFilter.tipos.includes(l.tipo)):monthView;
          return(<div style={{display:"flex",flexDirection:"column",gap:7}}>
            {drillFilter&&<div style={{display:"flex",alignItems:"center",gap:10,background:"#161b22",borderRadius:10,padding:"10px 14px",marginBottom:4}}>
              <span style={{fontSize:13,fontWeight:700}}>{drillFilter.label} — {MONTHS_FULL[fm]} {fa}</span>
              <button onClick={()=>setDrillFilter(null)} style={{marginLeft:"auto",background:"#21262d",border:"none",borderRadius:6,color:"#8b949e",padding:"4px 10px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>✕ Ver todos</button>
            </div>}
            {view.length===0?(
              <div style={{textAlign:"center",color:"#6e7681",padding:"44px 0",border:"1px dashed #21262d",borderRadius:12}}>
                <div style={{fontSize:28,marginBottom:8}}>📋</div><div>Nenhum lançamento em {MONTHS_FULL[fm]}</div>
              </div>
            ):view.map(l=>{
              const isPending=l.status==="previsto";
              const tm=TIPO_META[l.tipo]||{color:"#6e7681",saida:true};
              const valor=isPending?l.valorPrevisto:l.valor;
              return(
                <div key={l.id} className="row" style={{background:"#0d1117",border:`1px solid ${isPending?"#f472b620":"#21262d"}`,borderRadius:11,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,opacity:isPending?.85:1,transition:"background .12s"}}>
                  {isPending&&<div style={{width:4,alignSelf:"stretch",background:tm.color||"#f472b6",borderRadius:4,flexShrink:0}}/>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{l.desc}</div>
                    <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
                      <Tag tipo={l.tipo} status={l.status}/>
                      {l.data&&<span style={{fontSize:11,color:"#6e7681"}}>{new Date(l.data+"T00:00:00").toLocaleDateString("pt-BR")}</span>}
                      {l.membro&&<span style={{fontSize:11,color:"#6e7681"}}>{l.membro}</span>}
                      {l.fornecedor&&<span style={{fontSize:11,color:"#8b949e",fontWeight:600}}>👤 {l.fornecedor}</span>}
                      {l.formaPagamento&&<span style={{fontSize:11,color:"#60a5fa",fontWeight:600}}>{l.formaPagamento}</span>}
                      {l.splits&&l.splits.length>0?l.splits.map((s,i)=>s.catId&&<CatTag key={i} catId={s.catId} cats={cats}/>):l.catId&&<CatTag catId={l.catId} cats={cats}/>}
                      {l.catPlanoId&&(()=>{const p=planoConta.find(x=>x.id===l.catPlanoId);return p?<span style={{fontSize:11,color:p.cor||"#a78bfa",fontWeight:600,background:(p.cor||"#a78bfa")+"18",padding:"1px 6px",borderRadius:4}}>📂 {p.nome}</span>:null;})()}
                      {l.contaId&&<span style={{fontSize:11,color:"#0ea5e9",fontWeight:600}}>🏦 {l.contaId}</span>}
                      {!isPending&&l.reembolso>0&&<span style={{fontSize:11,color:"#86efac",fontWeight:600}}>↩ {fmt(l.reembolso)}</span>}
                    </div>
                  </div>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:14,color:isPending?tm.color||"#f472b6":tm.saida?"#f87171":"#34d399",flexShrink:0}}>{tm.saida?"−":"+"}{fmt(valor)}</div>
                  <div style={{display:"flex",gap:5,flexShrink:0}}>
                    {isPending&&<button onClick={()=>setConfirmModal(l)} style={{...btn(l.tipo==="prevista"?"linear-gradient(135deg,#9333ea,#7c3aed)":"linear-gradient(135deg,#238636,#1a7f37)"),padding:"5px 10px",fontSize:11}}>{l.tipo==="prevista"?"✓ Dar baixa":"✓ Confirmar"}</button>}
                    {!isPending&&<button onClick={()=>setLancModal({data:{...l,splits:l.splits||[]}})} style={{background:"#21262d",border:"none",borderRadius:6,color:"#8b949e",padding:"5px 8px",cursor:"pointer",fontSize:11}}>✏</button>}
                    {!isPending&&<button onClick={()=>deleteLanc(l.id)} style={{background:"#21262d",border:"none",borderRadius:6,color:"#f87171",padding:"5px 8px",cursor:"pointer",fontSize:11}}>✕</button>}
                  </div>
                </div>
              );
            })}
          </div>);
        })()}

        {/* CATEGORIAS */}
        {tab==="categorias"&&(
          <div>
            <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:11,padding:"12px 16px",marginBottom:16,fontSize:13,color:"#6e7681"}}>
              🏷️ Gastos por categoria em <strong style={{color:"#e6edf3"}}>{MONTHS_FULL[viewMes]} {viewAno}</strong>
            </div>
            <CategoriasReport lancs={lancs} mes={viewMes} ano={viewAno} cats={cats}/>
          </div>
        )}

        {/* CARTÕES */}
        {tab==="cartoes"&&(()=>{
          const comprasMes=lancs.filter(l=>l.tipo==="cartao"&&l.mesFatura===viewMes&&l.anoFatura===viewAno);
          const comprasCartao=comprasMes.filter(l=>(l.cartao||"Outro")===cartaoAtivo);
          const totalBruto=comprasCartao.reduce((s,l)=>s+(+l.valor||0),0);
          const totalReemb=comprasCartao.reduce((s,l)=>s+(+l.reembolso||0),0);
          return(<div>
            <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
              {CARTOES.map(c=>{const t=comprasMes.filter(l=>(l.cartao||"Outro")===c).reduce((s,l)=>s+(+l.valor||0),0);
                return <button key={c} onClick={()=>setCartaoAtivo(c)} style={{padding:"8px 14px",borderRadius:9,border:`1px solid ${cartaoAtivo===c?"#fb923c55":"#21262d"}`,background:cartaoAtivo===c?"#fb923c18":"#0d1117",color:cartaoAtivo===c?"#fb923c":"#6e7681",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>▣ {c}{t>0&&<span style={{marginLeft:5,fontSize:11,opacity:.8}}>{fmt(t)}</span>}</button>;
              })}
              <button onClick={()=>setLancModal({data:{mes:viewMes,ano:viewAno,tipo:"cartao",cartao:cartaoAtivo}})} style={{marginLeft:"auto",...btn("linear-gradient(135deg,#fb923c,#ea7018)"),fontSize:12,padding:"8px 12px"}}>+ Compra</button>
              {(totalBruto-totalReemb)>0&&<button onClick={()=>setPagarFaturaModal({cartao:cartaoAtivo,mes:viewMes,ano:viewAno,totalLiquido:totalBruto-totalReemb})} style={{...btn("linear-gradient(135deg,#238636,#1a7f37)"),fontSize:12,padding:"8px 12px"}}>✓ Pagar Fatura</button>}
            </div>
            <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              {[{l:"Total bruto",v:totalBruto,c:"#f87171"},{l:"Reembolsos",v:totalReemb,c:"#34d399"},{l:"Fatura líquida",v:totalBruto-totalReemb,c:"#fb923c"}].map(({l,v,c})=>(
                <div key={l} style={{background:"#0d1117",border:`1px solid ${c}28`,borderRadius:11,padding:"12px 16px",flex:1,minWidth:120}}>
                  <div style={{fontSize:10,color:"#6e7681",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>{l}</div>
                  <div style={{fontSize:17,fontWeight:800,color:c,fontFamily:"'JetBrains Mono',monospace"}}>{fmt(v)}</div>
                </div>
              ))}
            </div>
            {comprasCartao.length===0?<div style={{textAlign:"center",color:"#6e7681",padding:"44px 0",border:"1px dashed #21262d",borderRadius:12}}><div style={{fontSize:28,marginBottom:8}}>▣</div><div>Nenhuma compra no {cartaoAtivo} em {MONTHS_FULL[viewMes]}</div></div>:(
              <div style={{overflowX:"auto",borderRadius:12,border:"1px solid #21262d"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead><tr style={{background:"#161b22",borderBottom:"1px solid #21262d"}}>
                    {["Data","Descrição","Membro","Categoria","Valor","Reembolso","Líquido",""].map(h=><th key={h} style={{padding:"10px 14px",textAlign:"left",color:"#6e7681",fontWeight:700,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",whiteSpace:"nowrap"}}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {comprasCartao.map(l=>{
                      const allC=[...CATS_DEFAULT,...cats];
                      const catDisplay=l.splits&&l.splits.length>0?l.splits.filter(s=>s.catId).map(s=>{const c=allC.find(x=>x.id===s.catId);return c?c.icon+" "+c.label:"";}).filter(Boolean).join(", "):l.catId?(()=>{const c=allC.find(x=>x.id===l.catId);return c?c.icon+" "+c.label:"—";})():"—";
                      return(
                        <tr key={l.id} className="row" style={{borderBottom:"1px solid #21262d18",background:"#0d1117"}}>
                          <td style={{padding:"10px 14px",color:"#6e7681",whiteSpace:"nowrap",fontSize:12}}>{l.data?new Date(l.data+"T00:00:00").toLocaleDateString("pt-BR"):"—"}</td>
                          <td style={{padding:"10px 14px",fontWeight:600,color:"#e6edf3"}}>{l.desc}</td>
                          <td style={{padding:"10px 14px",color:"#6e7681",whiteSpace:"nowrap"}}>{l.membro||"—"}</td>
                          <td style={{padding:"10px 14px",color:"#8b949e",fontSize:12}}>{catDisplay}</td>
                          <td style={{padding:"10px 14px",fontWeight:700,color:"#f87171",fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>{fmt(l.valor)}</td>
                          <td style={{padding:"10px 14px",fontWeight:700,color:l.reembolso>0?"#34d399":"#6e7681",fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>{l.reembolso>0?fmt(l.reembolso):"—"}</td>
                          <td style={{padding:"10px 14px",fontWeight:700,color:"#fb923c",fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>{fmt((+l.valor||0)-(+l.reembolso||0))}</td>
                          <td style={{padding:"10px 8px",whiteSpace:"nowrap"}}>
                            <button onClick={()=>setLancModal({data:{...l,splits:l.splits||[]}})} style={{background:"#21262d",border:"none",borderRadius:6,color:"#8b949e",padding:"4px 8px",cursor:"pointer",fontSize:11,marginRight:4}}>✏</button>
                            <button onClick={()=>deleteLanc(l.id)} style={{background:"#21262d",border:"none",borderRadius:6,color:"#f87171",padding:"4px 8px",cursor:"pointer",fontSize:11}}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{background:"#161b22",borderTop:"2px solid #21262d"}}>
                      <td colSpan={4} style={{padding:"10px 14px",fontWeight:700,color:"#e6edf3",fontSize:12}}>TOTAL</td>
                      <td style={{padding:"10px 14px",fontWeight:800,color:"#f87171",fontFamily:"'JetBrains Mono',monospace"}}>{fmt(totalBruto)}</td>
                      <td style={{padding:"10px 14px",fontWeight:800,color:"#34d399",fontFamily:"'JetBrains Mono',monospace"}}>{fmt(totalReemb)}</td>
                      <td style={{padding:"10px 14px",fontWeight:800,color:"#fb923c",fontFamily:"'JetBrains Mono',monospace"}}>{fmt(totalBruto-totalReemb)}</td>
                      <td/>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>);
        })()}

        {/* CONTAS */}
        {tab==="contas"&&(()=>{
          const CONTAS_LIST=[
            {id:"C6",nome:"C6 Bank",cor:"#f87171"},
            {id:"Inter",nome:"Banco Inter",cor:"#fb923c"},
            {id:"Caixa",nome:"Caixa Econômica",cor:"#60a5fa"},
            {id:"XP",nome:"XP Investimentos",cor:"#34d399"},
            {id:"Santander",nome:"Santander",cor:"#f472b6"},
          ];
          const getContaSaldo=(id)=>{
            const c=contas.find(x=>x.id===id);
            const base=c?+c.saldo||0:0;
            const entMov=movimentacoes.filter(m=>m.contaId===id&&m.tipo==="entrada").reduce((s,m)=>s+(+m.valor||0),0);
            const saMov=movimentacoes.filter(m=>m.contaId===id&&m.tipo==="saida").reduce((s,m)=>s+(+m.valor||0),0);
            const entLancs=lancs.filter(l=>l.contaId===id&&l.status==="confirmado"&&!TIPO_META[l.tipo]?.saida).reduce((s,l)=>s+(+l.valor||0),0);
            const saLancs=lancs.filter(l=>l.contaId===id&&l.status==="confirmado"&&TIPO_META[l.tipo]?.saida).reduce((s,l)=>s+(+l.valor||0),0);
            return base+entMov-saMov+entLancs-saLancs;
          };
          const totalSaldo=CONTAS_LIST.reduce((s,c)=>s+getContaSaldo(c.id),0);
          const contaMovsMes=movimentacoes.filter(m=>m.contaId===contaAtiva&&m.mes===viewMes&&m.ano===viewAno);
          const contaInfo=CONTAS_LIST.find(c=>c.id===contaAtiva);
          const lancsConta=lancs.filter(l=>l.contaId===contaAtiva&&l.mes===viewMes&&l.ano===viewAno&&l.status==="confirmado");
          const todasMovs=[...contaMovsMes,...lancsConta.map(l=>({...l,tipo:TIPO_META[l.tipo]?.saida?"saida":"entrada",_lancamento:true}))].sort((a,b)=>(b.data||"")>(a.data||"")?1:-1);
          return(<div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8,marginBottom:16}}>
              {CONTAS_LIST.map(c=>{
                const saldo=getContaSaldo(c.id);
                return(
                  <div key={c.id} onClick={()=>setContaAtiva(c.id)} className="gh" style={{background:"#0d1117",border:`2px solid ${contaAtiva===c.id?c.cor+"88":"#21262d"}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all .15s"}}>
                    <div style={{fontSize:11,color:"#6e7681",marginBottom:4,fontWeight:600}}>{c.nome}</div>
                    <div style={{fontSize:18,fontWeight:800,color:saldo>=0?c.cor:"#f87171",fontFamily:"'JetBrains Mono',monospace"}}>{fmt(saldo)}</div>
                  </div>
                );
              })}
              <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:12,padding:"14px 16px"}}>
                <div style={{fontSize:11,color:"#6e7681",marginBottom:4,fontWeight:600}}>TOTAL</div>
                <div style={{fontSize:18,fontWeight:800,color:totalSaldo>=0?"#34d399":"#f87171",fontFamily:"'JetBrains Mono',monospace"}}>{fmt(totalSaldo)}</div>
              </div>
            </div>
            <div style={{background:"#0d1117",border:`1px solid ${contaInfo?.cor||"#21262d"}33`,borderRadius:12,padding:"16px 18px",marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
                <div>
                  <div style={{fontSize:11,color:"#6e7681",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.08em"}}>{contaInfo?.nome}</div>
                  <div style={{fontSize:24,fontWeight:800,color:getContaSaldo(contaAtiva)>=0?(contaInfo?.cor||"#34d399"):"#f87171",fontFamily:"'JetBrains Mono',monospace"}}>{fmt(getContaSaldo(contaAtiva))}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:12,color:"#6e7681"}}>Saldo base (R$):</span>
                  <input type="number" defaultValue={contas.find(x=>x.id===contaAtiva)?.saldo||""} onBlur={e=>updateContaSaldo(contaAtiva,e.target.value)} onKeyDown={e=>e.key==="Enter"&&updateContaSaldo(contaAtiva,e.target.value)} style={{...inp,width:140,background:"#161b22"}} placeholder="0,00"/>
                </div>
              </div>
            </div>
            <div style={{background:"#0d1117",border:"1px solid #0ea5e930",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#0ea5e9"}}>🔄 Saldo calculado automaticamente: Saldo base + entradas − saídas de lançamentos vinculados e movimentações.</div>
            <div style={{fontSize:13,fontWeight:700,color:"#8b949e",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.06em"}}>Extrato — {MONTHS_FULL[viewMes]} {viewAno}</div>
            {todasMovs.length===0?(
              <div style={{textAlign:"center",color:"#6e7681",padding:"40px 0",border:"1px dashed #21262d",borderRadius:12}}>
                <div style={{fontSize:28,marginBottom:8}}>🏦</div><div>Nenhuma movimentação em {MONTHS_FULL[viewMes]}</div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {todasMovs.map(m=>{
                  const isEntrada=m.tipo==="entrada"||(!TIPO_META[m.tipo]?.saida&&m._lancamento);
                  return(
                    <div key={m.id} className="row" style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:11,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,transition:"background .12s"}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:isEntrada?"#34d399":"#f87171",flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.desc}</div>
                        <div style={{display:"flex",gap:6,marginTop:3,flexWrap:"wrap",alignItems:"center"}}>
                          <span style={{fontSize:11,color:isEntrada?"#34d399":"#f87171",fontWeight:600}}>{isEntrada?"↑ Entrada":"↓ Saída"}</span>
                          {m.data&&<span style={{fontSize:11,color:"#6e7681"}}>{new Date(m.data+"T00:00:00").toLocaleDateString("pt-BR")}</span>}
                          {m._lancamento&&<span style={{fontSize:11,color:"#6e7681"}}>via Lançamentos</span>}
                          {m.catId&&<CatTag catId={m.catId} cats={cats}/>}
                        </div>
                      </div>
                      <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:14,color:isEntrada?"#34d399":"#f87171",flexShrink:0}}>{isEntrada?"+":"-"}{fmt(m.valor)}</div>
                      {!m._lancamento&&<button onClick={()=>deleteContaMov(m)} style={{background:"#21262d",border:"none",borderRadius:6,color:"#f87171",padding:"5px 8px",cursor:"pointer",fontSize:11}}>✕</button>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>);
        })()}

        {/* PLANO DE CONTAS */}
        {tab==="plano"&&(
          <div>
            <PlanoContaTab planoConta={planoConta} onSave={savePlanoConta} onDelete={deletePlanoConta}/>
          </div>
        )}

        {/* BASE */}
        {tab==="base"&&(
          <div>
            <div style={{background:"#1f1a0d",border:"1px solid #f59e0b30",borderRadius:11,padding:"12px 16px",marginBottom:14,fontSize:13,color:"#d97706"}}>⚙ O <strong>Cadastro Base</strong> gera pré-lançamentos automáticos que você confirma mês a mês.</div>
            {baseItems.length===0?<div style={{textAlign:"center",color:"#6e7681",padding:"44px 0",border:"1px dashed #21262d",borderRadius:12}}><div style={{fontSize:28,marginBottom:8}}>⚙</div><div>Nenhum item.</div></div>
            :baseItems.map(bi=>{
              const bt=BASE_TIPOS[bi.tipo]||{label:bi.tipo,color:"#6e7681",icon:"•"};
              const inativo=bi.ativo===false;
              return(
                <div key={bi.id} className="row" style={{background:"#0d1117",border:`1px solid ${inativo?"#21262d":bt.color+"22"}`,borderRadius:11,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,marginBottom:7,opacity:inativo?.5:1,transition:"background .12s"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13,display:"flex",alignItems:"center",gap:8}}>{bi.desc}{inativo&&<span style={{fontSize:10,background:"#6e7681",color:"#fff",borderRadius:4,padding:"1px 6px"}}>ENCERRADO</span>}</div>
                    <div style={{display:"flex",gap:7,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
                      <span style={{background:bt.color+"20",color:bt.color,border:`1px solid ${bt.color}35`,borderRadius:5,padding:"2px 7px",fontSize:11,fontWeight:700}}>{bt.icon} {bt.label}</span>
                      {bi.membro&&<span style={{fontSize:11,color:"#6e7681"}}>{bi.membro}</span>}
                      {bi.catId&&<CatTag catId={bi.catId} cats={cats}/>}
                      {bi.tipo==="parcela_cartao"&&<span style={{fontSize:11,color:"#fb923c",fontWeight:600}}>{bi.cartao} · {bi.parcelaAtual}/{bi.parcelas}</span>}
                      {(bi.tipo==="prevista"||bi.tipo==="reembolso_prev")&&<span style={{fontSize:11,color:"#f472b6"}}>desde {MONTHS_FULL[bi.mesInicio||0]}/{bi.anoInicio||TODAY.getFullYear()}</span>}
                    </div>
                  </div>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:14,color:bt.color,flexShrink:0}}>{fmt(bi.valorPrevisto)}/mês</div>
                  <div style={{display:"flex",gap:5,flexShrink:0}}>
                    <button onClick={()=>setBaseModal({data:{...bi}})} style={{background:"#21262d",border:"none",borderRadius:6,color:"#8b949e",padding:"5px 8px",cursor:"pointer",fontSize:11}}>✏</button>
                    <button onClick={()=>deleteBase(bi.id)} style={{background:"#21262d",border:"none",borderRadius:6,color:"#f87171",padding:"5px 8px",cursor:"pointer",fontSize:11}}>✕</button>
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
