/* ===== Route 66 Family Challenge — app logic ===== */
const ACCOUNTS={
  Jacob:{role:'player',hash:'03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'},
  Lily:{role:'player',hash:'fe2592b42a727e977f055947385b709cc82b16b9a87f88c6abf3900d65d0cdc3'},
  Hannah:{role:'player',hash:'9975baa75e1603273cbd3d94746a0442e22d5dc0268750dd45229f343f53fe19'},
  Ethan:{role:'player',hash:'08f61ac43fc9a9d5bd3d41f6dc2976ad27d8d5d8422e2ac87c12b98364a331fe'},
  admin:{role:'admin',hash:'7f3d56bb44da1a1f5239ac9db712488db90f135d999290ed9104eba8691096e2'}
};
/* Paste your Google Apps Script /exec URL into sheetEndpoint to sync across devices. */
const CONFIG={sheetEndpoint:'',sheetUrl:''};

/* Departure: 12 Aug 2026, 11:40 UK time (BST = UTC+1) => 10:40 UTC */
const DEPARTURE=Date.UTC(2026,7,12,10,40,0);

const SCORE_PER_STOP=100;
const PLAYER_NAMES=Object.keys(ACCOUNTS).filter(n=>ACCOUNTS[n].role==='player');
const STORAGE={session:'route66-session-v3',shared:'route66-shared-v3',progressPrefix:'route66-progress-v3-'};

let session=null,progress=freshProgress(),shared=freshShared(),currentLevel=null,countdownTimer=null;
const $=s=>document.querySelector(s);
const els={
  login:$('#login'),site:$('#site'),loginForm:$('#loginForm'),username:$('#username'),password:$('#password'),loginError:$('#loginError'),
  who:$('#who'),homeView:$('#homeView'),levelView:$('#levelView'),levelBody:$('#levelBody'),backBtn:$('#backBtn'),
  countdown:$('#countdown'),map:$('#map'),mapProgress:$('#mapProgress'),
  reward:$('#reward'),rewardText:$('#rewardText'),amazonBtn:$('#amazonBtn'),voucher:$('#voucher'),
  adminPanel:$('#adminPanel'),adminRows:$('#adminRows'),adminEmpty:$('#adminEmpty'),sheetStatus:$('#sheetStatus'),
  leaderboard:$('#leaderboard'),leaderboardRows:$('#leaderboardRows'),leaderboardEmpty:$('#leaderboardEmpty'),
  syncBtn:$('#syncBtn'),logoutBtn:$('#logoutBtn'),adminRefreshBtn:$('#adminRefreshBtn'),exportCsvBtn:$('#exportCsvBtn')
};

/* ---------- storage ---------- */
function freshProgress(){return {completed:{},submitted:{},photos:{},hunt:{},quick:{},sketch:{},dot:{},quiz:{},points:{}};}
function freshShared(){return {submissions:[],updatedAt:null};}
function readJson(k,f=null){try{const v=localStorage.getItem(k);return v?JSON.parse(v):f;}catch{return f;}}
function writeJson(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}
function progressKey(){return STORAGE.progressPrefix+(session?.username||'guest');}
function loadProgress(){const s=readJson(progressKey(),null);progress=mergeProgress(s);}
function saveProgress(){if(session?.role!=='admin')writeJson(progressKey(),progress);}
function mergeProgress(s){const m=freshProgress();if(!s||typeof s!=='object')return m;Object.keys(m).forEach(k=>{m[k]=s[k]&&typeof s[k]==='object'?s[k]:m[k];});return m;}
function loadShared(){shared=normaliseShared(readJson(STORAGE.shared,freshShared()));}
function saveShared(){shared.updatedAt=new Date().toISOString();writeJson(STORAGE.shared,shared);}

/* ---------- helpers ---------- */
async function sha256(t){const b=new TextEncoder().encode(t);const d=await crypto.subtle.digest('SHA-256',b);return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function normalName(n){const c=n.trim().toLowerCase();return Object.keys(ACCOUNTS).find(a=>a.toLowerCase()===c);}
function isAdmin(){return session?.role==='admin';}
function today(){const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function dateObj(v){const [y,m,d]=v.split('-').map(Number);return new Date(y,m-1,d);}
function stopById(id){return STOPS.find(s=>s.id===id);}
function timestamp(v){const t=Date.parse(v||'');return Number.isFinite(t)?t:0;}
function latestSubmission(u,id){return shared.submissions.filter(i=>i.username===u&&i.stopId===id).sort((a,b)=>timestamp(b.updatedAt)-timestamp(a.updatedAt))[0]||null;}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function statusForStop(id){
  if(session?.test)return 'approved';
  if(isAdmin())return 'admin';
  const latest=latestSubmission(session?.username,id);
  if(latest?.status==='approved'||progress.completed[id])return 'approved';
  if(latest?.status==='pending'||progress.submitted[id]?.status==='pending')return 'pending';
  if(latest?.status==='rejected'||progress.submitted[id]?.status==='rejected')return 'rejected';
  return 'ready';
}
function unlocked(index){
  if(session?.test||isAdmin())return true;
  if(today()<dateObj(STOPS[index].unlock))return false;
  if(index===0)return true;
  return statusForStop(STOPS[index-1].id)==='approved';
}
function lockReason(index){
  if(today()<dateObj(STOPS[index].unlock))return 'Opens on '+STOPS[index].day+'.';
  if(index>0)return 'Finish '+STOPS[index-1].title+' first to unlock this.';
  return '';
}
function scoreWithBonus(i){return Number(i.score||SCORE_PER_STOP)+Number(i.bonus||0);}
function applySharedToProgress(){
  if(!session||session.test||isAdmin())return;
  STOPS.forEach(stop=>{
    const latest=latestSubmission(session.username,stop.id);
    if(!latest)return;
    progress.submitted[stop.id]={id:latest.id,status:latest.status};
    if(latest.status==='approved'){progress.completed[stop.id]=true;progress.points[stop.id]=scoreWithBonus(latest);}
    if(latest.status==='rejected'){delete progress.completed[stop.id];delete progress.points[stop.id];}
  });
  saveProgress();
}

/* ---------- COUNTDOWN ---------- */
function renderCountdown(){
  const now=Date.now();
  const diff=DEPARTURE-now;
  if(diff<=0){
    els.countdown.innerHTML='<span class="cd-label">✈️ We are on our way to America! Have an amazing trip!</span>';
    return;
  }
  const days=Math.floor(diff/86400000);
  const hrs=Math.floor((diff%86400000)/3600000);
  const mins=Math.floor((diff%3600000)/60000);
  els.countdown.innerHTML=
    '<span class="cd-label">🛫 Countdown to take-off!</span>'+
    '<div class="cd-units">'+
    '<div class="cd-unit"><b>'+days+'</b><span>days</span></div>'+
    '<div class="cd-unit"><b>'+hrs+'</b><span>hours</span></div>'+
    '<div class="cd-unit"><b>'+mins+'</b><span>mins</span></div>'+
    '</div>';
}

/* ---------- VIEWS ---------- */
function showHome(){
  currentLevel=null;
  els.levelView.classList.add('hidden');
  els.homeView.classList.remove('hidden');
  renderHome();
  window.scrollTo({top:0,behavior:'instant'in window?'instant':'auto'});
}
function openLevel(index){
  if(!unlocked(index)&&!isAdmin())return;
  currentLevel=index;
  els.homeView.classList.add('hidden');
  els.levelView.classList.remove('hidden');
  renderLevel(index);
  window.scrollTo({top:0});
}

function renderHome(){
  els.who.textContent=session.test?'test mode':isAdmin()?'admin':session.username;
  renderCountdown();
  renderMap();
  els.adminPanel.classList.toggle('hidden',!isAdmin());
  els.leaderboard.classList.toggle('hidden',!isAdmin());
  renderAdminPanel();
  renderLeaderboard();
  renderReward();
  if(!isAdmin()){
    const done=STOPS.filter(s=>statusForStop(s.id)==='approved').length;
    els.mapProgress.textContent=done>=STOPS.length?'Every stop unlocked! 🏆':done+' of '+STOPS.length+' stops unlocked';
  }else{els.mapProgress.textContent='Admin view — approve photos below.';}
}

function renderMap(){
  els.map.innerHTML='';
  let nextIndex=-1;
  for(let i=0;i<STOPS.length;i++){
    if(unlocked(i)&&statusForStop(STOPS[i].id)!=='approved'&&statusForStop(STOPS[i].id)!=='admin'){nextIndex=i;break;}
  }
  STOPS.forEach((stop,index)=>{
    const status=statusForStop(stop.id);
    const isLocked=!unlocked(index);
    const node=document.createElement('div');
    node.className='level-node '+(index%2===0?'up':'down')+' '+status+(isLocked?' is-locked':'')+(index===nextIndex&&!isLocked?' is-next':'');
    const sub=isLocked?stop.day:status==='approved'?'Done!':status==='pending'?'Waiting…':'Play';
    node.innerHTML=
      '<div class="level-circle" role="button" tabindex="0">'+
        '<span class="level-num">'+(index+1)+'</span>'+
        '<span class="level-emoji">'+stop.emoji+'</span>'+
      '</div>'+
      '<div class="level-title"></div>'+
      '<div class="level-sub">'+sub+'</div>';
    node.querySelector('.level-title').textContent=stop.title;
    if(!isLocked){
      const circle=node.querySelector('.level-circle');
      const go=()=>openLevel(index);
      circle.addEventListener('click',go);
      circle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});
    }
    els.map.appendChild(node);
  });
}

/* ---------- LEVEL PAGE ---------- */
function renderLevel(index){
  const stop=STOPS[index];
  const status=statusForStop(index===null?'':stop.id);
  const locked=!unlocked(index);
  const labels={approved:['Approved! ⭐','You unlocked the next stop.'],pending:['Waiting for the boss','Your stop is in the approval queue.'],
    rejected:['Try again','Have another go and resubmit.'],ready:['Ready to play','Finish the tasks and submit!'],admin:['Admin view','Approve from the map screen.']};
  const [pillText,approvalCopy]=labels[status]||labels.ready;

  const root=document.createElement('div');
  root.className='level-card';
  root.innerHTML=
    '<div class="level-hero">'+
      '<div class="hero-emoji">'+stop.emoji+'</div>'+
      '<div><h1></h1><p class="hero-meta"></p><span class="level-pill">'+escapeHtml(pillText)+'</span></div>'+
    '</div>'+
    '<div class="level-pad">'+
      '<section class="task-block"><h3>Fun facts</h3><ul class="facts"></ul></section>'+
      '<section class="task-block proof"><h3>Photo <span class="points-label">optional</span></h3><p class="hint">Snap one photo of you at this stop (you can skip this).</p><input class="photo" type="file" accept="image/*"><img class="proof-preview hidden" alt="preview"><p class="proofStatus"></p></section>'+
      '<section class="task-block"><h3>Scavenger hunt <span class="points-label">tick all 5</span></h3><div class="hunt"></div></section>'+
      '<section class="task-block activity"><h3 class="act-title"></h3><p class="hint act-prompt"></p><div class="actSlot"></div></section>'+
      '<section class="task-block"><h3>Quiz <span class="points-label">get them right!</span></h3><div class="quiz"></div><button class="btn btn-secondary check" type="button">Check my answers</button><p class="quizResult"></p></section>'+
      '<div class="approval-box '+(locked?'':status)+'"><strong>'+escapeHtml(pillText)+'</strong><span>'+escapeHtml(locked?lockReason(index):approvalCopy)+'</span></div>'+
      '<div class="complete-row"><button class="btn btn-primary submit" type="button">Submit for approval</button><span class="completeStatus"></span></div>'+
    '</div>';
  root.querySelector('h1').textContent=stop.title;
  root.querySelector('.hero-meta').textContent=stop.day+' · '+stop.loc;
  root.querySelector('.facts').innerHTML=stop.facts.map(f=>'<li>'+escapeHtml(f)+'</li>').join('');
  root.querySelector('.act-title').textContent=stop.activity.title;
  root.querySelector('.act-prompt').textContent=stop.activity.prompt;

  els.levelBody.innerHTML='';
  els.levelBody.appendChild(root);

  renderProof(root,stop);
  renderHunt(root,stop);
  renderActivity(root,stop);
  renderQuiz(root,stop);

  const submit=root.querySelector('.submit');
  const cs=root.querySelector('.completeStatus');
  if(isAdmin()||session.test){submit.classList.toggle('hidden',isAdmin());}
  if(locked){submit.disabled=true;root.querySelectorAll('input,textarea,button,canvas').forEach(e=>{if(!e.classList.contains('submit'))e.disabled=true;});}
  if(status==='approved'){submit.disabled=true;submit.textContent='Approved ⭐';}
  if(status==='pending'){submit.disabled=true;submit.textContent='Waiting for approval…';}
  if(isAdmin()){root.querySelectorAll('input,textarea,button.check').forEach(e=>e.disabled=true);}
  submit.addEventListener('click',()=>submitStop(stop,index,cs));
}

function renderProof(root,stop){
  const input=root.querySelector('.photo');
  const prev=root.querySelector('.proof-preview');
  const st=root.querySelector('.proofStatus');
  const saved=progress.photos[stop.id];
  if(saved?.dataUrl){prev.src=saved.dataUrl;prev.classList.remove('hidden');st.textContent='Photo saved ✓';}
  input.addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    st.textContent='Saving…';
    try{const dataUrl=await imageToThumb(file);progress.photos[stop.id]={name:file.name,dataUrl};prev.src=dataUrl;prev.classList.remove('hidden');st.textContent='Photo saved ✓';saveProgress();}
    catch{st.textContent='Could not read that image.';}
  });
}

function renderHunt(root,stop){
  const wrap=root.querySelector('.hunt');
  const saved=progress.hunt[stop.id]||{};
  stop.hunt.forEach((item,i)=>{
    const label=document.createElement('label');
    if(saved[i])label.classList.add('done');
    const cb=document.createElement('input');cb.type='checkbox';cb.checked=Boolean(saved[i]);
    const span=document.createElement('span');span.textContent=item;
    cb.addEventListener('change',()=>{progress.hunt[stop.id]={...(progress.hunt[stop.id]||{}),[i]:cb.checked};label.classList.toggle('done',cb.checked);saveProgress();});
    label.append(cb,span);wrap.appendChild(label);
  });
}

function renderActivity(root,stop){
  const slot=root.querySelector('.actSlot');
  if(stop.activity.type==='quick'){
    const ta=document.createElement('textarea');ta.placeholder='Write your answer here…';ta.value=progress.quick[stop.id]||'';
    ta.addEventListener('input',()=>{progress.quick[stop.id]=ta.value;saveProgress();});
    slot.appendChild(ta);
  }else if(stop.activity.type==='sketch'){
    const w=document.createElement('div');w.className='sketch-wrap';
    w.innerHTML='<canvas class="sketch" width="900" height="520"></canvas><button class="btn btn-quiet" type="button">Clear</button>';
    slot.appendChild(w);setupSketch(w.querySelector('canvas'),w.querySelector('button'),stop.id);
  }else if(stop.activity.type==='dot'){
    const w=document.createElement('div');w.className='sketch-wrap';
    w.innerHTML='<canvas class="dot" width="900" height="520"></canvas><p class="proofStatus dotStatus"></p>';
    slot.appendChild(w);setupDot(w.querySelector('canvas'),w.querySelector('p'),stop.id);
  }
}

function renderQuiz(root,stop){
  const wrap=root.querySelector('.quiz');
  const res=root.querySelector('.quizResult');
  const saved=progress.quiz[stop.id]||{answers:{},checked:false,correct:false};
  stop.quiz.forEach((q,i)=>{
    const block=document.createElement('div');block.className='question';
    const p=document.createElement('p');p.textContent=(i+1)+'. '+q[0];
    const opts=document.createElement('div');opts.className='options';
    (q[2]||['true','false']).forEach(val=>{
      const l=document.createElement('label');const inp=document.createElement('input');const sp=document.createElement('span');
      inp.type='radio';inp.name=stop.id+'-'+i;inp.value=val;inp.checked=saved.answers[i]===val;
      sp.textContent=val==='true'?'True':val==='false'?'False':val;
      inp.addEventListener('change',()=>{const cur=progress.quiz[stop.id]||{answers:{}};cur.answers[i]=val;cur.checked=false;cur.correct=false;progress.quiz[stop.id]=cur;saveProgress();});
      l.append(inp,sp);opts.appendChild(l);
    });
    block.append(p,opts);wrap.appendChild(block);
  });
  if(saved.checked)res.textContent=saved.correct?'All correct! ✓':'Not quite — try again.';
  root.querySelector('.check').addEventListener('click',()=>checkQuiz(stop,res));
}

function checkQuiz(stop,res){
  const cur=progress.quiz[stop.id]||{answers:{}};
  if(stop.quiz.some((_,i)=>cur.answers[i]===undefined)){res.textContent='Answer every question first.';return false;}
  const correct=stop.quiz.every((q,i)=>cur.answers[i]===q[1]);
  progress.quiz[stop.id]={answers:cur.answers,checked:true,correct};saveProgress();
  res.textContent=correct?'All correct! ✓':'Not quite — try again.';
  return correct;
}

function validateStop(stop,index){
  if(!unlocked(index))return lockReason(index);
  if(session.test)return '';
  if(!stop.hunt.every((_,i)=>(progress.hunt[stop.id]||{})[i]))return 'Tick all 5 scavenger hunt items first.';
  if(stop.activity.type==='quick'&&!(progress.quick[stop.id]||'').trim())return 'Fill in the activity first.';
  if(stop.activity.type==='sketch'&&!progress.sketch[stop.id])return 'Do the sketch first.';
  if(stop.activity.type==='dot'&&!progress.dot[stop.id]?.complete)return 'Finish the dot-to-dot first.';
  if(!progress.quiz[stop.id]?.checked)return 'Check the quiz answers first.';
  if(!progress.quiz[stop.id]?.correct)return 'Get the quiz right first.';
  return '';
}

async function submitStop(stop,index,cs){
  if(session.test){progress.completed[stop.id]=true;progress.points[stop.id]=SCORE_PER_STOP;saveProgress();showHome();return;}
  const problem=validateStop(stop,index);
  if(problem){cs.textContent=problem;return;}
  const sub=buildSubmission(stop);
  upsertSubmission(sub);
  progress.submitted[stop.id]={id:sub.id,status:'pending'};saveProgress();
  cs.textContent='Sent to the boss for approval! 🎉';
  await postRemote({action:'submit',submission:sub});
  setTimeout(showHome,700);
}

function buildSubmission(stop){
  const photo=progress.photos[stop.id]||{};
  const act=stop.activity.type==='quick'?(progress.quick[stop.id]||'').trim():stop.activity.type+' completed';
  return {id:session.username+'-'+stop.id+'-'+Date.now(),username:session.username,stopId:stop.id,stopTitle:stop.title,day:stop.day,hotel:stop.hotel,
    score:SCORE_PER_STOP,bonus:0,status:'pending',submittedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
    proofName:photo.name||'',proofImage:photo.dataUrl||'',activity:act};
}
function upsertSubmission(sub){const i=shared.submissions.findIndex(x=>x.username===sub.username&&x.stopId===sub.stopId&&x.status==='pending');if(i>=0)shared.submissions[i]=sub;else shared.submissions.push(sub);saveShared();}

/* ---------- ADMIN + LEADERBOARD ---------- */
function renderAdminPanel(){
  if(!isAdmin())return;
  const pending=shared.submissions.filter(i=>i.status==='pending');
  els.adminRows.innerHTML='';
  pending.forEach(item=>{
    const stop=stopById(item.stopId);
    const row=document.createElement('article');row.className='admin-row';
    row.innerHTML='<div><div class="admin-title"></div><div class="admin-meta"></div></div><div class="admin-photo"></div>'+
      '<div class="admin-controls"><label>Bonus <input class="bonus" type="number" min="0" max="25" step="5" value="0"></label>'+
      '<button class="btn btn-primary approve" type="button">Approve</button>'+
      '<button class="btn btn-danger reject" type="button">Reject</button></div>';
    row.querySelector('.admin-title').textContent=item.username+' — '+(stop?.title||item.stopTitle);
    row.querySelector('.admin-meta').textContent=(item.activity?'Answer: '+item.activity:'No written answer')+(item.proofImage?'':' · (no photo)');
    if(item.proofImage){const img=document.createElement('img');img.src=item.proofImage;img.alt='proof';row.querySelector('.admin-photo').appendChild(img);}
    row.querySelector('.approve').addEventListener('click',()=>approveSubmission(item.id,row.querySelector('.bonus').value));
    row.querySelector('.reject').addEventListener('click',()=>rejectSubmission(item.id));
    els.adminRows.appendChild(row);
  });
  els.adminEmpty.classList.toggle('hidden',pending.length>0);
}
function renderLeaderboard(){
  const rows=buildLeaderboard();els.leaderboardRows.innerHTML='';
  rows.forEach((r,i)=>{const tr=document.createElement('tr');tr.innerHTML='<td></td><td></td><td></td><td></td>';
    tr.children[0].textContent=i+1;tr.children[1].textContent=r.username;tr.children[2].textContent=r.points;tr.children[3].textContent=r.stops;
    els.leaderboardRows.appendChild(tr);});
  els.leaderboardEmpty.classList.toggle('hidden',rows.some(r=>r.points>0));
}
function buildLeaderboard(){
  const m=new Map();PLAYER_NAMES.forEach(n=>m.set(n,{username:n,points:0,stops:0}));
  shared.submissions.forEach(i=>{if(i.status!=='approved')return;const r=m.get(i.username)||{username:i.username,points:0,stops:0};r.points+=scoreWithBonus(i);r.stops+=1;m.set(i.username,r);});
  return [...m.values()].sort((a,b)=>b.points-a.points||a.username.localeCompare(b.username));
}
async function approveSubmission(id,bonus){
  const b=Math.max(0,Math.min(25,Number(bonus)||0));
  update(id,{status:'approved',bonus:b,approvedAt:new Date().toISOString(),approvedBy:session.username,updatedAt:new Date().toISOString()});
  renderHome();await postRemote({action:'approve',id,bonus:b,approvedBy:session.username,adminKey:session.adminKey});
}
async function rejectSubmission(id){
  update(id,{status:'rejected',approvedBy:session.username,updatedAt:new Date().toISOString()});
  renderHome();await postRemote({action:'reject',id,approvedBy:session.username,adminKey:session.adminKey});
}
function update(id,u){const i=shared.submissions.findIndex(x=>x.id===id);if(i<0)return;shared.submissions[i]={...shared.submissions[i],...u};saveShared();}

function renderReward(){
  const done=!isAdmin()&&STOPS.every(s=>statusForStop(s.id)==='approved');
  els.amazonBtn.disabled=!done;
  els.rewardText.textContent=done?'You finished the whole road trip! Open the vault! 🏆':'Finish every stop to unlock the final prize!';
}

/* ---------- SYNC (Apps Script) ---------- */
async function syncShared(){
  if(!CONFIG.sheetEndpoint){loadShared();applySharedToProgress();renderHome();return;}
  try{
    const url=new URL(CONFIG.sheetEndpoint);url.searchParams.set('action','state');url.searchParams.set('t',Date.now());
    const r=await fetch(url.toString());const data=await r.json();shared=normaliseShared(data);saveShared();
  }catch{loadShared();}
  applySharedToProgress();renderHome();
}
async function postRemote(payload){
  if(!CONFIG.sheetEndpoint)return null;
  try{const r=await fetch(CONFIG.sheetEndpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
    const data=await r.json();if(data?.submissions){shared=normaliseShared(data);saveShared();renderHome();}return data;}catch{return null;}
}
function normaliseShared(data){
  const c=freshShared();c.updatedAt=data?.updatedAt||null;
  c.submissions=Array.isArray(data?.submissions)?data.submissions.map(i=>({
    id:String(i.id||i.ID||''),username:String(i.username||i.Username||''),stopId:String(i.stopId||i.StopID||''),
    stopTitle:String(i.stopTitle||i.StopTitle||''),day:String(i.day||i.Day||''),hotel:String(i.hotel||i.Hotel||''),
    score:Number(i.score||i.Score||SCORE_PER_STOP),bonus:Number(i.bonus||i.Bonus||0),status:String(i.status||i.Status||'pending').toLowerCase(),
    submittedAt:String(i.submittedAt||i.SubmittedAt||''),updatedAt:String(i.updatedAt||i.UpdatedAt||''),approvedAt:String(i.approvedAt||i.ApprovedAt||''),
    approvedBy:String(i.approvedBy||i.ApprovedBy||''),proofName:String(i.proofName||i.ProofName||''),proofImage:String(i.proofImage||i.ProofImage||''),activity:String(i.activity||i.Activity||'')
  })).filter(i=>i.id&&i.username&&i.stopId):[];
  return c;
}
function exportCsv(){
  const rows=[['ID','Username','Stop','Status','Score','Bonus','Activity']];
  shared.submissions.forEach(i=>rows.push([i.id,i.username,i.stopTitle,i.status,i.score,i.bonus,i.activity]));
  const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const b=new Blob([csv],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='route66-scores.csv';a.click();URL.revokeObjectURL(a.href);
}

/* ---------- canvases ---------- */
function setupSketch(canvas,clear,id){
  const ctx=canvas.getContext('2d');let drawing=false;
  function bg(){ctx.fillStyle='#fffaf0';ctx.fillRect(0,0,900,520);ctx.strokeStyle='rgba(58,36,23,.12)';ctx.lineWidth=2;for(let x=40;x<900;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,520);ctx.stroke();}for(let y=40;y<520;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(900,y);ctx.stroke();}}
  function load(){if(progress.sketch[id]){const im=new Image();im.onload=()=>ctx.drawImage(im,0,0);im.src=progress.sketch[id];}else bg();}
  function pos(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*900/r.width,y:(e.clientY-r.top)*520/r.height};}
  canvas.addEventListener('pointerdown',e=>{e.preventDefault();drawing=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);});
  canvas.addEventListener('pointermove',e=>{if(!drawing)return;e.preventDefault();const p=pos(e);ctx.lineWidth=7;ctx.lineCap='round';ctx.strokeStyle='#a8331a';ctx.lineTo(p.x,p.y);ctx.stroke();progress.sketch[id]=canvas.toDataURL('image/png');saveProgress();});
  window.addEventListener('pointerup',()=>{drawing=false;});
  clear.addEventListener('click',()=>{delete progress.sketch[id];saveProgress();bg();});
  load();
}
function setupDot(canvas,status,id){
  const ctx=canvas.getContext('2d');
  const pts=[[180,330],[250,240],[340,205],[430,238],[520,180],[610,245],[720,270],[625,310],[540,300],[470,375],[400,300],[310,310]];
  let cur=progress.dot[id]?.current||0,done=Boolean(progress.dot[id]?.complete);
  function draw(){ctx.clearRect(0,0,900,520);ctx.fillStyle='#fffaf0';ctx.fillRect(0,0,900,520);
    ctx.lineWidth=5;ctx.strokeStyle='#e8651f';ctx.beginPath();for(let i=0;i<cur;i++){const [x,y]=pts[i];i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}if(done)ctx.closePath();ctx.stroke();
    pts.forEach(([x,y],i)=>{ctx.beginPath();ctx.fillStyle=i<cur?'#5f8a4a':'#3a2417';ctx.arc(x,y,17,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='bold 18px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),x,y+1);});
    status.textContent=done?'Dot-to-dot done! ✓':'Tap dot number '+(cur+1);}
  canvas.addEventListener('click',e=>{if(done)return;const r=canvas.getBoundingClientRect();const x=(e.clientX-r.left)*900/r.width,y=(e.clientY-r.top)*520/r.height;const [px,py]=pts[cur];if(Math.hypot(x-px,y-py)<40){cur++;done=cur>=pts.length;progress.dot[id]={current:cur,complete:done};saveProgress();draw();}else{status.textContent='Not that one — find number '+(cur+1);}});
  draw();
}
function imageToThumb(file){return new Promise((res,rej)=>{const rd=new FileReader();rd.onload=()=>{const im=new Image();im.onload=()=>{const max=520,sc=Math.min(1,max/Math.max(im.width,im.height));const c=document.createElement('canvas');c.width=Math.round(im.width*sc);c.height=Math.round(im.height*sc);c.getContext('2d').drawImage(im,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',0.68));};im.onerror=rej;im.src=rd.result;};rd.onerror=rej;rd.readAsDataURL(file);});}

/* ---------- auth / boot ---------- */
async function doLogin(name,password){
  if(name.trim().toLowerCase()==='test'){session={username:'test',role:'player',test:true};sessionStorage.setItem(STORAGE.session,JSON.stringify(session));await openSite();return true;}
  const acc=normalName(name);if(!acc)return false;
  const account=ACCOUNTS[acc];const h=await sha256(password);if(h!==account.hash)return false;
  session={username:acc,role:account.role,test:false};if(account.role==='admin')session.adminKey=password;
  sessionStorage.setItem(STORAGE.session,JSON.stringify(session));await openSite();return true;
}
async function openSite(){
  loadProgress();loadShared();
  els.login.classList.add('hidden');els.site.classList.remove('hidden');
  showHome();
  if(countdownTimer)clearInterval(countdownTimer);
  countdownTimer=setInterval(renderCountdown,30000);
  await syncShared();
}
function bindEvents(){
  els.loginForm.addEventListener('submit',async e=>{e.preventDefault();els.loginError.textContent='';const ok=await doLogin(els.username.value,els.password.value);if(!ok)els.loginError.textContent='Wrong name or password.';});
  els.logoutBtn.addEventListener('click',()=>{sessionStorage.removeItem(STORAGE.session);session=null;els.site.classList.add('hidden');els.login.classList.remove('hidden');});
  els.backBtn.addEventListener('click',showHome);
  els.syncBtn.addEventListener('click',syncShared);
  els.adminRefreshBtn.addEventListener('click',syncShared);
  els.exportCsvBtn.addEventListener('click',exportCsv);
  els.amazonBtn.addEventListener('click',()=>{if(!els.amazonBtn.disabled)els.voucher.classList.remove('hidden');});
}
bindEvents();
const pp=new URLSearchParams(location.search);
if(pp.get('preview')==='test'){session={username:'test',role:'player',test:true};sessionStorage.setItem(STORAGE.session,JSON.stringify(session));openSite();}
else{try{const s=JSON.parse(sessionStorage.getItem(STORAGE.session)||'null');if(s?.username){session=s;openSite();}}catch{}}
