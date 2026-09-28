import fs from "node:fs";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";

const html=fs.readFileSync("index.html","utf8").replace(/<script src="\.\/app\.js\?v=4\.5"><\/script>/,"");
const app=fs.readFileSync("app.js","utf8");
const errors=[];

function setup(){
  const dom=new JSDOM(html,{url:"https://ilbonix.github.io/swimlio/",runScripts:"outside-only",pretendToBeVisual:true});
  const {window}=dom;
  window.confirm=()=>true;
  window.alert=()=>{};
  window.navigator.share=async()=>{};
  window.URL.createObjectURL=()=>"blob:qa";
  window.URL.revokeObjectURL=()=>{};
  window.HTMLAnchorElement.prototype.click=function(){};
  Object.defineProperty(window.navigator,"serviceWorker",{value:{register:async()=>({})},configurable:true});
  window.addEventListener("error",e=>errors.push(String(e.error||e.message)));
  const originalError=window.console.error;
  window.console.error=(...a)=>{errors.push(a.join(" "));originalError(...a)};
  window.eval(app);
  return dom;
}
const click=(w,sel)=>{
  const el=w.document.querySelector(sel);
  assert.ok(el,"Missing clickable element: "+sel);
  el.dispatchEvent(new w.MouseEvent("click",{bubbles:true,cancelable:true}));
  return el;
};
const set=(w,sel,value,event="input")=>{
  const el=w.document.querySelector(sel);
  assert.ok(el,"Missing field: "+sel);
  el.value=String(value);
  el.dispatchEvent(new w.Event(event,{bubbles:true}));
};
const noDuplicateIds=(w,label)=>{
  const ids=[...w.document.querySelectorAll("[id]")].map(x=>x.id);
  const dup=ids.filter((x,i)=>ids.indexOf(x)!==i);
  assert.equal(new Set(dup).size,0,label+" has duplicate IDs: "+[...new Set(dup)].join(", "));
};
const generatedMeters=w=>{
  const h=w.document.querySelector("#workoutMount h2")?.textContent||"";
  const m=h.match(/(\d+)\s*m/);
  assert.ok(m,"Workout distance missing");
  return Number(m[1]);
};

const dom=setup(),w=dom.window;
await new Promise(r=>setTimeout(r,250));
noDuplicateIds(w,"Initial view");

assert.ok(w.document.querySelector("#firstProfile"),"First-run CTA missing");
click(w,"#firstProfile");
click(w,"#newProfile");
set(w,"#pfName","QA Beginner");
set(w,"#pfLevel","Iniciación","change");
set(w,"#pfPool",25,"change");
set(w,"#pfMode","Solo","change");
set(w,"#pfPace",120);
set(w,"#pfGoal","Mejorar resistencia","change");
set(w,"#pfDays",3,"change");
click(w,"#saveProfileModal");

click(w,'button[data-view="today"]');
assert.ok(w.document.body.textContent.includes("Mejorar resistencia"),"Goal not shown in active profile");
click(w,"#generate");
noDuplicateIds(w,"Generated workout");
const total=generatedMeters(w);
assert.ok(total>=1100&&total<=1600,"Beginner 60-min volume out of bounds: "+total+" m");
const firstWorkoutText=w.document.querySelector("#workoutMount")?.textContent||"";
assert.ok(!/3\s*[×x]\s*200\s*m/i.test(firstWorkoutText),"First beginner workout must never contain 3x200 m");
assert.ok(!/\b200\s*m\b/.test(firstWorkoutText),"First beginner workout must not prescribe 200 m repetitions");


click(w,"#favoriteWorkout");
assert.equal(JSON.parse(w.localStorage.getItem("swimlio_favorites")).length,1,"Favorite not persisted");
click(w,"#shareWorkout");

click(w,"#startWorkout");
assert.ok(w.document.querySelector(".sessionOverlay"),"Session mode did not open");
click(w,"#pauseSession");
let paused=JSON.parse(w.localStorage.getItem("swimlio_active_session"));
assert.equal(paused.paused,true,"Pause state was not persisted");
assert.equal(w.document.querySelector("#nextSession").disabled,true,"Next must be disabled while paused");
click(w,"#pauseSession");
paused=JSON.parse(w.localStorage.getItem("swimlio_active_session"));
assert.equal(paused.paused,false,"Resume did not clear pause state");

const beforeSkip=paused.completedMeters;
if(w.document.querySelector("#skipSession"))click(w,"#skipSession");
let afterSkip=JSON.parse(w.localStorage.getItem("swimlio_active_session"));
assert.equal(afterSkip.completedMeters,beforeSkip,"Skipping an exercise must not add meters");
assert.ok(afterSkip.skipped.length>=1,"Skipped exercise not recorded");

for(let i=0;i<3;i++){
  const n=w.document.querySelector("#nextSession");
  assert.ok(n,"Next button missing during session");
  n.click();
}
const savedSession=JSON.parse(w.localStorage.getItem("swimlio_active_session"));
assert.ok(savedSession&&savedSession.index>=4,"Session progress was not persisted");
assert.ok(savedSession.completedMeters>0,"Completed meters were not persisted");

let guard=0;
while(!w.document.querySelector(".finishOverlay")&&guard++<120){
  const n=w.document.querySelector("#nextSession");
  assert.ok(n,"Session ended without finish screen");
  n.click();
}
assert.ok(w.document.querySelector(".finishOverlay"),"Finish screen did not appear");
set(w,"#finishNote","QA note");
click(w,'#finishRating button[data-v="Bien"]');
click(w,"#saveFinish");
const hist=JSON.parse(w.localStorage.getItem("swimlio_history"));
assert.equal(hist[0].note,"QA note","Post-workout note was not stored");
assert.equal(w.localStorage.getItem("swimlio_active_session"),null,"Active session was not cleared");

click(w,'button[data-view="history"]');
assert.ok(w.document.querySelector(".historyItem"),"Saved workout missing from history");
assert.ok(w.document.body.textContent.includes("Últimas 4 semanas"),"Four-week trend missing");
assert.ok(w.document.body.textContent.includes("Favoritos"),"Favorites section missing");
const useFav=w.document.querySelector("[data-use-favorite]");
assert.ok(useFav,"Favorite reuse action missing");
useFav.click();
assert.ok(!w.document.querySelector("#todayView").classList.contains("hiddenView"),"Favorite did not load Today");

click(w,'button[data-view="plan"]');
const planDays=[...w.document.querySelectorAll(".planDay")];
assert.equal(planDays.length,3,"3-days/week profile should create 3 planned sessions");
assert.ok(w.document.body.textContent.includes("Mejorar resistencia"),"Plan goal missing");
const useToday=w.document.querySelector("[data-planuse]");
assert.ok(useToday,"Plan item action missing");
useToday.click();

click(w,'button[data-view="profiles"]');
assert.ok(w.document.querySelector("#exportData"),"Backup export action missing");
assert.ok(w.document.querySelector("#importData"),"Backup import action missing");
click(w,"#exportData");
const edit=w.document.querySelector("[data-edit-profile]");
edit.click();
assert.ok(w.document.querySelector("#pfGoal"),"Goal field missing in profile editor");
assert.ok(w.document.querySelector("#pfDays"),"Days-per-week field missing in profile editor");
click(w,"#closeProfileModal");

for(const sel of ['button[data-view="today"]','button[data-view="plan"]','button[data-view="history"]','button[data-view="profiles"]'])click(w,sel);
noDuplicateIds(w,"Final navigation");
assert.deepEqual(errors,[],"Runtime errors were captured: "+errors.join(" | "));

console.log("SWIMLIO 4.5 QA PASS");
console.log("Beginner 60-min generated volume:",total+" m");
console.log("Core flows + adaptive plan + pause/skip + favorites/share + backup UI + 4-week history — PASS");
