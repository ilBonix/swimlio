import fs from "node:fs";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";

const html=fs.readFileSync("index.html","utf8").replace(/<script src="\.\/app\.js\?v=4\.0"><\/script>/,"");
const app=fs.readFileSync("app.js","utf8");
const errors=[];

function setup(){
  const dom=new JSDOM(html,{url:"https://ilbonix.github.io/swimlio/",runScripts:"outside-only",pretendToBeVisual:true});
  const {window}=dom;
  window.confirm=()=>true;
  window.alert=()=>{};
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

const dom=setup(),w=dom.window;
await new Promise(r=>setTimeout(r,250));
noDuplicateIds(w,"Initial view");

assert.ok(w.document.querySelector("#firstProfile"),"First-run CTA missing");
click(w,"#firstProfile");
assert.ok(!w.document.querySelector("#profilesView").classList.contains("hiddenView"),"Profiles tab did not open");

click(w,"#newProfile");
assert.ok(w.document.querySelector(".modalOverlay"),"Create-profile modal did not open");
set(w,"#pfName","QA Beginner");
set(w,"#pfLevel","Iniciación","change");
set(w,"#pfPool",25,"change");
set(w,"#pfMode","Solo","change");
set(w,"#pfPace",120);
click(w,"#saveProfileModal");
assert.ok(!w.document.querySelector(".modalOverlay"),"Profile modal did not close after save");

click(w,'button[data-view="today"]');
assert.ok(w.document.querySelector("#generate"),"Generate button missing");
click(w,"#generate");
noDuplicateIds(w,"Generated workout");

const heading=w.document.querySelector("#workoutMount h2")?.textContent||"";
const m=heading.match(/(\d+)\s*m/);
assert.ok(m,"Workout distance missing");
const total=Number(m[1]);
assert.ok(total>=1100&&total<=1600,"Beginner 60-min volume out of bounds: "+total+" m");

assert.ok(w.document.querySelector("#startWorkout"),"Start-workout button missing");
click(w,"#startWorkout");
assert.ok(w.document.querySelector(".sessionOverlay"),"Session mode did not open");
noDuplicateIds(w,"Session view");

for(let i=0;i<4;i++){
  const n=w.document.querySelector("#nextSession");
  assert.ok(n,"Next button missing during session");
  n.click();
}
const savedSession=JSON.parse(w.localStorage.getItem("swimlio_active_session"));
assert.ok(savedSession&&savedSession.index>=4,"Session progress was not persisted");
assert.ok(savedSession.completedMeters>0,"Completed meters were not persisted");

let guard=0;
while(!w.document.querySelector(".finishOverlay")&&guard++<100){
  const n=w.document.querySelector("#nextSession");
  assert.ok(n,"Session ended without finish screen");
  n.click();
}
assert.ok(w.document.querySelector(".finishOverlay"),"Finish screen did not appear");
click(w,'#finishRating button[data-v="Bien"]');
click(w,"#saveFinish");
assert.equal(w.localStorage.getItem("swimlio_active_session"),null,"Active session was not cleared after save");

click(w,'button[data-view="history"]');
assert.ok(w.document.querySelector(".historyItem"),"Saved workout missing from history");
assert.ok(w.document.querySelector(".barChart"),"History chart missing");

click(w,'button[data-view="plan"]');
assert.ok(w.document.querySelector(".planDay"),"Weekly plan was not created");
const useToday=w.document.querySelector("[data-planuse]");
assert.ok(useToday,"Plan item action missing");
useToday.click();
assert.ok(!w.document.querySelector("#todayView").classList.contains("hiddenView"),"Plan action did not return to Today");

click(w,'button[data-view="profiles"]');
const edit=w.document.querySelector("[data-edit-profile]");
assert.ok(edit,"Profile edit action missing");
edit.click();
assert.ok(w.document.querySelector("#saveProfileModal"),"Edit-profile modal did not open");
click(w,"#closeProfileModal");

for(const sel of ['button[data-view="today"]','button[data-view="plan"]','button[data-view="history"]','button[data-view="profiles"]']){
  click(w,sel);
}
assert.deepEqual(errors,[],"Runtime errors were captured: "+errors.join(" | "));
console.log("SWIMLIO QA PASS");
console.log("Beginner 60-min generated volume:",total+" m");
console.log("Core flows: profile, generation, session, persistence, finish, history, plan, navigation — PASS");
