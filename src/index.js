import {encrypt,decrypt,digest,randomSession} from "./security.js";
import {collectEnabled} from "./collector.js";
import {zaptecRequest,parseStates} from "./zaptec.js";
const ORIGIN="https://jrlysdesign-beep.github.io";
const json=(body,status=200,origin=null)=>new Response(JSON.stringify(body),{status,headers:{
 "content-type":"application/json; charset=utf-8","cache-control":"no-store",
 "x-content-type-options":"nosniff",...(origin===ORIGIN?{"access-control-allow-origin":ORIGIN,"vary":"Origin"}:{})}});
const uid=x=>typeof x==="string"&&/^[0-9a-f-]{36}$/i.test(x);
async function session(request,env){
 const bearer=(request.headers.get("authorization")||"").match(/^Bearer ([a-zA-Z0-9_-]{32,128})$/);
 if(!bearer)throw Error("Unauthorized");
 const hash=await digest(bearer[1]);
 const row=await env.DB.prepare(`SELECT s.user_id FROM app_sessions s JOIN users u ON u.id=s.user_id
 WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?
 AND u.revoked_at IS NULL`).bind(hash,new Date().toISOString()).first();
 if(!row)throw Error("Unauthorized");
 return {userId:row.user_id,hash};
}
export default {
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get("origin");
  if(request.method==="OPTIONS")return new Response(null,{status:origin===ORIGIN?204:403,headers:origin===ORIGIN?{
   "access-control-allow-origin":ORIGIN,"access-control-allow-methods":"GET,POST,OPTIONS",
   "access-control-allow-headers":"Content-Type,Authorization","vary":"Origin"}:{}});
  if(request.method==="GET"&&url.pathname==="/health")
   return json({service:"elpris-live-test",status:"ready",database:!!env.DB,collection:"disabled_pending_validation"});
  if(request.method==="GET"&&url.pathname==="/")return new Response("Elpris Live API · setup",{
   headers:{"content-type":"text/plain; charset=utf-8"}});
  if(!url.pathname.startsWith("/api/"))return json({error:"Not found"},404);
  if(origin!==ORIGIN)return json({error:"Origin not allowed"},403,origin);
  if(!env.DB||!env.TOKEN_SECRET||env.TOKEN_SECRET.length<32)return json({error:"Server not configured"},503,origin);
  if(url.pathname==="/api/login"&&request.method==="POST"){
   if(!env.LOGIN_RATE_LIMIT)return json({error:"Login rate limit unavailable"},503,origin);
   const ip=request.headers.get("CF-Connecting-IP");
   if(!ip||!(await env.LOGIN_RATE_LIMIT.limit({key:ip})).success)return json({error:"Login rate limited"},429,origin);
   if(Number(request.headers.get("content-length")||0)>2048)return json({error:"Request too large"},413,origin);
   let data;try{data=await request.json()}catch{return json({error:"Invalid JSON"},400,origin)}
   const email=typeof data?.email==="string"?data.email.trim():"";
   const password=typeof data?.password==="string"?data.password:"";
   if(!email||email.length>254||!password||password.length>256)return json({error:"Invalid credentials"},400,origin);
   try{
    const auth=await fetch("https://api.zaptec.com/oauth/token",{
     method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
     body:new URLSearchParams({grant_type:"password",username:email,password}),
     signal:AbortSignal.timeout(12000)});
    if(!auth.ok)return json({error:"Zaptec login rejected"},401,origin);
    const tokens=await auth.json();
    if(!tokens.access_token)return json({error:"No access token"},502,origin);
    // A verified Zaptec user ID, not a client-provided email, is the identity.
    const profile=await zaptecRequest("/api/user",tokens.access_token);
    const userId=profile?.Id??profile?.id;
    if(!uid(userId))return json({error:"Could not verify Zaptec identity"},502,origin);
    const sessionToken=randomSession(),hash=await digest(sessionToken);
    const expiry=new Date(Date.now()+45*60000).toISOString();
    const encrypted=await encrypt(tokens.access_token,env.TOKEN_SECRET);
    const refresh=tokens.refresh_token?await encrypt(tokens.refresh_token,env.TOKEN_SECRET):null;
    const tokenExpiry=new Date(Date.now()+Math.min(Number(tokens.expires_in)||3600,86400)*1000).toISOString();
    await env.DB.batch([
     env.DB.prepare("INSERT OR IGNORE INTO users(id) VALUES (?)").bind(userId),
     env.DB.prepare("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)").bind(hash,userId,expiry),
     env.DB.prepare(`INSERT INTO user_credentials(user_id,encrypted_access_token,encrypted_refresh_credential,access_expires_at,updated_at)
      VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted_access_token=excluded.encrypted_access_token,
      encrypted_refresh_credential=excluded.encrypted_refresh_credential,access_expires_at=excluded.access_expires_at,
      updated_at=excluded.updated_at`).bind(userId,encrypted,refresh,tokenExpiry,new Date().toISOString())
    ]);
    // Credential is persisted only for chargers explicitly enabled later.
    return json({session:sessionToken,expiresAt:expiry,refreshSupported:!!refresh,
     note:"No charger monitoring is enabled by login alone."},200,origin);
   }catch{return json({error:"Could not authenticate with Zaptec"},502,origin)}
  }
  let auth;try{auth=await session(request,env)}catch{return json({error:"Unauthorized"},401,origin)}
  if(url.pathname==="/api/logout"&&request.method==="POST"){
   await env.DB.prepare("UPDATE app_sessions SET revoked_at=? WHERE token_hash=?")
    .bind(new Date().toISOString(),auth.hash).run();
   return json({loggedOut:true},200,origin);
  }
  if(url.pathname==="/api/chargers"&&request.method==="GET"){
   try{
    const credential=await env.DB.prepare("SELECT encrypted_access_token,access_expires_at FROM user_credentials WHERE user_id=?").bind(auth.userId).first();
    if(!credential||Date.parse(credential.access_expires_at)<Date.now()+15000)
     return json({error:"Zaptec token expired; log in again to verify chargers"},401,origin);
    const token=await decrypt(credential.encrypted_access_token,env.TOKEN_SECRET);
    const data=await zaptecRequest("/api/chargers?PageSize=100",token);
    const list=Array.isArray(data)?data:Array.isArray(data?.Data)?data.Data:[];
    return json({chargers:list.map(c=>({id:c.Id??c.id,name:c.Name??c.DeviceId??"Zaptec"}))
      .filter(c=>uid(c.id))},200,origin);
   }catch{return json({error:"Could not load chargers"},502,origin)}
  }
  if(url.pathname==="/api/connections"&&request.method==="POST"){
   if(Number(request.headers.get("content-length")||0)>1024)return json({error:"Request too large"},413,origin);
   let data;try{data=await request.json()}catch{return json({error:"Invalid JSON"},400,origin)}
   if(!uid(data?.chargerId)||typeof data?.enabled!=="boolean")return json({error:"Invalid charger selection"},400,origin);
   try{
    const credential=await env.DB.prepare("SELECT encrypted_access_token,access_expires_at,encrypted_refresh_credential FROM user_credentials WHERE user_id=?").bind(auth.userId).first();
    if(!credential||Date.parse(credential.access_expires_at)<Date.now()+15000)
     return json({error:"Please log in again"},401,origin);
    const token=await decrypt(credential.encrypted_access_token,env.TOKEN_SECRET);
    // Check ownership/visibility with Zaptec on every registration, never trust a submitted ID.
    const upstream=await zaptecRequest("/api/chargers?PageSize=100",token);
    const chargers=Array.isArray(upstream)?upstream:Array.isArray(upstream?.Data)?upstream.Data:[];
    const charger=chargers.find(c=>String(c.Id??c.id).toLowerCase()===data.chargerId.toLowerCase());
    if(!charger)return json({error:"Charger not available in your Zaptec account"},403,origin);
    if(data.enabled&&!credential.encrypted_refresh_credential)
     return json({error:"Background monitoring requires verified renewable Zaptec authorization"},409,origin);
    const id=crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO charger_connections(id,user_id,charger_id,display_name,enabled)
      VALUES(?,?,?,?,?) ON CONFLICT(user_id,charger_id) DO UPDATE SET
      display_name=excluded.display_name,enabled=excluded.enabled`)
      .bind(id,auth.userId,data.chargerId,String(charger.Name??charger.DeviceId??"Zaptec").slice(0,100),data.enabled?1:0).run();
    return json({saved:true,enabled:data.enabled,collectionActive:env.COLLECTION_ENABLED==="true"},200,origin);
   }catch{return json({error:"Could not register charger"},502,origin)}
  }
  if(url.pathname==="/api/meter-check"&&request.method==="GET"){
   const chargerId=url.searchParams.get("chargerId");
   if(!uid(chargerId))return json({error:"Invalid charger ID"},400,origin);
   const owner=await env.DB.prepare("SELECT id FROM charger_connections WHERE user_id=? AND charger_id=?")
    .bind(auth.userId,chargerId).first();
   if(!owner)return json({error:"Register charger first"},403,origin);
   try{
    const credential=await env.DB.prepare("SELECT encrypted_access_token,access_expires_at FROM user_credentials WHERE user_id=?")
      .bind(auth.userId).first();
    if(!credential||Date.parse(credential.access_expires_at)<Date.now()+15000)
     return json({error:"Please log in again"},401,origin);
    const token=await decrypt(credential.encrypted_access_token,env.TOKEN_SECRET);
    const parsed=parseStates(await zaptecRequest("/api/chargers/"+chargerId+"/state",token));
    return json({chargerId,observationIds:{sessionEnergyKwh:553,powerW:513,mode:710,session:721},
     reading:parsed,verifiedOnPhysicalCharger:false},200,origin);
   }catch{return json({error:"Could not read meter state"},502,origin)}
  }
  if(url.pathname==="/api/connections"&&request.method==="GET"){
   const rows=await env.DB.prepare(`SELECT id,charger_id,display_name,enabled FROM charger_connections
    WHERE user_id=? ORDER BY display_name`).bind(auth.userId).all();
   return json({connections:rows.results||[]},200,origin);
  }
  return json({error:"Not found"},404,origin);
 },
 async scheduled(event,env,ctx){
  if(env.COLLECTION_ENABLED!=="true"){console.log("Collection disabled pending meter validation");return}
  ctx.waitUntil(collectEnabled(env).then(rows=>console.log("Collection status",JSON.stringify(rows)))
   .catch(e=>console.error("Collection failed",String(e.message))));
 }
};
