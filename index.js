import { parseTags, normalizeId, chooseImage } from './core.mjs';

const KEY='contextvn_inline_images';
const DB='contextvn_images_v1';
const STORE='assets';
const defaults={enabled:true, selectedProfile:'default', profiles:{default:{name:'Default',characters:{}}}};
let settings, dbPromise, ui, scheduled=false, generation=0, observer;
const cache=new Map();

function context(){return globalThis.SillyTavern?.getContext?.();}
function notify(message,type='info'){if(globalThis.toastr?.[type])globalThis.toastr[type](message,'ContextVN');else console.log('[ContextVN]',message);}
function save(){context()?.saveSettingsDebounced?.();}
function id(s){return normalizeId(s);}
function currentProfileId(){
 const override=context()?.chatMetadata?.contextvn_profile;
 return (override&&settings.profiles[override])?override:settings.selectedProfile;
}
function currentProfile(){return settings.profiles[currentProfileId()]||settings.profiles.default;}
function imageKey(p,c,a){return [p,c,a].join('::');}
function loadSettings(){
 const c=context();if(!c?.extensionSettings)throw new Error('SillyTavern extension settings unavailable');
 c.extensionSettings[KEY] ||= structuredClone(defaults);
 settings=c.extensionSettings[KEY];
 settings.profiles ||= structuredClone(defaults.profiles);
 if(!settings.profiles.default)settings.profiles.default={name:'Default',characters:{}};
 settings.selectedProfile ||= 'default';
 if(settings.enabled===undefined)settings.enabled=true;
}
function db(){
 if(!dbPromise) dbPromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
 return dbPromise;
}
async function readImage(key){
 const database=await db();
 return new Promise((resolve,reject)=>{
  const request=database.transaction(STORE,'readonly').objectStore(STORE).get(key);
  request.onsuccess=()=>resolve(request.result||null);
  request.onerror=()=>reject(request.error);
 });
}
async function writeImage(key,blob){
 const database=await db();
 return new Promise((resolve,reject)=>{
  const transaction=database.transaction(STORE,'readwrite');
  transaction.objectStore(STORE).put(blob,key);
  transaction.oncomplete=resolve;
  transaction.onerror=()=>reject(transaction.error);
 });
}
async function removeImage(key){
 const database=await db();
 return new Promise((resolve,reject)=>{
  const transaction=database.transaction(STORE,'readwrite');
  transaction.objectStore(STORE).delete(key);
  transaction.oncomplete=resolve;
  transaction.onerror=()=>reject(transaction.error);
 });
}
async function srcFor(key){
 if(cache.has(key))return cache.get(key);
 const blob=await readImage(key);
 if(!blob)return null;
 const url=URL.createObjectURL(blob);cache.set(key,url);return url;
}
function invalidateUrl(key){if(cache.has(key)){URL.revokeObjectURL(cache.get(key));cache.delete(key);}}
function element(tag,text,cls){
 const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;
}
function button(label,cb){const e=element('button',label);e.type='button';e.addEventListener('click',cb);return e;}
function input(placeholder){const e=element('input');e.placeholder=placeholder;return e;}
function row(...children){const e=element('div',undefined,'cvn-row');e.append(...children);return e;}
function scanSoon(){
 if(scheduled)return;scheduled=true;
 setTimeout(()=>{scheduled=false;try{scan();}catch(e){console.error('[ContextVN]',e);}},120);
}
function refresh(){
 generation++;
 for(const mes of document.querySelectorAll('#chat .mes'))delete mes.dataset.cvnHash;
 scanSoon();
}
async function upload(profile,character,action,file){
 if(!file||!(/image\/(png|jpeg|webp|gif)/.test(file.type))||file.size>25*1024*1024)throw new Error('Choose a PNG, JPEG, GIF or WebP under 25MB');
 if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(character)||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(action))throw new Error('Invalid character or action ID');
 const key=imageKey(profile,character,action);
 await writeImage(key,file);invalidateUrl(key);
 const chars=settings.profiles[profile].characters;
 chars[character] ||= {name:character,actions:[]};
 if(!chars[character].actions.includes(action))chars[character].actions.push(action);
 chars[character].actions.sort();
 save();refresh();
}
function showPanel(){
 if(!ui)return;
 ui.replaceChildren();
 ui.append(element('strong','ContextVN · Inline Images'));
 const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=!!settings.enabled;
 enabled.addEventListener('change',()=>{settings.enabled=enabled.checked;save();refresh();});
 ui.append(row(enabled,element('span','Enable inline images')));
 const prof=document.createElement('select');
 for(const [key,p] of Object.entries(settings.profiles)){
  const o=document.createElement('option');o.value=key;o.textContent=p.name||key;prof.append(o);
 }
 prof.value=currentProfileId();
 prof.addEventListener('change',async()=>{
  if(context()?.chatMetadata){
   context().chatMetadata.contextvn_profile=prof.value;
   await context().saveMetadata?.();
  }else settings.selectedProfile=prof.value;
  save();refresh();showPanel();
 });
 ui.append(element('small','Profile for current chat'),prof);
 const newProf=input('New profile ID (e.g. oakridge)');
 ui.append(row(newProf,button('Create profile',()=>{
  const name=id(newProf.value);
  if(!name)return notify('Enter a profile ID','warning');
  settings.profiles[name] ||= {name,characters:{}};
  if(context()?.chatMetadata){context().chatMetadata.contextvn_profile=name;void context().saveMetadata?.();}
  else settings.selectedProfile=name;
  save();refresh();showPanel();
 })));
 const cid=input('character_id');const action=input('action (default, cooking, stern...)');
 const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp,image/gif';
 ui.append(element('small','Upload image into selected profile'),cid,action,file,
  button('Save image',async()=>{
   try{await upload(currentProfileId(),id(cid.value),id(action.value||'default'),file.files?.[0]);notify('Image saved','success');showPanel();}
   catch(e){notify(e.message,'error');}
  }));
 const bulk=document.createElement('input');bulk.type='file';bulk.multiple=true;bulk.accept='image/png,image/jpeg,image/webp,image/gif';
 ui.append(element('small','Bulk naming: character_id__action.webp'),bulk,
  button('Bulk upload',async()=>{
   let added=0;
   for(const f of bulk.files||[]){
    const m=/^([a-z0-9_-]+)__([a-z0-9_-]+)\.(png|jpe?g|webp|gif)$/i.exec(f.name);
    if(!m)continue;
    try{await upload(currentProfileId(),id(m[1]),id(m[2]),f);added++;}catch(e){console.warn('[ContextVN]',e);}
   }
   notify('Imported '+added+' images',added?'success':'warning');showPanel();
  }));
 const chars=currentProfile()?.characters||{};
 ui.append(element('strong','Image library'));
 for(const [character,meta] of Object.entries(chars)){
  ui.append(element('small',character+': '+(meta.actions||[]).join(', ')));
  for(const actionName of meta.actions||[]){
   ui.append(button('Remove '+character+'/'+actionName,async()=>{
    if(!confirm('Delete '+character+'/'+actionName+'?'))return;
    const key=imageKey(currentProfileId(),character,actionName);
    await removeImage(key);invalidateUrl(key);meta.actions=meta.actions.filter(a=>a!==actionName);
    save();refresh();showPanel();
   }));
  }
 }
 ui.append(element('small','Use [IMG: angela_white/cooking] for inline illustrations, or [PHOTO: angela_white/cooking] for photos sent in chat. Missing actions use default.'));
}
function setupUi(){
 const toggle=button('🖼 ContextVN',()=>{ui.hidden=!ui.hidden;if(!ui.hidden)showPanel();});toggle.id='cvn-toggle';
 ui=element('section',undefined);ui.id='cvn-panel';ui.hidden=true;
 document.body.append(toggle,ui);
}
function assistant(mes){
 const user=mes.getAttribute('is_user');
 return user==='false'||(user!== 'true'&&!mes.classList.contains('is_user')&&!mes.classList.contains('is_system'));
}
function sourceText(mes){
 const index=Number(mes.getAttribute('mesid'));
 const chat=context()?.chat;
 return Number.isInteger(index)&&index>=0&&Array.isArray(chat)&&chat[index]&&!chat[index].is_user ? String(chat[index].mes||'') : '';
}
function hash(s){
 let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);
 return (h>>>0).toString(16);
}
function restoreMarkup(target){
 for(const node of target.querySelectorAll('.cvn-photo-frame'))node.replaceWith(document.createTextNode(node.dataset.cvnRaw||''));
}
function makeImage(tag,profile,version){
 const figure=element('figure',undefined,'cvn-photo-frame');figure.dataset.cvnRaw=tag.raw;
 const label=element('figcaption',tag.character.replaceAll('_',' ')+(tag.action==='default'?'':' · '+tag.action.replaceAll('_',' ')));
 const holder=element('div','Loading image…');figure.append(holder,label);
 (async()=>{
  try{
   const meta=settings.profiles[profile]?.characters?.[tag.character];
   const action=chooseImage(meta?.actions,tag.action);
   if(!action){
    holder.textContent='No image for '+tag.character+' (upload default)';
    figure.classList.add('cvn-missing');return;
   }
   const url=await srcFor(imageKey(profile,tag.character,action));
   if(version!==generation||!figure.isConnected)return;
   if(!url){holder.textContent='Image not available in this browser';figure.classList.add('cvn-missing');return;}
   const img=element('img');img.className='cvn-image';img.alt=(meta?.name||tag.character)+' — '+action;
   img.src=url;img.loading='lazy';holder.replaceWith(img);
   if(tag.action!==action)label.textContent+=' (default fallback)';
  }catch(error){console.error('[ContextVN]',error);holder.textContent='Could not load image';}
 })();
 return figure;
}
function renderMessage(mes,profile,version){
 if(!assistant(mes))return;
 const target=mes.querySelector('.mes_text');if(!target)return;
 const source=sourceText(mes);
 const sig=hash(source+'|'+profile+'|'+String(settings.enabled));
 const existing=target.querySelector('.cvn-photo-frame');
 if(mes.dataset.cvnHash===sig&&(!parseTags(source).length||existing||!settings.enabled))return;
 restoreMarkup(target);
 if(!settings.enabled){mes.dataset.cvnHash=sig;return;}
 const walker=document.createTreeWalker(target,NodeFilter.SHOW_TEXT);
 const nodes=[];let n;
 while(n=walker.nextNode()){
  if(n.parentElement?.closest('code,pre,script,style,textarea,.cvn-photo-frame'))continue;
  if(parseTags(n.textContent).length)nodes.push(n);
 }
 for(const node of nodes){
  const text=node.textContent,tags=parseTags(text);let offset=0;
  const fragment=document.createDocumentFragment();
  for(const t of tags){
   if(t.index>offset)fragment.append(document.createTextNode(text.slice(offset,t.index)));
   fragment.append(makeImage(t,profile,version));offset=t.index+t.raw.length;
  }
  if(offset<text.length)fragment.append(document.createTextNode(text.slice(offset)));
  node.replaceWith(fragment);
 }
 mes.dataset.cvnHash=sig;
}
function scan(){
 const chat=document.querySelector('#chat');if(!chat)return;
 const profile=currentProfileId(),version=generation;
 for(const mes of chat.querySelectorAll('.mes'))renderMessage(mes,profile,version);
}
function watch(){
 const chat=document.querySelector('#chat');
 if(!chat){setTimeout(watch,1000);return;}
 observer=new MutationObserver(records=>{
  if(records.every(r=>r.target?.parentElement?.closest?.('.cvn-photo-frame')||r.target?.closest?.('.cvn-photo-frame')))return;
  scanSoon();
 });
 observer.observe(chat,{childList:true,subtree:true,characterData:true});
 scanSoon();
}
function initialize(){
 try{
  loadSettings();setupUi();watch();
  const ctx=context();const es=ctx?.eventSource,types=ctx?.event_types;
  if(es&&types){
   for(const name of ['CHAT_CHANGED','MESSAGE_EDITED','MESSAGE_SWIPED','MESSAGE_DELETED','CHARACTER_MESSAGE_RENDERED','GENERATION_ENDED']){
    if(types[name])es.on(types[name],()=>{if(name==='CHAT_CHANGED'){generation++;showPanel();}scanSoon();});
   }
  }
  console.info('[ContextVN] Inline Images extension v0.1.1 ready');
 }catch(error){console.error('[ContextVN] Initialization failed',error);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
