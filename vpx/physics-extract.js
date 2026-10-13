/**
 * Read authoritative VPX collision primitives from the Rust/WASM-extracted
 * table. Only local VPX content is processed. No VBScript is executed.
 *
 * VPX is in imperial Visual Pinball units. glTF export is Y-up with
 * 1 VP unit = .00053975 meters (20" / 1000 VP units).
 * In the horizontal plane, VPX (x,y) => GLTF (x,z).
 */
export const VP_TO_METERS = 0.00053975;
const S=VP_TO_METERS;
const isFiniteNumber=n=>typeof n==="number"&&Number.isFinite(n);
const number=(v,defaultValue=0)=>isFiniteNumber(v)?v:defaultValue;
function point(o){return [number(o?.x)*S,number(o?.y)*S];}
function verts(points){return (points||[]).filter(p=>isFiniteNumber(p.x)&&isFiniteNumber(p.y)).map(point);}
function bounds(points){
  let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
  for(const [x,z] of points){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
  return [minX,minZ,maxX,maxZ];
}
const parse=(bytes)=>JSON.parse(new TextDecoder().decode(bytes));
const defaults=(o)=>({
  restitution:Math.max(.05,Math.min(1.25,number(o.elasticity,.6))),
  friction:Math.max(0,Math.min(1,number(o.friction,.2))),
  material:o.physics_material||o.material||"",
});
export function extractVPXPhysics(files){
  const geo={
    version:1,unit:S,
    segments:[],circles:[],flippers:[],triggers:[],kickers:[],ramps:[],
    stats:{objects:0,omitted:0},
  };
  for(const [path,bytes] of Object.entries(files)){
    if(!path.startsWith("/vpx/gameitems/")||!path.endsWith(".json"))continue;
    const m=path.match(/\/gameitems\/([A-Za-z]+)\.[^/]+\.json$/);
    if(!m)continue;
    const type=m[1],o=parse(bytes)?.[type];
    if(!o||!o.name)continue;
    geo.stats.objects++;
    if((type==="Wall"||type==="Rubber"||type==="Ramp")&&o.is_collidable){
      const pts=verts(o.drag_points);
      if(pts.length<2)continue;
      const props=defaults(o),bottom=number(o.height_bottom,type==="Rubber"?o.height:0)*S;
      const top=number(o.height_top,type==="Rubber"?o.height+o.hit_height:50)*S;
      if(type==="Ramp"){
        // Preserve raised ramp height. The 2D solver may only collide at
        // the ground level; the elevated surface is handled separately.
        geo.ramps.push({name:o.name,points:pts,bottom,top,
          width:Math.max(0,number(o.width_bottom,20)*S),...props});
      }else{
        geo.segments.push({name:o.name,type,points:pts,closed:true,
          bottom:Math.min(bottom,top),top:Math.max(bottom,top),
          slingshot:!!(o.physics_material||"").toLowerCase().includes("slingshot"),
          ...props});
      }
      continue;
    }
    if(type==="Bumper"&&o.is_collidable){
      geo.circles.push({name:o.name,type,x:point(o.center)[0],z:point(o.center)[1],
        radius:number(o.radius,35)*S,bottom:0,top:number(o.height_scale,90)*S,
        force:number(o.force,15)*S*15,...defaults(o)});
    }else if(type==="HitTarget"&&o.is_collidable){
      const center=point(o.position),w=number(o.size?.x,30)*S*.48,angle=number(o.rot_z)*Math.PI/180;
      // Hit target is a thin wall oriented with the original VPX rot_z.
      const dx=Math.cos(angle)*w,dz=Math.sin(angle)*w;
      geo.segments.push({name:o.name,type,points:[
        [center[0]-dx,center[1]-dz],[center[0]+dx,center[1]+dz]
      ],closed:false,bottom:0,top:number(o.size?.z,32)*S,...defaults(o)});
    }else if(type==="Flipper"&&o.is_enabled&&/^LeftFlipper$|^RightFlipper$/i.test(o.name)){
      const [x,z]=point(o.center);
      geo.flippers.push({name:o.name,x,z,
        baseRadius:number(o.base_radius,20)*S,
        endRadius:number(o.end_radius,12)*S,
        length:number(o.flipper_radius_max,115)*S,
        start:number(o.start_angle,0)*Math.PI/180,
        end:number(o.end_angle,0)*Math.PI/180,
        // VPX FlipperMoverObject motor/mass values from original table:
        strength:number(o.strength,3600),mass:number(o.mass,1),
        returnRatio:number(o.return,.04),rampUp:number(o.ramp_up,1),
        torqueDamping:number(o.torque_damping,1),
        torqueDampingAngle:number(o.torque_damping_angle,0)*Math.PI/180,
        falloff:number(o.elasticity_falloff,.5),
        ...defaults(o)});
    }else if(type==="Kicker"&&o.is_enabled){
      const [x,z]=point(o.center);
      geo.kickers.push({name:o.name,x,z,radius:number(o.radius,25)*S,
        fallThrough:!!o.fall_through});
    }else if(type==="Trigger"&&o.is_enabled&&!/^(?:Gravity|swPlunger)/i.test(o.name)){
      const [x,z]=point(o.center),pts=verts(o.drag_points);
      geo.triggers.push({name:o.name,x,z,radius:number(o.radius,25)*S,
        points:pts});
    }else if(type==="Gate"&&o.is_collidable){
      const [x,z]=point(o.center),r=number(o.length,50)*S/2,a=number(o.rotation)*Math.PI/180;
      geo.segments.push({name:o.name,type,points:[[x-Math.cos(a)*r,z-Math.sin(a)*r],
        [x+Math.cos(a)*r,z+Math.sin(a)*r]],closed:false,
        bottom:0,top:number(o.height,60)*S,twoWay:!!o.two_way,...defaults(o)});
    }
  }
  return geo;
}
