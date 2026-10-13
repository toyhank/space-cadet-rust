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
extern "C" EXPORTED int vpx_version(){return 1;}

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
