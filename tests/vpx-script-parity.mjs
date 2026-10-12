import assert from "node:assert/strict";
import fs from "node:fs";
import {CadetGame} from "../vpx/gameplay.js";
import {MISSIONS,MISSION_RULES,missionTier,stageMatches,RANKS} from "../vpx/original-rules.js";
const vbs=fs.readFileSync("assets/vpx-local/source-script.vbs","utf8");
for(const label of ["Sub PrepareForMission","Sub CheckMissionTargets(n)",
 "Sub AcceptMission(n)","Sub CheckMission ","Sub Trigger030_Hit",
 "Sub Trigger028_Hit","Sub Trigger029_Hit",
 "Sub Wormhole1_Hit","Sub StartWormholeMultiball"]){
  assert.ok(vbs.includes(label),"Local JP v4.3 table script has "+label);
}
assert.equal(MISSIONS.length,5);assert.equal(RANKS.length,9);
const rows=[];
for(let rank=0;rank<=8;rank++){
  for(let choice=0;choice<4;choice++){
    const game=new CadetGame();
    game.rank=rank;game.selectMission(choice);
    const name=MISSIONS[missionTier(rank)][choice],rule=MISSION_RULES[name];
    assert.ok(rule,"Missing original VPX mission "+name);
    assert.equal(game.choiceName(),name);
    assert.ok(game.beginMission());
    assert.equal(game.mission.name,name);
    assert.equal(game.missionGoal,rule.stages[0].goal);
    assert.equal(game.score,rule.accept);
    for(const [stageIndex,stage] of rule.stages.entries()){
      assert.equal(game.mission.stage,stageIndex,"Wrong stage of "+name);
      assert.ok(stage.description.length);
      for(let hit=0;hit<stage.goal;hit++){
        const name=stage.names?.[0]||"";
        const kind=stage.type==="rampOrHyper"?"ramp":stage.type;
        assert.equal(stageMatches(stage,kind,name),true);
        assert.equal(game.progressMission(kind,name),true);
      }
    }
    assert.equal(game.mission,null,"Completing all stages closes "+name);
    assert.ok(game.score>=rule.accept+rule.award,
      "Mission completion awards its original VPX score for "+name);
    assert.ok(game.progress===rule.progress||game.rank>rank||
      (rank===8&&game.rank===8&&game.progress===0),
      "Mission awards original progress lights or promotes rank: "+name+" rank "+rank);
    rows.push({rank,choice,name,stages:rule.stages.length,
      award:rule.award,progress:rule.progress});
  }
}
assert.equal(rows.length,36);
assert.equal(new Set(rows.map(r=>r.name)).size,17);
console.log("PASS: 36 rank/mission selections cover 17 original JP v4.3 mission rule sets, all stage transitions and award/progress values.");
console.log("Stages:",Object.entries(MISSION_RULES).map(([name,rule])=>name+"="+rule.stages.length).join(", "));
