import assert from 'node:assert/strict';
import {ArcadeAudio,SOUND_PRESETS,soundProfile} from '../vpx/arcade-audio.js';
assert.ok(Object.keys(SOUND_PRESETS).length>=20,'distinct arcade sounds available');
for(const event of ['flipperHit','launch','bumper','sling','target','falling','drain',
  'missionStart','missionStage','missionComplete','extraBall','rank','skillShot',
  'jackpot','ballLocked','autoPlunge','multiball','gameOver','gateOpen','gateBlock']){
  assert.ok(soundProfile(event),event);
}
assert.equal(soundProfile('unknown'),null);
const param=()=>({
  value:0,setValueAtTime(){},linearRampToValueAtTime(){},
  exponentialRampToValueAtTime(){},setTargetAtTime(){}
});
const node=()=>({
  connect(){},disconnect(){},start(){},stop(){},frequency:param(),gain:param()
});
let createCount=0,resumes=0,closed=0,time=1000,oscCount=0;
function context(){
  createCount++;
  const ctx={
    state:'suspended',currentTime:0,sampleRate:44100,destination:node(),
    async resume(){resumes++;this.state='running';},
    async close(){closed++;this.state='closed';},
    createOscillator(){oscCount++;return {...node(),type:'sine',onended:null};},
    createBufferSource(){return {...node(),buffer:null,onended:null};},
    createBuffer(ch,len){return {getChannelData(){return new Float32Array(len);}};},
    createBiquadFilter(){return {...node(),frequency:param(),type:'lowpass'};},
    createGain(){return {...node(),gain:param()};},
    createDynamicsCompressor(){return {...node(),threshold:param(),knee:param(),
      ratio:param(),attack:param(),release:param()};}
  };return ctx;
}
const engine=new ArcadeAudio({createContext:context,clock:()=>time,volume:.45});
assert.equal(engine.play('launch'),false,'no auto-play before a gesture');
assert.equal(createCount,0,'no AudioContext constructed on page load');
assert.equal(await engine.unlock(),true);
assert.equal(createCount,1);assert.equal(resumes,1);
assert.equal(engine.play('launch'),true);
assert.ok(oscCount>=2);
assert.equal(engine.play('launch'),false,'rapid duplicate impacts are throttled');
time+=120;
assert.equal(engine.play('launch'),true);
engine.setVolume(.8);assert.equal(engine.volume,.8);
engine.setEnabled(false);
assert.equal(engine.play('bumper'),false);
engine.setEnabled(true);
time+=150;
assert.equal(engine.play('bumper'),true);
engine.destroy();
assert.equal(closed,1);
console.log('PASS synthesized audio: 20+ distinct cues, user-gesture unlock, voice generation, mute/volume, event throttle and shutdown');
