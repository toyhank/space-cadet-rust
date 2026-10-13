// SPDX-License-Identifier: GPL-3.0-or-later
// Isolated portable adaptation of VPX LineSeg::HitTestBasic (collide.cpp) and
// HitBall::Collide3DWall (hitball.cpp), from vpinball/vpinball (GPLv3+).
// Not the full VPX engine: line contacts, linear restitution falloff, Coulomb
// friction/spin, no point/triangle/flipper continuous collision yet.
// All public arguments and result values use GLB METERS and SECONDS;
// internally use native VPX units (VPU and 10ms VPT) for hit-time thresholds.
// Last verified upstream layout: vpinball/vpinball master, 2026-10-13.

#define EXPORTED __attribute__((visibility("default")))
static constexpr float UNIT = 0.00053975f;
static constexpr float VPT = .01f;
static constexpr float C_LOWNORMVEL = .0001f;
static constexpr float C_CONTACTVEL = .099f;
static constexpr float PHYS_TOUCH = .05f;
static constexpr float C_TOL_ENDPNTS = 0.f;
static constexpr float DISP_GAIN = .9875f;
static constexpr float DISP_LIMIT = 5.f;
static float result[12];
static inline float absf(float x){return __builtin_fabsf(x);}
static inline float sqr(float x){return x*x;}
static inline float minf(float x,float y){return x<y?x:y;}
static inline float maxf(float x,float y){return x>y?x:y;}
static inline float clampf(float x,float low,float high){return maxf(low,minf(x,high));}
static inline float sqrtr(float x){return __builtin_sqrtf(x);}

extern "C" EXPORTED float* vpx_out(){return result;}
extern "C" EXPORTED int vpx_version(){return 2;}

// Maps VPX LineSeg::HitTestBasic to a freestanding function without
// VPX's Windows/COM dependencies. Both-sided optional for our unsided
// polygon mesh until the original VPX hit normals can be exported.
extern "C" EXPORTED float vpx_line_toi(
    float x,float z,float y,float vx,float vz,float vy,float radius,
    float ax,float az,float bx,float bz,float bottom,float top,
    float deltaTime,int twoSided){
  result[0]=-1.f;result[1]=result[2]=result[3]=0.f;
  if(deltaTime<=0.f||radius<=0.f)return -1.f;
  const float scale=1.f/UNIT;
  x*=scale;z*=scale;y*=scale;
  vx*=scale*VPT;vz*=scale*VPT;vy*=scale*VPT;
  radius*=scale;ax*=scale;az*=scale;bx*=scale;bz*=scale;
  bottom*=scale;top*=scale;
  const float timeStep=deltaTime/VPT;
  const float dx=ax-bx,dz=az-bz;
  const float lineLen=sqrtr(dx*dx+dz*dz);
  if(lineLen<=.0001f)return -1.f;
  float nx=dz/lineLen,nz=-dx/lineLen;
  float bcpd=(x-ax)*nx+(z-az)*nz;
  // Original VPX LineSeg collides only from its normal face. The current
  // VPX JSON conversion has no reliable face winding for every Wall.
  if(twoSided&&bcpd<0.f){nx=-nx;nz=-nz;bcpd=-bcpd;}
  const float bnv=vx*nx+vz*nz;
  if(bnv>C_LOWNORMVEL)return -1.f; // moving away
  const float bnd=bcpd-radius;
  float hitTime;
  if(bnd<-radius)return -1.f; // excessive embedding
  if(bnd<=PHYS_TOUCH){
    // FIX_PHYSICS enables immediate contact in VPX's thin skin layer.
    hitTime=0.f;
  }else if(absf(bnv)>C_LOWNORMVEL){
    hitTime=bnd/-bnv;
  }else return -1.f;
  if(!(hitTime>=0.f&&hitTime<=timeStep))return -1.f;
  const float btv=vx*nz-vz*nx;
  const float btd=(x-ax)*nz-(z-az)*nx+btv*hitTime;
  if(btd < -C_TOL_ENDPNTS || btd > lineLen+C_TOL_ENDPNTS)return -1.f;
  const float hitY=y+vy*hitTime;
  if(hitY+radius*.5f<bottom||hitY-radius*.5f>top)return -1.f;
  result[0]=hitTime*VPT;
  result[1]=nx;result[2]=nz;
  result[3]=bnd*UNIT;
  result[4]=(absf(bnv)<=C_CONTACTVEL && bnd<=PHYS_TOUCH)?1.f:0.f;
  return result[0];
}

static inline void cross(float ax,float ay,float az,float bx,float by,float bz,
                         float& ox,float& oy,float& oz){
  ox=ay*bz-az*by;oy=az*bx-ax*bz;oz=ax*by-ay*bx;
}
// Isolated VPX HitBall::Collide3DWall normal impact & Coulomb friction/spin.
// Output result[0..5] = vx,vz,vy,wx,wy,wz in GLB meters / second units.
// scatter disabled (nondeterministic and table specific) and fixed mass=1.
extern "C" EXPORTED void vpx_wall_bounce(
    float vx,float vz,float vy,float wx,float wy,float wz,
    float nx,float nz,float ny,float radius,
    float elasticity,float falloff,float friction,float penetration){
  if(radius<=0.f){result[0]=vx;result[1]=vz;result[2]=vy;return;}
  const float dot=vx*nx+vz*nz+vy*ny;
  const float lowNorm=C_LOWNORMVEL*UNIT/VPT;
  if(dot>=-lowNorm){
    result[0]=vx;result[1]=vz;result[2]=vy;
    result[3]=wx;result[4]=wy;result[5]=wz;return;
  }
  // VPX elasticity falloff is expressed with impact velocity in VPU/VPT.
  const float vpSpeed=absf(dot)/UNIT*VPT;
  if(falloff>0.f)elasticity=elasticity/(1.f+falloff*vpSpeed*(1.f/18.53f));
  const float impulse=-(1.f+elasticity)*dot;
  vx+=impulse*nx;vz+=impulse*nz;vy+=impulse*ny;
  // Coulomb impulse at the ball surface, moment of inertia I=2/5 mr^2.
  const float rx=-radius*nx,ry=-radius*ny,rz=-radius*nz;
  float rvx,rvy,rvz;
  cross(wx,wy,wz,rx,ry,rz,rvx,rvy,rvz);
  float svx=vx+rvx,svy=vy+rvy,svz=vz+rvz;
  const float sn=svx*nx+svz*nz+svy*ny;
  float tx=svx-sn*nx,tz=svz-sn*nz,ty=svy-sn*ny;
  const float tangent2=tx*tx+tz*tz+ty*ty;
  if(tangent2>1.e-12f&&friction>0.f){
    const float invt=1.f/sqrtr(tangent2);
    tx*=invt;tz*=invt;ty*=invt;
    const float vt=svx*tx+svz*tz+svy*ty;
    float cx,cy,cz;
    cross(rx,ry,rz,tx,ty,tz,cx,cy,cz);
    const float inertia=.4f*radius*radius;
    float crx,cry,crz;
    cross(cx/inertia,cy/inertia,cz/inertia,rx,ry,rz,crx,cry,crz);
    const float kt=1.f+tx*crx+ty*cry+tz*crz;
    // Same pre-restitution impulse bound as VPX's legacy mode.
    const float bound=maxf(friction,0.f)*absf(dot);
    const float jt=clampf(-vt/kt,-bound,bound);
    vx+=jt*tx;vy+=jt*ty;vz+=jt*tz;
    wx+=jt*cx/inertia;wy+=jt*cy/inertia;wz+=jt*cz/inertia;
  }
  result[0]=vx;result[1]=vz;result[2]=vy;
  result[3]=wx;result[4]=wy;result[5]=wz;
  result[6]=impulse;result[7]=penetration>0.f?0.f:clampf(-DISP_GAIN*penetration,0.f,DISP_LIMIT*UNIT);
}

// ---------------------------------------------------------------------------
// Experimental VPX FlipperMoverObject::UpdateVelocities/UpdateDisplacements
// and HitFlipper::Collide (hitflipper.cpp, GPLv3+).
// This stage ports torque ramp, return ratio, EOS damping/stopper recoil,
// angular momentum coupling, impact restitution and friction. The capsule
// collision *search* still uses the JS discrete solver, not VPX face/end CCD.
// Native inertia factor is computed in JS from the same VPX hull formula.
// Coordinate mapping: VPX (x,y) = GLB (x,z); angle is radians; SI duration
// is converted to VP's 10 ms VPT. Ball mass is one VP mass unit.
// ---------------------------------------------------------------------------
extern "C" EXPORTED void vpx_flipper_step(
    float angle,float omega,float currentTorque,
    float start,float end,float lengthMetres,float inertiaShapeMetres,
    float strength,float returnRatio,float rampUp,
    float damping,float dampingAngle,float dt,int pressed){
  result[0]=angle;result[1]=omega;result[2]=currentTorque;
  if(!(dt>0.f&&dt<.20f&&inertiaShapeMetres>0.f&&lengthMetres>0.f))return;
  const float low=minf(start,end),high=maxf(start,end);
  const float dir=end>=start?1.f:-1.f;
  const float inertia=inertiaShapeMetres/(UNIT*UNIT); // mass=1
  const float flipr=lengthMetres/UNIT;
  const float torqueScale=3.f*inertia/(flipr*flipr); // FIX_PHYSICS backwards compatibility
  const float maxTorque=strength*torqueScale;
  float angularMomentum=omega*VPT*inertia;
  // Original VPX internal physics runs at 1ms. Browser frame steps are
  // usually longer; integrate several fixed-size slices for stability.
  int slices=(int)(dt/.001f+.999f);if(slices<1)slices=1;
  if(slices>200)slices=200;
  const float sliceVP=(dt/(float)slices)/VPT;
  for(int i=0;i<slices;i++){
    float target=maxTorque*(pressed?1.f:-maxf(returnRatio,0.f));
    if(dampingAngle>0.f&&absf(angle-end)<dampingAngle){
      const float frac=clampf(absf(angle-end)/dampingAngle,0.f,1.f);
      const float blend=frac*frac*frac*frac;
      target*=blend+damping*(1.f-blend);
    }
    target*=dir;
    // VPX uses torque ramp-up in VPT; default 1 is a slow coil response
    // relative to instant coil but still ~20ms for full stroke.
    const float rampSpeed=rampUp<=0.f?1e6f:
      minf(maxTorque/rampUp,1e6f);
    const float delta=clampf(target-currentTorque,-rampSpeed*sliceVP,rampSpeed*sliceVP);
    currentTorque+=delta;
    float torque=currentTorque;
    const float omegaVP=angularMomentum/inertia;
    if(absf(omegaVP)<=.01f &&
       ((angle>=high-.01f&&torque>0.f)||
        (angle<=low+.01f&&torque<0.f))){
      if(angle>=high-.01f)angle=high;else angle=low;
      angularMomentum=0.f;torque=0.f;
    }
    angularMomentum+=sliceVP*torque;
    float speedVP=angularMomentum/inertia;
    angle+=speedVP*sliceVP;
    if(angle>high){angle=high;
      if(speedVP>0.f)angularMomentum*= -.3f;}
    else if(angle<low){angle=low;
      if(speedVP<0.f)angularMomentum*= -.3f;}
  }
  result[0]=angle;result[1]=(angularMomentum/inertia)/VPT;
  result[2]=currentTorque;result[3]=inertiaShapeMetres;
}

// Capsule contact geometry is provided by the JS broadphase; the collision
// impulse itself follows VPX HitFlipper::Collide (normal + tangent Coulomb).
// Outputs result[0..6] = ball vx,vz,wy,flipper omega,impulse,frictionDelta,hit.
// We use an isotropic solid sphere I=2/5 mr^2; ball mass=1.
// Vectors are x,z. Flipper angular velocity is radians per REAL second.
extern "C" EXPORTED void vpx_flipper_collide(
    float vx,float vz,float ballWy,float flipperOmega,
    float rx,float rz,float nx,float nz,
    float ballRadius,float inertiaShapeMetres,
    float elasticity,float falloff,float friction,
    float contactTorque,int atStop){
  result[0]=vx;result[1]=vz;result[2]=ballWy;
  result[3]=flipperOmega;result[4]=0.f;result[5]=0.f;result[6]=0.f;
  if(!(ballRadius>0.f&&inertiaShapeMetres>1e-7f))return;
  // Surface velocity for a vertical-axis flipper in GLB X,Z coordinates.
  // This is CrossZ(omega,rF) from VPX after changing the coordinate frame.
  const float rbx=-ballRadius*nx,rbz=-ballRadius*nz;
  const float vBx=vx+ballWy*rbz;
  const float vBz=vz-ballWy*rbx;
  const float vFx=-flipperOmega*rz,vFz=flipperOmega*rx;
  const float relativeX=vBx-vFx,relativeZ=vBz-vFz;
  const float bnv=relativeX*nx+relativeZ*nz;
  const float epsilonThreshold=C_LOWNORMVEL*UNIT/VPT;
  if(bnv>=-epsilonThreshold)return; // ball is separating from bat
  const float angResp=rx*nz-rz*nx;
  // Original algorithm ignores flipper angular response when the stopper
  // is holding against the incoming normal impulse.
  const bool againstStop=atStop && (contactTorque * -angResp>=0.f);
  const float response=againstStop?0.f:angResp;
  const float vpSpeed=absf(bnv)*VPT/UNIT;
  const float e=falloff>0.f?
    elasticity/(1.f+falloff*vpSpeed/18.53f):elasticity;
  const float inverseInertia=1.f/inertiaShapeMetres;
  const float impulse=-(1.f+e)*bnv/(1.f+response*response*inverseInertia);
  vx+=impulse*nx;vz+=impulse*nz;
  float moment=-impulse*(againstStop?.5f:1.f)*response;
  flipperOmega+=moment*inverseInertia;
  // Tangential relative surface velocity includes the spin of the steel
  // ball, the motor's moving surface and the flipper's angular momentum.
  const float tx=-nz,tz=nx;
  const float vt=relativeX*tx+relativeZ*tz;
  const float ballI=.4f*ballRadius*ballRadius;
  // y-up cross(rB,t) = -[rbx*tz-rbz*tx]. Normal is in x,z.
  const float ballCross=-(rbx*tz-rbz*tx);
  const float flipperCross=rx*tz-rz*tx;
  const float denom=1.f+ballCross*ballCross/ballI
    +flipperCross*flipperCross*inverseInertia;
  const float maxFric=maxf(friction,0.f)*maxf(impulse,0.f);
  const float frictionImpulse=clampf(-vt/denom,-maxFric,maxFric);
  vx+=frictionImpulse*tx;vz+=frictionImpulse*tz;
  ballWy+=frictionImpulse*ballCross/ballI;
  flipperOmega-=frictionImpulse*flipperCross*inverseInertia;
  result[0]=vx;result[1]=vz;result[2]=ballWy;
  result[3]=flipperOmega;result[4]=impulse;
  result[5]=frictionImpulse;result[6]=1.f;
}

