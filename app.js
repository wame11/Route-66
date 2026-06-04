const ACCOUNTS={
  Jacob:{role:"player",hash:"03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4"},
  Lily:{role:"player",hash:"fe2592b42a727e977f055947385b709cc82b16b9a87f88c6abf3900d65d0cdc3"},
  Hannah:{role:"player",hash:"9975baa75e1603273cbd3d94746a0442e22d5dc0268750dd45229f343f53fe19"},
  Ethan:{role:"player",hash:"08f61ac43fc9a9d5bd3d41f6dc2976ad27d8d5d8422e2ac87c12b98364a331fe"},
  admin:{role:"admin",hash:"7f3d56bb44da1a1f5239ac9db712488db90f135d999290ed9104eba8691096e2"}
};

const CONFIG={
  sheetEndpoint:"",
  sheetUrl:""
};

const SCORE_PER_STOP=100;
const PLAYER_NAMES=Object.keys(ACCOUNTS).filter(name=>ACCOUNTS[name].role==="player");
const STORAGE={
  session:"route66-session-v3",
  shared:"route66-shared-v3",
  progressPrefix:"route66-progress-v3-",
  legacyPrefix:"route66-progress-v2-"
};

let session=null;
let progress=freshProgress();
let shared=freshShared();
let observer=null;

const $=selector=>document.querySelector(selector);
const els={
  login:$("#login"),
  site:$("#site"),
  loginForm:$("#loginForm"),
  username:$("#username"),
  password:$("#password"),
  loginError:$("#loginError"),
  who:$("#who"),
  syncStatus:$("#syncStatus"),
  sheetStatus:$("#sheetStatus"),
  sheetLink:$("#sheetLink"),
  doneCount:$("#doneCount"),
  doneLabel:$("#doneLabel"),
  pointsCount:$("#pointsCount"),
  pendingCount:$("#pendingCount"),
  routeMap:$("#routeMap"),
  leaderPanel:$("#leaderPanel"),
  leaderboardRows:$("#leaderboardRows"),
  leaderboardEmpty:$("#leaderboardEmpty"),
  adminRows:$("#adminRows"),
  adminEmpty:$("#adminEmpty"),
  levels:$("#levels"),
  levelTemplate:$("#levelTemplate"),
  reward:$("#reward"),
  rewardText:$("#rewardText"),
  amazonBtn:$("#amazonBtn"),
  voucher:$("#voucher"),
  syncBtn:$("#syncBtn"),
  printBtn:$("#printBtn"),
  resetBtn:$("#resetBtn"),
  logoutBtn:$("#logoutBtn"),
  exportCsvBtn:$("#exportCsvBtn"),
  adminRefreshBtn:$("#adminRefreshBtn")
};

function freshProgress(){
  return {hunts:{},activity:{},quiz:{},submitted:{},completed:{},points:{}};
}

function freshShared(){
  return {submissions:[],updatedAt:null};
}

function readJson(key,fallback=null){
  try{
    const value=localStorage.getItem(key);
    return value?JSON.parse(value):fallback;
  }catch{
    return fallback;
  }
}

function writeJson(key,value){
  localStorage.setItem(key,JSON.stringify(value));
}

function progressKey(username=session?.username||"guest"){
  return STORAGE.progressPrefix+username;
}

function mergeProgress(saved){
  const merged=freshProgress();
  if(!saved||typeof saved!=="object")return merged;
  Object.keys(merged).forEach(key=>{
    if(saved[key]&&typeof saved[key]==="object")merged[key]=saved[key];
  });
  if(saved.quick&&!saved.activity)merged.activity=saved.quick;
  if(saved.completed){
    merged.completed={...saved.completed};
    Object.keys(saved.completed).forEach(stopId=>{
      if(saved.completed[stopId]&&!merged.points[stopId])merged.points[stopId]=SCORE_PER_STOP;
    });
  }
  return merged;
}

function loadProgress(){
  const username=session?.username||"guest";
  const saved=readJson(progressKey(username),null)??readJson(STORAGE.legacyPrefix+username,null);
  progress=mergeProgress(saved);
}

function saveProgress(){
  if(session?.role!=="admin")writeJson(progressKey(),progress);
}

function loadShared(){
  shared=normaliseShared(readJson(STORAGE.shared,freshShared()));
}

function saveShared(){
  shared.updatedAt=new Date().toISOString();
  writeJson(STORAGE.shared,shared);
}

async function sha256(text){
  const bytes=new TextEncoder().encode(text);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

function normalName(name){
  const clean=name.trim().toLowerCase();
  return Object.keys(ACCOUNTS).find(account=>account.toLowerCase()===clean);
}

function isAdmin(){
  return session?.role==="admin";
}

function stopById(stopId){
  return STOPS.find(stop=>stop.id===stopId);
}

function timestamp(value){
  const time=Date.parse(value||"");
  return Number.isFinite(time)?time:0;
}

function latestSubmission(username,stopId){
  return shared.submissions
    .filter(item=>item.username===username&&item.stopId===stopId)
    .sort((a,b)=>timestamp(b.updatedAt||b.submittedAt)-timestamp(a.updatedAt||a.submittedAt))[0]||null;
}

function statusForStop(stopId){
  if(isAdmin())return "admin";
  if(session?.test&&progress.completed[stopId])return "approved";
  const latest=latestSubmission(session?.username,stopId);
  if(latest?.status==="approved"||progress.completed[stopId])return "approved";
  if(latest?.status==="pending"||progress.submitted[stopId]?.status==="pending")return "pending";
  if(latest?.status==="rejected"||progress.submitted[stopId]?.status==="rejected")return "rejected";
  return "ready";
}

function unlocked(index){
  if(session?.test||isAdmin())return true;
  if(index===0)return true;
  return statusForStop(STOPS[index-1].id)==="approved";
}

function lockReason(index){
  if(index===0)return "";
  const previous=STOPS[index-1];
  const status=statusForStop(previous.id);
  if(status==="pending")return previous.title+" is waiting for leader approval.";
  if(status==="rejected")return previous.title+" needs another try.";
  return "Clear "+previous.title+" first.";
}

function currentLevelIndex(){
  const ready=STOPS.findIndex((stop,index)=>unlocked(index)&&statusForStop(stop.id)!=="approved");
  return ready>=0?ready:STOPS.length-1;
}

function applySharedToProgress(){
  if(!session||session.test||isAdmin())return;
  STOPS.forEach(stop=>{
    const latest=latestSubmission(session.username,stop.id);
    if(!latest)return;
    progress.submitted[stop.id]={
      id:latest.id,
      status:latest.status,
      score:scoreWithBonus(latest),
      submittedAt:latest.submittedAt,
      updatedAt:latest.updatedAt
    };
    if(latest.status==="approved"){
      progress.completed[stop.id]=true;
      progress.points[stop.id]=scoreWithBonus(latest);
    }
    if(latest.status==="rejected"){
      delete progress.completed[stop.id];
      delete progress.points[stop.id];
    }
  });
  saveProgress();
}

function renderApp(){
  if(!session)return;
  applySharedToProgress();
  document.body.dataset.role=session.role;
  els.who.textContent=session.test?"test mode":isAdmin()?"leader: admin":"player: "+session.username;
  els.leaderPanel.classList.toggle("hidden",!isAdmin());
  renderStats();
  renderSheetStatus();
  renderRouteMap();
  renderLeaderPanel();
  renderLevels();
  renderReward();
  revealOnScroll();
}

function renderStats(){
  if(isAdmin()){
    const pending=shared.submissions.filter(item=>item.status==="pending").length;
    const approved=approvedSubmissionMap().size;
    els.doneCount.textContent=approved;
    els.doneLabel.textContent="approved";
    els.pointsCount.textContent=buildLeaderboard().reduce((total,row)=>total+row.points,0);
    els.pendingCount.textContent=pending;
    return;
  }
  const approvedStops=STOPS.filter(stop=>statusForStop(stop.id)==="approved").length;
  const pendingStops=STOPS.filter(stop=>statusForStop(stop.id)==="pending").length;
  els.doneCount.textContent=approvedStops;
  els.doneLabel.textContent="levels cleared";
  els.pointsCount.textContent=playerPoints(session.username);
  els.pendingCount.textContent=pendingStops;
}

function renderSheetStatus(){
  const connected=Boolean(CONFIG.sheetEndpoint);
  const label=connected?"Shared score store connected.":"Local save mode.";
  els.syncStatus.textContent=label;
  if(els.sheetStatus)els.sheetStatus.textContent=label;
  if(els.sheetLink){
    els.sheetLink.classList.toggle("hidden",!CONFIG.sheetUrl);
    els.sheetLink.href=CONFIG.sheetUrl||"#";
  }
}

function renderRouteMap(){
  const current=currentLevelIndex();
  els.routeMap.innerHTML="";
  STOPS.forEach((stop,index)=>{
    const locked=!unlocked(index);
    const rawStatus=statusForStop(stop.id);
    const state=locked?"locked":rawStatus;
    const link=document.createElement("a");
    link.className="map-node "+state+(index===current&&!locked?" current unlocked":"");
    link.href=locked?"#home":"#"+stop.id;
    if(locked){
      link.addEventListener("click",event=>event.preventDefault());
      link.setAttribute("aria-disabled","true");
    }
    link.innerHTML=[
      '<span class="map-card">',
      '<span class="map-state"></span>',
      '<strong></strong>',
      '<span class="map-meta"></span>',
      '</span>',
      '<span class="map-pin"><strong></strong><span class="lock-mark" aria-hidden="true"></span></span>'
    ].join("");
    link.querySelector(".map-state").textContent=mapLabel(state);
    link.querySelector(".map-card strong").textContent=stop.title;
    link.querySelector(".map-meta").textContent=stop.day+" / "+stop.loc;
    link.querySelector(".map-pin strong").textContent=String(index+1);
    els.routeMap.appendChild(link);
  });
}

function mapLabel(state){
  return {
    admin:"open",
    approved:"cleared",
    pending:"pending",
    rejected:"retry",
    ready:"unlocked",
    locked:"locked"
  }[state]||"open";
}

function renderLeaderPanel(){
  if(!isAdmin())return;
  renderLeaderboard();
  renderAdminPanel();
}

function renderLeaderboard(){
  const rows=buildLeaderboard();
  els.leaderboardRows.innerHTML="";
  rows.forEach((row,index)=>{
    const tr=document.createElement("tr");
    tr.innerHTML="<td></td><td></td><td></td><td></td><td></td>";
    tr.children[0].textContent=String(index+1);
    tr.children[1].textContent=row.username;
    tr.children[2].textContent=String(row.points);
    tr.children[3].textContent=String(row.stops);
    tr.children[4].textContent=row.lastApproved?formatDate(row.lastApproved):"-";
    els.leaderboardRows.appendChild(tr);
  });
  els.leaderboardEmpty.classList.toggle("hidden",rows.some(row=>row.points>0));
}

function approvedSubmissionMap(){
  const approved=new Map();
  shared.submissions.forEach(item=>{
    if(item.status!=="approved")return;
    const key=item.username+"::"+item.stopId;
    const existing=approved.get(key);
    if(!existing||timestamp(item.approvedAt||item.updatedAt)>timestamp(existing.approvedAt||existing.updatedAt)){
      approved.set(key,item);
    }
  });
  return approved;
}

function buildLeaderboard(){
  const scores=new Map();
  PLAYER_NAMES.forEach(name=>scores.set(name,{username:name,points:0,stops:0,lastApproved:""}));
  approvedSubmissionMap().forEach(item=>{
    const row=scores.get(item.username)||{username:item.username,points:0,stops:0,lastApproved:""};
    row.points+=scoreWithBonus(item);
    row.stops+=1;
    if(timestamp(item.approvedAt||item.updatedAt)>timestamp(row.lastApproved))row.lastApproved=item.approvedAt||item.updatedAt;
    scores.set(item.username,row);
  });
  return [...scores.values()].sort((a,b)=>b.points-a.points||b.stops-a.stops||a.username.localeCompare(b.username));
}

function playerPoints(username){
  const sharedTotal=[...approvedSubmissionMap().values()]
    .filter(item=>item.username===username)
    .reduce((total,item)=>total+scoreWithBonus(item),0);
  const localTotal=Object.values(progress.points).reduce((total,value)=>total+Number(value||0),0);
  return sharedTotal||localTotal;
}

function renderAdminPanel(){
  const pending=shared.submissions.filter(item=>item.status==="pending");
  els.adminRows.innerHTML="";
  pending.forEach(item=>{
    const stop=stopById(item.stopId);
    const row=document.createElement("article");
    row.className="admin-row";
    row.innerHTML=[
      '<div class="admin-main">',
      '<strong class="admin-title"></strong>',
      '<span class="admin-meta"></span>',
      '<div class="admin-proofs"></div>',
      '</div>',
      '<div class="admin-controls">',
      '<label>Bonus <input class="bonus-input" type="number" min="0" max="25" step="5" value="0"></label>',
      '<button class="btn btn-primary approve-btn" type="button">Approve</button>',
      '<button class="btn btn-secondary reject-btn" type="button">Reject</button>',
      '</div>'
    ].join("");
    row.querySelector(".admin-title").textContent=item.username+" - "+(stop?.title||item.stopTitle||item.stopId);
    row.querySelector(".admin-meta").textContent="Submitted "+formatDate(item.submittedAt)+" / "+SCORE_PER_STOP+" base points";
    const proofs=row.querySelector(".admin-proofs");
    if(item.evidence.length){
      item.evidence.forEach((proof,index)=>{
        const proofNode=document.createElement("div");
        proofNode.className="admin-proof";
        proofNode.innerHTML='<img alt=""><span></span>';
        proofNode.querySelector("img").src=proof.image||"";
        proofNode.querySelector("img").alt=item.username+" evidence "+(index+1);
        proofNode.querySelector("span").textContent="Clue "+(index+1);
        proofs.appendChild(proofNode);
      });
    }else{
      const empty=document.createElement("p");
      empty.className="empty";
      empty.textContent="No photo evidence recorded.";
      proofs.appendChild(empty);
    }
    row.querySelector(".approve-btn").addEventListener("click",()=>approveSubmission(item.id,row.querySelector(".bonus-input").value));
    row.querySelector(".reject-btn").addEventListener("click",()=>rejectSubmission(item.id));
    els.adminRows.appendChild(row);
  });
  els.adminEmpty.classList.toggle("hidden",pending.length>0);
}

function renderLevels(){
  els.levels.innerHTML="";
  STOPS.forEach((stop,index)=>els.levels.appendChild(levelCard(stop,index)));
}

function levelCard(stop,index){
  const node=els.levelTemplate.content.cloneNode(true);
  const article=node.querySelector(".level-panel");
  const locked=!unlocked(index);
  const status=statusForStop(stop.id);
  article.id=stop.id;
  article.classList.add(locked?"locked":status);
  const art=node.querySelector(".level-art");
  art.classList.add("scene-"+stop.scene);
  node.querySelector(".level-number").textContent="Level "+(index+1)+" of "+STOPS.length;
  node.querySelector(".art-title").textContent=stop.title;
  node.querySelector(".art-subtitle").textContent=stop.loc;
  node.querySelector(".kicker").textContent=stop.day+" / "+stop.hotel;
  node.querySelector(".mission-body h2").textContent=stop.title;
  node.querySelector(".brief").textContent=stop.brief;
  node.querySelector(".chips").innerHTML="<span>"+escapeHtml(stop.hotel)+"</span><span>"+escapeHtml(stop.loc)+"</span>";
  node.querySelector(".intel").innerHTML=stop.intel.map(item=>"<li>"+escapeHtml(item)+"</li>").join("");
  renderStatus(node,stop,index,status,locked);
  renderHunt(node,stop);
  renderActivity(node,stop);
  renderQuiz(node,stop);
  const submit=node.querySelector(".submit-stop");
  submit.addEventListener("click",()=>submitStop(stop,index));
  if(isAdmin()){
    submit.classList.add("hidden");
    disableLevelInputs(node);
  }
  return node;
}

function renderStatus(node,stop,index,status,locked){
  const pill=node.querySelector(".status-pill");
  const approval=node.querySelector(".approval-box");
  const title=node.querySelector(".approval-title");
  const copy=node.querySelector(".approval-copy");
  const button=node.querySelector(".submit-stop");
  const complete=node.querySelector(".completeStatus");
  const reason=node.querySelector(".lock-reason");
  const labels={
    approved:["Cleared","The next level is open."],
    pending:["Pending","The leader has this in the approval queue."],
    rejected:["Retry","Update your evidence and submit again."],
    ready:["Unlocked","Finish the mission, then submit it to the leader."],
    admin:["Leader view","Review pending levels in the leader panel."]
  };
  const [label,description]=labels[status]||labels.ready;
  pill.textContent=locked?"Locked":label;
  pill.className="status-pill "+(locked?"locked":status);
  title.textContent=locked?"Locked":label;
  copy.textContent=locked?lockReason(index):description;
  reason.textContent=lockReason(index);
  approval.className="approval-box "+(locked?"locked":status);
  complete.textContent=status==="approved"?"Approved for "+SCORE_PER_STOP+" points.":status==="pending"?"Waiting for approval.":status==="rejected"?"Rejected. Try again.":"";
  button.disabled=locked||status==="approved"||status==="pending";
  button.textContent=session?.test?"Clear level in test mode":status==="rejected"?"Resubmit level":"Submit level";
}

function renderHunt(node,stop){
  const root=node.querySelector(".hunt-list");
  const saved=progress.hunts[stop.id]||{};
  stop.hunt.forEach((clue,index)=>{
    const item=document.createElement("div");
    item.className="hunt-item";
    item.innerHTML=[
      '<label class="hunt-check">',
      '<input class="hunt-done" type="checkbox">',
      '<span></span>',
      '</label>',
      '<div class="hunt-evidence">',
      '<input class="hunt-photo" type="file" accept="image/*" capture="environment">',
      '<img class="evidence-preview hidden" alt="">',
      '<p class="evidence-status"></p>',
      '</div>'
    ].join("");
    const current=saved[index]||{};
    const checkbox=item.querySelector(".hunt-done");
    const photo=item.querySelector(".hunt-photo");
    const preview=item.querySelector(".evidence-preview");
    const status=item.querySelector(".evidence-status");
    checkbox.checked=Boolean(current.done);
    item.querySelector(".hunt-check span").textContent=clue;
    if(current.photo?.dataUrl){
      preview.src=current.photo.dataUrl;
      preview.alt="Evidence for "+clue;
      preview.classList.remove("hidden");
      status.textContent="Photo saved: "+current.photo.name;
    }else{
      status.textContent="Photo needed.";
    }
    checkbox.addEventListener("change",()=>{
      const next={...(progress.hunts[stop.id]||{})};
      next[index]={...(next[index]||{}),done:checkbox.checked};
      progress.hunts[stop.id]=next;
      saveProgress();
    });
    photo.addEventListener("change",async event=>{
      const file=event.target.files[0];
      if(!file)return;
      status.textContent="Saving photo...";
      try{
        const dataUrl=await imageToThumb(file);
        const next={...(progress.hunts[stop.id]||{})};
        next[index]={
          ...(next[index]||{}),
          done:true,
          photo:{name:file.name,type:file.type,size:file.size,time:new Date().toISOString(),dataUrl}
        };
        progress.hunts[stop.id]=next;
        checkbox.checked=true;
        preview.src=dataUrl;
        preview.alt="Evidence for "+clue;
        preview.classList.remove("hidden");
        status.textContent="Photo saved: "+file.name;
        saveProgress();
      }catch{
        status.textContent="That photo could not be saved.";
      }
    });
    root.appendChild(item);
  });
}

function renderActivity(node,stop){
  node.querySelector(".activity-section h3").textContent=stop.activity.title;
  node.querySelector(".activity-section p").textContent=stop.activity.prompt;
  const textarea=node.querySelector(".activity-answer");
  textarea.value=progress.activity[stop.id]||"";
  textarea.addEventListener("input",()=>{
    progress.activity[stop.id]=textarea.value;
    saveProgress();
  });
}

function renderQuiz(node,stop){
  const root=node.querySelector(".quiz");
  const result=node.querySelector(".quizResult");
  const saved=progress.quiz[stop.id]||{answer:"",checked:false,correct:false};
  const block=document.createElement("div");
  block.className="question";
  const prompt=document.createElement("p");
  prompt.textContent=stop.quiz.question;
  const options=document.createElement("div");
  options.className="options";
  stop.quiz.options.forEach(option=>{
    const label=document.createElement("label");
    const input=document.createElement("input");
    const span=document.createElement("span");
    input.type="radio";
    input.name=stop.id+"-quiz";
    input.value=option;
    input.checked=saved.answer===option;
    span.textContent=option;
    input.addEventListener("change",()=>{
      progress.quiz[stop.id]={answer:option,checked:false,correct:false};
      result.textContent="";
      saveProgress();
    });
    label.append(input,span);
    options.appendChild(label);
  });
  block.append(prompt,options);
  root.appendChild(block);
  if(saved.checked)result.textContent=saved.correct?"Correct.":"Try again.";
  node.querySelector(".check").addEventListener("click",()=>checkQuiz(stop,result));
}

function checkQuiz(stop,result){
  const current=progress.quiz[stop.id]||{answer:""};
  if(!current.answer){
    result.textContent="Choose an answer first.";
    return false;
  }
  const correct=current.answer===stop.quiz.answer;
  progress.quiz[stop.id]={answer:current.answer,checked:true,correct};
  saveProgress();
  result.textContent=correct?"Correct.":"Try again.";
  return correct;
}

function validateStop(stop,index){
  if(!unlocked(index))return lockReason(index);
  const hunt=progress.hunts[stop.id]||{};
  if(!session.test){
    for(let huntIndex=0;huntIndex<stop.hunt.length;huntIndex++){
      if(!hunt[huntIndex]?.done)return "Tick every scavenger clue.";
      if(!hunt[huntIndex]?.photo?.dataUrl)return "Add a photo for every scavenger clue.";
    }
  }
  if(!(progress.activity[stop.id]||"").trim())return "Fill in the mission note.";
  if(!progress.quiz[stop.id]?.checked)return "Check the boss question.";
  if(!progress.quiz[stop.id]?.correct)return "Beat the boss question first.";
  return "";
}

async function submitStop(stop,index){
  const article=document.getElementById(stop.id);
  const result=article.querySelector(".quizResult");
  const status=article.querySelector(".completeStatus");
  if(!progress.quiz[stop.id]?.checked)checkQuiz(stop,result);
  const problem=validateStop(stop,index);
  if(problem){
    status.textContent=problem;
    return;
  }
  if(session.test){
    progress.completed[stop.id]=true;
    progress.points[stop.id]=SCORE_PER_STOP;
    saveProgress();
    renderApp();
    scrollToHome();
    return;
  }
  const submission=buildSubmission(stop);
  upsertSubmission(submission);
  progress.submitted[stop.id]={id:submission.id,status:"pending",score:SCORE_PER_STOP,submittedAt:submission.submittedAt};
  saveProgress();
  renderApp();
  scrollToHome();
  await postRemote({action:"submit",submission});
}

function buildSubmission(stop){
  const hunt=progress.hunts[stop.id]||{};
  const evidence=stop.hunt.map((clue,index)=>{
    const item=hunt[index]||{};
    return {
      clue,
      name:item.photo?.name||"",
      image:item.photo?.dataUrl||"",
      done:Boolean(item.done)
    };
  });
  return {
    id:session.username+"-"+stop.id+"-"+Date.now(),
    username:session.username,
    stopId:stop.id,
    stopTitle:stop.title,
    day:stop.day,
    hotel:stop.hotel,
    score:SCORE_PER_STOP,
    bonus:0,
    status:"pending",
    submittedAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    proofName:evidence.map(item=>item.name).filter(Boolean).join("; "),
    proofImage:evidence.find(item=>item.image)?.image||"",
    evidence,
    activity:(progress.activity[stop.id]||"").trim()
  };
}

function upsertSubmission(submission){
  const existing=shared.submissions.findIndex(item=>item.username===submission.username&&item.stopId===submission.stopId&&item.status!=="approved");
  if(existing>=0)shared.submissions[existing]=submission;
  else shared.submissions.push(submission);
  saveShared();
}

async function approveSubmission(id,bonusValue){
  const bonus=Math.max(0,Math.min(25,Number(bonusValue)||0));
  updateSubmission(id,{status:"approved",bonus,approvedAt:new Date().toISOString(),approvedBy:session.username,updatedAt:new Date().toISOString()});
  renderApp();
  await postRemote({action:"approve",id,bonus,approvedBy:session.username,adminKey:session.adminKey});
}

async function rejectSubmission(id){
  updateSubmission(id,{status:"rejected",rejectedAt:new Date().toISOString(),approvedBy:session.username,updatedAt:new Date().toISOString()});
  renderApp();
  await postRemote({action:"reject",id,approvedBy:session.username,adminKey:session.adminKey});
}

function updateSubmission(id,updates){
  const index=shared.submissions.findIndex(item=>item.id===id);
  if(index<0)return;
  shared.submissions[index]={...shared.submissions[index],...updates};
  saveShared();
}

async function syncShared(){
  if(!CONFIG.sheetEndpoint){
    loadShared();
    applySharedToProgress();
    renderApp();
    return;
  }
  els.syncStatus.textContent="Syncing...";
  try{
    const url=new URL(CONFIG.sheetEndpoint);
    url.searchParams.set("action","state");
    url.searchParams.set("t",Date.now().toString());
    const response=await fetch(url.toString());
    const data=await response.json();
    shared=normaliseShared(data);
    saveShared();
    els.syncStatus.textContent="Synced.";
  }catch{
    els.syncStatus.textContent="Sync failed. Local data is still saved.";
    loadShared();
  }
  applySharedToProgress();
  renderApp();
}

async function postRemote(payload){
  if(!CONFIG.sheetEndpoint)return null;
  try{
    const response=await fetch(CONFIG.sheetEndpoint,{
      method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify(payload)
    });
    const data=await response.json();
    if(data?.submissions){
      shared=normaliseShared(data);
      saveShared();
      renderApp();
    }
    return data;
  }catch{
    els.syncStatus.textContent="Saved locally. Shared store is not reachable.";
    return null;
  }
}

function normaliseShared(data){
  const clean=freshShared();
  clean.updatedAt=data?.updatedAt||null;
  clean.submissions=Array.isArray(data?.submissions)?data.submissions.map(item=>({
    id:String(item.id||item.ID||""),
    username:String(item.username||item.Username||""),
    stopId:String(item.stopId||item.StopID||""),
    stopTitle:String(item.stopTitle||item.StopTitle||""),
    day:String(item.day||item.Day||""),
    hotel:String(item.hotel||item.Hotel||""),
    score:Number(item.score||item.Score||SCORE_PER_STOP),
    bonus:Number(item.bonus||item.Bonus||0),
    status:String(item.status||item.Status||"pending").toLowerCase(),
    submittedAt:String(item.submittedAt||item.SubmittedAt||""),
    updatedAt:String(item.updatedAt||item.UpdatedAt||""),
    approvedAt:String(item.approvedAt||item.ApprovedAt||""),
    approvedBy:String(item.approvedBy||item.ApprovedBy||""),
    proofName:String(item.proofName||item.ProofName||""),
    proofImage:String(item.proofImage||item.ProofImage||item.photoUrl||item.PhotoUrl||""),
    evidence:normaliseEvidence(item),
    activity:String(item.activity||item.Activity||"")
  })).filter(item=>item.id&&item.username&&item.stopId):[];
  return clean;
}

function normaliseEvidence(item){
  if(Array.isArray(item.evidence)){
    return item.evidence.map((proof,index)=>({
      clue:String(proof.clue||"Clue "+(index+1)),
      name:String(proof.name||""),
      image:String(proof.image||proof.url||""),
      done:Boolean(proof.done||proof.image||proof.url)
    }));
  }
  const raw=item.evidenceJson||item.EvidenceJson||item.EvidenceJSON||"";
  if(raw){
    try{
      const parsed=JSON.parse(raw);
      if(Array.isArray(parsed))return parsed.map((proof,index)=>({
        clue:String(proof.clue||"Clue "+(index+1)),
        name:String(proof.name||""),
        image:String(proof.image||proof.url||""),
        done:Boolean(proof.done||proof.image||proof.url)
      }));
    }catch{}
  }
  const fallback=item.proofImage||item.ProofImage||item.photoUrl||item.PhotoUrl||"";
  return fallback?[{clue:"Evidence",name:String(item.proofName||item.ProofName||""),image:String(fallback),done:true}]:[];
}

function scoreWithBonus(item){
  return Number(item.score||SCORE_PER_STOP)+Number(item.bonus||0);
}

function renderReward(){
  const done=STOPS.every(stop=>statusForStop(stop.id)==="approved");
  els.amazonBtn.disabled=!done;
  els.reward.classList.toggle("locked",!done);
  els.rewardText.textContent=done?"Every level is clear. The final vault is open.":"Clear every level to open the final reward.";
}

function scrollToHome(){
  setTimeout(()=>$("#home")?.scrollIntoView({behavior:"smooth",block:"start"}),160);
}

function resetProgress(message="Progress reset."){
  progress=freshProgress();
  saveProgress();
  renderApp();
  alert(message);
  scrollToHome();
}

function imageToThumb(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const image=new Image();
      image.onload=()=>{
        const max=420;
        const scale=Math.min(1,max/Math.max(image.width,image.height));
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(image.width*scale));
        canvas.height=Math.max(1,Math.round(image.height*scale));
        const ctx=canvas.getContext("2d");
        ctx.drawImage(image,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL("image/jpeg",0.58));
      };
      image.onerror=reject;
      image.src=reader.result;
    };
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}

function disableLevelInputs(node){
  node.querySelectorAll("input,textarea,button").forEach(control=>control.disabled=true);
}

function revealOnScroll(){
  if(observer)observer.disconnect();
  if(!("IntersectionObserver"in window)){
    document.querySelectorAll(".reveal").forEach(item=>item.classList.add("show"));
    return;
  }
  observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(entry.isIntersecting)entry.target.classList.add("show");
  }),{threshold:.1});
  document.querySelectorAll(".reveal").forEach(item=>observer.observe(item));
}

function formatDate(value){
  if(!value)return "-";
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return "-";
  return date.toLocaleString([], {dateStyle:"medium",timeStyle:"short"});
}

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,char=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[char]));
}

function exportCsv(){
  const rows=[["ID","Username","Stop ID","Stop","Status","Score","Bonus","Submitted","Approved","Approved By","Evidence Count","Evidence Names","Activity"]];
  shared.submissions.forEach(item=>rows.push([
    item.id,
    item.username,
    item.stopId,
    item.stopTitle,
    item.status,
    item.score,
    item.bonus,
    item.submittedAt,
    item.approvedAt,
    item.approvedBy,
    item.evidence.length,
    item.evidence.map(proof=>proof.name).filter(Boolean).join("; "),
    item.activity
  ]));
  const csv=rows.map(row=>row.map(value=>'"'+String(value??"").replace(/"/g,'""')+'"').join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv"});
  const link=document.createElement("a");
  link.href=URL.createObjectURL(blob);
  link.download="route66-scores.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function doLogin(name,password){
  if(name.trim().toLowerCase()==="test"){
    session={username:"test",role:"player",test:true};
    sessionStorage.setItem(STORAGE.session,JSON.stringify(session));
    await openSite();
    return true;
  }
  const accountName=normalName(name);
  if(!accountName)return false;
  const account=ACCOUNTS[accountName];
  const hashed=await sha256(password);
  if(hashed!==account.hash)return false;
  session={username:accountName,role:account.role,test:false};
  if(account.role==="admin")session.adminKey=password;
  sessionStorage.setItem(STORAGE.session,JSON.stringify(session));
  await openSite();
  return true;
}

async function openSite(){
  loadProgress();
  loadShared();
  els.login.classList.add("hidden");
  els.site.classList.remove("hidden");
  renderApp();
  await syncShared();
}

function bindEvents(){
  els.loginForm.addEventListener("submit",async event=>{
    event.preventDefault();
    els.loginError.textContent="";
    const ok=await doLogin(els.username.value,els.password.value);
    if(!ok)els.loginError.textContent="Wrong username or password.";
  });
  els.logoutBtn.addEventListener("click",()=>{
    sessionStorage.removeItem(STORAGE.session);
    session=null;
    els.site.classList.add("hidden");
    els.login.classList.remove("hidden");
  });
  els.resetBtn.addEventListener("click",()=>{
    if(confirm("Reset local progress for this player?"))resetProgress("Progress reset.");
  });
  els.printBtn.addEventListener("click",()=>window.print());
  els.syncBtn.addEventListener("click",syncShared);
  els.exportCsvBtn.addEventListener("click",exportCsv);
  els.adminRefreshBtn.addEventListener("click",syncShared);
  els.amazonBtn.addEventListener("click",()=>{
    if(!els.amazonBtn.disabled)els.voucher.classList.remove("hidden");
  });
}

bindEvents();
const previewParams=new URLSearchParams(location.search);
if(previewParams.get("preview")==="test"){
  session={username:"test",role:"player",test:true};
  sessionStorage.setItem(STORAGE.session,JSON.stringify(session));
  openSite();
}else{
  try{
    const saved=JSON.parse(sessionStorage.getItem(STORAGE.session)||"null");
    if(saved?.username){
      session=saved;
      openSite();
    }
  }catch{}
}
