export const TAG_RE = /\[(IMG|PHOTO)\s*:\s*([a-z0-9_-]+)(?:\s*\/\s*([a-z0-9_-]+))?\s*\]/gi;
export const normalizeId = s => String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9_-]+/g,'_').replace(/^[_-]+|[_-]+$/g,'').slice(0,64);
export function parseTags(input) {
  return [...String(input||'').matchAll(new RegExp(TAG_RE.source,'gi'))].map(m=>({
    raw:m[0],type:m[1].toUpperCase(),character:normalizeId(m[2]),action:normalizeId(m[3]||'default'),index:m.index
  }));
}
export function chooseImage(available,requested) {
  const s=new Set(available||[]);
  return s.has(requested)?requested:s.has('default')?'default':null;
}
