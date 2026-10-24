const encoder=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb64=str=>Uint8Array.from(atob(str.replace(/-/g,"+").replace(/_/g,"/")),x=>x.charCodeAt(0));
async function key(secret){if(typeof secret!=="string"||secret.length<32)throw Error("Missing encryption key");
 const hash=await crypto.subtle.digest("SHA-256",encoder.encode(secret));
 return crypto.subtle.importKey("raw",hash,"AES-GCM",false,["encrypt","decrypt"]);}
export async function encrypt(value,secret){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const data=await crypto.subtle.encrypt({name:"AES-GCM",iv},await key(secret),encoder.encode(value));
 return b64(iv)+"."+b64(new Uint8Array(data));
}
export async function decrypt(value,secret){
 const [a,b]=String(value).split(".");
 if(!a||!b)throw Error("Invalid encrypted value");
 const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(a)},await key(secret),unb64(b));
 return new TextDecoder().decode(plain);
}
export async function digest(value){
 const data=await crypto.subtle.digest("SHA-256",encoder.encode(value));
 return [...new Uint8Array(data)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export function randomSession(){return b64(crypto.getRandomValues(new Uint8Array(32)));}
