import assert from 'node:assert/strict';
import {VPXCollisionWorld} from '../vpx/collision-world.js';
const data={version:1,segments:[{
 name:'Gate006',type:'Gate',closed:false,points:[[.1,.2],[.2,.2]],
 bottom:0,top:.03,twoWay:false,restitution:.55,
}],circles:[],flippers:[],triggers:[],kickers:[],ramps:[]};
const g=new VPXCollisionWorld(data);
assert.equal(g.gates.length,1);
assert.equal(g.edges.length,0,'one-way gate cannot be an always-closed wall');
const events=[];
const game={elapsed:1,send:(type,event)=>events.push({type,...event})};
const towardOpen={id:1,x:.15,z:.21,vx:0,vz:-.5,r:.0122};
const oldVz=towardOpen.vz;
g.solveGates(towardOpen,game);
assert.equal(towardOpen.vz,oldVz,'gate must open for pass direction');
assert.ok(g.gateStates.get('Gate006').angle>0);
assert.ok(events.some(x=>x.type==='gateOpen'));
game.elapsed+=1;
g.updateGates(1,game.elapsed);
assert.equal(g.gateStates.get('Gate006').angle,0);
const blocked={id:2,x:.15,z:.19,vx:0,vz:.5,r:.0122};
g.solveGates(blocked,game);
assert.ok(blocked.vz<=0,'gate must bounce from blocked side');
assert.ok(events.some(x=>x.type==='gateBlock'));
g.reset();
assert.equal(g.gateStates.get('Gate006').angle,0);
console.log('PASS: VPX one-way hinge opens and resets, blocks reverse hits; no phantom static gate wall');
