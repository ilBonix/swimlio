"use strict";

const VERSION="4.5";
const KEYS={
  profiles:"swimlio_profiles",
  active:"swimlio_active_profile",
  history:"swimlio_history",
  plans:"swimlio_week_plans",
  session:"swimlio_active_session",
  favorites:"swimlio_favorites"
};
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const roundTo=(n,step)=>Math.max(step,Math.round(n/step)*step);
const nowISO=()=>new Date().toISOString();
const safeParse=(s,fallback)=>{try{return JSON.parse(s)??fallback}catch{return fallback}};
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const fmtTime=s=>{s=Math.max(0,Math.round(s));const m=Math.floor(s/60),r=s%60;return r?m+" min "+r+" s":m+" min"};
const fmtClock=s=>{s=Math.max(0,Math.ceil(s));return Math.floor(s/60)+":"+String(s%60).padStart(2,"0")};
const dayNames=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const fullDay=["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

let profiles=safeParse(localStorage.getItem(KEYS.profiles),[]);
let activeProfileId=localStorage.getItem(KEYS.active)||null;
let history=safeParse(localStorage.getItem(KEYS.history),[]);
let plans=safeParse(localStorage.getItem(KEYS.plans),{});
let favorites=safeParse(localStorage.getItem(KEYS.favorites),[]);
let activeProfile=null;
let lastWorkout=null;
let toastTimer=null;

const state={type:"Mixto",duration:60,focus:"Auto",energy:"Normal",gear:[],mode:"Solo",pool:25,people:1,lanes:1};

function saveProfiles(){localStorage.setItem(KEYS.profiles,JSON.stringify(profiles));activeProfileId?localStorage.setItem(KEYS.active,activeProfileId):localStorage.removeItem(KEYS.active)}
function saveHistory(){localStorage.setItem(KEYS.history,JSON.stringify(history.slice(0,200)))}
function savePlans(){localStorage.setItem(KEYS.plans,JSON.stringify(plans))}
function saveFavorites(){localStorage.setItem(KEYS.favorites,JSON.stringify(favorites.slice(0,30)))}
function toast(msg){const el=$("#toast");el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2200)}
function go(view){$$(".navbar button").forEach(b=>b.classList.toggle("on",b.dataset.view===view));$$(".view").forEach(v=>v.classList.add("hiddenView"));$("#"+view+"View").classList.remove("hiddenView");if(view==="today")renderToday();if(view==="plan")renderPlan();if(view==="history")renderHistory();if(view==="profiles")renderProfiles()}
$$(".navbar button").forEach(b=>b.addEventListener("click",()=>go(b.dataset.view)));

function normalizeProfiles(){
  profiles=profiles.filter(p=>p&&p.id).map(p=>({
    id:p.id,name:p.name||"Mi perfil",level:p.level||"Iniciación",pool:+p.pool||25,
    mode:p.mode||"Solo",pace100:+p.pace100||null,people:+p.people||8,lanes:+p.lanes||2,
    goal:p.goal||"General",daysPerWeek:clamp(+p.daysPerWeek||3,2,5)
  }));
  if(activeProfileId&&!profiles.some(p=>p.id===activeProfileId))activeProfileId=null;
  if(!activeProfileId&&profiles.length===1)activeProfileId=profiles[0].id;
  saveProfiles();
}
normalizeProfiles();

function applyProfile(){
  activeProfile=profiles.find(p=>p.id===activeProfileId)||null;
  if(!activeProfile)return;
  state.pool=+activeProfile.pool;
  state.mode=activeProfile.mode;
  state.people=state.mode==="Grupo"?Math.max(1,+activeProfile.people||8):1;
  state.lanes=state.mode==="Grupo"?Math.max(1,+activeProfile.lanes||2):1;
}
applyProfile();

const LEVEL={
  "Iniciación":{pace:150,minRep:25,maxRep:200,strokes:["Crol"],rpe:[3,8]},
  "Intermedio":{pace:120,minRep:25,maxRep:400,strokes:["Crol","Espalda","Braza"],rpe:[3,9]},
  "Avanzado":{pace:95,minRep:25,maxRep:800,strokes:["Crol","Espalda","Braza","Mariposa","Estilos"],rpe:[3,10]}
};

const VOLUME_LIMITS={
  "Iniciación":{
    30:[600,900],45:[850,1200],60:[1100,1600],75:[1300,1800],90:[1500,2000]
  },
  "Intermedio":{
    30:[900,1300],45:[1200,1700],60:[1500,2200],75:[1800,2600],90:[2200,3000]
  },
  "Avanzado":{
    30:[1200,1700],45:[1600,2300],60:[2000,3000],75:[2500,3500],90:[3000,4200]
  }
};
const ENERGY={
  "Cansado":{volume:.88,intensity:-1,label:"Recupera y prioriza técnica"},
  "Normal":{volume:1,intensity:0,label:"Carga normal"},
  "Con energía":{volume:1.06,intensity:1,label:"Puedes apretar un poco más"}
};
const GOALS={
  "General":{volume:1,plan:["Técnica","Resistencia","Mixto","Velocidad"]},
  "Mejorar resistencia":{volume:1.04,plan:["Resistencia","Técnica","Resistencia","Mixto"]},
  "Mejorar velocidad":{volume:.98,plan:["Técnica","Velocidad","Mixto","Velocidad"]},
  "Mejorar técnica":{volume:.96,plan:["Técnica","Mixto","Técnica","Resistencia"]},
  "Volver a entrenar":{volume:.90,plan:["Técnica","Mixto","Resistencia","Técnica"]}
};
function recentAdaptation(){
  if(!activeProfileId)return 1;
  const recent=history.filter(h=>h.profileId===activeProfileId).slice(0,5);
  if(!recent.length)return 1;
  const hard=recent.filter(h=>["Difícil","Demasiado"].includes(h.rating)||h.completed===false).length;
  const easy=recent.filter(h=>h.rating==="Muy fácil"&&h.completed!==false).length;
  if(hard>=2)return .92;
  if(easy>=3)return 1.04;
  return 1;
}
const TYPE_PROFILES={
  "Técnica":{warm:.17,tech:.36,main:.27,speed:.08,cool:.12},
  "Resistencia":{warm:.14,tech:.12,main:.56,speed:.08,cool:.10},
  "Velocidad":{warm:.18,tech:.16,main:.20,speed:.36,cool:.10},
  "Mixto":{warm:.15,tech:.19,main:.39,speed:.16,cool:.11}
};

const DRILLS=[
 {cat:"warm",n:"Nado suave de crol",levels:["Iniciación","Intermedio","Avanzado"],gear:[],rpe:3,how:"Nada cómodo, alargando la brazada y respirando sin prisa.",feel:"Debes acabar más suelto que al empezar."},
 {cat:"warm",n:"Crol + espalda suave",levels:["Intermedio","Avanzado"],gear:[],rpe:3,how:"Alterna crol y espalda a ritmo cómodo.",feel:"Movilidad de hombros y respiración controlada."},
 {cat:"warm",n:"Crol progresivo",levels:["Iniciación","Intermedio","Avanzado"],gear:[],rpe:4,how:"Empieza muy cómodo y termina cada repetición algo más rápido.",feel:"Activación progresiva, sin llegar a sprint."},
 {cat:"tech",n:"Crol con un brazo",levels:["Iniciación","Intermedio","Avanzado"],gear:[],rpe:4,how:"Nada alternando un brazo mientras el otro permanece extendido delante.",feel:"Control del apoyo y una brazada larga."},
 {cat:"tech",n:"Punto muerto de crol",levels:["Iniciación","Intermedio","Avanzado"],gear:[],rpe:4,how:"Un brazo no inicia la brazada hasta que el otro llega delante.",feel:"Coordinación y deslizamiento."},
 {cat:"tech",n:"Crol rozando dedos",levels:["Iniciación","Intermedio","Avanzado"],gear:[],rpe:4,how:"Durante el recobro roza suavemente el agua con las yemas de los dedos.",feel:"Codo alto y hombro relajado."},
 {cat:"tech",n:"Patada con tabla",levels:["Iniciación","Intermedio","Avanzado"],gear:["Tabla"],rpe:5,how:"Sujeta la tabla delante y mantén una patada continua desde la cadera.",feel:"Piernas activas sin bloquear las rodillas."},
 {cat:"tech",n:"Crol con tubo frontal",levels:["Iniciación","Intermedio","Avanzado"],gear:["Tubo frontal"],rpe:4,how:"Nada crol sin girar la cabeza para centrarte en alineación y apoyo.",feel:"Cabeza estable y cuerpo recto."},
 {cat:"tech",n:"Crol con aletas técnico",levels:["Iniciación","Intermedio","Avanzado"],gear:["Aletas"],rpe:5,how:"Usa las aletas para mantener velocidad suave y concentrarte en la posición corporal.",feel:"Cadera alta y deslizamiento fluido."},
 {cat:"tech",n:"Sculling frontal + crol",levels:["Intermedio","Avanzado"],gear:[],rpe:4,how:"Haz pequeños barridos con las manos delante y completa después con crol.",feel:"Presión constante del agua en manos y antebrazos."},
 {cat:"tech",n:"Espalda técnica",levels:["Intermedio","Avanzado"],gear:[],rpe:4,how:"Nada espalda suave cuidando la rotación y la entrada limpia de la mano.",feel:"Hombros móviles y cuerpo alto."},
 {cat:"tech",n:"Braza técnica con pausa",levels:["Intermedio","Avanzado"],gear:[],rpe:4,how:"Haz una breve pausa en posición extendida después de cada ciclo.",feel:"Deslizamiento claro y patada simétrica."},
 {cat:"tech",n:"Mariposa técnica 3-3-3",levels:["Avanzado"],gear:["Aletas"],rpe:5,how:"Tres brazadas con un brazo, tres con el otro y tres completas.",feel:"Ondulación continua y ritmo relajado."},
 {cat:"main",n:"Crol aeróbico estable",levels:["Iniciación","Intermedio","Avanzado"],gear:[],rpe:6,how:"Mantén un ritmo constante que podrías sostener varias repeticiones.",feel:"Respiración exigente pero controlada."},
 {cat:"main",n:"Crol descendente",levels:["Iniciación","Intermedio","Avanzado"],gear:[],rpe:6,how:"Haz cada repetición un poco más rápida que la anterior sin perder técnica.",feel:"Control del ritmo y final fuerte."},
 {cat:"main",n:"Crol con pull buoy",levels:["Iniciación","Intermedio","Avanzado"],gear:["Pull buoy"],rpe:6,how:"Coloca el pull buoy entre los muslos y céntrate en el agarre y la tracción.",feel:"Brazos trabajando con cadera estable."},
 {cat:"main",n:"Crol con palas controlado",levels:["Intermedio","Avanzado"],gear:["Palas"],rpe:6,how:"Nada con palas manteniendo técnica limpia; no fuerces el hombro.",feel:"Mayor presión en manos y antebrazos."},
 {cat:"main",n:"Negativo",levels:["Intermedio","Avanzado"],gear:[],rpe:6,how:"Nada la segunda mitad de cada repetición más rápida que la primera.",feel:"Reserva inicial y aceleración controlada."},
 {cat:"main",n:"Estilos aeróbicos",levels:["Avanzado"],gear:[],rpe:6,how:"Combina mariposa, espalda, braza y crol con ritmo uniforme.",feel:"Transiciones fluidas entre estilos."},
 {cat:"main",n:"Braza aeróbica",levels:["Intermedio","Avanzado"],gear:[],rpe:6,how:"Mantén una braza larga, sin precipitar la frecuencia.",feel:"Deslizamiento y ritmo sostenible."},
 {cat:"main",n:"Espalda aeróbica",levels:["Intermedio","Avanzado"],gear:[],rpe:6,how:"Nada espalda con ritmo continuo y rotación estable.",feel:"Respiración libre, hombros sin tensión."},
 {cat:"speed",n:"Crol rápido con técnica",levels:["Iniciación","Intermedio","Avanzado"],gear:[],rpe:8,how:"Nada rápido, pero corta la velocidad si la técnica se desordena.",feel:"Potencia alta con brazada todavía limpia."},
 {cat:"speed",n:"25 rápido + 25 suave",levels:["Iniciación","Intermedio","Avanzado"],gear:[],rpe:8,how:"Alterna un tramo rápido y otro suave dentro de la misma repetición.",feel:"Cambio claro de ritmo y recuperación activa."},
 {cat:"speed",n:"Sprint con aletas",levels:["Iniciación","Intermedio","Avanzado"],gear:["Aletas"],rpe:9,how:"Acelera con patada rápida y cuerpo alineado.",feel:"Velocidad alta sin bloquear la respiración."},
 {cat:"speed",n:"Crol desde fuerte a máximo",levels:["Intermedio","Avanzado"],gear:[],rpe:9,how:"Empieza fuerte y acelera progresivamente hasta casi máximo.",feel:"Últimos metros muy rápidos manteniendo control."},
 {cat:"speed",n:"Sprint crol",levels:["Intermedio","Avanzado"],gear:[],rpe:9,how:"Nada a velocidad casi máxima durante una distancia corta.",feel:"Esfuerzo muy alto; necesitas recuperar después."},
 {cat:"speed",n:"Sprint de estilos",levels:["Avanzado"],gear:[],rpe:9,how:"Realiza repeticiones cortas del estilo indicado a intensidad alta.",feel:"Potencia y técnica bajo velocidad."},
 {cat:"cool",n:"Crol muy suave",levels:["Iniciación","Intermedio","Avanzado"],gear:[],rpe:2,how:"Nada despacio, soltando brazos y alargando cada ciclo.",feel:"La respiración baja progresivamente."},
 {cat:"cool",n:"Espalda suave",levels:["Iniciación","Intermedio","Avanzado"],gear:[],rpe:2,how:"Nada espalda sin buscar velocidad, relajando hombros.",feel:"Sensación de soltar y recuperar."},
 {cat:"cool",n:"Crol + espalda recuperación",levels:["Iniciación","Intermedio","Avanzado"],gear:[],rpe:2,how:"Alterna crol y espalda a intensidad muy baja.",feel:"Acabar fresco y con respiración tranquila."}
];

function profilePace(){
  const p=+activeProfile?.pace100;
  return p>=60&&p<=300?p:LEVEL[activeProfile?.level||"Iniciación"].pace;
}
function effectivePace(rpe=5){
  const base=profilePace();
  const mult=rpe<=3?1.14:rpe<=4?1.08:rpe<=5?1.02:rpe<=6?.97:rpe<=7?.92:rpe<=8?.86:.80;
  return base*mult;
}
function targetMeters(){
  const swimShare=state.mode==="Grupo"?.64:.72;
  const paceBased=(state.duration*60*swimShare/profilePace())*100;
  const limits=VOLUME_LIMITS[activeProfile.level]?.[state.duration]||VOLUME_LIMITS[activeProfile.level]?.[60]||[1000,2000];
  const energyFactor=ENERGY[state.energy].volume;
  const midpoint=(limits[0]+limits[1])/2;
  const paceAdjusted=midpoint+(paceBased-midpoint)*0.35;
  const goalFactor=(GOALS[activeProfile.goal]||GOALS.General).volume;
  const adaptiveFactor=recentAdaptation();
  const energyAdjusted=paceAdjusted*energyFactor*goalFactor*adaptiveFactor;
  return roundTo(clamp(energyAdjusted,limits[0],limits[1]),state.pool);
}
function eligibleDrills(cat){
  return DRILLS.filter(d=>d.cat===cat&&d.levels.includes(activeProfile.level)&&(!d.gear.length||d.gear.every(g=>state.gear.includes(g))));
}
function chooseDistance(cat,target){
  const level=activeProfile.level,pool=state.pool,focus=state.focus;
  let opts;
  if(cat==="warm"||cat==="cool")opts=level==="Iniciación"?[25,50,100]:[50,100,150,200];
  else if(cat==="tech")opts=level==="Iniciación"?[25,50]:[25,50,100];
  else if(cat==="speed")opts=level==="Iniciación"?[25,50]:[25,50,100];
  else if(state.type==="Resistencia")opts=level==="Iniciación"?[50,100,150,200]:level==="Intermedio"?[100,150,200,300,400]:[100,200,300,400,600,800];
  else opts=level==="Iniciación"?[50,100,150,200]:level==="Intermedio"?[50,100,150,200,300]:[50,100,150,200,300,400];
  opts=opts.filter(d=>d%pool===0&&d<=Math.max(pool,target));
  if(focus==="Corto")opts=opts.filter(d=>d<=100);
  if(focus==="Medio")opts=opts.filter(d=>d>=50&&d<=200);
  if(focus==="Largo")opts=opts.filter(d=>d>=100);
  if(!opts.length)opts=[pool];
  return pick(opts);
}
function restFor(cat,rpe){
  let s=cat==="speed"?30:cat==="tech"?18:cat==="warm"||cat==="cool"?15:22;
  if(rpe>=8)s+=8;if(state.mode==="Grupo")s+=3;
  return s;
}
function createSeries(cat,target){
  const d=chooseDistance(cat,target);
  const reps=clamp(Math.round(target/d),1,cat==="speed"?12:10);
  return {distance:d,reps,total:d*reps};
}
function ladderFor(target){
  const pool=state.pool;
  const options=activeProfile.level==="Iniciación"?[[25,50,75,100,75,50,25],[50,100,150,100,50]]:[[50,100,150,200,150,100,50],[100,200,300,200,100]];
  const valid=options.filter(a=>a.every(x=>x%pool===0));
  if(!valid.length)return null;
  let seq=pick(valid);
  while(seq.reduce((a,b)=>a+b,0)>target*1.35&&seq.length>3)seq=seq.slice(1,-1);
  return {sequence:seq,total:seq.reduce((a,b)=>a+b,0)};
}
function buildBlock(name,cat,target){
  const rows=[];let left=target,guard=0;
  while(left>=state.pool&&guard++<8){
    const useLadder=cat==="main"&&state.focus==="Escalera"&&rows.length===0;
    let struct=useLadder?ladderFor(left):null;
    const drill=pick(eligibleDrills(cat).length?eligibleDrills(cat):eligibleDrills(cat==="cool"?"warm":"main"));
    let rpe=clamp(drill.rpe+ENERGY[state.energy].intensity,cat==="cool"?2:3,cat==="speed"?10:8);
    if(state.energy==="Cansado"&&cat==="speed")rpe=Math.min(8,rpe);
    if(struct){
      rows.push({name:drill.n,cat,sequence:struct.sequence,total:struct.total,rpe,rest:restFor(cat,rpe),how:drill.how,feel:drill.feel,gear:drill.gear});
      left-=struct.total;continue;
    }
    const s=createSeries(cat,left);
    rows.push({name:drill.n,cat,distance:s.distance,reps:s.reps,total:s.total,rpe,rest:restFor(cat,rpe),how:drill.how,feel:drill.feel,gear:drill.gear});
    left-=s.total;
    if(left<state.pool*2)break;
  }
  const meters=rows.reduce((a,r)=>a+r.total,0);
  return {name,cat,rows,meters};
}
function transitionSeconds(from,to,index){
  let base=from.cat==="speed"?45:from.cat==="main"?35:25;
  if(state.mode==="Grupo")base+=15;
  if(to.cat==="cool")base+=10;
  return base+(index%2)*5;
}
function estimateWorkout(blocks,transitions){
  let swim=0,rests=0;
  blocks.forEach(b=>b.rows.forEach(r=>{
    const reps=r.sequence?r.sequence.length:r.reps;
    const meters=r.total;
    swim+=meters/100*effectivePace(r.rpe);
    rests+=Math.max(0,reps-1)*r.rest;
  }));
  const trans=transitions.reduce((a,b)=>a+b,0);
  const org=state.mode==="Grupo"?Math.max(35,state.people/state.lanes*12):20;
  return {swim,rests,trans,org,total:swim+rests+trans+org};
}
function generateWorkout(){
  if(!activeProfile)return null;
  const total=targetMeters(),parts=TYPE_PROFILES[state.type];
  const defs=[
    ["Calentamiento","warm",parts.warm],
    ["Técnica","tech",parts.tech],
    ["Parte principal","main",parts.main],
    ["Velocidad","speed",parts.speed],
    ["Vuelta a la calma","cool",parts.cool]
  ];
  if(state.energy==="Cansado"&&state.type==="Velocidad"){defs[3][2]*=.7;defs[1][2]*=1.15;defs[4][2]*=1.15}
  const blocks=defs.map((x,i)=>buildBlock(x[0],x[1],roundTo(total*x[2],state.pool))).filter(b=>b.meters>0);
  const transitions=blocks.slice(0,-1).map((b,i)=>transitionSeconds(b,blocks[i+1],i));
  const timing=estimateWorkout(blocks,transitions);
  const actual=blocks.reduce((a,b)=>a+b.meters,0);
  const usedGear=[...new Set(blocks.flatMap(b=>b.rows.flatMap(r=>r.gear)))];
  return {
    id:"w_"+Date.now(),createdAt:nowISO(),profileId:activeProfileId,profileName:activeProfile.name,
    level:activeProfile.level,pool:state.pool,mode:state.mode,people:state.people,lanes:state.lanes,
    type:state.type,durationTarget:state.duration,energy:state.energy,focus:state.focus,gear:[...state.gear],
    usedGear,total:actual,blocks,transitions,estimatedSeconds:Math.round(timing.total),pace100:profilePace(),
    goal:activeProfile.goal||"General",adaptation:recentAdaptation()
  };
}

function renderToday(){
  applyProfile();
  const root=$("#todayView");
  if(!activeProfile){
    root.innerHTML='<div class="card"><div class="cardTitle">SWIMLIO 4.0</div><h1 class="headline">Crea tu primer perfil</h1><p class="muted">El perfil define quién entrena. Después, en Hoy, solo eliges cómo quieres entrenar.</p><button class="primary full" id="firstProfile">Crear perfil</button></div>';
    $("#firstProfile").onclick=()=>go("profiles");return;
  }
  root.innerHTML=`
  <div class="profileHero"><div><b>${esc(activeProfile.name)}</b><br><small>${esc(activeProfile.level)} · ${state.mode==="Grupo"?esc(state.people+" nadadores · "+state.lanes+" calles · "):""}${state.pool} m · ${esc(activeProfile.goal||"General")} · ${activeProfile.daysPerWeek||3} días/sem.</small></div><button class="ghost" id="editProfileQuick">Editar</button></div>
  <div class="todayGrid">
    <div class="card">
      <div class="cardTitle">Entrenamiento inteligente</div><h1 class="headline">¿Qué hacemos hoy?</h1>
      <div class="field"><h3>Tipo de entrenamiento</h3><div class="choices" id="typeChoices">${["Técnica","Resistencia","Velocidad","Mixto"].map(x=>`<button data-v="${x}" class="${state.type===x?"on":""}">${x}</button>`).join("")}</div></div>
      <div class="field"><h3>Duración</h3><div class="choices" id="durationChoices">${[30,45,60,75,90].map(x=>`<button data-v="${x}" class="${state.duration===x?"on":""}">${x} min</button>`).join("")}</div></div>
      <div class="field"><h3>¿Cómo estás hoy?</h3><div class="energyGrid" id="energyChoices">
        <button class="energyBtn ${state.energy==="Cansado"?"on":""}" data-v="Cansado"><span>😴</span>Cansado</button>
        <button class="energyBtn ${state.energy==="Normal"?"on":""}" data-v="Normal"><span>🙂</span>Normal</button>
        <button class="energyBtn ${state.energy==="Con energía"?"on":""}" data-v="Con energía"><span>⚡</span>Con energía</button>
      </div><p class="tiny muted">${ENERGY[state.energy].label}. Esto modifica el volumen y la intensidad de hoy.</p></div>
      <div class="field"><h3>Enfoque <span class="muted">· opcional</span></h3><select id="focusSelect"><option>Auto</option><option>Corto</option><option>Medio</option><option>Largo</option><option>Escalera</option></select></div>
      <div class="field"><h3>Material disponible hoy <span class="muted">· opcional</span></h3><div class="choices" id="gearChoices">${["Tabla","Pull buoy","Aletas","Palas","Tubo frontal"].map(x=>`<button data-v="${x}" class="${state.gear.includes(x)?"on":""}">${x==="Pull buoy"?"Pull":x==="Tubo frontal"?"Tubo":x}</button>`).join("")}</div></div>
      <details class="override"><summary>⚙ Cambiar solo para esta sesión</summary><div class="overrideBody">
        <div class="field"><h3>Piscina</h3><div class="choices" id="poolChoices">${[25,50].map(x=>`<button data-v="${x}" class="${state.pool===x?"on":""}">${x} m</button>`).join("")}</div></div>
        <div class="field"><h3>Modo</h3><div class="choices" id="modeChoices">${["Solo","Grupo"].map(x=>`<button data-v="${x}" class="${state.mode===x?"on":""}">${x==="Solo"?"Individual":"Grupo"}</button>`).join("")}</div></div>
        <div id="groupOverride" class="${state.mode==="Grupo"?"":"hidden"}"><div class="formGrid"><label>Nadadores<input id="todayPeople" type="number" min="1" max="40" value="${state.people}"></label><label>Calles<input id="todayLanes" type="number" min="1" max="10" value="${state.lanes}"></label></div></div>
        <button class="secondary full" id="resetProfileDefaults" style="margin-top:10px">Restaurar datos del perfil</button>
      </div></details>
      <button class="primary full" id="generate">Generar entrenamiento →</button>
    </div>
    <div id="workoutMount"></div>
  </div>`;
  $("#focusSelect").value=state.focus;
  bindChoice("#typeChoices",v=>state.type=v);
  bindChoice("#durationChoices",v=>state.duration=+v);
  bindChoice("#energyChoices",v=>{state.energy=v;renderToday()});
  bindMulti("#gearChoices",v=>{state.gear=state.gear.includes(v)?state.gear.filter(x=>x!==v):[...state.gear,v]});
  bindChoice("#poolChoices",v=>state.pool=+v);
  bindChoice("#modeChoices",v=>{state.mode=v;if(v==="Solo"){state.people=1;state.lanes=1}else{state.people=activeProfile.people||8;state.lanes=activeProfile.lanes||2}renderToday()});
  $("#focusSelect").onchange=e=>state.focus=e.target.value;
  $("#todayPeople")?.addEventListener("change",e=>state.people=clamp(+e.target.value||1,1,40));
  $("#todayLanes")?.addEventListener("change",e=>state.lanes=clamp(+e.target.value||1,1,10));
  $("#resetProfileDefaults").onclick=()=>{applyProfile();renderToday()};
  $("#editProfileQuick").onclick=()=>{go("profiles");setTimeout(()=>editProfile(activeProfileId),0)};
  $("#generate").onclick=()=>{lastWorkout=generateWorkout();renderWorkout()};
  if(lastWorkout&&lastWorkout.profileId===activeProfileId)renderWorkout();
}
function bindChoice(sel,cb){const box=$(sel);if(!box)return;box.onclick=e=>{const b=e.target.closest("button[data-v]");if(!b)return;$$("button",box).forEach(x=>x.classList.toggle("on",x===b));cb(b.dataset.v)}}
function bindMulti(sel,cb){const box=$(sel);if(!box)return;box.onclick=e=>{const b=e.target.closest("button[data-v]");if(!b)return;b.classList.toggle("on");cb(b.dataset.v)}}

function exerciseHTML(r){
  const pres=r.sequence?r.sequence.join(" → ")+" m":r.reps+" × "+r.distance+" m";
  const lengths=r.sequence?r.sequence.map(d=>d/state.pool+" largos").join(" → "):(r.distance/state.pool)+" largo"+(r.distance/state.pool===1?"":"s")+" por repetición";
  return `<details class="exercise"><summary><div class="exerciseMain"><div class="prescription">${pres}</div><div><div class="exerciseName">${esc(r.name)}</div><div class="meta">${r.total} m · RPE ${r.rpe}/10 · descanso ${r.rest} s</div></div></div></summary><div class="exerciseDetail"><div><b>Cómo hacerlo:</b> ${esc(r.how)}<br><br><b>Qué debes notar:</b> ${esc(r.feel)}<br><br><b>En esta piscina:</b> ${lengths}.</div></div></details>`;
}
function renderWorkout(){
  const mount=$("#workoutMount");if(!mount||!lastWorkout)return;
  const w=lastWorkout;
  const org=w.mode==="Grupo"?`<div class="simpleNote"><b>Organización del grupo:</b> aprox. ${Math.ceil(w.people/w.lanes)} nadadores por calle. Usa salidas escalonadas de 5–10 s para evitar adelantamientos.</div>`:"";
  mount.innerHTML=`<div class="card">
    <div class="resultHero"><div class="cardTitle">Sesión propuesta</div><h2>${esc(w.type)} · ${w.total} m</h2>
      <span class="tag">${esc(w.level)}</span><span class="tag">${w.pool} m</span><span class="tag">${esc(w.energy)}</span>
      <div class="metrics"><div class="metric"><small>Distancia</small><b>${w.total} m</b></div><div class="metric"><small>Duración estimada</small><b>≈ ${Math.round(w.estimatedSeconds/60)} min</b></div><div class="metric"><small>Material</small><b style="font-size:13px">${w.usedGear.length?esc(w.usedGear.join(", ")):"Sin material"}</b></div></div>
    </div>
    ${org}
    <div class="simpleNote">La duración ya incluye descansos entre repeticiones, transiciones entre bloques y tiempo de organización. Intensidad expresada con RPE de 1 a 10.</div>
    ${w.blocks.map((b,i)=>`<div class="block"><div class="blockHead"><span>${esc(b.name)}</span><span>${b.meters} m</span></div>${b.rows.map(exerciseHTML).join("")}</div>${i<w.transitions.length?`<div class="simpleNote">Descanso antes del siguiente bloque: <b>${w.transitions[i]} s</b></div>`:""}`).join("")}
    <button class="primary full" id="startWorkout">▶ Empezar entrenamiento</button>
    <div class="actionRow"><button class="secondary" id="regenerate">↻ Generar otro</button><button class="ghost" id="favoriteWorkout">♡ Favorito</button></div>
    <div class="actionRow"><button class="ghost" id="shareWorkout">Compartir</button><button class="ghost" id="addPlan">+ Semana</button></div>
  </div>`;
  $("#startWorkout").onclick=()=>startSession(w);
  $("#regenerate").onclick=()=>{lastWorkout=generateWorkout();renderWorkout()};
  $("#favoriteWorkout").onclick=()=>{favorites.unshift({...w,id:"fav_"+Date.now(),savedAt:nowISO()});saveFavorites();toast("Entrenamiento guardado en favoritos")};
  $("#shareWorkout").onclick=()=>shareWorkout(w);
  $("#addPlan").onclick=()=>{addWorkoutToNextPlanSlot(w.type,w.durationTarget);toast("Añadido a la planificación semanal")};
}


function workoutText(w){
  const lines=["SWIMLIO · "+w.type+" · "+w.total+" m","Nivel: "+w.level+" · Piscina: "+w.pool+" m",""];
  w.blocks.forEach(b=>{lines.push(b.name+" · "+b.meters+" m");b.rows.forEach(r=>lines.push("• "+(r.sequence?r.sequence.join("-")+" m":r.reps+"x"+r.distance+" m")+" · "+r.name+" · RPE "+r.rpe+"/10"));lines.push("")});
  return lines.join("\n");
}
async function shareWorkout(w){
  const text=workoutText(w);
  try{
    if(navigator.share){await navigator.share({title:"SWIMLIO · "+w.type,text});return}
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);toast("Entrenamiento copiado");return}
  }catch(e){if(e?.name==="AbortError")return}
  toast("Compartir no está disponible en este dispositivo");
}

function flattenSession(w){
  const items=[];
  w.blocks.forEach((b,bi)=>{
    b.rows.forEach(r=>items.push({kind:"exercise",block:b.name,row:r,meters:r.total}));
    if(bi<w.blocks.length-1)items.push({kind:"transition",block:b.name,next:w.blocks[bi+1].name,seconds:w.transitions[bi],meters:0});
  });
  return items;
}
function startSession(w){
  const existing=safeParse(localStorage.getItem(KEYS.session),null);
  const s={workout:w,items:flattenSession(w),index:0,startedAt:Date.now(),transitionEnd:null,transitionRemaining:null,completedMeters:0,skipped:[],paused:false,pausedAt:null,pausedTotal:0};
  localStorage.setItem(KEYS.session,JSON.stringify(s));
  drawSession(s);
}
function resumeSession(){
  const s=safeParse(localStorage.getItem(KEYS.session),null);
  if(s?.workout?.profileId===activeProfileId)drawSession(s);
}
function saveSession(s){localStorage.setItem(KEYS.session,JSON.stringify(s))}
function drawSession(s){
  $("#overlayRoot").innerHTML="";
  if(s.paused&&s.pausedAt==null)s.pausedAt=Date.now();
  const item=s.items[s.index];
  if(!item){showFinish(s);return}
  const pct=Math.round(s.index/s.items.length*100);
  const remaining=s.workout.total-s.completedMeters;
  let body="";
  if(item.kind==="exercise"){
    s.transitionEnd=null;saveSession(s);
    const r=item.row,pres=r.sequence?r.sequence.join(" → ")+" m":r.reps+" × "+r.distance+" m";
    body=`<div class="sessionBlock">${esc(item.block)} · paso ${s.index+1}/${s.items.length}</div><div class="sessionTitle">${esc(r.name)}</div><div class="sessionPrescription">${pres}</div><div class="sessionInfo"><b>${r.total} m</b> · RPE ${r.rpe}/10 · descanso ${r.rest} s<br><br>${esc(r.how)}<br><br><b>Objetivo:</b> ${esc(r.feel)}</div>`;
  }else{
    if(!s.transitionEnd){s.transitionEnd=Date.now()+item.seconds*1000;saveSession(s)}
    body=`<div class="sessionBlock">Transición · paso ${s.index+1}/${s.items.length}</div><div class="sessionTitle">Descanso entre bloques</div><div class="restTimer" id="restTimer"></div><div class="sessionInfo">Siguiente: <b>${esc(item.next)}</b><br>Bebe, reagrupa y prepara el siguiente bloque.</div>`;
  }
  const ov=document.createElement("div");ov.className="sessionOverlay";
  ov.innerHTML=`<div class="sessionCard"><div class="sessionTop"><b>SWIMLIO · Modo sesión</b><div class="row"><button class="closeBtn" id="pauseSession">${s.paused?"▶":"Ⅱ"}</button><button class="closeBtn" id="closeSession">✕</button></div></div>
    <div class="progressTrack"><i style="width:${pct}%"></i></div><div class="sessionProgress"><span>${s.completedMeters} m hechos</span><span>${remaining} m restantes</span></div>
    ${body}
    ${item.kind==="exercise"?'<button class="ghost full" id="skipSession" style="margin-top:12px">Omitir este ejercicio</button>':""}
    <div class="sessionButtons"><button class="secondary" id="prevSession">← Anterior</button><button class="primary" id="nextSession" ${s.paused?"disabled":""}>${item.kind==="transition"?"Saltar / siguiente →":"✓ Hecho →"}</button></div>
  </div>`;
  $("#overlayRoot").appendChild(ov);
  $("#closeSession").onclick=()=>$("#overlayRoot").innerHTML="";
  $("#pauseSession").onclick=()=>{
    if(!s.paused){
      s.paused=true;s.pausedAt=Date.now();
      if(item.kind==="transition"&&s.transitionEnd)s.transitionRemaining=Math.max(0,s.transitionEnd-Date.now());
    }else{
      const now=Date.now();s.paused=false;s.pausedTotal+=(now-(s.pausedAt||now));s.pausedAt=null;
      if(item.kind==="transition"&&s.transitionRemaining!=null){s.transitionEnd=Date.now()+s.transitionRemaining;s.transitionRemaining=null}
    }
    saveSession(s);drawSession(s);
  };
  $("#prevSession").onclick=()=>{if(s.index>0){const prev=s.items[s.index-1];if(prev?.kind==="exercise"&&!s.skipped.includes(s.index-1))s.completedMeters=Math.max(0,s.completedMeters-prev.meters);s.index--;s.transitionEnd=null;saveSession(s);drawSession(s)}};
  $("#skipSession")?.addEventListener("click",()=>{if(!s.skipped.includes(s.index))s.skipped.push(s.index);s.index++;s.transitionEnd=null;saveSession(s);drawSession(s)});
  $("#nextSession").onclick=()=>{if(s.paused)return;if(item.kind==="exercise")s.completedMeters=Math.min(s.workout.total,s.completedMeters+item.meters);s.index++;s.transitionEnd=null;saveSession(s);drawSession(s)};
  if(item.kind==="transition"&&!s.paused)runRestTimer(s);
}
let restTicker=null;
function runRestTimer(s){
  clearInterval(restTicker);
  const tick=()=>{
    const el=$("#restTimer");if(!el){clearInterval(restTicker);return}
    const left=Math.max(0,Math.ceil((s.transitionEnd-Date.now())/1000));
    el.textContent=left>0?fmtClock(left):"¡Listo!";
    if(left<=0)clearInterval(restTicker);
  };
  tick();restTicker=setInterval(tick,500);
}
function showFinish(s){
  clearInterval(restTicker);
  const pauseNow=s.paused&&s.pausedAt?Date.now()-s.pausedAt:0;
  const elapsed=Math.max(1,Math.round((Date.now()-s.startedAt-(s.pausedTotal||0)-pauseNow)/60000));
  $("#overlayRoot").innerHTML=`<div class="finishOverlay"><div class="finishCard">
    <div class="finishIcon">🏊</div><h2>Entrenamiento completado</h2><p class="muted">Buen trabajo. Guarda cómo ha ido para que SWIMLIO ajuste las próximas sesiones.</p>
    <div class="finishMetrics"><div><b>${s.completedMeters} m</b><br><small>realizados</small></div><div><b>${elapsed} min</b><br><small>tiempo real</small></div></div>
    <h3>¿Cómo te has sentido?</h3><div class="ratingGrid" id="finishRating">${["Muy fácil","Bien","Difícil","Demasiado"].map((x,i)=>`<button data-v="${x}">${["😴","🙂","🥵","☠️"][i]} ${x}</button>`).join("")}</div>
    <h3>¿Lo terminaste completo?</h3><div class="completeToggle" id="finishComplete"><button class="on" data-v="true">Sí</button><button data-v="false">No</button></div>
    <label class="noteField">Nota opcional<textarea id="finishNote" rows="3" placeholder="Ej. Me costaron las últimas series..."></textarea></label>
    <button class="primary full" id="saveFinish" disabled>Guardar entrenamiento</button>
  </div></div>`;
  let rating=null,complete=true;
  bindChoice("#finishRating",v=>{rating=v;$("#saveFinish").disabled=false});
  bindChoice("#finishComplete",v=>complete=v==="true");
  $("#saveFinish").onclick=()=>{
    const w=s.workout;
    history.unshift({id:"h_"+Date.now(),profileId:w.profileId,date:nowISO(),type:w.type,total:s.completedMeters||w.total,plannedTotal:w.total,actualMinutes:elapsed,estimatedSeconds:w.estimatedSeconds,rating,completed:complete,level:w.level,energy:w.energy,pool:w.pool,note:$("#finishNote")?.value.trim()||"",skippedCount:(s.skipped||[]).length});
    saveHistory();localStorage.removeItem(KEYS.session);lastWorkout=null;$("#overlayRoot").innerHTML="";markPlanDoneForToday(w.type);toast("Entrenamiento guardado");go("history");
  };
}

function weekKey(date=new Date()){
  const d=new Date(date);d.setHours(12,0,0,0);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return d.toISOString().slice(0,10);
}
function weekDates(){
  const start=new Date(weekKey()+"T12:00:00");return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return d});
}
function makeWeekPlan(){
  const k=weekKey(),dates=weekDates(),days=clamp(activeProfile?.daysPerWeek||3,2,5);
  const recent=history.filter(h=>h.profileId===activeProfileId).slice(0,5);
  const hard=recent.filter(h=>["Difícil","Demasiado"].includes(h.rating)||h.completed===false).length;
  const base=(GOALS[activeProfile?.goal]||GOALS.General).plan;
  const recovery=hard>=2;
  const slotMap={2:[1,4],3:[1,3,5],4:[0,2,4,6],5:[0,1,3,4,6]};
  const slots=slotMap[days]||slotMap[3];
  const items=slots.map((di,i)=>{
    let type=base[i%base.length];
    if(recovery&&i===0)type="Técnica";
    if(i>0&&["Velocidad","Resistencia"].includes(type)&&["Velocidad","Resistencia"].includes(base[(i-1)%base.length]))type="Mixto";
    const duration=activeProfile.level==="Iniciación"?(i===1?60:45):(i%2?60:45);
    return {id:"p_"+Date.now()+"_"+i,date:dates[di].toISOString().slice(0,10),type,duration,done:false};
  });
  plans[k]={profileId:activeProfileId,goal:activeProfile.goal||"General",items};
  savePlans();return plans[k];
}
function currentPlan(){const k=weekKey();const p=plans[k];return p?.profileId===activeProfileId?p:null}
function addWorkoutToNextPlanSlot(type,duration){
  let p=currentPlan()||makeWeekPlan();const dates=weekDates(),today=new Date().toISOString().slice(0,10);
  const free=dates.find(d=>d.toISOString().slice(0,10)>=today&&!p.items.some(i=>i.date===d.toISOString().slice(0,10)));
  const date=(free||dates[6]).toISOString().slice(0,10);p.items.push({id:"p_"+Date.now(),date,type,duration,done:false});savePlans();
}
function markPlanDoneForToday(type){
  const p=currentPlan();if(!p)return;const today=new Date().toISOString().slice(0,10);const item=p.items.find(i=>i.date===today&&i.type===type&&!i.done)||p.items.find(i=>!i.done&&i.type===type);if(item){item.done=true;savePlans()}
}
function renderPlan(){
  const root=$("#planView");
  if(!activeProfile){root.innerHTML='<div class="card"><h2>Planificación semanal</h2><p class="muted">Selecciona un perfil primero.</p></div>';return}
  const p=currentPlan()||makeWeekPlan();
  root.innerHTML=`<div class="card"><div class="cardTitle">Planificación adaptativa</div><h1 class="headline">Esta semana</h1><p class="muted small"><b>Objetivo:</b> ${esc(activeProfile.goal||"General")} · ${activeProfile.daysPerWeek||3} días. La distribución evita encadenar cargas altas y baja la exigencia si las últimas sesiones fueron difíciles o incompletas.</p>
    <div id="planItems">${p.items.sort((a,b)=>a.date.localeCompare(b.date)).map(i=>{const d=new Date(i.date+"T12:00:00");return `<div class="planDay ${i.done?"done":""}"><div class="dayBadge">${dayNames[d.getDay()]}<br>${d.getDate()}</div><div><b>${esc(i.type)}</b><br><small class="muted">${i.duration} min ${i.done?"· completado":""}</small></div><button class="ghost" data-planuse="${i.id}">${i.done?"Repetir":"Usar hoy"}</button></div>`}).join("")}</div>
    <div class="actionRow"><button class="secondary" id="regenPlan">↻ Rehacer semana</button><button class="ghost" id="clearPlan">Vaciar</button></div>
  </div>`;
  $$("[data-planuse]").forEach(b=>b.onclick=()=>{const i=p.items.find(x=>x.id===b.dataset.planuse);state.type=i.type;state.duration=i.duration;go("today");toast("Sesión cargada para hoy")});
  $("#regenPlan").onclick=()=>{delete plans[weekKey()];savePlans();makeWeekPlan();renderPlan()};
  $("#clearPlan").onclick=()=>{plans[weekKey()]={profileId:activeProfileId,items:[]};savePlans();renderPlan()};
}

function renderHistory(){
  const root=$("#historyView");
  if(!activeProfile){root.innerHTML='<div class="card"><h2>Historial</h2><p class="muted">Selecciona un perfil primero.</p></div>';return}
  const mine=history.filter(h=>h.profileId===activeProfileId);
  const cutoff=Date.now()-7*86400000;
  const week=mine.filter(h=>new Date(h.date).getTime()>=cutoff);
  const meters=week.reduce((a,h)=>a+(+h.total||0),0);
  const mins=week.reduce((a,h)=>a+(+h.actualMinutes||Math.round((h.estimatedSeconds||0)/60)),0);
  const avg=week.length?Math.round(mins/week.length):0;
  const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-(6-i));const k=d.toISOString().slice(0,10);return {date:d,label:dayNames[d.getDay()],m:mine.filter(h=>h.date?.slice(0,10)===k).reduce((a,h)=>a+(+h.total||0),0)}});
  const max=Math.max(1,...days.map(d=>d.m));
  const fourWeeks=Array.from({length:4},(_,i)=>{
    const end=Date.now()-i*7*86400000,start=end-7*86400000;
    const hs=mine.filter(h=>{const t=new Date(h.date).getTime();return t>=start&&t<end});
    return {label:"S"+(4-i),meters:hs.reduce((a,h)=>a+(+h.total||0),0),sessions:hs.length};
  }).reverse();
  const max4=Math.max(1,...fourWeeks.map(x=>x.meters));
  const completed=mine.filter(h=>h.completed!==false).length;
  const adherence=mine.length?Math.round(completed/mine.length*100):0;
  const typeCounts=["Técnica","Resistencia","Velocidad","Mixto"].map(t=>[t,mine.filter(h=>h.type===t).length]);
  root.innerHTML=`<div class="card"><div class="cardTitle">Progreso</div><h1 class="headline">Historial</h1>
    <div class="historyStats"><div><b>${meters.toLocaleString("es-ES")} m</b><small>últimos 7 días</small></div><div><b>${week.length}</b><small>sesiones</small></div><div><b>${avg} min</b><small>media/sesión</small></div></div>
    <div class="barChart">${days.map(d=>`<div class="barCol"><div class="bar" style="height:${Math.max(3,d.m/max*90)}px" title="${d.m} m"></div><small>${d.label}</small></div>`).join("")}</div>
  </div>
  <div class="card"><div class="cardTitle">Tendencia</div><h2 style="margin-top:4px">Últimas 4 semanas</h2>
    <div class="historyStats"><div><b>${adherence}%</b><small>completadas</small></div><div><b>${mine.length}</b><small>sesiones totales</small></div><div><b>${typeCounts.sort((a,b)=>b[1]-a[1])[0]?.[0]||"—"}</b><small>tipo más frecuente</small></div></div>
    <div class="barChart">${fourWeeks.map(x=>`<div class="barCol"><div class="bar" style="height:${Math.max(3,x.meters/max4*90)}px" title="${x.meters} m"></div><small>${x.label}</small></div>`).join("")}</div>
  </div>
  <div class="card"><h2 style="margin-top:0">Favoritos</h2>${favorites.filter(x=>x.profileId===activeProfileId).length?favorites.filter(x=>x.profileId===activeProfileId).slice(0,6).map(x=>`<div class="historyItem"><b>${esc(x.type)} · ${x.total} m</b><br><small class="muted">${x.durationTarget} min · ${new Date(x.savedAt||x.createdAt).toLocaleDateString("es-ES")}</small><div class="actionRow"><button class="ghost" data-use-favorite="${x.id}">Usar hoy</button><button class="dangerBtn" data-del-favorite="${x.id}">Eliminar</button></div></div>`).join(""):'<p class="muted">Aún no has guardado entrenamientos favoritos.</p>'}</div>
  <div class="card"><h2 style="margin-top:0">Sesiones</h2>${mine.length?mine.slice(0,30).map(h=>`<div class="historyItem"><div class="historyTop"><div><b>${esc(h.type)}</b><br><small class="muted">${new Date(h.date).toLocaleDateString("es-ES")} · ${h.total} m · ${h.actualMinutes||Math.round((h.estimatedSeconds||0)/60)} min</small></div><span class="tag">${esc(h.rating||"Sin valorar")}</span></div><div class="actionRow"><button class="ghost" data-edit-history="${h.id}">Editar</button><button class="dangerBtn" data-del-history="${h.id}">Eliminar</button></div></div>`).join(""):'<p class="muted">Todavía no hay sesiones guardadas.</p>'}</div>`;
  $$("[data-del-history]").forEach(b=>b.onclick=()=>{history=history.filter(h=>h.id!==b.dataset.delHistory);saveHistory();renderHistory()});
  $("[data-edit-history]").forEach(b=>b.onclick=()=>editHistory(b.dataset.editHistory));
  $("[data-use-favorite]").forEach(b=>b.onclick=()=>{const fav=favorites.find(x=>x.id===b.dataset.useFavorite);if(fav){lastWorkout={...fav,id:"w_"+Date.now(),createdAt:nowISO()};state.type=fav.type;state.duration=fav.durationTarget||60;state.pool=fav.pool||activeProfile.pool;go("today");toast("Favorito cargado")}});
  $("[data-del-favorite]").forEach(b=>b.onclick=()=>{favorites=favorites.filter(x=>x.id!==b.dataset.delFavorite);saveFavorites();renderHistory()});
}
function editHistory(id){
  const h=history.find(x=>x.id===id);if(!h)return;
  $("#overlayRoot").innerHTML=`<div class="modalOverlay"><div class="modalCard"><div class="sessionTop"><b>Editar sesión</b><button class="closeBtn" id="closeModal">✕</button></div><div class="formGrid" style="margin-top:18px"><label>Fecha<input id="ehDate" type="date" value="${h.date.slice(0,10)}"></label><label>Metros<input id="ehMeters" type="number" min="0" step="25" value="${h.total}"></label><label>Duración (min)<input id="ehMins" type="number" min="1" value="${h.actualMinutes||Math.round((h.estimatedSeconds||0)/60)}"></label><label>Valoración<select id="ehRating">${["Muy fácil","Bien","Difícil","Demasiado"].map(x=>`<option ${h.rating===x?"selected":""}>${x}</option>`).join("")}</select></label></div><button class="primary full" id="saveHistoryEdit" style="margin-top:14px">Guardar cambios</button></div></div>`;
  $("#closeModal").onclick=()=>$("#overlayRoot").innerHTML="";
  $("#saveHistoryEdit").onclick=()=>{h.date=new Date($("#ehDate").value+"T12:00:00").toISOString();h.total=+$("#ehMeters").value;h.actualMinutes=+$("#ehMins").value;h.rating=$("#ehRating").value;saveHistory();$("#overlayRoot").innerHTML="";renderHistory()};
}

function renderProfiles(){
  const root=$("#profilesView");
  root.innerHTML=`<div class="card"><div class="cardTitle">Tu espacio</div><h1 class="headline">Perfiles</h1><p class="muted small">El perfil guarda datos estables: nivel, piscina, modo, ritmo, objetivo y frecuencia semanal. El material se elige solo cuando preparas la sesión.</p>
    <div id="profileList">${profiles.length?profiles.map(p=>`<div class="profileCard ${p.id===activeProfileId?"active":""}"><b>${esc(p.name)}</b><br><small class="muted">${esc(p.level)} · ${p.pool} m · ${p.mode==="Solo"?"Individual":"Grupo"+(" · "+p.people+" nad. · "+p.lanes+" calles")}${p.pace100?" · "+p.pace100+" s/100 m":""} · ${esc(p.goal||"General")} · ${p.daysPerWeek||3} días/sem.</small><div class="actions">${p.id!==activeProfileId?`<button class="secondary" data-use-profile="${p.id}">Usar</button>`:""}<button class="ghost" data-edit-profile="${p.id}">Editar</button><button class="dangerBtn" data-del-profile="${p.id}">Eliminar</button></div></div>`).join(""):'<p class="muted">Aún no hay perfiles.</p>'}</div>
    <button class="primary full" id="newProfile">+ Crear perfil</button>
    <div class="actionRow"><button class="ghost" id="exportData">Exportar copia</button><button class="ghost" id="importData">Importar copia</button></div>
    <input id="importFile" class="hidden" type="file" accept="application/json">
  </div>`;
  $$("[data-use-profile]").forEach(b=>b.onclick=()=>{activeProfileId=b.dataset.useProfile;saveProfiles();applyProfile();lastWorkout=null;renderProfiles();toast("Perfil activo cambiado")});
  $$("[data-edit-profile]").forEach(b=>b.onclick=()=>editProfile(b.dataset.editProfile));
  $$("[data-del-profile]").forEach(b=>b.onclick=()=>{const id=b.dataset.delProfile;if(!confirm("¿Eliminar este perfil y su historial?"))return;profiles=profiles.filter(p=>p.id!==id);history=history.filter(h=>h.profileId!==id);if(activeProfileId===id)activeProfileId=profiles[0]?.id||null;saveProfiles();saveHistory();applyProfile();renderProfiles()});
  $("#newProfile").onclick=()=>editProfile(null);
  $("#exportData").onclick=exportBackup;
  $("#importData").onclick=()=>$("#importFile").click();
  $("#importFile").onchange=e=>importBackup(e.target.files?.[0]);
}
function editProfile(id){
  const p=id?profiles.find(x=>x.id===id):null;
  const v=p||{name:"",level:"Iniciación",pool:25,mode:"Solo",pace100:"",people:8,lanes:2,goal:"General",daysPerWeek:3};
  $("#overlayRoot").innerHTML=`<div class="modalOverlay"><div class="modalCard"><div class="sessionTop"><b>${p?"Editar":"Crear"} perfil</b><button class="closeBtn" id="closeProfileModal">✕</button></div>
    <div class="formGrid" style="margin-top:18px">
      <label>Nombre<input id="pfName" maxlength="30" value="${esc(v.name)}" placeholder="Ej. Ignacio"></label>
      <label>Nivel<select id="pfLevel">${["Iniciación","Intermedio","Avanzado"].map(x=>`<option ${v.level===x?"selected":""}>${x}</option>`).join("")}</select></label>
      <label>Piscina habitual<select id="pfPool"><option value="25" ${+v.pool===25?"selected":""}>25 m</option><option value="50" ${+v.pool===50?"selected":""}>50 m</option></select></label>
      <label>Modo<select id="pfMode"><option value="Solo" ${v.mode==="Solo"?"selected":""}>Individual</option><option value="Grupo" ${v.mode==="Grupo"?"selected":""}>Grupo</option></select></label>
      <label>Ritmo cómodo 100 m (s)<input id="pfPace" type="number" min="60" max="300" value="${v.pace100||""}" placeholder="Opcional"></label>
      <label>Objetivo<select id="pfGoal">${Object.keys(GOALS).map(x=>`<option ${v.goal===x?"selected":""}>${x}</option>`).join("")}</select></label>
      <label>Días por semana<select id="pfDays">${[2,3,4,5].map(x=>`<option value="${x}" ${+v.daysPerWeek===x?"selected":""}>${x} días</option>`).join("")}</select></label>
      <label class="pfGroup">Nadadores<input id="pfPeople" type="number" min="1" max="40" value="${v.people||8}"></label>
      <label class="pfGroup">Calles<input id="pfLanes" type="number" min="1" max="10" value="${v.lanes||2}"></label>
    </div><p class="tiny muted">El ritmo es opcional. Si lo indicas, SWIMLIO lo usa para calcular mejor la distancia y la duración.</p><button class="primary full" id="saveProfileModal">Guardar perfil</button>
  </div></div>`;
  const toggleGroup=()=>$$(".pfGroup").forEach(x=>x.style.display=$("#pfMode").value==="Grupo"?"block":"none");toggleGroup();$("#pfMode").onchange=toggleGroup;
  $("#closeProfileModal").onclick=()=>$("#overlayRoot").innerHTML="";
  $("#saveProfileModal").onclick=()=>{
    const data={name:$("#pfName").value.trim()||"Mi perfil",level:$("#pfLevel").value,pool:+$("#pfPool").value,mode:$("#pfMode").value,pace100:+$("#pfPace").value||null,people:+$("#pfPeople").value||8,lanes:+$("#pfLanes").value||2,goal:$("#pfGoal").value,daysPerWeek:+$("#pfDays").value||3};
    if(p)Object.assign(p,data);else{const n={id:"p_"+Date.now(),...data};profiles.push(n);activeProfileId=n.id}
    saveProfiles();applyProfile();lastWorkout=null;$("#overlayRoot").innerHTML="";renderProfiles();toast("Perfil guardado");
  };
}


function exportBackup(){
  const payload={version:VERSION,exportedAt:nowISO(),profiles,activeProfileId,history,plans,favorites};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="swimlio-backup-"+new Date().toISOString().slice(0,10)+".json";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),500);toast("Copia de seguridad preparada");
}
async function importBackup(file){
  if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    if(!Array.isArray(data.profiles)||!Array.isArray(data.history))throw new Error("Formato no válido");
    profiles=data.profiles;history=data.history;plans=data.plans||{};favorites=data.favorites||[];activeProfileId=data.activeProfileId||profiles[0]?.id||null;
    normalizeProfiles();saveHistory();savePlans();saveFavorites();applyProfile();lastWorkout=null;toast("Copia importada");renderProfiles();
  }catch(e){toast("No se pudo importar la copia")}
}

document.addEventListener("visibilitychange",()=>{if(!document.hidden){const s=safeParse(localStorage.getItem(KEYS.session),null);if($(".sessionOverlay")&&s)drawSession(s)}});

if("serviceWorker" in navigator&&location.protocol.startsWith("http"))window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));

go("today");
setTimeout(resumeSession,200);
