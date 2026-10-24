import test from "node:test";
import assert from "node:assert/strict";
import {calculateQuarters,splitTimedEnergy} from "../src/quarter-calculation.js";
test("exact quarter meter readings",()=>{
 const prices={"2026-10-24T06:00:00.000Z":1.2};
 const rows=calculateQuarters([
 {observed_at:"2026-10-24T06:00:00Z",meter_kwh:1250},
 {observed_at:"2026-10-24T06:15:00Z",meter_kwh:1252.75}],prices);
 assert.equal(rows.length,1);assert.equal(rows[0].kwh,2.75);assert.equal(rows[0].price_dkk,3.3);
});
test("missing boundary never invents precise quarter",()=>{
 assert.equal(calculateQuarters([
 {observed_at:"2026-10-24T06:00:00Z",meter_kwh:10},
 {observed_at:"2026-10-24T06:30:00Z",meter_kwh:15}],{}).length,0);
});
test("non-boundary sessions are labeled estimates",()=>{
 const parts=splitTimedEnergy("2026-10-24T00:08:00Z","2026-10-24T01:06:00Z",11.6);
 assert.deepEqual(parts.map(x=>(Date.parse(x.to)-Date.parse(x.from))/60000),[7,15,15,15,6]);
 assert.ok(parts.every(x=>x.quality==="estimated_uniform_power"));
});
test("meter reset is rejected",()=>assert.throws(()=>calculateQuarters([
 {observed_at:"2026-10-24T06:00:00Z",meter_kwh:100},
 {observed_at:"2026-10-24T06:15:00Z",meter_kwh:99}],{})));
