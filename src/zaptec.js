// Zaptec documented observations: https://docs.zaptec.com/docs/state-observation-reference
export const IDS=Object.freeze({power:513,sessionKwh:553,signedMeter:554,mode:710,session:721,online:-2});
export function parseStates(payload) {
 const states=Array.isArray(payload)?payload:Array.isArray(payload?.States)?payload.States:
   Array.isArray(payload?.states)?payload.states:Array.isArray(payload?.Observations)?payload.Observations:
   Array.isArray(payload?.observations)?payload.observations:[];
 const byId=new Map();
 for(const item of states) {
  const id=Number(item.StateId??item.stateId??item.Id??item.id);
  if(!Number.isInteger(id))continue;
  const value=item.ValueAsString??item.valueAsString??item.Value??item.value??null;
  const rawTime=item.Timestamp??item.timestamp??null;
  const time=typeof rawTime==="string"&&Number.isFinite(Date.parse(rawTime))?new Date(rawTime).toISOString():null;
  byId.set(id,{value,time});
 }
 const number=id=>{const v=byId.get(id)?.value;if(typeof v!=="string"&&typeof v!=="number")return null;
  if(!/^-?\d+(?:\.\d+)?$/.test(String(v).trim()))return null;
  const n=Number(v);return Number.isFinite(n)?n:null;};
 const mode=number(IDS.mode),energy=number(IDS.sessionKwh),power=number(IDS.power);
 return {charging:mode===3,mode,sessionId:byId.get(IDS.session)?.value??null,
  sessionKwh:energy!==null&&energy>=0?energy:null,
  powerKw:power!==null&&power>=0?power/1000:null,
  // SignedMeterValue is not assumed to be kWh without runtime validation.
  signedMeterRaw:byId.get(IDS.signedMeter)?.value??null,
  energyObservedAt:byId.get(IDS.sessionKwh)?.time??null,
  modeObservedAt:byId.get(IDS.mode)?.time??null,
  powerObservedAt:byId.get(IDS.power)?.time??null};
}
export async function zaptecRequest(path,accessToken) {
 const response=await fetch("https://api.zaptec.com"+path,{headers:{Authorization:"Bearer "+accessToken,Accept:"application/json"},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error("Zaptec HTTP "+response.status);
 return response.json();
}
