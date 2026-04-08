import { useState, useEffect } from "react";

const API = "https://votsecure-production.up.railway.app/api";

function getToken() { return localStorage.getItem("vs_token"); }
function saveToken(t) { localStorage.setItem("vs_token", t); }
function clearToken() { localStorage.removeItem("vs_token"); }

async function api(method, path, body, auth = true) {
  const headers = { "Content-Type": "application/json" };
  if (auth && getToken()) headers["Authorization"] = `Bearer ${getToken()}`;
  const res = await fetch(`${API}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Eroare ${res.status}`);
  return data;
}

const COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#14B8A6","#F97316"];

function validateCNP(cnp) {
  if (!/^\d{13}$/.test(cnp)) return false;
  const d = cnp.split("").map(Number);
  if (![1,2,5,6].includes(d[0])) return false;
  const year = d[1]*10+d[2]; if (year>=8&&year<=26) return false;
  const month = d[3]*10+d[4]; if (month<1||month>12) return false;
  const day = d[5]*10+d[6]; if (day<1||day>31) return false;
  const county = d[7]*10+d[8]; if (county<1||county>52) return false;
  return true;
}

export default function App() {
  const [screen, setScreen] = useState("login");
  const [adminTab, setAdminTab] = useState("elections");
  const [user, setUser] = useState(null);
  const [authTab, setAuthTab] = useState("login");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ name: "", email: "", cnp: "", password: "", confirm: "" });
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [elections, setElections] = useState([]);
  const [election, setElection] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [results, setResults] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [isVoting, setIsVoting] = useState(false);
  const [elForm, setElForm] = useState({ title: "", type: "uninominal", description: "", startTime: "", endTime: "", candidates: [{ name: "", party: "" }, { name: "", party: "" }] });
  const [elError, setElError] = useState("");
  const [elLoading, setElLoading] = useState(false);
  const [voterForm, setVoterForm] = useState({ name: "", email: "", cnp: "", password: "" });
  const [voterError, setVoterError] = useState("");
  const [voterLoading, setVoterLoading] = useState(false);

  const notify = (msg, type = "info") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    if (getToken()) {
      api("GET", "/auth/me").then(data => {
        setUser(data.user);
        if (data.user.role === "admin") { setScreen("admin"); loadAdminData(); loadElections(); }
        else { setScreen("dashboard"); loadElections(); }
      }).catch(() => { clearToken(); setScreen("login"); });
    }
  }, []);

  async function loadElections() {
    try { const d = await api("GET", "/vote/elections"); setElections(d.elections || []); } catch {}
  }

  async function loadElection(id) {
    try {
      const d = await api("GET", `/vote/elections/${id}`);
      setElection(d.election); setCandidates(d.candidates || []); setHasVoted(d.hasVoted || false);
    } catch (e) { notify(e.message, "error"); }
  }

  async function loadResults(id) {
    try { const d = await api("GET", `/vote/elections/${id}/results`); setResults(d); }
    catch (e) { notify(e.message, "error"); }
  }

  async function loadAdminData() {
    try {
      const [a, s, u] = await Promise.all([
        api("GET", "/admin/audit"),
        api("GET", "/admin/stats"),
        api("GET", "/admin/users"),
      ]);
      setAuditLog(a.events || []); setStats(s); setUsers(u.users || []);
    } catch {}
  }

  async function handleLogin() {
    setAuthError("");
    if (!loginForm.email || !loginForm.password) { setAuthError("Completați toate câmpurile."); return; }
    setLoading(true);
    try {
      const d = await api("POST", "/auth/login", loginForm, false);
      saveToken(d.token); setUser(d.user);
      notify(`Bun venit, ${d.user.name}!`, "success");
      if (d.user.role === "admin") { setScreen("admin"); loadAdminData(); loadElections(); }
      else { setScreen("dashboard"); loadElections(); }
    } catch (e) { setAuthError(e.message); }
    finally { setLoading(false); }
  }

  async function handleRegister() {
    setAuthError("");
    const { name, email, cnp, password, confirm } = registerForm;
    if (!name||!email||!cnp||!password||!confirm) { setAuthError("Completați toate câmpurile."); return; }
    if (!email.includes("@") || !email.includes(".")) { setAuthError("Emailul nu este valid."); return; }
    if (!validateCNP(cnp)) { setAuthError("CNP invalid"); return; }
    if (password.length < 6) { setAuthError("Parola trebuie să aibă cel puțin 6 caractere."); return; }
    if (password !== confirm) { setAuthError("Parolele nu coincid."); return; }
    setLoading(true);
    try {
      const d = await api("POST", "/auth/register", { name, email, cnp, password }, false);
      saveToken(d.token); setUser(d.user);
      notify(`Cont creat! Bun venit, ${d.user.name}!`, "success");
      setScreen("dashboard"); loadElections();
    } catch (e) { setAuthError(e.message); }
    finally { setLoading(false); }
  }

  function handleLogout() {
    clearToken(); setUser(null); setScreen("login");
    setElection(null); setReceipt(null); setResults(null); setSelectedCandidate(null);
  }

  async function handleVote() {
    if (!selectedCandidate || !election) return;
    setIsVoting(true);
    try {
      const d = await api("POST", "/vote/cast", { electionId: election.id, candidateId: selectedCandidate });
      setReceipt(d); setHasVoted(true); setScreen("receipt");
      notify("Vot înregistrat cu succes!", "success");
    } catch (e) { notify(e.message, "error"); }
    finally { setIsVoting(false); }
  }

  async function handleCreateElection() {
    setElError("");
    const { title, type, startTime, endTime, candidates: cands } = elForm;
    if (!title.trim()) { setElError("Titlul este obligatoriu."); return; }
    if (!startTime || !endTime) { setElError("Perioada de votare este obligatorie."); return; }
    if (new Date(endTime) <= new Date(startTime)) { setElError("Data închiderii trebuie să fie după data deschiderii."); return; }
    const validCands = cands.filter(c => c.name.trim());
    if (validCands.length < 2) { setElError("Adăugați cel puțin 2 candidați."); return; }
    setElLoading(true);
    try {
      await api("POST", "/admin/elections", { title: title.trim(), type, description: elForm.description, startTime: new Date(startTime).toISOString(), endTime: new Date(endTime).toISOString(), candidates: validCands });
      notify("Alegerea a fost creată cu succes!", "success");
      setElForm({ title: "", type: "uninominal", description: "", startTime: "", endTime: "", candidates: [{ name: "", party: "" }, { name: "", party: "" }] });
      loadElections(); loadAdminData(); setAdminTab("elections");
    } catch (e) { setElError(e.message); }
    finally { setElLoading(false); }
  }

  function addCandidate() { setElForm(f => ({ ...f, candidates: [...f.candidates, { name: "", party: "" }] })); }
  function removeCandidate(i) { setElForm(f => ({ ...f, candidates: f.candidates.filter((_, idx) => idx !== i) })); }
  function updateCandidate(i, field, val) {
    setElForm(f => { const c = [...f.candidates]; c[i] = { ...c[i], [field]: val }; return { ...f, candidates: c }; });
  }

  async function handleAddVoter() {
    setVoterError("");
    const { name, email, cnp, password } = voterForm;
    if (!name||!email||!cnp||!password) { setVoterError("Completați toate câmpurile."); return; }
    if (!email.endsWith("@vote.ro")) { setVoterError("Emailul trebuie să fie @vote.ro."); return; }
    if (!validateCNP(cnp)) { setVoterError("CNP invalid"); return; }
    if (password.length < 6) { setVoterError("Parola trebuie să aibă cel puțin 6 caractere."); return; }
    setVoterLoading(true);
    try {
      await api("POST", "/auth/register", { name, email, cnp, password }, false);
      notify(`Alegătorul ${name} a fost adăugat!`, "success");
      setVoterForm({ name: "", email: "", cnp: "", password: "" });
      loadAdminData();
    } catch (e) { setVoterError(e.message); }
    finally { setVoterLoading(false); }
  }

  async function handleCloseElection(id) {
    try { await api("PATCH", `/admin/elections/${id}/close`); notify("Alegerea a fost închisă.", "success"); loadElections(); loadAdminData(); }
    catch (e) { notify(e.message, "error"); }
  }

  async function handleArchiveElection(id) {
    try {
      await api("PATCH", `/admin/elections/${id}/archive`);
      notify("Alegerea a fost arhivată și nu mai este vizibilă pentru alegători.", "success");
      loadElections(); loadAdminData();
    } catch (e) { notify(e.message, "error"); }
  }

  return (
    <div style={S.root}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=IBM+Plex+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0a0f}input,button,select,textarea{outline:none;font-family:inherit}button{cursor:pointer;border:none}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#333;border-radius:2px}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}.fu{animation:fadeUp 0.4s ease forwards}.fu2{animation:fadeUp 0.4s 0.1s ease both}.fu3{animation:fadeUp 0.4s 0.2s ease both}input[type="datetime-local"]{color-scheme:dark}`}</style>

      {notification && (
        <div style={{...S.notif, background:notification.type==="error"?"#7f1d1d":notification.type==="success"?"#14532d":"#1e293b", borderColor:notification.type==="error"?"#ef4444":notification.type==="success"?"#22c55e":"#475569", animation:"slideIn 0.3s ease"}}>
          {notification.type==="error"?"⚠ ":notification.type==="success"?"✓ ":"ℹ "}{notification.msg}
        </div>
      )}

      {user && (
        <div style={S.header}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:26,color:"#fbbf24"}}>⬡</span>
            <div>
              <div style={{fontFamily:"Playfair Display",fontSize:17,fontWeight:700,color:"#fbbf24"}}>VotSecure</div>
              <div style={{fontSize:10,color:"#475569",fontFamily:"IBM Plex Mono",letterSpacing:1}}>SISTEM ELECTORAL</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            {user.role==="voter" && <>
              <NavBtn active={screen==="dashboard"} onClick={()=>{setScreen("dashboard");loadElections()}}>Acasă</NavBtn>
              {receipt && <NavBtn active={screen==="receipt"} onClick={()=>setScreen("receipt")}>Chitanță</NavBtn>}
            </>}
            {user.role==="admin" && <>
              <NavBtn active={screen==="admin"} onClick={()=>{setScreen("admin");loadAdminData();loadElections()}}>Admin</NavBtn>
              <NavBtn active={screen==="results"} onClick={()=>setScreen("results")}>Rezultate</NavBtn>
            </>}
            <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:8}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:"#22c55e"}}/>
              <span style={{fontSize:12,color:"#94a3b8"}}>{user.name}</span>
              <span style={S.rolePill}>{user.role}</span>
            </div>
            <button onClick={handleLogout} style={S.logoutBtn}>Ieșire</button>
          </div>
        </div>
      )}

      <div style={S.content}>

        {/* LOGIN / REGISTER */}
        {!user && (
          <div style={S.loginWrap} className="fu">
            <div style={S.loginCard}>
              <div style={{fontSize:40,color:"#fbbf24",textAlign:"center"}}>⬡</div>
              <h1 style={{fontFamily:"Playfair Display",fontSize:28,fontWeight:900,color:"#fbbf24",textAlign:"center",margin:"8px 0 4px"}}>VotSecure</h1>
              <p style={{color:"#475569",fontSize:11,textAlign:"center",fontFamily:"IBM Plex Mono",letterSpacing:1,marginBottom:20}}>SISTEM ELECTORAL CRIPTOGRAFIC</p>
              <div style={{display:"flex",gap:4,background:"#0a0a0f",borderRadius:8,padding:4,marginBottom:20}}>
                {["login","register"].map(t=>(
                  <button key={t} onClick={()=>{setAuthTab(t);setAuthError("")}}
                    style={{flex:1,padding:"8px 12px",borderRadius:6,fontSize:13,fontWeight:500,background:authTab===t?"#111827":"transparent",color:authTab===t?"#fbbf24":"#475569",border:authTab===t?"1px solid rgba(251,191,36,0.2)":"none",transition:"all 0.2s"}}>
                    {t==="login"?"Autentificare":"Înregistrare"}
                  </button>
                ))}
              </div>
              {authTab==="login" ? (
                <>
                  <Field label="Email" value={loginForm.email} onChange={v=>setLoginForm(f=>({...f,email:v}))} placeholder="utilizator@vote.ro" onEnter={handleLogin}/>
                  <Field label="Parolă" type="password" value={loginForm.password} onChange={v=>setLoginForm(f=>({...f,password:v}))} placeholder="••••••••" onEnter={handleLogin}/>
                  {authError && <ErrBox>{authError}</ErrBox>}
                  <PrimaryBtn loading={loading} onClick={handleLogin}>Autentificare securizată</PrimaryBtn>
                  <div style={S.demoHint}>
                    <div style={{marginBottom:6,color:"#475569"}}>Conturi demo:</div>
                    {[{email:"ion@vote.ro",pass:"Parola123",label:"👤 Ion Popescu (voter)"},{email:"admin2@vote.ro",pass:"Admin123",label:"👑 Admin Electoral (admin)"}].map(u=>(
                      <button key={u.email} style={S.demoBtn} onClick={()=>setLoginForm({email:u.email,password:u.pass})}>{u.label}</button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div style={{background:"rgba(251,191,36,0.06)",border:"1px solid rgba(251,191,36,0.2)",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#94a3b8",marginBottom:14}}>
                    ⚠ Introduceți o adresă de email validă.                  </div>
                  <Field label="Nume complet" value={registerForm.name} onChange={v=>setRegisterForm(f=>({...f,name:v}))} placeholder="Ion Popescu"/>
                  <Field label="Email (@vote.ro)" value={registerForm.email} onChange={v=>setRegisterForm(f=>({...f,email:v}))} placeholder="ion.popescu@vote.ro" valid={registerForm.email.includes("@")&&registerForm.email.includes(".")} invalid={registerForm.email&&(!registerForm.email.includes("@")||!registerForm.email.includes("."))}/>
                  <CNPField value={registerForm.cnp} onChange={v=>setRegisterForm(f=>({...f,cnp:v}))}/>
                  <Field label="Parolă (min. 6 caractere)" type="password" value={registerForm.password} onChange={v=>setRegisterForm(f=>({...f,password:v}))} placeholder="••••••••"/>
                  <Field label="Confirmați parola" type="password" value={registerForm.confirm} onChange={v=>setRegisterForm(f=>({...f,confirm:v}))} placeholder="••••••••" invalid={registerForm.confirm&&registerForm.confirm!==registerForm.password}/>
                  {authError && <ErrBox>{authError}</ErrBox>}
                  <PrimaryBtn loading={loading} onClick={handleRegister}>🔐 Creați contul</PrimaryBtn>
                </>
              )}
            </div>
          </div>
        )}

        {/* DASHBOARD VOTER */}
        {screen==="dashboard" && user?.role==="voter" && (
          <div className="fu">
            <h1 style={S.pageTitle}>Alegeri disponibile</h1>
            {elections.length===0 && <div style={S.infoBox}>Nu există alegeri active momentan.</div>}
            {elections.map(el=>(
              <div key={el.id} style={S.card}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                  <div>
                    <div style={{fontFamily:"Playfair Display",fontSize:18,color:"#f1f5f9",marginBottom:4}}>{el.title}</div>
                    <div style={{fontSize:11,color:"#475569",fontFamily:"IBM Plex Mono"}}>{el.type} · {el.candidate_count} candidați</div>
                    {el.description && <div style={{fontSize:12,color:"#64748b",marginTop:4}}>{el.description}</div>}
                  </div>
                    <StatusPill status={el.status} endTime={el.end_time}/>
                </div>
                <div style={{display:"flex",gap:24,marginBottom:14}}>
                  <TimeInfo label="Deschidere" value={new Date(el.start_time).toLocaleString("ro-RO")}/>
                  <TimeInfo label="Închidere" value={new Date(el.end_time).toLocaleString("ro-RO")}/>
                </div>
                <div style={{display:"flex",gap:8}}>
                  {el.status==="active" && new Date(el.end_time) > new Date() && <button style={{...S.primaryBtn,width:"auto",padding:"10px 20px",marginTop:0}} onClick={()=>{loadElection(el.id);setScreen("vote")}}>Votează →</button>}
                  {el.status==="active" && new Date(el.end_time) < new Date() && <div style={{color:"#f97316",fontSize:12,fontFamily:"IBM Plex Mono"}}>⏱ Perioada de vot a expirat</div>}
                  {el.status==="closed" && <button style={S.secondaryBtn} onClick={()=>{loadResults(el.id);setScreen("results")}}>Vezi rezultate</button>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* VOTE */}
        {screen==="vote" && election && (
          <div className="fu">
            <button onClick={()=>setScreen("dashboard")} style={S.backBtn}>← Înapoi</button>
            <h1 style={S.pageTitle}>{election.title}</h1>
            {hasVoted ? (
              <div style={{background:"#14532d22",border:"1px solid #22c55e44",borderRadius:12,padding:28,textAlign:"center"}}>
                <div style={{fontSize:36,marginBottom:8}}>✓</div>
                <div style={{fontFamily:"Playfair Display",fontSize:18,color:"#22c55e",marginBottom:6}}>Ați votat deja</div>
                <div style={{color:"#64748b",fontSize:13}}>Votul dvs. a fost înregistrat și criptat.</div>
                {receipt && <div style={{marginTop:12,color:"#94a3b8",fontSize:13}}>Cod verificare: <code style={S.code}>{receipt.receiptCode}</code></div>}
              </div>
            ) : (
              <>
                <div style={{background:"#7f1d1d22",border:"1px solid #ef444433",borderRadius:10,padding:"12px 16px",color:"#fca5a5",fontSize:13,marginBottom:20,lineHeight:1.5}}>
                  ⚠ Votul este irevocabil. Odată confirmat, nu poate fi modificat.
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:20}}>
                  {candidates.map((c,i)=>(
                    <div key={c.id} onClick={()=>setSelectedCandidate(c.id)}
                      style={{...S.candCard,borderColor:selectedCandidate===c.id?COLORS[i%COLORS.length]:"transparent",background:selectedCandidate===c.id?`${COLORS[i%COLORS.length]}18`:"#111827"}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:COLORS[i%COLORS.length],marginBottom:10}}/>
                      <div style={{fontFamily:"Playfair Display",fontSize:15,color:"#f1f5f9",marginBottom:3}}>{c.name}</div>
                      <div style={{color:"#475569",fontSize:12}}>{c.party}</div>
                      {selectedCandidate===c.id && <div style={{position:"absolute",top:12,right:14,color:COLORS[i%COLORS.length],fontSize:18,fontWeight:700}}>✓</div>}
                    </div>
                  ))}
                </div>
                {selectedCandidate && (
                  <div style={{background:"#111827",border:"1px solid #1e293b",borderRadius:12,padding:20}}>
                    <div style={{color:"#94a3b8",fontSize:14,marginBottom:14}}>
                      Candidat selectat: <strong style={{color:"#fbbf24"}}>{candidates.find(c=>c.id===selectedCandidate)?.name}</strong>
                    </div>
                    {isVoting ? (
                      <div style={{display:"flex",alignItems:"center",gap:10,color:"#64748b",fontSize:13,padding:"8px 0"}}>
                        <div style={{width:16,height:16,border:"2px solid #1e293b",borderTopColor:"#fbbf24",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
                        Criptare și înregistrare în curs...
                      </div>
                    ) : (
                      <button style={{...S.primaryBtn,fontSize:15,padding:"14px 20px"}} onClick={handleVote}>🔒 Confirmați și trimiteți votul</button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* RECEIPT */}
        {screen==="receipt" && receipt && (
          <div className="fu" style={{display:"flex",justifyContent:"center"}}>
            <div style={{background:"#111827",border:"1px solid #22c55e44",borderRadius:16,padding:"40px 36px",textAlign:"center",maxWidth:460,width:"100%"}}>
              <div style={{fontSize:48,color:"#22c55e",marginBottom:12}}>✓</div>
              <div style={{fontFamily:"Playfair Display",fontSize:22,color:"#22c55e",marginBottom:8}}>Vot înregistrat</div>
              <div style={{color:"#64748b",fontSize:13,marginBottom:24,lineHeight:1.6}}>Votul a fost criptat și salvat în baza de date.</div>
              <div style={{background:"#0a0a0f",border:"1px solid #1e293b",borderRadius:10,padding:16,marginBottom:12}}>
                <div style={{color:"#475569",fontSize:11,fontFamily:"IBM Plex Mono",letterSpacing:1,marginBottom:8}}>COD DE VERIFICARE</div>
                <div style={{fontFamily:"IBM Plex Mono",fontSize:22,fontWeight:600,color:"#fbbf24",letterSpacing:3}}>{receipt.receiptCode}</div>
              </div>
              <div style={{background:"#0a0a0f",border:"1px solid #1e293b",borderRadius:8,padding:12,marginBottom:16}}>
                <div style={{color:"#475569",fontSize:10,fontFamily:"IBM Plex Mono",marginBottom:4}}>VOTE HASH</div>
                <code style={{...S.code,fontSize:11}}>{receipt.voteHash}</code>
              </div>
              <div style={{color:"#475569",fontSize:12,lineHeight:1.6,marginBottom:20}}>Păstrați codul pentru a confirma că votul a fost înregistrat.</div>
              <button style={S.primaryBtn} onClick={()=>setScreen("dashboard")}>Înapoi la panou</button>
            </div>
          </div>
        )}

        {/* RESULTS */}
        {screen==="results" && (
          <div className="fu">
            <button onClick={()=>setScreen(user?.role==="admin"?"admin":"dashboard")} style={S.backBtn}>← Înapoi</button>
            <h1 style={S.pageTitle}>Rezultate {results?.status==="closed"?"Finale":"(Live)"}</h1>
            {user?.role==="admin" && elections.length>0 && (
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
                {elections.map(el=>(
                  <button key={el.id} style={{...S.secondaryBtn,fontSize:12}} onClick={()=>loadResults(el.id)}>{el.title}</button>
                ))}
              </div>
            )}
            {!results ? <div style={S.infoBox}>Selectați o alegere pentru a vedea rezultatele.</div> : (
              <div style={S.card}>
                <div style={{display:"flex",justifyContent:"space-between",color:"#94a3b8",fontSize:13,marginBottom:20}}>
                  <span style={{fontFamily:"Playfair Display",fontSize:16,color:"#f1f5f9"}}>{results.electionTitle}</span>
                  <span>Total: <strong style={{color:"#fbbf24"}}>{results.total} voturi</strong></span>
                </div>
                {results.candidates?.map((c,i)=>(
                  <div key={c.id} style={{marginBottom:18}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <div>
                        <span style={{fontFamily:"Playfair Display",fontSize:14,color:"#e2e8f0"}}>{c.name}</span>
                        {c.party && <span style={{color:"#475569",fontSize:11,marginLeft:8}}>{c.party}</span>}
                      </div>
                      <div style={{display:"flex",gap:12,alignItems:"center"}}>
                        <span style={{color:COLORS[i%COLORS.length],fontFamily:"IBM Plex Mono",fontSize:13,fontWeight:600}}>{c.percentage}%</span>
                        <span style={{color:"#475569",fontSize:12}}>{c.votes} voturi</span>
                      </div>
                    </div>
                    <div style={{height:8,background:"#0a0a0f",borderRadius:99,overflow:"hidden"}}>
                      <div style={{height:"100%",borderRadius:99,width:`${results.total>0?(c.votes/results.total*100):0}%`,background:COLORS[i%COLORS.length],transition:"width 0.8s ease"}}/>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ADMIN */}
        {screen==="admin" && user?.role==="admin" && (
          <div className="fu">
            <h1 style={S.pageTitle}>Panou Administrator</h1>
            {stats && (
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24}}>
                {[["Alegători",stats.voters],["Voturi totale",stats.totalVotes],["Alegeri",elections.length]].map(([label,val])=>(
                  <div key={label} style={{background:"#111827",border:"1px solid #1e293b",borderRadius:10,padding:"16px 20px"}}>
                    <div style={{color:"#475569",fontSize:11,fontFamily:"IBM Plex Mono",marginBottom:6}}>{label.toUpperCase()}</div>
                    <div style={{color:"#fbbf24",fontSize:28,fontFamily:"IBM Plex Mono",fontWeight:600}}>{val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Admin Tabs */}
            <div style={{display:"flex",gap:3,background:"#0a0a0f",borderRadius:8,padding:4,marginBottom:20,flexWrap:"wrap"}}>
              {[["elections","Alegeri"],["create","+ Alegere nouă"],["voters","Alegători"],["addVoter","+ Alegător nou"],["audit","Audit"]].map(([tab,label])=>(
                <button key={tab} onClick={()=>setAdminTab(tab)}
                  style={{flex:1,padding:"8px 10px",borderRadius:6,fontSize:12,fontWeight:500,minWidth:100,
                    background:adminTab===tab?"#111827":"transparent",color:adminTab===tab?"#fbbf24":"#475569",
                    border:adminTab===tab?"1px solid rgba(251,191,36,0.2)":"none",transition:"all 0.2s"}}>
                  {label}
                </button>
              ))}
            </div>

            {/* Tab: Alegeri */}
            {adminTab==="elections" && (
              <div style={S.card} className="fu">
                <div style={S.cardTitle}>Alegeri ({elections.length})</div>
                {elections.length===0 && <div style={{color:"#475569",fontSize:13}}>Nu există alegeri. Creați una din tab-ul "+ Alegere nouă".</div>}
                {elections.map(el=>(
                  <div key={el.id} style={{borderBottom:"1px solid #0f172a",padding:"14px 0"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div>
                        <div style={{color:"#e2e8f0",fontSize:14,fontFamily:"Playfair Display",marginBottom:2}}>{el.title}</div>
                        <div style={{color:"#475569",fontSize:11,fontFamily:"IBM Plex Mono"}}>{el.type} · {el.candidate_count} candidați</div>
                      </div>
                      <StatusPill status={el.status} endTime={el.end_time}/>
                    </div>
                    <div style={{display:"flex",gap:16,marginBottom:10}}>
                      <TimeInfo label="Deschidere" value={new Date(el.start_time).toLocaleString("ro-RO")}/>
                      <TimeInfo label="Închidere" value={new Date(el.end_time).toLocaleString("ro-RO")}/>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      {el.status==="active" && (
                        <button style={{...S.primaryBtn,width:"auto",padding:"7px 14px",fontSize:12,marginTop:0,background:"#7f1d1d"}} onClick={()=>handleCloseElection(el.id)}>
                          Închide alegerea
                        </button>
                      )}
                      <button style={{...S.secondaryBtn,fontSize:12}} onClick={()=>{loadResults(el.id);setScreen("results")}}>Rezultate</button>{el.status==="closed" && (
                      <button style={{...S.secondaryBtn,fontSize:12,borderColor:"#475569",color:"#475569"}}
                        onClick={()=>handleArchiveElection(el.id)}>
                        📦 Arhivează
                      </button>
                    )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab: Creare alegere */}
            {adminTab==="create" && (
              <div style={S.card} className="fu">
                <div style={S.cardTitle}>Creare alegere nouă</div>
                <Field label="Titlu alegere *" value={elForm.title} onChange={v=>setElForm(f=>({...f,title:v}))} placeholder="ex: Alegeri Studențești 2024"/>
                <div style={{marginBottom:14}}>
                  <label style={S.label}>Tip alegere</label>
                  <select style={{...S.input,cursor:"pointer"}} value={elForm.type} onChange={e=>setElForm(f=>({...f,type:e.target.value}))}>
                    <option value="uninominal">Uninominal</option>
                    <option value="multi-candidat">Multi-candidat</option>
                    <option value="referendum">Referendum</option>
                  </select>
                </div>
                <div style={{marginBottom:14}}>
                  <label style={S.label}>Descriere (opțional)</label>
                  <textarea style={{...S.input,height:70,resize:"vertical"}} value={elForm.description} placeholder="Descriere scurtă..." onChange={e=>setElForm(f=>({...f,description:e.target.value}))}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                  <div>
                    <label style={S.label}>Data și ora deschiderii *</label>
                    <input style={S.input} type="datetime-local" value={elForm.startTime} onChange={e=>setElForm(f=>({...f,startTime:e.target.value}))}/>
                  </div>
                  <div>
                    <label style={S.label}>Data și ora închiderii *</label>
                    <input style={S.input} type="datetime-local" value={elForm.endTime} onChange={e=>setElForm(f=>({...f,endTime:e.target.value}))}/>
                  </div>
                </div>
                <div style={{marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <label style={S.label}>Candidați * (minim 2)</label>
                    <button onClick={addCandidate} style={{...S.secondaryBtn,fontSize:11,padding:"4px 10px"}}>+ Adaugă candidat</button>
                  </div>
                  {elForm.candidates.map((c,i)=>(
                    <div key={i} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:COLORS[i%COLORS.length],flexShrink:0}}/>
                      <input style={{...S.input,flex:2}} value={c.name} placeholder={`Candidat ${i+1} — Nume *`} onChange={e=>updateCandidate(i,"name",e.target.value)}/>
                      <input style={{...S.input,flex:2}} value={c.party} placeholder="Partid (opțional)" onChange={e=>updateCandidate(i,"party",e.target.value)}/>
                      {elForm.candidates.length>2 && (
                        <button onClick={()=>removeCandidate(i)} style={{background:"#7f1d1d",color:"#fca5a5",border:"none",borderRadius:6,padding:"6px 10px",fontSize:12,cursor:"pointer",flexShrink:0}}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
                {elError && <ErrBox>{elError}</ErrBox>}
                <PrimaryBtn loading={elLoading} onClick={handleCreateElection}>✓ Creează alegerea</PrimaryBtn>
              </div>
            )}

            {/* Tab: Alegători */}
            {adminTab==="voters" && (
              <div style={S.card} className="fu">
                <div style={S.cardTitle}>Alegători înregistrați ({users.length})</div>
                {users.length===0 && <div style={{color:"#475569",fontSize:13}}>Nu există alegători înregistrați.</div>}
                <div style={{maxHeight:400,overflowY:"auto"}}>
                  {users.map(u=>(
                    <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #0f172a"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:32,height:32,borderRadius:"50%",background:"#1e293b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#64748b",fontWeight:600,flexShrink:0}}>
                          {u.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{color:"#e2e8f0",fontSize:13}}>{u.name}</div>
                          <div style={{color:"#475569",fontSize:11}}>{u.email}</div>
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{color:"#64748b",fontSize:11}}>{u.last_login ? new Date(u.last_login).toLocaleDateString("ro-RO") : "Niciodată autentificat"}</div>
                        <div style={{color:"#334155",fontSize:10,marginTop:2}}>din {new Date(u.created_at).toLocaleDateString("ro-RO")}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab: Adăugare alegător */}
            {adminTab==="addVoter" && (
              <div style={S.card} className="fu">
                <div style={S.cardTitle}>Adăugare alegător nou</div>
                <div style={{background:"rgba(59,130,246,0.06)",border:"1px solid rgba(59,130,246,0.2)",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#93c5fd",marginBottom:16}}>
                  ℹ Emailul trebuie să fie <strong>@vote.ro</strong>. Alegătorul se va putea autentifica cu credențialele setate.
                </div>
                <Field label="Nume complet *" value={voterForm.name} onChange={v=>setVoterForm(f=>({...f,name:v}))} placeholder="Ion Popescu"/>
                <Field label="Email (@vote.ro) *" value={voterForm.email} onChange={v=>setVoterForm(f=>({...f,email:v}))} placeholder="ion.popescu@vote.ro" valid={voterForm.email.includes("@")&&voterForm.email.includes(".")} invalid={voterForm.email&&(!voterForm.email.includes("@")||!voterForm.email.includes("."))}/>
                <CNPField value={voterForm.cnp} onChange={v=>setVoterForm(f=>({...f,cnp:v}))}/>
                <Field label="Parolă inițială *" type="password" value={voterForm.password} onChange={v=>setVoterForm(f=>({...f,password:v}))} placeholder="min. 6 caractere"/>
                {voterError && <ErrBox>{voterError}</ErrBox>}
                <PrimaryBtn loading={voterLoading} onClick={handleAddVoter}>+ Adaugă alegătorul</PrimaryBtn>
              </div>
            )}

            {/* Tab: Audit */}
            {adminTab==="audit" && (
              <div style={S.card} className="fu">
                <div style={S.cardTitle}>Jurnal de audit ({auditLog.length} evenimente)</div>
                <div style={{maxHeight:500,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
                  {auditLog.map(e=>(
                    <div key={e.id} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid #0f172a",alignItems:"flex-start"}}>
                      <code style={{color:"#334155",fontSize:10,whiteSpace:"nowrap",flexShrink:0}}>{new Date(e.created_at).toLocaleString("ro-RO")}</code>
                      <span style={{color:"#fbbf24",fontSize:11,fontFamily:"IBM Plex Mono",whiteSpace:"nowrap",flexShrink:0}}>{e.event_type}</span>
                      <span style={{color:"#64748b",fontSize:11}}>{e.user_name||"—"}</span>
                      <span style={{color:"#334155",fontSize:10,marginLeft:"auto",flexShrink:0}}>{e.ip_address}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}

function NavBtn({children,active,onClick}){
  return <button onClick={onClick} style={{background:active?"rgba(251,191,36,0.1)":"transparent",color:active?"#fbbf24":"#64748b",border:`1px solid ${active?"rgba(251,191,36,0.3)":"transparent"}`,borderRadius:6,padding:"6px 12px",fontSize:12,fontWeight:500,transition:"all 0.2s"}}>{children}</button>;
}

function StatusPill({status, endTime}){
  const expired = status === "active" && endTime && new Date(endTime) < new Date();
  const cfg={
    active:{bg:"#14532d",color:"#22c55e",label:"● ACTIV"},
    expired:{bg:"#7f1d1d",color:"#f97316",label:"⏱ EXPIRAT"},
    closed:{bg:"#7f1d1d",color:"#ef4444",label:"■ ÎNCHIS"},
    pending:{bg:"#1e293b",color:"#94a3b8",label:"◌ INACTIV"}
  };
  const c = expired ? cfg.expired : cfg[status] || cfg.pending;
  return <span style={{background:c.bg,color:c.color,fontSize:10,fontFamily:"IBM Plex Mono",padding:"3px 8px",borderRadius:99,letterSpacing:1,fontWeight:600}}>{c.label}</span>;
}

function TimeInfo({label,value}){
  return <div><div style={{color:"#475569",fontSize:10,fontFamily:"IBM Plex Mono",marginBottom:2}}>{label}</div><div style={{color:"#94a3b8",fontSize:12}}>{value}</div></div>;
}

function Field({label,value,onChange,type="text",placeholder,onEnter,valid,invalid}){
  return (
    <div style={{marginBottom:14}}>
      <label style={S.label}>{label}</label>
      <input style={{...S.input,borderColor:valid?"#22c55e":invalid?"#ef4444":"#1e293b"}} type={type} value={value} placeholder={placeholder}
        onChange={e=>onChange(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onEnter&&onEnter()}/>
    </div>
  );
}

function CNPField({value,onChange}){
  const valid = value.length===13 && (() => {
    if(!/^\d{13}$/.test(value)) return false;
    const d=value.split("").map(Number);
    if(![1,2,5,6].includes(d[0])) return false;
    const y=d[1]*10+d[2]; if(y>=8&&y<=26) return false;
    const m=d[3]*10+d[4]; if(m<1||m>12) return false;
    const day=d[5]*10+d[6]; if(day<1||day>31) return false;
    const c=d[7]*10+d[8]; if(c<1||c>52) return false;
    return true;
  })();
  const invalid = value.length===13 && !valid;
  return (
    <div style={{marginBottom:14}}>
      <label style={S.label}>CNP (13 cifre) *</label>
      <input style={{...S.input,borderColor:valid?"#22c55e":invalid?"#ef4444":"#1e293b"}}
        value={value} maxLength={13} placeholder="1234567890123"
        onChange={e=>onChange(e.target.value.replace(/\D/g,"").slice(0,13))}/>
      {invalid && <div style={{color:"#ef4444",fontSize:11,marginTop:4,fontFamily:"IBM Plex Mono"}}>CNP invalid</div>}
      {valid && <div style={{color:"#22c55e",fontSize:11,marginTop:4,fontFamily:"IBM Plex Mono"}}>✓ CNP valid</div>}
      {value.length>0&&value.length<13 && <div style={{color:"#475569",fontSize:11,marginTop:4,fontFamily:"IBM Plex Mono"}}>{value.length}/13 cifre</div>}
    </div>
  );
}

function ErrBox({children}){
  return <div style={{background:"#7f1d1d22",border:"1px solid #ef444455",borderRadius:8,padding:"10px 14px",color:"#fca5a5",fontSize:13,marginBottom:12}}>{children}</div>;
}

function PrimaryBtn({children,onClick,loading}){
  return (
    <button style={S.primaryBtn} onClick={onClick} disabled={loading}>
      {loading ? <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
        <span style={{width:14,height:14,border:"2px solid #0a0a0f40",borderTopColor:"#0a0a0f",borderRadius:"50%",animation:"spin 0.8s linear infinite",display:"inline-block"}}/>
        Se procesează...
      </span> : children}
    </button>
  );
}

const S = {
  root:{minHeight:"100vh",background:"#0a0a0f",color:"#e2e8f0",fontFamily:"DM Sans, sans-serif"},
  notif:{position:"fixed",top:16,right:16,zIndex:9999,padding:"12px 18px",borderRadius:10,border:"1px solid",fontSize:13,color:"#e2e8f0",maxWidth:340},
  header:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 24px",borderBottom:"1px solid #1e293b",background:"rgba(10,10,15,0.95)",position:"sticky",top:0,zIndex:100,backdropFilter:"blur(12px)",flexWrap:"wrap",gap:8},
  content:{maxWidth:960,margin:"0 auto",padding:"32px 16px"},
  loginWrap:{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"85vh",padding:16},
  loginCard:{background:"#111827",border:"1px solid #1e293b",borderRadius:16,padding:"36px 32px",maxWidth:420,width:"100%"},
  pageTitle:{fontFamily:"Playfair Display",fontSize:26,fontWeight:700,color:"#f1f5f9",marginBottom:24,letterSpacing:-0.5},
  label:{display:"block",fontSize:11,color:"#64748b",fontFamily:"IBM Plex Mono",letterSpacing:0.5,marginBottom:5},
  input:{width:"100%",background:"#0a0a0f",border:"1px solid #1e293b",borderRadius:8,padding:"10px 14px",color:"#e2e8f0",fontSize:14},
  primaryBtn:{width:"100%",background:"linear-gradient(135deg,#fbbf24,#f59e0b)",color:"#0a0a0f",border:"none",borderRadius:8,padding:"12px 20px",fontSize:14,fontWeight:700,cursor:"pointer",marginTop:8},
  secondaryBtn:{background:"transparent",color:"#64748b",border:"1px solid #1e293b",borderRadius:8,padding:"8px 16px",fontSize:13,cursor:"pointer"},
  demoHint:{background:"#0a0a0f",border:"1px solid #1e293b",borderRadius:8,padding:"12px 14px",marginTop:14,fontSize:12,color:"#475569"},
  demoBtn:{display:"block",width:"100%",textAlign:"left",background:"rgba(251,191,36,0.05)",border:"1px solid rgba(251,191,36,0.1)",borderRadius:6,padding:"6px 10px",color:"#94a3b8",fontSize:12,fontFamily:"IBM Plex Mono",cursor:"pointer",marginTop:6},
  code:{background:"#0a0a0f",border:"1px solid #1e293b",borderRadius:4,padding:"1px 6px",fontFamily:"IBM Plex Mono",color:"#fbbf24"},
  card:{background:"#111827",border:"1px solid #1e293b",borderRadius:12,padding:"20px 24px",marginBottom:16},
  cardTitle:{fontFamily:"Playfair Display",fontSize:17,color:"#94a3b8",marginBottom:16},
  candCard:{background:"#111827",border:"2px solid transparent",borderRadius:12,padding:"18px",cursor:"pointer",position:"relative",transition:"all 0.2s"},
  backBtn:{background:"transparent",color:"#475569",fontSize:13,cursor:"pointer",marginBottom:16,padding:0},
  rolePill:{background:"rgba(251,191,36,0.1)",color:"#fbbf24",border:"1px solid rgba(251,191,36,0.2)",fontSize:10,padding:"2px 7px",borderRadius:99,fontFamily:"IBM Plex Mono",letterSpacing:1},
  logoutBtn:{background:"transparent",color:"#475569",fontSize:12,padding:"6px 10px",borderRadius:6,border:"1px solid #1e293b",cursor:"pointer"},
  infoBox:{background:"#111827",border:"1px solid #1e293b",borderRadius:12,padding:"16px 20px",color:"#64748b",fontSize:13,marginBottom:20},
};