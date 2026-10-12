/**
 * Procedural Space Cadet arcade soundtrack/SFX.
 * No extracted VPX sound recordings or copyrighted music.
 * A WebAudio AudioContext is created/resumed ONLY from a user gesture.
 */
export const SOUND_PRESETS=Object.freeze({
  flipperHit:{notes:[[138,92,.043,0,"square",.13]],noise:.12},
  launch:{notes:[[120,320,.26,0,"sawtooth",.22],[460,800,.13,.05,"sine",.13]],noise:.08},
  bumper:{notes:[[360,730,.115,0,"triangle",.27],[1150,770,.05,0,"sine",.06]]},
  sling:{notes:[[280,510,.090,0,"square",.12]],noise:.20},
  target:{notes:[[740,410,.090,0,"triangle",.17]],noise:.09},
  gateOpen:{notes:[[400,150,.062,0,"triangle",.12]],noise:.05},
  gateBlock:{notes:[[180,120,.08,0,"triangle",.11]],noise:.14},
  rampLand:{notes:[[210,170,.095,0,"triangle",.14]],noise:.12},
  rampRail:{notes:[[900,520,.050,0,"sine",.065]],noise:.08},
  rampExit:{notes:[[280,350,.085,0,"triangle",.095]]},
  ballBounce:{notes:[[185,130,.074,0,"sine",.12]],noise:.10},
  spinner:{notes:[[600,800,.07,0,"sine",.11]]},
  falling:{notes:[[380,90,.32,0,"triangle",.20]],noise:.11},
  drain:{notes:[[180,85,.28,0,"sawtooth",.13]]},
  save:{notes:[[470,740,.13,0,"triangle",.17],[740,980,.16,.12,"triangle",.16]]},
  missionStart:{notes:[[392,392,.12,0,"triangle",.13],[523,523,.13,.11,"triangle",.16],[659,659,.19,.23,"sine",.18]]},
  missionStage:{notes:[[440,500,.10,0,"triangle",.13],[660,740,.17,.10,"triangle",.16]]},
  missionComplete:{notes:[[392,392,.15,0,"triangle",.13],[494,494,.14,.14,"triangle",.13],
    [587,587,.14,.28,"triangle",.16],[784,784,.36,.42,"sine",.19]]},
  missionAbort:{notes:[[390,320,.19,0,"sawtooth",.10],[315,195,.22,.18,"sine",.13]]},
  extraBall:{notes:[[523,523,.14,0,"triangle",.15],[659,659,.14,.14,"triangle",.15],
    [784,784,.14,.28,"triangle",.15],[1046,1046,.26,.42,"triangle",.2]]},
  rank:{notes:[[392,440,.15,0,"triangle",.14],[494,588,.15,.14,"triangle",.16],
    [659,784,.25,.28,"triangle",.18],[988,1174,.34,.51,"sine",.18]]},
  skillShot:{notes:[[880,1320,.16,0,"square",.13],[1320,1760,.18,.13,"sine",.13]]},
  jackpot:{notes:[[329,523,.16,0,"triangle",.17],[523,784,.16,.15,"triangle",.18],
    [784,1046,.30,.30,"triangle",.20]]},
  ballLocked:{notes:[[630,390,.15,0,"triangle",.19]],noise:.09},
  autoPlunge:{notes:[[220,540,.18,0,"sawtooth",.16]],noise:.10},
  multiball:{notes:[[261,392,.18,0,"triangle",.15],[329,523,.18,.16,"triangle",.17],
    [392,659,.18,.32,"triangle",.17],[523,880,.46,.48,"sawtooth",.17]]},
  gameOver:{notes:[[392,330,.22,0,"sine",.13],[330,294,.22,.22,"sine",.13],
    [294,196,.58,.44,"triangle",.16]]},
  ballSearch:{notes:[[300,200,.09,0,"triangle",.10]]},
});
const limit=(x,a,b)=>Math.max(a,Math.min(b,x));
const aliases=Object.freeze({wormhole:"ballLocked",flipper:"flipperHit",slingHit:"sling"});
export function soundProfile(type){return SOUND_PRESETS[type]||SOUND_PRESETS[aliases[type]]||null;}
export class ArcadeAudio{
  constructor(options={}){
    this.createContext=options.createContext||(()=>new (window.AudioContext||window.webkitAudioContext)());
    this.clock=options.clock||(()=>performance.now());
    this.context=null;this.master=null;this.noiseBuffer=null;
    this.enabled=options.enabled!==false;
    this.volume=limit(Number(options.volume??.4),0,1);
    this.lastPlayed=new Map();
    this.unlocking=null;
  }
  async unlock(){
    if(!this.enabled)return false;
    if(!this.context){
      try{
        const ctx=this.createContext();
        this.context=ctx;
        const master=ctx.createGain();master.gain.value=this.volume*.48;
        // Keep dense multi-ball contacts from clipping.
        const compressor=ctx.createDynamicsCompressor();
        compressor.threshold.value=-18;compressor.knee.value=12;
        compressor.ratio.value=4;compressor.attack.value=.003;
        compressor.release.value=.1;
        master.connect(compressor);compressor.connect(ctx.destination);
        this.master=master;
      }catch(_){this.enabled=false;return false;}
    }
    if(this.context.state==="running")return true;
    if(!this.unlocking){
      this.unlocking=Promise.resolve(this.context.resume())
        .then(()=>this.context.state==="running").catch(()=>false)
        .finally(()=>{this.unlocking=null;});
    }
    return this.unlocking;
  }
  setVolume(value){
    this.volume=limit(Number(value)||0,0,1);
    if(this.master)this.master.gain.setTargetAtTime(this.volume*.48,
      this.context.currentTime,.016);
  }
  setEnabled(value){
    this.enabled=!!value;
    if(this.master)this.master.gain.setTargetAtTime(this.enabled?this.volume*.48:0,
      this.context.currentTime,.015);
  }
  noise(){
    if(this.noiseBuffer)return this.noiseBuffer;
    const ctx=this.context,count=Math.ceil(ctx.sampleRate*.09),
      buffer=ctx.createBuffer(1,count,ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<count;i++)data[i]=Math.random()*2-1;
    this.noiseBuffer=buffer;
    return buffer;
  }
  tone(from,to,duration,delay,type,level){
    const ctx=this.context,t=ctx.currentTime+delay,osc=ctx.createOscillator(),
      filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    osc.type=type;
    osc.frequency.setValueAtTime(Math.max(35,from),t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(35,to),t+duration);
    filter.type="lowpass";filter.frequency.value=type==="square"?1750:3200;
    gain.gain.setValueAtTime(.00001,t);
    gain.gain.linearRampToValueAtTime(level,t+.007);
    gain.gain.exponentialRampToValueAtTime(.00001,t+duration);
    osc.connect(filter);filter.connect(gain);gain.connect(this.master);
    osc.start(t);osc.stop(t+duration+.008);
    osc.onended=()=>{osc.disconnect();filter.disconnect();gain.disconnect();};
  }
  impact(amount){
    const ctx=this.context,t=ctx.currentTime,
      source=ctx.createBufferSource(),highpass=ctx.createBiquadFilter(),
      gain=ctx.createGain();
    source.buffer=this.noise();
    highpass.type="highpass";highpass.frequency.value=650;
    gain.gain.setValueAtTime(amount*.22,t);
    gain.gain.exponentialRampToValueAtTime(.0001,t+.052);
    source.connect(highpass);highpass.connect(gain);gain.connect(this.master);
    source.start(t);source.stop(t+.07);
    source.onended=()=>{source.disconnect();highpass.disconnect();gain.disconnect();};
  }
  play(type){
    if(!this.enabled||!this.context||this.context.state!=="running")return false;
    const profile=soundProfile(type);if(!profile)return false;
    const now=this.clock(),last=this.lastPlayed.get(type)??-Infinity;
    // Protect against hundreds of physics contacts/sec. Chimes can be longer.
    const cooldown=type==="bumper"||type==="target"?55:
      type==="flipperHit"||type==="sling"?35:100;
    if(now-last<cooldown)return false;
    this.lastPlayed.set(type,now);
    for(const note of profile.notes)this.tone(...note);
    if(profile.noise)this.impact(profile.noise);
    return true;
  }
  destroy(){
    this.enabled=false;this.lastPlayed.clear();
    const ctx=this.context;this.context=null;this.master=null;
    if(ctx)ctx.close().catch(()=>{});
  }
}
