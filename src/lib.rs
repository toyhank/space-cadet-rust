//! Space Cadet DAT asset compatibility reader.
//! Original artwork is NOT bundled: users open their own PINBALL.DAT/CADET.DAT.
//! Format details independently verified against SpaceCadetPinball's MIT-licensed loader.
//! This is a resource viewer, NOT yet a port of the original collision/mission engine.
use std::sync::Mutex;
const MAGIC: &[u8] = b"PARTOUT(4.0)RESOURCE";
const HEADER: usize = 183;
const MAX_DAT: usize = 80*1024*1024;
const MAX_IMAGE_PIXELS: usize = 4096*4096;
const MAX_GROUPS: usize = 12000;

#[derive(Debug, Clone)]
pub struct Sprite {
    pub group: usize,
    pub name: String,
    pub resolution: u8,
    pub x: i16,
    pub y: i16,
    pub width: u16,
    pub height: u16,
    pub rgba: Vec<u8>,
}
#[derive(Debug, Clone)]
pub struct Archive {
    pub sprites: Vec<Sprite>,
    pub groups: usize,
    pub names: Vec<String>,
    pub palette: [[u8;4];256],
}
#[derive(Default)]
struct Group {
    name: String,
    palette: Option<Vec<u8>>,
    bitmaps: Vec<Bitmap>,
}
struct Bitmap {
    resolution:u8, x:i16, y:i16, width:u16, height:u16,
    flags:u8, pixels:Vec<u8>,
}
fn u16le(data:&[u8], p:usize)->Result<u16,String> {
    let b=data.get(p..p+2).ok_or("Truncated u16")?;
    Ok(u16::from_le_bytes([b[0],b[1]]))
}
fn i16le(data:&[u8],p:usize)->Result<i16,String>{Ok(u16le(data,p)? as i16)}
fn u32le(data:&[u8],p:usize)->Result<u32,String>{
    let b=data.get(p..p+4).ok_or("Truncated u32")?;
    Ok(u32::from_le_bytes([b[0],b[1],b[2],b[3]]))
}
fn cut<'a>(data:&'a[u8],pos:&mut usize,len:usize)->Result<&'a[u8],String>{
    let end=pos.checked_add(len).ok_or("Overflow")?;
    let b=data.get(*pos..end).ok_or("Truncated DAT entry")?;
    *pos=end;
    Ok(b)
}
fn cstring(data:&[u8])->String{
    let end=data.iter().position(|&c|c==0).unwrap_or(data.len());
    String::from_utf8_lossy(&data[..end]).to_string()
}
fn unpack_spliced(bmp:&Bitmap)->Option<Vec<u8>> {
    // Data layout from GroupData::SplitSplicedBitmap: signed advance,
    // unsigned run length, then pairs of u16 depth + u8 palette index.
    // z depths are not composited yet, only bitmap colors are reconstructed.
    let w=bmp.width as usize;let h=bmp.height as usize;
    let full_width=match bmp.resolution {0=>600isize,1=>752,2=>960,_=>600};
    let mut pixels=vec![0u8;w*h];
    let mut offset=0usize;let mut dst=0isize;
    let mut ended=false;
    while offset+2<=bmp.pixels.len(){
        let advance=i16::from_le_bytes([bmp.pixels[offset],bmp.pixels[offset+1]]) as isize;
        offset+=2;
        if advance<0{ended=true;break;}
        let adjusted=if advance>w as isize{
            advance+w as isize-full_width
        }else{advance};
        dst=dst.checked_add(adjusted)?;
        if offset+2>bmp.pixels.len(){return None;}
        let run=u16::from_le_bytes([bmp.pixels[offset],bmp.pixels[offset+1]]) as usize;
        offset+=2;
        if run>bmp.pixels.len()/3{return None;}
        for _ in 0..run{
            if offset+3>bmp.pixels.len(){return None;}
            // Skip depth value. We will use it for z ordering in a later pass.
            let color=bmp.pixels[offset+2];
            offset+=3;
            if dst<0||dst>=pixels.len() as isize{return None;}
            pixels[dst as usize]=color;
            dst+=1;
        }
    }
    if ended{Some(pixels)}else{None}
}
pub fn decode(data:&[u8])->Result<Archive,String>{
    if data.len()<HEADER||data.len()>MAX_DAT {return Err("DAT size invalid".into());}
    if data.get(..MAGIC.len())!=Some(MAGIC) {return Err("Not a PARTOUT(4.0)RESOURCE DAT file".into());}
    let group_count=u16le(data,175)? as usize;
    if group_count==0||group_count>MAX_GROUPS{return Err("Invalid group count".into());}
    let skip=u16le(data,181)? as usize;
    let mut pos=HEADER.checked_add(skip).ok_or("Header overflow")?;
    if pos>data.len(){return Err("Truncated DAT header".into());}
    let mut groups:Vec<Group>=Vec::with_capacity(group_count);
    for _ in 0..group_count {
        let count=*cut(data,&mut pos,1)?.first().unwrap() as usize;
        let mut group=Group::default();
        for _ in 0..count {
            let typ=*cut(data,&mut pos,1)?.first().unwrap();
            if typ>13{return Err(format!("Unexpected field type {}",typ));}
            let len=match typ {
                0|2=>2usize,13=>0usize,_=>u32le(data, {let at=pos; pos+=4;at})? as usize
            };
            if len>MAX_DAT {return Err("Unreasonable field length".into());}
            let buf=cut(data,&mut pos,len)?;
            match typ {
                3=>group.name=cstring(buf),
                5=>if buf.len()>=1024 {group.palette=Some(buf[..1024].to_vec());},
                1=>{
                    if buf.len()<14 {return Err("Truncated bitmap header".into());}
                    let res=buf[0];
                    let w=i16le(buf,1)?;let h=i16le(buf,3)?;
                    if w<=0||h<=0 || w as usize*h as usize>MAX_IMAGE_PIXELS {
                        return Err("Bitmap size invalid".into())
                    }
                    let x=i16le(buf,5)?;let y=i16le(buf,7)?;
                    let declared=u32le(buf,9)? as usize;
                    let flags=buf[13];
                    if declared>buf.len()-14 {return Err("Bitmap payload truncated".into());}
                    group.bitmaps.push(Bitmap{resolution:res,x,y,width:w as u16,
                        height:h as u16,flags,pixels:buf[14..14+declared].to_vec()});
                },
                _=>{}
            }
        }
        groups.push(group);
    }
    // 'background' is the canonical owner of the palette in the original DAT.
    let pb=groups.iter().find(|g|g.name.eq_ignore_ascii_case("background"))
        .and_then(|g|g.palette.as_ref()).or_else(||
            groups.iter().find_map(|g|g.palette.as_ref()));
    // Match the source engine's palette rules: 0 transparent, 1..9 Windows
    // palette, 10..245 DAT colors, 246..254 unused, 255 white.
    // SDL uses alpha 2 as a nonzero transparency key; browser requires 255.
    let mut palette=[[0u8;4];256];
    let win=[[0,0,0,0],[128,0,0,255],[0,128,0,255],
        [128,128,0,255],[0,0,128,255],[128,0,128,255],
        [0,128,128,255],[192,192,192,255],[192,220,192,255],
        [166,202,240,255]];
    palette[..10].copy_from_slice(&win);
    if let Some(raw)=pb {
        for i in 10..246 {
            // Stored ColorRgba is 0xAARRGGBB, little-endian byte order BGRA.
            let j=4*i;
            palette[i]=[raw[j+2],raw[j+1],raw[j],255];
        }
    } else {
        for i in 10..246{palette[i]=[i as u8,i as u8,i as u8,255];}
    }
    palette[255]=[255,255,255,255];
    let mut sprites=Vec::new();
    let names=groups.iter().map(|g|g.name.clone()).collect::<Vec<_>>();
    for (gi, g) in groups.into_iter().enumerate() {
        for bmp in g.bitmaps {
            if bmp.resolution>2 {continue;}
            let w=bmp.width as usize;let h=bmp.height as usize;
            let spliced=bmp.flags&4!=0;
            let pixels=if spliced {match unpack_spliced(&bmp){Some(x)=>x,None=>continue}}
                else{bmp.pixels.clone()};
            let stride=if spliced{w}else{(w+3)&!3};
            if pixels.len()<h*stride {continue;}
            let mut rgba=vec![0u8;w*h*4];
            for y in 0..h {
                // Original indexed bitmaps are stored bottom-up, as in the C++ loader.
                for x in 0..w {
                    let v=pixels[(h-y-1)*stride+x] as usize;
                    rgba[(y*w+x)*4..(y*w+x+1)*4].copy_from_slice(&palette[v]);
                }
            }
            sprites.push(Sprite{group:gi,name:g.name.clone(),resolution:bmp.resolution,
                x:bmp.x,y:bmp.y,width:bmp.width,height:bmp.height,rgba});
        }
    }
    Ok(Archive{sprites,groups:group_count,names,palette})
}
static ARCHIVE:Mutex<Option<Archive>>=Mutex::new(None);
static ERROR:Mutex<String>=Mutex::new(String::new());

/// wasm linear-memory helpers for a plain <script> loader (no wasm-bindgen).
#[no_mangle] pub extern "C" fn wasm_alloc(size:usize)->*mut u8{
    if size==0||size>MAX_DAT {return std::ptr::null_mut();}
    let mut data=Vec::<u8>::with_capacity(size);
    let ptr=data.as_mut_ptr();
    std::mem::forget(data);ptr
}
#[no_mangle] pub unsafe extern "C" fn wasm_free(ptr:*mut u8, size:usize){
    if !ptr.is_null()&&size>0&&size<=MAX_DAT{drop(Vec::from_raw_parts(ptr,0,size));}
}
#[no_mangle] pub unsafe extern "C" fn dat_load(ptr:*mut u8,size:usize)->i32{
    if ptr.is_null()||size==0||size>MAX_DAT{return -1;}
    let result=decode(std::slice::from_raw_parts(ptr,size));
    match result {
        Ok(d)=>{
            let n=d.sprites.len() as i32;
            *ARCHIVE.lock().unwrap()=Some(d);
            ERROR.lock().unwrap().clear();n
        },
        Err(e)=>{
            *ARCHIVE.lock().unwrap()=None;
            *ERROR.lock().unwrap()=e;-1
        }
    }
}
#[no_mangle] pub extern "C" fn dat_sprite_count()->usize{
    ARCHIVE.lock().unwrap().as_ref().map(|a|a.sprites.len()).unwrap_or(0)
}
#[no_mangle] pub extern "C" fn dat_group_count()->usize{
    ARCHIVE.lock().unwrap().as_ref().map(|a|a.groups).unwrap_or(0)
}
#[no_mangle] pub extern "C" fn dat_sprite_meta(index:usize,field:u32)->i32{
    let guard=ARCHIVE.lock().unwrap();
    let Some(s)=guard.as_ref().and_then(|a|a.sprites.get(index)) else{return -1};
    match field {
        0=>s.group as i32,1=>s.x as i32,2=>s.y as i32,
        3=>s.width as i32,4=>s.height as i32,5=>s.resolution as i32,
        6=>s.rgba.as_ptr() as usize as i32,
        7=>s.rgba.len() as i32,
        8=>s.name.as_ptr() as usize as i32,
        9=>s.name.len() as i32,_=>-1,
    }
}
#[no_mangle] pub extern "C" fn dat_error_ptr()->usize{ERROR.lock().unwrap().as_ptr() as usize}
#[no_mangle] pub extern "C" fn dat_error_len()->usize{ERROR.lock().unwrap().len()}

#[cfg(test)]
mod tests{
    use super::*;
    #[test] fn rejects_wrong_file(){
        assert!(decode(b"NOT A DAT").is_err());
    }
    fn fixture()->Vec<u8>{
        let mut d=vec![0u8;HEADER]; d[..MAGIC.len()].copy_from_slice(MAGIC);
        d[175..177].copy_from_slice(&1u16.to_le_bytes());
        d.push(3); // 3 fields
        d.push(3);d.extend(11u32.to_le_bytes());d.extend(b"background\0");
        d.push(5);d.extend(1024u32.to_le_bytes());
        let mut p=[0u8;1024];p[40..44].copy_from_slice(&[11,22,33,255]);d.extend(p);
        d.push(1);d.extend(22u32.to_le_bytes()); // bitmap header 14 + 8 bytes
        d.push(0);d.extend(2i16.to_le_bytes());d.extend(2i16.to_le_bytes());
        d.extend(0i16.to_le_bytes());d.extend(0i16.to_le_bytes());
        d.extend(8u32.to_le_bytes());d.push(2);d.extend([10,0,0,0,0,10,0,0]);
        d
    }
    #[test] fn parse_original_format(){
        let d=decode(&fixture()).unwrap();
        assert_eq!(d.groups,1);assert_eq!(d.sprites.len(),1);
        assert_eq!(d.sprites[0].width,2);
        assert_eq!(&d.sprites[0].rgba[0..4],&[0,0,0,0]);
        assert_eq!(&d.sprites[0].rgba[4..8],&[33,22,11,255]);
    }
    #[test] fn rejects_truncated(){let mut d=fixture();d.pop();assert!(decode(&d).is_err());}
}
