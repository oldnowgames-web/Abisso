window.__err=function(m){try{console.warn('[ABISSO] '+m);}catch(e){}};
window.addEventListener('error',function(e){window.__err('ERRO: '+e.message+' (linha '+e.lineno+')');});

(function(){
'use strict';
/* ============================================================
   0 · UTILITÁRIOS
   ============================================================ */
const TAU=Math.PI*2,PI=Math.PI;
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const rnd=(a,b)=>a+Math.random()*(b-a);
const rint=(a,b)=>Math.floor(a+Math.random()*(b-a+1));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const dist=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
const angLerp=(a,b,t)=>{let d=((b-a+PI)%TAU+TAU)%TAU-PI;return a+d*t;};
const fmt=n=>Math.round(n).toLocaleString('pt-BR');
const $=id=>document.getElementById(id);
const store={get(k,d){try{const v=localStorage.getItem('abisso2.'+k);return v===null?d:JSON.parse(v);}catch(e){return d;}},
  set(k,v){try{localStorage.setItem('abisso2.'+k,JSON.stringify(v));}catch(e){}}};
const C={abyss:'#02070d',deep:'#0a2233',petrol:'#0e3a52',teal:'#19c8d8',bio:'#8dff45',magenta:'#ff2e88',
  amber:'#ffb020',electric:'#3b82ff',crimson:'#ff3b57',violet:'#a855f7',sand:'#f2e6d2',slate:'#7fa3b8',info:'#4fc3ff',white:'#ffffff'};
function rgb(hex){const h=hex.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function rgba(hex,a){const c=rgb(hex);return'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')';}
function mix(h1,h2,t){const a=rgb(h1),b=rgb(h2);return'rgb('+Math.round(a[0]+(b[0]-a[0])*t)+','+Math.round(a[1]+(b[1]-a[1])*t)+','+Math.round(a[2]+(b[2]-a[2])*t)+')';}
function segDist(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1;const l=dx*dx+dy*dy;if(!l)return dist(px,py,x1,y1);
  let t=((px-x1)*dx+(py-y1)*dy)/l;t=clamp(t,0,1);return dist(px,py,x1+t*dx,y1+t*dy);}

/* ============================================================
   1 · AJUSTES PERSISTENTES
   ============================================================ */
const DEFSET={master:80,music:60,sfx:75,shake:100,parts:100,glow:100,contrast:false,motion:false,arrows:true,speed:1,muted:false,light:true};
let SET=Object.assign({},DEFSET,store.get('settings',{}));
let difficulty=store.get('diff','normal'),mode=store.get('mode','campanha');
const DIFF={calmo:{hp:.8,spd:.9,count:.8,score:.8,iframe:1.25,cap:24,label:'CALMO'},
  normal:{hp:1,spd:1,count:1,score:1,iframe:1,cap:32,label:'NORMAL'},
  abissal:{hp:1.35,spd:1.12,count:1.3,score:1.6,iframe:.8,cap:40,label:'ABISSAL'}};
let best=store.get('best',0),bestWave=store.get('bestWave',0),runs=store.get('runs',[]),seen=store.get('seen',{}),
  totals=store.get('totals',{runs:0,kills:0,plankton:0,time:0,combo:0});

/* ============================================================
   2 · ÁUDIO
   ============================================================ */
let MUSIC_EXTERNAL=false;
const Snd={ctx:null,master:null,music:null,sfx:null,noise:null,ambGain:null,ready:false,nextBar:0,bar:0,
  init(){
    if(this.ctx)return;
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    try{this.ctx=new AC();}catch(e){return;}
    const c=this.ctx;
    this.master=c.createGain();this.master.gain.value=SET.muted?0:SET.master/100*.9;
    const comp=c.createDynamicsCompressor();comp.threshold.value=-14;comp.knee.value=22;comp.ratio.value=7;comp.attack.value=.004;comp.release.value=.22;
    this.master.connect(comp);comp.connect(c.destination);
    this.music=c.createGain();this.music.gain.value=SET.music/100*.90;this.music.connect(this.master);
    this.sfx=c.createGain();this.sfx.gain.value=SET.sfx/100*.75;this.sfx.connect(this.master);
    const len=Math.floor(c.sampleRate*2),buf=c.createBuffer(1,len,c.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
    this.noise=buf;
    const src=c.createBufferSource();src.buffer=buf;src.loop=true;
    const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=330;f.Q.value=.7;
    const g=c.createGain();g.gain.value=.07;this.ambGain=g;
    const lfo=c.createOscillator();lfo.frequency.value=.06;const lg=c.createGain();lg.gain.value=.04;
    lfo.connect(lg);lg.connect(g.gain);lfo.start();
    src.connect(f);f.connect(g);g.connect(this.music);src.start();
    this.ready=true;this.nextBar=c.currentTime+.15;this.applyVolumes();
  },
  resume(){if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume();},
  applyVolumes(){if(!this.ready)return;const t=this.ctx.currentTime;
    this.master.gain.setTargetAtTime(SET.muted?0:SET.master/100*.9,t,.05);
    this.music.gain.setTargetAtTime(SET.music/100*.90,t,.05);
    this.sfx.gain.setTargetAtTime(SET.sfx/100*.75,t,.05);if(typeof Music!=='undefined')Music.syncVolume();},
  setMuted(m){SET.muted=m;saveSet();this.applyVolumes();syncAudioUI();},
  tone(freq,dur,type,gain,freq2,delay,dest){
    if(!this.ready||SET.muted)return;
    const c=this.ctx,t=c.currentTime+(delay||0);
    const o=c.createOscillator();o.type=type||'sine';o.frequency.setValueAtTime(freq,t);
    if(freq2)o.frequency.exponentialRampToValueAtTime(Math.max(24,freq2),t+dur);
    const g=c.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(gain,t+.01);
    g.gain.exponentialRampToValueAtTime(.0008,t+dur);
    o.connect(g);g.connect(dest||this.sfx);o.start(t);o.stop(t+dur+.03);},
  nz(dur,freq,gain,type,delay,freq2){
    if(!this.ready||SET.muted)return;
    const c=this.ctx,t=c.currentTime+(delay||0);
    const s=c.createBufferSource();s.buffer=this.noise;
    const f=c.createBiquadFilter();f.type=type||'bandpass';f.frequency.setValueAtTime(freq,t);f.Q.value=1.1;
    if(freq2)f.frequency.exponentialRampToValueAtTime(Math.max(40,freq2),t+dur);
    const g=c.createGain();g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0008,t+dur);
    s.connect(f);f.connect(g);g.connect(this.sfx);s.start(t);s.stop(t+dur+.03);},
  shoot(){this.tone(rnd(600,700),.05,'triangle',.03,300);},
  hit(){this.nz(.05,2400,.045);},
  kill(big){this.tone(big?200:340,big?.4:.2,'sine',big?.15:.09,big?60:100);this.nz(big?.34:.16,big?700:1100,big?.13:.07,'bandpass',0,300);},
  dash(){this.nz(.3,300,.13,'bandpass',0,2200);this.tone(180,.22,'sine',.06,520);},
  pickup(){this.tone(rnd(900,1150),.06,'sine',.045,1500);},
  heal(){this.tone(520,.14,'sine',.08,780);this.tone(780,.2,'sine',.06,1040,.07);},
  power(){[660,880,1320].forEach((f,i)=>this.tone(f,.24,'triangle',.08,null,i*.06));},
  hurt(){this.tone(150,.4,'sawtooth',.19,52);this.nz(.32,260,.17,'lowpass');},
  nova(){this.tone(160,.75,'sawtooth',.15,1500);this.nz(.7,500,.15,'bandpass',0,4000);this.tone(880,.6,'sine',.07,220,.05);},
  wave(){[523,659,784,1047].forEach((f,i)=>this.tone(f,.3,'triangle',.08,null,i*.09));},
  up(){[392,523,784].forEach((f,i)=>this.tone(f,.5,'sine',.09,null,i*.06));},
  boss(){this.tone(64,1.6,'sawtooth',.2,42);this.nz(1.4,180,.15,'lowpass');this.tone(96,1.2,'square',.05,70,.1);},
  zap(){this.nz(.28,3200,.14,'highpass',0,600);this.tone(1400,.2,'square',.06,180);},
  vent(){this.nz(.7,220,.13,'lowpass',0,900);},
  beat(){this.tone(52,.16,'sine',.16,40);this.tone(48,.2,'sine',.11,36,.17);},
  hover(){this.tone(880,.04,'sine',.025,1100);},
  click(){this.tone(520,.08,'triangle',.06,760);},
  lose(){[440,330,262,175].forEach((f,i)=>this.tone(f,.6,'sawtooth',.11,f*.6,i*.16));},
  win(){[523,659,784,1047,1319].forEach((f,i)=>this.tone(f,.7,'triangle',.1,null,i*.13));},
  sonar(){this.tone(1250,1.4,'sine',.045,880);},
  tick(){if(!this.ready||SET.muted||MUSIC_EXTERNAL)return;const c=this.ctx;
    if(this.nextBar<c.currentTime-1)this.nextBar=c.currentTime+.1;
    while(this.nextBar<c.currentTime+.6){this.scheduleBar(this.nextBar);this.nextBar+=4.2;}},
  scheduleBar(t){
    const chords=[[110,164.81,220,261.63],[98,146.83,196,246.94],[87.31,130.81,174.61,207.65],[103.83,155.56,207.65,246.94]];
    const ch=chords[this.bar%chords.length];this.bar++;const c=this.ctx;
    ch.forEach((f,i)=>{
      const o=c.createOscillator();o.type=i%2?'triangle':'sawtooth';o.frequency.value=f*(i===0?1:1+(i-2)*.0016);
      const flt=c.createBiquadFilter();flt.type='lowpass';flt.frequency.setValueAtTime(400,t);
      flt.frequency.linearRampToValueAtTime(880,t+2);flt.frequency.linearRampToValueAtTime(360,t+4.2);
      const g=c.createGain();g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(i===0?.07:.034,t+1.3);
      g.gain.exponentialRampToValueAtTime(.0008,t+4.15);
      o.connect(flt);flt.connect(g);g.connect(this.music);o.start(t);o.stop(t+4.25);});
    if(this.bar%2===0){const o=c.createOscillator();o.type='sine';o.frequency.setValueAtTime(1250,t+.3);
      o.frequency.exponentialRampToValueAtTime(880,t+1.9);
      const g=c.createGain();g.gain.setValueAtTime(.0001,t+.3);g.gain.linearRampToValueAtTime(.045,t+.34);
      g.gain.exponentialRampToValueAtTime(.0006,t+2.1);
      o.connect(g);g.connect(this.music);o.start(t+.3);o.stop(t+2.2);}}
 };

/* ============================================================
   2B · TRILHA MUSICAL DO ABISSO
   MP3s enviados para as ondas 2–12; Web Audio para as faixas ausentes.
   ============================================================ */
const Music={
  files:{
    2:'audio/onda2_abisso.mp3',3:'audio/onda3_abisso.mp3',
    4:'audio/onda4_abisso.mp3',5:'audio/onda5_abisso.mp3',
    6:'audio/onda6_abisso.mp3',7:'audio/onda7__abisso.mp3',
    8:'audio/onda8_abisso.mp3',9:'audio/onda9_abisso.mp3',
    10:'audio/onda10_abisso.mp3',11:'audio/onda11_abisso.mp3',
    12:'audio/onda12_abisso.mp3'
  },
  players:[],web:null,webGain:null,paused:false,active:'none',
  presets:{
    title:{bar:5.6,duration:22.4,next:'menu',level:.82,motif:true,pulse:false,
      chords:[[55,82.4,110,164.8],[49,73.4,98,146.8],[43.65,65.4,87.3,130.8],[51.9,77.8,103.8,155.6]]},
    menu:{bar:9.2,level:.65,motif:true,pulse:false,
      chords:[[55,82.4,110,164.8],[49,73.4,98,146.8],[43.65,65.4,87.3,130.8],[51.9,77.8,103.8,155.6]]},
    descent:{bar:1.45,duration:1.5,level:1.25,motif:false,pulse:true,
      chords:[[41.2,61.7,82.4,123.5]]},
    wave1:{bar:8.4,level:.78,motif:true,pulse:true,
      chords:[[55,82.4,110,164.8],[49,73.4,98,146.8],[43.65,65.4,87.3,130.8],[51.9,77.8,103.8,155.6]]},
    upgrade:{bar:7.8,level:.58,motif:true,pulse:false,
      chords:[[65.4,98,130.8,196],[58.3,87.3,116.5,174.6],[55,82.4,110,164.8],[61.7,92.5,123.5,185]]},
    training:{bar:9.5,level:.52,motif:true,pulse:false,
      chords:[[65.4,98,130.8,196],[58.3,87.3,116.5,174.6],[55,82.4,110,164.8],[61.7,92.5,123.5,185]]},
    endless:{bar:5.8,level:.9,motif:true,pulse:true,
      chords:[[36.7,55,73.4,110],[34.65,51.9,69.3,103.8],[32.7,49,65.4,98],[38.9,58.3,77.8,116.5]]},
    over:{bar:6.4,duration:22,level:.8,motif:true,pulse:false,
      chords:[[55,82.4,110,164.8],[51.9,77.8,103.8,155.6],[49,73.4,98,146.8],[43.65,65.4,87.3,130.8]]},
    win:{bar:6.2,duration:27,level:.88,motif:true,pulse:false,
      chords:[[65.4,98,130.8,196],[73.4,110,146.8,220],[82.4,123.5,164.8,246.9],[73.4,110,146.8,220]]}
  },
  volume(){return SET.muted?0:Math.max(0,Math.min(1,(SET.master/100)*(SET.music/100)*1.85));},
  syncVolume(){const v=this.volume();this.players.forEach(p=>{if(!p.fadingOut)p.target=v;});},
  setAmbient(on){if(Snd.ambGain&&Snd.ctx){const t=Snd.ctx.currentTime;Snd.ambGain.gain.setTargetAtTime(on ? .035 : 0,t,.35);}},
  fadePlayers(){this.players.forEach(p=>{p.fadingOut=true;p.target=0;});},
  fadeWeb(){if(this.webGain&&Snd.ctx){const t=Snd.ctx.currentTime;this.webGain.gain.cancelScheduledValues(t);this.webGain.gain.setTargetAtTime(0,t,.25);}this.web=null;},
  init(){Snd.init();Snd.resume();MUSIC_EXTERNAL=true;},
  playFile(n){
    const path=this.files[n];if(!path){this.playWeb(n===1?'wave1':'endless');return;}
    this.init();this.fadePlayers();this.fadeWeb();this.setAmbient(false);this.paused=false;
    const a=new Audio(path);a.loop=true;a.preload='auto';a.volume=0;
    const p={audio:a,level:0,target:this.volume(),fadingOut:false,wave:n};
    this.players.push(p);this.active='wave'+n;
    a.addEventListener('error',()=>{if(this.players.includes(p)&&!p.fadingOut){this.playWeb(n===1?'wave1':'endless');}}, {once:true});
    const promise=a.play();if(promise&&promise.catch)promise.catch(()=>{if(this.players.includes(p)&&!p.fadingOut)this.playWeb(n===1?'wave1':'endless');});
  },
  startWave(n){if(n===1)this.playWeb('wave1');else if(this.files[n])this.playFile(n);else this.playWeb('endless');},
  playWeb(id){
    this.init();this.fadePlayers();this.fadeWeb();this.paused=false;
    const spec=this.presets[id]||this.presets.wave1,c=Snd.ctx;
    if(!c||!Snd.ready){this.setAmbient(false);return;}
    const now=c.currentTime;
    this.setAmbient(true);
    const bus=c.createGain();bus.gain.setValueAtTime(.0001,now);bus.gain.linearRampToValueAtTime(spec.level||.7,now+1.1);bus.connect(Snd.music);
    this.webGain=bus;this.web={id:id,spec:spec,next:now+.08,bar:0,ends:spec.duration?now+spec.duration:0};this.active=id;
  },
  note(freq,start,duration,type,gain,filterHz){
    if(!Snd.ready||!this.webGain)return;
    const c=Snd.ctx,o=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain();
    o.type=type||'sine';o.frequency.setValueAtTime(Math.max(20,freq),start);
    f.type='lowpass';f.frequency.setValueAtTime(filterHz||1100,start);f.Q.value=.55;
    const attack=Math.min(1.8,Math.max(.08,duration*.3)),end=start+duration;
    g.gain.setValueAtTime(.0001,start);g.gain.linearRampToValueAtTime(gain,start+attack);
    g.gain.setTargetAtTime(.0001,Math.max(start+attack,end-.9),.35);
    o.connect(f);f.connect(g);g.connect(this.webGain);o.start(start);o.stop(end+.08);
  },
  scheduleBar(t,w){
    const s=w.spec,bar=s.bar,ch=s.chords[w.bar%s.chords.length],root=ch[0];
    ch.forEach((f,i)=>this.note(f,t,bar*.94,i===0?'sine':'triangle',i===0?.105:.047,i<2?620:1450));
    this.note(root*.5,t,bar*.86,'sine',.115,230);
    if(s.pulse){
      const count=w.id==='descent'?2:4;
      for(let i=0;i<count;i++)this.note(root*.75,t+bar*(i/count),Math.min(1.15,bar*.23),'sine',.045,180);
    }
    if(s.motif&&w.bar%2===0){
      const motif=[220,261.63,329.63];
      motif.forEach((f,i)=>this.note(f*(w.id==='endless'?.5:1),t+bar*.22+i*.48,1.9,'sine',.065,2100));
    }
    if(w.id==='over')this.note(174.6,t+bar*.45,bar*.8,'triangle',.035,500);
    if(w.id==='win'){
      [392,493.88,587.33].forEach((f,i)=>this.note(f,t+bar*.32+i*.28,2.8,'sine',.045,1800));
    }
    w.bar++;w.next+=bar;
  },
  update(dt){
    if(this.paused)return;
    for(let i=this.players.length-1;i>=0;i--){const p=this.players[i];
      p.level+=(p.target-p.level)*Math.min(1,dt*2.8);p.audio.volume=Math.max(0,Math.min(1,p.level));
      if(p.fadingOut&&p.level<.004){p.audio.pause();p.audio.removeAttribute('src');p.audio.load();this.players.splice(i,1);}
    }
    if(!this.web||!Snd.ready)return;
    const now=Snd.ctx.currentTime;
    if(this.web.ends&&now>=this.web.ends){
      const next=this.web.spec.next;this.fadeWeb();
      if(next)this.playWeb(next);else this.setAmbient(false);
      return;
    }
    while(this.web&&this.web.next<now+1.0)this.scheduleBar(this.web.next,this.web);
  },
  pause(){this.paused=true;this.players.forEach(p=>p.audio.pause());if(this.webGain&&Snd.ctx)this.webGain.gain.setTargetAtTime(.0001,Snd.ctx.currentTime,.18);},
  resume(){this.paused=false;this.players.forEach(p=>{if(!p.fadingOut){const r=p.audio.play();if(r&&r.catch)r.catch(()=>{});}});if(this.webGain&&Snd.ctx){this.webGain.gain.setTargetAtTime((this.web?.spec.level||.6),Snd.ctx.currentTime,.25);if(this.web)this.web.next=Snd.ctx.currentTime+.08;}Snd.resume();}
};
function saveSet(){store.set('settings',SET);}
function syncAudioUI(){
  const on=!SET.muted;
  $('audioChip').classList.toggle('off',!on);$('audioChip').setAttribute('aria-pressed',String(on));
  $('chipLabel').textContent=on?'SOM ATIVO':'MUDO';$('chipWaves').style.opacity=on?'1':'.15';
  $('btnSound').classList.toggle('off',!on);$('soundWaves').style.opacity=on?'1':'.15';
  $('setMute').classList.toggle('on',SET.muted);
}
function toggleSound(){Snd.init();Snd.setMuted(!SET.muted);if(!SET.muted){Snd.resume();Snd.click();}}

/* ============================================================
   3 · CANVAS / MUNDO
   ============================================================ */
const stage=$('stage'),cv=$('cv');
let ctx=cv.getContext('2d',{alpha:false}),ctxTag='main';
const view={w:800,h:600},world={w:1920,h:1200};
let zoom=1;
const cam={x:0,y:0,ox:0,oy:0,shake:0};
const isTouch=window.matchMedia('(pointer: coarse)').matches||('ontouchstart' in window);
const MOBILE=isTouch&&Math.min(screen.width||9999,screen.height||9999,window.innerWidth,window.innerHeight)<=820;
const DPR=Math.min(MOBILE?1:2,window.devicePixelRatio||1);
if(MOBILE)document.documentElement.classList.add('mobile');
const glowCache=new Map();
function glow(hex){let s=glowCache.get(hex);if(s)return s;
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),col=rgb(hex);
  const gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba('+col[0]+','+col[1]+','+col[2]+',1)');gr.addColorStop(.22,'rgba('+col[0]+','+col[1]+','+col[2]+',.6)');
  gr.addColorStop(.52,'rgba('+col[0]+','+col[1]+','+col[2]+',.17)');gr.addColorStop(1,'rgba('+col[0]+','+col[1]+','+col[2]+',0)');
  g.fillStyle=gr;g.fillRect(0,0,64,64);glowCache.set(hex,c);return c;}
function blob(x,y,r,hex,a){ctx.globalAlpha=clamp(a*(SET.glow/100),0,1);ctx.drawImage(glow(hex),x-r,y-r,r*2,r*2);ctx.globalAlpha=1;}
const gradCache=new Map();
function bodyGrad(hex,r){
  const key=ctxTag+'|'+hex+'|'+Math.round(r);let g=gradCache.get(key);if(g)return g;
  const col=rgb(hex);g=ctx.createRadialGradient(-r*.3,-r*.35,r*.08,0,0,r*1.15);
  g.addColorStop(0,'rgba('+Math.min(255,col[0]+90)+','+Math.min(255,col[1]+90)+','+Math.min(255,col[2]+90)+',.95)');
  g.addColorStop(.55,'rgba('+col[0]+','+col[1]+','+col[2]+',.85)');
  g.addColorStop(1,'rgba('+Math.round(col[0]*.28)+','+Math.round(col[1]*.28)+','+Math.round(col[2]*.32)+',.92)');
  gradCache.set(key,g);return g;}
const THEMES=[
  {top:'#0b3145',mid:'#07202f',bot:'#010509',acc:'#19c8d8',ray:'#96fff0'},
  {top:'#0a2a4a',mid:'#061a30',bot:'#01040a',acc:'#3b82ff',ray:'#a8d8ff'},
  {top:'#1a1440',mid:'#0a0a26',bot:'#020108',acc:'#a855f7',ray:'#d9b6ff'},
  {top:'#2a0a2a',mid:'#12061c',bot:'#050106',acc:'#ff2e88',ray:'#ffb6d8'},
  {top:'#2b1005',mid:'#140705',bot:'#050202',acc:'#ff3b57',ray:'#ffc7a8'}];
let theme=THEMES[0],bgCan=null,noiseTile=null,rayGrad=null,spires=[],kelp=[],rocks=[],fogGrad=null;
function themeFor(w){return THEMES[clamp(Math.floor((w-1)/3),0,THEMES.length-1)];}
function makeNoise(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');
  const img=x.createImageData(128,128),d=img.data;
  for(let i=0;i<d.length;i+=4){const v=Math.random()*255;d[i]=d[i+1]=d[i+2]=v;d[i+3]=13;}
  x.putImageData(img,0,0);return c;}
function bakeBG(){
  if(!noiseTile)noiseTile=makeNoise();
  bgCan=document.createElement('canvas');
  bgCan.width=Math.max(2,Math.round(view.w));bgCan.height=Math.max(2,Math.round(view.h));
  const g=bgCan.getContext('2d');
  const gr=g.createLinearGradient(0,0,view.w*.25,view.h);
  gr.addColorStop(0,theme.top);gr.addColorStop(.3,theme.mid);gr.addColorStop(1,theme.bot);
  g.fillStyle=gr;g.fillRect(0,0,view.w,view.h);
  const top=g.createRadialGradient(view.w*.5,-view.h*.22,10,view.w*.5,-view.h*.22,view.h*.95);
  top.addColorStop(0,rgba(theme.acc,.3));top.addColorStop(.5,rgba(theme.acc,.09));top.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=top;g.fillRect(0,0,view.w,view.h);
  const warm=g.createRadialGradient(view.w*.86,view.h*1.05,10,view.w*.86,view.h*1.05,view.h*.8);
  warm.addColorStop(0,'rgba(255,46,136,.12)');warm.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=warm;g.fillRect(0,0,view.w,view.h);
  g.fillStyle=g.createPattern(noiseTile,'repeat');g.fillRect(0,0,view.w,view.h);
  rayGrad=ctx.createLinearGradient(0,-40,0,view.h*.95);
  rayGrad.addColorStop(0,rgba(theme.ray,.16));rayGrad.addColorStop(.45,rgba(theme.acc,.06));rayGrad.addColorStop(1,'rgba(0,0,0,0)');  fogGrad=ctx.createLinearGradient(0,view.h*.35,0,view.h);fogGrad.addColorStop(0,'rgba(0,0,0,0)');fogGrad.addColorStop(1,rgba(theme.mid,.5));
}
function seedScenery(){
  rocks=[];for(let i=0;i<16;i++){const n=rint(7,10),pts=[];for(let k=0;k<n;k++)pts.push([k/n*TAU,rnd(.72,1.15)]);
    rocks.push({x:rnd(40,world.w-40),y:rnd(60,world.h-30),r:rnd(16,38),pts:pts,c:i%3===0?C.magenta:(i%3===1?C.teal:C.violet),tip:i%2===0});}
  spires=[];for(let i=0;i<16;i++)spires.push({x:(i/16)*world.w*1.25+rnd(-40,40),w:rnd(70,190),h:rnd(120,420),lean:rnd(-.25,.25),far:i%2===0});
  kelp=[];for(let i=0;i<18;i++)kelp.push({x:rnd(-100,world.w+100),h:rnd(130,330),w:rnd(6,15),ph:rnd(0,TAU),c:i%3===0?C.teal:(i%3===1?C.violet:C.bio)});
}
const dust=[[],[],[]],bubbles=[];
function seedAmbient(){
  dust.forEach((layer,li)=>{layer.length=0;const n=(MOBILE?[36,28,20]:[70,55,40])[li];
    for(let i=0;i<n;i++)layer.push({x:rnd(0,view.w+240),y:rnd(0,view.h+240),r:rnd(.7,1.6)+li*.9,a:rnd(.16,.5)-li*.03,s:rnd(4,16)+li*7,ph:rnd(0,TAU)});});
  bubbles.length=0;for(let i=0;i<(MOBILE?12:26);i++)bubbles.push({x:rnd(0,view.w),y:rnd(0,view.h),r:rnd(1.5,5),v:rnd(14,44),ph:rnd(0,TAU)});
}
function resize(){
  view.w=Math.max(320,stage.clientWidth);view.h=Math.max(320,stage.clientHeight);
  cv.width=Math.round(view.w*DPR);cv.height=Math.round(view.h*DPR);
  cv.style.width=view.w+'px';cv.style.height=view.h+'px';
  zoom=MOBILE?clamp(Math.min(view.w/1180,view.h/740)*1.9,.95,1.5):clamp(Math.min(view.w/1180,view.h/740)*1.25,.62,1.25);
  world.w=clamp(view.w/zoom*1.45,1200,2400);world.h=clamp(view.h/zoom*1.45,900,1700);
  bakeBG();seedAmbient();seedScenery();
  if(P){P.x=clamp(P.x,40,world.w-40);P.y=clamp(P.y,40,world.h-40);}
  enemies.forEach(e=>{e.x=clamp(e.x,30,world.w-30);e.y=clamp(e.y,30,world.h-30);});
  pickups.forEach(o=>{o.x=clamp(o.x,20,world.w-20);o.y=clamp(o.y,20,world.h-20);});
  vents.forEach(v=>{v.x=clamp(v.x,120,world.w-120);v.y=clamp(v.y,120,world.h-120);});
  fitAux();if(typeof homeSticks==='function')homeSticks();
}
window.addEventListener('resize',resize);
window.addEventListener('orientationchange',()=>setTimeout(resize,240));

/* ============================================================
   4 · ESTADO
   ============================================================ */
let scene='boot',T=0,ts=1,tsTarget=1,slowT=0,freeze=0,speedSetting=SET.speed;
let P=null,enemies=[],bullets=[],ebullets=[],parts=[],rings=[],floats=[],pickups=[],teles=[],trail=[],ambient=[],vents=[],beams=[],ink=[];
let eid=1,dashId=0,novaId=0,nova=null,sonarT=0,sonarR=-1;
let wave=0,waveName='',waveTotal=0,spawnQueue=[],spawnTimer=0,bossRef=null,endless=false,training=false,
    waveClock=0,waveRestockTimer=0;
let score=0,combo=0,comboT=0,maxCombo=0,kills=0,plankton=0,runTime=0,bloom=0;
let dmgFlash=0,whiteFlash=0,offers=[],hintT=0,cine=null,heartT=0,streakN=0,streakT=0;
let timers=[],diveSeq=null,bootSeq={i:0,t:0,done:false},backTo='menu';
const perf={avg:16,q:1};
const PARTCAP=MOBILE?360:820,LR=MOBILE?.34:.5;
function later(t,fn){timers.push({t:t,fn:fn});}
function tut(){return{step:0,moved:0,dashes:0,plank:0,novas:0,kills:0};}
let TU=tut();
/* ============================================================
   COOP ONLINE (2 jogadores · PeerJS) — estado e ganchos de rede
   ============================================================ */
const Net=window.AbissoNet||null;
let coop=false,coopHost=false,coopGuest=false,players=[],ME=0,TG=null;
let netAcc=0,netSeq=0,evq=[],netLeft=0,snapT=0,snapDt=.05,inAcc=0,enemyMap=new Map(),bossUIOn=false,pendingSnaps=[];
let offersByP=[],picked=[],coopWait=false,sndCnt={},sndDepth=0,coopPaused=false;
function cleanName(n){try{return String(n||'').replace(/[^\p{L}\p{N} _.\-]/gu,'').replace(/\s+/g,' ').trim().slice(0,12).toUpperCase();}catch(e){return String(n||'').slice(0,12).toUpperCase();}}
let myName=cleanName(store.get('playerName','')),peerName='';
function pname(q){const n=(q.idx===ME)?myName:peerName;return n||(q.idx===0?'J1':'J2');}
function coopK(){return coop&&players.filter(q=>!q.gone).length>1?1.5:1;}
function nearestPlayer(x,y){let b=null,bd=1e18;
  for(const q of players){if(q.gone||q.down)continue;const d=(q.x-x)*(q.x-x)+(q.y-y)*(q.y-y);if(d<bd){bd=d;b=q;}}
  return b||players.find(q=>!q.gone)||players[0]||P;}
function netEv(e){if(coopHost&&evq.length<90)evq.push(e);}
function toastAll(t){toast(t);netEv(['tt',t]);}
function toastTo(idx,t){if(!coop||idx===ME)toast(t);else netEv(['tt',t,idx]);}
(function hookNet(){
  const ob=burst,os=spark,op=plume,orr=ring,of=floater,osh=shake,osl=slow,obn=banner;
  burst=function(x,y,n,hex,spd,life){if(coopHost)netEv(['b',x,y,n,hex,spd,life]);return ob(x,y,n,hex,spd,life);};
  spark=function(x,y,ang,n,hex,spd){if(coopHost)netEv(['sp',x,y,ang,n,hex,spd]);return os(x,y,ang,n,hex,spd);};
  plume=function(x,y,n,hex,up){if(coopHost&&n>0)netEv(['pl',x,y,n,hex,up]);return op(x,y,n,hex,up);};
  ring=function(x,y,r0,r1,life,hex,w){if(coopHost)netEv(['r',x,y,r0,r1,life,hex,w]);return orr(x,y,r0,r1,life,hex,w);};
  floater=function(x,y,txt,hex,size){if(coopHost)netEv(['f',x,y,txt,hex,size]);return of(x,y,txt,hex,size);};
  shake=function(v){if(coopHost)netEv(['sh',v]);return osh(v);};
  slow=function(a,d){if(coop)return;return osl(a,d);};
  banner=function(a,b,c){if(coopHost)netEv(['bn',a,b,c]);return obn(a,b,c);};
  const SKIP={init:1,resume:1,applyVolumes:1,setMuted:1,tick:1,scheduleBar:1,set:1,hover:1,click:1,beat:1};
  Object.keys(Snd).forEach(k=>{const f=Snd[k];if(typeof f!=='function'||SKIP[k])return;
    Snd[k]=function(){
      if(coopHost&&sndDepth===0){const c=sndCnt[k]||0;if(c<3){sndCnt[k]=c+1;netEv(['sn',k,Array.prototype.slice.call(arguments)]);}}
      sndDepth++;try{return f.apply(this,arguments);}finally{sndDepth--;}};});
})();

/* ============================================================
   5 · EFEITOS
   ============================================================ */
function pq(){return perf.q*(SET.parts/100)*(MOBILE?.6:1);}
function burst(x,y,n,hex,spd,life){n=Math.round(n*pq());
  for(let i=0;i<n;i++){const a=rnd(0,TAU),s=rnd(spd*.25,spd);
    parts.push({x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:rnd(.28,life||.7),m:life||.7,r:rnd(1.6,4.4),c:hex,d:2.4});}
  if(parts.length>PARTCAP)parts.splice(0,parts.length-PARTCAP);}
function spark(x,y,ang,n,hex,spd){n=Math.round(n*pq());
  for(let i=0;i<n;i++){const a=ang+rnd(-.5,.5),s=rnd(spd*.4,spd);
    parts.push({x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:rnd(.15,.4),m:.4,r:rnd(1.2,3),c:hex,d:3.2});}}
function plume(x,y,n,hex,up){n=Math.round(n*pq());
  for(let i=0;i<n;i++)parts.push({x:x+rnd(-14,14),y:y,vx:rnd(-40,40),vy:-rnd(up*.4,up),l:rnd(.6,1.5),m:1.5,r:rnd(2,6),c:hex,d:.9});}
function ring(x,y,r0,r1,life,hex,w){rings.push({x:x,y:y,r:r0,r1:r1,l:life,m:life,c:hex,w:w||3});}
function floater(x,y,txt,hex,size){floats.push({x:x,y:y,t:txt,c:hex,s:size||13,l:.85,m:.85,vy:-46,vx:rnd(-14,14)});}
function shake(v){if(!SET.motion)cam.shake=Math.min(36,cam.shake+v*(SET.shake/100));}
function slow(s,d){if(SET.motion)return;tsTarget=s;slowT=Math.max(slowT,d);}

/* ============================================================
   6 · JOGADOR / SIMBIONTES / BUFFS
   ============================================================ */
function newPlayer(idx){return{idx:idx||0,down:false,reviveT:0,gone:false,remote:false,inp:null,dashLock:0,aimT:-PI/2,x:world.w/2,y:world.h/2,vx:0,vy:0,r:15,aim:-PI/2,
  hp:6,maxHp:6,speed:300,fireRate:4.2,fireCd:0,dmg:10,shots:1,pierce:0,bounce:0,crit:.05,critMul:2.2,
  dashCd:1.15,dashLeft:0,dashT:0,dashAng:0,dashDmg:0,magnet:95,orbs:0,orbA:0,regen:0,regenT:0,
  bloomGain:1,comboWindow:3,iFrame:0,stacks:{},rr:2,alive:true,hitPulse:0,buffs:{}};}
const BUFFS={frenesi:{n:'FRENESI',c:C.amber,d:9},escudo:{n:'ESCUDO',c:C.info,d:14},voragem:{n:'VORAGEM',c:C.violet,d:11}};
function hasBuff(k){return P&&P.buffs[k]>0;}
const UP=[
 {id:'cadencia',n:'Cadência Neural',r:'comum',max:6,d:'Disparos 17% mais rápidos. Mais luz por segundo.',ico:'<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',ap:p=>p.fireRate*=1.17},
 {id:'prisma',n:'Prisma de Luz',r:'epico',max:3,d:'+1 projétil por disparo, aberto em leque.',ico:'<path d="M12 3l9 16H3z"/><path d="M12 3v16M6 19l12-8"/>',ap:p=>p.shots+=1},
 {id:'perfura',n:'Perfuração',r:'raro',max:3,d:'Cada disparo atravessa +1 criatura.',ico:'<path d="M3 12h14"/><path d="M13 7l5 5-5 5"/><circle cx="19" cy="12" r="2"/>',ap:p=>p.pierce+=1},
 {id:'amplitude',n:'Amplitude Fóton',r:'comum',max:6,d:'+28% de dano em disparos e na florada.',ico:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',ap:p=>p.dmg*=1.28},
 {id:'nadadeiras',n:'Nadadeiras',r:'comum',max:4,d:'+11% de velocidade de nado.',ico:'<path d="M3 12c5-6 12-6 18 0-6 6-13 6-18 0z"/><circle cx="16" cy="12" r="1.6"/>',ap:p=>p.speed*=1.11},
 {id:'casco',n:'Casco Quitinoso',r:'raro',max:4,d:'+2 células de vida e cura 2 na hora.',ico:'<path d="M12 3l8 4v6c0 5-4 7-8 8-4-1-8-3-8-8V7z"/><path d="M9 12l2 2 4-4"/>',ap:p=>{p.maxHp+=2;p.hp=Math.min(p.maxHp,p.hp+2);}},
 {id:'jato',n:'Jato Propulsor',r:'raro',max:3,d:'Recarga do jato 24% menor.',ico:'<path d="M5 12h9"/><path d="M14 8l4 4-4 4"/><path d="M4 7v10M7 9v6"/>',ap:p=>p.dashCd*=.76},
 {id:'ima',n:'Ímã de Plâncton',r:'comum',max:3,d:'+60% no raio de coleta.',ico:'<path d="M6 4v8a6 6 0 0 0 12 0V4"/><path d="M6 9h4M14 9h4"/>',ap:p=>p.magnet*=1.6},
 {id:'orbe',n:'Orbe Simbiótico',r:'epico',max:3,d:'+1 orbe orbitando, causando dano por contato.',ico:'<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="5"/><circle cx="22" cy="12" r="1.6"/>',ap:p=>p.orbs+=1},
 {id:'choque',n:'Choque de Impacto',r:'epico',max:2,d:'O jato causa dano pesado em quem atravessar.',ico:'<path d="M13 2L6 13h5l-2 9 9-12h-5z"/><path d="M3 6l2 2M3 18l2-2"/>',ap:p=>p.dashDmg=p.dashDmg?p.dashDmg*1.6+12:30},
 {id:'regen',n:'Metabolismo Lento',r:'raro',max:3,d:'Regenera 1 célula periodicamente.',ico:'<path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z"/>',ap:p=>p.regen=p.regen?p.regen*.62:11},
 {id:'critico',n:'Olho Clínico',r:'raro',max:4,d:'+12% de crítico (dano ×2.2).',ico:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',ap:p=>p.crit+=.12},
 {id:'florada',n:'Florada Precoce',r:'lenda',max:3,d:'+35% de carga da florada.',ico:'<circle cx="12" cy="12" r="3.4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',ap:p=>p.bloomGain*=1.35},
 {id:'ricochete',n:'Ricochete',r:'lenda',max:2,d:'Disparos quicam +1 vez na borda.',ico:'<path d="M3 4v16"/><path d="M21 6L8 12l13 6"/><circle cx="8" cy="12" r="1.6"/>',ap:p=>p.bounce+=1},
 {id:'sangue',n:'Sangue-Frio',r:'comum',max:2,d:'+1.2s de janela de combo.',ico:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',ap:p=>p.comboWindow+=1.2},
 {id:'tempestade',n:'Tempestade Prismática',r:'lenda',max:1,evo:true,req:{prisma:2,cadencia:3},d:'EVOLUÇÃO · +2 projéteis e +15% de cadência.',ico:'<path d="M12 2l3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1z"/>',ap:p=>{p.shots+=2;p.fireRate*=1.15;}},
 {id:'lanca',n:'Lança de Luz',r:'lenda',max:1,evo:true,req:{perfura:2,amplitude:3},d:'EVOLUÇÃO · +3 perfurações, +35% de dano e +10% de crítico.',ico:'<path d="M3 21L21 3"/><path d="M14 3h7v7"/><path d="M3 15l6 6"/>',ap:p=>{p.pierce+=3;p.dmg*=1.35;p.crit+=.1;}},
 {id:'constelacao',n:'Constelação Viva',r:'lenda',max:1,evo:true,req:{orbe:2,ima:1},d:'EVOLUÇÃO · +2 orbes, +50% de coleta e +10% de dano.',ico:'<circle cx="6" cy="8" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M6 8l12-2-6 12z"/>',ap:p=>{p.orbs+=2;p.magnet*=1.5;p.dmg*=1.1;}},
 {id:'leviata',n:'Pele de Leviatã',r:'lenda',max:1,evo:true,req:{casco:2,regen:1},d:'EVOLUÇÃO · +3 células de vida, cura total e regeneração mais rápida.',ico:'<path d="M12 3l8 4v6c0 5-4 7-8 8-4-1-8-3-8-8V7z"/><path d="M8 12h8M12 8v8"/>',ap:p=>{p.maxHp+=3;p.hp=p.maxHp;p.regen=p.regen?p.regen*.7:9;}},
 {id:'mare',n:'Maré Viva',r:'lenda',max:1,evo:true,req:{nadadeiras:2,jato:2},d:'EVOLUÇÃO · +20% de velocidade de nado e jato 30% mais rápido.',ico:'<path d="M2 9c3-3 6 3 10 0s7 3 10 0"/><path d="M2 15c3-3 6 3 10 0s7 3 10 0"/>',ap:p=>{p.speed*=1.2;p.dashCd*=.7;}}];
const RARNAME={comum:'COMUM',raro:'RARO',epico:'ÉPICO',lenda:'LENDÁRIO'};

/* ============================================================
   7 · CRIATURAS / ONDAS
   ============================================================ */
const DEF={drifter:{r:19,hp:24,spd:145,score:20,c:C.magenta},dart:{r:11,hp:11,spd:265,score:12,c:C.electric},
  angler:{r:22,hp:38,spd:120,score:35,c:C.amber},urchin:{r:20,hp:44,spd:52,score:40,c:C.bio},
  crab:{r:26,hp:95,spd:105,score:70,c:C.crimson},eel:{r:17,hp:32,spd:165,score:55,c:C.info}};
const BEASTS=[
 {k:'drifter',n:'DERIVA',kind:'comum',c:C.magenta,vida:24,vel:45,amea:35,
  d:'Medusa que pulsa em direção à sua luz. Lenta entre pulsos, rápida durante eles.',tip:'Espere o pulso terminar e corte pelo lado — ela não corrige a rota no ar.'},
 {k:'dart',n:'CARDUME',kind:'comum',c:C.electric,vida:11,vel:95,amea:30,
  d:'Peixes-lâmina em bando. Tecem em senoide e cercam por número, não por força.',tip:'Um único disparo com Perfuração limpa a fila inteira do cardume.'},
 {k:'angler',n:'ANZOL',kind:'comum',c:C.amber,vida:38,vel:40,amea:55,
  d:'Mantém distância e lança uma isca luminosa que persegue você lentamente.',tip:'A isca brilha antes do disparo. Gire em torno dela — a curva é limitada.'},
 {k:'urchin',n:'OURIÇO',kind:'comum',c:C.bio,vida:44,vel:18,amea:60,
  d:'Bola de espinhos que gira e explode em anel radial de doze pontas.',tip:'O núcleo acende 0,6 s antes. Saia do raio ou passe pelo vão entre espinhos.'},
 {k:'crab',n:'CARAPAÇA',kind:'comum',c:C.crimson,vida:95,vel:35,amea:75,
  d:'Couraçado pesado. Treme, trava a mira e investe em linha reta a alta velocidade.',tip:'Ele trava a direção antes de investir. Saia da linha, nunca para trás.'},
 {k:'eel',n:'ENGUIA',kind:'comum',c:C.info,vida:32,vel:62,amea:80,
  d:'Carrega um arco elétrico e dispara um feixe reto que atravessa a arena.',tip:'A linha tracejada é o aviso: cruze perpendicularmente antes do estalo.'},
 {k:'medusa',n:'RAINHA MEDUSA',kind:'chefe',c:C.magenta,vida:100,vel:30,amea:90,
  d:'Chefe da onda 6. Rajadas radiais, espiral contínua, invoca cardumes e esmaga o ponto onde você está.',tip:'Na fase II ela acelera tudo. Guarde a florada para o momento da espiral.'},
 {k:'leviathan',n:'O LEVIATÃ',kind:'chefe',c:C.amber,vida:100,vel:70,amea:100,
  d:'Chefe da onda 12. Serpente segmentada: cada anel do corpo também causa dano.',tip:'Ataque a cabeça e nunca corte pelo meio do corpo — os anéis matam.'}];
function makeEnemy(type,x,y){
  const d=DIFF[difficulty],b=DEF[type],sc=endless&&wave>12?1+(wave-12)*.09:1;
  const e={id:eid++,type:type,x:x,y:y,vx:0,vy:0,kx:0,ky:0,r:b.r,hp:b.hp*d.hp*sc,maxHp:b.hp*d.hp*sc,
    spd:b.spd*d.spd*Math.min(1.35,sc),score:b.score,c:b.c,t:rnd(0,10),ang:rnd(0,TAU),flash:0,cd:rnd(.6,2),
    st:'idle',stT:0,dead:false,orbCd:0,dashHit:-1,novaHit:-1,spin:rnd(0,TAU),pulse:0,beamAng:0};
  if(type==='drifter')e.cd=rnd(.2,1);
  if(type==='urchin')e.cd=rnd(1.4,2.8);
  if(type==='crab')e.cd=rnd(1.2,2.4);
  if(type==='eel')e.cd=rnd(1.6,3);
  seen[type]=true;
  return e;}
function makeBoss(kind){
  const d=DIFF[difficulty],hp=(kind==='medusa'?1500:3400)*1.3*d.hp*(coopK()>1?1.7:1)*(endless&&wave>12?1+(wave-12)*.12:1);
  const b={id:eid++,type:'boss',kind:kind,x:world.w/2,y:world.h*.26,vx:0,vy:0,kx:0,ky:0,
    r:kind==='medusa'?86:52,hp:hp,maxHp:hp,spd:kind==='medusa'?78:190,score:kind==='medusa'?1200:2600,
    c:kind==='medusa'?C.magenta:C.amber,t:0,ang:PI/2,flash:0,cd:2.6,st:'idle',stT:0,dead:false,phase:1,pat:0,
    orbCd:0,dashHit:-1,novaHit:-1,spin:0,segs:[],sub:0,name:kind==='medusa'?'RAINHA MEDUSA':'O LEVIATÃ'};
  if(kind==='leviathan')for(let i=0;i<14;i++)b.segs.push({x:b.x,y:b.y-i*27});
  seen[kind]=true;return b;}
// Ondas estendidas: aumenta bastante o volume de criaturas em todas as dificuldades.
// Cada fase mantém pressão por pelo menos 90 segundos para dar espaço à trilha musical.
const WAVE_SIZE_MULTIPLIER=11;
// Duração mínima por onda (segundos): onda 1 = 2:15, cresce 10 s por onda até 4:30.
// Para mudar: ajuste WAVE_BASE_DURATION, WAVE_DURATION_STEP e WAVE_MAX_DURATION.
const WAVE_BASE_DURATION=135,WAVE_DURATION_STEP=10,WAVE_MAX_DURATION=270;
function waveDuration(n){return Math.min(WAVE_MAX_DURATION,WAVE_BASE_DURATION+Math.max(0,n-1)*WAVE_DURATION_STEP);}
let waveSpawnGap=2;
const WAVES=[
 {n:'ÁGUAS RASAS',s:[['drifter',5]]},
 {n:'PRIMEIRO CARDUME',s:[['drifter',4],['dart',7]]},
 {n:'LUZES FALSAS',s:[['drifter',5],['angler',2],['dart',6]]},
 {n:'CAMPO DE ESPINHOS',s:[['urchin',3],['drifter',5],['dart',7]]},
 {n:'CARAPAÇAS',s:[['crab',2],['angler',3],['dart',9],['drifter',4]]},
 {n:'A RAINHA',boss:'medusa',s:[['dart',6],['drifter',3]]},
 {n:'CORRENTEZA',s:[['dart',14],['drifter',6],['urchin',3]]},
 {n:'DESCARGA',s:[['eel',3],['angler',4],['urchin',4],['dart',7]]},
 {n:'ENXAME',s:[['dart',17],['drifter',8],['crab',3],['eel',2]]},
 {n:'JARDIM DE ESPINHOS',s:[['urchin',7],['angler',4],['crab',3],['dart',8]]},
 {n:'PRENSA ABISSAL',s:[['crab',5],['eel',4],['drifter',9],['dart',12],['urchin',4]]},
 {n:'O LEVIATÃ',boss:'leviathan',s:[['urchin',3],['dart',9],['eel',2]]}];
function waveDef(n){
  if(n<=12)return WAVES[n-1];
  const k=n-12,boss=n%6===0?(n%12===0?'leviathan':'medusa'):null;
  return{n:'PROFUNDEZA '+k,boss:boss,s:[['dart',10+k*2],['drifter',6+k],['angler',3+Math.floor(k/2)],['urchin',3+Math.floor(k/2)],['crab',2+Math.floor(k/2)],['eel',2+Math.floor(k/2)]]};}
function spawnPos(minD){
  const al=players.filter(q=>!q.gone&&!q.down),ref=al.length?al:(P?[P]:[]);
  for(let i=0;i<26;i++){const x=rnd(70,world.w-70),y=rnd(70,world.h-70);if(ref.every(q=>dist(x,y,q.x,q.y)>minD))return{x:x,y:y};}
  const q=ref[0];return{x:q?clamp(q.x+(q.x<world.w/2?520:-520),70,world.w-70):world.w/2,y:rnd(70,world.h-70)};}
function seedVents(){
  vents=[];const n=3;
  for(let i=0;i<n;i++)vents.push({x:rnd(world.w*.18,world.w*.82),y:rnd(world.h*.2,world.h*.85),
    st:'idle',t:rnd(4,11),r:74,ph:rnd(0,TAU)});}

/* ABISSO EXPANSION PACK: events, biome hazards and strategic perks */
let abyssEvent=null, eventClock=0, eventZone=null;
const ABYSS_EVENTS=[
 {id:'current',name:'CORRENTEZA ABISSAL',desc:'Uma corrente atravessa a região!',dur:16},
 {id:'blackout',name:'APAGÃO',desc:'A luz ambiente desapareceu!',dur:14},
 {id:'echo',name:'ECO DE SONAR',desc:'Ecos revelam nutrientes extras!',dur:12},
 {id:'predator',name:'PREDADOR ERRANTE',desc:'Algo grande está rondando...',dur:18},
 {id:'rift',name:'FISSURA TÉRMICA',desc:'Uma fissura instável surgiu!',dur:16}
];
function beginAbyssEvent(){
 if(training||bossRef||wave<2||Math.random()>.72)return;
 const ev=ABYSS_EVENTS[rint(0,ABYSS_EVENTS.length-1)];abyssEvent={...ev,t:ev.dur};
 eventZone=ev.id==='rift'?{x:rnd(180,world.w-180),y:rnd(180,world.h-180),r:150,t:ev.dur}:null;
 banner('EVENTO ABISSAL',ev.name,ev.desc);
 if(ev.id==='echo'){for(let i=0;i<8;i++)pickups.push({x:rnd(100,world.w-100),y:rnd(100,world.h-100),vx:0,vy:0,t:'p',r:4.5,l:20,ph:rnd(0,TAU)});}
 if(ev.id==='predator'){const pos=spawnPos(520);teles.push({x:pos.x,y:pos.y,t:1.3,type:'crab'});}
}
function updateAbyssEvent(dt){
 if(!abyssEvent)return;abyssEvent.t-=dt;
 if(abyssEvent.id==='current'){for(const q of players){if(q.gone||q.down)continue;q.vx+=Math.sin(T*1.4)*35*dt;q.vy+=Math.cos(T*.9)*25*dt;}}
 if(abyssEvent.id==='rift'&&eventZone){for(const q of players){if(q.gone||q.down)continue;if(dist(q.x,q.y,eventZone.x,eventZone.y)<eventZone.r){q.hp=Math.max(0,q.hp-dt*.18);if(q===players[ME])dmgFlash=Math.max(dmgFlash,.12);}}}
 if(abyssEvent.t<=0){abyssEvent=null;eventZone=null;toastAll('EVENTO ENCERRADO');}
}
function drawAbyssEvent(){
 if(!abyssEvent)return;
 if(eventZone){ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle=rgba(C.crimson,.65);ctx.fillStyle=rgba(C.crimson,.12);ctx.lineWidth=4;ctx.beginPath();ctx.arc(eventZone.x,eventZone.y,eventZone.r,0,TAU);ctx.fill();ctx.stroke();ctx.restore();}
 if(abyssEvent.id==='blackout'&&scene==='play'){ctx.save();ctx.fillStyle='rgba(0,0,0,.38)';ctx.fillRect(cam.x,cam.y,view.w/zoom,view.h/zoom);ctx.restore();}
}

function startWave(n){
  wave=n;const def=waveDef(n),d=DIFF[difficulty];
  Music.startWave(n);netEv(['wv',n]);
  ebullets=[];beams=[];nova=null;for(const q of players)q.dashT=0;
  const nt=themeFor(n);
  if(nt!==theme){theme=nt;bakeBG();}
  waveName=def.n;spawnQueue=[];spawnTimer=.9;waveClock=0;waveRestockTimer=0;abyssEvent=null;eventZone=null;eventClock=0;
  def.s.forEach(a=>{const c=Math.max(1,Math.round(a[1]*d.count*WAVE_SIZE_MULTIPLIER*coopK()));for(let i=0;i<c;i++)spawnQueue.push(a[0]);});
  for(let i=spawnQueue.length-1;i>0;i--){const j=rint(0,i),t=spawnQueue[i];spawnQueue[i]=spawnQueue[j];spawnQueue[j]=t;}
  waveTotal=spawnQueue.length+(def.boss?1:0);
  // Ritmo de surgimento calculado para a fila durar ~85% do tempo da onda
  waveSpawnGap=clamp(waveDuration(n)*.7/Math.max(1,spawnQueue.length/1.9),.8,2.6);
  if(def.boss){
    bossRef=makeBoss(def.boss);enemies.push(bossRef);
    cine={t:2.6,m:2.6,name:bossRef.name,sub:'AMEAÇA ABISSAL'};netEv(['cine',bossRef.name,'AMEAÇA ABISSAL']);
    Snd.boss();shake(22);whiteFlash=.35;slow(.4,1.2);
    ring(bossRef.x,bossRef.y,20,460,1.2,bossRef.c,7);
    $('bossInfo').classList.add('on');$('waveInfo').style.display='none';
    $('bossName').textContent=bossRef.name;$('bossPhase').textContent='FASE I';
  }else{$('bossInfo').classList.remove('on');$('waveInfo').style.display='';}
  banner('ONDA '+String(n).padStart(2,'0'),def.n,def.boss?'CONTATO MASSIVO':(endless?'modo infinito':'prof. '+fmt(1620+n*420)+' m'));
  Snd.wave();buildDepthGauge();
  if(n===1&&!training){hintT=9;showHint();}
  if(n>1&&!def.boss)beginAbyssEvent();
}
function waveComplete(){
  const bonus=Math.round((100+wave*45)*DIFF[difficulty].score);
  score+=bonus;
  for(const q of players){if(q.gone)continue;
    if(q.down){q.down=false;q.hp=Math.max(2,Math.ceil(q.maxHp/2));q.iFrame=2;q.reviveT=0;}
    else q.hp=Math.min(q.maxHp,q.hp+1);}
  toastAll('ONDA LIMPA · +'+fmt(bonus)+' PTS · +1 CÉLULA');
  if(wave>=12&&!endless){winGame();return;}
  if(coop){
    offersByP=players.map(q=>{if(q.gone)return[];const sv=P;P=q;const o=rollOffers();P=sv;return o;});
    picked=players.map(q=>!!q.gone);
    offers=offersByP[ME];coopWait=false;
    go('upgrade');Music.playWeb('upgrade');renderCards();Snd.up();
    if(coopHost&&Net&&Net.isOpen())Net.send({t:'up',o:offersByP[1].map(u=>u.id),rr:players[1].rr,wave:wave});
    return;}
  offers=rollOffers();go('upgrade');Music.playWeb('upgrade');renderCards();Snd.up();
}
function rollOffers(){
  const ok=u=>(P.stacks[u.id]||0)<u.max&&(!u.req||Object.keys(u.req).every(k=>(P.stacks[k]||0)>=u.req[k]));
  const bag=UP.filter(ok),out=[],ev=bag.filter(u=>u.evo);
  if(ev.length&&Math.random()<.7){const u=ev[rint(0,ev.length-1)];out.push(u);bag.splice(bag.indexOf(u),1);}
  while(out.length<3&&bag.length)out.push(bag.splice(rint(0,bag.length-1),1)[0]);
  return out;}
function setUpWait(){const c=$('cards');if(c)c.classList.add('waiting');$('upSub').textContent='AGUARDANDO O PARCEIRO ESCOLHER…';const rb=$('btnReroll');rb.disabled=true;rb.style.opacity=.4;}
function tryCoopAdvance(){
  if(!coopHost||!picked.every(Boolean))return;
  go('play');startWave(wave+1);syncHud(true);
  if(Net&&Net.isOpen())Net.send({t:'play'});}
function rerollOffers(){
  if(scene!=='upgrade'||coopWait||!(P.rr>0))return;
  if(coopGuest){if(Net)Net.send({t:'rr'});Snd.click();return;}
  P.rr--;offers=rollOffers();if(coop)offersByP[ME]=offers;renderCards();Snd.click();}
function chooseUpgrade(i){
  if(scene!=='upgrade'||!offers[i]||coopWait)return;
  if(coopGuest){if(Net)Net.send({t:'pick',i:i});coopWait=true;setUpWait();Snd.up();return;}
  const u=offers[i];u.ap(P);P.stacks[u.id]=(P.stacks[u.id]||0)+1;
  toast(u.n.toUpperCase()+' INSTALADO');Snd.up();
  ring(P.x,P.y,10,190,.6,C.bio,4);burst(P.x,P.y,26,C.bio,220,.8);
  if(coopHost){picked[ME]=true;coopWait=true;setUpWait();tryCoopAdvance();return;}
  go('play');startWave(wave+1);syncHud(true);
}

/* ============================================================
   8 · ENTRADA
   ============================================================ */
const keys={},mouse={x:0,y:0,active:false,wx:0,wy:0};
const stickL={on:false,id:-1,x:0,y:0,dx:0,dy:0,mag:0},stickR={on:false,id:-1,x:0,y:0,dx:0,dy:0,mag:0};
window.addEventListener('keydown',e=>{
  if(e.target&&e.target.tagName==='INPUT')return;
  const k=e.key.toLowerCase();
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].indexOf(k)>=0&&scene==='play')e.preventDefault();
  if(keys[k])return;keys[k]=true;
  if(k==='m'){toggleSound();return;}
  if(scene==='boot'){if(bootSeq.done)enterMenu();return;}
  if(scene==='coop'){if(k==='escape')coopBack();return;}
  if(scene==='menu'){
    if(k==='arrowdown'||k==='arrowup'){moveNav(k==='arrowdown'?1:-1);return;}
    if(k==='enter'){activateNav();return;}
    return;}
  if(['howto','bestiary','records','settings'].indexOf(scene)>=0){
    if(k==='escape'){go(backTo);return;}
    if(scene==='howto'){if(k==='arrowright')stepHowto(1);if(k==='arrowleft')stepHowto(-1);}
    return;}
  if(scene==='upgrade'&&['1','2','3'].indexOf(k)>=0){chooseUpgrade(+k-1);return;}
  if(scene==='upgrade'&&k==='r'){rerollOffers();return;}
  if(k==='l'&&(scene==='play'||scene==='pause')){SET.light=!SET.light;saveSet();toast('ILUMINAÇÃO DINÂMICA '+(SET.light?'LIGADA':'DESLIGADA'));return;}
  if(scene==='play'){
    if(k==='escape'||k==='p'){pauseGame();return;}
    if(k===' '||k==='shift'){doDash();return;}
    if(k==='e'){doNova();return;}
  }else if(scene==='pause'&&(k==='escape'||k==='p')){resumeGame();return;}
  else if((scene==='over'||scene==='win')&&(k==='r'||k==='enter')){againClick();}
});
window.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;if(scene==='play'&&!coop)pauseGame();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&scene==='play'&&!coop)pauseGame();});
cv.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){const r=cv.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;mouse.active=true;}});
cv.addEventListener('pointerdown',e=>{Snd.init();Snd.resume();
  if(e.pointerType==='mouse'){const r=cv.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;mouse.active=true;
    if(e.button===2&&scene==='play')doDash();}});
cv.addEventListener('contextmenu',e=>e.preventDefault());
function bindZone(zone,stick,el){
  const knob=el.querySelector('.knob');
  zone.addEventListener('pointerdown',e=>{
    if(stick.on)return;Snd.resume();stick.on=true;stick.id=e.pointerId;
    const r=stage.getBoundingClientRect();stick.x=e.clientX-r.left;stick.y=e.clientY-r.top;
    stick.dx=stick.dy=stick.mag=0;el.style.left=stick.x+'px';el.style.top=stick.y+'px';el.classList.add('on');
    knob.style.transform='translate(0,0)';try{zone.setPointerCapture(e.pointerId);}catch(err){}e.preventDefault();});
  zone.addEventListener('pointermove',e=>{
    if(!stick.on||e.pointerId!==stick.id)return;
    const r=stage.getBoundingClientRect();let dx=(e.clientX-r.left)-stick.x,dy=(e.clientY-r.top)-stick.y;
    const d=Math.hypot(dx,dy),max=52;if(d>max){dx=dx/d*max;dy=dy/d*max;}
    stick.dx=dx/max;stick.dy=dy/max;stick.mag=Math.min(1,d/max);
    knob.style.transform='translate('+dx+'px,'+dy+'px)';e.preventDefault();});
  const end=e=>{if(!stick.on||e.pointerId!==stick.id)return;stick.on=false;stick.id=-1;stick.dx=stick.dy=stick.mag=0;el.classList.remove('on');knob.style.transform='translate(0,0)';homeSticks();};
  zone.addEventListener('pointerup',end);zone.addEventListener('pointercancel',end);
}
function homeSticks(){
  const yL=Math.max(70,view.h-Math.min(92,view.h*.26));
  [[stickL,'stickL',Math.min(100,view.w*.14)+14,yL],[stickR,'stickR',view.w*.88,view.h*.59]].forEach(a=>{
    if(a[0].on)return;const el=$(a[1]);el.style.left=a[2]+'px';el.style.top=a[3]+'px';
    const k=el.querySelector('.knob');if(k)k.style.transform='translate(0,0)';});}
bindZone($('zoneL'),stickL,$('stickL'));bindZone($('zoneR'),stickR,$('stickR'));
$('tDash').addEventListener('pointerdown',e=>{e.preventDefault();Snd.resume();doDash();});
$('tBloom').addEventListener('pointerdown',e=>{e.preventDefault();Snd.resume();doNova();});

/* ============================================================
   9 · AÇÕES
   ============================================================ */
function moveInput(){
  let mx=0,my=0;
  if(keys['a']||keys['arrowleft'])mx-=1;if(keys['d']||keys['arrowright'])mx+=1;
  if(keys['w']||keys['arrowup'])my-=1;if(keys['s']||keys['arrowdown'])my+=1;
  if(stickL.on&&stickL.mag>.14){mx=stickL.dx;my=stickL.dy;}
  const d=Math.hypot(mx,my);if(d>1){mx/=d;my/=d;}
  return{x:mx,y:my,m:Math.min(1,d)};}
function doDash(pl,ang){
  const p=pl||P;
  if(coopGuest&&!pl){guestDash();return;}
  if(scene!=='play'||!p||p.down||p.dashLeft>0||p.dashT>0)return;
  const mi=p.remote?((p.inp&&p.inp.mi)||{x:0,y:0,m:0}):moveInput();
  p.dashAng=(ang!=null)?ang:(mi.m>.1?Math.atan2(mi.y,mi.x):p.aim);
  p.dashT=.19;p.dashLeft=p.dashCd;dashId++;p.iFrame=Math.max(p.iFrame,.28);
  TU.dashes++;Snd.dash();shake(5);burst(p.x,p.y,14,C.info,180,.5);ring(p.x,p.y,8,70,.3,C.info,2.5);}
function doNova(pl){
  const p=pl||P;
  if(coopGuest&&!pl){if(scene==='play'&&bloom>=100&&!p.down&&Net)Net.send({t:'nova'});return;}
  if(scene!=='play'||!p||p.down||bloom<100)return;
  bloom=0;novaId++;TU.novas++;nova={x:p.x,y:p.y,r:20,l:.75,m:.75,id:novaId,o:p.idx};
  p.iFrame=Math.max(p.iFrame,.7);Snd.nova();shake(24);whiteFlash=.55;slow(.45,.28);
  burst(p.x,p.y,70,C.bio,460,1.1);ring(p.x,p.y,20,760,.75,C.bio,9);ring(p.x,p.y,10,540,.55,C.white,4);
  toastAll('FLORADA ABISSAL');}
function fire(){
  const n=P.shots,sp=.13;
  for(let i=0;i<n;i++){
    const a=P.aim+(i-(n-1)/2)*sp+rnd(-.02,.02),crit=Math.random()<P.crit;
    bullets.push({x:P.x+Math.cos(a)*18,y:P.y+Math.sin(a)*18,vx:Math.cos(a)*790,vy:Math.sin(a)*790,a:a,l:.86,
      dmg:P.dmg*(crit?P.critMul:1),crit:crit,pierce:P.pierce,bounce:P.bounce,hits:[],o:P.idx,r:crit?5:3.6});}
  spark(P.x+Math.cos(P.aim)*20,P.y+Math.sin(P.aim)*20,P.aim,2,C.teal,110);
  P.vx-=Math.cos(P.aim)*16;P.vy-=Math.sin(P.aim)*16;Snd.shoot();}
let lives=3,livesOn=false;
function renderLives(){const el=$('lives');if(!el)return;
  const on=livesOn&&!endless&&!training;el.style.display=on?'flex':'none';
  if(on)el.innerHTML=Array.from({length:3},(_,i)=>'<i'+(i<lives?'':' class="lost"')+'></i>').join('');}
function loseLife(){
  lives--;renderLives();
  enemies=[];bullets=[];ebullets=[];beams=[];teles=[];nova=null;bossRef=null;cine=null;
  let k=0;
  for(const q of players){if(q.gone)continue;
    q.hp=q.maxHp;q.down=false;q.reviveT=0;q.iFrame=3;q.vx=0;q.vy=0;
    q.x=world.w/2+(coop?(k?70:-70):0);q.y=world.h/2;k++;}
  combo=0;comboT=0;hc.hp=-1;
  burst(P.x,P.y,70,C.crimson,380,1.2);ring(P.x,P.y,10,420,.8,C.crimson,6);
  shake(24);whiteFlash=.5;Snd.hurt();Snd.tone(300,.8,'sawtooth',.09,60);
  toastAll('VIDA PERDIDA · RESTAM '+lives+(lives===1?' VIDA':' VIDAS')+' · ONDA REINICIADA');
  startWave(wave);}
function checkTeamWipe(){
  if(players.filter(q=>!q.gone).every(q=>q.down)){
    if(livesOn&&!endless&&lives>1)loseLife();else gameOver();}}
function onPlayerDeath(){
  if(coop){
    if(!P.down){P.down=true;P.hp=0;P.reviveT=0;P.vx=0;P.vy=0;
      burst(P.x,P.y,50,C.crimson,320,1);ring(P.x,P.y,10,300,.7,C.crimson,5);Snd.hurt();
      toastAll(pname(P)+' CAIU · O PARCEIRO PODE REVIVER');}
    checkTeamWipe();return;}
  if(livesOn&&!endless&&!training&&lives>1)loseLife();else gameOver();}
function hurt(n,pl){
  if(coopGuest)return;
  if(pl&&pl!==P){const sv=P;P=pl;try{hurtCore(n);}finally{P=sv;}}else hurtCore(n);}
function hurtCore(n){
  if(!P||P.down||P.gone||P.iFrame>0||scene!=='play'||P.dashT>0||training)return;
  if(hasBuff('escudo')){delete P.buffs.escudo;P.iFrame=.9;ring(P.x,P.y,14,120,.4,C.info,4);
    burst(P.x,P.y,18,C.info,200,.6);Snd.tone(700,.3,'sine',.1,300);toastTo(P.idx,'ESCUDO ABSORVEU O IMPACTO');return;}
  P.hp-=n;P.iFrame=DIFF[difficulty].iframe;P.hitPulse=1;
  if(!coop){combo=0;comboT=0;}
  if(P===players[ME])dmgFlash=.75;else netEv(['hf',P.idx]);
  shake(17);if(!coop){slow(.32,.14);freeze=.05;}Snd.hurt();
  burst(P.x,P.y,22,C.crimson,260,.8);ring(P.x,P.y,10,150,.45,C.crimson,4);
  for(const e of enemies){const dx=e.x-P.x,dy=e.y-P.y,d=Math.hypot(dx,dy)||1;if(d<190){e.kx+=dx/d*300;e.ky+=dy/d*300;}}
  ebullets=ebullets.filter(b=>dist(b.x,b.y,P.x,P.y)>150);
  if(P.hp<=0){P.hp=0;onPlayerDeath();}}
function heal(n){if(!P)return;const b=P.hp;P.hp=Math.min(P.maxHp,P.hp+n);
  if(P.hp>b){Snd.heal();floater(P.x,P.y-26,'+'+(P.hp-b)+' CÉLULA',C.bio,14);ring(P.x,P.y,8,90,.4,C.bio,3);}}
function comboMult(){return Math.min(5,1+Math.floor(combo/5)*.5);}
const STREAKS=[[6,'ENXAME DISSOLVIDO',300],[12,'LUZ IMPARÁVEL',700],[20,'MASSACRE ABISSAL',1500],[30,'FOSSA SILENCIADA',3000]];
function showStreak(n){
  const s=STREAKS.filter(x=>x[0]===n)[0];if(!s)return;
  score+=Math.round(s[2]*DIFF[difficulty].score);
  $('streakName').textContent=s[1];$('streakSub').textContent=n+' ABATES SEGUIDOS · +'+fmt(s[2]);
  const el=$('streak');el.classList.remove('show');void el.offsetWidth;el.classList.add('show');
  netEv(['st',s[1],n+' ABATES SEGUIDOS · +'+fmt(s[2])]);
  Snd.tone(880,.3,'triangle',.09,1320);shake(7);whiteFlash=.16;}

/* ============================================================
   10 · DANO
   ============================================================ */
function damage(e,dmg,crit,kx,ky){
  if(e.dead)return;
  e.hp-=dmg;e.flash=.13;e.kx+=kx;e.ky+=ky;
  floater(e.x+rnd(-6,6),e.y-e.r*.8,String(Math.round(dmg)),crit?C.amber:C.sand,crit?17:12);
  burst(e.x,e.y,crit?7:3,e.c,140,.42);Snd.hit();
  if(e.hp<=0)kill(e);
  else if(e.type==='boss'&&e.phase===1&&e.hp<e.maxHp*.5){
    e.phase=2;e.spd*=1.22;shake(16);whiteFlash=.3;Snd.boss();
    $('bossPhase').textContent='FASE II · FÚRIA';
    ring(e.x,e.y,20,340,.8,C.violet,6);burst(e.x,e.y,44,C.violet,320,.9);toastAll(e.name+' · FASE II');}}
function kill(e){
  if(e.dead)return;e.dead=true;kills++;TU.kills++;
  const gain=Math.round(e.score*comboMult()*DIFF[difficulty].score);
  score+=gain;combo++;comboT=P.comboWindow;maxCombo=Math.max(maxCombo,combo);
  streakN++;streakT=2.4;showStreak(streakN);
  bloom=Math.min(100,bloom+3*P.bloomGain);
  const big=e.type==='boss'||e.r>24;
  burst(e.x,e.y,big?46:18,e.c,big?340:230,big?1:.7);
  ring(e.x,e.y,e.r*.5,e.r*(big?7:4),big?.7:.42,e.c,big?6:2.5);
  floater(e.x,e.y-e.r-8,'+'+fmt(gain),C.bio,big?19:14);
  ink.push({x:e.x,y:e.y,r:e.r*.8,r1:e.r*3.2,l:1.1,m:1.1,c:e.c});netEv(['ink',e.x,e.y,e.r,e.c]);
  Snd.kill(big);shake(big?12:3.5);
  const orbs=e.type==='boss'?26:rint(2,e.r>22?5:3);
  for(let i=0;i<orbs;i++){const a=rnd(0,TAU),s=rnd(40,190);
    pickups.push({x:e.x,y:e.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,t:'p',r:4.5,l:16,ph:rnd(0,TAU)});}
  if(e.type==='boss'){
    for(let i=0;i<4;i++)pickups.push({x:e.x+rnd(-70,70),y:e.y+rnd(-70,70),vx:rnd(-60,60),vy:rnd(-60,60),t:'h',r:9,l:22,ph:rnd(0,TAU)});
    for(let i=0;i<3;i++)pickups.push({x:e.x+rnd(-90,90),y:e.y+rnd(-90,90),vx:rnd(-50,50),vy:rnd(-50,50),t:pick(['frenesi','escudo','voragem']),r:11,l:24,ph:rnd(0,TAU)});
    bossRef=null;$('bossInfo').classList.remove('on');$('waveInfo').style.display='';
    slow(.3,1.1);freeze=.12;whiteFlash=.7;shake(30);
    for(let i=0;i<5;i++)ring(e.x,e.y,20+i*40,600+i*90,.9+i*.15,i%2?C.amber:C.magenta,7-i);
    burst(e.x,e.y,120,C.amber,520,1.5);toastAll(e.name+' DERROTADO');
  }else{
    const r=Math.random();
    if(r<.09)pickups.push({x:e.x,y:e.y,vx:rnd(-40,40),vy:rnd(-40,40),t:'h',r:9,l:20,ph:rnd(0,TAU)});
    else if(r<.16)pickups.push({x:e.x,y:e.y,vx:rnd(-40,40),vy:rnd(-40,40),t:pick(['frenesi','escudo','voragem']),r:11,l:18,ph:rnd(0,TAU)});}}

/* ============================================================
   11 · UPDATE
   ============================================================ */
function updatePlayers(dt){
  const sv=P;
  for(const q of players){if(q.gone)continue;P=q;updatePlayer(dt);}
  P=sv;if(coop)updateRevive(dt);}
function updateRevive(dt){
  for(const q of players){
    if(q.gone||!q.down)continue;
    let near=false;
    for(const o of players){if(o!==q&&!o.gone&&!o.down&&dist(q.x,q.y,o.x,o.y)<110){near=true;break;}}
    if(near){q.reviveT+=dt;
      if(q.reviveT>=3){q.down=false;q.hp=Math.max(2,Math.ceil(q.maxHp/2));q.iFrame=2.5;q.reviveT=0;
        ring(q.x,q.y,10,240,.7,C.bio,6);burst(q.x,q.y,40,C.bio,300,.9);Snd.heal();
        toastAll(pname(q)+' REVIVIDO!');}}
    else q.reviveT=Math.max(0,q.reviveT-dt*.5);}}
function update(dt){
  runTime+=dt;
  if(scene==='play'&&!training)waveClock+=dt;
  if(scene==='play'&&!training&&!bossRef&&wave>=2&&!abyssEvent){eventClock+=dt;if(eventClock>=40){eventClock=0;beginAbyssEvent();}}
  if(players[ME])P=players[ME];
  updateAbyssEvent(dt);updatePlayers(dt);updateEnemies(dt);updateBullets(dt);updateEBullets(dt);
  updatePickups(dt);updateVents(dt);updateEffects(dt);updateSpawns(dt);
  enemies=enemies.filter(e=>!e.dead);
  if(scene==='play'&&!training)for(const q of players){if(!q.gone&&!q.down&&q.hp<=0){const sv=P;P=q;onPlayerDeath();P=sv;}}
  if(training)updateTraining(dt);
  else if(scene==='play'&&!bossRef&&spawnQueue.length===0&&teles.length===0&&enemies.length===0){
    if(waveClock<waveDuration(wave)){
      // Reforços curtos mantêm a luta ativa até a trilha ter um trecho razoável para tocar.
      waveRestockTimer-=dt;
      if(waveRestockTimer<=0){
        const pool=[];waveDef(wave).s.forEach(a=>{for(let i=0;i<Math.max(1,Math.ceil(a[1]/4));i++)pool.push(a[0]);});
        const extra=Math.min(10,Math.max(5,pool.length*2));
        for(let i=0;i<extra;i++)spawnQueue.push(pool[rint(0,pool.length-1)]);
        waveRestockTimer=4.5;
      }
    }else waveComplete();
  }
  if(comboT>0){comboT-=dt;if(comboT<=0){combo=0;comboT=0;}}
  if(streakT>0){streakT-=dt;if(streakT<=0)streakN=0;}
  if(hintT>0){hintT-=dt;if(hintT<=0&&!training)$('hint').classList.remove('on');}
  if(cine){cine.t-=dt;if(cine.t<=0)cine=null;}
  sonarT-=dt;
  if(sonarT<=0){sonarT=7;sonarR=10;Snd.sonar();}
  if(sonarR>0){sonarR+=dt*620;if(sonarR>1000)sonarR=-1;}
  if(P.hp<=2&&!P.down&&!training){heartT-=dt;if(heartT<=0){heartT=1.15;Snd.beat();}}
  camUpdate(dt);
}
function updatePlayer(dt){
  const p=P;
  if(p.down){p.iFrame=0;p.vx*=Math.exp(-6*dt);p.vy*=Math.exp(-6*dt);p.x+=p.vx*dt;p.y+=p.vy*dt;p.orbA+=dt*2.3;return;}
  const rin=(p.remote&&p.inp&&performance.now()-p.inp.t<500)?p.inp:null;
  p.iFrame=Math.max(0,p.iFrame-dt);p.dashLeft=Math.max(0,p.dashLeft-dt);p.hitPulse=Math.max(0,p.hitPulse-dt*2.6);
  for(const k in p.buffs){p.buffs[k]-=dt;if(p.buffs[k]<=0){delete p.buffs[k];toastTo(p.idx,BUFFS[k].n+' EXPIROU');}}
  const mi=p.remote?((rin&&rin.mi)||{x:0,y:0,m:0}):moveInput();
  if(p.dashT>0){
    p.dashT-=dt;p.vx=Math.cos(p.dashAng)*1180;p.vy=Math.sin(p.dashAng)*1180;
    trail.push({x:p.x,y:p.y,a:p.aim,l:.3,m:.3});
    if(p.dashDmg>0)for(const e of enemies){
      if(e.dashHit===dashId||e.dead)continue;
      if(dist(e.x,e.y,p.x,p.y)<e.r+p.r+10){e.dashHit=dashId;damage(e,p.dashDmg,true,Math.cos(p.dashAng)*260,Math.sin(p.dashAng)*260);shake(6);}}
  }else{
    const acc=1-Math.exp(-15*dt);
    p.vx+=(mi.x*p.speed-p.vx)*acc;p.vy+=(mi.y*p.speed-p.vy)*acc;}
  const ox=p.x,oy=p.y;
  p.x+=p.vx*dt;p.y+=p.vy*dt;
  TU.moved+=dist(ox,oy,p.x,p.y);
  const m=p.r+14;
  if(p.x<m){p.x=m;p.vx=Math.abs(p.vx)*.2;}if(p.x>world.w-m){p.x=world.w-m;p.vx=-Math.abs(p.vx)*.2;}
  if(p.y<m){p.y=m;p.vy=Math.abs(p.vy)*.2;}if(p.y>world.h-m){p.y=world.h-m;p.vy=-Math.abs(p.vy)*.2;}
  if(Math.hypot(p.vx,p.vy)>120&&Math.random()<dt*22*pq())
    parts.push({x:p.x-Math.cos(p.aim)*12,y:p.y-Math.sin(p.aim)*12,vx:rnd(-20,20),vy:-rnd(10,40),l:.7,m:.7,r:rnd(1,2.6),c:C.info,d:1.4});
  let target=p.aim;
  if(p.remote&&rin&&rin.aim!=null)target=rin.aim;
  else if(!p.remote&&stickR.on&&stickR.mag>.2)target=Math.atan2(stickR.dy,stickR.dx);
  else if(!p.remote&&mouse.active&&!isTouch)target=Math.atan2(mouse.wy-p.y,mouse.wx-p.x);
  else if(!p.remote&&isTouch){target=p.aim;}
  else{let bd=1e9,bt=null;for(const e of enemies){const d=dist(e.x,e.y,p.x,p.y);if(d<bd&&d<760){bd=d;bt=e;}}
    if(bt)target=Math.atan2(bt.y+bt.vy*.1-p.y,bt.x+bt.vx*.1-p.x);else if(mi.m>.1)target=Math.atan2(mi.y,mi.x);}
  p.aim=angLerp(p.aim,target,Math.min(1,26*dt));
  p.fireCd-=dt;
  const rate=p.fireRate*(hasBuff('frenesi')?2.1:1);
  if(p.fireCd<=0&&enemies.length+teles.length>0){p.fireCd=1/rate;fire();}else if(p.fireCd<=0)p.fireCd=0;
  p.orbA+=dt*2.3;
  for(let i=0;i<p.orbs;i++){
    const a=p.orbA+i*TAU/p.orbs,ox2=p.x+Math.cos(a)*54,oy2=p.y+Math.sin(a)*54;
    for(const e of enemies){if(e.dead||e.orbCd>0)continue;
      if(dist(e.x,e.y,ox2,oy2)<e.r+9){e.orbCd=.42;damage(e,p.dmg*(abyssEvent&&abyssEvent.id==='echo'?.95:.7),false,Math.cos(a)*140,Math.sin(a)*140);}}}
  if(p.regen>0){p.regenT+=dt;if(p.regenT>=p.regen){p.regenT=0;if(p.hp<p.maxHp)heal(1);}}
  if(nova&&(nova.o||0)===p.idx){
    nova.l-=dt;nova.r+=(760-nova.r)*Math.min(1,dt*5.5);
    for(const e of enemies){if(e.dead||e.novaHit===nova.id)continue;
      if(dist(e.x,e.y,nova.x,nova.y)<nova.r+e.r){e.novaHit=nova.id;
        const a=Math.atan2(e.y-nova.y,e.x-nova.x);damage(e,p.dmg*4.5,true,Math.cos(a)*380,Math.sin(a)*380);}}
    ebullets=ebullets.filter(b=>dist(b.x,b.y,nova.x,nova.y)>nova.r);
    if(nova.l<=0)nova=null;}
  if(p.idx===0)for(let i=trail.length-1;i>=0;i--){trail[i].l-=dt;if(trail[i].l<=0)trail.splice(i,1);}
}
function updateEnemies(dt){
  for(let i=0;i<enemies.length;i++){const a=enemies[i];if(a.type==='boss')continue;
    for(let j=i+1;j<enemies.length;j++){const b=enemies[j];if(b.type==='boss')continue;
      const dx=b.x-a.x,dy=b.y-a.y,m=a.r+b.r,d2=dx*dx+dy*dy;
      if(d2<m*m&&d2>.01){const d=Math.sqrt(d2),pu=(m-d)*.5*Math.min(1,dt*10)/d;a.x-=dx*pu;a.y-=dy*pu;b.x+=dx*pu;b.y+=dy*pu;}}}
  for(const e of enemies){
    if(e.dead)continue;
    const p=nearestPlayer(e.x,e.y);TG=p;
    e.t+=dt;e.flash=Math.max(0,e.flash-dt);e.orbCd=Math.max(0,e.orbCd-dt);
    e.x+=e.kx*dt;e.y+=e.ky*dt;const kd=Math.exp(-6*dt);e.kx*=kd;e.ky*=kd;
    const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
    if(e.type==='boss')updateBoss(e,dt,ux,uy,d);
    else if(e.type==='drifter'){
      e.cd-=dt;if(e.cd<=0){e.cd=rnd(.9,1.35);e.vx=ux*e.spd*2.1;e.vy=uy*e.spd*2.1;e.pulse=1;}
      e.pulse=Math.max(0,e.pulse-dt*2.2);const dg=Math.exp(-1.9*dt);e.vx*=dg;e.vy*=dg;
      e.x+=e.vx*dt;e.y+=e.vy*dt;
    }else if(e.type==='dart'){
      const want=Math.atan2(dy,dx)+Math.sin(e.t*5.5)*.42;
      e.ang=angLerp(e.ang,want,Math.min(1,4.6*dt));
      e.vx=Math.cos(e.ang)*e.spd;e.vy=Math.sin(e.ang)*e.spd;e.x+=e.vx*dt;e.y+=e.vy*dt;
    }else if(e.type==='angler'){
      const err=d-310,px=-uy,py=ux;
      e.vx=ux*clamp(err,-1,1)*e.spd+px*e.spd*.65*Math.sin(e.t*.6+e.id);
      e.vy=uy*clamp(err,-1,1)*e.spd+py*e.spd*.65*Math.sin(e.t*.6+e.id);
      e.x+=e.vx*dt;e.y+=e.vy*dt;e.ang=angLerp(e.ang,Math.atan2(dy,dx),Math.min(1,3*dt));
      e.cd-=dt;
      if(e.cd<=0&&d<720){e.cd=rnd(2.1,3.1);const a=Math.atan2(dy,dx);
        ebullets.push({x:e.x+Math.cos(a)*e.r,y:e.y+Math.sin(a)*e.r,vx:Math.cos(a)*205,vy:Math.sin(a)*205,r:8,l:5.2,c:C.amber,homing:.9,t:0});
        Snd.tone(300,.16,'sine',.045,520);spark(e.x,e.y,a,4,C.amber,120);}
    }else if(e.type==='urchin'){
      e.spin+=dt*(e.cd<.6?7:1.3);e.cd-=dt;
      if(e.cd<=0){e.cd=rnd(2.4,3.4);const n=DIFF[difficulty].count>1?12:10,off=rnd(0,TAU);
        for(let i=0;i<n;i++){const a=off+i*TAU/n;
          ebullets.push({x:e.x+Math.cos(a)*e.r,y:e.y+Math.sin(a)*e.r,vx:Math.cos(a)*230,vy:Math.sin(a)*230,r:5.5,l:3.4,c:C.bio,homing:0,t:0});}
        ring(e.x,e.y,e.r,e.r*3,.35,C.bio,3);Snd.nz(.16,900,.06,'bandpass',0,300);}
      e.vx=Math.cos(e.t*.4+e.id)*e.spd;e.vy=Math.sin(e.t*.33+e.id*1.7)*e.spd;e.x+=e.vx*dt;e.y+=e.vy*dt;
    }else if(e.type==='crab'){
      e.cd-=dt;
      if(e.st==='idle'){e.ang=angLerp(e.ang,Math.atan2(dy,dx),Math.min(1,2.4*dt));
        e.x+=ux*e.spd*dt;e.y+=uy*e.spd*dt;
        if(e.cd<=0&&d<520){e.st='wind';e.stT=.68;e.lock=Math.atan2(dy,dx);Snd.tone(90,.5,'sawtooth',.08,140);}
      }else if(e.st==='wind'){e.stT-=dt;e.ang=angLerp(e.ang,e.lock,Math.min(1,6*dt));
        if(e.stT<=0){e.st='charge';e.stT=.6;e.vx=Math.cos(e.lock)*e.spd*5.4;e.vy=Math.sin(e.lock)*e.spd*5.4;
          Snd.nz(.3,420,.11,'bandpass',0,1400);burst(e.x,e.y,12,C.crimson,200,.5);}
      }else if(e.st==='charge'){e.stT-=dt;e.x+=e.vx*dt;e.y+=e.vy*dt;
        if(Math.random()<.5*pq())parts.push({x:e.x,y:e.y,vx:rnd(-30,30),vy:rnd(-30,30),l:.35,m:.35,r:rnd(2,4),c:C.crimson,d:2});
        if(e.stT<=0){e.st='rest';e.stT=.85;}
      }else{e.stT-=dt;e.vx*=Math.exp(-5*dt);e.vy*=Math.exp(-5*dt);if(e.stT<=0){e.st='idle';e.cd=rnd(1.5,2.6);}}
    }else if(e.type==='eel'){
      e.ang=angLerp(e.ang,Math.atan2(dy,dx),Math.min(1,3*dt));
      if(e.st==='idle'){
        const err=d-360;e.x+=ux*clamp(err/120,-1,1)*e.spd*dt;e.y+=uy*clamp(err/120,-1,1)*e.spd*dt;
        e.x+=-uy*e.spd*.5*Math.sin(e.t*.8)*dt;e.y+=ux*e.spd*.5*Math.sin(e.t*.8)*dt;
        e.cd-=dt;if(e.cd<=0&&d<760){e.st='aim';e.stT=1;e.beamAng=Math.atan2(dy,dx);Snd.tone(180,.9,'sine',.05,900);}
      }else if(e.st==='aim'){
        e.stT-=dt;if(e.stT>.4)e.beamAng=angLerp(e.beamAng,Math.atan2(dy,dx),Math.min(1,2.4*dt));
        if(e.stT<=0){e.st='beam';e.stT=.3;Snd.zap();shake(9);
          beams.push({x:e.x,y:e.y,a:e.beamAng,l:.3,m:.3,len:940,c:C.info});
          burst(e.x,e.y,16,C.info,220,.5);}
      }else{
        e.stT-=dt;
        const x2=e.x+Math.cos(e.beamAng)*940,y2=e.y+Math.sin(e.beamAng)*940;
        for(const q of players){if(q.gone||q.down)continue;if(segDist(q.x,q.y,e.x,e.y,x2,y2)<18+q.r*.5)hurt(1,q);}
        if(e.stT<=0){e.st='idle';e.cd=rnd(2.4,3.6);}}
    }
    const mm=e.r+8;
    if(e.x<mm){e.x=mm;e.vx=Math.abs(e.vx);}if(e.x>world.w-mm){e.x=world.w-mm;e.vx=-Math.abs(e.vx);}
    if(e.y<mm){e.y=mm;e.vy=Math.abs(e.vy);}if(e.y>world.h-mm){e.y=world.h-mm;e.vy=-Math.abs(e.vy);}
    for(const q of players){
      if(q.gone||q.down)continue;
      if(e.type==='boss'&&e.kind==='leviathan'){
        if(dist(e.x,e.y,q.x,q.y)<e.r+q.r)hurt(1,q);
        for(let i=1;i<e.segs.length;i+=2){if(dist(e.segs[i].x,e.segs[i].y,q.x,q.y)<20+q.r){hurt(1,q);break;}}
      }else{
        const dd=dist(e.x,e.y,q.x,q.y);
        if(dd<e.r*.85+q.r){hurt(1,q);const ex=q.x-e.x,ey=q.y-e.y,ll=Math.hypot(ex,ey)||1;e.kx-=ex/ll*220;e.ky-=ey/ll*220;}}}
  }
}
function updateBoss(e,dt,ux,uy,d){
  e.cd-=dt;e.stT-=dt;const ph=e.phase;
  if(e.kind==='medusa'){
    const err=d-300,px=-uy,py=ux;
    e.vx=ux*clamp(err/160,-1,1)*e.spd+px*e.spd*.8*Math.sin(e.t*.45);
    e.vy=uy*clamp(err/160,-1,1)*e.spd+py*e.spd*.8*Math.sin(e.t*.45);
    e.x+=e.vx*dt;e.y+=e.vy*dt;e.spin+=dt*.5;
    if(e.st==='idle'&&e.cd<=0){
      const pats=['burst','spiral','summon','slam'];e.st=pats[e.pat%4];e.pat++;e.sub=0;
      e.stT=e.st==='spiral'?2.2:e.st==='burst'?1.4:e.st==='slam'?1.5:.7;
      if(e.st==='summon'){const n=ph===2?5:3;
        for(let i=0;i<n;i++){const a=rnd(0,TAU);
          teles.push({x:clamp(e.x+Math.cos(a)*140,60,world.w-60),y:clamp(e.y+Math.sin(a)*140,60,world.h-60),t:.7,type:i%2?'dart':'drifter'});}
        Snd.tone(220,.4,'triangle',.07,440);}
      if(e.st==='slam'){e.slamX=TG.x;e.slamY=TG.y;ring(TG.x,TG.y,10,150,1.2,C.violet,3);}}
    if(e.st==='burst'){
      e.sub-=dt;
      if(e.sub<=0){e.sub=ph===2?.36:.5;const n=ph===2?20:14,off=rnd(0,TAU);
        for(let i=0;i<n;i++){const a=off+i*TAU/n;
          ebullets.push({x:e.x+Math.cos(a)*e.r*.8,y:e.y+Math.sin(a)*e.r*.8,vx:Math.cos(a)*215,vy:Math.sin(a)*215,r:7,l:4.4,c:C.magenta,homing:0,t:0});}
        ring(e.x,e.y,e.r*.7,e.r*1.8,.3,C.magenta,3);Snd.nz(.2,600,.08,'bandpass',0,220);}
      if(e.stT<=0){e.st='idle';e.cd=ph===2?1.1:1.8;}
    }else if(e.st==='spiral'){
      e.sub-=dt;
      if(e.sub<=0){e.sub=.075;e.spin+=.42;const k=ph===2?3:2;
        for(let i=0;i<k;i++){const a=e.spin+i*TAU/k;
          ebullets.push({x:e.x+Math.cos(a)*e.r*.7,y:e.y+Math.sin(a)*e.r*.7,vx:Math.cos(a)*245,vy:Math.sin(a)*245,r:6,l:4,c:C.violet,homing:0,t:0});}
        if(Math.random()<.3)Snd.tone(rnd(500,700),.05,'triangle',.025,300);}
      if(e.stT<=0){e.st='idle';e.cd=ph===2?.9:1.6;}
    }else if(e.st==='slam'){
      if(e.stT<=0){const R=150;
        ring(e.slamX,e.slamY,20,R*1.4,.5,C.magenta,7);burst(e.slamX,e.slamY,30,C.violet,300,.8);
        shake(12);Snd.nz(.4,300,.15,'lowpass');
        for(const q of players){if(!q.gone&&!q.down&&dist(q.x,q.y,e.slamX,e.slamY)<R)hurt(1,q);}
        for(let i=0;i<10;i++){const a=i*TAU/10;
          ebullets.push({x:e.slamX,y:e.slamY,vx:Math.cos(a)*190,vy:Math.sin(a)*190,r:6,l:3,c:C.magenta,homing:0,t:0});}
        e.st='idle';e.cd=ph===2?1:1.7;}
    }else if(e.st==='summon'&&e.stT<=0){e.st='idle';e.cd=1.4;}
  }else{
    const turn=e.st==='charge'?1.1:2.1;
    const want=Math.atan2(TG.y-e.y,TG.x-e.x)+Math.sin(e.t*.7)*.5;
    e.ang=angLerp(e.ang,want,Math.min(1,turn*dt));
    const sp=e.spd*(e.st==='charge'?2.3:1)*(ph===2?1.15:1);
    e.vx=Math.cos(e.ang)*sp;e.vy=Math.sin(e.ang)*sp;e.x+=e.vx*dt;e.y+=e.vy*dt;
    let prev={x:e.x,y:e.y};
    for(let i=0;i<e.segs.length;i++){const s=e.segs[i],dx=prev.x-s.x,dy=prev.y-s.y,dd=Math.hypot(dx,dy)||1;
      if(dd>27){s.x+=dx/dd*(dd-27);s.y+=dy/dd*(dd-27);}prev=s;}
    if(e.st==='idle'&&e.cd<=0){
      const pats=['spit','charge','summon','spit'];e.st=pats[e.pat%4];e.pat++;e.sub=0;
      e.stT=e.st==='charge'?1.5:e.st==='spit'?1.3:.6;
      if(e.st==='charge'){Snd.tone(70,.9,'sawtooth',.16,120);shake(10);}
      if(e.st==='summon')for(let i=0;i<(ph===2?6:4);i++){const a=rnd(0,TAU);
        teles.push({x:clamp(e.x+Math.cos(a)*180,60,world.w-60),y:clamp(e.y+Math.sin(a)*180,60,world.h-60),t:.7,type:'dart'});}}
    if(e.st==='spit'){
      e.sub-=dt;
      if(e.sub<=0){e.sub=ph===2?.28:.42;const base=Math.atan2(TG.y-e.y,TG.x-e.x),n=ph===2?7:5;
        for(let i=0;i<n;i++){const a=base+(i-(n-1)/2)*.19;
          ebullets.push({x:e.x+Math.cos(a)*e.r,y:e.y+Math.sin(a)*e.r,vx:Math.cos(a)*280,vy:Math.sin(a)*280,r:8,l:4,c:C.amber,homing:.35,t:0});}
        Snd.nz(.18,700,.08,'bandpass',0,260);spark(e.x,e.y,base,6,C.amber,180);}
      if(e.stT<=0){e.st='idle';e.cd=ph===2?1:1.7;}
    }else if(e.st==='charge'){
      if(Math.random()<.7*pq())parts.push({x:e.x+rnd(-20,20),y:e.y+rnd(-20,20),vx:rnd(-40,40),vy:rnd(-40,40),l:.5,m:.5,r:rnd(2,5),c:C.amber,d:2});
      if(e.stT<=0){e.st='idle';e.cd=ph===2?.9:1.5;}
    }else if(e.st==='summon'&&e.stT<=0){e.st='idle';e.cd=1.3;}
  }
}
function updateBullets(dt){
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.l-=dt;let dead=b.l<=0;
    if(!dead){
      if(b.x<6||b.x>world.w-6){if(b.bounce>0){b.bounce--;b.vx*=-1;b.a=Math.atan2(b.vy,b.vx);b.x=clamp(b.x,6,world.w-6);spark(b.x,b.y,b.a,3,C.teal,90);ring(b.x,b.y,4,34,.3,C.teal,2);}else dead=true;}
      if(b.y<6||b.y>world.h-6){if(b.bounce>0){b.bounce--;b.vy*=-1;b.a=Math.atan2(b.vy,b.vx);b.y=clamp(b.y,6,world.h-6);spark(b.x,b.y,b.a,3,C.teal,90);ring(b.x,b.y,4,34,.3,C.teal,2);}else dead=true;}}
    if(!dead)for(const e of enemies){
      if(e.dead||b.hits.indexOf(e.id)>=0)continue;
      let hit=dist(b.x,b.y,e.x,e.y)<e.r+b.r;
      if(!hit&&e.type==='boss'&&e.kind==='leviathan')
        for(let k=1;k<e.segs.length;k++)if(dist(b.x,b.y,e.segs[k].x,e.segs[k].y)<20+b.r){hit=true;break;}
      if(hit){b.hits.push(e.id);const a=Math.atan2(b.vy,b.vx);
        {const sv=P;if(players[b.o||0])P=players[b.o||0];damage(e,b.dmg,b.crit,Math.cos(a)*90,Math.sin(a)*90);P=sv;}
        spark(b.x,b.y,a+PI,4,b.crit?C.amber:C.teal,150);
        if(b.pierce>0)b.pierce--;else dead=true;break;}}
    if(dead){burst(b.x,b.y,2,C.teal,60,.25);bullets.splice(i,1);}
  }
}
function updateEBullets(dt){
  for(let i=ebullets.length-1;i>=0;i--){
    const b=ebullets[i];b.t+=dt;b.l-=dt;
    if(b.homing>0&&players.length){const tp=nearestPlayer(b.x,b.y);const a=Math.atan2(b.vy,b.vx),want=Math.atan2(tp.y-b.y,tp.x-b.x);
      const na=angLerp(a,want,Math.min(1,b.homing*dt)),sp=Math.hypot(b.vx,b.vy);
      b.vx=Math.cos(na)*sp;b.vy=Math.sin(na)*sp;
      if(Math.random()<.25*pq())parts.push({x:b.x,y:b.y,vx:rnd(-14,14),vy:rnd(-14,14),l:.35,m:.35,r:rnd(1.4,3),c:b.c,d:2});}
    b.x+=b.vx*dt;b.y+=b.vy*dt;
    let dead=b.l<=0||b.x<4||b.x>world.w-4||b.y<4||b.y>world.h-4;
    if(!dead)for(const q of players){if(q.gone||q.down)continue;if(dist(b.x,b.y,q.x,q.y)<q.r+b.r*.8){hurt(1,q);dead=true;break;}}
    if(dead){burst(b.x,b.y,4,b.c,110,.35);ebullets.splice(i,1);}
  }
}
function updatePickups(dt){
  const sv0=P;let mag=0;
  for(let i=pickups.length-1;i>=0;i--){
    const o=pickups[i];o.l-=dt;o.ph+=dt*3;
    P=nearestPlayer(o.x,o.y);mag=P.magnet*(hasBuff('voragem')?3.5:1);
    const d=dist(o.x,o.y,P.x,P.y);
    if(d<mag){const a=Math.atan2(P.y-o.y,P.x-o.x),pull=clamp((mag-d)/mag,0,1)*1250;
      o.vx+=Math.cos(a)*pull*dt;o.vy+=Math.sin(a)*pull*dt;}
    const dg=Math.exp(-2.2*dt);o.vx*=dg;o.vy*=dg;o.x+=o.vx*dt;o.y+=o.vy*dt;
    o.x=clamp(o.x,10,world.w-10);o.y=clamp(o.y,10,world.h-10);
    if(d<P.r+o.r+4){
      if(o.t==='p'){const g=Math.round(5*comboMult()*DIFF[difficulty].score*(hasBuff('voragem')?2:1));
        score+=g;plankton++;TU.plank++;bloom=Math.min(100,bloom+2*P.bloomGain);
        Snd.pickup();burst(o.x,o.y,3,C.bio,80,.3);
      }else if(o.t==='h'){heal(1);burst(o.x,o.y,12,C.teal,150,.6);
      }else{P.buffs[o.t]=BUFFS[o.t].d;Snd.power();toastTo(P.idx,BUFFS[o.t].n+' ATIVO');
        ring(P.x,P.y,10,140,.5,BUFFS[o.t].c,4);burst(o.x,o.y,20,BUFFS[o.t].c,200,.7);}
      pickups.splice(i,1);continue;}
    if(o.l<=0)pickups.splice(i,1);
  }
  P=sv0;
}
function updateVents(dt){
  if(training)return;
  for(const v of vents){
    v.t-=dt;v.ph+=dt;
    if(v.st==='idle'){
      if(Math.random()<dt*3*pq())plume(v.x,v.y-16,1,C.slate,40);
      if(v.t<=0){v.st='warn';v.t=1.3;Snd.tone(60,1.2,'sine',.07,90);ring(v.x,v.y,10,v.r,1.3,C.amber,2);}
    }else if(v.st==='warn'){
      if(Math.random()<dt*20*pq())plume(v.x,v.y-16,1,C.amber,90);
      if(v.t<=0){v.st='erupt';v.t=1.5;Snd.vent();shake(9);
        ring(v.x,v.y,10,v.r*1.6,.5,C.crimson,5);burst(v.x,v.y,26,C.amber,220,.9);}
    }else{
      plume(v.x,v.y-16,Math.random()<dt*70?2:0,C.amber,320);
      for(const q of players){if(!q.gone&&!q.down&&dist(q.x,q.y,v.x,v.y)<v.r)hurt(1,q);}
      for(const e of enemies)if(!e.dead&&e.type!=='boss'&&dist(e.x,e.y,v.x,v.y)<v.r)damage(e,55*dt,false,0,-60);
      if(v.t<=0){v.st='idle';v.t=rnd(7,12);}}
  }
}
function updateEffects(dt){
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.l-=dt;
    if(p.l<=0){parts.splice(i,1);continue;}
    p.x+=p.vx*dt;p.y+=p.vy*dt;const dg=Math.exp(-p.d*dt);p.vx*=dg;p.vy*=dg;}
  for(let i=rings.length-1;i>=0;i--){const r=rings[i];r.l-=dt;
    if(r.l<=0){rings.splice(i,1);continue;}r.r+=(r.r1-r.r)*Math.min(1,dt*7);}
  for(let i=floats.length-1;i>=0;i--){const f=floats[i];f.l-=dt;
    if(f.l<=0){floats.splice(i,1);continue;}f.y+=f.vy*dt;f.x+=f.vx*dt;f.vy*=Math.exp(-2*dt);}
  for(let i=beams.length-1;i>=0;i--){beams[i].l-=dt;if(beams[i].l<=0)beams.splice(i,1);}
  for(let i=ink.length-1;i>=0;i--){const k=ink[i];k.l-=dt;k.r+=(k.r1-k.r)*Math.min(1,dt*3);if(k.l<=0)ink.splice(i,1);}
  dmgFlash=Math.max(0,dmgFlash-dt*1.9);whiteFlash=Math.max(0,whiteFlash-dt*2.4);
  cam.shake*=Math.exp(-7*dt);
}
function updateSpawns(dt){
  for(let i=teles.length-1;i>=0;i--){
    const t=teles[i];t.t-=dt;
    if(t.t<=0){const e=makeEnemy(t.type,t.x,t.y);enemies.push(e);
      ring(t.x,t.y,6,DEF[t.type].r*3,.35,DEF[t.type].c,2.5);burst(t.x,t.y,10,DEF[t.type].c,140,.5);
      Snd.tone(rnd(180,260),.12,'sine',.035,420);teles.splice(i,1);}}
  if(spawnQueue.length===0)return;
  spawnTimer-=dt;
  const cap=Math.round(DIFF[difficulty].cap*coopK());
  if(spawnTimer<=0&&enemies.length+teles.length<cap){
    const group=Math.min(spawnQueue.length,rint(1,2));
    for(let i=0;i<group;i++){
      if(!spawnQueue.length)break;
      const type=spawnQueue.pop(),pos=spawnPos(type==='dart'?300:360);
      if(type==='dart'){const pack=Math.min(spawnQueue.length+1,rint(2,4));
        for(let k=0;k<pack;k++){teles.push({x:clamp(pos.x+rnd(-50,50),60,world.w-60),y:clamp(pos.y+rnd(-50,50),60,world.h-60),t:.7+k*.07,type:'dart'});
          if(k>0&&spawnQueue.length)spawnQueue.pop();}
      }else teles.push({x:pos.x,y:pos.y,t:.75,type:type});}
    spawnTimer=waveSpawnGap*rnd(.8,1.2);}
}
const TUTSTEPS=[
 {t:'NADE COM O ANALÓGICO ESQUERDO OU WASD',g:()=>Math.min(1,TU.moved/700)},
 {t:'USE O JATO PROPULSOR (ESPAÇO / BOTÃO JATO)',g:()=>Math.min(1,TU.dashes/1)},
 {t:'COLETE 8 GRÃOS DE PLÂNCTON VERDE',g:()=>Math.min(1,TU.plank/8)},
 {t:'CARREGUE E SOLTE A FLORADA (E / BOTÃO FLORADA)',g:()=>Math.min(1,TU.novas/1)},
 {t:'DISSOLVA 5 CRIATURAS DE TREINO',g:()=>Math.min(1,TU.kills/5)}];
function updateTraining(dt){
  if(TU.step<TUTSTEPS.length){
    const s=TUTSTEPS[TU.step];
    $('hint').innerHTML='<b>TREINO '+(TU.step+1)+'/5</b> · '+s.t+' <span class="prog">'+Math.round(s.g()*100)+'%</span>';
    $('hint').classList.add('on');
    if(s.g()>=1){TU.step++;Snd.up();toast('PASSO CONCLUÍDO');ring(P.x,P.y,10,160,.5,C.bio,4);
      if(TU.step>=TUTSTEPS.length){$('hint').innerHTML='<b>TREINO CONCLUÍDO</b> · pause e escolha MENU para mergulhar de verdade';
        toast('TREINO CONCLUÍDO · VOCÊ ESTÁ PRONTO');bloom=100;}}
  }
  if(enemies.length<5&&Math.random()<dt*.9){const pos=spawnPos(280);teles.push({x:pos.x,y:pos.y,t:.7,type:pick(['drifter','dart','urchin'])});}
  if(pickups.length<10&&Math.random()<dt*3){const a=rnd(0,TAU),d=rnd(120,340);
    pickups.push({x:clamp(P.x+Math.cos(a)*d,20,world.w-20),y:clamp(P.y+Math.sin(a)*d,20,world.h-20),vx:0,vy:0,t:'p',r:4.5,l:30,ph:rnd(0,TAU)});}
  bloom=Math.min(100,bloom+dt*(TU.step>=3?9:2.5));
}
function camUpdate(dt){
  const vw=view.w/zoom,vh=view.h/zoom;
  const tx=P.x+Math.cos(P.aim)*46,ty=P.y+Math.sin(P.aim)*46;
  let cx=tx-vw/2,cy=ty-vh/2;
  cx=world.w<=vw?(world.w-vw)/2:clamp(cx,0,world.w-vw);
  cy=world.h<=vh?(world.h-vh)/2:clamp(cy,0,world.h-vh);
  const k=Math.min(1,7*dt);cam.x+=(cx-cam.x)*k;cam.y+=(cy-cam.y)*k;
  cam.ox=rnd(-cam.shake,cam.shake);cam.oy=rnd(-cam.shake,cam.shake);
}

/* ============================================================
   12 · DESENHO DO MUNDO
   ============================================================ */
function setScreen(){ctx.setTransform(DPR,0,0,DPR,0,0);}
function setWorld(){ctx.setTransform(DPR*zoom,0,0,DPR*zoom,DPR*(cam.ox-cam.x*zoom),DPR*(cam.oy-cam.y*zoom));}
/* ---------- iluminação dinâmica: camada de escuridão furada por luzes ---------- */
let lightCan=null,lightX=null,lightSpr=null;
function lightSprite(){if(lightSpr)return lightSpr;const c=document.createElement('canvas');c.width=c.height=128;const q=c.getContext('2d'),gr=q.createRadialGradient(64,64,0,64,64,64);
  gr.addColorStop(0,'rgba(0,0,0,1)');gr.addColorStop(.4,'rgba(0,0,0,.7)');gr.addColorStop(.75,'rgba(0,0,0,.22)');gr.addColorStop(1,'rgba(0,0,0,0)');
  q.fillStyle=gr;q.fillRect(0,0,128,128);return lightSpr=c;}
function drawLighting(){
  if(!SET.light||ctxTag!=='main'||!P||!(scene==='play'||scene==='pause'||scene==='upgrade'))return;
  const w=Math.ceil(view.w*LR),h=Math.ceil(view.h*LR);
  if(!lightCan||lightCan.width!==w||lightCan.height!==h){lightCan=document.createElement('canvas');lightCan.width=w;lightCan.height=h;lightX=lightCan.getContext('2d');}
  const L=lightX,spr=lightSprite(),ti=Math.max(0,THEMES.indexOf(theme)),D=SET.contrast?.3:.4+ti*.085,k=zoom*LR,full=perf.q>=1;
  L.setTransform(1,0,0,1,0,0);L.globalCompositeOperation='source-over';L.globalAlpha=1;L.clearRect(0,0,w,h);
  L.fillStyle='rgba(1,5,11,'+D+')';L.fillRect(0,0,w,h);L.globalCompositeOperation='destination-out';
  const lt=(x,y,r,a)=>{const sx=(cam.ox+(x-cam.x)*zoom)*LR,sy=(cam.oy+(y-cam.y)*zoom)*LR,rr=r*k;
    if(sx<-rr||sy<-rr||sx>w+rr||sy>h+rr)return;L.globalAlpha=a;L.drawImage(spr,sx-rr,sy-rr,rr*2,rr*2);};
  for(const q of players){if(q&&!q.gone&&!q.down&&q.hp>0)lt(q.x,q.y,440+Math.sin(T*2.1)*18+(q.hp<=2?Math.sin(T*17)*24:0),1);}
  for(const e of enemies){if(e.dead)continue;
    if(e.type==='boss'){lt(e.x,e.y,e.r*7,.9);if(e.segs)for(let i=1;i<e.segs.length;i+=2)lt(e.segs[i].x,e.segs[i].y,130,.55);}
    else lt(e.x,e.y,Math.max(90,e.r*5.5),.8);}
  for(const p of pickups)lt(p.x,p.y,115,.85);
  for(const t of teles)lt(t.x,t.y,100,.7);
  if(full){for(const b of bullets)lt(b.x,b.y,95,.85);for(const b of ebullets)lt(b.x,b.y,115,.9);}
  L.globalAlpha=1;L.globalCompositeOperation='source-over';
  setScreen();ctx.drawImage(lightCan,0,0,view.w,view.h);
}
function render(){
  setScreen();ctx.globalCompositeOperation='source-over';
  if(bgCan)ctx.drawImage(bgCan,0,0,view.w,view.h);else{ctx.fillStyle=C.abyss;ctx.fillRect(0,0,view.w,view.h);}
  drawRays();drawSpires();if(fogGrad){ctx.fillStyle=fogGrad;ctx.fillRect(0,0,view.w,view.h);}drawDust();
  setWorld();
  drawCaustics();drawGrid();drawFloorLight();drawKelp();drawRocks();drawVents();drawInk();drawBorder();drawAbyssEvent();
  drawPickups();drawTeles();drawEnemies();drawBeams();drawEBullets();
  drawTrail();if(P&&scene!=='boot'&&scene!=='menu'&&scene!=='dive')drawPlayer();
  if(scene==='boot'||scene==='menu'||scene==='coop'||scene==='howto'||scene==='bestiary'||scene==='records'||scene==='settings')drawAmbient();
  drawBullets();drawParticles();drawRings();drawFloats();
  if(sonarR>0&&P){ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle=rgba(C.teal,.14*(1-sonarR/1000));ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(P.x,P.y,sonarR,0,TAU);ctx.stroke();ctx.globalCompositeOperation='source-over';}
  drawLighting();setScreen();drawBubbles();drawBokeh();drawVignette();
  if(scene==='play'){if(SET.arrows)drawEdgeArrows();if(!isTouch&&view.w>820)drawRadar();}
  if(cine)drawCine();
}
function sphereSpec(r){ctx.globalCompositeOperation='lighter';blob(-r*.32,-r*.36,r*.5,C.white,.34);ctx.globalCompositeOperation='source-over';
  ctx.strokeStyle='rgba(255,255,255,.2)';ctx.lineWidth=Math.max(1,r*.07);ctx.beginPath();ctx.arc(0,0,r*.86,PI*1.05,PI*1.55);ctx.stroke();}
function floorShadow(r,lift,L){L=L||{x:0,y:0,k:.7};const a=.34*(.5+L.k*.5);
  ctx.save();ctx.translate(-L.x*r*.6,r*.95+(lift||0)-L.y*r*.3);ctx.rotate(Math.atan2(-L.y,-L.x)*.35);
  ctx.fillStyle='rgba(0,4,8,'+a+')';ctx.beginPath();ctx.ellipse(0,0,r*(1+Math.hypot(L.x,L.y)*.25),r*.36,0,0,TAU);ctx.fill();ctx.restore();}
function lightOf(x,y){
  if((scene==='play'||scene==='pause'||scene==='upgrade')&&P&&P.alive!==false&&P.hp>0){const dx=P.x-x,dy=P.y-y,d=Math.hypot(dx,dy)||1;
    return{x:dx/d,y:dy/d,k:clamp(1.15-d/1000,.3,1)};}
  return{x:-.55,y:-.83,k:.7};}
function depthScale(wy){if(ctxTag!=='main')return 1;return 1+clamp((wy-cam.y)*zoom/view.h-.5,-.6,.6)*.2;}
function shadeSprite(c,R,r,lx,ly,k){
  c.globalCompositeOperation='source-atop';
  let g=c.createLinearGradient(lx*r,ly*r,-lx*r,-ly*r);
  g.addColorStop(0,'rgba(255,255,255,'+(.2*k)+')');g.addColorStop(.4,'rgba(255,255,255,0)');
  g.addColorStop(.6,'rgba(0,8,18,0)');g.addColorStop(1,'rgba(0,8,18,.7)');
  c.fillStyle=g;c.fillRect(-R,-R,R*2,R*2);
  const sx=lx*r*.45,sy=ly*r*.45;g=c.createRadialGradient(sx,sy,0,sx,sy,r*.55);
  g.addColorStop(0,'rgba(255,255,255,'+(.55*k)+')');g.addColorStop(1,'rgba(255,255,255,0)');
  c.fillStyle=g;c.fillRect(-R,-R,R*2,R*2);
  g=c.createRadialGradient(0,0,r*.55,0,0,r*1.15);
  g.addColorStop(0,'rgba(120,255,235,0)');g.addColorStop(.75,'rgba(120,255,235,'+(.1+.12*k)+')');g.addColorStop(1,'rgba(170,255,240,'+(.34*k+.1)+')');
  c.fillStyle=g;c.fillRect(-R,-R,R*2,R*2);
  c.globalCompositeOperation='source-over';}
const SC=document.createElement('canvas'),SC2=document.createElement('canvas');let SCX=null,SCX2=null;
function drawBodyRaw(e){
  if(e.type==='drifter')drawJellyNew(e);else if(e.type==='dart')drawDartNew(e);else if(e.type==='angler')drawAnglerNew(e);
  else if(e.type==='urchin')drawUrchinNew(e);else if(e.type==='crab')drawCrabNew(e);else if(e.type==='eel')drawEelNew(e);
  else if(e.type==='boss'){e.kind==='medusa'?drawMedusaNew(e):drawLeviathan(e);}}
function drawBody3D(e,L){
  const r=e.r,R=Math.ceil(r*(e.type==='boss'?3.2:2.7)),S=R*2,px=Math.round(S*DPR);
  if(MOBILE||e.kind==='leviathan'||perf.q<1||px>1400){ctx.save();drawBodyRaw(e);ctx.restore();if(e.kind!=='leviathan')sphereSpec(r*.9);return;}
  if(!SCX){SC.width=SC.height=SC2.width=SC2.height=1410;SCX=SC.getContext('2d');SCX2=SC2.getContext('2d');}
  const m=ctx,mt=ctxTag;
  SCX.setTransform(1,0,0,1,0,0);SCX.globalAlpha=1;SCX.globalCompositeOperation='source-over';SCX.setLineDash([]);SCX.clearRect(0,0,px+2,px+2);
  SCX.setTransform(DPR,0,0,DPR,R*DPR,R*DPR);
  ctx=SCX;ctxTag='sc';
  try{drawBodyRaw(e);}finally{ctx=m;ctxTag=mt;}
  SCX.setTransform(DPR,0,0,DPR,R*DPR,R*DPR);SCX.globalAlpha=1;
  shadeSprite(SCX,R,r,L.x,L.y,L.k);
  if(r>=10){const n=r>=19?5:3;
    SCX2.setTransform(1,0,0,1,0,0);SCX2.globalCompositeOperation='source-over';SCX2.clearRect(0,0,px+2,px+2);
    SCX2.drawImage(SC,0,0,px,px,0,0,px,px);
    SCX2.globalCompositeOperation='source-atop';SCX2.fillStyle='rgba(2,12,20,.8)';SCX2.fillRect(0,0,px,px);SCX2.globalCompositeOperation='source-over';
    for(let q=n;q>=1;q--)ctx.drawImage(SC2,0,0,px,px,-R-L.x*q*1.3,-R+q*2.6-L.y*q*.8,S,S);}
  ctx.drawImage(SC,0,0,px,px,-R,-R,S,S);}
function drawFloorLight(){
  if(!P||!(scene==='play'||scene==='pause'||scene==='upgrade'))return;
  ctx.save();ctx.translate(P.x,P.y+P.r*1.1);ctx.scale(1,.42);ctx.globalCompositeOperation='lighter';
  blob(0,0,300,C.teal,.2);blob(0,0,130,C.info,.18);ctx.restore();
  for(const e of enemies){if(e.dead||e.r<16)continue;
    ctx.save();ctx.translate(e.x,e.y+e.r*.9);ctx.scale(1,.4);ctx.globalCompositeOperation='lighter';blob(0,0,e.r*3.4,e.c,.16);ctx.restore();}
  ctx.globalCompositeOperation='source-over';
}
function drawBokeh(){
  if(scene==='boot')return;
  ctx.globalCompositeOperation='lighter';
  const W=view.w+260,H=view.h+260;
  for(let i=0;i<7;i++){const f=.9+i*.05;
    const x=(((i*263+40-cam.x*f*zoom+Math.sin(T*.2+i)*30)%W)+W)%W-130;
    const y=(((i*181+T*(6+i*2)-cam.y*f*zoom)%H)+H)%H-130;
    blob(x,y,34+i*9,i%2?theme.acc:C.info,.05);}
  ctx.globalCompositeOperation='source-over';
}
function drawRocks(){
  const vw=view.w/zoom,vh=view.h/zoom;
  for(const o of rocks){
    if(o.x<cam.x-80||o.x>cam.x+vw+80||o.y<cam.y-80||o.y>cam.y+vh+80)continue;
    const L=lightOf(o.x,o.y),r=o.r;
    ctx.save();ctx.translate(o.x,o.y);
    ctx.fillStyle='rgba(0,4,8,'+(.32*L.k+.08)+')';ctx.beginPath();ctx.ellipse(-L.x*r*.5,-L.y*r*.3+r*.55,r*1.25,r*.42,0,0,TAU);ctx.fill();
    ctx.beginPath();o.pts.forEach((p,i)=>{const x=Math.cos(p[0])*r*p[1],y=Math.sin(p[0])*r*p[1]*.85-r*.15;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();
    const g=ctx.createRadialGradient(L.x*r*.5,L.y*r*.5-r*.15,r*.1,0,0,r*1.2);
    g.addColorStop(0,'rgba(60,120,140,.95)');g.addColorStop(.5,'rgba(14,48,66,.95)');g.addColorStop(1,'rgba(2,10,16,.97)');
    ctx.fillStyle=g;ctx.fill();ctx.strokeStyle=rgba(o.c,.22);ctx.lineWidth=1.2;ctx.stroke();
    if(o.tip){ctx.globalCompositeOperation='lighter';blob(0,-r*.55,r*.35+Math.sin(T*2+o.x)*2,o.c,.55);ctx.globalCompositeOperation='source-over';}
    ctx.restore();}}
function drawAmbient(){for(const e of ambient){ctx.save();ctx.translate(e.x,e.y);
  ctx.globalCompositeOperation='lighter';blob(0,0,e.r*2.9,e.c,.3);ctx.globalCompositeOperation='source-over';
  if(e.type==='drifter')drawJellyNew(e);else if(e.type==='dart')drawDartNew(e);else if(e.type==='urchin')drawUrchinNew(e);else if(e.type==='angler')drawAnglerNew(e);
  ctx.restore();}}
function drawRays(){
  ctx.globalCompositeOperation='lighter';ctx.fillStyle=rayGrad;
  for(let i=0;i<(MOBILE?3:5);i++){
    const bx=(i/5)*view.w*1.3-view.w*.15+Math.sin(T*.09+i*1.7)*50-cam.x*.05*zoom;
    const w=54+i*17,skew=110+Math.sin(T*.06+i)*46;
    ctx.globalAlpha=(.55+Math.sin(T*.13+i*2)*.22)*(SET.glow/100);
    ctx.beginPath();ctx.moveTo(bx,-30);ctx.lineTo(bx+w,-30);ctx.lineTo(bx+w+skew,view.h*.96);ctx.lineTo(bx+skew,view.h*.96);
    ctx.closePath();ctx.fill();}
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
}
function drawSpires(){
  for(const s of spires){
    const f=s.far?.3:.52,x=s.x*zoom-cam.x*f*zoom,base=view.h*1.02-cam.y*f*.22*zoom;
    const w=s.w*zoom*(s.far?.8:1),h=s.h*zoom*(s.far?.85:1.1);
    if(x+w<-60||x-w>view.w+60)continue;
    {const g=ctx.createLinearGradient(x-w/2,0,x+w/2,0);if(s.far){g.addColorStop(0,'rgba(10,40,58,.75)');g.addColorStop(1,'rgba(3,14,22,.75)');}else{g.addColorStop(0,'rgba(12,48,68,.95)');g.addColorStop(.6,'rgba(3,15,23,.95)');g.addColorStop(1,'rgba(1,6,10,.97)');}ctx.fillStyle=g;}
    ctx.beginPath();ctx.moveTo(x-w/2,base);
    ctx.quadraticCurveTo(x-w*.22,base-h*.6,x+s.lean*w,base-h);
    ctx.quadraticCurveTo(x+w*.3,base-h*.55,x+w/2,base);ctx.closePath();ctx.fill();
    if(!s.far){ctx.strokeStyle=rgba(theme.acc,.12);ctx.lineWidth=1.4;ctx.stroke();
      ctx.globalCompositeOperation='lighter';blob(x+s.lean*w,base-h,10,theme.acc,.18);ctx.globalCompositeOperation='source-over';}}
}
function drawDust(){
  ctx.globalCompositeOperation='lighter';const step=perf.q<1?2:1;
  dust.forEach((layer,li)=>{const f=[.12,.26,.45][li];
    for(let i=0;i<layer.length;i+=step){const d=layer[i];
      let x=(d.x-cam.x*f*zoom+Math.sin(T*.25+d.ph)*10)%(view.w+240);
      let y=(d.y+T*d.s-cam.y*f*zoom)%(view.h+240);
      if(x<0)x+=view.w+240;if(y<0)y+=view.h+240;
      blob(x-120,y-120,d.r*3.4,li===2?theme.acc:C.info,d.a*.5);}});
  ctx.globalCompositeOperation='source-over';
}
function drawBubbles(){
  ctx.strokeStyle='rgba(180,240,255,.2)';ctx.lineWidth=1;
  for(const b of bubbles){let y=(b.y-T*b.v)%(view.h+80);if(y<0)y+=view.h+80;
    const x=b.x+Math.sin(T*.6+b.ph)*16;
    ctx.beginPath();ctx.arc(x,y-40,b.r,0,TAU);ctx.stroke();
    ctx.fillStyle='rgba(220,255,255,.13)';ctx.beginPath();ctx.arc(x-b.r*.3,y-40-b.r*.3,b.r*.32,0,TAU);ctx.fill();}
}
function drawCaustics(){
  ctx.globalCompositeOperation='lighter';
  const vw=view.w/zoom,vh=view.h/zoom;
  ctx.strokeStyle=rgba(theme.acc,.05);ctx.lineWidth=16;
  for(let i=0;i<5;i++){
    const y0=cam.y+((i/5)*vh+((T*14)%(vh/5)));
    ctx.beginPath();
    for(let x=cam.x-40;x<cam.x+vw+40;x+=46){
      const y=y0+Math.sin(x*.006+T*.5+i)*26+Math.sin(x*.013-T*.3)*12;
      x===cam.x-40?ctx.moveTo(x,y):ctx.lineTo(x,y);}
    ctx.stroke();}
  ctx.globalCompositeOperation='source-over';
}
function drawGrid(){
  const vw=view.w/zoom,vh=view.h/zoom,step=MOBILE?126:84;
  const x0=Math.floor(cam.x/step)*step,y0=Math.floor(cam.y/step)*step;
  for(let x=x0;x<cam.x+vw+step;x+=step){
    if(x<0||x>world.w)continue;
    for(let y=y0;y<cam.y+vh+step;y+=step){
      if(y<0||y>world.h)continue;
      const d=P?dist(x,y,P.x,P.y):600;
      let a=clamp(.2-d/2600,.02,.2);
      if(sonarR>0&&Math.abs(d-sonarR)<70)a+=.3*(1-sonarR/1000);
      ctx.fillStyle=rgba(theme.acc,a);ctx.fillRect(x-1.2,y-1.2,2.4,2.4);}}
}
function drawKelp(){
  ctx.globalCompositeOperation='source-over';
  for(const k of kelp){
    const sway=Math.sin(T*.7+k.ph)*26;
    ctx.strokeStyle=rgba(k.c,.13);ctx.lineWidth=k.w;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(k.x,world.h+10);
    ctx.quadraticCurveTo(k.x+sway*.5,world.h-k.h*.55,k.x+sway,world.h-k.h);ctx.stroke();
    ctx.strokeStyle=rgba(k.c,.24);ctx.lineWidth=k.w*.35;ctx.beginPath();ctx.moveTo(k.x-k.w*.2,world.h+10);ctx.quadraticCurveTo(k.x+sway*.5-k.w*.2,world.h-k.h*.55,k.x+sway-k.w*.2,world.h-k.h);ctx.stroke();
    ctx.globalCompositeOperation='lighter';
    blob(k.x+sway,world.h-k.h,k.w*1.5,k.c,.2);
    ctx.globalCompositeOperation='source-over';}
}
function drawVents(){
  for(const v of vents){
    const hot=v.st==='erupt',warn=v.st==='warn';
    {const g=ctx.createLinearGradient(v.x-26,0,v.x+26,0);g.addColorStop(0,'#16445c');g.addColorStop(.5,'#082230');g.addColorStop(1,'#03101a');ctx.fillStyle='rgba(0,4,8,.4)';ctx.beginPath();ctx.ellipse(v.x+10,v.y+18,34,9,0,0,TAU);ctx.fill();ctx.fillStyle=g;}
    ctx.beginPath();ctx.moveTo(v.x-26,v.y+16);ctx.lineTo(v.x-13,v.y-20);ctx.lineTo(v.x+13,v.y-20);ctx.lineTo(v.x+26,v.y+16);ctx.closePath();ctx.fill();
    ctx.strokeStyle=rgba(hot?C.crimson:(warn?C.amber:C.slate),.6);ctx.lineWidth=1.6;ctx.stroke();
    ctx.globalCompositeOperation='lighter';
    blob(v.x,v.y-20,hot?70:(warn?36:20),hot?C.crimson:(warn?C.amber:C.teal),hot?.7:(warn?.45:.2));
    if(warn||hot){ctx.strokeStyle=rgba(hot?C.crimson:C.amber,.35+Math.abs(Math.sin(T*10))*.3);ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(v.x,v.y,v.r,0,TAU);ctx.stroke();}
    ctx.globalCompositeOperation='source-over';}
}
function drawInk(){
  ctx.globalCompositeOperation='lighter';
  for(const k of ink){const a=k.l/k.m;blob(k.x,k.y,k.r,k.c,a*.16);}
  ctx.globalCompositeOperation='source-over';
}
function drawBorder(){
  ctx.save();
  ctx.strokeStyle=rgba(theme.acc,.34);ctx.lineWidth=2.5;ctx.setLineDash([26,16]);ctx.lineDashOffset=-T*22;
  ctx.strokeRect(0,0,world.w,world.h);ctx.setLineDash([]);
  ctx.strokeStyle=rgba(C.bio,.16);ctx.lineWidth=1;ctx.strokeRect(9,9,world.w-18,world.h-18);
  const L=52;ctx.strokeStyle=rgba(C.bio,.55);ctx.lineWidth=3;
  [[0,0,1,1],[world.w,0,-1,1],[0,world.h,1,-1],[world.w,world.h,-1,-1]].forEach(c=>{
    ctx.beginPath();ctx.moveTo(c[0]+c[2]*L,c[1]);ctx.lineTo(c[0],c[1]);ctx.lineTo(c[0],c[1]+c[3]*L);ctx.stroke();});
  ctx.restore();
}
function drawTeles(){
  ctx.globalCompositeOperation='lighter';
  for(const t of teles){const k=1-t.t/.75,r=DEF[t.type].r*(2.6-k*1.2);
    blob(t.x,t.y,r*1.5,DEF[t.type].c,.22+k*.28);
    ctx.strokeStyle=rgba(DEF[t.type].c,.5+k*.4);ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(t.x,t.y,r,0,TAU);ctx.stroke();
    ctx.beginPath();ctx.arc(t.x,t.y,r*.45,T*4,T*4+PI*1.3);ctx.stroke();}
  ctx.globalCompositeOperation='source-over';
}
function drawPickups(){
  ctx.fillStyle='rgba(0,4,8,.22)';
  for(const o of pickups){ctx.beginPath();ctx.ellipse(o.x+2,o.y+11,o.r*1.1+2,o.r*.42+1,0,0,TAU);ctx.fill();}
  ctx.globalCompositeOperation='lighter';
  for(const o of pickups){
    const fade=o.l<3?.35+.65*Math.abs(Math.sin(o.l*7)):1;
    if(o.t==='p'){const pr=o.r*(1+Math.sin(o.ph)*.16);
      blob(o.x,o.y,pr*4,C.bio,.5*fade);
      ctx.fillStyle=rgba(C.white,.85*fade);ctx.beginPath();ctx.arc(o.x,o.y,pr*.45,0,TAU);ctx.fill();
      blob(o.x-pr*.25,o.y-pr*.3,pr*.5,C.white,.9*fade);
    }else if(o.t==='h'){
      blob(o.x,o.y,o.r*3.4,C.teal,.55*fade);
      ctx.strokeStyle=rgba(C.sand,.9*fade);ctx.lineWidth=2.4;
      ctx.beginPath();ctx.moveTo(o.x-5,o.y);ctx.lineTo(o.x+5,o.y);ctx.moveTo(o.x,o.y-5);ctx.lineTo(o.x,o.y+5);ctx.stroke();
      ctx.strokeStyle=rgba(C.teal,.7*fade);ctx.lineWidth=1.4;
      ctx.beginPath();ctx.arc(o.x,o.y,o.r+Math.sin(o.ph)*1.5,0,TAU);ctx.stroke();
    }else{
      const bc=BUFFS[o.t].c;
      blob(o.x,o.y,o.r*3.6,bc,.6*fade);
      ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.ph*.5);
      ctx.strokeStyle=rgba(bc,.95*fade);ctx.lineWidth=2.2;
      ctx.beginPath();for(let i=0;i<6;i++){const a=i*TAU/6,x=Math.cos(a)*o.r,y=Math.sin(a)*o.r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
      ctx.closePath();ctx.stroke();
      ctx.fillStyle=rgba(C.white,.85*fade);ctx.beginPath();ctx.arc(0,0,3.2,0,TAU);ctx.fill();
      ctx.restore();}}
  ctx.globalCompositeOperation='source-over';
}
function drawEnemies(){
  const sorted=enemies.slice().sort((a,b)=>a.y-b.y);
  for(const e of sorted){
    if(e.dead)continue;
    if(e.type==='eel'&&e.st==='aim'){
      const k=1-e.stT;
      ctx.save();ctx.globalCompositeOperation='lighter';
      ctx.strokeStyle=rgba(C.info,.2+k*.45);ctx.lineWidth=1+k*3;ctx.setLineDash([14,12]);ctx.lineDashOffset=-T*60;
      ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(e.x+Math.cos(e.beamAng)*940,e.y+Math.sin(e.beamAng)*940);ctx.stroke();
      ctx.setLineDash([]);ctx.restore();ctx.globalCompositeOperation='source-over';}
    const L=lightOf(e.x,e.y),ds=depthScale(e.y);
    ctx.save();ctx.translate(e.x,e.y);ctx.scale(ds,ds);
    floorShadow(e.r,e.r*.28,L);
    ctx.translate(0,-e.r*.28-Math.sin(e.t*2)*1.6);
    ctx.globalCompositeOperation='lighter';
    blob(0,0,e.r*(SET.contrast?3.4:2.9),e.c,(SET.contrast?.5:.34)+(e.flash>0?.4:0));
    ctx.globalCompositeOperation='source-over';
    drawBody3D(e,L);
    if(e.flash>0){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=e.flash*4;
      ctx.fillStyle=C.white;ctx.beginPath();ctx.arc(0,0,e.r*.92,0,TAU);ctx.fill();
      ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}
    ctx.restore();
    if(e.type!=='boss'&&e.hp<e.maxHp){
      const w=e.r*1.7,f=clamp(e.hp/e.maxHp,0,1);
      ctx.fillStyle='rgba(2,7,13,.7)';ctx.fillRect(e.x-w/2,e.y-e.r-11,w,3.4);
      ctx.fillStyle=f>.5?C.bio:(f>.25?C.amber:C.crimson);ctx.fillRect(e.x-w/2,e.y-e.r-11,w*f,3.4);}}
}
function drawJelly(e){
  const pu=1+e.pulse*.22+Math.sin(e.t*2.6)*.05,r=e.r;
  ctx.rotate(Math.sin(e.t*.9)*.13);
  ctx.strokeStyle=rgba(C.violet,.6);ctx.lineWidth=2.2;ctx.lineCap='round';
  for(let i=0;i<5;i++){const ox=(i-2)*r*.34;
    ctx.beginPath();ctx.moveTo(ox,r*.3);
    ctx.quadraticCurveTo(ox+Math.sin(e.t*3+i)*r*.55,r*1.15,ox+Math.sin(e.t*2.2+i*1.3)*r*.8,r*1.95);ctx.stroke();}
  ctx.beginPath();ctx.arc(0,0,r*pu,PI,0);
  ctx.quadraticCurveTo(r*.5,r*.4,0,r*.22);ctx.quadraticCurveTo(-r*.5,r*.4,-r*pu,0);ctx.closePath();
  ctx.fillStyle=bodyGrad(C.magenta,r);ctx.fill();
  ctx.strokeStyle=rgba(C.sand,SET.contrast?.6:.35);ctx.lineWidth=1.2;ctx.stroke();
  ctx.globalCompositeOperation='lighter';
  blob(-r*.32,-r*.24,r*.42,C.bio,.75);blob(r*.32,-r*.24,r*.42,C.bio,.75);
  ctx.globalCompositeOperation='source-over';
}
function drawDart(e){
  const r=e.r;ctx.rotate(e.ang);
  ctx.fillStyle=rgba(C.info,.8);
  ctx.beginPath();ctx.moveTo(-r*.4,0);ctx.lineTo(-r*1.6,r*.62*Math.sin(e.t*17));ctx.lineTo(-r*1.1,0);
  ctx.lineTo(-r*1.6,-r*.62*Math.sin(e.t*17));ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(r*1.35,0);ctx.lineTo(-r*.75,r*.72);ctx.quadraticCurveTo(-r*.3,0,-r*.75,-r*.72);ctx.closePath();
  ctx.fillStyle=bodyGrad(C.electric,r*1.2);ctx.fill();
  ctx.strokeStyle=rgba(C.info,SET.contrast?.9:.6);ctx.lineWidth=1;ctx.stroke();
  ctx.fillStyle=C.sand;ctx.beginPath();ctx.arc(r*.55,-r*.16,r*.16,0,TAU);ctx.fill();
}
function drawAngler(e){
  const r=e.r,ch=clamp((.6-e.cd)/.6,0,1);
  ctx.rotate(e.ang);
  ctx.strokeStyle=rgba(C.amber,.85);ctx.lineWidth=2;
  const lx=r*1.9,ly=-r*1.5+Math.sin(e.t*2)*r*.18;
  ctx.beginPath();ctx.moveTo(r*.4,-r*.6);ctx.quadraticCurveTo(r*1.5,-r*1.9,lx,ly);ctx.stroke();
  ctx.globalCompositeOperation='lighter';blob(lx,ly,r*(.55+ch*.75),C.amber,.65+ch*.35);ctx.globalCompositeOperation='source-over';
  ctx.fillStyle=rgba(C.amber,.55);
  ctx.beginPath();ctx.moveTo(-r*.8,-r*.2);ctx.lineTo(-r*1.7,-r*.8);ctx.lineTo(-r*1.4,0);ctx.lineTo(-r*1.7,r*.8);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.ellipse(0,0,r*1.15,r*.86,0,0,TAU);ctx.fillStyle=bodyGrad('#c07a18',r*1.1);ctx.fill();
  ctx.strokeStyle=rgba(C.amber,.55);ctx.lineWidth=1.3;ctx.stroke();
  ctx.strokeStyle=rgba(C.sand,.9);ctx.lineWidth=1.6;ctx.beginPath();
  for(let i=0;i<5;i++){const x=r*.25+i*r*.19;ctx.moveTo(x,r*.28);ctx.lineTo(x+r*.09,r*.52);ctx.lineTo(x+r*.18,r*.28);}
  ctx.stroke();
  ctx.fillStyle=C.crimson;ctx.beginPath();ctx.arc(r*.35,-r*.3,r*.17,0,TAU);ctx.fill();
  ctx.fillStyle=C.sand;ctx.beginPath();ctx.arc(r*.4,-r*.34,r*.06,0,TAU);ctx.fill();
}
function drawUrchin(e){
  const r=e.r,ch=clamp((.6-e.cd)/.6,0,1);
  ctx.rotate(e.spin);
  ctx.strokeStyle=rgba(C.bio,.85);ctx.lineWidth=3;ctx.lineCap='round';
  for(let i=0;i<12;i++){const a=i*TAU/12,len=r*(1.45+ch*.35+Math.sin(e.t*4+i)*.06);
    ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.6,Math.sin(a)*r*.6);ctx.lineTo(Math.cos(a)*len,Math.sin(a)*len);ctx.stroke();}
  ctx.beginPath();ctx.arc(0,0,r*.72,0,TAU);ctx.fillStyle=bodyGrad('#4e8f1c',r*.8);ctx.fill();
  ctx.strokeStyle=rgba(C.bio,.7);ctx.lineWidth=1.4;ctx.stroke();
  ctx.globalCompositeOperation='lighter';blob(0,0,r*(.5+ch*.8),C.bio,.5+ch*.5);ctx.globalCompositeOperation='source-over';
}
function drawCrab(e){
  const r=e.r,wind=e.st==='wind'?1:0,sh=wind?Math.sin(e.t*45)*2.2:0;
  ctx.rotate(e.ang+PI/2);ctx.translate(sh,0);
  ctx.strokeStyle=rgba(C.crimson,.75);ctx.lineWidth=2.6;ctx.lineCap='round';
  for(let i=0;i<3;i++){const yy=(-.3+i*.42)*r,sw=Math.sin(e.t*7+i)*r*.16;
    ctx.beginPath();ctx.moveTo(-r*.7,yy);ctx.lineTo(-r*1.35,yy+sw);ctx.stroke();
    ctx.beginPath();ctx.moveTo(r*.7,yy);ctx.lineTo(r*1.35,yy-sw);ctx.stroke();}
  const open=wind?.5:(e.st==='charge'?.62:.16);
  ctx.fillStyle=rgba(C.crimson,.92);
  [-1,1].forEach(s=>{ctx.save();ctx.translate(s*r*.95,-r*.85);ctx.rotate(s*open);
    ctx.beginPath();ctx.ellipse(0,0,r*.46,r*.3,0,0,TAU);ctx.fill();
    ctx.strokeStyle=rgba(C.sand,.35);ctx.lineWidth=1.2;ctx.stroke();ctx.restore();});
  ctx.beginPath();
  for(let i=0;i<6;i++){const a=-PI/2+i*TAU/6,x=Math.cos(a)*r,y=Math.sin(a)*r*.94;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
  ctx.closePath();ctx.fillStyle=bodyGrad('#8f1c2e',r);ctx.fill();
  ctx.strokeStyle=rgba(C.crimson,.85);ctx.lineWidth=1.6;ctx.stroke();
  ctx.strokeStyle=rgba(C.crimson,.4);ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(0,r);ctx.moveTo(-r*.85,-r*.45);ctx.lineTo(r*.85,r*.45);
  ctx.moveTo(r*.85,-r*.45);ctx.lineTo(-r*.85,r*.45);ctx.stroke();
  ctx.fillStyle=C.amber;ctx.beginPath();ctx.arc(-r*.28,-r*.42,r*.12,0,TAU);ctx.fill();
  ctx.beginPath();ctx.arc(r*.28,-r*.42,r*.12,0,TAU);ctx.fill();
  if(wind){ctx.globalCompositeOperation='lighter';blob(0,0,r*2.4,C.crimson,.3+Math.abs(Math.sin(e.t*16))*.3);ctx.globalCompositeOperation='source-over';}
}
function drawEel(e){
  const r=e.r,ch=e.st==='aim'?1-e.stT:(e.st==='beam'?1:0);
  ctx.rotate(e.ang);
  ctx.strokeStyle=rgba(C.info,.85);ctx.lineWidth=r*.7;ctx.lineCap='round';
  ctx.beginPath();
  for(let i=0;i<=6;i++){const x=r*1.2-i*r*.52,y=Math.sin(e.t*7-i*.8)*r*.42;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
  ctx.stroke();
  ctx.strokeStyle=rgba(C.electric,.5);ctx.lineWidth=r*.32;ctx.stroke();
  ctx.beginPath();ctx.ellipse(r*1.15,0,r*.62,r*.46,0,0,TAU);ctx.fillStyle=bodyGrad(C.info,r*.7);ctx.fill();
  ctx.fillStyle=C.sand;ctx.beginPath();ctx.arc(r*1.35,-r*.16,r*.12,0,TAU);ctx.fill();
  ctx.globalCompositeOperation='lighter';
  for(let i=0;i<4;i++){const x=r*.6-i*r*.55,y=Math.sin(e.t*7-i*.8)*r*.42;
    blob(x,y,r*(.35+ch*.5),C.white,.3+ch*.6);}
  ctx.globalCompositeOperation='source-over';
}
function drawBeams(){
  ctx.globalCompositeOperation='lighter';
  for(const b of beams){
    const a=b.l/b.m,x2=b.x+Math.cos(b.a)*b.len,y2=b.y+Math.sin(b.a)*b.len;
    for(let pass=0;pass<3;pass++){
      ctx.strokeStyle=pass===2?rgba(C.white,a):rgba(pass===1?C.info:C.electric,a*.6);
      ctx.lineWidth=pass===0?18:pass===1?7:2.4;
      ctx.beginPath();ctx.moveTo(b.x,b.y);
      const n=14;
      for(let i=1;i<=n;i++){const t=i/n,px=b.x+(x2-b.x)*t,py=b.y+(y2-b.y)*t;
        const off=(i===n?0:rnd(-13,13))*(pass===2?.5:1);
        ctx.lineTo(px+Math.cos(b.a+PI/2)*off,py+Math.sin(b.a+PI/2)*off);}
      ctx.stroke();}
    blob(b.x,b.y,60,C.info,a*.7);}
  ctx.globalCompositeOperation='source-over';
}
function drawMedusa(e){
  const r=e.r,ph=e.phase,col=ph===2?C.violet:C.magenta,fp=P||{x:0,y:0};
  ctx.rotate(Math.sin(e.t*.5)*.07);
  ctx.strokeStyle=rgba(col,.6);ctx.lineWidth=5;ctx.lineCap='round';
  for(let i=0;i<9;i++){const ox=(i-4)*r*.21;
    ctx.beginPath();ctx.moveTo(ox,r*.28);
    ctx.quadraticCurveTo(ox+Math.sin(e.t*1.7+i)*r*.5,r*1.3,ox+Math.sin(e.t*1.2+i*1.4)*r*.85,r*2.5);ctx.stroke();}
  for(let L=2;L>=0;L--){
    const rr=r*(1+L*.13),pu=1+Math.sin(e.t*(ph===2?2.4:1.6)+L)*.045;
    ctx.beginPath();ctx.arc(0,0,rr*pu,PI,0);
    ctx.quadraticCurveTo(rr*.55,r*.42,0,r*.24);ctx.quadraticCurveTo(-rr*.55,r*.42,-rr*pu,0);ctx.closePath();
    ctx.fillStyle=L===0?bodyGrad(col,r):rgba(col,.13+L*.05);ctx.fill();
    ctx.strokeStyle=rgba(C.sand,.16+L*.06);ctx.lineWidth=1.4;ctx.stroke();}
  ctx.globalCompositeOperation='lighter';
  for(let i=0;i<11;i++){const a=PI+(i+.5)*PI/11,rr=r*1.06;
    blob(Math.cos(a)*rr,Math.sin(a)*rr,r*.19*(1+Math.sin(e.t*3+i)*.3),C.bio,.8);}
  const ea=Math.atan2(fp.y-e.y,fp.x-e.x);
  blob(0,-r*.18,r*.72,C.sand,.5);ctx.globalCompositeOperation='source-over';
  ctx.fillStyle=rgba(C.sand,.92);ctx.beginPath();ctx.arc(0,-r*.18,r*.3,0,TAU);ctx.fill();
  ctx.fillStyle=col;ctx.beginPath();ctx.arc(Math.cos(ea)*r*.1,-r*.18+Math.sin(ea)*r*.1,r*.15,0,TAU);ctx.fill();
}
/* ================= AUXILIARES DA VERSÃO NOVA ================= */
const fr=x=>x-Math.floor(x),hs=i=>fr(Math.sin(i*12.9898+4.1)*43758.5453),lerp=(a,b,k)=>a+(b-a)*k;
function lg(x0,y0,x1,y1,st){const g=ctx.createLinearGradient(x0,y0,x1,y1);st.forEach(s=>g.addColorStop(s[0],s[1]));return g;}
function rg(x0,y0,r0,x1,y1,r1,st){const g=ctx.createRadialGradient(x0,y0,r0,x1,y1,r1);st.forEach(s=>g.addColorStop(s[0],s[1]));return g;}
function add(fn){ctx.globalCompositeOperation='lighter';fn();ctx.globalCompositeOperation='source-over';}
function qbz(a,b,d,t){const u=1-t;return{x:u*u*a.x+2*u*t*b.x+t*t*d.x,y:u*u*a.y+2*u*t*b.y+t*t*d.y};}
function cbz(p0,p1,p2,p3,t){const u=1-t,a=u*u*u,b=3*u*u*t,c=3*u*t*t,d=t*t*t;return{x:a*p0[0]+b*p1[0]+c*p2[0]+d*p3[0],y:a*p0[1]+b*p1[1]+c*p2[1]+d*p3[1]};}
function taperLine(Q,w0,w1,col){ctx.strokeStyle=col;ctx.lineCap='round';for(let i=0;i<Q.length-1;i++){ctx.lineWidth=lerp(w0,w1,i/Math.max(1,Q.length-1));ctx.beginPath();ctx.moveTo(Q[i].x,Q[i].y);ctx.lineTo(Q[i+1].x,Q[i+1].y);ctx.stroke();}}
function bolt(x1,y1,x2,y2,n,j){const dx=x2-x1,dy=y2-y1,l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l;ctx.beginPath();ctx.moveTo(x1,y1);for(let i=1;i<n;i++){const t=i/n,o=rnd(-j,j);ctx.lineTo(x1+dx*t+nx*o,y1+dy*t+ny*o);}ctx.lineTo(x2,y2);ctx.stroke();}
function poly(pts){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();}
function smooth(pts){const n=pts.length;ctx.beginPath();ctx.moveTo((pts[n-1][0]+pts[0][0])/2,(pts[n-1][1]+pts[0][1])/2);for(let i=0;i<n;i++){const p=pts[i],q=pts[(i+1)%n];ctx.quadraticCurveTo(p[0],p[1],(p[0]+q[0])/2,(p[1]+q[1])/2);}ctx.closePath();}
function spike(x,y,ang,len,w,fill,stroke){ctx.save();ctx.translate(x,y);ctx.rotate(ang);ctx.beginPath();ctx.moveTo(0,-w);ctx.lineTo(len,0);ctx.lineTo(0,w);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.8;ctx.stroke();}ctx.restore();}
function bellP(w,hg,ry,n,dp,t,s){ctx.beginPath();ctx.moveTo(-w,ry);ctx.bezierCurveTo(-w*1.03,-hg*1.38,w*1.03,-hg*1.38,w,ry);
  for(let i=0;i<n;i++){const x1=w-(i+1)/n*2*w,xm=w-(i+.5)/n*2*w,d=dp*(1+.25*Math.sin(t*s+i*.9));ctx.quadraticCurveTo(xm,ry+d*2,x1,ry);}ctx.closePath();}

/* ================= 1 · DERIVA (medusa) ================= */
function drawJellyNew(e){
  const r=e.r,t=e.t,pl=e.pulse||0,pu=1+pl*.2+Math.sin(t*2.6)*.05;
  const w=r*pu*1.06,hg=r*(1-pl*.16),ry=r*.08,n=8,dp=r*.2*(1+pl*.35);
  ctx.rotate(Math.sin(t*.9)*.13);
  add(()=>{blob(0,-r*.1,r*3,C.magenta,.2+pl*.22);blob(0,r*.9,r*1.6,C.violet,.16);});
  /* tentáculos finos com contas luminosas */
  for(let i=0;i<9;i++){
    const ox=w*(.94-1.88*i/8),len=r*(1.5+(i%3)*.2),Q=[];
    for(let k=0;k<=12;k++){const u=k/12;Q.push({x:ox*(1+u*.1)+Math.sin(t*2.6+i*1.3-u*4.5)*r*.3*u,y:ry+u*len*(1-pl*.1)});}
    taperLine(Q,2.2,.5,'rgba(190,120,255,.55)');
    add(()=>{for(let b=0;b<4;b++){const u=fr(t*.55+b/4+hs(i)),p=Q[Math.min(12,Math.floor(u*12))];blob(p.x,p.y,3.4,C.bio,.85*(1-u*.7));}});
  }
  /* braços orais com babados */
  for(let a=0;a<4;a++){
    const ox=(a-1.5)*r*.2,L=r*(1.3+hs(a)*.35),A=[],B=[];
    for(let k=0;k<=14;k++){const u=k/14,cx=ox+Math.sin(t*2.2+a*1.7-u*5)*r*.3*u,cy=ry+r*.15+u*L,wd=r*.11*(1-u*.7)*(1+.35*Math.sin(u*22-t*4));A.push([cx-wd,cy]);B.push([cx+wd,cy]);}
    ctx.beginPath();A.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));for(let k=B.length-1;k>=0;k--)ctx.lineTo(B[k][0],B[k][1]);ctx.closePath();
    ctx.fillStyle=lg(0,ry,0,ry+L,[[0,'rgba(255,80,170,.8)'],[1,'rgba(168,85,247,.05)']]);ctx.fill();
    ctx.strokeStyle='rgba(255,200,235,.35)';ctx.lineWidth=.8;ctx.stroke();
  }
  /* sino translúcido */
  bellP(w,hg,ry,n,dp,t,3);
  ctx.fillStyle=lg(0,-hg,0,ry+dp,[[0,'rgba(255,150,215,.92)'],[.45,'rgba(255,46,136,.7)'],[1,'rgba(150,60,230,.55)']]);ctx.fill();
  ctx.save();bellP(w,hg,ry,n,dp,t,3);ctx.clip();
  ctx.fillStyle=rg(-w*.3,-hg*.5,r*.05,0,-hg*.1,w*1.1,[[0,'rgba(255,235,250,.55)'],[.5,'rgba(255,255,255,0)'],[1,'rgba(40,0,60,.45)']]);ctx.fillRect(-w*1.5,-hg*1.6,w*3,hg*2.4);
  ctx.lineWidth=1;ctx.strokeStyle='rgba(255,215,240,.38)';
  for(let k=0;k<9;k++){const a=PI+(k+.5)/9*PI,ex=Math.cos(a)*w*.93,ey=Math.sin(a)*hg*.95+r*.04;
    ctx.beginPath();ctx.moveTo(0,-hg*.14);ctx.quadraticCurveTo(Math.cos(a)*w*.5,Math.sin(a)*hg*.35-hg*.2,ex,ey);ctx.stroke();}
  ctx.strokeStyle='rgba(141,255,69,.4)';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,ry*.5,w*.9,r*.1,0,0,PI);ctx.stroke();
  add(()=>blob(0,-hg*.3,r*.7,'#ffb6d8',.35+.15*Math.sin(t*2.6)));
  ctx.fillStyle='rgba(255,240,250,.7)';
  for(let i=0;i<6;i++){const x=Math.sin(t*.7+i*2.1)*w*.55,y=-hg*.15-fr(t*.12+hs(i))*hg*.75;ctx.beginPath();ctx.arc(x,y,r*.025,0,TAU);ctx.fill();}
  ctx.restore();
  bellP(w,hg,ry,n,dp,t,3);ctx.strokeStyle='rgba(255,225,245,.55)';ctx.lineWidth=1.3;ctx.stroke();
  /* brilhos de borda */
  add(()=>{
    for(let i=0;i<n;i++){const xm=w-(i+.5)/n*2*w,d=dp*(1+.25*Math.sin(t*3+i*.9)),k=.5+.5*Math.sin(t*4-i*.8);
      blob(xm,ry+d,r*.17*(.7+k*.6),C.bio,.4+.55*k);}
    blob(-w*.42,-hg*.62,r*.3,C.white,.42);
    if(pl>.05){ctx.strokeStyle='rgba(255,90,180,'+pl*.45+')';ctx.lineWidth=2.4*pl+.6;ctx.beginPath();ctx.ellipse(0,ry,w*(1+(1-pl)*.9),r*(.2+(1-pl)*.3),0,0,TAU);ctx.stroke();}
  });
  ctx.strokeStyle='rgba(255,255,255,.4)';ctx.lineWidth=r*.07;ctx.lineCap='round';ctx.beginPath();ctx.ellipse(0,-hg*.05,w*.8,hg*.82,0,PI*1.12,PI*1.45);ctx.stroke();
}

/* ================= 2 · CARDUME (peixe-lâmina) ================= */
function drawDartNew(e){
  const r=e.r,t=e.t;ctx.rotate(e.ang);
  const sw=Math.sin(t*17),sw2=Math.sin(t*17-1.2);
  add(()=>{blob(-r*1.2,0,r*2.3,C.electric,.26);blob(r*.9,0,r*1.7,C.info,.32);
    for(let i=0;i<3;i++){ctx.strokeStyle='rgba(79,195,255,'+(.3-i*.08)+')';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(-r*(1.9+i*.12),(i-1)*r*.34);ctx.lineTo(-r*(2.4+i*.1),(i-1)*r*.44);ctx.stroke();}});
  /* cauda bifurcada */
  ctx.save();ctx.translate(-r*.85,0);ctx.rotate(sw*.4);
  const tl=r*1.05;
  ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(-tl*.4,-r*.22,-tl*.9,-r*.7,-tl*1.25,-r*.85);ctx.quadraticCurveTo(-tl*.8,-r*.08,-tl*.72,0);ctx.quadraticCurveTo(-tl*.8,r*.08,-tl*1.25,r*.85);ctx.bezierCurveTo(-tl*.9,r*.7,-tl*.4,r*.22,0,0);ctx.closePath();
  ctx.fillStyle=lg(0,0,-tl*1.25,0,[[0,'rgba(47,109,255,.95)'],[1,'rgba(79,195,255,.12)']]);ctx.fill();
  ctx.strokeStyle='rgba(190,240,255,.5)';ctx.lineWidth=.8;ctx.stroke();
  ctx.strokeStyle='rgba(190,240,255,.28)';ctx.beginPath();for(let k=-3;k<=3;k++){if(!k)continue;ctx.moveTo(-tl*.1,0);ctx.lineTo(-tl*(.9+.08*Math.abs(k)),k*r*.2);}ctx.stroke();
  ctx.restore();
  /* nadadeiras */
  ctx.fillStyle='rgba(79,195,255,.5)';ctx.strokeStyle='rgba(200,245,255,.6)';ctx.lineWidth=.8;
  poly([[.55*r,-.5*r],[.05*r,-1.2*r+sw2*r*.05],[-.2*r,-1.0*r],[-.7*r,-.4*r]]);ctx.fill();ctx.stroke();
  poly([[.1*r,.5*r],[-.35*r,1.0*r],[-.65*r,.35*r]]);ctx.fill();ctx.stroke();
  ctx.save();ctx.translate(.45*r,.32*r);ctx.rotate(.7+sw2*.25);ctx.beginPath();ctx.ellipse(r*.28,0,r*.3,r*.1,0,0,TAU);ctx.fillStyle='rgba(150,225,255,.55)';ctx.fill();ctx.restore();
  /* corpo-lâmina */
  const body=()=>{ctx.beginPath();ctx.moveTo(r*1.55,0);ctx.bezierCurveTo(r*1.0,-r*.32,r*.2,-r*.78,-r*.9,-r*.28);ctx.lineTo(-r*.95,0);ctx.lineTo(-r*.9,r*.28);ctx.bezierCurveTo(r*.2,r*.78,r*1.0,r*.32,r*1.55,0);ctx.closePath();};
  body();ctx.fillStyle=lg(0,-r*.75,0,r*.75,[[0,'#0a2a66'],[.45,'#2f6dff'],[.55,'#57b8ff'],[1,'#d8f4ff']]);ctx.fill();
  ctx.save();body();ctx.clip();
  ctx.fillStyle=lg(-r*.9,0,r*1.5,0,[[0,'rgba(2,10,40,.55)'],[.6,'rgba(0,0,0,0)'],[1,'rgba(180,240,255,.3)']]);ctx.fillRect(-r,-r,r*3,r*2);
  ctx.strokeStyle='rgba(190,235,255,.22)';ctx.lineWidth=.7;
  for(let row=-3;row<=3;row++)for(let col=0;col<9;col++){const x=-r*.8+col*r*.27+(row&1)*r*.13,y=row*r*.19;ctx.beginPath();ctx.arc(x,y,r*.15,-PI*.42,PI*.42);ctx.stroke();}
  ctx.strokeStyle='rgba(170,250,255,.8)';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(-r*.85,0);ctx.lineTo(r*1.3,0);ctx.stroke();
  add(()=>{blob(-r*.8+fr(t*1.4)*r*2.1,0,r*.5,'#c8ffff',.9);for(let i=0;i<4;i++)blob(-r*.45+i*r*.4,r*.42,r*.22,C.info,.5+.3*Math.sin(t*5+i));});
  ctx.restore();
  ctx.strokeStyle='rgba(235,250,255,.85)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(r*1.55,0);ctx.bezierCurveTo(r*1.0,-r*.32,r*.2,-r*.78,-r*.9,-r*.28);ctx.stroke();
  ctx.strokeStyle='rgba(2,14,40,.7)';ctx.lineWidth=1;body();ctx.stroke();
  ctx.strokeStyle='rgba(2,14,40,.55)';ctx.lineWidth=1.1;ctx.beginPath();ctx.arc(r*.62,0,r*.46,PI*.62,PI*1.38);ctx.stroke();
  add(()=>blob(r*1.1,0,r*1.3,C.info,.34));
  /* olho e boca */
  ctx.fillStyle='#021428';ctx.beginPath();ctx.arc(r*.92,-r*.17,r*.23,0,TAU);ctx.fill();
  ctx.fillStyle=rg(r*.9,-r*.2,0,r*.92,-r*.17,r*.2,[[0,'#ffffff'],[.45,'#f2e6d2'],[1,'#8fd8ff']]);ctx.beginPath();ctx.arc(r*.92,-r*.17,r*.19,0,TAU);ctx.fill();
  ctx.fillStyle='#0a2f66';ctx.beginPath();ctx.arc(r*.96,-r*.17,r*.12,0,TAU);ctx.fill();
  ctx.fillStyle='#010610';ctx.beginPath();ctx.arc(r*.98,-r*.17,r*.065,0,TAU);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.95)';ctx.beginPath();ctx.arc(r*.93,-r*.22,r*.04,0,TAU);ctx.fill();
  ctx.strokeStyle='rgba(2,14,40,.85)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(r*1.5,r*.01);ctx.lineTo(r*1.22,r*.12);ctx.stroke();
}

/* ================= 3 · ANZOL (peixe-pescador) ================= */
function drawAnglerNew(e){
  const r=e.r,t=e.t,ch=clamp((.6-e.cd)/.6,0,1),fl=1+Math.sin(t*9)*.15*ch;
  ctx.rotate(e.ang);
  const B={x:r*.55,y:-r*.62},K={x:r*.95,y:-r*2.05},E={x:r*1.95+Math.sin(t*1.7)*r*.1,y:-r*1.45+Math.sin(t*2)*r*.2-ch*r*.1};
  add(()=>{blob(E.x,E.y,r*(2.2+ch*1.2),C.amber,.2+ch*.25);blob(r*.9,-r*.2,r*1.5,C.amber,.18+ch*.28);});
  /* cauda */
  ctx.save();ctx.translate(-r*.95,0);ctx.rotate(Math.sin(t*3)*.22);
  ctx.beginPath();ctx.moveTo(r*.15,0);ctx.bezierCurveTo(-r*.3,-r*.25,-r*.7,-r*.7,-r*1.05,-r*.95);ctx.quadraticCurveTo(-r*.75,-r*.15,-r*.8,0);ctx.quadraticCurveTo(-r*.75,r*.15,-r*1.05,r*.95);ctx.bezierCurveTo(-r*.7,r*.7,-r*.3,r*.25,r*.15,0);ctx.closePath();
  ctx.fillStyle=lg(r*.15,0,-r*1.05,0,[[0,'rgba(190,110,30,.9)'],[1,'rgba(255,176,32,.12)']]);ctx.fill();
  ctx.strokeStyle='rgba(255,210,130,.45)';ctx.lineWidth=.9;ctx.stroke();
  ctx.beginPath();for(let k=-3;k<=3;k++){ctx.moveTo(r*.05,0);ctx.lineTo(-r*(.8+.06*Math.abs(k)),k*r*.3);}ctx.stroke();
  ctx.restore();
  /* nadadeiras */
  ctx.fillStyle='rgba(200,120,30,.55)';ctx.strokeStyle='rgba(255,210,130,.5)';ctx.lineWidth=.9;
  ctx.beginPath();ctx.moveTo(.1*r,-.8*r);for(let i=0;i<4;i++){const x=.1*r-i*.22*r;ctx.lineTo(x-.04*r,-1.3*r-(i%2)*.1*r+Math.sin(t*4+i)*r*.04);ctx.lineTo(x-.18*r,-.76*r);}ctx.closePath();ctx.fill();ctx.stroke();
  ctx.save();ctx.translate(.05*r,.55*r);ctx.rotate(.9+Math.sin(t*5)*.3);ctx.beginPath();ctx.ellipse(r*.3,0,r*.42,r*.14,0,0,TAU);ctx.fillStyle='rgba(220,140,40,.6)';ctx.fill();ctx.stroke();ctx.restore();
  /* corpo */
  ctx.beginPath();ctx.ellipse(0,0,r*1.15,r*.86,0,0,TAU);
  ctx.fillStyle=rg(-r*.3,-r*.4,r*.1,0,0,r*1.2,[[0,'#e0a040'],[.5,'#8a4a14'],[1,'#26120a']]);ctx.fill();
  ctx.save();ctx.beginPath();ctx.ellipse(0,0,r*1.15,r*.86,0,0,TAU);ctx.clip();
  for(let i=0;i<22;i++){const x=(hs(i)*2-1)*r,y=(hs(i+30)*2-1)*.76*r;if((x/(r*1.1))**2+(y/(r*.82))**2>.85)continue;
    const s=r*(.04+hs(i+60)*.05);ctx.fillStyle='rgba(30,12,4,.5)';ctx.beginPath();ctx.arc(x,y,s,0,TAU);ctx.fill();ctx.fillStyle='rgba(255,215,150,.25)';ctx.beginPath();ctx.arc(x-s*.3,y-s*.3,s*.45,0,TAU);ctx.fill();}
  ctx.strokeStyle='rgba(20,8,2,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-r*1.05,r*.05);ctx.bezierCurveTo(-r*.4,-r*.02,r*.3,r*.06,r*.8,r*.14);ctx.stroke();
  add(()=>{for(let i=0;i<7;i++){const x=-r*.8+i*r*.28,y=r*.38+Math.sin(i*.7)*r*.05;blob(x,y,r*.2,C.teal,.35+.35*Math.sin(t*3+i));}});
  ctx.restore();
  ctx.strokeStyle='rgba(255,190,90,.55)';ctx.lineWidth=1.3;ctx.beginPath();ctx.ellipse(0,0,r*1.15,r*.86,0,0,TAU);ctx.stroke();
  /* barbilhões */
  for(let k=0;k<3;k++){const bx=r*(.75+k*.12),by=r*.62,Q=[];for(let i=0;i<=8;i++){const u=i/8;Q.push({x:bx+u*r*.1+Math.sin(t*3+k+u*4)*r*.1*u,y:by+u*r*(.5+k*.08)});}
    taperLine(Q,1.5,.5,'rgba(255,200,120,.7)');add(()=>blob(Q[8].x,Q[8].y,r*.12,C.amber,.7));}
  /* mandíbula aberta com dentes */
  const a=.1+ch*.55+Math.sin(t*2.4)*.03,hx=r*.1,hy=r*.3,JL=r*1.12;
  ctx.save();ctx.translate(hx,hy);
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(JL,0);ctx.lineTo(Math.cos(a)*JL,Math.sin(a)*JL);ctx.closePath();
  ctx.fillStyle=rg(JL*.4,JL*.1,0,JL*.4,JL*.1,JL*.8,[[0,'#ffb060'],[.35,'#a01030'],[1,'#1a0208']]);ctx.fill();
  ctx.fillStyle='#f2e6d2';ctx.strokeStyle='rgba(40,16,4,.6)';ctx.lineWidth=.6;
  for(let i=0;i<8;i++){const x=JL*(.1+i*.115),h=r*(.15+(i%2)*.11);ctx.beginPath();ctx.moveTo(x-r*.04,0);ctx.lineTo(x+r*.045,0);ctx.lineTo(x+r*.01,h);ctx.closePath();ctx.fill();ctx.stroke();}
  ctx.save();ctx.rotate(a);
  ctx.beginPath();ctx.moveTo(-r*.12,-r*.05);ctx.lineTo(JL,-r*.02);ctx.bezierCurveTo(JL*1.02,r*.14,r*.7,r*.4,-r*.15,r*.3);ctx.closePath();
  ctx.fillStyle=lg(0,0,0,r*.4,[[0,'#8a4416'],[1,'#2a1208']]);ctx.fill();ctx.strokeStyle='rgba(255,176,32,.5)';ctx.lineWidth=1;ctx.stroke();
  ctx.fillStyle='#f2e6d2';ctx.strokeStyle='rgba(40,16,4,.6)';ctx.lineWidth=.6;
  for(let i=0;i<9;i++){const x=JL*(.08+i*.105),h=r*(.19+(i%3===0?.15:.03));ctx.beginPath();ctx.moveTo(x-r*.04,-r*.02);ctx.lineTo(x+r*.04,-r*.02);ctx.lineTo(x,-h);ctx.closePath();ctx.fill();ctx.stroke();}
  ctx.restore();ctx.restore();
  /* olho */
  ctx.fillStyle='#120804';ctx.beginPath();ctx.arc(r*.5,-r*.2,r*.25,0,TAU);ctx.fill();
  ctx.fillStyle=rg(r*.47,-r*.23,0,r*.5,-r*.2,r*.21,[[0,'#ffe9a0'],[.5,'#ff8a20'],[1,'#8a1410']]);ctx.beginPath();ctx.arc(r*.5,-r*.2,r*.21,0,TAU);ctx.fill();
  ctx.fillStyle='#050101';ctx.beginPath();ctx.ellipse(r*.52,-r*.2,r*.045,r*.17,0,0,TAU);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.9)';ctx.beginPath();ctx.arc(r*.43,-r*.27,r*.045,0,TAU);ctx.fill();
  /* isca luminosa */
  const S=[];for(let k=0;k<=14;k++)S.push(qbz(B,K,E,k/14));
  taperLine(S,r*.1,r*.04,'rgba(40,20,8,.95)');taperLine(S,r*.06,r*.02,'rgba(255,176,32,.8)');
  add(()=>{blob(E.x,E.y,r*(1.5+ch*1.4)*fl,C.amber,.5+ch*.4);blob(E.x,E.y,r*.7*fl,'#ffe08a',.85);
    for(let k=0;k<6;k++){const aa=k/6*TAU+t,len=r*(.3+.12*Math.sin(t*5+k)+ch*.22),fx=E.x+Math.cos(aa)*len,fy=E.y+Math.sin(aa)*len;
      ctx.strokeStyle='rgba(255,200,100,.7)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(E.x,E.y);ctx.lineTo(fx,fy);ctx.stroke();blob(fx,fy,r*.08,'#fff2c0',.9);}
    if(ch>0){ctx.strokeStyle='rgba(255,230,160,'+ch*.7+')';ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(E.x,E.y,r*(.4+(1-ch)*.9),0,TAU);ctx.stroke();
      for(let k=0;k<8;k++){const aa=k/8*TAU+t*3;ctx.beginPath();ctx.moveTo(E.x+Math.cos(aa)*r*.45,E.y+Math.sin(aa)*r*.45);ctx.lineTo(E.x+Math.cos(aa)*r*(.7+ch*.5),E.y+Math.sin(aa)*r*(.7+ch*.5));ctx.stroke();}}
  });
  ctx.fillStyle=rg(E.x-r*.06,E.y-r*.06,0,E.x,E.y,r*.26,[[0,'#fff6c8'],[.5,'#ffb020'],[1,'#c86a08']]);ctx.beginPath();ctx.arc(E.x,E.y,r*.24*(1+ch*.35),0,TAU);ctx.fill();
}

/* ================= 4 · OURIÇO ================= */
function urchinSpine(a,r0,len,wd,hot){
  ctx.save();ctx.rotate(a);
  ctx.beginPath();ctx.moveTo(r0,-wd);ctx.lineTo(len,-wd*.12);ctx.lineTo(len+wd*.3,0);ctx.lineTo(len,wd*.12);ctx.lineTo(r0,wd);ctx.closePath();
  ctx.fillStyle=lg(r0,0,len,0,[[0,'#1d3a12'],[.55,'#5fae2a'],[1,hot?'#f6ffd8':'#d8ff9c']]);ctx.fill();
  ctx.strokeStyle='rgba(2,12,6,.55)';ctx.lineWidth=1.1;
  for(let k=1;k<4;k++){const x=r0+(len-r0)*k/4,hw=wd*(1-k/4*.85);ctx.beginPath();ctx.moveTo(x,-hw);ctx.lineTo(x,hw);ctx.stroke();}
  ctx.strokeStyle='rgba(235,255,200,.5)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(r0,-wd*.5);ctx.lineTo(len,-wd*.08);ctx.stroke();
  ctx.restore();}
function drawUrchinNew(e){
  const r=e.r,t=e.t,ch=clamp((.6-e.cd)/.6,0,1);
  ctx.rotate(e.spin);ctx.translate(ch*Math.sin(t*60)*1.2,0);
  add(()=>{blob(0,0,r*(3+ch*1.4),C.bio,.2+ch*.3);
    for(let i=0;i<6;i++){const a=t*.5+i*1.05,d=r*(1.9+.25*Math.sin(t*1.3+i*2));blob(Math.cos(a)*d,Math.sin(a)*d,r*.14,C.bio,.5);}});
  ctx.lineCap='round';
  /* pés ambulacrários e espinhos finos */
  for(let i=0;i<36;i++){const a=i*TAU/36+.04,len=r*(1.0+.08*Math.sin(t*3+i)+.06*hs(i));
    ctx.strokeStyle='rgba(120,200,60,.55)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.65,Math.sin(a)*r*.65);ctx.lineTo(Math.cos(a)*len,Math.sin(a)*len);ctx.stroke();}
  for(let i=0;i<12;i++){const a=(i+.5)*TAU/12,len=r*(.92+.35*Math.sin(t*2+i)*.2),ex=Math.cos(a)*(r*.7+len*.5),ey=Math.sin(a)*(r*.7+len*.5);
    ctx.strokeStyle='rgba(200,255,150,.5)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.68,Math.sin(a)*r*.68);ctx.lineTo(ex,ey);ctx.stroke();add(()=>blob(ex,ey,r*.1,C.bio,.8));}
  /* espinhos secundários e primários */
  for(let i=0;i<12;i++)urchinSpine((i+.5)*TAU/12,r*.62,r*(1.18+ch*.15),r*.065,ch>.3);
  for(let i=0;i<12;i++)urchinSpine(i*TAU/12,r*.6,r*(1.55+ch*.4+Math.sin(t*4+i)*.04),r*.1,ch>.3);
  add(()=>{for(let i=0;i<12;i++){const a=i*TAU/12,len=r*(1.55+ch*.4+Math.sin(t*4+i)*.04);blob(Math.cos(a)*len,Math.sin(a)*len,r*(.3+ch*.35),ch>.3?'#ffffff':C.bio,.5+ch*.5);}});
  /* carapaça (teste) */
  ctx.beginPath();ctx.arc(0,0,r*.72,0,TAU);
  ctx.fillStyle=rg(-r*.25,-r*.3,r*.05,0,0,r*.8,[[0,'#7ccf3a'],[.45,'#2f6a14'],[1,'#0b1d08']]);ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(0,0,r*.72,0,TAU);ctx.clip();
  ctx.strokeStyle='rgba(5,20,5,.4)';ctx.lineWidth=1;
  for(const rr of[.36,.55,.7]){ctx.beginPath();for(let k=0;k<10;k++){const a=k*TAU/10+rr*2;k?ctx.lineTo(Math.cos(a)*r*rr,Math.sin(a)*r*rr):ctx.moveTo(Math.cos(a)*r*rr,Math.sin(a)*r*rr);}ctx.closePath();ctx.stroke();}
  for(let k=0;k<5;k++){const a=k*TAU/5,px=-Math.sin(a),py=Math.cos(a);
    for(let j=1;j<=6;j++){const d=j*r*.105,w=r*.045*(1+j*.06);
      ctx.fillStyle='rgba(4,14,4,.75)';ctx.beginPath();ctx.arc(Math.cos(a)*d+px*w,Math.sin(a)*d+py*w,r*.022,0,TAU);ctx.fill();ctx.beginPath();ctx.arc(Math.cos(a)*d-px*w,Math.sin(a)*d-py*w,r*.022,0,TAU);ctx.fill();}}
  for(const rr of[.28,.46,.62])for(let k=0;k<10;k++){const a=k*TAU/10+TAU/20+rr,x=Math.cos(a)*r*rr,y=Math.sin(a)*r*rr;
    ctx.fillStyle='rgba(180,240,120,.45)';ctx.beginPath();ctx.arc(x,y,r*.03,0,TAU);ctx.fill();}
  add(()=>{blob(0,0,r*(.6+ch*.9),C.bio,.5+ch*.5);blob(0,0,r*(.2+ch*.2),'#ffffff',.6+ch*.4);});
  if(ch>0.05){add(()=>{ctx.strokeStyle='rgba(230,255,140,'+ch*.9+')';ctx.lineWidth=1.4;
    for(let k=0;k<10;k++){const a=k*TAU/10;ctx.beginPath();ctx.moveTo(0,0);let x=0,y=0;for(let j=1;j<=4;j++){x=Math.cos(a+hs(k+j)*.3-.15)*r*.18*j;y=Math.sin(a+hs(k+j)*.3-.15)*r*.18*j;ctx.lineTo(x,y);}ctx.stroke();}});}
  ctx.restore();
  ctx.strokeStyle='rgba(180,255,110,.75)';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(0,0,r*.72,0,TAU);ctx.stroke();
  ctx.save();ctx.rotate(-e.spin);add(()=>blob(-r*.26,-r*.3,r*.38,C.white,.3));ctx.restore();
  /* aviso de explosão radial */
  if(ch>.05){add(()=>{ctx.strokeStyle='rgba(141,255,69,'+ch*.55+')';ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(0,0,r*(2.3-ch*.5),0,TAU);ctx.stroke();
    for(let i=0;i<12;i++){const a=i*TAU/12,d=r*(2.35-ch*.55);ctx.save();ctx.translate(Math.cos(a)*d,Math.sin(a)*d);ctx.rotate(a+PI);ctx.fillStyle='rgba(230,255,160,'+ch*.85+')';ctx.beginPath();ctx.moveTo(r*.12,0);ctx.lineTo(-r*.08,r*.08);ctx.lineTo(-r*.08,-r*.08);ctx.closePath();ctx.fill();ctx.restore();}});}
}

/* ================= 5 · CARAPAÇA (caranguejo) ================= */
function drawCrabNew(e){
  const r=e.r,t=e.t,st=e.st||'idle',wind=st==='wind',chg=st==='charge',rest=st==='rest';
  const heat=wind||chg?1:(rest?.12:.3+.08*Math.sin(t*2)),sh=wind?Math.sin(t*45)*2.2:0,gp=t*(chg?16:(rest?2:6));
  ctx.rotate(e.ang+PI/2);ctx.translate(sh,0);
  if(chg)add(()=>{blob(0,r*.8,r*2.2,C.crimson,.35);for(let i=0;i<9;i++){const x=(hs(i)-.5)*r*1.8,l=r*(.8+hs(i+9)*1.2);ctx.strokeStyle='rgba(255,176,32,'+(.5-i*.03)+')';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,r*.9);ctx.lineTo(x,r*.9+l);ctx.stroke();}});
  /* patas articuladas */
  for(const s of[-1,1])for(let i=0;i<4;i++){
    const ph=gp+i*1.35+(s>0?PI:0),sw=Math.sin(ph)*r*.15,lf=Math.max(0,Math.cos(ph))*r*.06;
    const A={x:s*r*.72,y:-r*.2+i*r*.32},K={x:s*r*(1.0+i*.05),y:A.y-r*.2+sw*.5-lf},F={x:s*r*(1.28+i*.04+(i===0?.1:0)),y:A.y+r*.28+sw*.9};
    taperLine([A,K],r*.2,r*.15,'rgba(30,4,10,.95)');taperLine([K,F],r*.15,r*.05,'rgba(30,4,10,.95)');
    taperLine([A,K],r*.15,r*.11,'#b0283c');taperLine([K,F],r*.11,r*.035,'#d8404f');
    ctx.strokeStyle='rgba(255,200,200,.25)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(A.x,A.y-r*.05);ctx.lineTo(K.x,K.y-r*.05);ctx.stroke();
    ctx.fillStyle='#5a0f1e';ctx.beginPath();ctx.arc(K.x,K.y,r*.095,0,TAU);ctx.fill();
    add(()=>blob(K.x,K.y,r*.3,C.amber,.2+heat*.5));
    spike(F.x,F.y,Math.atan2(F.y-K.y,F.x-K.x),r*.2,r*.04,'#f2e6d2');}
  /* braços e garras */
  const open=wind?.5:(chg?.62:.16),finger=(L,w)=>{ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(w*1.7,-L*.15,w*1.5,-L*.75,w*.15,-L);ctx.bezierCurveTo(w*.55,-L*.65,w*.5,-L*.3,0,-w*.25);ctx.closePath();};
  for(const s of[-1,1]){
    const S0={x:s*r*.6,y:-r*.5},E={x:s*r*1.3,y:-r*.62},W={x:s*r*1.12,y:-r*1.22};
    taperLine([S0,E],r*.3,r*.26,'rgba(30,4,10,.95)');taperLine([E,W],r*.26,r*.22,'rgba(30,4,10,.95)');
    taperLine([S0,E],r*.24,r*.2,'#a8243a');taperLine([E,W],r*.2,r*.17,'#c23046');
    ctx.fillStyle='#5a0f1e';ctx.beginPath();ctx.arc(E.x,E.y,r*.13,0,TAU);ctx.fill();add(()=>blob(E.x,E.y,r*.4,C.amber,.15+heat*.45));
    ctx.save();ctx.translate(W.x,W.y);ctx.rotate(s*.1);
    ctx.beginPath();ctx.ellipse(0,-r*.02,r*.4,r*.34,0,0,TAU);ctx.fillStyle=rg(-r*.1,-r*.15,r*.04,0,0,r*.45,[[0,'#e0505f'],[.5,'#a8243a'],[1,'#3a0a14']]);ctx.fill();
    ctx.strokeStyle='rgba(255,210,200,.4)';ctx.lineWidth=1.1;ctx.stroke();
    ctx.strokeStyle='rgba(40,4,12,.5)';ctx.lineWidth=1;for(let k=0;k<3;k++){ctx.beginPath();ctx.arc(0,r*.05,r*(.14+k*.09),PI*1.15,PI*1.85);ctx.stroke();}
    const op=open+(st==='idle'?Math.sin(t*3+(s>0?0:1.5))*.04:0),L=r*.92,w=r*.32;
    for(const sg of[1,-1]){ctx.save();ctx.translate(0,-r*.2);ctx.scale(s*sg,1);ctx.rotate(op*(sg>0?.45:.85));
      finger(L,w);ctx.fillStyle=lg(0,0,0,-L,[[0,'#7a1426'],[.7,'#d8334a'],[1,'#f2e6d2']]);ctx.fill();ctx.strokeStyle='rgba(30,4,10,.9)';ctx.lineWidth=1.2;ctx.stroke();
      ctx.fillStyle='#f2e6d2';
      for(let k=1;k<=5;k++){const p=cbz([w*.15,-L],[w*.55,-L*.65],[w*.5,-L*.3],[0,-w*.25],k/6);ctx.beginPath();ctx.moveTo(p.x,p.y-r*.05);ctx.lineTo(p.x,p.y+r*.05);ctx.lineTo(p.x-w*.32,p.y);ctx.closePath();ctx.fill();}
      add(()=>blob(w*.15,-L,r*.3,C.amber,heat*.5));ctx.restore();}
    ctx.restore();}
  /* carapaça */
  const OUT=[[0,-1.08],[.42,-.95],[.82,-.62],[.98,-.08],[.88,.5],[.6,.9],[0,1.0],[-.6,.9],[-.88,.5],[-.98,-.08],[-.82,-.62],[-.42,-.95]].map(p=>[p[0]*r,p[1]*r]);
  for(const p of[[.9,-.45,-.5],[.97,.05,0],[.85,.55,.5],[-.9,-.45,PI+.5],[-.97,.05,PI],[-.85,.55,PI-.5]])spike(p[0]*r,p[1]*r,p[2],r*.3,r*.1,'#f2e6d2','rgba(30,4,10,.8)');
  smooth(OUT);ctx.fillStyle=rg(-r*.25,-r*.35,r*.05,0,0,r*1.15,[[0,'#ea5865'],[.4,'#a8243a'],[1,'#3a0a14']]);ctx.fill();
  ctx.save();smooth(OUT);ctx.clip();
  ctx.strokeStyle='rgba(255,200,200,.16)';ctx.lineWidth=1.2;
  for(const k of[.78,.58,.38]){ctx.save();ctx.scale(k,k*.98);smooth(OUT);ctx.lineWidth=1.2/k;ctx.stroke();ctx.restore();}
  const grooves=[[[-.75,-.12],[0,-.38],[.75,-.12]],[[0,.05],[-.3,.3],[-.55,.6]],[[0,.05],[.3,.3],[.55,.6]],[[-.3,-.2],[-.55,-.4],[-.8,-.5]],[[.3,-.2],[.55,-.4],[.8,-.5]]];
  ctx.lineCap='round';
  for(const g of grooves){ctx.strokeStyle='rgba(20,0,5,.7)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(g[0][0]*r,g[0][1]*r);ctx.quadraticCurveTo(g[1][0]*r,g[1][1]*r,g[2][0]*r,g[2][1]*r);ctx.stroke();}
  add(()=>{for(const g of grooves){ctx.strokeStyle='rgba(255,150,40,'+(heat*.75*(.8+.2*Math.sin(t*6+g[1][0]*4)))+')';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(g[0][0]*r,g[0][1]*r);ctx.quadraticCurveTo(g[1][0]*r,g[1][1]*r,g[2][0]*r,g[2][1]*r);ctx.stroke();}
    blob(0,0,r*1.3,C.crimson,.1+heat*.25);});
  ctx.strokeStyle='rgba(255,210,200,.3)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(0,-.95*r);ctx.lineTo(0,.9*r);ctx.stroke();
  for(let k=0;k<9;k++){const y=-.8*r+k*.2*r;ctx.fillStyle='rgba(255,215,205,.5)';ctx.beginPath();ctx.arc(0,y,r*.028,0,TAU);ctx.fill();}
  for(let i=0;i<12;i++){const x=(hs(i+3)*2-1)*.7*r,y=(hs(i+13)*2-1)*.7*r,s=r*(.04+hs(i+23)*.04);
    ctx.fillStyle='rgba(30,8,10,.55)';ctx.beginPath();ctx.arc(x,y,s,0,TAU);ctx.fill();ctx.fillStyle='rgba(255,225,215,.4)';ctx.beginPath();ctx.arc(x-s*.3,y-s*.3,s*.5,0,TAU);ctx.fill();}
  ctx.strokeStyle='rgba(10,0,4,.35)';ctx.lineWidth=1;for(let i=0;i<4;i++){const x=(hs(i+40)*2-1)*.6*r,y=(hs(i+44)*2-1)*.5*r;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+r*.24,y+r*.1);ctx.moveTo(x+r*.03,y+r*.06);ctx.lineTo(x+r*.2,y+r*.2);ctx.stroke();}
  ctx.restore();
  smooth(OUT);ctx.strokeStyle='rgba(255,140,150,.85)';ctx.lineWidth=1.7;ctx.stroke();
  /* rostro e olhos */
  ctx.fillStyle='#f2e6d2';ctx.strokeStyle='rgba(30,4,10,.8)';ctx.lineWidth=.9;poly([[-.14*r,-1.0*r],[0,-1.5*r],[.14*r,-1.0*r]]);ctx.fill();ctx.stroke();
  for(const s of[-1,1]){ctx.strokeStyle='#5a0f1e';ctx.lineWidth=r*.07;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(s*r*.2,-.9*r);ctx.lineTo(s*r*.3,-1.12*r);ctx.stroke();
    ctx.fillStyle=rg(s*r*.28,-1.16*r,0,s*r*.3,-1.14*r,r*.14,[[0,'#fff1b0'],[.5,'#ffb020'],[1,'#a04008']]);ctx.beginPath();ctx.arc(s*r*.3,-1.14*r,r*.13,0,TAU);ctx.fill();
    ctx.fillStyle='#120204';ctx.beginPath();ctx.ellipse(s*r*.3,-1.14*r,r*.035,r*.1,0,0,TAU);ctx.fill();add(()=>blob(s*r*.3,-1.14*r,r*.34,C.amber,.4+heat*.4));}
  add(()=>blob(0,0,r*(1.6+heat*.5),C.crimson,.14+heat*.2));
  if(wind){add(()=>{ctx.setLineDash([r*.16,r*.1]);ctx.lineDashOffset=-t*40;ctx.strokeStyle='rgba(255,176,32,'+(.55+.3*Math.sin(t*20))+')';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-1.55*r);ctx.lineTo(0,-2.55*r);ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(0,-2.2*r,r*.22,0,TAU);ctx.stroke();});}
  if(rest){add(()=>{for(let i=0;i<5;i++){const u=fr(t*.6+i*.21),x=(hs(i)-.5)*r*1.2,y=-r*.2-u*r*1.3;blob(x,y,r*(.2+u*.3),C.slate,.35*(1-u));}});}
}

/* ================= 6 · ENGUIA ================= */
function drawEelNew(e){
  const r=e.r,t=e.t,st=e.st||'idle',beam=st==='beam',ch=st==='aim'?clamp(1-e.stT,0,1):(beam?1:0);
  ctx.rotate(e.ang);
  const N=16,S=[];
  for(let i=0;i<=N;i++){const u=i/N;S.push({x:r*1.15-u*r*3.4,y:Math.sin(t*7-u*6.5)*r*(.14+.36*u),u:u});}
  for(let i=0;i<=N;i++){const a=S[Math.max(0,i-1)],b=S[Math.min(N,i+1)];let tx=a.x-b.x,ty=a.y-b.y;const l=Math.hypot(tx,ty)||1;tx/=l;ty/=l;const s=S[i];s.tx=tx;s.ty=ty;s.nx=ty;s.ny=-tx;s.w=r*(.44*Math.pow(1-s.u,.7)+.07)*(1+.12*Math.sin(s.u*PI));}
  add(()=>{blob(0,0,r*3.2,C.info,.2+ch*.25+(beam?.3:0));for(let i=2;i<N;i+=4)blob(S[i].x,S[i].y,r*1.1,C.electric,.14+ch*.2);});
  /* nadadeiras dorsal e anal */
  for(const sd of[1,-1]){const top=sd>0,P1=[],P2=[];
    for(let i=2;i<N-1;i++){const s=S[i],fh=r*(top?.3:.16)*(Math.sin(s.u*PI*.9)*.9+.15)*(1+.25*Math.sin(t*9-i*.6));
      P1.push([s.x+s.nx*sd*s.w,s.y+s.ny*sd*s.w]);P2.push([s.x+s.nx*sd*(s.w+fh),s.y+s.ny*sd*(s.w+fh)]);}
    ctx.beginPath();P1.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));for(let k=P2.length-1;k>=0;k--)ctx.lineTo(P2[k][0],P2[k][1]);ctx.closePath();
    ctx.fillStyle=top?'rgba(59,130,255,.38)':'rgba(79,195,255,.28)';ctx.fill();ctx.strokeStyle='rgba(190,240,255,.55)';ctx.lineWidth=.9;ctx.stroke();
    ctx.strokeStyle='rgba(190,240,255,.3)';ctx.beginPath();for(let i=0;i<P1.length;i+=2){ctx.moveTo(P1[i][0],P1[i][1]);ctx.lineTo(P2[i][0],P2[i][1]);}ctx.stroke();}
  /* corpo em camadas */
  const layer=(k,off,col)=>{ctx.lineCap='round';for(let i=0;i<N;i++){const a=S[i],b=S[i+1];ctx.strokeStyle=typeof col==='function'?col(i):col;ctx.lineWidth=(a.w+b.w)*k;ctx.beginPath();ctx.moveTo(a.x+a.nx*off*a.w,a.y+a.ny*off*a.w);ctx.lineTo(b.x+b.nx*off*b.w,b.y+b.ny*off*b.w);ctx.stroke();}};
  layer(1.12,0,'rgba(2,12,28,.96)');layer(1,0,i=>i%2?'#0d5c8f':'#0a4a78');layer(.62,.2,'#1da6e0');layer(.5,.34,'rgba(150,240,255,.55)');layer(.28,-.42,'rgba(235,252,255,.3)');
  if(beam)layer(.95,0,'rgba(255,255,255,.55)');
  ctx.strokeStyle='rgba(2,14,30,.35)';ctx.lineWidth=1.2;ctx.beginPath();for(let i=2;i<N;i+=2){const s=S[i];ctx.moveTo(s.x+s.nx*s.w,s.y+s.ny*s.w);ctx.lineTo(s.x-s.nx*s.w,s.y-s.ny*s.w);}ctx.stroke();
  /* órgão elétrico */
  add(()=>{for(let i=2;i<N-1;i++){const s=S[i],pu=.5+.5*Math.sin(t*6-i*.7);blob(s.x,s.y,r*(.3+ch*.35+(beam?.3:0)),'#d8ffff',.22+ch*.55+pu*.2);}
    ctx.strokeStyle='rgba(210,252,255,.85)';ctx.lineWidth=1.2;
    for(let i=1;i<N-2;i+=2){if(Math.random()<.14+ch*.7+(beam?.2:0)){const a=S[i],b=S[i+2];bolt(a.x+a.nx*a.w*.6,a.y+a.ny*a.w*.6,b.x-b.nx*b.w*.6,b.y-b.ny*b.w*.6,3,a.w*.45);}}
    blob(S[N].x,S[N].y,r*.5,C.info,.5+ch*.4);});
  /* nadadeiras peitorais */
  for(const sd of[-1,1]){const s=S[2];ctx.save();ctx.translate(s.x+s.nx*sd*s.w*.8,s.y+s.ny*sd*s.w*.8);ctx.rotate(Math.atan2(s.ny*sd,s.nx*sd)+sd*Math.sin(t*9)*.25-sd*.5);
    ctx.beginPath();ctx.ellipse(r*.3,0,r*.34,r*.1,0,0,TAU);ctx.fillStyle='rgba(120,215,255,.55)';ctx.fill();ctx.strokeStyle='rgba(210,245,255,.6)';ctx.lineWidth=.8;ctx.stroke();ctx.restore();}
  /* cabeça */
  const H=S[0],ha=Math.atan2(S[0].y-S[2].y,S[0].x-S[2].x);
  ctx.save();ctx.translate(H.x,H.y);ctx.rotate(ha*.8);
  ctx.beginPath();ctx.moveTo(r*.65,0);ctx.bezierCurveTo(r*.5,-r*.34,0,-r*.46,-r*.5,-r*.4);ctx.lineTo(-r*.5,r*.4);ctx.bezierCurveTo(0,r*.46,r*.5,r*.34,r*.65,0);ctx.closePath();
  ctx.fillStyle=lg(-r*.5,0,r*.65,0,[[0,'#0a3a66'],[1,'#27b9e8']]);ctx.fill();ctx.strokeStyle='rgba(2,14,30,.9)';ctx.lineWidth=1.4;ctx.stroke();
  ctx.strokeStyle='rgba(210,250,255,.55)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-r*.4,-r*.28);ctx.bezierCurveTo(0,-r*.34,r*.3,-r*.22,r*.58,-r*.04);ctx.stroke();
  ctx.strokeStyle='rgba(2,14,30,.7)';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(r*.62,0);ctx.lineTo(r*.15,0);ctx.stroke();
  for(const sd of[-1,1]){for(let k=0;k<4;k++){add(()=>blob(r*(.05+k*.14),sd*r*(.34-k*.03),r*.1,'#c8ffff',.4+.4*Math.sin(t*4+k+sd)));}
    ctx.fillStyle='#021428';ctx.beginPath();ctx.arc(r*.26,sd*r*.22,r*.12,0,TAU);ctx.fill();
    ctx.fillStyle=ch>.2?'#ffffff':'#c8f6ff';ctx.beginPath();ctx.arc(r*.27,sd*r*.22,r*.085,0,TAU);ctx.fill();ctx.fillStyle='#021428';ctx.beginPath();ctx.arc(r*.3,sd*r*.22,r*.04,0,TAU);ctx.fill();
    add(()=>blob(r*.27,sd*r*.22,r*(.3+ch*.4),'#d8ffff',.5+ch*.4));}
  add(()=>{blob(r*.7,0,r*(.4+ch*.8+(beam?.6:0)),'#ffffff',.25+ch*.5);
    if(ch>.05&&!beam){ctx.strokeStyle='rgba(210,252,255,'+ch*.8+')';ctx.lineWidth=1.2;for(let k=0;k<7;k++){const a=(k/7-.5)*1.7,d=r*(1.6*(1-ch)+.35);bolt(r*.7+Math.cos(a)*d,Math.sin(a)*d,r*.7+Math.cos(a)*d*.55,Math.sin(a)*d*.55,3,r*.08);}
      ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(r*.9,0,r*(.5-ch*.2),-PI*.5,PI*.5);ctx.stroke();}
    if(beam){ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=1.6;for(let k=0;k<10;k++){const a=rnd(-1,1),l=r*rnd(.6,1.3);ctx.beginPath();ctx.moveTo(r*.7,0);ctx.lineTo(r*.7+Math.cos(a)*l,Math.sin(a)*l);ctx.stroke();}}});
  ctx.restore();
  /* anéis de capacitor no pescoço */
  if(ch>0){add(()=>{for(let i=2;i<=4;i++){const s=S[i];ctx.strokeStyle='rgba(230,255,255,'+(ch*(.4+.4*Math.sin(t*14-i*1.5)))+')';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(s.x+s.nx*s.w*1.15,s.y+s.ny*s.w*1.15);ctx.lineTo(s.x-s.nx*s.w*1.15,s.y-s.ny*s.w*1.15);ctx.stroke();}});}
}

/* ================= 7 · RAINHA MEDUSA (chefe) ================= */
function drawMedusaNew(e){
  const r=e.r,t=e.t,hot=e.phase===2,st=e.st||'idle';
  const c1=hot?'#a855f7':'#ff2e88',c2=hot?'#ff2e88':'#a855f7',rgbA=hot?'168,85,247':'255,46,136';
  const fp=P||{x:0,y:0},sp=hot?2.4:1.6,pu=Math.sin(t*sp);
  const w=r*(1.04+pu*.03),hg=r*(1+pu*.035),ry=r*.2,n=16,dp=r*.11;
  ctx.rotate(Math.sin(t*.5)*.07);
  add(()=>{blob(0,-r*.1,r*3.6,c1,.2+(st!=='idle'?.12:0)+(hot?.08:0));blob(0,-r*.3,r*2,'#ffd0ea',.1);});
  /* tentáculos finos */
  for(let i=0;i<16;i++){
    const ox=w*(.95-1.9*i/15),len=r*(1.9+hs(i)*.55),Q=[];
    for(let k=0;k<=18;k++){const u=k/18;Q.push({x:ox*(1+u*.18)+Math.sin(t*1.7+i*1.1-u*5)*r*.26*u*(1+u),y:ry+u*len});}
    taperLine(Q,3,.7,'rgba('+rgbA+',.5)');
    add(()=>{for(let b=0;b<5;b++){const u=fr(t*.35+b/5+hs(i+5)),p=Q[Math.min(18,Math.floor(u*18))];blob(p.x,p.y,r*.07,C.bio,.8*(1-u*.6));}});
  }
  /* braços orais */
  for(let a=0;a<6;a++){
    const ox=(a-2.5)*r*.2,L=r*(1.5+hs(a+9)*.4),A=[],B=[];
    for(let k=0;k<=18;k++){const u=k/18,cx=ox+Math.sin(t*1.8+a*1.5-u*4.5)*r*.3*u,cy=ry+u*L,wd=r*.1*(1-u*.65)*(1+.4*Math.sin(u*20-t*3.5+a));A.push([cx-wd,cy]);B.push([cx+wd,cy]);}
    ctx.beginPath();A.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));for(let k=B.length-1;k>=0;k--)ctx.lineTo(B[k][0],B[k][1]);ctx.closePath();
    ctx.fillStyle=lg(0,ry,0,ry+L,[[0,'rgba('+rgbA+',.8)'],[1,'rgba('+rgbA+',.05)']]);ctx.fill();ctx.strokeStyle='rgba(255,215,240,.3)';ctx.lineWidth=.9;ctx.stroke();
  }
  /* camadas externas do sino */
  for(let L=2;L>=1;L--){bellP(w*(1+L*.1),hg*(1+L*.1),ry+r*.03*L,n,dp,t,sp);ctx.fillStyle='rgba('+rgbA+','+(.07+L*.02)+')';ctx.fill();ctx.strokeStyle='rgba(255,220,240,'+(.12+L*.05)+')';ctx.lineWidth=1.3;ctx.stroke();}
  bellP(w,hg,ry,n,dp,t,sp);ctx.fillStyle=lg(0,-hg,0,ry+dp*2,[[0,'rgba(255,170,225,.93)'],[.4,'rgba('+rgbA+',.75)'],[1,'rgba(90,30,170,.6)']]);ctx.fill();
  ctx.save();bellP(w,hg,ry,n,dp,t,sp);ctx.clip();
  ctx.fillStyle=rg(-w*.3,-hg*.55,r*.05,0,-hg*.2,w*1.15,[[0,'rgba(255,240,250,.5)'],[.5,'rgba(255,255,255,0)'],[1,'rgba(30,0,50,.5)']]);ctx.fillRect(-w*1.4,-hg*1.5,w*2.8,hg*2.4);
  ctx.lineWidth=1.1;ctx.strokeStyle='rgba(255,215,240,.34)';
  for(let k=0;k<16;k++){const a=PI+(k+.5)/16*PI,ex=Math.cos(a)*w*.94,ey=Math.sin(a)*hg*.94+ry*.5,mx=Math.cos(a)*w*.55,my=Math.sin(a)*hg*.45-hg*.12;
    ctx.beginPath();ctx.moveTo(0,-hg*.2);ctx.quadraticCurveTo(mx,my,ex,ey);ctx.stroke();
    const a2=a+(k%2?.08:-.08);ctx.beginPath();ctx.moveTo(mx,my);ctx.lineTo(Math.cos(a2)*w*.8,Math.sin(a2)*hg*.8-hg*.05);ctx.stroke();}
  ctx.strokeStyle='rgba(141,255,69,.42)';ctx.lineWidth=1.8;ctx.beginPath();ctx.ellipse(0,ry*.7,w*.92,r*.13,0,0,PI);ctx.stroke();
  for(const g of[-1,1])for(let h=0;h<2;h++){const gx=g*w*(.38+.2*h),gy=-hg*(.52-.24*h);
    ctx.strokeStyle='rgba(255,176,32,.55)';ctx.lineWidth=r*.07;ctx.lineCap='round';ctx.beginPath();ctx.arc(gx,gy,r*.16,PI*.1,PI*.9);ctx.stroke();
    add(()=>blob(gx,gy,r*.35,C.amber,.25+.15*Math.sin(t*2.5+g+h)));}
  ctx.fillStyle='rgba(255,240,250,.7)';for(let i=0;i<10;i++){const x=Math.sin(t*.6+i*1.7)*w*.65,y=-hg*.1-fr(t*.1+hs(i))*hg*.8;ctx.beginPath();ctx.arc(x,y,r*.022,0,TAU);ctx.fill();}
  if(hot){add(()=>{ctx.lineCap='round';for(let k=0;k<3;k++){ctx.strokeStyle='rgba(255,200,240,'+(.45+.3*Math.sin(t*7+k))+')';ctx.lineWidth=1.6;ctx.beginPath();let x=(k-1)*w*.35,y=-hg*.95;ctx.moveTo(x,y);for(let j=1;j<=7;j++){x+=(hs(k*7+j)-.5)*r*.22+(k-1)*r*.04;y+=hg*.2;ctx.lineTo(x,y);}ctx.stroke();}
    if(Math.random()<.25){ctx.strokeStyle='rgba(255,230,255,.9)';ctx.lineWidth=1.4;const a=rnd(PI,TAU);bolt(0,-hg*.2,Math.cos(a)*w*.9,Math.sin(a)*hg*.9,6,r*.1);}});}
  ctx.restore();
  bellP(w,hg,ry,n,dp,t,sp);ctx.strokeStyle='rgba(255,230,245,.6)';ctx.lineWidth=1.6;ctx.stroke();
  /* fotóforos da borda com onda de luz */
  add(()=>{for(let i=0;i<n;i++){const xm=w-(i+.5)/n*2*w,d=dp*(1+.25*Math.sin(t*sp+i*.9)),k=.5+.5*Math.sin(t*4-i*.55+(st==='spiral'?t*6:0));
    blob(xm,ry+d,r*.15*(.7+k*.6),C.bio,.4+.55*k);blob(xm,ry+d,r*.05,C.white,.5+.4*k);}
    blob(-w*.45,-hg*.65,r*.34,C.white,.35);});
  ctx.strokeStyle='rgba(255,255,255,.4)';ctx.lineWidth=r*.05;ctx.lineCap='round';ctx.beginPath();ctx.ellipse(0,-hg*.05,w*.82,hg*.84,0,PI*1.1,PI*1.42);ctx.stroke();
  /* coroa de espinhos */
  for(let i=0;i<7;i++){const a=PI*1.18+i*PI*.64/6,bx=Math.cos(a)*w*.8,by=Math.sin(a)*hg*.92,ang=Math.atan2(by+hg*.1,bx),len=r*(.3+.22*Math.sin(i*PI/6));
    spike(bx,by,ang,len,r*.06,'rgba(242,230,210,.92)','rgba(60,10,50,.7)');
    add(()=>blob(bx+Math.cos(ang)*len,by+Math.sin(ang)*len,r*.14,i%2?c1:C.bio,.7+.2*Math.sin(t*3+i)));}
  /* olho */
  const ey0=-r*.2;
  add(()=>blob(0,ey0,r*1.0,'#ffd8ee',.4+(st!=='idle'?.12:0)));
  ctx.save();ctx.translate(0,ey0);
  ctx.beginPath();ctx.ellipse(0,0,r*.44,r*.33,0,0,TAU);ctx.fillStyle=rg(0,0,r*.1,0,0,r*.45,[[0,'rgba(20,0,20,0)'],[1,'rgba(40,0,50,.6)']]);ctx.fill();
  ctx.beginPath();ctx.ellipse(0,0,r*.36,r*.28,0,0,TAU);ctx.fillStyle=rg(-r*.1,-r*.1,r*.03,0,0,r*.38,[[0,'#fff8ef'],[.7,'#f2e6d2'],[1,'#c9a99a']]);ctx.fill();
  ctx.strokeStyle='rgba(200,60,80,.35)';ctx.lineWidth=.8;for(let k=0;k<6;k++){const a=k*TAU/6+.3;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.36,Math.sin(a)*r*.28);ctx.lineTo(Math.cos(a)*r*.24,Math.sin(a)*r*.18);ctx.stroke();}
  const ea=Math.atan2(fp.y-e.y,fp.x-e.x),ix=Math.cos(ea)*r*.09,iy=Math.sin(ea)*r*.07;
  ctx.save();ctx.translate(ix,iy);
  ctx.beginPath();ctx.arc(0,0,r*.21,0,TAU);ctx.fillStyle=rg(0,0,r*.04,0,0,r*.21,[[0,'#ffffff'],[.3,c2],[.7,c1],[1,'#3a0420']]);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.2)';ctx.lineWidth=.8;for(let k=0;k<28;k++){const a=k/28*TAU;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.07,Math.sin(a)*r*.07);ctx.lineTo(Math.cos(a)*r*.2,Math.sin(a)*r*.2);ctx.stroke();}
  ctx.strokeStyle='rgba(0,0,0,.5)';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(0,0,r*.21,0,TAU);ctx.stroke();
  ctx.fillStyle='#10020a';ctx.beginPath();ctx.ellipse(0,0,r*.045,r*.15,0,0,TAU);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.9)';ctx.beginPath();ctx.arc(-r*.06,-r*.07,r*.035,0,TAU);ctx.fill();
  ctx.restore();
  ctx.strokeStyle='rgba(60,0,40,.85)';ctx.lineWidth=r*.05;ctx.beginPath();ctx.ellipse(0,0,r*.36,r*.28,0,PI*1.05,PI*1.95);ctx.stroke();
  ctx.strokeStyle=c1;ctx.lineWidth=1.4;ctx.beginPath();for(let k=0;k<9;k++){const a=PI*1.1+k*PI*.8/8;ctx.moveTo(Math.cos(a)*r*.36,Math.sin(a)*r*.28);ctx.lineTo(Math.cos(a)*r*.5,Math.sin(a)*r*.4);}ctx.stroke();
  ctx.restore();
  /* efeitos dos ataques */
  if(st==='burst'){const q=fr(t*2.2);add(()=>{ctx.strokeStyle='rgba(255,100,190,'+(1-q)*.55+')';ctx.lineWidth=3*(1-q)+1;ctx.beginPath();ctx.ellipse(0,ry,w*(1+q*1.2),r*(.35+q*.8),0,0,TAU);ctx.stroke();});}
  if(st==='spiral'){add(()=>{for(let k=0;k<3;k++){const a=t*3+k*TAU/3,x=Math.cos(a)*r*2,y=-r*.2+Math.sin(a)*r*2;ctx.strokeStyle='rgba(200,130,255,.38)';ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.3,-r*.2+Math.sin(a)*r*.3);ctx.lineTo(x,y);ctx.stroke();blob(x,y,r*.18,C.violet,.8);}});}
  if(st==='summon'){add(()=>{ctx.setLineDash([r*.12,r*.1]);ctx.lineDashOffset=-t*30;ctx.strokeStyle='rgba(141,255,69,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-r*.2,r*1.9,0,TAU);ctx.stroke();ctx.setLineDash([]);});}
  if(st==='slam'){add(()=>{blob(0,r*1.2,r*1.8,c1,.4+.2*Math.sin(t*12));ctx.strokeStyle='rgba(255,120,200,.55)';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(0,r*2.2,r*(1+.3*Math.sin(t*10)),r*.28,0,0,TAU);ctx.stroke();});}
  if(hot){add(()=>{for(let i=0;i<8;i++){const a=t*.9+i*TAU/8,x=Math.cos(a)*r*1.55,y=ry+Math.sin(a)*r*.35;ctx.fillStyle='rgba(255,200,240,.85)';ctx.beginPath();ctx.moveTo(x,y-r*.08);ctx.lineTo(x+r*.05,y);ctx.lineTo(x,y+r*.08);ctx.lineTo(x-r*.05,y);ctx.closePath();ctx.fill();blob(x,y,r*.2,c1,.6);}});}
}

/* Leviathan.draw(ctx, e) — Canvas 2D, sem dependências.
   O contexto deve estar transladado para (e.x, e.y), como no drawLeviathan original.
   e = { x, y, r, ang, t, segs:[{x,y}...], phase?, st?, flash?, jaw?, roar?, girth? } */
const Leviathan=(()=>{
const PI=Math.PI,TAU=PI*2,lerp=(a,b,k)=>a+(b-a)*k,fract=x=>x-Math.floor(x),hs=i=>fract(Math.sin(i*12.9898+4.1)*43758.5453);
const qb=(a,b,d,t)=>{const u=1-t;return{x:u*u*a.x+2*u*t*b.x+t*t*d.x,y:u*u*a.y+2*u*t*b.y+t*t*d.y};};
const GC={};
function glow(h){if(GC[h])return GC[h];const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),n=parseInt(h.slice(1),16);
  const gr=g.createRadialGradient(32,32,0,32,32,32);[[0,1],[.22,.6],[.52,.17],[1,0]].forEach(s=>gr.addColorStop(s[0],'rgba('+(n>>16)+','+(n>>8&255)+','+(n&255)+','+s[1]+')'));
  g.fillStyle=gr;g.fillRect(0,0,64,64);return GC[h]=c;}
function blob(c,x,y,r,h,a){c.globalAlpha=Math.min(1,a);c.drawImage(glow(h),x-r,y-r,r*2,r*2);c.globalAlpha=1;}
function taper(c,P,n,w0,w1,col){c.strokeStyle=col;c.lineCap='round';let p=P(0);for(let i=1;i<=n;i++){const q=P(i/n);c.lineWidth=lerp(w0,w1,i/n);c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke();p=q;}}

function draw(c,e){
  const R=e.r,t=e.t,hot=e.phase===2?1:0,fl=Math.min(1,(e.flash||0)*6),st=e.st||'idle',GI=e.girth||1,sc=R/52;
  const jw=e.jaw!=null?e.jaw:(st==='spit'?1:st==='charge'?.8:.12+.1*Math.sin(t*2.2)),j=Math.max(0,Math.min(1,jw));
  const K=(a,al)=>{const m=a.map(v=>Math.round(lerp(v,255,fl)));return 'rgba('+m[0]+','+m[1]+','+m[2]+','+(al==null?1:al)+')';};
  const L0=[18,5,11],L1=hot?[74,12,18]:[52,17,17],L2=hot?[150,30,26]:[112,44,18],L3=hot?[255,96,62]:[214,138,40],BONE=[242,230,210],RED=[255,59,87];
  const ACC=hot?'#ff3b57':'#ffb020',LUM=hot?'#ff2e88':'#8dff45';
  /* ---- espinha suavizada (Catmull-Rom) ---- */
  const raw=[{x:0,y:0}];(e.segs||[]).forEach(s=>raw.push({x:s.x-e.x,y:s.y-e.y}));
  {const a=raw[raw.length-1],b=raw[Math.max(0,raw.length-2)];raw.push({x:a.x+(a.x-b.x)*.9,y:a.y+(a.y-b.y)*.9});}
  const m=raw.length,S=[];
  for(let i=0;i<m-1;i++){const p0=raw[Math.max(0,i-1)],p1=raw[i],p2=raw[i+1],p3=raw[Math.min(m-1,i+2)];
    for(let k=0;k<4;k++){const u=k/4,u2=u*u,u3=u2*u,f=(a,b,d,g)=>.5*(2*b+(-a+d)*u+(2*a-5*b+4*d-g)*u2+(-a+3*b-3*d+g)*u3);
      S.push({x:f(p0.x,p1.x,p2.x,p3.x),y:f(p0.y,p1.y,p2.y,p3.y)});}}
  S.push({x:raw[m-1].x,y:raw[m-1].y});
  const N=S.length;
  for(let i=0;i<N;i++){const a=S[Math.max(0,i-1)],b=S[Math.min(N-1,i+1)];let tx=b.x-a.x,ty=b.y-a.y;const l=Math.hypot(tx,ty)||1;tx/=l;ty/=l;
    const u=i/(N-1),s=S[i];s.tx=tx;s.ty=ty;s.nx=-ty;s.ny=tx;s.u=u;
    s.w=GI*R*(.52*Math.pow(1-u,.85)*(1+.2*Math.sin(u*PI))+.05)*(1+.04*Math.sin(t*3-i*.3));}
  c.save();c.lineJoin='round';c.lineCap='round';
  /* ---- aura ---- */
  c.globalCompositeOperation='lighter';
  blob(c,0,0,R*(4+hot*1.2),ACC,.2+.08*Math.sin(t*3)+(st==='charge'?.2:0));
  for(let i=6;i<N;i+=6)blob(c,S[i].x,S[i].y,S[i].w*3.2,ACC,.11);
  c.globalCompositeOperation='source-over';
  /* ---- nadadeira caudal ---- */
  {const T=S[N-1],ang=Math.atan2(-T.ty,-T.tx)+Math.sin(t*3.2)*.28,L=R*1.55;
   c.save();c.translate(T.x,T.y);c.rotate(ang);
   const g=c.createLinearGradient(0,0,L,0);g.addColorStop(0,K(L3,.78));g.addColorStop(.55,K(L2,.5));g.addColorStop(1,K(RED,.06));
   c.beginPath();c.moveTo(-4,0);c.bezierCurveTo(L*.3,L*.12,L*.8,L*.2,L*1.05,L*.8);c.quadraticCurveTo(L*.75,L*.38,L*.55,0);
   c.quadraticCurveTo(L*.75,-L*.38,L*1.05,-L*.8);c.bezierCurveTo(L*.8,-L*.2,L*.3,-L*.12,-4,0);c.closePath();
   c.fillStyle=g;c.fill();c.strokeStyle=K(L3,.8);c.lineWidth=1.6;c.stroke();
   c.strokeStyle=K(BONE,.3);c.lineWidth=1;c.beginPath();
   for(let k=-3;k<=3;k++){if(!k)continue;c.moveTo(0,0);c.quadraticCurveTo(L*.4,k*L*.06,L*(.62+.14*Math.abs(k)),k*L*.27);}c.stroke();
   c.globalCompositeOperation='lighter';blob(c,L*1.05,L*.8,L*.35,ACC,.7);blob(c,L*1.05,-L*.8,L*.35,ACC,.7);c.restore();}
  /* ---- espinhos laterais com membrana ---- */
  const tips=[];
  for(let i=8;i<N-6;i+=6){const s=S[i],s2=S[Math.min(N-1,i+5)];
    for(const sd of[-1,1]){const L=s.w*(2.3+1.5*Math.sin(s.u*PI)),sw=Math.sin(t*2-i*.2)*.2;
      const base={x:s.x+s.nx*sd*s.w*.8,y:s.y+s.ny*sd*s.w*.8};
      const tip={x:base.x+s.nx*sd*L*(.9+sw)-s.tx*L*.75,y:base.y+s.ny*sd*L*(.9+sw)-s.ty*L*.75};
      const ctl={x:base.x+s.nx*sd*L*.85,y:base.y+s.ny*sd*L*.85};
      const bk={x:s2.x+s2.nx*sd*s2.w*.8,y:s2.y+s2.ny*sd*s2.w*.8};
      c.fillStyle=K(RED,.14);c.beginPath();c.moveTo(base.x,base.y);c.quadraticCurveTo(ctl.x,ctl.y,tip.x,tip.y);c.lineTo(bk.x,bk.y);c.closePath();c.fill();
      taper(c,q=>qb(base,ctl,tip,q),8,s.w*.34,.8,K(L0,.95));
      taper(c,q=>qb(base,ctl,tip,q),8,s.w*.24,.5,K(BONE,.92));
      taper(c,q=>qb(base,ctl,tip,q),8,s.w*.08,.3,K(RED,.8));
      tips.push(tip);}}
  /* ---- corpo: tubo em camadas com luz vinda de cima/esquerda ---- */
  const LX=-.5,LY=-.85;
  const layer=(k,col,off)=>{c.strokeStyle=col;for(let i=0;i<N-1;i++){const a=S[i],b=S[i+1],w=(a.w+b.w)/2*k;if(w<.4)continue;
    const oa=(a.nx*LX+a.ny*LY)*a.w*off,ob=(b.nx*LX+b.ny*LY)*b.w*off;c.lineWidth=w*2;c.beginPath();
    c.moveTo(a.x+a.nx*oa,a.y+a.ny*oa);c.lineTo(b.x+b.nx*ob,b.y+b.ny*ob);c.stroke();}};
  layer(1.14,K(L3,.5),0);layer(1,K(L0),0);layer(.86,K(L1),.06);layer(.62,K(L2),.2);layer(.34,K(L3,.8),.36);layer(.1,K([255,245,225],.35),.5);
  /* placas articuladas */
  for(let i=2;i<N-3;i+=2){const s=S[i],w=s.w*.96,A={x:s.x+s.nx*w,y:s.y+s.ny*w},B={x:s.x-s.nx*w,y:s.y-s.ny*w},C={x:s.x+s.tx*w*1.1,y:s.y+s.ty*w*1.1};
    c.strokeStyle=K(L0,.6);c.lineWidth=2.2;c.beginPath();c.moveTo(A.x,A.y);c.quadraticCurveTo(C.x,C.y,B.x,B.y);c.stroke();
    c.strokeStyle=K(L3,.26);c.lineWidth=1;c.beginPath();c.moveTo(A.x-s.tx*2,A.y-s.ty*2);c.quadraticCurveTo(C.x-s.tx*2,C.y-s.ty*2,B.x-s.tx*2,B.y-s.ty*2);c.stroke();}
  /* espinhos dorsais */
  for(let i=3;i<N-4;i+=3){const s=S[i],w=s.w;
    c.fillStyle=K(BONE,.88);c.strokeStyle=K(L0,.8);c.lineWidth=.9;c.beginPath();
    c.moveTo(s.x+s.nx*w*.22-s.tx*w*.25,s.y+s.ny*w*.22-s.ty*w*.25);c.lineTo(s.x+s.tx*w*.95,s.y+s.ty*w*.95);
    c.lineTo(s.x-s.nx*w*.22-s.tx*w*.25,s.y-s.ny*w*.22-s.ty*w*.25);c.closePath();c.fill();c.stroke();}
  /* ---- luzes: fotóforos, veias, brasas ---- */
  c.globalCompositeOperation='lighter';
  for(let i=1;i<N-2;i++){const s=S[i],pu=.5+.5*Math.sin(t*3.4-i*.38+hot*1.2),big=i%3===0;
    for(const sd of[-1,1]){const x=s.x+s.nx*sd*s.w*.66,y=s.y+s.ny*sd*s.w*.66;
      blob(c,x,y,(big?6:3.4)*(.6+.8*pu)*sc,LUM,.35+.6*pu);
      if(big){c.fillStyle=K([235,255,235],.15+.85*pu);c.beginPath();c.arc(x,y,1.5*sc,0,TAU);c.fill();}}}
  c.lineWidth=1.5;c.strokeStyle=K(hot?[255,80,70]:[255,170,60],(hot?.55:.22)+.2*Math.sin(t*4));c.beginPath();
  for(let i=1;i<N-2;i++){const s=S[i],o=Math.sin(i*.9+t*(hot?3:1.2))*s.w*.28,x=s.x+s.nx*o,y=s.y+s.ny*o;i===1?c.moveTo(x,y):c.lineTo(x,y);}c.stroke();
  for(let i=4;i<N-6;i+=5){const s=S[i],sd=i%2?1:-1;c.beginPath();c.moveTo(s.x,s.y);c.lineTo(s.x+s.nx*sd*s.w*.6+s.tx*s.w*.4,s.y+s.ny*sd*s.w*.6+s.ty*s.w*.4);c.stroke();}
  const NE=hot?46:28;
  for(let i=0;i<NE;i++){const p=fract(t*(.14+hs(i)*.22)+hs(i+50)),s=S[1+Math.floor(hs(i+99)*(N-3))],sd=hs(i+7)<.5?-1:1,o=s.w*(.9+p*1.6)*sd,al=Math.sin(p*PI)*.85;
    c.fillStyle=i%2?K([255,176,32],al):K(hot?RED:[141,255,69],al);c.beginPath();
    c.arc(s.x+s.nx*o-s.tx*p*20,s.y+s.ny*o-s.ty*p*20,(1+hs(i+3)*2)*sc*(1-p*.4),0,TAU);c.fill();}
  for(const q of tips)blob(c,q.x,q.y,7*sc,ACC,.8);
  c.globalCompositeOperation='source-over';
  /* ================== CABEÇA ================== */
  const r=R;c.save();c.rotate(e.ang);
  /* colar de placas */
  for(let i=0;i<3;i++){c.beginPath();c.ellipse(-(.82+i*.28)*r,0,.34*r,(.7-i*.07)*r,0,0,TAU);c.fillStyle=K(i%2?L1:L0);c.fill();c.strokeStyle=K(L3,.45);c.lineWidth=1.4;c.stroke();}
  /* barbilhões com iscas */
  for(const sd of[-1,1])for(let b=0;b<2;b++){let x=-.1*r,y=sd*.68*r,a=PI-sd*(.5+b*.45);const P=[{x,y}];
    for(let k=0;k<14;k++){a+=Math.sin(t*2.4-k*.5+b*2+sd)*.16;x+=Math.cos(a)*.2*r;y+=Math.sin(a)*.2*r;P.push({x,y});}
    taper(c,q=>P[Math.round(q*14)],14,r*.1,r*.012,K(L3,.9));
    c.globalCompositeOperation='lighter';blob(c,x,y,r*.34,LUM,.8);c.globalCompositeOperation='source-over';}
  /* chifres */
  for(const sd of[-1,1])for(let i=0;i<3;i++){
    const B0={x:(-.3-i*.2)*r,y:sd*.62*r},C0={x:(-.25-i*.25)*r,y:sd*(1.05+i*.3)*r},T0={x:(-1.0-i*.45)*r,y:sd*(1.25+i*.4)*r};
    taper(c,q=>qb(B0,C0,T0,q),9,r*(.2-.03*i),1,K(L0,.95));taper(c,q=>qb(B0,C0,T0,q),9,r*(.15-.025*i),.5,K(BONE,.95));}
  /* goela */
  const mx=.95*r,rx=.58*r,ry=r*(.06+.5*j);
  {const g=c.createRadialGradient(mx,0,0,mx,0,rx);g.addColorStop(0,K([255,235,170]));g.addColorStop(.35,K(RED,.95));g.addColorStop(.75,K([60,5,12]));g.addColorStop(1,K([8,1,4]));
   c.fillStyle=g;c.beginPath();c.ellipse(mx,0,rx,ry,0,0,TAU);c.fill();c.fillStyle=K(BONE,.9);
   for(let i=0;i<16;i++){const a=i/16*TAU,px=mx+Math.cos(a)*rx,py=Math.sin(a)*ry,ix=mx+Math.cos(a)*rx*.7,iy=Math.sin(a)*ry*.7,dx=ix-px,dy=iy-py,l=Math.hypot(dx,dy)||1,ox=-dy/l*r*.04,oy=dx/l*r*.04;
     c.beginPath();c.moveTo(px+ox,py+oy);c.lineTo(px-ox,py-oy);c.lineTo(ix,iy);c.fill();}}
  /* mandíbulas */
  for(const sd of[-1,1]){c.save();c.translate(.1*r,sd*.5*r);c.scale(1,sd);c.rotate(-.34+j*.95);
    const g=c.createLinearGradient(0,0,1.5*r,0);g.addColorStop(0,K(L1));g.addColorStop(.6,K(L2));g.addColorStop(1,K(BONE));
    c.beginPath();c.moveTo(-.3*r,.2*r);c.quadraticCurveTo(.5*r,.32*r,1.5*r,.05*r);c.quadraticCurveTo(.8*r,-.14*r,-.1*r,-.24*r);c.closePath();
    c.fillStyle=g;c.fill();c.strokeStyle=K(L3,.7);c.lineWidth=1.6;c.stroke();
    c.strokeStyle=K(L0,.55);c.lineWidth=1;c.beginPath();for(let i=0;i<5;i++){const x=(.05+i*.26)*r;c.moveTo(x,.2*r);c.lineTo(x+.06*r,-.04*r);}c.stroke();
    c.fillStyle=K(BONE,.95);c.strokeStyle=K(L0,.6);c.lineWidth=.8;
    for(let i=0;i<9;i++){const p=qb({x:1.5*r,y:.05*r},{x:.8*r,y:-.14*r},{x:-.1*r,y:-.24*r},.1+i*.1),L=r*(.2-.015*i+(i%2)*.1);
      c.beginPath();c.moveTo(p.x-.05*r,p.y);c.lineTo(p.x+.05*r,p.y);c.lineTo(p.x+.02*r,p.y-L);c.closePath();c.fill();c.stroke();}
    c.restore();}
  /* crânio */
  c.beginPath();c.moveTo(.6*r,0);c.quadraticCurveTo(.85*r,.1*r,1.12*r,.26*r);c.bezierCurveTo(1.0*r,.5*r,.5*r,.66*r,-.1*r,.72*r);
  c.bezierCurveTo(-.45*r,.74*r,-.72*r,.5*r,-.74*r,0);c.bezierCurveTo(-.72*r,-.5*r,-.45*r,-.74*r,-.1*r,-.72*r);
  c.bezierCurveTo(.5*r,-.66*r,1.0*r,-.5*r,1.12*r,-.26*r);c.quadraticCurveTo(.85*r,-.1*r,.6*r,0);c.closePath();
  {const g=c.createLinearGradient(-.74*r,0,1.1*r,0);g.addColorStop(0,K(L0));g.addColorStop(.45,K(L1));g.addColorStop(1,K(L2));c.fillStyle=g;c.fill();}
  c.strokeStyle=K(L3,.85);c.lineWidth=2;c.stroke();
  [[-.5,.6],[-.2,.7],[.1,.7],[.4,.62]].forEach(a=>{const x=a[0]*r,w=a[1]*r;
    c.strokeStyle=K(L0,.65);c.lineWidth=2;c.beginPath();c.moveTo(x,-w);c.quadraticCurveTo(x+.16*r,0,x,w);c.stroke();
    c.strokeStyle=K(L3,.25);c.lineWidth=1;c.beginPath();c.moveTo(x-2,-w);c.quadraticCurveTo(x+.16*r-2,0,x-2,w);c.stroke();});
  c.strokeStyle=K(BONE,.9);c.lineWidth=3;c.beginPath();for(const sd of[-1,1]){c.moveTo(.05*r,sd*.64*r);c.quadraticCurveTo(.35*r,sd*.6*r,.7*r,sd*.3*r);}c.stroke();
  /* olhos */
  for(const sd of[-1,1])for(const E of[[.32,.42,.17],[.66,.24,.075]]){
    const x=E[0]*r,y=sd*E[1]*r,rr=E[2]*r*(1+hot*.15);
    c.fillStyle=K(L0);c.beginPath();c.arc(x,y,rr*1.35,0,TAU);c.fill();
    const g=c.createRadialGradient(x-rr*.2,y-rr*.2,0,x,y,rr);g.addColorStop(0,K([255,245,200]));g.addColorStop(.5,K(hot?[255,70,70]:[255,176,32]));g.addColorStop(1,K([140,20,10]));
    c.fillStyle=g;c.beginPath();c.arc(x,y,rr,0,TAU);c.fill();
    c.fillStyle='#08040a';c.beginPath();c.ellipse(x,y,rr*.16,rr*.82,0,0,TAU);c.fill();}
  /* haste e isca bioluminescente */
  const sb={x:.3*r,y:0},sc2={x:r*1.0,y:Math.sin(t*1.3)*.5*r},se={x:r*1.95,y:Math.sin(t*1.9+1)*.35*r};
  taper(c,q=>qb(sb,sc2,se,q),10,r*.09,r*.03,K(BONE,.9));
  /* ---- brilho da cabeça ---- */
  c.globalCompositeOperation='lighter';
  for(const sd of[-1,1]){blob(c,.32*r,sd*.42*r,r*(.85+.15*hot+fl*.5),ACC,.75);blob(c,.66*r,sd*.24*r,r*.3,ACC,.6);
    c.strokeStyle=K(RED,.4+.4*Math.sin(t*2.6+sd));c.lineWidth=1.8;c.beginPath();
    for(let k=0;k<3;k++){c.moveTo((-.55+k*.12)*r,sd*.46*r);c.quadraticCurveTo((-.5+k*.12)*r,sd*.58*r,(-.4+k*.12)*r,sd*.66*r);}c.stroke();}
  c.strokeStyle=K([255,120,60],.55+.25*Math.sin(t*4));c.lineWidth=2.2;c.beginPath();c.moveTo(-.6*r,0);c.lineTo(.55*r,0);c.stroke();
  blob(c,0,0,r*.9,ACC,.22);
  const lp=.85+.25*Math.sin(t*5)+(st==='spit'?.6:0);
  blob(c,se.x,se.y,r*lp,LUM,.95);blob(c,se.x,se.y,r*.3,'#ffffff',.9);
  for(let k=0;k<5;k++){const a=k/5*TAU+Math.sin(t*2+k)*.3;c.strokeStyle=K([180,255,150],.5);c.lineWidth=1;c.beginPath();c.moveTo(se.x,se.y);c.lineTo(se.x+Math.cos(a)*r*.32,se.y+Math.sin(a)*r*.32);c.stroke();}
  if(j>.2)blob(c,mx,0,r*(.9+(st==='spit'?.6:0)+.2*Math.sin(t*8)),'#ffb020',.55*j+(st==='spit'?.35:0));
  for(const sd of[-1,1])for(let i=0;i<3;i++)blob(c,(-1.0-i*.45)*r,sd*(1.25+i*.4)*r,r*.2,ACC,.8);
  /* linhas de velocidade na investida */
  if(st==='charge'){c.lineWidth=2;for(let i=0;i<10;i++){const p=fract(t*2.6+hs(i)),y=(hs(i+20)-.5)*2.4*r,x1=-r*(1+p*5),l=r*(1+hs(i+9)*2);
    c.strokeStyle=K([255,176,32],(1-p)*.7);c.beginPath();c.moveTo(x1,y);c.lineTo(x1-l,y);c.stroke();}}
  c.restore();
  /* anéis de rugido */
  if(e.roar>0){for(let k=0;k<3;k++){const q=Math.min(1,Math.max(0,1-e.roar+k*.0)-k*.12);if(q<=0)continue;
    c.strokeStyle=K(k%2?[255,176,32]:RED,(1-q)*.8);c.lineWidth=2+(1-q)*5;c.beginPath();c.arc(0,0,R*(.8+q*6.5)+k*14,0,TAU);c.stroke();}}
  c.globalCompositeOperation='source-over';c.restore();
}
return{draw};})();
function drawLeviathan(e){if(e.girth==null)e.girth=.88;Leviathan.draw(ctx,e);}
function drawTrail(){
  ctx.globalCompositeOperation='lighter';
  for(const t of trail){const a=t.l/t.m;
    blob(t.x,t.y,26*a,C.info,.3*a);
    ctx.save();ctx.translate(t.x,t.y);ctx.rotate(t.a);ctx.globalAlpha=a*.5;ctx.fillStyle=C.teal;
    ctx.beginPath();ctx.moveTo(18,0);ctx.quadraticCurveTo(0,12,-13,0);ctx.quadraticCurveTo(0,-12,18,0);ctx.fill();
    ctx.restore();ctx.globalAlpha=1;}
  ctx.globalCompositeOperation='source-over';
}
function drawLumen(p,alpha){
  const pal=p.idx===1?{a:C.violet,b:C.magenta,f:C.amber}:{a:C.teal,b:C.bio,f:C.info};
  ctx.save();ctx.translate(p.x,p.y);
  {const ds=depthScale(p.y);ctx.scale(ds,ds);}floorShadow(p.r*1.1,p.r*.4);ctx.translate(0,-p.r*.4+Math.sin(T*2.4)*1.5);
  ctx.globalCompositeOperation='lighter';
  blob(0,0,p.r*(3.4+(p.hitPulse||0)*2),p.hitPulse>0?C.crimson:pal.a,(.42+(p.hitPulse||0)*4)*alpha);
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=alpha;
  const sp=Math.hypot(p.vx,p.vy);
  if(sp>40){ctx.save();ctx.rotate(Math.atan2(p.vy,p.vx)+PI);ctx.globalCompositeOperation='lighter';
    const fl=clamp(sp/300,0,2.4);blob(p.r*.9+fl*8,0,p.r*(.7+fl*.5),pal.f,.4*alpha);
    ctx.globalCompositeOperation='source-over';ctx.restore();}
  for(let q=4;q>=1;q--){ctx.save();ctx.translate(0,q*1.7);ctx.rotate(p.aim);
    ctx.beginPath();ctx.moveTo(p.r*1.5,0);ctx.quadraticCurveTo(p.r*.2,p.r*.95,-p.r*.95,p.r*.5);ctx.quadraticCurveTo(-p.r*1.25,0,-p.r*.95,-p.r*.5);ctx.quadraticCurveTo(p.r*.2,-p.r*.95,p.r*1.5,0);ctx.closePath();
    ctx.fillStyle='rgba(2,30,42,.85)';ctx.fill();ctx.restore();}
  ctx.rotate(p.aim);
  ctx.fillStyle=rgba(pal.a,.75);
  ctx.beginPath();ctx.moveTo(-p.r*.2,p.r*.55);ctx.lineTo(-p.r*1.1,p.r*1.15);ctx.lineTo(-p.r*.75,p.r*.2);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(-p.r*.2,-p.r*.55);ctx.lineTo(-p.r*1.1,-p.r*1.15);ctx.lineTo(-p.r*.75,-p.r*.2);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(p.r*1.5,0);
  ctx.quadraticCurveTo(p.r*.2,p.r*.95,-p.r*.95,p.r*.5);ctx.quadraticCurveTo(-p.r*1.25,0,-p.r*.95,-p.r*.5);
  ctx.quadraticCurveTo(p.r*.2,-p.r*.95,p.r*1.5,0);ctx.closePath();
  ctx.fillStyle=bodyGrad(pal.a,p.r*1.3);ctx.fill();
  ctx.strokeStyle=rgba(pal.b,.9);ctx.lineWidth=1.7;ctx.stroke();
  ctx.fillStyle=rgba(C.sand,.95);ctx.beginPath();ctx.arc(p.r*.35,0,p.r*.28,0,TAU);ctx.fill();
  ctx.globalCompositeOperation='lighter';blob(p.r*.35,0,p.r*.7,C.white,.5*alpha);
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.rotate(-p.aim);sphereSpec(p.r);ctx.restore();
}
function drawPlayer(){
  for(const q of players){if(q&&!q.gone)drawOnePlayer(q);}
  if(nova){const a=nova.l/nova.m;ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle=rgba(C.bio,a*.85);ctx.lineWidth=10*a+2;ctx.beginPath();ctx.arc(nova.x,nova.y,nova.r,0,TAU);ctx.stroke();
    ctx.strokeStyle=rgba(C.white,a*.6);ctx.lineWidth=3;ctx.beginPath();ctx.arc(nova.x,nova.y,nova.r*.92,0,TAU);ctx.stroke();
    ctx.globalCompositeOperation='source-over';}
}
function drawOnePlayer(p){
  const pal=p.idx===1?{a:C.violet,b:C.magenta,f:C.amber}:{a:C.teal,b:C.bio,f:C.info};
  if(p.down){
    drawLumen(p,.38);
    ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle=rgba(C.bio,.3);ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,56,0,TAU);ctx.stroke();
    if(p.reviveT>0){ctx.strokeStyle=rgba(C.bio,.95);ctx.lineWidth=5;ctx.beginPath();ctx.arc(p.x,p.y,56,-PI/2,-PI/2+TAU*clamp(p.reviveT/3,0,1));ctx.stroke();}
    ctx.globalCompositeOperation='source-over';
    ctx.fillStyle=rgba(C.sand,.9);ctx.font='700 10px ui-monospace,Menlo,monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('REVIVER',p.x,p.y-72);
    return;}
  const blink=p.iFrame>0&&Math.floor(T*22)%2===0&&p.dashT<=0;
  if(!blink)drawLumen(p,1);
  ctx.globalCompositeOperation='lighter';
  for(let i=0;i<3;i++){const a=T*1.2+i*TAU/3;blob(p.x+Math.cos(a)*p.r*1.9,p.y+Math.sin(a)*p.r*1.9,4.5,pal.b,.55);}
  for(let i=0;i<p.orbs;i++){const a=p.orbA+i*TAU/p.orbs,ox=p.x+Math.cos(a)*54,oy=p.y+Math.sin(a)*54;
    blob(ox,oy,20,pal.b,.6);ctx.fillStyle=rgba(C.sand,.9);ctx.beginPath();ctx.arc(ox,oy,4,0,TAU);ctx.fill();}
  if(p.buffs&&p.buffs.escudo>0){ctx.strokeStyle=rgba(C.info,.4+Math.sin(T*5)*.2);ctx.lineWidth=2.4;
    ctx.beginPath();ctx.arc(p.x,p.y,p.r*2.6,0,TAU);ctx.stroke();}
  if(p.buffs&&p.buffs.frenesi>0){for(let i=0;i<4;i++){const a=T*7+i*TAU/4;blob(p.x+Math.cos(a)*p.r*2.9,p.y+Math.sin(a)*p.r*2.9,7,C.amber,.5);}}
  if(p.buffs&&p.buffs.voragem>0){ctx.strokeStyle=rgba(C.violet,.3);ctx.lineWidth=1.6;
    ctx.beginPath();ctx.arc(p.x,p.y,p.magnet*3.5*.35,T*2,T*2+PI*1.4);ctx.stroke();}
  if(p.iFrame>0){ctx.strokeStyle=rgba(C.info,.28+Math.sin(T*18)*.14);ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(p.x,p.y,p.r*2.2,0,TAU);ctx.stroke();}
  ctx.globalCompositeOperation='source-over';
  if(coop){ctx.fillStyle=rgba(pal.a,.85);ctx.font='700 10px ui-monospace,Menlo,monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(pname(p)+(p===P?' · VOCÊ':''),p.x,p.y-p.r*3.1);}
}
function drawBullets(){
  ctx.fillStyle='rgba(0,4,8,.28)';
  for(const b of bullets){ctx.beginPath();ctx.ellipse(b.x+2,b.y+12,b.r*1.8,b.r*.6,0,0,TAU);ctx.fill();}
  ctx.globalCompositeOperation='lighter';
  for(const b of bullets){const col=b.crit?C.amber:(b.o===1?C.violet:C.teal);
    blob(b.x,b.y,b.r*(SET.contrast?5.6:4.6),col,.6);
    ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.a);
    ctx.fillStyle=rgba(C.white,.92);ctx.beginPath();ctx.ellipse(0,0,b.r*2.6,b.r*.62,0,0,TAU);ctx.fill();
    ctx.fillStyle=rgba(col,.7);ctx.beginPath();ctx.ellipse(-b.r*2.2,0,b.r*2.4,b.r*.34,0,0,TAU);ctx.fill();ctx.restore();}
  ctx.globalCompositeOperation='source-over';
}
function drawEBullets(){
  ctx.fillStyle='rgba(0,4,8,.3)';
  for(const b of ebullets){ctx.beginPath();ctx.ellipse(b.x+3,b.y+14,b.r*1.2,b.r*.45,0,0,TAU);ctx.fill();}
  ctx.globalCompositeOperation='lighter';
  for(const b of ebullets){blob(b.x,b.y,b.r*3.6,b.c,.62);
    ctx.fillStyle=rgba(C.white,.8);ctx.beginPath();ctx.arc(b.x,b.y,b.r*.42,0,TAU);ctx.fill();blob(b.x-b.r*.3,b.y-b.r*.3,b.r*.9,C.white,.35);
    ctx.strokeStyle=rgba(b.c,.9);ctx.lineWidth=1.6;
    ctx.beginPath();ctx.arc(b.x,b.y,b.r*(1+Math.sin(b.t*9)*.1),0,TAU);ctx.stroke();}
  ctx.globalCompositeOperation='source-over';
}
function drawParticles(){ctx.globalCompositeOperation='lighter';
  for(const p of parts){const a=clamp(p.l/p.m,0,1);blob(p.x,p.y,p.r*(1+a*2.6),p.c,a*.75);}
  ctx.globalCompositeOperation='source-over';}
function drawRings(){ctx.globalCompositeOperation='lighter';
  for(const r of rings){const a=clamp(r.l/r.m,0,1);
    ctx.strokeStyle=rgba(r.c,a*.8);ctx.lineWidth=r.w*a+.6;ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,TAU);ctx.stroke();}
  ctx.globalCompositeOperation='source-over';}
function drawFloats(){
  ctx.textAlign='center';ctx.textBaseline='middle';
  for(const f of floats){const a=clamp(f.l/f.m,0,1);
    ctx.font='700 '+f.s+'px ui-monospace,Menlo,Consolas,monospace';
    ctx.fillStyle='rgba(2,7,13,'+(a*.55)+')';ctx.fillText(f.t,f.x+1.5,f.y+1.5);
    ctx.fillStyle=rgba(f.c,a);ctx.fillText(f.t,f.x,f.y);}
}
let vigCan=null;
function drawVignette(){
  if(!vigCan||vigCan.width!==Math.round(view.w)||vigCan.height!==Math.round(view.h)){
    vigCan=document.createElement('canvas');vigCan.width=Math.round(view.w);vigCan.height=Math.round(view.h);
    const q=vigCan.getContext('2d'),g=q.createRadialGradient(view.w/2,view.h/2,Math.min(view.w,view.h)*.34,view.w/2,view.h/2,Math.max(view.w,view.h)*.78);
    g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,3,7,.72)');q.fillStyle=g;q.fillRect(0,0,view.w,view.h);}
  ctx.drawImage(vigCan,0,0,view.w,view.h);
  if(P&&P.hp<=2&&scene==='play'&&!training){
    const pl=.12+Math.abs(Math.sin(T*3.2))*.16;
    const h=ctx.createRadialGradient(view.w/2,view.h/2,Math.min(view.w,view.h)*.25,view.w/2,view.h/2,Math.max(view.w,view.h)*.7);
    h.addColorStop(0,'rgba(255,59,87,0)');h.addColorStop(1,'rgba(255,59,87,'+pl+')');
    ctx.fillStyle=h;ctx.fillRect(0,0,view.w,view.h);}
  if(dmgFlash>0){const r=ctx.createRadialGradient(view.w/2,view.h/2,Math.min(view.w,view.h)*.2,view.w/2,view.h/2,Math.max(view.w,view.h)*.7);
    r.addColorStop(0,'rgba(255,59,87,0)');r.addColorStop(1,'rgba(255,59,87,'+(dmgFlash*.55)+')');
    ctx.fillStyle=r;ctx.fillRect(0,0,view.w,view.h);}
  if(whiteFlash>0){ctx.fillStyle='rgba(220,255,245,'+(whiteFlash*.4)+')';ctx.fillRect(0,0,view.w,view.h);}
}
function drawEdgeArrows(){
  const vw=view.w/zoom,vh=view.h/zoom,pad=42;
  let count=0;
  for(const e of enemies){
    if(count>10)break;
    const sx=(e.x-cam.x)*zoom,sy=(e.y-cam.y)*zoom;
    if(sx>-20&&sx<view.w+20&&sy>-20&&sy<view.h+20)continue;
    const cx=view.w/2,cy=view.h/2,a=Math.atan2(sy-cy,sx-cx);
    const rx=Math.min(view.w/2-pad,Math.abs(Math.cos(a))>1e-3?Math.abs((view.w/2-pad)/Math.cos(a)):1e9);
    const ry=Math.min(view.h/2-pad,Math.abs(Math.sin(a))>1e-3?Math.abs((view.h/2-pad)/Math.sin(a)):1e9);
    const rr=Math.min(rx,ry),px=cx+Math.cos(a)*rr,py=cy+Math.sin(a)*rr;
    count++;
    ctx.save();ctx.translate(px,py);ctx.rotate(a);
    ctx.globalCompositeOperation='lighter';blob(0,0,16,e.c,.4);ctx.globalCompositeOperation='source-over';
    ctx.fillStyle=rgba(e.c,e.type==='boss'?1:.75);
    const s=e.type==='boss'?11:7;
    ctx.beginPath();ctx.moveTo(s,0);ctx.lineTo(-s*.7,s*.66);ctx.lineTo(-s*.7,-s*.66);ctx.closePath();ctx.fill();
    ctx.restore();}
  drawPartnerArrow();
}
function drawPartnerArrow(){
  if(!coop)return;
  const q=players[1-ME];if(!q||q.gone)return;
  const pad=42,sx=(q.x-cam.x)*zoom,sy=(q.y-cam.y)*zoom;
  if(sx>-20&&sx<view.w+20&&sy>-20&&sy<view.h+20)return;
  const col=q.idx===1?C.violet:C.teal,cx=view.w/2,cy=view.h/2,a=Math.atan2(sy-cy,sx-cx);
  const rx=Math.abs(Math.cos(a))>1e-3?Math.abs((view.w/2-pad)/Math.cos(a)):1e9,ry=Math.abs(Math.sin(a))>1e-3?Math.abs((view.h/2-pad)/Math.sin(a)):1e9;
  const rr=Math.min(rx,ry),px=cx+Math.cos(a)*rr,py=cy+Math.sin(a)*rr;
  ctx.save();ctx.translate(px,py);ctx.rotate(a);
  ctx.globalCompositeOperation='lighter';blob(0,0,24,col,.55);ctx.globalCompositeOperation='source-over';
  ctx.fillStyle=rgba(col,q.down?.5:1);ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(-9,9);ctx.lineTo(-9,-9);ctx.closePath();ctx.fill();
  ctx.rotate(-a);ctx.fillStyle=rgba(C.sand,.95);ctx.font='700 9px ui-monospace,Menlo,monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(pname(q),-Math.cos(a)*(18+pname(q).length*3.2),-Math.sin(a)*(18+pname(q).length*3.2));
  ctx.restore();
}
function drawRadar(){
  const w=138,h=w*(world.h/world.w),x=view.w-w-18,y=view.h-h-18;
  ctx.save();
  ctx.fillStyle='rgba(3,14,22,.72)';ctx.strokeStyle=rgba(theme.acc,.3);ctx.lineWidth=1.2;
  ctx.beginPath();ctx.rect(x,y,w,h);ctx.fill();ctx.stroke();
  ctx.fillStyle='rgba(127,163,184,.85)';ctx.font='700 8px ui-monospace,Menlo,monospace';
  ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText('SONAR',x+6,y+5);
  const sx=w/world.w,sy=h/world.h;
  ctx.globalCompositeOperation='lighter';
  for(const o of pickups){ctx.fillStyle=rgba(C.bio,.35);ctx.fillRect(x+o.x*sx-1,y+o.y*sy-1,2,2);}
  for(const v of vents){ctx.fillStyle=rgba(v.st==='erupt'?C.crimson:C.amber,.5);ctx.fillRect(x+v.x*sx-2,y+v.y*sy-2,4,4);}
  for(const e of enemies){ctx.fillStyle=rgba(e.c,.95);
    ctx.beginPath();ctx.arc(x+e.x*sx,y+e.y*sy,e.type==='boss'?4:2.2,0,TAU);ctx.fill();}
  for(const t of teles){ctx.strokeStyle=rgba(DEF[t.type].c,.6);ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(x+t.x*sx,y+t.y*sy,3.5,0,TAU);ctx.stroke();}
  for(const q of players){if(!q||q.gone)continue;ctx.fillStyle=q===P?C.white:(q.idx===1?C.violet:C.teal);ctx.beginPath();ctx.arc(x+q.x*sx,y+q.y*sy,3,0,TAU);ctx.fill();}
  ctx.globalCompositeOperation='source-over';
  ctx.strokeStyle=rgba(C.bio,.25);ctx.strokeRect(x+cam.x*sx,y+cam.y*sy,(view.w/zoom)*sx,(view.h/zoom)*sy);
  ctx.restore();
}
function drawCine(){
  const k=clamp(cine.t/cine.m,0,1),ease=Math.sin(clamp((1-k)*3,0,1)*PI/2);
  const bar=view.h*.11*(k>.15?1:k/.15);
  ctx.fillStyle='rgba(1,4,9,.94)';ctx.fillRect(0,0,view.w,bar);ctx.fillRect(0,view.h-bar,view.w,bar);
  ctx.strokeStyle=rgba(C.magenta,.5);ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(0,bar);ctx.lineTo(view.w,bar);ctx.moveTo(0,view.h-bar);ctx.lineTo(view.w,view.h-bar);ctx.stroke();
  const a=Math.min(1,(1-k)*4)*Math.min(1,k*5);
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='900 '+Math.round(clamp(view.w*.055,24,62))+'px system-ui,sans-serif';
  ctx.fillStyle=rgba(C.magenta,a*.9);
  ctx.fillText(cine.name,view.w/2,view.h*.5+Math.sin(T*3)*2);
  ctx.font='700 11px ui-monospace,Menlo,monospace';
  ctx.fillStyle=rgba(C.sand,a*.7);ctx.fillText(cine.sub,view.w/2,view.h*.5+clamp(view.w*.045,26,52));
}

/* ============================================================
   13 · VIDA AMBIENTE (MENUS)
   ============================================================ */
function seedMenuLife(){
  ambient=[];
  for(let i=0;i<10;i++){
    const type=['drifter','dart','urchin','angler'][i%4];
    const e=makeEnemy(type,rnd(100,world.w-100),rnd(100,world.h-100));
    e.vx=rnd(-40,40);e.vy=rnd(-30,30);e.cd=99;ambient.push(e);}
  seen={};
}
function updateMenuLife(dt){
  for(const e of ambient){
    e.t+=dt;e.spin+=dt*.6;e.x+=e.vx*dt;e.y+=e.vy*dt;
    if(e.x<80||e.x>world.w-80)e.vx*=-1;if(e.y<80||e.y>world.h-80)e.vy*=-1;
    e.ang=Math.atan2(e.vy,e.vx);e.pulse=Math.max(0,e.pulse-dt*2);
    if(e.type==='drifter'&&Math.random()<dt*.8){e.pulse=1;e.vx=rnd(-60,60);e.vy=rnd(-45,45);}}
}

/* ============================================================
   14 · CANVAS AUXILIARES (DEMOS + BESTIÁRIO)
   ============================================================ */
const aux=[];
function registerAux(canvas,tag,drawFn){const o={c:canvas,x:canvas.getContext('2d'),tag:tag,fn:drawFn,w:0,h:0};aux.push(o);return o;}
function fitAux(){
  aux.forEach(o=>{
    const r=o.c.getBoundingClientRect();
    if(r.width<2||r.height<2)return;
    o.w=r.width;o.h=r.height;
    o.c.width=Math.round(r.width*DPR);o.c.height=Math.round(r.height*DPR);});
}
function paintAux(o,dt,fakeP){
  if(!o.w||!o.h)return;
  const oc=ctx,ot=ctxTag,op=P;
  ctx=o.x;ctxTag=o.tag;P=fakeP||P;
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.globalCompositeOperation='source-over';
  const g=ctx.createLinearGradient(0,0,o.w,o.h);
  g.addColorStop(0,'#07202f');g.addColorStop(1,'#020a12');
  ctx.fillStyle=g;ctx.fillRect(0,0,o.w,o.h);
  ctx.globalCompositeOperation='lighter';
  for(let i=0;i<14;i++){const x=(i*97+T*12)%o.w,y=(i*53+T*9)%o.h;blob(x,y,7,C.teal,.1);}
  ctx.globalCompositeOperation='source-over';
  o.fn(ctx,o.w,o.h,dt);
  ctx=oc;ctxTag=ot;P=op;
}
/* --- demos --- */
const DEMOS=[
 {tag:'MOVIMENTO',init:()=>({p:{x:0,y:0,vx:0,vy:0,r:15,aim:0,hitPulse:0},t:0,tr:[]}),
  fn:(c,w,h,dt,s)=>{
    s.t+=dt;const cx=w/2,cy=h/2;
    const nx=cx+Math.cos(s.t*.9)*w*.28,ny=cy+Math.sin(s.t*1.8)*h*.22;
    s.p.vx=(nx-s.p.x)/Math.max(dt,.001);s.p.vy=(ny-s.p.y)/Math.max(dt,.001);
    s.p.x=nx;s.p.y=ny;s.p.aim=Math.atan2(s.p.vy,s.p.vx);
    s.tr.push({x:nx,y:ny,l:.5});if(s.tr.length>26)s.tr.shift();
    c.globalCompositeOperation='lighter';
    s.tr.forEach((t,i)=>{t.l-=dt;blob(t.x,t.y,10*(i/s.tr.length),C.info,.16*(i/s.tr.length));});
    c.globalCompositeOperation='source-over';
    const kx=cx-w*.34,ky=h-34,keysD=[['W',0,-16],['A',-17,0],['S',0,0],['D',17,0]];
    const dirx=Math.cos(s.p.aim),diry=Math.sin(s.p.aim);
    keysD.forEach(k=>{
      const on=(k[1]&&Math.sign(dirx)===k[1])||(k[2]&&Math.sign(diry)===k[2]);
      c.fillStyle=on?rgba(C.bio,.9):'rgba(6,22,33,.85)';
      c.strokeStyle=rgba(C.teal,.5);c.lineWidth=1;
      c.beginPath();c.rect(kx+k[1]-8,ky+k[2]-8,16,15);c.fill();c.stroke();
      c.fillStyle=on?'#03151b':C.slate;c.font='700 9px ui-monospace,monospace';c.textAlign='center';c.textBaseline='middle';
      c.fillText(k[0],kx+k[1],ky+k[2]);});
    drawLumen(s.p,1);
    c.fillStyle=rgba(C.sand,.75);c.font='700 10px ui-monospace,monospace';c.textAlign='left';c.textBaseline='top';
    c.fillText('WASD / ANALÓGICO ESQUERDO',12,12);}},
 {tag:'MIRA E TIRO',init:()=>({p:{x:0,y:0,vx:0,vy:0,r:15,aim:0,hitPulse:0},t:0,bs:[],es:[],cd:0}),
  fn:(c,w,h,dt,s)=>{
    s.t+=dt;s.p.x=w*.24;s.p.y=h*.5;
    if(s.es.length<3&&Math.random()<dt*2.2)s.es.push({x:w*.9,y:rnd(h*.2,h*.8),t:rnd(0,9),r:17,pulse:0,ang:PI,vx:0,vy:0,hp:3});
    let near=null,bd=1e9;
    s.es.forEach(e=>{e.t+=dt;e.x-=dt*26;e.y+=Math.sin(e.t*2)*.5;e.pulse=Math.max(0,e.pulse-dt*2);
      const d=dist(e.x,e.y,s.p.x,s.p.y);if(d<bd){bd=d;near=e;}});
    if(near)s.p.aim=Math.atan2(near.y-s.p.y,near.x-s.p.x);
    const shots=1+Math.floor((s.t%9)/3);
    s.cd-=dt;
    if(s.cd<=0&&near){s.cd=.24;
      for(let i=0;i<shots;i++){const a=s.p.aim+(i-(shots-1)/2)*.14;
        s.bs.push({x:s.p.x,y:s.p.y,vx:Math.cos(a)*420,vy:Math.sin(a)*420,a:a,l:2,r:3.4,crit:false});}}
    for(let i=s.bs.length-1;i>=0;i--){const b=s.bs[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.l-=dt;
      let dead=b.l<=0||b.x>w+20||b.x<0||b.y<0||b.y>h;
      s.es.forEach(e=>{if(!dead&&dist(b.x,b.y,e.x,e.y)<e.r){e.hp--;e.pulse=1;dead=true;
        c.globalCompositeOperation='lighter';blob(b.x,b.y,20,C.bio,.6);c.globalCompositeOperation='source-over';}});
      if(dead)s.bs.splice(i,1);}
    s.es=s.es.filter(e=>{if(e.hp<=0||e.x<-30){c.globalCompositeOperation='lighter';blob(e.x,e.y,44,C.magenta,.5);c.globalCompositeOperation='source-over';return false;}return true;});
    s.es.forEach(e=>{c.save();c.translate(e.x,e.y);drawJellyNew(e);c.restore();});
    c.globalCompositeOperation='lighter';
    s.bs.forEach(b=>{blob(b.x,b.y,14,C.teal,.6);
      c.save();c.translate(b.x,b.y);c.rotate(b.a);c.fillStyle=rgba(C.white,.9);
      c.beginPath();c.ellipse(0,0,9,2.2,0,0,TAU);c.fill();c.restore();});
    c.globalCompositeOperation='source-over';
    drawLumen(s.p,1);
    c.fillStyle=rgba(C.sand,.75);c.font='700 10px ui-monospace,monospace';c.textAlign='left';c.textBaseline='top';
    c.fillText('TIRO AUTOMÁTICO · PRISMA '+shots+'/3',12,12);}},
 {tag:'FLORADA',init:()=>({p:{x:0,y:0,vx:0,vy:0,r:15,aim:0,hitPulse:0},t:0,m:0,nova:null,es:[]}),
  fn:(c,w,h,dt,s)=>{
    s.t+=dt;s.p.x=w/2;s.p.y=h/2;s.p.aim=s.t;
    if(s.es.length<7&&Math.random()<dt*4){const a=rnd(0,TAU);
      s.es.push({x:w/2+Math.cos(a)*w*.42,y:h/2+Math.sin(a)*h*.42,t:rnd(0,9),r:12,ang:a+PI,pulse:0,vx:0,vy:0});}
    s.es.forEach(e=>{e.t+=dt;const a=Math.atan2(h/2-e.y,w/2-e.x);e.x+=Math.cos(a)*22*dt;e.y+=Math.sin(a)*22*dt;e.ang=a;});
    s.m=Math.min(100,s.m+dt*22);
    if(s.m>=100&&!s.nova){s.nova={r:10,l:.8};s.m=0;}
    if(s.nova){s.nova.l-=dt;s.nova.r+=(w*.75-s.nova.r)*Math.min(1,dt*5);
      s.es=s.es.filter(e=>dist(e.x,e.y,w/2,h/2)>s.nova.r);
      c.globalCompositeOperation='lighter';
      c.strokeStyle=rgba(C.bio,s.nova.l);c.lineWidth=8*s.nova.l+1;
      c.beginPath();c.arc(w/2,h/2,s.nova.r,0,TAU);c.stroke();
      c.globalCompositeOperation='source-over';
      if(s.nova.l<=0)s.nova=null;}
    s.es.forEach(e=>{c.save();c.translate(e.x,e.y);drawDartNew(e);c.restore();});
    drawLumen(s.p,1);
    const bw=w-24;
    c.fillStyle='rgba(6,22,33,.9)';c.fillRect(12,h-22,bw,10);
    c.fillStyle=s.m>=99?C.bio:C.teal;c.fillRect(12,h-22,bw*(s.m/100),10);
    c.strokeStyle=rgba(C.teal,.5);c.lineWidth=1;c.strokeRect(12,h-22,bw,10);
    c.fillStyle=rgba(C.sand,.8);c.font='700 9px ui-monospace,monospace';c.textAlign='left';c.textBaseline='top';
    c.fillText('CARGA DA FLORADA '+Math.round(s.m)+'%',12,12);}},
 {tag:'SIMBIONTES',init:()=>({p:{x:0,y:0,vx:0,vy:0,r:15,aim:0,hitPulse:0},t:0,bs:[]}),
  fn:(c,w,h,dt,s)=>{
    s.t+=dt;s.p.x=w/2+Math.cos(s.t*.7)*w*.16;s.p.y=h/2+Math.sin(s.t*.9)*h*.14;s.p.aim=s.t*1.6;
    const orbs=1+Math.floor((s.t%9)/3);
    c.globalCompositeOperation='lighter';
    for(let i=0;i<orbs;i++){const a=s.t*2.3+i*TAU/orbs,ox=s.p.x+Math.cos(a)*46,oy=s.p.y+Math.sin(a)*46;
      blob(ox,oy,18,C.bio,.6);c.fillStyle=rgba(C.sand,.9);c.beginPath();c.arc(ox,oy,3.6,0,TAU);c.fill();}
    c.globalCompositeOperation='source-over';
    if(Math.random()<dt*7){const a=s.p.aim;
      s.bs.push({x:s.p.x,y:s.p.y,vx:Math.cos(a)*300,vy:Math.sin(a)*300,a:a,l:3,b:2,r:3.2,crit:Math.random()<.3});}
    for(let i=s.bs.length-1;i>=0;i--){const b=s.bs[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.l-=dt;
      if(b.x<6||b.x>w-6){if(b.b>0){b.b--;b.vx*=-1;b.a=Math.atan2(b.vy,b.vx);}else b.l=0;}
      if(b.y<6||b.y>h-6){if(b.b>0){b.b--;b.vy*=-1;b.a=Math.atan2(b.vy,b.vx);}else b.l=0;}
      if(b.l<=0)s.bs.splice(i,1);}
    c.globalCompositeOperation='lighter';
    s.bs.forEach(b=>{blob(b.x,b.y,13,b.crit?C.amber:C.teal,.6);
      c.save();c.translate(b.x,b.y);c.rotate(b.a);c.fillStyle=rgba(C.white,.9);
      c.beginPath();c.ellipse(0,0,8,2,0,0,TAU);c.fill();c.restore();});
    c.globalCompositeOperation='source-over';
    drawLumen(s.p,1);
    c.strokeStyle=rgba(C.bio,.25);c.lineWidth=2;c.setLineDash([12,8]);c.lineDashOffset=-T*20;
    c.strokeRect(4,4,w-8,h-8);c.setLineDash([]);
    c.fillStyle=rgba(C.sand,.8);c.font='700 10px ui-monospace,monospace';c.textAlign='left';c.textBaseline='top';
    c.fillText('ORBES '+orbs+' · RICOCHETE · CRÍTICO',12,12);}},
 {tag:'PERIGOS',init:()=>({t:0,u:{t:0,r:18,spin:0,cd:2},c:{t:0,r:22,ang:0,st:'idle',stT:0,cd:2,lock:0,x:0,y:0,vx:0,vy:0},
    e:{t:0,r:15,ang:0,st:'idle',stT:0,cd:2,beamAng:0},bs:[],beam:null}),
  fn:(c,w,h,dt,s)=>{
    s.t+=dt;const col=w/3;
    s.u.t+=dt;s.u.spin+=dt*(s.u.cd<.6?7:1.3);s.u.cd-=dt;
    const ux=col*.5,uy=h*.52;
    if(s.u.cd<=0){s.u.cd=2.6;for(let i=0;i<10;i++){const a=i*TAU/10;
      s.bs.push({x:ux+Math.cos(a)*18,y:uy+Math.sin(a)*18,vx:Math.cos(a)*120,vy:Math.sin(a)*120,l:1.6,c:C.bio,r:4,t:0,homing:0});}}
    c.save();c.translate(ux,uy);drawUrchinNew(s.u);c.restore();
    const cx=col*1.5,cy=h*.52;s.c.t+=dt;s.c.cd-=dt;
    if(s.c.st==='idle'){s.c.x=cx;s.c.y=cy+18;s.c.ang=-PI/2;
      if(s.c.cd<=0){s.c.st='wind';s.c.stT=.7;s.c.lock=-PI/2;}}
    else if(s.c.st==='wind'){s.c.stT-=dt;s.c.x=cx+Math.sin(s.c.t*40)*2;s.c.y=cy+18;
      if(s.c.stT<=0){s.c.st='charge';s.c.stT=.55;s.c.vy=-260;}}
    else{s.c.stT-=dt;s.c.y+=s.c.vy*dt;if(s.c.stT<=0){s.c.st='idle';s.c.cd=1.6;s.c.y=cy+18;}}
    c.save();c.translate(s.c.x,s.c.y);drawCrabNew(s.c);c.restore();
    const ex=col*2.5,ey=h*.52;s.e.t+=dt;s.e.cd-=dt;s.e.ang=PI;
    if(s.e.st==='idle'){if(s.e.cd<=0){s.e.st='aim';s.e.stT=1;s.e.beamAng=PI+rnd(-.3,.3);}}
    else if(s.e.st==='aim'){s.e.stT-=dt;
      const k=1-s.e.stT;
      c.globalCompositeOperation='lighter';c.strokeStyle=rgba(C.info,.2+k*.4);c.lineWidth=1+k*3;
      c.setLineDash([10,9]);c.lineDashOffset=-T*50;
      c.beginPath();c.moveTo(ex,ey);c.lineTo(ex+Math.cos(s.e.beamAng)*col,ey+Math.sin(s.e.beamAng)*col);c.stroke();
      c.setLineDash([]);c.globalCompositeOperation='source-over';
      if(s.e.stT<=0){s.e.st='beam';s.e.stT=.3;s.beam={l:.3};}}
    else{s.e.stT-=dt;if(s.e.stT<=0){s.e.st='idle';s.e.cd=1.8;}}
    if(s.beam){s.beam.l-=dt;
      c.globalCompositeOperation='lighter';
      for(let p=0;p<3;p++){c.strokeStyle=p===2?rgba(C.white,s.beam.l*3):rgba(C.info,s.beam.l*2);
        c.lineWidth=p===0?14:p===1?5:2;
        c.beginPath();c.moveTo(ex,ey);
        for(let i=1;i<=8;i++){const t2=i/8;
          c.lineTo(ex+Math.cos(s.e.beamAng)*col*t2,ey+Math.sin(s.e.beamAng)*col*t2+(i===8?0:rnd(-8,8)));}
        c.stroke();}
      c.globalCompositeOperation='source-over';
      if(s.beam.l<=0)s.beam=null;}
    c.save();c.translate(ex,ey);drawEelNew(s.e);c.restore();
    for(let i=s.bs.length-1;i>=0;i--){const b=s.bs[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.l-=dt;b.t+=dt;
      if(b.l<=0||b.x<0||b.x>col||b.y<0||b.y>h){s.bs.splice(i,1);continue;}
      c.globalCompositeOperation='lighter';blob(b.x,b.y,12,C.bio,.55);c.globalCompositeOperation='source-over';}
    c.strokeStyle=rgba(C.teal,.16);c.lineWidth=1;
    c.beginPath();c.moveTo(col,10);c.lineTo(col,h-10);c.moveTo(col*2,10);c.lineTo(col*2,h-10);c.stroke();
    c.fillStyle=rgba(C.sand,.8);c.font='700 9px ui-monospace,monospace';c.textAlign='center';c.textBaseline='top';
    c.fillText('OURIÇO · RADIAL',col*.5,10);c.fillText('CARAPAÇA · INVESTIDA',col*1.5,10);c.fillText('ENGUIA · FEIXE',col*2.5,10);}}];
const HOWTO=[
 {t:'Nadar é sobreviver',lead:'O LUMEN responde na hora: aceleração curta, sem inércia longa. A arena é maior que a tela — a câmera segue você e o sonar mostra o que está fora do enquadramento.',
  pts:[[C.teal,'Mova com WASD, setas ou o analógico esquerdo. A velocidade base cruza a arena em poucos segundos.'],
   [C.bio,'O jato propulsor (ESPAÇO / botão JATO) dá um impulso de 1180 u/s e invulnerabilidade breve — é sua ferramenta de fuga, não de viagem.'],
   [C.info,'Setas na borda da tela apontam criaturas fora de vista. O sonar no canto inferior direito mostra a arena inteira.']]},
 {t:'Sua luz atira sozinha',lead:'Você nunca aperta um botão de tiro. O LUMEN dispara continuamente na direção da mira — mouse no desktop, analógico direito no toque.',
  pts:[[C.amber,'Cadência, dano, número de projéteis, perfuração, crítico e ricochete são todos melhoráveis entre as ondas.'],
   [C.magenta,'Perfuração atravessa fileiras de cardume. Prisma abre leque. Ricochete transforma as paredes da fossa em aliadas.'],
   [C.bio,'Acertos críticos saem âmbar e causam ×2.2 de dano — o número flutuante mostra exatamente quanto você tirou.']]},
 {t:'Plâncton, combo e florada',lead:'Tudo que morre solta plâncton. Ele vale pontos e carrega a FLORADA — uma nova bioluminescente que varre a arena, apaga projéteis inimigos e ainda dá invulnerabilidade.',
  pts:[[C.bio,'Colete plâncton: o ímã base tem 95 u de raio e pode ser triplicado com simbiontes e com o buff VORAGEM.'],
   [C.amber,'Abates seguidos sobem o multiplicador até ×5. Levar dano zera o combo — proteger a vida é proteger a pontuação.'],
   [C.magenta,'Seis, doze, vinte e trinta abates em sequência disparam bônus de massacre com pontos extras.']]},
 {t:'Simbiontes: sua build',lead:'A cada onda limpa você escolhe 1 de 3 simbiontes entre quinze. Eles acumulam níveis e mudam de verdade como o LUMEN luta — não são só números.',
  pts:[[C.teal,'Comuns (turquesa) ajustam cadência, dano, velocidade e ímã. São a base de qualquer build.'],
   [C.electric,'Raros (azul) mexem em sobrevivência: casco, regeneração, jato, perfuração e crítico.'],
   [C.magenta,'Épicos e lendários (magenta/âmbar) mudam o comportamento: orbes orbitais, choque no jato, ricochete e florada precoce.']]},
 {t:'Leia os avisos',lead:'Nada mata de surpresa na fossa. Cada ataque perigoso tem um telégrafo visual e sonoro próprio — aprender a ler esses sinais é o jogo inteiro.',
  pts:[[C.bio,'O ouriço acende o núcleo 0,6 s antes da explosão radial. Saia do raio ou passe pelo vão entre os espinhos.'],
   [C.crimson,'A carapaça treme e trava a direção antes de investir. Saia perpendicularmente, nunca para trás.'],
   [C.info,'A enguia desenha uma linha tracejada antes do feixe. As fontes hidrotermais pulsam âmbar antes de eruptir — e também ferem inimigos.']]}];
let howtoStep=0,howtoDemo=null,demoStates=[];
function buildHowto(){
  $('howtoDots').innerHTML=HOWTO.map((h,i)=>'<button class="dot'+(i===0?' on':'')+'" data-i="'+i+'">'+String(i+1).padStart(2,'0')+' · '+h.t.split(' ')[0].toUpperCase()+'</button>').join('');
  $('howtoKeys').innerHTML=(isTouch?[
    ['ANALÓGICO ESQ.','nadar'],['ANALÓGICO DIR.','mirar'],['JATO','impulso invulnerável'],
    ['FLORADA','nova bioluminescente'],['PAUSA','botão ❚❚ no topo'],['TREINO','sem dano, guiado']]:[
    ['W A S D','nadar'],['MOUSE','mirar · tiro automático'],['ESPAÇO','jato propulsor'],
    ['E','florada'],['ESC / P','pausa'],['1 2 3','escolher simbionte'],['M','silenciar'],['R','reiniciar no fim']])
    .map(k=>'<div class="key"><kbd>'+k[0]+'</kbd><span>'+k[1]+'</span></div>').join('');
  demoStates=DEMOS.map(d=>d.init());
  howtoDemo=registerAux($('howtoCanvas'),'demo',(c,w,h,dt)=>DEMOS[howtoStep].fn(c,w,h,dt,demoStates[howtoStep]));
  renderHowto();
}
function renderHowto(){
  const h=HOWTO[howtoStep];
  $('howtoTitle').textContent=h.t;$('howtoLead').textContent=h.lead;
  $('howtoPoints').innerHTML=h.pts.map((p,i)=>'<div class="point"><i style="background:'+p[0]+'">'+(i+1)+'</i><p>'+p[1]+'</p></div>').join('');
  $('howtoCount').textContent='PASSO '+(howtoStep+1)+' DE '+HOWTO.length;
  $('demoTag').textContent=DEMOS[howtoStep].tag;
  Array.from($('howtoDots').children).forEach((d,i)=>d.classList.toggle('on',i===howtoStep));
  $('howtoPrev').disabled=howtoStep===0;$('howtoPrev').style.opacity=howtoStep===0?'.4':'1';
  $('howtoNext').textContent=howtoStep===HOWTO.length-1?'IR AO BESTIÁRIO ▸':'PRÓXIMO ▸';
  demoStates[howtoStep]=DEMOS[howtoStep].init();
  fitAux();
}
function stepHowto(d){
  const n=howtoStep+d;
  if(n>=HOWTO.length){go('bestiary');renderBestiary();return;}
  if(n<0)return;
  howtoStep=n;renderHowto();Snd.click();
}
$('howtoDots').addEventListener('click',e=>{const b=e.target.closest('.dot');if(!b)return;howtoStep=+b.dataset.i;renderHowto();Snd.click();});
$('howtoPrev').addEventListener('click',()=>stepHowto(-1));
$('howtoNext').addEventListener('click',()=>stepHowto(1));
$('howtoTrain').addEventListener('click',()=>{mode='treino';store.set('mode',mode);syncModeCards();beginRun('treino');});
/* --- bestiário --- */
let beastAux=[],beastFilter='all';
function renderBestiary(){
  const list=BEASTS.filter(b=>beastFilter==='all'||(beastFilter==='seen'?seen[b.k]:b.kind===beastFilter));
  beastAux=[];
  $('beastGrid').innerHTML=list.length?list.map((b,i)=>{
    const bars=[['VIDA',b.vida,C.bio],['VELOCIDADE',b.vel,C.info],['AMEAÇA',b.amea,C.crimson]]
      .map(x=>'<div class="bar"><span>'+x[0]+'</span><div><i style="width:'+x[1]+'%;background:'+x[2]+'"></i></div></div>').join('');
    return '<article class="beast-card" style="--accent:'+b.c+';--glowc:'+rgba(b.c,.3)+'">'+
      (seen[b.k]?'<span class="seen">ENCONTRADO</span>':'')+
      '<canvas data-k="'+b.k+'"></canvas><div class="bc-body"><div class="bc-top"><h3>'+b.n+'</h3><span class="kind">'+(b.kind==='chefe'?'CHEFE':'COMUM')+'</span></div>'+
      '<p>'+b.d+'</p><div class="bars">'+bars+'</div><div class="tip"><b>COMO LIDAR:</b> '+b.tip+'</div></div></article>';
  }).join(''):'<div class="empty">NENHUM ESPÉCIME ENCONTRADO AINDA · MERGULHE PARA CATALOGAR</div>';
  Array.from($('beastGrid').querySelectorAll('canvas')).forEach(c=>{
    const k=c.dataset.k;
    const o=registerAux(c,'beast'+k,(cx,w,h,dt)=>{
      const t=T;
      cx.save();cx.translate(w/2,h/2+4);
      const sc=Math.min(w,h)/(k==='medusa'?230:(k==='leviathan'?150:96));
      cx.scale(sc,sc);
      cx.globalCompositeOperation='lighter';blob(0,0,70,BEASTS.filter(b=>b.k===k)[0].c,.3);cx.globalCompositeOperation='source-over';
      if(k==='medusa'){drawMedusaNew({x:0,y:0,r:60,t:t,phase:1,st:'idle'});}
      else if(k==='leviathan'){
        const segs=[];for(let i=0;i<10;i++)segs.push({x:-i*22-10,y:Math.sin(t*2-i*.5)*14});
        drawLeviathan({x:0,y:0,r:34,ang:0,t:t,segs:segs});}
      else{
        const e={x:0,y:0,r:DEF[k].r,t:t,ang:Math.sin(t*.6)*.3,pulse:Math.max(0,Math.sin(t*2)),spin:t*.8,cd:1.2,st:'idle',stT:0,beamAng:0};
        if(k==='drifter')drawJellyNew(e);else if(k==='dart')drawDartNew(e);else if(k==='angler')drawAnglerNew(e);
        else if(k==='urchin')drawUrchinNew(e);else if(k==='crab')drawCrabNew(e);else drawEelNew(e);}
      cx.restore();});
    beastAux.push(o);});
  aux.length=0;if(howtoDemo)aux.push(howtoDemo);beastAux.forEach(o=>aux.push(o));
  fitAux();
}
$('beastFilters').addEventListener('click',e=>{
  const b=e.target.closest('.chipbtn');if(!b)return;
  beastFilter=b.dataset.f;
  Array.from($('beastFilters').children).forEach(x=>x.classList.toggle('on',x===b));
  renderBestiary();Snd.click();});
/* --- recordes --- */
function renderRecords(){
  const tiles=[['RECORDE',fmt(best),C.amber],['MELHOR ONDA',bestWave,C.bio],['MERGULHOS',totals.runs,C.teal],
    ['ABATES TOTAIS',fmt(totals.kills),C.magenta],['PLÂNCTON TOTAL',fmt(totals.plankton),C.bio],
    ['TEMPO NO FUNDO',Math.floor(totals.time/60)+' min',C.info],['MAIOR COMBO','×'+Math.min(5,1+Math.floor(totals.combo/5)*.5).toFixed(1),C.violet],
    ['ESPÉCIMES',Object.keys(seen).length+'/8',C.crimson]];
  $('recTiles').innerHTML=tiles.map(t=>'<div class="tile" style="--gl:'+rgba(t[2],.24)+'"><span>'+t[0]+'</span><b style="color:'+t[2]+'">'+t[1]+'</b></div>').join('');
  const reach=new Array(12).fill(0);
  runs.forEach(r=>{for(let i=0;i<Math.min(12,r.wave);i++)reach[i]++;});
  const mx=Math.max(1,...reach);
  const hues=[C.teal,C.bio,C.electric,C.info,C.violet,C.magenta,C.amber,C.crimson];
  $('recChart').innerHTML=reach.map((v,i)=>{
    const h=Math.round((v/mx)*100),col=hues[i%hues.length];
    return '<div class="col"><span class="val">'+v+'</span><div class="bb" style="height:'+Math.max(3,h)+'%;background:linear-gradient(180deg,'+col+','+rgba(col,.35)+')"></div><span class="lb">'+(i+1)+'</span></div>';}).join('');
  $('recTableWrap').innerHTML=runs.length?
    '<div class="scroll" style="max-height:280px;border:1px solid var(--edge2);border-radius:14px"><table class="tbl"><thead><tr><th>DATA</th><th>MODO</th><th>PRESSÃO</th><th>ONDA</th><th>ABATES</th><th>PONTOS</th></tr></thead><tbody>'+
    runs.map(r=>'<tr><td>'+r.date+'</td><td>'+r.mode.toUpperCase()+'</td><td>'+r.diff.toUpperCase()+'</td><td>'+r.wave+'</td><td>'+r.kills+'</td><td class="hi">'+fmt(r.score)+'</td></tr>').join('')+
    '</tbody></table></div>':'<div class="empty">NENHUM MERGULHO REGISTRADO · O FUNDO AINDA NÃO CONHECE SUA LUZ</div>';
  $('recConfirm').innerHTML='';
}
$('btnResetRec').addEventListener('click',()=>{
  if($('recConfirm').dataset.armed==='1'){
    best=0;bestWave=0;runs=[];totals={runs:0,kills:0,plankton:0,time:0,combo:0};seen={};
    store.set('best',0);store.set('bestWave',0);store.set('runs',[]);store.set('totals',totals);store.set('seen',{});
    $('recConfirm').dataset.armed='';renderRecords();syncMenuRecords();toast('REGISTROS APAGADOS');Snd.click();
  }else{
    $('recConfirm').dataset.armed='1';
    $('recConfirm').innerHTML='<span class="mono" style="font-size:10px;color:var(--warn);letter-spacing:.16em">CLIQUE NOVAMENTE PARA CONFIRMAR</span>';
    later(4,()=>{if($('recConfirm').dataset.armed==='1'){$('recConfirm').dataset.armed='';$('recConfirm').innerHTML='';}});
  }});
/* --- ajustes --- */
function bindSlider(id,key,vid,suffix){
  const el=$(id);el.value=SET[key];
  const upd=()=>{el.style.setProperty('--p',((el.value-el.min)/(el.max-el.min)*100)+'%');$(vid).textContent=el.value+(suffix||'%');};
  el.addEventListener('input',()=>{SET[key]=+el.value;saveSet();upd();Snd.applyVolumes();
    if(key==='sfx')Snd.pickup();});
  upd();return upd;
}
let sliderUpds=[];
function buildSettings(){
  sliderUpds=[bindSlider('setMaster','master','vMaster'),bindSlider('setMusic','music','vMusic'),
    bindSlider('setSfx','sfx','vSfx'),bindSlider('setShake','shake','vShake'),
    bindSlider('setParts','parts','vParts'),bindSlider('setGlow','glow','vGlow')];
  const tg=(id,key)=>{const el=$(id);el.classList.toggle('on',!!SET[key]);
    el.addEventListener('click',()=>{SET[key]=!SET[key];saveSet();el.classList.toggle('on',SET[key]);
      stage.dataset.motion=SET.motion?'off':'on';Snd.click();});};
  tg('setContrast','contrast');tg('setMotion','motion');tg('setArrows','arrows');
  $('setMute').addEventListener('click',toggleSound);
  $('setSpeed').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    speedSetting=parseFloat(b.dataset.s);SET.speed=speedSetting;saveSet();syncSpeedUI();Snd.click();});
  $('setDiff').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    difficulty=b.dataset.d;store.set('diff',difficulty);syncDiffUI();Snd.click();});
  $('btnDefaults').addEventListener('click',()=>{
    SET=Object.assign({},DEFSET);saveSet();speedSetting=1;Snd.applyVolumes();syncAudioUI();syncSpeedUI();
    ['setMaster','setMusic','setSfx','setShake','setParts','setGlow'].forEach((id,i)=>{$(id).value=SET[['master','music','sfx','shake','parts','glow'][i]];});
    sliderUpds.forEach(f=>f());
    $('setContrast').classList.remove('on');$('setMotion').classList.remove('on');$('setArrows').classList.add('on');
    stage.dataset.motion='on';toast('AJUSTES RESTAURADOS');Snd.up();});
}
function syncSpeedUI(){
  Array.from($('setSpeed').children).forEach(b=>b.classList.toggle('on',parseFloat(b.dataset.s)===speedSetting));
  Array.from($('spd').children).forEach(b=>b.classList.toggle('on',parseFloat(b.dataset.s)===speedSetting));
}
function syncDiffUI(){
  Array.from($('diffCards').children).forEach(b=>b.classList.toggle('sel',b.dataset.d===difficulty));
  Array.from($('setDiff').children).forEach(b=>b.classList.toggle('on',b.dataset.d===difficulty));
}
function syncModeCards(){Array.from($('modeCards').children).forEach(b=>b.classList.toggle('sel',b.dataset.mode===mode));}
function syncMenuRecords(){$('menuBest').textContent=fmt(best);$('menuBestWave').textContent=bestWave;$('menuRuns').textContent=totals.runs;}

/* ============================================================
   15 · HUD
   ============================================================ */
const hc={hp:-1,maxHp:-1,score:-1,wave:-1,left:-1,bloom:-1,combo:-1,dash:-1,best:-1,buffs:''};
let pipEls=[];
function buildDepthGauge(){
  const g=$('depthGauge');
  g.innerHTML='<span class="dg-lb">PROFUNDIDADE</span>'+Array.from({length:12},(_,i)=>
    '<i class="'+(i+1<wave?'done':(i+1===wave?'cur':''))+'"></i>').join('');
}
function syncHud(force){
  if(!P)return;
  if(force||hc.maxHp!==P.maxHp){$('pips').innerHTML=Array.from({length:P.maxHp},()=>'<i></i>').join('');
    pipEls=Array.from($('pips').children);hc.maxHp=P.maxHp;hc.hp=-1;}
  if(force||hc.hp!==P.hp){pipEls.forEach((el,i)=>{el.className=i<P.hp?(P.hp<=2?'low':''):'off';});hc.hp=P.hp;}
  if(force||hc.score!==score){$('score').textContent=fmt(score);hc.score=score;}
  if(force||hc.best!==best){$('bestHud').textContent='REC '+fmt(best);hc.best=best;}
  const bl=Math.round(bloom);
  if(force||hc.bloom!==bl){$('bloomFill').style.transform='scaleX('+(bl/100)+')';
    const ready=bl>=100;
    $('bloomMeter').classList.toggle('ready',ready);$('btnBloom').classList.toggle('ready',ready);$('tBloom').classList.toggle('ready',ready);
    $('bloomLabel').textContent=ready?'FLORADA PRONTA · E':'FLORADA '+bl+'%';hc.bloom=bl;}
  const dr=P.dashLeft<=0?1:1-P.dashLeft/P.dashCd;
  if(force||Math.abs(hc.dash-dr)>.02){$('dashFill').style.transform='scaleX('+dr+')';$('tDash').classList.toggle('cool',P.dashLeft>0);hc.dash=dr;}
  const bs=Object.keys(P.buffs).map(k=>k+Math.ceil(P.buffs[k])).join('|');
  if(force||hc.buffs!==bs){
    $('buffRow').innerHTML=Object.keys(P.buffs).map(k=>'<span class="buff" style="--bc:'+BUFFS[k].c+'"><i></i>'+BUFFS[k].n+' '+Math.ceil(P.buffs[k])+'s</span>').join('');
    hc.buffs=bs;}
  const cm=comboMult();
  if(force||hc.combo!==cm){$('comboMult').textContent='×'+cm.toFixed(1);$('comboBox').classList.toggle('hot',cm>=3);hc.combo=cm;}
  $('comboFill').style.transform='scaleX('+(P.comboWindow>0?clamp(comboT/P.comboWindow,0,1):0)+')';
  if(bossRef)$('bossFill').style.transform='scaleX('+clamp(bossRef.hp/bossRef.maxHp,0,1)+')';
  else{
    const left=coopGuest?netLeft:enemies.length+spawnQueue.length+teles.length;
    const secLeft=Math.max(0,Math.ceil(waveDuration(wave)-waveClock)),leftKey=left+'|'+secLeft;
    if(force||hc.wave!==wave){$('waveNum').textContent=training?'TREINO':'ONDA '+String(wave).padStart(2,'0')+(endless?' ∞':' / 12');
      $('waveName').textContent=training?'SANDBOX SEGURO':waveName;hc.wave=wave;hc.left=-1;}
    if(force||hc.left!==leftKey){
      const mm=Math.floor(secLeft/60),ss=String(secLeft%60).padStart(2,'0');
      $('waveLeft').textContent=training?'sem dano · saia pelo menu':left+' CRIATURAS · '+(secLeft>0?mm+':'+ss:'LIMPE')+' · PROF. '+fmt(1620+wave*420)+' m';
      $('waveFill').style.transform='scaleX('+(training?0:clamp(waveClock/waveDuration(wave),0,1))+')';hc.left=leftKey;}}
  syncPartner();
}
function syncPartner(){
  const el=$('partner');if(!el)return;
  if(!coop){if(el.classList.contains('on'))el.classList.remove('on');return;}
  const q=players[1-ME];
  if(!q||q.gone){el.classList.remove('on');return;}
  const hp=Math.ceil(q.hp),key=pname(q)+'|'+hp+'|'+q.maxHp+'|'+(q.down?1:0)+'|'+Math.floor((q.reviveT||0)*3);
  if(hc.pt!==key){hc.pt=key;el.classList.add('on');el.classList.toggle('down',!!q.down);
    el.innerHTML='<span class="pn" style="color:'+(q.idx===1?C.violet:C.teal)+'">'+pname(q)+'</span>'+
      Array.from({length:q.maxHp},(_,i)=>'<i class="'+(i<hp?'on':'')+'"></i>').join('')+(q.down?'<b>CAÍDO · APROXIME-SE PARA REVIVER</b>':'');}
  if(coopGuest&&hc.lv!==lives){hc.lv=lives;renderLives();}
}
function showHint(){
  $('hint').innerHTML=isTouch?'<b>ESQ</b> nadar · <b>DIR</b> mirar e atirar · <b>JATO</b> e <b>FLORADA</b> à direita'
    :'<b>WASD</b> nadar · <b>MOUSE</b> mirar (tiro automático) · <b>ESPAÇO</b> jato · <b>E</b> florada';
  $('hint').classList.add('on');
}
function banner(num,name,sub){
  $('bannerNum').textContent=num;$('bannerName').textContent=name;$('bannerSub').textContent=sub;
  const b=$('banner');b.classList.remove('show');void b.offsetWidth;b.classList.add('show');
  later(2.5,()=>b.classList.remove('show'));
}
function toast(txt){
  const el=document.createElement('div');el.className='toast';el.textContent=txt;
  const box=$('toast');box.appendChild(el);
  later(2.2,()=>{if(el.parentNode)el.parentNode.removeChild(el);});
  while(box.children.length>3)box.removeChild(box.firstChild);
}
function statSheet(){
  const s=[['DANO',P.dmg.toFixed(1)],['CADÊNCIA',P.fireRate.toFixed(1)+'/s'],['PROJÉTEIS',P.shots],['PERFURAÇÃO',P.pierce],
    ['CRÍTICO',Math.round(P.crit*100)+'%'],['VELOCIDADE',Math.round(P.speed)],['CÉLULAS',P.hp+'/'+P.maxHp],
    ['JATO',P.dashCd.toFixed(2)+'s'],['ORBES',P.orbs],['RICOCHETE',P.bounce]];
  $('statSheet').innerHTML=s.map(x=>'<div class="stat"><span>'+x[0]+'</span><b>'+x[1]+'</b></div>').join('');
  const owned=UP.filter(u=>(P.stacks[u.id]||0)>0);
  $('ownedChips').innerHTML=owned.length?owned.map(u=>'<span class="chip">'+u.n+' <b>×'+P.stacks[u.id]+'</b></span>').join('')
    :'<span class="chip">nenhum simbionte ainda</span>';
}
function renderCards(){
  $('upSub').textContent='ONDA '+wave+' LIMPA · TECLAS 1 · 2 · 3';
  $('cards').innerHTML=offers.map((u,i)=>{
    const st=P.stacks[u.id]||0;let pips='';
    for(let k=0;k<u.max;k++)pips+='<i class="'+(k<st?'on':'')+'"></i>';
    return '<button class="card r-'+u.r+'" data-i="'+i+'"><span class="num">'+(i+1)+'</span>'+
      '<div class="ico"><svg viewBox="0 0 24 24">'+u.ico+'</svg></div><div class="rar">'+(u.evo?'EVOLUÇÃO':RARNAME[u.r])+'</div>'+
      '<h3>'+u.n+'</h3><p>'+u.d+'</p><div class="stack">'+pips+'<span>'+st+'/'+u.max+'</span></div></button>';}).join('');
  const rb=$('btnReroll');rb.textContent='SORTEAR OUTRAS · '+(P.rr||0)+' (R)';rb.disabled=!(P.rr>0);rb.style.opacity=P.rr>0?1:.4;
  $('cards').classList.remove('waiting');
  statSheet();
}
$('btnReroll').addEventListener('click',rerollOffers);
$('cards').addEventListener('click',e=>{const b=e.target.closest('.card');if(b)chooseUpgrade(+b.dataset.i);});

/* ============================================================
   16 · NAVEGAÇÃO DE TELAS
   ============================================================ */
const SCENE_EL={coop:'scCoop',boot:'scBoot',menu:'scMenu',howto:'scHowto',bestiary:'scBestiary',records:'scRecords',
  settings:'scSettings',upgrade:'scUpgrade',pause:'scPause',over:'scOver',win:'scWin'};
function go(s){
  if(s!=='play'){[stickL,stickR].forEach(st=>{st.on=false;st.id=-1;st.dx=st.dy=st.mag=0;});$('stickL').classList.remove('on');$('stickR').classList.remove('on');homeSticks();}
  scene=s;stage.dataset.scene=s;
  Object.keys(SCENE_EL).forEach(k=>$(SCENE_EL[k]).classList.toggle('show',k===s));
  const playing=s==='play';
  $('hud').classList.toggle('on',playing);
  $('touch').classList.toggle('on',playing&&isTouch);if(playing&&isTouch)homeSticks();
  if(!playing)$('hint').classList.remove('on');
  if(s==='howto'){renderHowto();}
  if(s==='bestiary')renderBestiary();
  if(s==='records')renderRecords();
  if(s==='menu'){syncMenuRecords();syncDiffUI();syncModeCards();}
  if(s==='coop')coopRefresh();
  if(s==='settings'){sliderUpds.forEach(f=>f());syncSpeedUI();syncDiffUI();syncAudioUI();}
  fitAux();
}
function enterMenu(){
  Snd.init();Snd.resume();Snd.sonar();Music.playWeb('title');
  seedMenuLife();theme=THEMES[0];bakeBG();go('menu');
}
let navIdx=0;
function moveNav(d){
  const items=Array.from($('menuNav').children);
  navIdx=(navIdx+d+items.length)%items.length;
  items.forEach((it,i)=>it.classList.toggle('act',i===navIdx));
  Snd.hover();items[navIdx].scrollIntoView({block:'nearest'});
}
function activateNav(){const items=Array.from($('menuNav').children);openNav(items[navIdx].dataset.nav);}
function openNav(k){
  Snd.init();Snd.resume();Snd.click();
  if(k==='dive'){startDive(mode);return;}
  if(k==='coop'){openCoopMenu();return;}
  backTo='menu';go(k);
}
$('menuNav').addEventListener('click',e=>{
  const b=e.target.closest('.navitem');if(!b)return;
  const items=Array.from($('menuNav').children);navIdx=items.indexOf(b);
  items.forEach((it,i)=>it.classList.toggle('act',i===navIdx));
  openNav(b.dataset.nav);});
$('menuNav').addEventListener('pointerover',e=>{const b=e.target.closest('.navitem');if(b)Snd.hover();});
document.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>{Snd.click();go(backTo);}));
$('btnQuickHow').addEventListener('click',()=>{backTo='menu';go('howto');Snd.click();});
$('modeCards').addEventListener('click',e=>{const b=e.target.closest('.mode');if(!b)return;
  mode=b.dataset.mode;store.set('mode',mode);syncModeCards();Snd.click();});
$('diffCards').addEventListener('click',e=>{const b=e.target.closest('.diff');if(!b)return;
  difficulty=b.dataset.d;store.set('diff',difficulty);syncDiffUI();Snd.click();});
$('btnDive').addEventListener('click',()=>startDive(mode));
$('audioChip').addEventListener('click',toggleSound);
$('bootPrompt').addEventListener('click',()=>{if(bootSeq.done)enterMenu();});
$('scBoot').addEventListener('pointerdown',()=>{if(bootSeq.done)enterMenu();});

/* ============================================================
   17 · FLUXO DE JOGO
   ============================================================ */
function resetRun(){
  enemies=[];bullets=[];ebullets=[];parts=[];rings=[];floats=[];pickups=[];teles=[];trail=[];beams=[];ink=[];
  score=0;combo=0;comboT=0;maxCombo=0;kills=0;plankton=0;runTime=0;bloom=0;wave=0;
  bossRef=null;nova=null;spawnQueue=[];spawnTimer=0;endless=false;cine=null;streakN=0;streakT=0;
  dmgFlash=0;whiteFlash=0;cam.shake=0;ts=1;tsTarget=1;slowT=0;freeze=0;sonarT=3;sonarR=-1;heartT=0;
  timers=[];TU=tut();theme=THEMES[0];bakeBG();seedScenery();seedVents();
  players=[newPlayer(0)];
  if(coop){const q=newPlayer(1);players[0].x=world.w/2-70;q.x=world.w/2+70;players.push(q);
    if(coopHost)q.remote=true;else players[0].remote=true;}
  for(const q of players){q.sx=q.x;q.sy=q.y;q._sx=q.x;q._sy=q.y;q._tx=q.x;q._ty=q.y;}
  ME=coopGuest?1:0;P=players[ME];
  enemyMap=new Map();bossUIOn=false;coopWait=false;coopPaused=false;netAcc=0;evq=[];netLeft=0;
  {const cm=$('coopMenu');if(cm)cm.classList.remove('on');}
  cam.x=clamp(P.x-view.w/zoom/2,0,Math.max(0,world.w-view.w/zoom));
  cam.y=clamp(P.y-view.h/zoom/2,0,Math.max(0,world.h-view.h/zoom));
  $('bossInfo').classList.remove('on');$('waveInfo').style.display='';
  hc.hp=hc.maxHp=hc.score=hc.wave=hc.left=hc.bloom=hc.combo=hc.dash=hc.buffs=-1;hc.buffs='';hc.pt='';hc.lv=-1;
}
function startDive(m){
  Snd.init();Snd.resume();Snd.click();Music.playWeb('descent');
  mode=m;store.set('mode',m);
  diveSeq={t:0,dur:coopHost?1.9:1.5,mode:m};
  $('dive').classList.add('on');
  const lines=$('diveLines');lines.innerHTML='';
  for(let i=0;i<26;i++){const el=document.createElement('i');
    el.style.left=rnd(0,100)+'%';el.style.height=rnd(60,220)+'px';
    el.style.animationDuration=rnd(.5,1.2)+'s';el.style.animationDelay=(-rnd(0,1))+'s';
    el.style.opacity=rnd(.2,.8);lines.appendChild(el);}
  go('dive');Snd.nz(1.5,200,.14,'lowpass',0,1400);Snd.tone(120,1.5,'sine',.1,40);
}
function beginRun(m){
  $('dive').classList.remove('on');diveSeq=null;
  resetRun();
  training=m==='treino';endless=m==='infinito';
  livesOn=m==='campanha';lives=3;renderLives();
  go('play');
  if(training){
    Music.playWeb('training');
    wave=0;waveName='SANDBOX';waveTotal=0;theme=THEMES[0];bakeBG();
    bloom=0;P.hp=P.maxHp;buildDepthGauge();
    banner('TREINO','SANDBOX SEGURO','sem dano · aprenda os sistemas');
    for(let i=0;i<12;i++){const a=rnd(0,TAU),d=rnd(140,420);
      pickups.push({x:clamp(P.x+Math.cos(a)*d,20,world.w-20),y:clamp(P.y+Math.sin(a)*d,20,world.h-20),vx:0,vy:0,t:'p',r:4.5,l:40,ph:rnd(0,TAU)});}
    $('hint').classList.add('on');
  }else if(!coopGuest)startWave(1);
  syncHud(true);
  if(coopGuest){const q=pendingSnaps;pendingSnaps=[];q.forEach(applySnap);}
}
function pauseGame(){
  if(scene!=='play')return;
  if(coop){toggleCoopMenu();return;}
  go('pause');Music.pause();
  $('pauseSub').textContent=(training?'TREINO':'ONDA '+wave)+' · '+DIFF[difficulty].label+(endless?' · INFINITO':'');
  $('pauseStats').innerHTML=[['PONTOS',fmt(score)],['ABATES',kills],['COMBO MÁX','×'+Math.min(5,1+Math.floor(maxCombo/5)*.5).toFixed(1)],
    ['TEMPO',Math.floor(runTime/60)+':'+String(Math.floor(runTime%60)).padStart(2,'0')]]
    .map(x=>'<div class="gs"><span>'+x[0]+'</span><b>'+x[1]+'</b></div>').join('');
  $('btnQuit').textContent=training?'SAIR DO TREINO':'MENU';
  syncSpeedUI();
}
function resumeGame(){if(scene!=='pause')return;go('play');Snd.resume();Music.resume();}
function logRun(){
  const rec=score>best;
  if(rec){best=Math.round(score);store.set('best',best);}
  if(wave>bestWave){bestWave=wave;store.set('bestWave',bestWave);}
  totals.runs++;totals.kills+=kills;totals.plankton+=plankton;totals.time+=runTime;
  totals.combo=Math.max(totals.combo,maxCombo);
  store.set('totals',totals);
  const d=new Date();
  runs.unshift({date:String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'),
    mode:training?'treino':(endless?'infinito':'campanha'),diff:difficulty,wave:wave,kills:kills,score:Math.round(score)});
  runs=runs.slice(0,12);store.set('runs',runs);store.set('seen',seen);
  syncMenuRecords();return rec;
}
function runStats(){
  return[['PONTOS',fmt(score),true],['ONDA',training?'—':wave,false],['ABATES',kills,false],['PLÂNCTON',plankton,false],
    ['COMBO MÁX','×'+Math.min(5,1+Math.floor(maxCombo/5)*.5).toFixed(1),false],
    ['TEMPO',Math.floor(runTime/60)+':'+String(Math.floor(runTime%60)).padStart(2,'0'),false]]
    .map(x=>'<div class="gs'+(x[2]?' hi':'')+'"><span>'+x[0]+'</span><b>'+x[1]+'</b></div>').join('');
}
const TIPS=['Dica: o jato propulsor dá invulnerabilidade — use-o para atravessar enxames, não só para fugir.',
 'Dica: guarde a FLORADA para a espiral da Rainha. Ela apaga todos os projéteis da tela.',
 'Dica: o Ouriço acende o núcleo antes de explodir. O vão entre os espinhos é largo o bastante.',
 'Dica: a Carapaça trava a direção antes de investir. Saia da linha, nunca para trás.',
 'Dica: fontes hidrotermais também ferem inimigos. Atraia cardumes para cima delas.',
 'Dica: Orbe Simbiótico + Nadadeiras transforma o LUMEN num moedor de cardumes.',
 'Dica: a Enguia avisa com uma linha tracejada. Cruze perpendicularmente antes do estalo.'];
function gameOver(){
  if(scene==='over')return;
  if(coopHost&&Net&&Net.isOpen())Net.send({t:'over',w:wave,sc:score,kl:kills,pk:plankton,mc:maxCombo,rt:runTime});
  scene='over';P.alive=false;
  burst(P.x,P.y,90,C.teal,420,1.4);ring(P.x,P.y,10,520,.9,C.crimson,7);
  shake(28);whiteFlash=.6;slow(.35,1.4);Snd.lose();Music.playWeb('over');
  const rec=logRun();
  $('overSub').textContent=(livesOn&&!endless?'AS 3 VIDAS SE ESGOTARAM NA ONDA '+wave+' · O MERGULHO RECOMEÇA DO ZERO · ':'SUA LUZ SE APAGOU NA ONDA '+wave+' · ')+DIFF[difficulty].label;
  $('overRec').innerHTML=rec?'<div class="newrec">NOVO RECORDE</div>':'';
  $('overStats').innerHTML=runStats();$('overTip').textContent=pick(TIPS);
  later(1,()=>{if(scene==='over')go('over');});
}
function winGame(){
  if(coopHost&&Net&&Net.isOpen())Net.send({t:'win',w:wave,sc:score,kl:kills,pk:plankton,mc:maxCombo,rt:runTime});
  scene='win';Snd.win();Music.playWeb('win');whiteFlash=.6;shake(20);
  for(let i=0;i<6;i++)ring(P.x,P.y,20+i*50,700+i*80,1+i*.2,i%2?C.bio:C.teal,6);
  burst(P.x,P.y,110,C.bio,420,1.5);
  const rec=logRun();
  $('winRec').innerHTML=rec?'<div class="newrec">NOVO RECORDE</div>':'';
  $('winStats').innerHTML=runStats();
  later(.9,()=>{if(scene==='win')go('win');});
}
function goEndless(){endless=true;renderLives();if(coopHost&&Net&&Net.isOpen())Net.send({t:'endless'});go('play');toast('MODO INFINITO ATIVADO');startWave(wave+1);syncHud(true);}
function toMenu(){if(coop){leaveCoop(true);return;}if(scene==='pause'&&runTime>4)logRun();seedMenuLife();theme=THEMES[0];bakeBG();go('menu');Music.playWeb('menu');}
$('btnResume').addEventListener('click',resumeGame);
$('btnRestart').addEventListener('click',()=>{if(coop)return;logRun();beginRun(mode);});
$('btnQuit').addEventListener('click',toMenu);
$('btnPauseHow').addEventListener('click',()=>{backTo='pause';go('howto');});
$('btnPauseSet').addEventListener('click',()=>{backTo='pause';go('settings');});
$('btnOverHow').addEventListener('click',()=>{backTo='over';go('howto');});
function againClick(){
  if(!coop){beginRun(mode);return;}
  if(coopHost&&Net&&Net.isOpen()){hostStartRun();return;}
  if(coopHost){coop=coopHost=false;beginRun(mode);return;}
  toast('AGUARDANDO O HOST REINICIAR…');}
$('btnAgain').addEventListener('click',againClick);
$('btnAgain2').addEventListener('click',againClick);
$('btnEndless').addEventListener('click',()=>{if(coopGuest){toast('AGUARDANDO O HOST…');return;}goEndless();});
$('btnMenu').addEventListener('click',toMenu);
$('btnMenu2').addEventListener('click',toMenu);
$('btnPause').addEventListener('click',()=>{scene==='play'?pauseGame():resumeGame();});
$('btnSound').addEventListener('click',toggleSound);
$('btnBloom').addEventListener('click',()=>doNova());
$('spd').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  speedSetting=parseFloat(b.dataset.s);SET.speed=speedSetting;saveSet();syncSpeedUI();Snd.click();});

/* ============================================================
   17b · COOPERATIVO ONLINE — snapshots, convidado, mensagens, lobby
   Host = quem cria a sala: roda toda a simulação (inimigos, dano, ondas).
   Convidado = envia controles e desenha o estado recebido (com predição
   do próprio movimento para o controle responder na hora).
   ============================================================ */
const EN_SKIP={kx:1,ky:1,orbCd:1,dashHit:1,novaHit:1,dead:1,score:1};
function packEnemy(e){const o={};for(const k in e){if(EN_SKIP[k])continue;o[k]=e[k];}return o;}
function packPlayer(q){const o={};for(const k in q){if(k==='inp'||k==='remote'||k[0]==='_'||k==='sx'||k==='sy')continue;o[k]=q[k];}return o;}
function buildSnap(){
  const sn={t:'s',n:++netSeq,wave:wave,wc:waveClock,lf:enemies.length+spawnQueue.length+teles.length,
    sc:score,cb:combo,ct:comboT,bl:bloom,lv:lives,kl:kills,pk:plankton,rt:runTime,sr:sonarR,wf:whiteFlash>.05?whiteFlash:0,
    P:players.map(packPlayer),
    E:enemies.map(packEnemy),
    B:bullets.map(b=>[b.x,b.y,b.vx,b.vy,b.a,b.r,b.crit?1:0,b.l,b.o||0]),
    EB:ebullets.map(b=>[b.x,b.y,b.vx,b.vy,b.r,b.c,b.t,b.l]),
    PU:pickups.map(o=>[o.x,o.y,o.vx,o.vy,o.t,o.r,o.l,o.ph]),
    TL:teles.map(t=>[t.x,t.y,t.t,t.type]),
    BM:beams.map(b=>({x:b.x,y:b.y,a:b.a,l:b.l,m:b.m,len:b.len,c:b.c})),
    VN:vents.map(v=>[v.x,v.y,v.st,v.t,v.ph,v.r]),
    NV:nova?{x:nova.x,y:nova.y,r:nova.r,l:nova.l,m:nova.m,id:nova.id,o:nova.o||0}:null,
    AE:abyssEvent?{id:abyssEvent.id,name:abyssEvent.name,t:abyssEvent.t,dur:abyssEvent.dur}:null,
    EZ:eventZone,BR:bossRef?bossRef.id:0,
    CN:cine?{t:cine.t,m:cine.m,name:cine.name,sub:cine.sub}:null,
    ev:evq};
  evq=[];sndCnt={};return sn;}
function hostNetTick(rdt){
  netAcc+=rdt;if(netAcc<.05)return;netAcc=0;
  if(Net&&Net.isOpen())Net.send(buildSnap());}

/* ---- convidado: aplicar snapshot ---- */
const LOCALK={x:1,y:1,vx:1,vy:1,aim:1,aimT:1,dashT:1,dashAng:1,orbA:1};
function applySnap(sn){
  const now=performance.now();snapDt=clamp((now-snapT)/1000,.02,.25);snapT=now;
  score=sn.sc;combo=sn.cb;comboT=sn.ct;bloom=sn.bl;lives=sn.lv;kills=sn.kl;plankton=sn.pk;runTime=sn.rt;waveClock=sn.wc;netLeft=sn.lf;sonarR=sn.sr;
  if(sn.wf>whiteFlash)whiteFlash=sn.wf;
  if(sn.wave!==wave){wave=sn.wave;hc.wave=-1;}
  sn.P.forEach((n,i)=>{
    const q=players[i];if(!q)return;
    for(const k in n){
      if(i===ME){if(LOCALK[k])continue;if(k==='dashLeft'&&q.dashLock>0)continue;}
      else if(k==='x'||k==='y')continue;
      q[k]=n[k];}
    if(i===ME){q.sx=n.x;q.sy=n.y;}
    else{q._sx=q.x;q._sy=q.y;q._tx=n.x;q._ty=n.y;q.vx=n.vx;q.vy=n.vy;
      if(dist(q.x,q.y,n.x,n.y)>400){q.x=n.x;q.y=n.y;q._sx=n.x;q._sy=n.y;}}});
  const ne=[],nm=new Map();
  for(const n of sn.E){
    n._tx=n.x;n._ty=n.y;
    const o=enemyMap.get(n.id);
    if(o){n.x=o.x;n.y=o.y;}
    n._sx=n.x;n._sy=n.y;
    if(n.segs){n.segs.forEach((g,i)=>{g._tx=g.x;g._ty=g.y;const og=o&&o.segs&&o.segs[i];if(og){g.x=og.x;g.y=og.y;}g._sx=g.x;g._sy=g.y;});}
    ne.push(n);nm.set(n.id,n);}
  enemies=ne;enemyMap=nm;
  bossRef=sn.BR?(nm.get(sn.BR)||null):null;
  bullets=sn.B.map(a=>({x:a[0],y:a[1],vx:a[2],vy:a[3],a:a[4],r:a[5],crit:!!a[6],l:a[7],o:a[8],hits:[]}));
  ebullets=sn.EB.map(a=>({x:a[0],y:a[1],vx:a[2],vy:a[3],r:a[4],c:a[5],t:a[6],l:a[7]}));
  pickups=sn.PU.map(a=>({x:a[0],y:a[1],vx:a[2],vy:a[3],t:a[4],r:a[5],l:a[6],ph:a[7]}));
  teles=sn.TL.map(a=>({x:a[0],y:a[1],t:a[2],type:a[3]}));
  beams=sn.BM;
  vents=sn.VN.map(a=>({x:a[0],y:a[1],st:a[2],t:a[3],ph:a[4],r:a[5]}));
  nova=sn.NV;abyssEvent=sn.AE;eventZone=sn.EZ;cine=sn.CN;
  if(bossRef){
    if(!bossUIOn){bossUIOn=true;$('bossInfo').classList.add('on');$('waveInfo').style.display='none';$('bossName').textContent=bossRef.name;}
    $('bossPhase').textContent=bossRef.phase===2?'FASE II · FÚRIA':'FASE I';
  }else if(bossUIOn){bossUIOn=false;$('bossInfo').classList.remove('on');$('waveInfo').style.display='';}
  if(sn.ev&&sn.ev.length)for(const e of sn.ev)handleEv(e);}
function guestWaveVisuals(n){
  wave=n;const def=waveDef(n);
  Music.startWave(n);
  const nt=themeFor(n);if(nt!==theme){theme=nt;bakeBG();}
  waveName=def.n;abyssEvent=null;eventZone=null;
  buildDepthGauge();hc.wave=-1;
  if(n===1){hintT=9;showHint();}}
function handleEv(e){
  switch(e[0]){
    case 'b':burst(e[1],e[2],e[3],e[4],e[5],e[6]);break;
    case 'sp':spark(e[1],e[2],e[3],e[4],e[5],e[6]);break;
    case 'pl':plume(e[1],e[2],e[3],e[4],e[5]);break;
    case 'r':ring(e[1],e[2],e[3],e[4],e[5],e[6],e[7]);break;
    case 'f':floater(e[1],e[2],e[3],e[4],e[5]);break;
    case 'sh':shake(e[1]);break;
    case 'sn':{const f=Snd[e[1]];if(typeof f==='function'){try{f.apply(Snd,e[2]||[]);}catch(err){}}break;}
    case 'tt':if(e[2]===undefined||e[2]===ME)toast(e[1]);break;
    case 'bn':banner(e[1],e[2],e[3]);break;
    case 'hf':if(e[1]===ME)dmgFlash=.75;break;
    case 'ink':ink.push({x:e[1],y:e[2],r:e[3]*.8,r1:e[3]*3.2,l:1.1,m:1.1,c:e[4]});break;
    case 'wv':guestWaveVisuals(e[1]);break;
    case 'cine':cine={t:2.6,m:2.6,name:e[1],sub:e[2]};break;
    case 'st':{$('streakName').textContent=e[1];$('streakSub').textContent=e[2];
      const el=$('streak');el.classList.remove('show');void el.offsetWidth;el.classList.add('show');break;}
  }}

/* ---- convidado: simulação local leve (predição + interpolação) ---- */
function guestAim(p){
  let target=p.aim;
  if(stickR.on&&stickR.mag>.2)target=Math.atan2(stickR.dy,stickR.dx);
  else if(mouse.active&&!isTouch)target=Math.atan2(mouse.wy-p.y,mouse.wx-p.x);
  else if(isTouch){target=p.aim;}
  else{let bd=1e9,bt=null;for(const e of enemies){const d=dist(e.x,e.y,p.x,p.y);if(d<bd&&d<760){bd=d;bt=e;}}
    const mi=moveInput();
    if(bt)target=Math.atan2(bt.y-p.y,bt.x-p.x);else if(mi.m>.1)target=Math.atan2(mi.y,mi.x);}
  return target;}
function guestDash(){
  const p=players[ME];
  if(scene!=='play'||!p||p.down||p.dashLeft>0||p.dashT>0)return;
  const mi=moveInput();
  p.dashAng=mi.m>.1?Math.atan2(mi.y,mi.x):p.aim;
  p.dashT=.19;p.dashLeft=p.dashCd;p.dashLock=.35;p.iFrame=Math.max(p.iFrame,.28);
  if(Net)Net.send({t:'dash',ang:p.dashAng});}
function predictMe(dt){
  const p=players[ME];
  p.dashLeft=Math.max(0,p.dashLeft-dt);p.dashLock=Math.max(0,(p.dashLock||0)-dt);
  p.iFrame=Math.max(0,p.iFrame-dt);p.hitPulse=Math.max(0,p.hitPulse-dt*2.6);p.orbA+=dt*2.3;
  if(p.down){p.vx*=Math.exp(-6*dt);p.vy*=Math.exp(-6*dt);p.x+=p.vx*dt;p.y+=p.vy*dt;return;}
  const mi=moveInput();
  if(p.dashT>0){p.dashT-=dt;p.vx=Math.cos(p.dashAng)*1180;p.vy=Math.sin(p.dashAng)*1180;trail.push({x:p.x,y:p.y,a:p.aim,l:.3,m:.3});}
  else{const acc=1-Math.exp(-15*dt);p.vx+=(mi.x*p.speed-p.vx)*acc;p.vy+=(mi.y*p.speed-p.vy)*acc;}
  p.x+=p.vx*dt;p.y+=p.vy*dt;
  const m=p.r+14;
  if(p.x<m){p.x=m;p.vx=Math.abs(p.vx)*.2;}if(p.x>world.w-m){p.x=world.w-m;p.vx=-Math.abs(p.vx)*.2;}
  if(p.y<m){p.y=m;p.vy=Math.abs(p.vy)*.2;}if(p.y>world.h-m){p.y=world.h-m;p.vy=-Math.abs(p.vy)*.2;}
  if(p.sx!==undefined){
    const ex=p.sx-p.x,ey=p.sy-p.y,ed=Math.hypot(ex,ey);
    if(ed>240){p.x=p.sx;p.y=p.sy;}
    else{const k=Math.min(1,(ed>70?6:1.2)*dt);p.x+=ex*k;p.y+=ey*k;}}
  const target=guestAim(p);p.aimT=target;p.aim=angLerp(p.aim,target,Math.min(1,26*dt));}
function guestStep(dt){
  const me=players[ME];if(!me)return;
  predictMe(dt);
  const al=clamp((performance.now()-snapT)/(snapDt*1000),0,1);
  for(const q of players){
    if(q===me||q.gone)continue;
    if(q._sx!==undefined){q.x=q._sx+(q._tx-q._sx)*al;q.y=q._sy+(q._ty-q._sy)*al;}
    q.iFrame=Math.max(0,q.iFrame-dt);q.hitPulse=Math.max(0,q.hitPulse-dt*2.6);q.orbA+=dt*2.3;
    if(q.dashT>0)trail.push({x:q.x,y:q.y,a:q.aim,l:.3,m:.3});}
  for(const e of enemies){
    e.t+=dt;e.flash=Math.max(0,(e.flash||0)-dt);
    e.x=e._sx+(e._tx-e._sx)*al;e.y=e._sy+(e._ty-e._sy)*al;
    if(e.segs)for(const g of e.segs){if(g._sx!==undefined){g.x=g._sx+(g._tx-g._sx)*al;g.y=g._sy+(g._ty-g._sy)*al;}}}
  for(const b of bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.l-=dt;}
  for(const b of ebullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.t+=dt;b.l-=dt;}
  const dg=Math.exp(-2.2*dt);
  for(const o of pickups){o.ph+=dt*3;o.l-=dt;o.vx*=dg;o.vy*=dg;o.x+=o.vx*dt;o.y+=o.vy*dt;}
  for(const t of teles)t.t-=dt;
  for(let i=trail.length-1;i>=0;i--){trail[i].l-=dt;if(trail[i].l<=0)trail.splice(i,1);}
  updateEffects(dt);
  if(cine){cine.t-=dt;if(cine.t<=0)cine=null;}
  if(hintT>0){hintT-=dt;if(hintT<=0)$('hint').classList.remove('on');}
  if(me.hp<=2&&!me.down){heartT-=dt;if(heartT<=0){heartT=1.15;Snd.beat();}}
  inAcc+=dt;
  if(inAcc>=.033){inAcc=0;const mi=moveInput();if(Net)Net.send({t:'in',mx:mi.x,my:mi.y,aim:me.aimT});}
  camUpdate(dt);}

/* ---- sair / desconexão ---- */
function leaveCoop(notify){
  if(notify&&Net&&Net.isOpen())Net.send({t:'bye'});
  if(Net)Net.close();
  coop=coopHost=coopGuest=false;coopWait=false;coopPaused=false;
  {const cm=$('coopMenu');if(cm)cm.classList.remove('on');}
  P=newPlayer(0);players=[P];ME=0;enemies=[];bullets=[];ebullets=[];beams=[];teles=[];pickups=[];nova=null;bossRef=null;cine=null;
  livesOn=false;renderLives();syncPartner();
  $('bossInfo').classList.remove('on');$('waveInfo').style.display='';
  coopStatusReset();
  seedMenuLife();theme=THEMES[0];bakeBG();go('menu');Music.playWeb('menu');}
function coopPartnerLeft(){
  if(!coop){coopStatusReset();coopRefresh();return;}
  if(coopHost){
    if(players[1])players[1].gone=true;picked[1]=true;
    toast('PARCEIRO DESCONECTOU · VOCÊ SEGUE SOLO');
    if(scene==='upgrade')tryCoopAdvance();
  }else{toast('A CONEXÃO COM O HOST FOI ENCERRADA');leaveCoop(false);}}
function toggleCoopMenu(){coopPaused=!coopPaused;$('coopMenu').classList.toggle('on',coopPaused);}
$('coopResume').addEventListener('click',()=>{Snd.click();toggleCoopMenu();});
$('coopLeave').addEventListener('click',()=>{Snd.click();leaveCoop(true);});

/* ---- mensagens ---- */
function onNetMsg(m){
  if(!m||!m.t)return;
  const role=Net.role();
  if(role==='host'){
    const q=players[1];
    switch(m.t){
      case 'in':if(coop&&q&&!q.gone)q.inp={mi:{x:+m.mx||0,y:+m.my||0,m:Math.min(1,Math.hypot(+m.mx||0,+m.my||0))},aim:(m.aim==null?null:+m.aim),t:performance.now()};break;
      case 'dash':if(coop&&q&&!q.gone)doDash(q,+m.ang);break;
      case 'nova':if(coop&&q&&!q.gone)doNova(q);break;
      case 'pick':if(coop&&scene==='upgrade'&&q&&!picked[1]){
        const u=(offersByP[1]||[])[m.i];
        if(u){const sv=P;P=q;u.ap(q);q.stacks[u.id]=(q.stacks[u.id]||0)+1;ring(q.x,q.y,10,190,.6,C.bio,4);burst(q.x,q.y,26,C.bio,220,.8);P=sv;}
        picked[1]=true;tryCoopAdvance();}break;
      case 'rr':if(coop&&scene==='upgrade'&&q&&!picked[1]&&q.rr>0){
        q.rr--;const sv=P;P=q;offersByP[1]=rollOffers();P=sv;
        Net.send({t:'upr',o:offersByP[1].map(u=>u.id),rr:q.rr});}break;
      case 'nm':peerName=cleanName(m.n);coopRefresh();break;
      case 'bye':coopPartnerLeft();break;
    }
    return;}
  switch(m.t){
    case 'nm':peerName=cleanName(m.n);coopRefresh();break;
    case 'hello':coopSet('coopWaitHost','CONECTADO · AGUARDANDO O HOST INICIAR O MERGULHO…');break;
    case 'full':coopSet('coopJoinStatus','Sala cheia.');Net.close();coopRefresh();break;
    case 'start':
      coop=true;coopGuest=true;coopHost=false;
      if(DIFF[m.diff])difficulty=m.diff;
      startDive(m.mode==='infinito'?'infinito':'campanha');break;
    case 's':
      if(coop&&scene==='play'&&players.length)applySnap(m);
      else if(coop&&scene==='dive'&&pendingSnaps.length<40)pendingSnaps.push(m);
      break;
    case 'up':
      if(!coop)break;
      offers=(m.o||[]).map(id=>UP.find(u=>u.id===id)).filter(Boolean);
      players[ME].rr=m.rr||0;wave=m.wave||wave;coopWait=false;
      go('upgrade');Music.playWeb('upgrade');renderCards();Snd.up();break;
    case 'upr':
      if(!coop||scene!=='upgrade')break;
      offers=(m.o||[]).map(id=>UP.find(u=>u.id===id)).filter(Boolean);
      players[ME].rr=m.rr||0;renderCards();break;
    case 'play':
      if(!coop)break;
      coopWait=false;go('play');syncHud(true);break;
    case 'over':
      if(!coop)break;
      wave=m.w;score=m.sc;kills=m.kl;plankton=m.pk;maxCombo=m.mc;runTime=m.rt;
      gameOver();break;
    case 'win':
      if(!coop)break;
      wave=m.w;score=m.sc;kills=m.kl;plankton=m.pk;maxCombo=m.mc;runTime=m.rt;
      winGame();break;
    case 'endless':
      if(!coop)break;
      endless=true;renderLives();go('play');syncHud(true);toast('MODO INFINITO ATIVADO');break;
    case 'bye':coopPartnerLeft();break;
  }}

/* ---- lobby ---- */
function coopSet(id,txt){const e=$(id);if(e)e.textContent=txt;}
function coopStatusReset(){
  peerName='';
  coopSet('coopHostStatus','Crie uma sala e passe o código para o seu parceiro.');
  coopSet('coopJoinStatus','Digite o código que o host recebeu.');
  coopSet('coopWaitHost','CONECTADO · AGUARDANDO O HOST INICIAR O MERGULHO…');
  coopSet('coopPing','');}
function coopRefresh(){
  const c=$('coopCreate');if(!c)return;
  const role=Net?Net.role():null,open=!!(Net&&Net.isOpen());
  c.disabled=!!role;$('coopJoin').disabled=!!role;$('coopInput').disabled=!!role;
  $('coopCodeBox').style.display=(role==='host'&&Net.code())?'flex':'none';
  if(role==='host'&&Net.code())coopSet('coopCode',Net.code());
  $('coopLobby').style.display=open?'flex':'none';
  coopSet('coopPeerName',open?('PARCEIRO CONECTADO'+(peerName?': '+peerName:'')):'');
  $('coopStart').style.display=(open&&role==='host')?'':'none';
  $('coopWaitHost').style.display=(open&&role==='guest')?'':'none';
  $('coopCancel').style.display=(role&&!open)?'':'none';
  const m=mode==='treino'?'CAMPANHA':mode.toUpperCase();
  coopSet('coopInfo','Modo: '+m+' · Dificuldade: '+DIFF[difficulty].label+' (definidos no menu principal pelo host). Cada jogador escolhe suas melhorias; as 3 vidas são da dupla.');}
function openCoopMenu(){backTo='menu';if(!Net||!Net.available()){}go('coop');}
function coopBack(){Snd.click();if(Net)Net.close();coop=coopHost=coopGuest=false;coopStatusReset();go('menu');}
function hostStartRun(){
  if(!Net||!Net.isOpen())return;
  const m=mode==='infinito'?'infinito':'campanha';
  coop=true;coopHost=true;coopGuest=false;
  Net.send({t:'start',mode:m,diff:difficulty});
  startDive(m);}
function coopError(e){
  if(Net&&Net.isOpen()&&coop)return;
  const t=e&&e.type,role=Net?Net.role():null;
  let msg='Erro de conexão. Tente novamente.';
  if(t==='peer-unavailable')msg='Sala não encontrada. Confira o código.';
  else if(t==='bad-code')msg='Digite o código completo da sala.';
  else if(t==='timeout')msg='Não foi possível conectar ao parceiro (tempo esgotado). A rede pode bloquear conexões diretas.';
  else if(t==='lib')msg='Não foi possível usar o modo online. Verifique a internet.';
  else if(t==='network'||t==='server-error'||t==='socket-error'||t==='socket-closed')msg='Sem acesso ao servidor de salas. Verifique a internet.';
  else if(t==='browser-incompatible')msg='Este navegador não suporta conexão em tempo real.';
  coopSet(role==='guest'?'coopJoinStatus':'coopHostStatus',msg);
  if(Net)Net.close();coopRefresh();}
if(Net){
  Net.on('room',c=>{coopSet('coopHostStatus','Sala criada! Passe o código acima para o parceiro e aguarde.');coopRefresh();});
  Net.on('open',()=>{
    if(Net.role()==='host'){coopSet('coopHostStatus','PARCEIRO CONECTADO!');Net.send({t:'hello'});}
    else coopSet('coopJoinStatus','Conectado à sala!');
    Net.send({t:'nm',n:myName});
    coopRefresh();});
  Net.on('msg',onNetMsg);
  Net.on('ping',r=>{coopSet('coopPing','latência: '+r+' ms');});
  Net.on('close',()=>{if(coop)coopPartnerLeft();else{coopStatusReset();coopRefresh();}});
  Net.on('error',coopError);}
{const ni=$('coopName');
  ni.value=myName;
  ni.addEventListener('input',()=>{ni.value=ni.value.toUpperCase().slice(0,12);myName=cleanName(ni.value);store.set('playerName',myName);});
  ni.addEventListener('blur',()=>{ni.value=myName;});}
$('coopCreate').addEventListener('click',()=>{
  Snd.init();Snd.resume();Snd.click();
  if(!Net||!Net.available()){coopSet('coopHostStatus','Não foi possível usar o modo online. Verifique a internet.');return;}
  coopSet('coopHostStatus','Criando sala…');Net.host();coopRefresh();});
$('coopJoin').addEventListener('click',()=>{
  Snd.init();Snd.resume();Snd.click();
  if(!Net||!Net.available()){coopSet('coopJoinStatus','Não foi possível usar o modo online. Verifique a internet.');return;}
  coopSet('coopJoinStatus','Conectando…');Net.join($('coopInput').value);coopRefresh();});
$('coopInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('coopJoin').click();});
$('coopInput').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5);});
$('coopStart').addEventListener('click',()=>{Snd.click();hostStartRun();});
$('coopCancel').addEventListener('click',()=>{Snd.click();if(Net)Net.close();coopStatusReset();coopRefresh();});
$('coopBack').addEventListener('click',coopBack);
$('coopCopy').addEventListener('click',()=>{const c=Net&&Net.code();if(!c)return;
  try{navigator.clipboard.writeText(c);coopSet('coopHostStatus','Código copiado!');}catch(e){}Snd.click();});

/* ============================================================
   18 · LOOP ÚNICO
   ============================================================ */
const BOOTSTEPS=['CALIBRANDO SONAR','TECENDO BIOLUMINESCÊNCIA','MAPEANDO A FOSSA','SEMEANDO PLÂNCTON','CATALOGANDO ESPÉCIMES','PRESSURIZANDO CÁPSULA','SISTEMAS PRONTOS'];
let last=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  if(MOBILE&&now-last<14.5)return;
  let rdt=(now-last)/1000;last=now;
  if(!(rdt>0))rdt=.016;if(rdt>.05)rdt=.05;
  perf.avg=perf.avg*.94+rdt*1000*.06;
  perf.q=MOBILE?(perf.avg>21?.55:(perf.avg<17.5?1:perf.q)):(perf.avg>27?.55:(perf.avg<20?1:perf.q));
  T+=rdt;Snd.tick();Music.update(rdt);
  for(let i=timers.length-1;i>=0;i--){timers[i].t-=rdt;if(timers[i].t<=0){const f=timers[i].fn;timers.splice(i,1);f();}}
  if(slowT>0){slowT-=rdt;if(slowT<=0)tsTarget=1;}
  ts+=(tsTarget-ts)*Math.min(1,rdt*9);
  mouse.wx=(mouse.x-cam.ox)/zoom+cam.x;mouse.wy=(mouse.y-cam.oy)/zoom+cam.y;
  if(scene==='boot'){
    bootSeq.t+=rdt;
    const target=Math.min(BOOTSTEPS.length-1,Math.floor(bootSeq.t/.28));
    if(target>bootSeq.i){
      bootSeq.i=target;
      if(bootSeq.i===1)Object.keys(C).forEach(k=>glow(C[k]));
      if(bootSeq.i===2){bakeBG();seedScenery();}
      if(bootSeq.i===3)seedAmbient();
      if(bootSeq.i===4)seedMenuLife();
      const pct=Math.round(bootSeq.i/(BOOTSTEPS.length-1)*100);
      $('bootBar').style.width=pct+'%';$('bootPct').textContent=pct+'%';$('bootLog').textContent=BOOTSTEPS[bootSeq.i];
      $('bootDepth').textContent=fmt(bootSeq.i*2450);
      if(bootSeq.i>=BOOTSTEPS.length-1&&!bootSeq.done){bootSeq.done=true;$('bootPrompt').classList.add('on');}
    }
    updateMenuLife(rdt);updateEffects(rdt*.5);
    const vw=view.w/zoom,vh=view.h/zoom;
    cam.x=clamp(world.w/2-vw/2+Math.sin(T*.07)*120,0,Math.max(0,world.w-vw));
    cam.y=clamp(world.h/2-vh/2+Math.cos(T*.05)*90,0,Math.max(0,world.h-vh));
    cam.ox=cam.oy=0;
  }else if(scene==='dive'&&diveSeq){
    diveSeq.t+=rdt;
    const k=clamp(diveSeq.t/diveSeq.dur,0,1);
    $('diveDepth').textContent=fmt(k*(diveSeq.mode==='treino'?600:2040))+' m';
    updateEffects(rdt);updateMenuLife(rdt);
    if(k>=1)beginRun(diveSeq.mode);
  }else if(scene==='play'){
    let dt=rdt*speedSetting*ts;
    if(coop){dt=rdt;freeze=0;}
    if(freeze>0){freeze-=rdt;dt=0;}
    if(coopGuest){guestStep(rdt);}
    else{
      if(dt>0)update(dt);else camUpdate(rdt*.2);
      if(coopHost)hostNetTick(rdt);}
    syncHud(false);
  }else{
    updateEffects(rdt*.5);
    if(scene==='menu'||scene==='coop'||scene==='howto'||scene==='bestiary'||scene==='records'||scene==='settings'){
      updateMenuLife(rdt);
      const vw=view.w/zoom,vh=view.h/zoom;
      const cx=world.w<=vw?(world.w-vw)/2:clamp(world.w/2-vw/2+Math.sin(T*.06)*130,0,world.w-vw);
      const cy=world.h<=vh?(world.h-vh)/2:clamp(world.h/2-vh/2+Math.cos(T*.045)*95,0,world.h-vh);
      cam.x+=(cx-cam.x)*Math.min(1,rdt*1.2);cam.y+=(cy-cam.y)*Math.min(1,rdt*1.2);
      cam.ox=cam.oy=0;}
  }
  try{render();}catch(err){cv.width=cv.width;window.__err('render: '+err.message);}
  if(scene==='howto'&&howtoDemo)paintAux(howtoDemo,rdt,{x:0,y:0});
  if(scene==='bestiary')beastAux.forEach(o=>paintAux(o,rdt,{x:-200,y:0}));
}

/* ============================================================
   19 · BOOT
   ============================================================ */
resize();
P=newPlayer();players=[P];
seedMenuLife();
buildHowto();buildSettings();syncDiffUI();syncModeCards();syncMenuRecords();syncAudioUI();syncSpeedUI();
stage.dataset.motion=SET.motion?'off':'on';
if(isTouch){$('tBtns').style.display='flex';}
buildDepthGauge();
go('boot');
$('bootBar').style.width='4%';
requestAnimationFrame(frame);
window.addEventListener('pointerdown',()=>{Snd.init();Snd.resume();},{once:true});
})();
