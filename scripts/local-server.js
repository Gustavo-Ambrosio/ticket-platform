import {createServer} from 'node:http';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import worker from '../src/worker.js';
import {database} from './database.js';
const exec=promisify(execFile);mkdirSync('.local',{recursive:true});
const settingsPath='.local/settings.json';
if(!existsSync(settingsPath))writeFileSync(settingsPath,JSON.stringify({ADMIN_PASSWORD:randomBytes(18).toString('base64url'),SESSION_SECRET:randomBytes(32).toString('hex')},null,2));
const settings=JSON.parse(readFileSync(settingsPath,'utf8'));
const port=Number(process.env.PORT||8787),root=resolve('public');
const env={...settings,DB:database('.local/data.sqlite'),APP_URL:`http://127.0.0.1:${port}`,SALES_ENABLED:'false',MP_ENV:'test'};
env.LOCAL_QR=async(content)=>{const {stdout}=await exec('python',['-c',"import qrcode,qrcode.image.svg,sys; qrcode.make(sys.argv[1],image_factory=qrcode.image.svg.SvgPathImage).save(sys.stdout.buffer)",content],{maxBuffer:1024*1024});return stdout;};
env.ASSETS={async fetch(request){
 const url=new URL(request.url);let path;
 try{path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));}catch{return new Response('Não encontrado',{status:404});}
 if(!path.startsWith(root+sep))return new Response('Não encontrado',{status:404});
 try{
  const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'}[extname(path)]||'application/octet-stream';
  return new Response(readFileSync(path),{headers:{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'}});
 }catch{return new Response('Não encontrado',{status:404});}
}};
createServer(async(req,res)=>{
 try{
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>12000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
  const request=new Request(`http://127.0.0.1:${port}${req.url}`,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(err){res.writeHead(500);res.end('Erro local.');console.error(err.message);}
}).listen(port,'127.0.0.1',()=>console.log(`Green Culture: http://127.0.0.1:${port}\nPainel: http://127.0.0.1:${port}/admin.html\nSenha local em .local/settings.json (não enviar ao GitHub).\nVendas desativadas; banco local separado.`));
