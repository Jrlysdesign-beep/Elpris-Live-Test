import {parseStates,zaptecRequest} from "./zaptec.js";
import {decrypt,encrypt} from "./security.js";
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
async function access(connection,env,now){
 if(connection.access_expires_at&&connection.encrypted_access_token&&Date.parse(connection.access_expires_at)>now+120000)
  return decrypt(connection.encrypted_access_token,env.TOKEN_SECRET);
 if(!connection.encrypted_refresh_credential)throw Error("No refresh credential");
 const refresh=await decrypt(connection.encrypted_refresh_credential,env.TOKEN_SECRET);
 const response=await fetch("https://api.zaptec.com/oauth/token",{
  method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({grant_type:"refresh_token",refresh_token:refresh}),
  signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error("Token refresh failed");
 const data=await response.json();
 if(typeof data.access_token!=="string")throw Error("Missing access token");
 const expires=new Date(now+Math.min(Math.max(Number(data.expires_in)||3600,60),86400)*1000).toISOString();
 const accessCipher=await encrypt(data.access_token,env.TOKEN_SECRET);
 const refreshCipher=data.refresh_token?await encrypt(data.refresh_token,env.TOKEN_SECRET):connection.encrypted_refresh_credential;
 await env.DB.prepare("UPDATE user_credentials SET encrypted_access_token=?,encrypted_refresh_credential=?,access_expires_at=?,updated_at=? WHERE user_id=?")
  .bind(accessCipher,refreshCipher,expires,new Date().toISOString(),connection.user_id).run();
 return data.access_token;
}
export async function collectOne(connection,env,now=new Date()){
 if(!UUID.test(connection.charger_id))throw Error("Invalid charger");
 const token=await access(connection,env,now.getTime());
 const state=parseStates(await zaptecRequest("/api/chargers/"+connection.charger_id+"/state",token));
 // Never pretend that a missing or stale Zaptec measurement was taken at poll time.
 const observed=state.energyObservedAt;
 if(!observed||state.sessionKwh===null)return {status:"no_energy_observation"};
 const skew=now.getTime()-Date.parse(observed);
 if(skew < -120000||skew > 10*60000)return {status:"stale_energy_observation"};
 const id=crypto.randomUUID();
 const sessionKey=state.sessionId?String(state.sessionId).slice(0,128):null;
 // Only persist readings with the source observation timestamp. A session counter
 // must never be interpreted as a lifetime meter or joined across sessions.
 if(!sessionKey)return {status:"missing_session_identity"};
 await env.DB.prepare(`INSERT OR IGNORE INTO meter_readings
 (id,connection_id,session_id,observed_at,received_at,meter_kwh,power_kw,charging,source)
 VALUES (?,?,NULL,?,?,?,?,?,'zaptec_state_553')`)
 .bind(id,connection.id,observed,now.toISOString(),state.sessionKwh,state.powerKw,state.charging?1:0).run();
 return {status:"sampled",observedAt:observed,mode:state.mode,sessionId:sessionKey};
}
export async function collectEnabled(env,{limit=20}={}){
 if(!env.DB||!env.TOKEN_SECRET)throw Error("Missing DB or TOKEN_SECRET");
 const rows=await env.DB.prepare(`SELECT c.*,k.encrypted_access_token,k.encrypted_refresh_credential,k.access_expires_at FROM charger_connections c JOIN users u ON u.id=c.user_id JOIN user_credentials k ON k.user_id=c.user_id
 WHERE c.enabled=1 AND u.revoked_at IS NULL ORDER BY c.id LIMIT ?`).bind(limit).all();
 const results=[];
 for(const connection of rows.results||[]){
  try{results.push({id:connection.id,...await collectOne(connection,env)});}
  catch(error){results.push({id:connection.id,status:"failed",reason:String(error.message).slice(0,80)});}
 }
 return results;
}
