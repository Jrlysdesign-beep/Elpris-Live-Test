// Elpris Live: isolated foundation. No credentials or charging controls are stored here.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==="GET"&&url.pathname==="/health")
      return json({service:"elpris-live-test",status:"ready",database:!!env.DB,automaticCollection:"not-configured"});
    if(request.method==="GET"&&url.pathname==="/")
      return new Response("Elpris Live API · initial setup. Charging collection is not active.",{headers:{"content-type":"text/plain; charset=utf-8"}});
    return json({error:"Not found"},404);
  },
  async scheduled(event,env,ctx){
    // Fail closed: do not call Zaptec until per-user secure authorization,
    // validated meter identifiers and idempotent collection are implemented.
    console.log("Elpris Live scheduler heartbeat",new Date(event.scheduledTime).toISOString());
  }
};
