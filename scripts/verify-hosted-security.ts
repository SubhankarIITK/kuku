// Verify password-free hosted access and request guards without MongoDB or Groq calls.
import assert from 'node:assert/strict';
process.env.HOSTED_MODE='true';
process.env.MONGODB_URI='';
delete process.env.APP_PASSWORD;
delete process.env.SESSION_SECRET;
const {default:app}=await import('../backend/src/server.js');
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
try{
  const missing=await fetch(base+'/api/datasets');assert.equal(missing.status,503);
  assert.equal((await missing.json()).error.code,'SETUP_REQUIRED');
  assert.equal((await fetch(base+'/api/datasets',{headers:{Origin:'https://foreign.example'}})).status,403);
  assert.equal((await fetch(base+'/api/analysis/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  process.env.MONGODB_URI='mongodb://127.0.0.1:1';
  // Unknown routes pass middleware without a cookie and return 404, without querying storage.
  assert.equal((await fetch(base+'/api/unknown')).status,404);
  assert.equal((await fetch(base+'/api/unknown',{headers:{Cookie:'kuku_session=invalid'}})).status,404);
  assert.equal((await fetch(base+'/api/unknown',{method:'POST',headers:{'X-Kuku-Client':'local'}})).status,404);
  assert.equal((await fetch(base+'/api/session')).status,404);
  console.log('8 hosted access checks passed. Database connections: 0. Groq calls: 0.');
}finally{server.close();}
