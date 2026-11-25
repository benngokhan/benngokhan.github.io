(() => {
  'use strict';
  const TELEMETRY = 'https://raw.githubusercontent.com/benngokhan/yt_auto_uploader/main/panel_telemetry.json';
  const RUNS = 'https://api.github.com/repos/benngokhan/yt_auto_uploader/actions/runs?per_page=100';
  const defs = [
    {id:'motor', name:'Video motoru', role:'Üretim', icon:'✦', color:'#8d80ff', file:['motor-uret.yml','motor-paket-uret.yml']},
    {id:'upload', name:'Yükleyici', role:'Aktarım', icon:'↗', color:'#51d8b0', file:['youtube-drive-uploader.yml']},
    {id:'telemetry', name:'Veri işçisi', role:'Senkron', icon:'◉', color:'#73c9ff', file:['panel-telemetry.yml']},
    {id:'guard', name:'Slot bekçisi', role:'Kontrol', icon:'◇', color:'#f1bc70', file:['slot-watchdog.yml']},
    {id:'analytics', name:'Analitik', role:'Rapor', icon:'▥', color:'#ff91b3', file:['retansiyon-raporu.yml']}
  ];
  const $ = s => document.querySelector(s);
  const els = {sync:$('#sync'), status:$('#status'), queue:$('#queue'), inv:$('#inv'), covers:$('#covers'), stock:$('#stock'), telemetryTime:$('#telemetry-time'), runsTime:$('#runs-time'), workers:$('#workers'), events:$('#events'), countdown:$('#countdown'), slot:$('#slot'), refresh:$('#refresh'), info:$('#info'), notice:$('#notice'), room:$('#room-content'), roomStages:$('#room-stages')};
  let data=null, runs=[], runsOk=false, readAt=null, loadBusy=false, seenRuns=null, changedWorkers=new Set(), pulseTimer=null;
  const fmt = d => {try { return new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(d)); }catch{return '—'}};
  const nowTR = () => new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
  const ageText = iso => { const ms=Date.now()-Date.parse(iso); if (!Number.isFinite(ms)) return 'zaman bilinmiyor'; if(ms < -300000) return 'tarih gelecekte · saat kontrolü gerekli'; if(ms<60000)return 'az önce'; if(ms<3600000)return Math.floor(ms/60000)+' dk önce'; if(ms<86400000)return Math.floor(ms/3600000)+' sa önce';return Math.floor(ms/86400000)+' gün önce'; };
  function safeNumber(x){return typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null}
  function text(el, val){ if(el)el.textContent=val; }
  function stateOf(r) {
    if (!runsOk || !r) return {kind:'unknown',label:'Bilgi yok', short:'Bilinmiyor'};
    if (['in_progress'].includes(r.status)) return {kind:'active',label:'Koşu çalışıyor',short:'Çalışıyor'};
    if (['queued','requested','waiting','pending'].includes(r.status)) return {kind:'waiting',label:'Koşu bekliyor',short:'Bekliyor'};
    if (r.status !== 'completed') return {kind:'unknown',label:'Durum bilinmiyor',short:'Bilinmiyor'};
    const c=r.conclusion;
    if (c==='success') return {kind:'done',label:'Son koşu başarılı',short:'Başarılı'};
    if (c==='failure'||c==='timed_out'||c==='startup_failure') return {kind:'failed',label:'Son koşu başarısız',short:'Başarısız'};
    if(c==='cancelled')return {kind:'waiting',label:'Son koşu iptal edildi',short:'İptal'};
    if(c==='skipped'||c==='neutral')return {kind:'unknown',label:'Son koşu atlandı',short:'Atlandı'};
    return {kind:'unknown',label:'Sonuç bilinmiyor',short:'Bilinmiyor'};
  }
  function definition(run){const path=String(run.path||'').split('@')[0];const name=path.split('/').pop();return defs.find(d=>d.file.includes(name));}
  function card(d,r){
    const st=stateOf(r), div=document.createElement('article'); div.className='worker '+st.kind+(changedWorkers.has(d.id)?' recently-changed':'');div.style.setProperty('--accent',d.color);
    div.innerHTML='<div class="station"><div class="halo"></div><div class="terminal"><i></i><i></i><i></i></div><div class="mascot"><span class="ear left"></span><span class="ear right"></span><span class="face"><b></b><b></b></span><span class="body"></span></div><div class="desk"></div><span class="station-icon"></span></div><div class="worker-info"><div class="w-top"><span class="worker-role"></span><span class="light"></span></div><h3></h3><span class="state"></span><small></small></div>';
    div.querySelector('.station-icon').textContent=d.icon;div.querySelector('.worker-role').textContent=d.role;div.querySelector('h3').textContent=d.name;div.querySelector('.state').textContent=st.label;div.querySelector('small').textContent=r&&runsOk?'Son koşu: '+fmt(r.created_at)+' TR':'Son 100 koşuda kayıt yok veya bağlantı yok';return div;
  }
  function renderOffice(){
    if(!els.room)return;
    els.room.replaceChildren();
    const positions=[11,30.5,50,69.5,89], travels=[160,85,0,-85,-160];
    defs.forEach((d,i)=>{
      const related=runs.filter(r=>definition(r)?.id===d.id);
      const r=related.find(r=>['in_progress','queued','requested','waiting','pending'].includes(r.status))||related[0];
      const st=stateOf(r),desk=document.createElement('div');desk.className='room-desk '+st.kind;desk.style.setProperty('--x',positions[i]+'%');desk.style.setProperty('--c',d.color);
      desk.innerHTML='<div class="room-monitor"></div><div class="room-mug"></div><div class="shelf"></div><div class="desk-sign"><span></span><small></small></div>';
      desk.querySelector('.desk-sign span').textContent=d.name;const lab=desk.querySelector('.desk-sign small');lab.textContent=st.label;lab.className=st.kind==='active'?'on':st.kind==='failed'?'bad':'off';els.room.append(desk);
      const actor=document.createElement('div');actor.className='room-actor '+st.kind+(changedWorkers.has(d.id)?' recently-changed':'');actor.style.setProperty('--x',positions[i]+'%');actor.style.setProperty('--accent',d.color);actor.style.setProperty('--travel',travels[i]+'px');actor.style.setProperty('--delay',(-i*1.2)+'s');actor.style.setProperty('--idle-duration',(8+i*1.3)+'s');actor.style.setProperty('--work-duration',(6+i*.35)+'s');
      actor.innerHTML='<span class="actor-name"></span><div class="mascot"><span class="ear left"></span><span class="ear right"></span><span class="face"><b></b><b></b></span><span class="body"></span></div><span class="work-packet" aria-hidden="true">▤</span>';actor.querySelector('.actor-name').textContent=st.kind==='active'?'● '+d.role+' sürüyor':d.role;actor.setAttribute('aria-label',d.name+': '+st.label);els.room.append(actor);
    });
    if(!runsOk){text(els.roomStages,'İş akışı bilgisi alınamadı; hareketler yalnız dekoratif.');return;}
    const active=runs.filter(r=>r.status==='in_progress'&&definition(r));
    if(!active.length){text(els.roomStages,'Son 100 kayıtta çalışan iş akışı görünmüyor. Bekleme hareketleri dekoratif.');return;}
    text(els.roomStages,active.map(r=>definition(r).name+': '+(r._stage||'İş akışı çalışıyor · adım ayrıntısı bilinmiyor')).join('  ·  '));
  }
  function renderRuns(){
    els.workers.replaceChildren();defs.forEach(d=>{const related=runs.filter(r=>definition(r)?.id===d.id); const running=related.find(r=>['in_progress','queued','requested','waiting','pending'].includes(r.status));els.workers.append(card(d,running||related[0]));});
    const visible=runsOk?runs.filter(r=>definition(r)).slice(0,6):[]; els.events.replaceChildren();
    if(!visible.length){ const d=document.createElement('p');d.className='empty';d.textContent=runsOk?'Son 100 koşuda gösterilebilir kayıt bulunamadı.':'Olaylar alınamadı. Eski bir olay canlıymış gibi gösterilmiyor.';els.events.append(d); }
    visible.forEach(r=>{const def=definition(r),st=stateOf(r), div=document.createElement('div');div.className='event '+st.kind;const title=document.createElement('strong'), sub=document.createElement('span'), t=document.createElement('time');title.textContent=def.name+' · '+st.label;sub.textContent=def.id==='upload'&&st.kind==='done'?'Başarılı koşu yayınlandığını tek başına doğrulamaz.':'GitHub Actions kaydı';t.textContent=fmt(r.created_at)+' TR';const desc=document.createElement('div');desc.append(title,sub);div.append(desc,t);els.events.append(div)});
    renderOffice();
    text(els.runsTime,runsOk&&readAt?'Actions okundu: '+fmt(readAt)+' TR':'Actions verisi alınamadı');
  }
  function renderData(){
    const q=data?.queue_summary, inv=data?.drive_inventory;const ready=safeNumber(q?.ready_shorts),stock=safeNumber(q?.days_of_stock), videos=Array.isArray(inv?.shorts_videos)?inv.shorts_videos.length:null, missing=Array.isArray(q?.missing_covers)?q.missing_covers.length:null;
    text(els.queue,ready??'—'); text(els.stock,stock===null?'—':stock+' gün');text(els.inv,videos??'—');text(els.covers,missing??'—');
    const date=data?.generated_at_iso; const age=date?ageText(date):'veri yok';text(els.telemetryTime,date?'Telemetri: '+fmt(date)+' TR · '+age:'Telemetriye ulaşılamadı');
    const dt=date?Date.now()-Date.parse(date):Infinity;const stale=!Number.isFinite(dt)||dt>95*60000||dt< -300000;
    els.status.className='freshness '+(stale?'stale':'fresh');text(els.status,stale?'VERİ ESKİ / KONTROL ET':'TELEMETRİ GÜNCEL');
    const slot=data?.schedule_rules?.daily_slots_tr?.[0]; text(els.slot,typeof slot==='string'&&/^\d\d:\d\d$/.test(slot)?slot+' TR':'Saat bilinmiyor');
    text(els.notice, 'Kuyruk ve Drive sayıları son telemetridir; günlük stok tahmindir. Çalıştırma başarısı yayın kanıtı değildir.');
    countdown();
  }
  function countdown(){
    const slot=data?.schedule_rules?.daily_slots_tr?.[0];if(!/^\d\d:\d\d$/.test(slot||'')){text(els.countdown,'—');return}
    const [h,m]=slot.split(':').map(Number);if(h>23||m>59){text(els.countdown,'—');return}
    // Istanbul is UTC+3; derive the next configured slot without trusting device timezone.
    const now=Date.now(), tr=new Date(now+3*3600000), candidate=Date.UTC(tr.getUTCFullYear(),tr.getUTCMonth(),tr.getUTCDate(),h-3,m), next=candidate<=now?candidate+86400000:candidate;
    const n=Math.max(0,Math.floor((next-now)/1000)), pad=x=>String(x).padStart(2,'0');text(els.countdown,`${pad(Math.floor(n/3600))}:${pad(Math.floor(n%3600/60))}:${pad(n%60)}`);
  }
  async function fetchJson(url,extra){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const res=await fetch(url,{cache:'no-store',...extra,signal:controller.signal});if(!res.ok)throw new Error('HTTP '+res.status);return await res.json()}finally{clearTimeout(timer)}}
  async function loadRuns(force){
    const key='bd-office-actions-v1';
    if(!force){try{const c=JSON.parse(localStorage.getItem(key)||'null');const age=Date.now()-Number(c?.readAt);if(c&&age>=0&&age<90000&&Array.isArray(c.runs))return {workflow_runs:c.runs,readAt:c.readAt}}catch(_){}}
    const result=await fetchJson(RUNS,{headers:{Accept:'application/vnd.github+json'}});
    if(!Array.isArray(result?.workflow_runs))throw new Error('Actions veri biçimi hatalı');
    const records=result.workflow_runs.map(r=>({id:r.id,path:r.path,status:r.status,conclusion:r.conclusion,created_at:r.created_at}));
    // Read only explicitly running jobs, never dispatch or modify workflows.
    // Bound extra calls; absent/failed job details stay unknown rather than invented.
    const active=records.filter(r=>r.status==='in_progress'&&definition(r)).slice(0,2);
    await Promise.all(active.map(async r=>{try{
      const jobs=await fetchJson('https://api.github.com/repos/benngokhan/yt_auto_uploader/actions/runs/'+encodeURIComponent(r.id)+'/jobs?per_page=100',{headers:{Accept:'application/vnd.github+json'}});
      const step=(jobs.jobs||[]).flatMap(j=>j.steps||[]).find(x=>x.status==='in_progress');if(!step)return;
      const name=String(step.name||'').toLowerCase();
      if(name.includes('upload one queued video'))r._stage='Yükleme adımı yürütülüyor · yayın doğrulanmadı';
      else if(name.includes('sync drive inventory'))r._stage='Drive ve tablo senkronu adımı yürütülüyor';
      else if(name.includes('resolve publication slot'))r._stage='Yayın slotu belirleme adımı yürütülüyor';
      else if(name.includes('generate once'))r._stage='Üretim adımı yürütülüyor';
      else if(name.includes('video yayina cikti mi'))r._stage='Yayın kontrolü adımı yürütülüyor';
      else if(name.includes('checkout')||name.includes('install dependencies')||name.includes('set up'))r._stage='Ortam hazırlığı adımı yürütülüyor';
      else r._stage='Bir iş akışı adımı yürütülüyor';
    }catch(_){}}));
    const stamp=Date.now();
    try{localStorage.setItem(key,JSON.stringify({readAt:stamp,runs:records}))}catch(_){}
    return {workflow_runs:records,readAt:stamp};
  }
  async function refresh(force=false){
    if(loadBusy)return;loadBusy=true;els.refresh.disabled=true;text(els.sync,'Kaynaklar okunuyor…');
    const [a,b]=await Promise.allSettled([fetchJson(TELEMETRY),loadRuns(force)]);
    if(a.status==='fulfilled'&&a.value&&typeof a.value==='object')data=a.value;else data=null;
    if(b.status==='fulfilled'&&Array.isArray(b.value?.workflow_runs)){
      runs=b.value.workflow_runs;runsOk=true;readAt=b.value.readAt;
      const current=new Map(runs.filter(r=>definition(r)).map(r=>[String(r.id),r.status+':'+String(r.conclusion)]));
      changedWorkers=new Set();
      if(seenRuns){for(const r of runs){const id=String(r.id);if(definition(r)&&(!seenRuns.has(id)||seenRuns.get(id)!==current.get(id)))changedWorkers.add(definition(r).id)}}
      seenRuns=current;
      clearTimeout(pulseTimer);pulseTimer=setTimeout(()=>{changedWorkers=new Set();document.querySelectorAll('.recently-changed').forEach(el=>el.classList.remove('recently-changed'))},6500);
    } else {runs=[];runsOk=false;readAt=null;changedWorkers=new Set();}
    renderData();renderRuns();text(els.sync,a.status==='fulfilled'&&runsOk?'Kaynaklar okundu': 'Bazı kaynaklara ulaşılamadı');els.refresh.disabled=false;loadBusy=false;
  }
  // No autoplay: browsers and visitors stay in control of the original ambient loop.
  const audio=$('#ambient-audio'), soundButton=$('#sound-button'), volume=$('#sound-volume');
  let initialVolume=12;
  try { const saved=localStorage.getItem('bilgidozu-ofis-muzik-ses'); if(saved!==null&&Number.isFinite(Number(saved)))initialVolume=Math.max(0,Math.min(100,Number(saved))); } catch(_){}
  volume.value=String(initialVolume);audio.volume=initialVolume/100;
  function soundState(){const playing=!audio.paused;soundButton.textContent=playing?'Ⅱ Müziği durdur':'♪ Müziği aç';soundButton.setAttribute('aria-pressed',String(playing))}
  soundButton.addEventListener('click',async()=>{if(audio.paused){try{await audio.play()}catch(_){soundButton.textContent='Müzik açılamadı';soundButton.setAttribute('aria-pressed','false');return}}else audio.pause();soundState()});
  audio.addEventListener('play',soundState);audio.addEventListener('pause',soundState);
  volume.addEventListener('input',()=>{audio.volume=Number(volume.value)/100;try{localStorage.setItem('bilgidozu-ofis-muzik-ses',volume.value)}catch(_){} });
  $('#clock').textContent=nowTR()+' TR';setInterval(()=>{text($('#clock'),nowTR()+' TR');countdown();if(data?.generated_at_iso)renderData()},1000);
  els.refresh.addEventListener('click',()=>refresh(true));els.info.addEventListener('click',()=>{const panel=$('#explain');panel.hidden=!panel.hidden;els.info.setAttribute('aria-expanded',String(!panel.hidden))});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  renderData();renderRuns();refresh();setInterval(()=>{if(!document.hidden)refresh()},90000);
})();
