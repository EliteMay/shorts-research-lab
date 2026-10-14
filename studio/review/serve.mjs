import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const home=path.dirname(fileURLToPath(import.meta.url));
const files=new Map([
  ['/',['index.html','text/html; charset=utf-8']],
  ['/index.html',['index.html','text/html; charset=utf-8']],
  ['/review.css',['review.css','text/css; charset=utf-8']],
  ['/review-ui.mjs',['review-ui.mjs','text/javascript; charset=utf-8']],
  ['/review-model.mjs',['review-model.mjs','text/javascript; charset=utf-8']]
]);
const server=http.createServer(async(req,res)=>{
  const item=files.get(req.url?.split('?')[0]);
  if(req.method!=='GET'||!item){res.writeHead(404);res.end('Not found');return;}
  try{
    const content=await readFile(path.join(home,item[0]));
    res.writeHead(200,{'Content-Type':item[1],'X-Content-Type-Options':'nosniff',
      'Cache-Control':'no-store','X-Frame-Options':'DENY'});
    res.end(content);
  }catch{res.writeHead(500);res.end('Failed to serve file');}
});
const port=Number(process.env.SHORTS_REVIEW_PORT||0);
if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid port');
server.listen(port,'127.0.0.1',()=>console.log('Shorts素材レビュー: http://127.0.0.1:'+server.address().port));
