const ADMIN_PASSWORD="woodreach";
const SUBMISSIONS_SHEET="Submissions";
const PHOTO_FOLDER="Route 66 Quest Evidence";
const HEADERS=[
  "ID",
  "Username",
  "StopID",
  "StopTitle",
  "Day",
  "Hotel",
  "Score",
  "Bonus",
  "Status",
  "SubmittedAt",
  "UpdatedAt",
  "ApprovedAt",
  "ApprovedBy",
  "RejectedAt",
  "ProofName",
  "ProofImage",
  "EvidenceCount",
  "EvidenceLinks",
  "EvidenceJson",
  "Activity"
];

function doGet(){
  return jsonResponse(readState());
}

function doPost(e){
  const payload=JSON.parse(e.postData.contents||"{}");
  if(payload.action==="submit")return jsonResponse(handleSubmit(payload.submission));
  if(payload.action==="approve")return jsonResponse(handleApprove(payload));
  if(payload.action==="reject")return jsonResponse(handleReject(payload));
  return jsonResponse(readState());
}

function handleSubmit(submission){
  const sheet=getSheet();
  const existing=findRowById(sheet,submission.id);
  const evidence=saveEvidence(submission);
  submission.evidence=evidence;
  submission.proofName=evidence.map(item=>item.name).filter(Boolean).join("; ");
  submission.proofImage=(evidence.find(item=>item.image)||{}).image||"";
  const row=toRow(submission);
  if(existing>0)sheet.getRange(existing,1,1,HEADERS.length).setValues([row]);
  else sheet.appendRow(row);
  return readState();
}

function handleApprove(payload){
  requireAdmin(payload.adminKey);
  updateSubmission(payload.id,{
    Status:"approved",
    Bonus:Number(payload.bonus||0),
    ApprovedAt:new Date().toISOString(),
    ApprovedBy:payload.approvedBy||"admin",
    UpdatedAt:new Date().toISOString()
  });
  return readState();
}

function handleReject(payload){
  requireAdmin(payload.adminKey);
  updateSubmission(payload.id,{
    Status:"rejected",
    RejectedAt:new Date().toISOString(),
    ApprovedBy:payload.approvedBy||"admin",
    UpdatedAt:new Date().toISOString()
  });
  return readState();
}

function requireAdmin(key){
  if(key!==ADMIN_PASSWORD)throw new Error("Not allowed");
}

function getSheet(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sheet=ss.getSheetByName(SUBMISSIONS_SHEET);
  if(!sheet)sheet=ss.insertSheet(SUBMISSIONS_SHEET);
  const first=sheet.getRange(1,1,1,HEADERS.length).getValues()[0];
  if(first[0]!=="ID")sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  return sheet;
}

function readState(){
  const sheet=getSheet();
  const values=sheet.getDataRange().getValues();
  const headers=values.shift()||HEADERS;
  const submissions=values
    .filter(row=>row[0])
    .map(row=>{
      const item={};
      headers.forEach((header,index)=>item[header]=row[index]);
      return fromRow(item);
    });
  return {updatedAt:new Date().toISOString(),submissions};
}

function toRow(item){
  const evidence=item.evidence||[];
  const evidenceLinks=evidence.map(proof=>proof.image).filter(Boolean).join("\n");
  const row={
    ID:item.id,
    Username:item.username,
    StopID:item.stopId,
    StopTitle:item.stopTitle,
    Day:item.day,
    Hotel:item.hotel,
    Score:Number(item.score||100),
    Bonus:Number(item.bonus||0),
    Status:item.status||"pending",
    SubmittedAt:item.submittedAt||new Date().toISOString(),
    UpdatedAt:new Date().toISOString(),
    ApprovedAt:item.approvedAt||"",
    ApprovedBy:item.approvedBy||"",
    RejectedAt:item.rejectedAt||"",
    ProofName:item.proofName||"",
    ProofImage:item.proofImage||"",
    EvidenceCount:evidence.length,
    EvidenceLinks:evidenceLinks,
    EvidenceJson:JSON.stringify(evidence),
    Activity:item.activity||""
  };
  return HEADERS.map(header=>row[header]||"");
}

function fromRow(item){
  let evidence=[];
  try{
    evidence=JSON.parse(item.EvidenceJson||"[]");
  }catch(err){
    evidence=[];
  }
  return {
    id:String(item.ID||""),
    username:String(item.Username||""),
    stopId:String(item.StopID||""),
    stopTitle:String(item.StopTitle||""),
    day:String(item.Day||""),
    hotel:String(item.Hotel||""),
    score:Number(item.Score||100),
    bonus:Number(item.Bonus||0),
    status:String(item.Status||"pending").toLowerCase(),
    submittedAt:String(item.SubmittedAt||""),
    updatedAt:String(item.UpdatedAt||""),
    approvedAt:String(item.ApprovedAt||""),
    approvedBy:String(item.ApprovedBy||""),
    proofName:String(item.ProofName||""),
    proofImage:String(item.ProofImage||""),
    evidence:evidence,
    activity:String(item.Activity||"")
  };
}

function updateSubmission(id,updates){
  const sheet=getSheet();
  const row=findRowById(sheet,id);
  if(row<1)throw new Error("Submission not found");
  const values=sheet.getRange(row,1,1,HEADERS.length).getValues()[0];
  const current={};
  HEADERS.forEach((header,index)=>current[header]=values[index]);
  Object.keys(updates).forEach(key=>current[key]=updates[key]);
  sheet.getRange(row,1,1,HEADERS.length).setValues([HEADERS.map(header=>current[header]||"")]);
}

function findRowById(sheet,id){
  const values=sheet.getRange(1,1,sheet.getLastRow(),1).getValues();
  for(let index=1;index<values.length;index++){
    if(String(values[index][0])===String(id))return index+1;
  }
  return -1;
}

function saveEvidence(submission){
  const folder=getPhotoFolder();
  return (submission.evidence||[]).map((proof,index)=>{
    const saved={clue:proof.clue||"Clue "+(index+1),name:proof.name||"",image:proof.image||"",done:Boolean(proof.done)};
    if(saved.image&&saved.image.indexOf("data:image/")===0){
      const match=saved.image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if(match){
        const extension=match[1].split("/")[1].replace("jpeg","jpg");
        const bytes=Utilities.base64Decode(match[2]);
        const safeName=[submission.username,submission.stopId,index+1,saved.name||"evidence."+extension].join("-");
        const blob=Utilities.newBlob(bytes,match[1],safeName);
        const file=folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
        saved.image=file.getUrl();
      }
    }
    return saved;
  });
}

function getPhotoFolder(){
  const folders=DriveApp.getFoldersByName(PHOTO_FOLDER);
  if(folders.hasNext())return folders.next();
  return DriveApp.createFolder(PHOTO_FOLDER);
}

function jsonResponse(data){
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
