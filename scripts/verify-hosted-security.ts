// No database or Groq connection is made: all tested requests must be rejected first.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
process.env.HOSTED_MODE='true';
process.env.APP_PASSWORD='synthetic-password-for-tests';
process.env.SESSION_SECRET='synthetic-session-secret-for-tests-at-least-32-characters';
process.env.MONGODB_URI='mongodb://127.0.0.1:1';
const {default:app}=await import('../backend/src/server.js');
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
try{
  const status=await (await fetch(base+'/api/session')).json();assert.equal(status.hosted,true);assert.equal(status.authenticated,false);assert.equal(status.setupReady,true);
  assert.equal((await fetch(base+'/api/datasets')).status,401);
  assert.equal((await fetch(base+'/api/health')).status,401);
  assert.equal((await fetch(base+'/api/datasets',{headers:{Cookie:'kuku_session=invalid'}})).status,401);
  assert.equal((await fetch(base+'/api/session',{method:'POST',headers:{Origin:'https://foreign.example','Content-Type':'application/json','X-Kuku-Client':'local'},body:'{"password":"test"}'})).status,403);
  const expiry=String(Date.now()-1000),mac=createHmac('sha256',process.env.SESSION_SECRET).update(expiry).digest('hex');
  assert.equal((await fetch(base+'/api/datasets',{headers:{Cookie:`kuku_session=${expiry}.${mac}`}})).status,401);
  const {validSession,passwordMatches}=await import('../backend/src/session.js');
  const future=String(Date.now()+60000),signature=createHmac('sha256',process.env.SESSION_SECRET).update(future).digest('hex');
  assert.equal(validSession({headers:{cookie:`kuku_session=${future}.${signature}`}} as any),true);
  assert.equal(passwordMatches('incorrect'),false);assert.equal(passwordMatches(process.env.APP_PASSWORD),true);
  delete process.env.SESSION_SECRET;assert.equal((await fetch(base+'/api/datasets')).status,503);
  console.log('9 hosted security checks passed. Database connections: 0. Groq calls: 0.');
}finally{server.close();}
