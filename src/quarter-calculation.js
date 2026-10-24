// Pure calculation. Readings must be verified cumulative kWh meter readings.
// Only exact 15-minute boundary readings can produce an exact quarter cost.
// UTC boundaries avoid daylight-saving ambiguity.
export function calculateQuarters(readings, priceByQuarter) {
  if (!Array.isArray(readings)) throw new TypeError("readings must be an array");
  const points = readings.map(r=>({at:Date.parse(r.observed_at),kwh:r.meter_kwh}))
    .filter(r=>Number.isFinite(r.at)&&Number.isFinite(r.kwh))
    .sort((a,b)=>a.at-b.at);
  const unique = new Map();
  for(const p of points) {
    if(unique.has(p.at)&&unique.get(p.at)!==p.kwh)throw Error("Conflicting meter readings");
    unique.set(p.at,p.kwh);
  }
  const ordered=[...unique].map(([at,kwh])=>({at,kwh}));
  const result=[];
  for(let i=1;i<ordered.length;i++){
    const before=ordered[i-1],after=ordered[i];
    if(after.kwh<before.kwh)throw Error("Meter decreased: reset or invalid readings");
    const interval=15*60*1000;
    if(after.at-before.at!==interval||before.at%interval!==0||after.at%interval!==0)continue;
    const key=new Date(before.at).toISOString();
    const price=priceByQuarter?.[key];
    const kwh=after.kwh-before.kwh;
    result.push({quarter_start_utc:key,kwh,
      price_dkk:Number.isFinite(price)?Math.round(kwh*price*10000)/10000:null,
      price_quality:Number.isFinite(price)?"measured_boundaries":"price_missing"});
  }
  return result;
}

// Display-only approximate allocation for an off-boundary start/stop.
// Never mark interpolated values as exact.
export function splitTimedEnergy(startTime,endTime,energyKwh) {
  const start=Date.parse(startTime),end=Date.parse(endTime);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!Number.isFinite(energyKwh)||energyKwh<0)
    throw new Error("Invalid interval");
  const quarter=900000,parts=[];
  for(let t=start;t<end;){
    const next=Math.min(end,(Math.floor(t/quarter)+1)*quarter);
    parts.push({from:new Date(t).toISOString(),to:new Date(next).toISOString(),
      kwh_estimate:energyKwh*(next-t)/(end-start),quality:"estimated_uniform_power"});
    t=next;
  }
  return parts;
}
