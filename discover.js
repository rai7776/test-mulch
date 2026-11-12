/* Discover: isolated static article catalog and compact responsive UI. */
(() => {
'use strict';
const state={articles:[],types:[],genres:[],selectedTypes:[],selectedGenres:[],difficulty:'all',sort:'newest',query:'',category:'All',expanded:'',filterOpen:false,article:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const section=()=>document.getElementById('discover-section');
const articleLanguage=a=>a.language||'en';
const articleDescription=a=>(a.descriptions||{})[articleLanguage(a)]||a.description||'';
const sourceLabel=a=>[a.sourceName||a.source||'',a.publishedAt?String(a.publishedAt).slice(0,10).replace(/-/g,'/'):'' ].filter(Boolean).join(' · ');
const matches=a=>{
 const types=state.selectedTypes.length?state.selectedTypes:(state.category!=='All'&&state.types.includes(state.category)?[state.category]:[]);
 const collectionMatch=state.category!=='TOEIC'||a.collection==='TOEIC';
 const genres=state.selectedGenres.length?state.selectedGenres:(state.category!=='All'&&state.genres.includes(state.category)?[state.category]:[]);
 return collectionMatch&&(!types.length||types.includes(a.type))&&(!genres.length||genres.some(g=>(a.genres||[]).includes(g)))&&(state.difficulty==='all'||a.difficulty===state.difficulty)&&(!state.query||[a.title,articleDescription(a),...Object.values(a.descriptions||{}),a.type,...(a.genres||[]),...(a.tags||[])].join(' ').toLowerCase().includes(state.query.toLowerCase()));
};
const results=()=>state.articles.filter(matches).sort((a,b)=>state.sort==='oldest'?Date.parse(a.publishedAt)-Date.parse(b.publishedAt):state.sort==='shortest'?(a.minutes||0)-(b.minutes||0):Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
const summary=(items,empty='すべて')=>items.length?items.join(', '):empty;
function showDiscover(){
 if(typeof flushReadingPositionSave==='function')flushReadingPositionSave();
 if(typeof hideAllSections==='function')hideAllSections();
 section().style.display='block';state.article=null;render();
}
window.showDiscover=showDiscover;
function render(){
 const root=section();if(!root)return;
 const active=state.selectedTypes.length+state.selectedGenres.length+(state.difficulty!=='all'?1:0)+(state.sort!=='newest'?1:0);
 const items=results();
 root.innerHTML=`<div class="discover-inner"><nav class="learning-section-tabs discover-main-tabs" data-main-nav data-active-tab="discover" aria-label="メインセクション"></nav>
 <header class="learning-section-heading discover-heading"><span class="study-center-eyebrow">DISCOVER</span><h2>記事を探す</h2><p class="discover-subtitle">Daily Reading</p></header>
 <div class="discover-categories" role="group" aria-label="カテゴリ">${['All','News','TOEIC','Stories',...state.types.filter(t=>!['News','Stories'].includes(t)),...state.genres].map(c=>`<button type="button" data-category="${esc(c)}" class="${state.category===c?'is-selected':''}">${esc(c==='All'?'すべて':c)}</button>`).join('')}</div>
 <div class="discover-search-row"><input id="discover-search" type="search" placeholder="記事を検索..." aria-label="記事を検索"><button type="button" class="discover-filter-trigger" id="discover-filter-trigger" aria-label="フィルターを開く" aria-expanded="${state.filterOpen}"><span aria-hidden="true">☷</span><span class="discover-filter-label">フィルター</span>${active?`<small>${active}</small>`:''}</button></div>
 <div class="discover-results-label"><span>記事一覧</span><small>${items.length}件</small></div>
 <div class="discover-cards">${items.length?items.map(a=>`<button type="button" class="discover-card" data-article="${esc(a.id)}"><span class="discover-thumbnail" aria-hidden="true">${a.type==='News'?'▤':a.type==='Stories'?'▥':'✉'}</span><span class="discover-card-main"><span class="discover-meta"><span class="discover-pill">${esc(a.genres?.[0]||a.type)}</span> ${esc(a.difficulty||'')} · 約${Number(a.minutes)||3}分</span><strong>${esc(a.title)}</strong>${articleDescription(a)?`<span class="discover-description" lang="${esc(articleLanguage(a))}">${esc(articleDescription(a))}</span>`:""}${sourceLabel(a)?`<span class="discover-source">${esc(sourceLabel(a))}</span>`:""}</span></button>`).join(''):'<p class="discover-empty">条件に一致する記事がありません。フィルターを変更してください。</p>'}</div>
 </div>
 ${state.filterOpen?filterMarkup(items.length):''}`;
 window.SmartReaderMainNavigation?.mount(root);
 const input=root.querySelector('#discover-search');input.value=state.query;
 input.addEventListener('input',e=>{const start=e.target.selectionStart;state.query=e.target.value;render();const next=section().querySelector('#discover-search');next.focus();next.setSelectionRange(start,start);});
 root.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{state.category=b.dataset.category;state.selectedTypes=[];state.selectedGenres=[];render();});
 root.querySelectorAll('[data-article]').forEach(b=>b.onclick=()=>openArticle(b.dataset.article));
 root.querySelector('#discover-filter-trigger').onclick=()=>{state.filterOpen=true;render();};
 if(state.filterOpen)bindFilter();
}
function filterMarkup(count){
 const groups=[
  ['types','種類',summary(state.selectedTypes),'type'],
  ['genres','ジャンル',summary(state.selectedGenres),'genre'],
  ['difficulty','難易度',state.difficulty==='all'?'すべて':state.difficulty,'difficulty'],
  ['sort','並び順',({newest:'新着順',oldest:'古い順',shortest:'短い順'})[state.sort],'sort']
 ];
 return `<div class="discover-overlay" id="discover-overlay"><div class="discover-sheet" role="dialog" aria-modal="true" aria-label="フィルター"><div class="discover-sheet-handle"></div><header><strong>フィルター</strong><button type="button" id="discover-close" aria-label="閉じる">×</button></header><div class="discover-sheet-scroll">${groups.map(([id,title,value])=>`<div class="discover-accordion"><button type="button" class="discover-accordion-head" data-expand="${id}" aria-expanded="${state.expanded===id}"><strong>${title}</strong><span>${esc(value)} <b>${state.expanded===id?'⌃':'⌄'}</b></span></button>${state.expanded===id?optionsMarkup(id):''}</div>`).join('')}</div><footer><button type="button" class="discover-reset" id="discover-reset">リセット</button><button type="button" class="discover-apply" id="discover-apply">${count}件の記事を表示</button></footer></div></div>`;
}
function optionsMarkup(id){
 const options=id==='types'?state.types:id==='genres'?state.genres:id==='difficulty'?['all','初級','中級','上級']:['newest','oldest','shortest'];
 return `<div class="discover-options ${id==='genres'?'discover-options-grid':''}">${options.map(o=>{
 const checked=id==='types'?state.selectedTypes.includes(o):id==='genres'?state.selectedGenres.includes(o):id==='difficulty'?state.difficulty===o:state.sort===o;
 const label=({all:'すべて',newest:'新着順',oldest:'古い順',shortest:'短い順'})[o]||o;
 return `<label><input type="${id==='types'||id==='genres'?'checkbox':'radio'}" name="discover-${id}" value="${esc(o)}" ${checked?'checked':''}><span>${esc(label)}</span></label>`;
 }).join('')}</div>`;
}
function bindFilter(){
 const root=section();
 root.querySelector('#discover-close').onclick=closeFilter;
 root.querySelector('#discover-overlay').addEventListener('click',e=>{if(e.target.id==='discover-overlay')closeFilter();});
 root.querySelectorAll('[data-expand]').forEach(b=>b.onclick=()=>{state.expanded=state.expanded===b.dataset.expand?'':b.dataset.expand;render();});
 root.querySelectorAll('.discover-options input').forEach(i=>i.onchange=()=>{
  const id=i.name.replace('discover-','');
  if(id==='types'||id==='genres'){const key=id==='types'?'selectedTypes':'selectedGenres';state[key]=i.checked?[...state[key],i.value]:state[key].filter(x=>x!==i.value);state.category='All';}
  else state[id]=i.value;
  render();
 });
 root.querySelector('#discover-reset').onclick=()=>{state.selectedTypes=[];state.selectedGenres=[];state.difficulty='all';state.sort='newest';state.category='All';render();};
 root.querySelector('#discover-apply').onclick=closeFilter;
}
function closeFilter(){state.filterOpen=false;render();}
function openArticle(id) {
 const article=state.articles.find(item=>String(item.id)===String(id));
 if(!article)return;
 state.article=article;
 const opening=window.openDiscoverReader?.(article);
 if(opening?.catch)opening.catch(error=>{
  console.error('Discover Reader could not open',error);
  alert('この記事をReaderで開けませんでした。');
 });
}
async function init(){
 const root=section();if(!root)return;
 try{const response=await fetch('discover-data/index.json',{cache:'no-cache'});if(!response.ok)throw Error('HTTP '+response.status);const index=await response.json();state.articles=Array.isArray(index.articles)?index.articles:[];state.types=index.types||[...new Set(state.articles.map(a=>a.type))];state.genres=index.genres||[...new Set(state.articles.flatMap(a=>a.genres||[]))];}
 catch(e){console.warn('Discover catalog unavailable',e);root.dataset.error='true';}
 render();
 const hash=decodeURIComponent(location.hash||'').match(/^#discover\/(.+)$/);if(hash)showDiscover(),openArticle(hash[1]);
 window.addEventListener('hashchange',()=>{const match=decodeURIComponent(location.hash||'').match(/^#discover\/(.+)$/);if(match){showDiscover();openArticle(match[1]);}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();