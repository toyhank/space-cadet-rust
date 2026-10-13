// SPDX-License-Identifier: GPL-3.0-or-later
// Adapted from Visual Pinball X src/physics/hitflipper.cpp:
//   HitFlipper::HitTestFlipperFace and HitTestFlipperEnd.
// Portable swept-contact search in GLB metres/seconds, compatible with the
// partial native VPX rotor impulse ABI. This is NOT full native VPX physics.
// Original VPX uses modified false-position iteration for face/end hit times;
// this standalone build brackets contacts in 20 temporal subdivisions and
// refines the earliest crossing. The face geometry, tapered face normals,
// rotating cap, and approach-speed test derive from VPX.
#define EXPORT __attribute__((visibility("default")))
static float data[12];
static constexpr float EPS=1e-6f;
static inline float minf(float a,float b){return a<b?a:b;}
static inline float maxf(float a,float b){return a>b?a:b;}
static inline float clampf(float x,float a,float b){return minf(b,maxf(a,x));}
static inline float root(float x){return __builtin_sqrtf(x);}
// Freestanding WASM: accurate range-reduced sine over VPX flipper angles.
static inline float s(float x){
 constexpr float PI=3.14159265358979323846f, TWO=2.f*PI;
 while(x>PI)x-=TWO;
 while(x< -PI)x+=TWO;
 if(x>PI*.5f)x=PI-x;
 else if(x< -PI*.5f)x=-PI-x;
 const float y=x*x;
 return x*(1.f+y*(-.16666666667f+y*(.008333333333f+y*(-.0001984126984f+
     y*(.0000027557319224f+y*(-.0000000250521084f))))));
}
static inline float c(float x){return s(x+1.5707963267948966f);}
extern "C" EXPORT float* vpx_flipper_toi_out(){return data;}
extern "C" EXPORT int vpx_flipper_toi_version(){return 1;}
struct Config{
 float x,z,vx,vz,r,px,pz,ang,omega,minAng,maxAng,length,rb,re,time;
};
struct Sample{
 float d,nx,nz,rx,rz,approach;
 bool valid;
};
static Sample candidate(const Config& f,int kind,float t){
 // 0/1 = tapered face 1/2, 2=end circle, 3=base circle
 Sample out={1e3f,0,0,0,0,0,false};
 const float angle=clampf(f.ang+f.omega*t,f.minAng,f.maxAng);
 const float cs=c(angle),sn=s(angle);
 const float x=f.x+f.vx*t,z=f.z+f.vz*t;
 const float dX=x-f.px,dZ=z-f.pz;
 float normX,normZ,centerX,centerZ;
 if(kind<2){
  const float ratio=clampf((f.rb-f.re)/f.length,-.999f,.999f);
  const float normalX=(kind==0?-1.f:1.f)*root(1.f-ratio*ratio);
  const float normalZ=-ratio;
  normX=normalX*cs-normalZ*sn;
  normZ=normalZ*cs+normalX*sn;
  centerX=f.px+f.rb*normX;
  centerZ=f.pz+f.rb*normZ;
  const float tx=kind==0?-normZ:normZ;
  const float tz=kind==0?normX:-normX;
  const float qx=x-centerX,qz=z-centerZ;
  const float along=qx*tx+qz*tz;
  if(along<-.00015f||along>f.length*root(1.f-ratio*ratio)+.00015f)return out;
  out.d=qx*normX+qz*normZ-f.r;
 }else{
  centerX=f.px+(kind==2?f.length*sn:0.f);
  centerZ=f.pz-(kind==2?f.length*cs:0.f);
  const float ddx=x-centerX,ddz=z-centerZ;
  const float len=root(ddx*ddx+ddz*ddz);
  if(len<EPS)return out;
  normX=ddx/len;normZ=ddz/len;
  out.d=len-(f.r+(kind==2?f.re:f.rb));
  // VPX tip/base circle only matters outside the face endpoints.
  if(kind==2&&dX*sn-dZ*cs<f.length*.65f)return out;
  if(kind==3&&dX*sn-dZ*cs>f.rb*.3f)return out;
 }
 out.nx=normX;out.nz=normZ;
 out.rx=x-f.r*normX-f.px;out.rz=z-f.r*normZ-f.pz;
 // HitFlipper: Ball - Flipper moving contact surface normal velocity.
 const float vxFace=-f.omega*out.rz;
 const float vzFace=f.omega*out.rx;
 out.approach=(f.vx-vxFace)*normX+(f.vz-vzFace)*normZ;
 out.valid=true;
 return out;
}
extern "C" EXPORT float vpx_flipper_toi(
 float x,float z,float y,float vx,float vz,float vy,float radius,
 float pivotX,float pivotZ,float angle,float omega,float start,float end,
 float length,float baseRadius,float endRadius,float seconds){
 for(int j=0;j<12;j++)data[j]=0;
 data[0]=-1;
 if(!(radius>0&&length>0&&baseRadius>0&&endRadius>0&&seconds>0&&seconds<=.08f))return -1;
 // VPX flippers occupy a ground-level strip of the table.
 if(y-radius>.027f || y+radius<0.f)return -1;
 Config conf={x,z,vx,vz,radius,pivotX,pivotZ,angle,omega,
   minf(start,end),maxf(start,end),length,baseRadius,endRadius,seconds};
 float best=seconds+1;
 Sample winner={};int winnerKind=-1;
 // Simulate all face/end primitives, select physically earliest valid hit.
 for(int kind=0;kind<4;kind++){
  Sample prior=candidate(conf,kind,0);
  if(prior.valid && prior.d<=.000035f&&prior.d>-radius*.7f&&prior.approach<-.0001f){
   best=0;winner=prior;winnerKind=kind;break;
  }
  const int segments=20;
  for(int i=1;i<=segments;i++){
   const float t=(float)i*seconds/segments;
   const Sample current=candidate(conf,kind,t);
   if(prior.valid && current.valid && prior.d>0 && current.d<=0){
    float lo=(float)(i-1)*seconds/segments,hi=t;
    Sample selected=current;
    for(int k=0;k<15;k++){
     const float mid=(lo+hi)*.5f;
     const Sample sm=candidate(conf,kind,mid);
     if(!sm.valid){lo=mid;continue;}
     if(sm.d>0)lo=mid;else{hi=mid;selected=sm;}
    }
    if(selected.valid&&selected.approach<-.0001f && hi<best){
     best=hi;winner=selected;winnerKind=kind;
    }
    break;
   }
   prior=current;
  }
 }
 if(winnerKind<0)return -1.f;
 data[0]=best;data[1]=winner.nx;data[2]=winner.nz;
 data[3]=winner.rx;data[4]=winner.rz;
 data[5]=(float)winnerKind;data[6]=winner.d;data[7]=winner.approach;
 return best;
}
