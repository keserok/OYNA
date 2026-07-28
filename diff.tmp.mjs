import sharp from 'sharp';
const [A,B,OUT]=process.argv.slice(2);
const a=await sharp(A).raw().ensureAlpha().toBuffer({resolveWithObject:true});
const b=await sharp(B).raw().ensureAlpha().toBuffer({resolveWithObject:true});
const {width,height}=a.info; const out=Buffer.alloc(width*height*4,0);
let n=0,minY=1e9,maxY=-1,minX=1e9,maxX=-1;
for(let i=0;i<a.data.length;i+=4){
  const d=Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]);
  const p=i/4,y=Math.floor(p/width),x=p%width;
  if(d>8){n++;out[i]=255;out[i+3]=255;if(y<minY)minY=y;if(y>maxY)maxY=y;if(x<minX)minX=x;if(x>maxX)maxX=x;}
  else {out[i]=a.data[i];out[i+1]=a.data[i+1];out[i+2]=a.data[i+2];out[i+3]=60;}
}
console.log('farkli piksel:',n,'oran:',(n/(width*height)).toFixed(5),'bbox x',minX,maxX,'y',minY,maxY);
await sharp(out,{raw:{width,height,channels:4}}).png().toFile(OUT);
