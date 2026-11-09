/* =========================================================
   UTILIDADES
   ========================================================= */
   const DB_KEY='PrestaMe_v1';
   const $=(s,r=document)=>r.querySelector(s);
   const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
   const uid=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
   const r2=n=>Math.round((Number(n)||0)*100)/100;
   const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   const sum=(a,f)=>a.reduce((s,x)=>s+(Number(f(x))||0),0);
   const MESES=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
   const FREQ={semanal:{d:7,l:'Semanal'},quincenal:{d:15,l:'Quincenal'},bisemanal:{d:14,l:'Bisemanal'},mensual:{d:0,l:'Mensual'}};
   
   const isoOf=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
   const hoyISO=()=>isoOf(new Date());
   const parseISO=s=>{const[y,m,d]=String(s||'').split('-').map(Number);return new Date(y||1970,(m||1)-1,d||1);};
   const fmtFecha=s=>{if(!s)return'—';const p=String(s).split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s;};
   const addDias=(s,n)=>{const d=parseISO(s);d.setDate(d.getDate()+Number(n));return isoOf(d);};
   const addMeses=(s,n)=>{
    const d = parseISO(s);
    const day = d.getDate();
    d.setDate(1);                              // evita el desborde
    d.setMonth(d.getMonth() + Number(n));
    const lastDay = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    d.setDate(Math.min(day, lastDay));          // clamp al último día del mes
    return isoOf(d);
  };
   const diasEntre=(a,b)=>Math.round((parseISO(b)-parseISO(a))/86400000);
   const money=n=>new Intl.NumberFormat('es-DO',{style:'currency',currency:'DOP',minimumFractionDigits:2,maximumFractionDigits:2}).format(isFinite(n)?n:0);
   const numF=n=>new Intl.NumberFormat('es-DO',{maximumFractionDigits:2}).format(isFinite(n)?n:0);
   const buzz=()=>{try{navigator.vibrate&&navigator.vibrate(20);}catch(e){}};
   

   /* ── Carga diferida de librerías PDF ─────────── */
async function loadPDFLibs(){
  if (window.jspdf && window.html2canvas) return;
  await Promise.all([
    new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    }),
    new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    })
  ]);
}

/* ── Convierte un elemento HTML en Blob PDF ──── */
async function elementToPDFBlob(el){
  await loadPDFLibs();
  const clone = el.cloneNode(true);

  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;left:-9999px;top:0;background:#fff;color:#111;' +
    'padding:40px;width:720px;font-family:system-ui,-apple-system,sans-serif;' +
    'font-size:13px;line-height:1.5';
  wrap.appendChild(clone);
  document.body.appendChild(wrap);

  let canvas;
  try {
    canvas = await html2canvas(wrap, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      onclone: (doc) => {
        doc.documentElement.removeAttribute('data-theme');
        doc.documentElement.style.colorScheme = 'light';
      }
    });
  } finally {
    document.body.removeChild(wrap);
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;

  let heightLeft = imgH, position = 0;
  pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
  heightLeft -= pageH;
  while (heightLeft > 0){
    position = heightLeft - imgH;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
    heightLeft -= pageH;
  }
  return pdf.output('blob');
}
   /* =========================================================
      STORAGE
      ========================================================= */
   function loadDB(){
     try{
       const raw=localStorage.getItem(DB_KEY);
       if(raw){
         const d=JSON.parse(raw);
         return {settings: Object.assign(
          { pinHash: null, salt: null, moraDefault: 5,
            creditor: { nombre: '', cedula: '', ciudad: '' } },
          d.settings || {}
        ),
                 personas:d.personas||[],prestamos:d.prestamos||[],pagos:d.pagos||[]};
       }
     }catch(e){console.warn('BD corrupta',e);}
     return {
      settings: { pinHash: null, salt: null, moraDefault: 5,
                  creditor: { nombre: '', cedula: '', ciudad: '' } },
      personas: [], prestamos: [], pagos: []
    };
   }
   let db=loadDB();
   function saveDB(){try{localStorage.setItem(DB_KEY,JSON.stringify(db));}catch(e){toast('⚠️ Sin espacio');}}
   

/* ── Compartir PDF del recibo de pago ────────── */
async function compartirReciboPDF(pagoId){
  const el = document.getElementById('recibo-preview');
  if (!el) return toast('Abre el recibo primero');

  const g = db.pagos.find(x => x.id === pagoId);
  const p = g && db.prestamos.find(x => x.id === g.prestamoId);
  const per = p ? personaDe(p.personaId) : { nombre: 'Cliente' };
  const safe = (per.nombre || 'Cliente').replace(/[^\w]+/g, '_');
  const fname = `Recibo_${safe}_${g?.fecha || hoyISO()}.pdf`;

  try {
    toast('Generando PDF…');
    const blob = await elementToPDFBlob(el);
    const file = new File([blob], fname, { type: 'application/pdf' });

    // Share sheet nativo (Android / iOS / desktop con soporte)
    if (navigator.canShare && navigator.canShare({ files: [file] })){
      try{
        await navigator.share({ files: [file], title: fname.replace('.pdf','') });
        return;
      }catch(e){
        if (e.name === 'AbortError') return;   // usuario canceló
      }
    }

    // Fallback: descarga directa
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast('PDF descargado');
  } catch(err){
    console.error(err);
    toast('No se pudo generar el PDF');
  }
}
   
   /* =========================================================
      CÁLCULOS
      ========================================================= */
   const freqMeses=f=>{const d=(FREQ[f]||FREQ.mensual).d;return d?d/30:1;};
   function mesesPlazo(p){
     if(p.modalidad==='unico') return Math.max(0,diasEntre(p.fechaInicio,p.primerVencimiento))/30;
     return (Number(p.numCuotas)||1)*freqMeses(p.frecuencia);
   }
   function interesTotal(p){
     const c=Number(p.capital)||0;
     if(p.interesModo==='ninguno')return 0;
     if(p.interesModo==='fijo')return r2(Number(p.interesValor)||0);
     return r2(c*(Number(p.interesValor)||0)/100*mesesPlazo(p));
   }
   const totalPactado=p=>r2((Number(p.capital)||0)+interesTotal(p));
   
   function planCuotas(p){
     const total=totalPactado(p);
     const vence=p.primerVencimiento||hoyISO();
     if(p.modalidad==='unico')return[{n:1,fecha:vence,monto:total}];
     const n=Math.max(1,parseInt(p.numCuotas)||1);
     const f=FREQ[p.frecuencia]||FREQ.mensual;
     const base=r2(total/n);const arr=[];let acum=0;
     for(let i=0;i<n;i++){
       const monto=(i===n-1)?r2(total-acum):base;
       acum=r2(acum+monto);
       const fecha=f.d?addDias(vence,f.d*i):addMeses(vence,i);
       arr.push({n:i+1,fecha,monto});
     }
     return arr;
   }
   const pagosDe=p=>db.pagos.filter(x=>x.prestamoId===p.id).sort((a,b)=>a.fecha.localeCompare(b.fecha));
   const totalPagado=p=>r2(sum(pagosDe(p),x=>x.monto));
   
   function cuotasConEstado(p){
     const cuotas=planCuotas(p);let restante=totalPagado(p);
     return cuotas.map(c=>{
       const ap=Math.min(restante,c.monto);restante=r2(restante-ap);
       return Object.assign({},c,{pagado:r2(ap),pendiente:r2(c.monto-ap)});
     });
   }
   function moraDe(p){
     const rate=Number(p.moraMensual)||0;if(!rate)return 0;
     const hoy=hoyISO();let m=0;
     for(const c of cuotasConEstado(p)){
       if(c.pendiente>0.009&&c.fecha<hoy){
         m+=c.pendiente*(rate/100)*(diasEntre(c.fecha,hoy)/30);
       }
     }
     return r2(m);
   }
   function estadoPrestamo(p){
     const total=totalPactado(p),pag=totalPagado(p);
     if(pag>=total-0.01)return 'pagado';
     const hoy=hoyISO();
     const venc=cuotasConEstado(p).filter(c=>c.pendiente>0.009&&c.fecha<hoy);
     return venc.length?'atrasado':'activo';
   }
   function resumenPrestamo(p){
     const total=totalPactado(p),pag=Math.min(totalPagado(p),total);
     const saldo=r2(Math.max(0,total-pag));
     const interes=interesTotal(p),cap=Number(p.capital)||0;
     const ratio=total>0?Math.min(1,pag/total):0;
     const intGan=r2(interes*ratio);
     const capPend=r2(Math.max(0,saldo-(interes-intGan)));
     return {total,pag,saldo,interes,intGan,cap,capPend,mora:moraDe(p),estado:estadoPrestamo(p)};
   }
   const prestamosDePersona=pid=>db.prestamos.filter(p=>p.personaId===pid);
   const personaDe=id=>db.personas.find(x=>x.id===id)||{nombre:'(sin persona)',id:''};
   
   /* =========================================================
      TEMA
      ========================================================= */
   function aplicarTema(){
     const t=localStorage.getItem('pc_theme')||'auto';
     const isDark=t==='dark'||(t==='auto'&&matchMedia('(prefers-color-scheme:dark)').matches);
   
     if(isDark)document.documentElement.setAttribute('data-theme','dark');
     else document.documentElement.removeAttribute('data-theme');
   
     const meta=document.querySelector('meta[name="theme-color"]');
     if(meta)meta.content=isDark?'#0b1220':'#f4f6fb';
   
     const btn=$('#btnTema');
if(btn){
  const icon = t==='light' ? 'fa-sun'
             : t==='dark'  ? 'fa-moon'
             :               'fa-circle-half-stroke';
  btn.innerHTML = `<i class="fa-solid ${icon}"></i>`;
}
   }
   matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>{
     if((localStorage.getItem('pc_theme')||'auto')==='auto')aplicarTema();
   });
   function ciclarTema(){
     const cur=localStorage.getItem('pc_theme')||'auto';
     const next=cur==='auto'?'light':cur==='light'?'dark':'auto';
     localStorage.setItem('pc_theme',next);
     aplicarTema();buzz();
     toast('Tema: '+({auto:'automático',light:'claro',dark:'oscuro'})[next]);
   }
   aplicarTema();
   
/* =========================================================
   PIN / SESIÓN
   ========================================================= */
   const PBKDF2_ITERATIONS = 200_000;
   const PIN_MAX_INTENTOS  = 5;
   const PIN_BLOQUEO_MS    = 30_000;
   
   let creandoPin     = false;
   let pinFallos      = 0;
   let pinBloqueadoHasta = 0;
   
   /* Salt único por instalación (16 bytes en hex) */
   function ensureSalt(){
     if(db.settings.salt) return db.settings.salt;
     let salt;
     if(window.crypto?.getRandomValues){
       const arr = new Uint8Array(16);
       crypto.getRandomValues(arr);
       salt = Array.from(arr).map(x => x.toString(16).padStart(2,'0')).join('');
     } else {
       salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
     }
     db.settings.salt = salt;
     saveDB();
     return salt;
   }
   
   /* PBKDF2-SHA256 con 200k iteraciones → "pbkdf2:<hex>" */
   async function derivePBKDF2(pin){
     const salt = ensureSalt();
     const enc  = new TextEncoder();
     const keyMaterial = await crypto.subtle.importKey(
       'raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']
     );
     const bits = await crypto.subtle.deriveBits(
       { name: 'PBKDF2', salt: enc.encode('PrestaMe::' + salt),
         iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
       keyMaterial, 256
     );
     const hex = Array.from(new Uint8Array(bits))
       .map(x => x.toString(16).padStart(2,'0')).join('');
     return 'pbkdf2:' + hex;
   }
   
   /* Formato antiguo (compatibilidad con hashes ya guardados) */
   async function deriveLegacy(pin){
     const txt = 'pc::' + pin;
     if(window.crypto?.subtle){
       try{
         const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
         return Array.from(new Uint8Array(h))
           .map(x => x.toString(16).padStart(2,'0')).join('');
       }catch(e){}
     }
     let h = 5381;
     for(let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) | 0;
     return 'f' + (h >>> 0).toString(16);
   }
   
   /* Hash "actual" — prefiere PBKDF2, cae a legacy si no hay crypto.subtle */
   async function hashPin(pin){
     if(window.crypto?.subtle){
       try{ return await derivePBKDF2(pin); }catch(e){}
     }
     return deriveLegacy(pin);
   }
   
   /* Verifica + migra automáticamente hashes antiguos */
   async function verificarPin(pin, stored){
     if(!stored) return false;
   
     if(stored.startsWith('pbkdf2:')){
       return (await hashPin(pin)) === stored;
     }
   
     // Hash legado → verificar y migrar
     if((await deriveLegacy(pin)) === stored){
       try{
         const nuevo = await hashPin(pin);
         if(nuevo !== stored){
           db.settings.pinHash = nuevo;
           saveDB();
         }
       }catch(e){}
       return true;
     }
     return false;
   }
   
   /* =========================================================
      PWA INSTALL PROMPT
      ========================================================= */
   let deferredPrompt;
   window.addEventListener('beforeinstallprompt', (e) => {
     e.preventDefault();
     deferredPrompt = e;
     const card = document.getElementById('cardInstalar');
     if(card) card.style.display = 'block';
   });
   async function instalarApp() {
     if (!deferredPrompt) {
       toast('Para instalar: abre el menú de tu navegador y busca "Añadir a pantalla de inicio"');
       return;
     }
     deferredPrompt.prompt();
     const { outcome } = await deferredPrompt.userChoice;
     if (outcome === 'accepted') {
       toast('¡App instalada!');
       document.getElementById('cardInstalar').style.display = 'none';
     }
     deferredPrompt = null;
   }
   if (window.matchMedia('(display-mode: standalone)').matches) {
     const card = document.getElementById('cardInstalar');
     if(card) card.style.display = 'none';
   }
   function initLock(){
     const lock=$('#lock'),app=$('#app');
     const unlock=sessionStorage.getItem('pc_unlocked')==='1';
     if(!db.settings.pinHash)creandoPin=true;
     if(!creandoPin&&unlock){lock.classList.add('hidden');app.classList.remove('hidden');render();return;}
     lock.classList.remove('hidden');app.classList.add('hidden');
     if(creandoPin){
       $('#lockMsg').textContent='Crea un PIN de 4 a 8 dígitos';
       $('#pin2').classList.remove('hidden');
       $('#lockBtn').textContent='Crear PIN';
       $('#pin1').value='';$('#pin1').focus();
     }else{
       $('#lockMsg').textContent='Ingresa tu PIN';
       $('#pin2').classList.add('hidden');
       $('#lockBtn').textContent='Entrar';
       $('#pin1').value='';$('#pin1').focus();
     }
   }
   async function intentarDesbloquear(){
    // Cooldown activo
    if(Date.now() < pinBloqueadoHasta){
      const segs = Math.ceil((pinBloqueadoHasta - Date.now()) / 1000);
      return toast(`Espera ${segs}s antes de reintentar`);
    }
  
    const v1 = $('#pin1').value.trim();
    if(v1.length < 4) return toast('El PIN debe tener al menos 4 dígitos');
  
    /* ── Creación ── */
    if(creandoPin){
      const v2 = $('#pin2').value.trim();
      if(v1 !== v2) return toast('Los PIN no coinciden');
      db.settings.pinHash = await hashPin(v1);
      saveDB();
      creandoPin = false;
      pinFallos  = 0;
      sessionStorage.setItem('pc_unlocked', '1');
      initLock();
      return;
    }
  
    /* ── Verificación ── */
    const ok = await verificarPin(v1, db.settings.pinHash);
    if(!ok){
      pinFallos++;
      $('#pin1').value = '';
      buzz();
      if(pinFallos >= PIN_MAX_INTENTOS){
        pinBloqueadoHasta = Date.now() + PIN_BLOQUEO_MS;
        pinFallos = 0;
        const original = 'Ingresa tu PIN';
        $('#lockMsg').innerHTML = '<i class="fa-solid fa-lock mr-1.5"></i>Bloqueado. Espera 30s.';
        setTimeout(() => { $('#lockMsg').textContent = original; }, PIN_BLOQUEO_MS);
        return toast('Demasiados intentos');
      }
      return toast(`PIN incorrecto (${PIN_MAX_INTENTOS - pinFallos} intentos)`);
    }
  
    pinFallos = 0;
    sessionStorage.setItem('pc_unlocked', '1');
    $('#lock').classList.add('hidden');
    $('#app').classList.remove('hidden');
    render();
  }



   function lockApp(){sessionStorage.removeItem('pc_unlocked');forceCloseModal();initLock();}
   $('#lockBtn').addEventListener('click',intentarDesbloquear);
   $('#pin1').addEventListener('keydown',e=>{if(e.key==='Enter')creandoPin?$('#pin2').focus():intentarDesbloquear();});
   $('#pin2').addEventListener('keydown',e=>{if(e.key==='Enter')intentarDesbloquear();});
   
   /* =========================================================
      UI BASE + SweetAlert2
      ========================================================= */
   let tab='panel',filtro='todos',busqueda='';
   
   /* Toasts no bloqueantes con SweetAlert2 */
   const Toast = Swal.mixin({
     toast: true,
     position: 'top-end',
     showConfirmButton: false,
     timer: 2400,
     timerProgressBar: true,
     didOpen: (t) => {
       t.addEventListener('mouseenter', Swal.stopTimer);
       t.addEventListener('mouseleave', Swal.resumeTimer);
     }
   });
   function toast(msg){ Toast.fire({ title: msg }); }
   
   /* Modal SweetAlert con textarea readonly para copiar */
   function mostrarTextoParaCopiar(titulo, texto){
     Swal.fire({
       title: titulo,
       input: 'textarea',
       inputValue: texto,
       inputAttributes: { readonly: true, style: 'height:200px;font-family:monospace;font-size:12px' },
       confirmButtonText: 'Cerrar',
       confirmButtonColor: '#2563eb'
     });
   }
   
   /* --- Modal con back-button support --- */
   let pendingBack=0;
   function openModal(html){
     const alreadyOpen=!$('#modal').classList.contains('hidden');
     $('#modalBox').innerHTML=html;
     $('#modal').classList.remove('hidden');
     document.body.classList.add('noscroll');
     if(!alreadyOpen)history.pushState({pc_modal:true},'');
   }
   function forceCloseModal(){
     $('#modal').classList.add('hidden');
     $('#modalBox').innerHTML='';
     document.body.classList.remove('noscroll');
   }
   function closeModal(){
     if(history.state&&history.state.pc_modal){history.back();}
     else{forceCloseModal();}
   }
   function closeModalForNew(){
     forceCloseModal();
     if(history.state&&history.state.pc_modal){pendingBack++;history.back();}
   }
   window.addEventListener('popstate',()=>{
     if(pendingBack>0){pendingBack--;return;}
     if(!$('#modal').classList.contains('hidden'))forceCloseModal();
     if($('#fabMenu')&&!$('#fabMenu').classList.contains('hidden'))cerrarFab();
   });
   
   function modalShell({title,body,foot}){
     return `
       <div class="modal-head">
         <h2>${title}</h2>
         <button class="text-slate-400 hover:text-slate-600 text-xl p-1 leading-none rounded-lg" onclick="closeModal()" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
       </div>
       <div class="modal-body">${body}</div>
       ${foot?`<div class="modal-foot">${foot}</div>`:''}`;
   }
   
   function setTab(t){tab=t;cerrarFab();render();}
   
   /* =========================================================
      FAB
      ========================================================= */
   function toggleFab(e){
     e&&e.stopPropagation();
     const menu=$('#fabMenu'),fab=$('#fab');
     const isOpen=!menu.classList.contains('hidden');
     if(isOpen){cerrarFab();}
     else{menu.classList.remove('hidden');fab.classList.add('rotate-45');buzz();}
   }
   function cerrarFab(){
     $('#fabMenu').classList.add('hidden');
     $('#fab').classList.remove('rotate-45');
   }
   function fabAction(kind){
     cerrarFab();
     if(kind==='prestamo')openPrestamoForm();
     else if(kind==='persona')openPersonaForm();
     else if(kind==='pago')openPagoForm();
   }
   document.addEventListener('click',e=>{
     if($('#fabMenu').classList.contains('hidden'))return;
     if(e.target.closest('.fab')||e.target.closest('.fab-menu'))return;
     cerrarFab();
   });
   
   /* =========================================================
      RENDER
      ========================================================= */

      /* ── Footer del desarrollador ────────────────── */
const DEV_INSTAGRAM = 'https://instagram.com/morofoft1'; // ⬅️ CAMBIA tu usuario
const DEV_HANDLE    = 'Pedro Garcia';                       // ⬅️ CAMBIA tu @

function devFooter(){
  return `
  <footer class="mt-6 mb-2 text-center text-[11px] text-slate-400 dark:text-slate-500 select-none">
    <div class="inline-flex items-center gap-1.5 flex-wrap justify-center">
      <span>Dev Pedro García</span>
      <span class="text-slate-300 dark:text-slate-700">·</span>
      <span>2026</span>
      <span class="text-slate-300 dark:text-slate-700">·</span>
      <a href="${DEV_INSTAGRAM}" target="_blank" rel="noopener noreferrer"
   class="inline-flex items-center gap-1 font-semibold text-pink-500 hover:text-pink-600 dark:text-pink-400 dark:hover:text-pink-300 transition active:scale-95">
  <i class="fa-brands fa-instagram"></i>
  ${DEV_HANDLE}
</a>
    </div>
  </footer>`;
}
   function render(){
     $$('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
     const v=$('#view');
     v.innerHTML=
       tab==='panel'?viewPanel():
       tab==='prestamos'?viewPrestamos():
       tab==='personas'?viewPersonas():
       viewAjustes();
       v.insertAdjacentHTML('beforeend', devFooter());
     if(tab==='prestamos')initSwipes();
     updateTabBadges();
     window.scrollTo({top:0});
   }
   
   /* Badge rojo con nº de préstamos atrasados en el tab */
   function updateTabBadges(){
     const atrasados=db.prestamos.filter(p=>estadoPrestamo(p)==='atrasado').length;
     const btn=document.querySelector('.tabs button[data-tab="prestamos"]');
     if(!btn)return;
     let badge=btn.querySelector('.tab-badge');
     if(atrasados>0){
       if(!badge){
         badge=document.createElement('span');
         badge.className='tab-badge';
         btn.appendChild(badge);
       }
       badge.textContent=atrasados>99?'99+':atrasados;
     }else if(badge){
       badge.remove();
     }
   }
   
   /* =========================================================
      PANEL
      ========================================================= */
   function viewPanel(){
     const activos=db.prestamos.filter(p=>estadoPrestamo(p)!=='pagado');
     const res=db.prestamos.map(p=>({p,r:resumenPrestamo(p)}));
     const actRes=res.filter(x=>x.r.estado!=='pagado');
     const morosos=actRes.filter(x=>x.r.estado==='atrasado');
     const capCalle=r2(sum(actRes,x=>x.r.capPend));
     const porCobrar=r2(sum(actRes,x=>x.r.saldo));
     const intPorCobrar=r2(sum(actRes,x=>x.r.interes-x.r.intGan));
     const intGanado=r2(sum(res,x=>x.r.intGan));
     const moraTotal=r2(sum(actRes,x=>x.r.mora));
     const cobrado=r2(sum(db.pagos,x=>x.monto));
     const prestado=r2(sum(db.prestamos,x=>x.capital));
     const hoy=hoyISO();
   
     const recordatorios=[];
     activos.forEach(p=>{
       cuotasConEstado(p).forEach(c=>{
         if(c.pendiente>0.009){
           const dias=diasEntre(hoy,c.fecha);
           if(dias>=-7&&dias<=7)recordatorios.push({p,c,dias});
         }
       });
     });
     recordatorios.sort((a,b)=>a.dias-b.dias);
     const recTop=recordatorios.slice(0,8);
   
     const serie=[];
     const base=new Date();base.setDate(1);
     for(let i=5;i>=0;i--){
       const d=new Date(base.getFullYear(),base.getMonth()-i,1);
       const key=isoOf(d).slice(0,7);
       serie.push({
         label:MESES[d.getMonth()],
         a:r2(sum(db.prestamos.filter(p=>(p.fechaInicio||'').slice(0,7)===key),p=>p.capital)),
         b:r2(sum(db.pagos.filter(g=>(g.fecha||'').slice(0,7)===key),g=>g.monto))
       });
     }
   
     return `
     <div class="gridk">
       <div class="kpi pri"><div class="lbl">Capital en la calle</div><div class="val">${money(capCalle)}</div></div>
       <div class="kpi"><div class="lbl">Por cobrar</div><div class="val">${money(porCobrar)}</div></div>
       <div class="kpi ok"><div class="lbl">Interés ganado</div><div class="val">${money(intGanado)}</div></div>
       <div class="kpi warn"><div class="lbl">Interés x cobrar</div><div class="val">${money(intPorCobrar)}</div></div>
       <div class="kpi bad"><div class="lbl">Mora acum.</div><div class="val">${money(moraTotal)}</div></div>
       <div class="kpi"><div class="lbl">Cobrado</div><div class="val">${money(cobrado)}</div></div>
     </div>
   
     ${recTop.length?`
     <div class="card">
       <div class="row" style="margin-bottom:6px">
         <h3 class="font-bold"><i class="fa-solid fa-calendar-days mr-1.5 text-blue-600"></i>Recordatorios</h3>
         <span class="text-xs text-slate-500">${recTop.length}</span>
       </div>
       ${recTop.map(({p,c,dias})=>{
         const per=personaDe(p.personaId);
         const tel=waPhone(per.telefono);
         const msg=msgRecordatorio(per,c,p);
         const waUrl=tel?`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`:
                         `https://wa.me/?text=${encodeURIComponent(msg)}`;
         const tag=dias<0?`<span class="text-red-500 font-semibold">Venció hace ${-dias}d</span>`:
                   dias===0?`<span class="text-amber-500 font-bold">Vence hoy</span>`:
                   dias===1?`<span class="text-amber-500 font-semibold">Vence mañana</span>`:
                   `<span class="text-slate-400">En ${dias} días</span>`;
         return `
         <div class="remind-item">
           <div class="info" onclick="openPrestamoDetalle('${p.id}')" style="cursor:pointer">
             <b>${esc(per.nombre)}</b>
             <div class="text-xs">${tag} · cuota ${c.n} · ${fmtFecha(c.fecha)}</div>
           </div>
           <div class="actions">
             <span class="text-sm font-extrabold tabular-nums mr-1">${money(c.pendiente)}</span>
             <a class="iconAction wa" href="${waUrl}" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>
             ${per.telefono?`<a class="iconAction" href="tel:${esc(per.telefono)}" aria-label="Llamar">📞</a>`:''}
           </div>
         </div>`;
       }).join('')}
     </div>`:''}
   
     <div class="card">
       <div class="row" style="margin-bottom:8px">
         <h3 class="font-bold">Resumen</h3><span class="text-xs text-slate-500">${db.prestamos.length} préstamos</span>
       </div>
       <div class="kv"><span>Prestado histórico</span><b>${money(prestado)}</b></div>
       <div class="kv"><span>Activos / Pagados</span><b>${activos.length} / ${db.prestamos.length-activos.length}</b></div>
       <div class="kv bad"><span>En mora</span><b>${morosos.length}</b></div>
     </div>
   
     <div class="card">
       <h3 class="font-bold mb-2">Prestado vs. cobrado (6 meses)</h3>
       ${svgChart(serie)}
       <div class="legend">
         <span><i class="dot bg-blue-600"></i>Prestado</span>
         <span><i class="dot bg-green-600"></i>Cobrado</span>
       </div>
     </div>`;
   }
   
   function msgRecordatorio(per,c,p){
     const nombre=(per.nombre||'').split(' ')[0];
     const total=money(c.pendiente);
     const fecha=fmtFecha(c.fecha);
     return `Hola ${nombre}, te recuerdo que tienes una cuota pendiente de *${total}* con vencimiento *${fecha}*. Saldo total: ${money(resumenPrestamo(p).saldo)}. ¡Gracias!`;
   }
   
   function svgChart(serie){
     const W=340,H=170,padL=8,padB=24,padT=12;
     const max=Math.max(1,...serie.map(s=>Math.max(s.a,s.b)));
     const gw=(W-padL*2)/serie.length;
     const bw=Math.min(15,gw/3.2);
     const h=H-padB-padT;
     let out='';
     serie.forEach((s,i)=>{
       const cx=padL+i*gw+gw/2;
       const ha=(s.a/max)*h,hb=(s.b/max)*h;
       out+=`<rect x="${cx-bw-1.5}" y="${padT+h-ha}" width="${bw}" height="${Math.max(ha,.6)}" rx="3" fill="#2563eb"><title>${s.label}: ${money(s.a)}</title></rect>`;
       out+=`<rect x="${cx+1.5}" y="${padT+h-hb}" width="${bw}" height="${Math.max(hb,.6)}" rx="3" fill="#16a34a"><title>${s.label}: ${money(s.b)}</title></rect>`;
       out+=`<text x="${cx}" y="${H-7}" text-anchor="middle" font-size="10" fill="#94a3b8">${s.label}</text>`;
     });
     out+=`<line x1="${padL}" y1="${padT+h}" x2="${W-padL}" y2="${padT+h}" stroke="#e2e8f0" stroke-width="1"/>`;
     return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">${out}</svg>`;
   }
   
   /* =========================================================
      PRÉSTAMOS
      ========================================================= */
   function viewPrestamos(){
     return `
     <div class="row" style="margin-bottom:10px">
       <h2 class="text-xl font-bold">Préstamos</h2>
       <button class="btn primary sm" onclick="openPrestamoForm()">+ Nuevo</button>
     </div>
     <input class="search" id="busq" placeholder="🔍 Buscar por nombre o cédula…" value="${esc(busqueda)}"
            oninput="onBusqueda(this.value)"/>
     <div class="pill">
       ${['todos','activos','atrasados','pagados'].map(f=>`<button class="${filtro===f?'on':''}" onclick="filtro='${f}';render()">${f[0].toUpperCase()+f.slice(1)}</button>`).join('')}
     </div>
     <div id="listaPrestamos">${renderPrestamosLista()}</div>`;
   }
   
   let _busqTimer;
   function onBusqueda(v){
     busqueda=v;
     clearTimeout(_busqTimer);
     _busqTimer=setTimeout(()=>{
       const el=$('#listaPrestamos');
       if(el)el.innerHTML=renderPrestamosLista();
       initSwipes();
     },180);
   }
   
   function renderPrestamosLista(){
     let lista=db.prestamos.map(p=>({p,r:resumenPrestamo(p)}));
     if(filtro==='activos')lista=lista.filter(x=>x.r.estado==='activo');
     if(filtro==='atrasados')lista=lista.filter(x=>x.r.estado==='atrasado');
     if(filtro==='pagados')lista=lista.filter(x=>x.r.estado==='pagado');
     if(busqueda.trim()){
       const q=busqueda.trim().toLowerCase();
       lista=lista.filter(x=>{
         const per=personaDe(x.p.personaId);
         return (per.nombre||'').toLowerCase().includes(q)||(per.cedula||'').toLowerCase().includes(q);
       });
     }
     lista.sort((a,b)=>(a.r.estado==='pagado')-(b.r.estado==='pagado')||b.p.fechaInicio.localeCompare(a.p.fechaInicio));
     const totalSaldo=r2(sum(lista,x=>x.r.saldo));
     if(!lista.length)return `<div class="empty">No hay préstamos.<br><br><button class="btn primary" onclick="openPrestamoForm()">Crear el primero</button></div>`;
     return `
       <div class="text-xs text-slate-500 mb-2.5">${lista.length} préstamos · Saldo ${money(totalSaldo)}</div>
       ${lista.map(({p,r})=>{
         const per=personaDe(p.personaId);
         const activo=r.estado!=='pagado';
         return `
         <div class="swipe-wrap" data-id="${p.id}">
           <div class="swipe-actions">
             <button class="edit" data-action="edit"><i class="fa-solid fa-pen text-base"></i>Editar</button>
${activo?`<button class="pay" data-action="pay"><i class="fa-solid fa-hand-holding-dollar text-base"></i>Pagar</button>`:''}
           </div>
           <div class="swipe-card" onclick="openPrestamoDetalle('${p.id}')">
             <div class="row">
               <div style="min-width:0">
                 <div class="row" style="justify-content:flex-start;gap:8px">
                   <b class="truncate">${esc(per.nombre)}</b>
                   <span class="tag ${r.estado}">${r.estado}</span>
                 </div>
                 <div class="text-xs text-slate-500 mt-1">Capital ${money(p.capital)} · vence ${fmtFecha(p.primerVencimiento)}</div>
               </div>
               <div style="text-align:right;flex:0 0 auto">
                 <div style="font-weight:800;font-variant-numeric:tabular-nums">${money(r.saldo)}</div>
                 <div class="text-[11px] text-slate-400">saldo</div>
               </div>
             </div>
             ${r.mora>0?`<div class="text-[11px] text-red-600 font-medium mt-1.5">Mora: ${money(r.mora)}</div>`:''}
           </div>
         </div>`;
       }).join('')}`;
   }
   
   function initSwipes(){
     $$('.swipe-wrap').forEach(el=>{
       if(el._swipeInit)return;
       el._swipeInit=true;
       const card=el.querySelector('.swipe-card');
       const actions=el.querySelector('.swipe-actions');
       const actionWidth = [...actions.querySelectorAll('button')]
  .reduce((s, b) => s + b.offsetWidth, 0) || 140;
       const maxLeft=-actionWidth;
       let startX=0,startY=0,curX=0,dragging=false,horiz=false,suppress=false;
   
       const closeSwipe=()=>{card.style.transform='translateX(0)';el.dataset.open='0';};
       el._closeSwipe=closeSwipe;
   
       el.addEventListener('touchstart',e=>{
         if(e.touches.length!==1)return;
         startX=e.touches[0].clientX;startY=e.touches[0].clientY;
         curX=0;dragging=true;horiz=false;
         card.classList.add('dragging');
         $$('.swipe-wrap[data-open="1"]').forEach(o=>{if(o!==el&&o._closeSwipe)o._closeSwipe();});
       },{passive:true});
   
       el.addEventListener('touchmove',e=>{
         if(!dragging)return;
         const dx=e.touches[0].clientX-startX;
         const dy=e.touches[0].clientY-startY;
         if(!horiz){
           if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>10)horiz=true;
           else if(Math.abs(dy)>10){dragging=false;card.classList.remove('dragging');return;}
         }
         if(horiz){
           const base=el.dataset.open==='1'?maxLeft:0;
           let tx=Math.min(0,Math.max(maxLeft,base+dx));
           card.style.transform=`translateX(${tx}px)`;
           curX=tx;
         }
       },{passive:true});
   
       el.addEventListener('touchend',()=>{
         if(!dragging)return;
         dragging=false;
         card.classList.remove('dragging');
         card.style.transition='transform .22s cubic-bezier(.2,.8,.3,1)';
         if(horiz){
           suppress=true;setTimeout(()=>{suppress=false;},300);
           if(curX<-actionWidth/2){card.style.transform=`translateX(${maxLeft}px)`;el.dataset.open='1';buzz();}
           else{card.style.transform='translateX(0)';el.dataset.open='0';}
         }else{
           card.style.transform='translateX(0)';
         }
       });
   
       el.addEventListener('click',e=>{
         const btn=e.target.closest('[data-action]');
         if(btn){
           e.stopPropagation();e.preventDefault();
           const id=el.dataset.id;
           closeSwipe();
           if(btn.dataset.action==='edit')openPrestamoForm(id);
           else if(btn.dataset.action==='pay')openPagoForm(id);
           return;
         }
         if(suppress){e.preventDefault();e.stopPropagation();return;}
         if(el.dataset.open==='1'){e.preventDefault();e.stopPropagation();closeSwipe();}
       },true);
     });
   }
   
   /* =========================================================
      PERSONAS
      ========================================================= */
   function viewPersonas(){
     const lista=db.personas.slice().sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''));
     return `
     <div class="row" style="margin-bottom:10px">
       <h2 class="text-xl font-bold">Personas</h2>
       <button class="btn primary sm" onclick="openPersonaForm()">+ Nueva</button>
     </div>
     ${lista.length?lista.map(p=>{
       const prs=prestamosDePersona(p.id).map(x=>resumenPrestamo(x));
       const saldo=r2(sum(prs,x=>x.saldo));
       const activos=prs.filter(x=>x.estado!=='pagado').length;
       return `
       <div class="card cursor-pointer" onclick="openPersonaDetalle('${p.id}')">
         <div class="row">
           <div class="row" style="justify-content:flex-start;gap:11px;min-width:0">
             ${p.foto?`<img class="avatar" src="${p.foto}" alt="">`:`<div class="avatar">${esc((p.nombre||'?').trim().charAt(0).toUpperCase())}</div>`}
             <div style="min-width:0">
               <div class="font-bold truncate">${esc(p.nombre)}</div>
               <div class="text-xs text-slate-500">${esc(p.telefono||p.cedula||'—')}</div>
             </div>
           </div>
           <div style="text-align:right;flex:0 0 auto">
             <div style="font-weight:800;font-variant-numeric:tabular-nums">${money(saldo)}</div>
             <div class="text-[11px] text-slate-400">${activos} activo(s)</div>
           </div>
         </div>
       </div>`;
     }).join(''):'<div class="empty">Aún no tienes personas.</div>'}`;
   }
   
   /* =========================================================
      AJUSTES
      ========================================================= */
   function viewAjustes(){
     const tema=localStorage.getItem('pc_theme')||'auto';
     return `
     <h2 class="text-xl font-bold mb-3">Ajustes</h2>
   
     <div class="card">
       <h3 class="font-bold">Apariencia</h3>
       <p class="text-xs text-slate-500 my-2">Elige el tema de la app.</p>
       <div class="pill">
         <button class="${tema==='auto'?'on':''}" onclick="setTema('auto')"><i class="fa-solid fa-circle-half-stroke mr-1"></i>Auto</button>
<button class="${tema==='light'?'on':''}" onclick="setTema('light')"><i class="fa-solid fa-sun mr-1"></i>Claro</button>
<button class="${tema==='dark'?'on':''}" onclick="setTema('dark')"><i class="fa-solid fa-moon mr-1"></i>Oscuro</button>
       </div>
     </div>
   
     <div class="card" id="cardInstalar" style="display:none">
       <h3 class="font-bold">Instalar App</h3>
       <p class="text-xs text-slate-500 my-1">Añade PrestaMe a tu pantalla de inicio para usarla sin internet.</p>
       <button class="btn primary w-full mt-2" onclick="instalarApp()"><i class="fa-solid fa-mobile-screen-button mr-1.5"></i>Instalar en mi teléfono</button>
     </div>
   
     <div class="card">
       <h3 class="font-bold">Mis datos (acreedor)</h3>
       <p class="text-xs text-slate-500 mb-2">Aparecen en los pagarés que generes.</p>
       ${db.settings.creditor?.nombre ? `
         <div class="kv"><span>Nombre</span><b>${esc(db.settings.creditor.nombre)}</b></div>
         ${db.settings.creditor.cedula?`<div class="kv"><span>Cédula</span><b>${esc(db.settings.creditor.cedula)}</b></div>`:''}
         ${db.settings.creditor.ciudad?`<div class="kv"><span>Ciudad</span><b>${esc(db.settings.creditor.ciudad)}</b></div>`:''}
       ` : '<p class="text-xs text-slate-500">Aún no has configurado tus datos.</p>'}
       <div style="margin-top:10px"><button class="btn primary" onclick="openCreditorForm()">${db.settings.creditor?.nombre?'Editar':'Configurar'}</button></div>
     </div>
   
     <div class="card">
       <h3 class="font-bold">Seguridad</h3>
       <p class="text-xs text-slate-500 my-1">El PIN protege el acceso en este dispositivo.</p>
       <div class="row wrap gap-2 mt-2">
         <button class="btn" onclick="openCambiarPin()">Cambiar PIN</button>
         <button class="btn" onclick="lockApp()">Bloquear ahora</button>
       </div>
     </div>
   
     <div class="card">
       <h3 class="font-bold mb-1">Valores por defecto</h3>
       <label class="text-xs text-slate-500 block font-bold mb-1">Mora mensual por defecto (%)</label>
       <div class="row">
         <input id="setMora" type="number" min="0" step="0.1" value="${db.settings.moraDefault??5}"
                class="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 w-32 font-semibold"/>
         <button class="btn primary" onclick="guardarMoraDefault()">Guardar</button>
       </div>
     </div>
   
     <div class="card">
       <h3 class="font-bold">Respaldo</h3>
       <p class="text-xs text-slate-500 my-1">Guarda el respaldo con frecuencia. Si borras datos del navegador, se pierde todo.</p>
       <div class="row wrap gap-2 mt-2">
        <button class="btn" onclick="exportarJSON()"><i class="fa-solid fa-download mr-1.5"></i>JSON</button>
<button class="btn" onclick="document.getElementById('impFile').click()"><i class="fa-solid fa-upload mr-1.5"></i>Importar</button>
<button class="btn" onclick="exportarCSV()"><i class="fa-solid fa-file-csv mr-1.5"></i>CSV</button>
       </div>
       <input type="file" id="impFile" accept=".json,application/json" class="hidden" onchange="importarJSON(this)"/>
     </div>
   
     <div class="card">
       <h3 class="font-bold mb-2">Datos</h3>
       <div class="kv"><span>Personas</span><b>${db.personas.length}</b></div>
       <div class="kv"><span>Préstamos</span><b>${db.prestamos.length}</b></div>
       <div class="kv"><span>Pagos</span><b>${db.pagos.length}</b></div>
       <div class="kv"><span>Almacenamiento</span><b>${(JSON.stringify(db).length/1024).toFixed(1)} KB</b></div>
       <div style="margin-top:12px"><button class="btn danger" onclick="borrarTodo()">Borrar todos los datos</button></div>
     </div>

     <div class="card">
  <h3 class="font-bold">Versión</h3>
  <p class="text-xs text-slate-500 my-1">Si no ves los últimos cambios, toca aquí.</p>
  <button class="btn primary w-full mt-2" onclick="buscarActualizaciones()">
    <i class="fa-solid fa-rotate mr-1.5"></i>Buscar actualización
  </button>
</div>
   
     <p class="text-[11px] text-slate-400 text-center mt-4">PrestaMe · DOP · v6</p>`;


   }

   async function buscarActualizaciones(){
    if(!('serviceWorker' in navigator)) return toast('No soportado en este navegador');
    try{
      toast('Buscando…');
      const reg = await navigator.serviceWorker.getRegistration();
      if(!reg) return toast('No hay Service Worker');
      await reg.update();
      setTimeout(() => {
        if (reg.waiting){
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          toast('Actualizando…');
        } else if (reg.installing || reg.active){
          toast('Ya tienes la última versión');
        }
      }, 1500);
    }catch(e){
      toast('Error al verificar');
    }
  }

   
   function setTema(t){localStorage.setItem('pc_theme',t);aplicarTema();render();buzz();}
   function guardarMoraDefault(){
     const v=Number($('#setMora').value);
     if(!(v>=0))return toast('Valor inválido');
     db.settings.moraDefault=v;saveDB();buzz();toast('Guardado');
   }
   
   async function borrarTodo(){
    const r1 = await Swal.fire({
      icon:'warning',
      title:'¿Borrar TODOS los datos?',
      text:'No se puede deshacer.',
      showCancelButton:true,
      confirmButtonText:'Continuar',
      confirmButtonColor:'#dc2626',
      cancelButtonText:'Cancelar'
    });
    if(!r1.isConfirmed) return;
  
    const r2 = await Swal.fire({
      icon:'error',
      title:'Confirma otra vez',
      text:'Se eliminarán personas, préstamos y pagos.',
      showCancelButton:true,
      confirmButtonText:'Sí, borrar todo',
      confirmButtonColor:'#dc2626',
      cancelButtonText:'Cancelar'
    });
    if(!r2.isConfirmed) return;
  
    db={
      settings:{
        pinHash: db.settings.pinHash,
        salt:    db.settings.salt,        // ⬅️ preservar salt
        moraDefault: 5,
        creditor: { nombre:'', cedula:'', ciudad:'' }
      },
      personas:[], prestamos:[], pagos:[]
    };
    saveDB();
    render();
    toast('Datos borrados');
  }
   
   /* =========================================================
      FORM: PERSONA
      ========================================================= */
   let tmpFoto='';
   function openPersonaForm(id){
     const p=id?db.personas.find(x=>x.id===id):null;
     const d=p||{nombre:'',cedula:'',telefono:'',email:'',direccion:'',referencias:'',notas:'',foto:''};
     tmpFoto=d.foto||'';
     openModal(modalShell({
       title:p?'Editar persona':'Nueva persona',
       body:`
         <div class="form">
           <label>Nombre completo *<input id="pe_nombre" value="${esc(d.nombre)}" autocomplete="off"></label>
           <div class="gridk">
             <label style="margin-bottom:0">Cédula<input id="pe_cedula" value="${esc(d.cedula)}" inputmode="numeric"></label>
             <label style="margin-bottom:0">Teléfono<input id="pe_telefono" value="${esc(d.telefono)}" inputmode="tel"></label>
           </div>
           <div style="height:12px"></div>
           <label>Email<input id="pe_email" type="email" value="${esc(d.email)}" inputmode="email"></label>
           <label>Dirección<input id="pe_direccion" value="${esc(d.direccion)}"></label>
           <label>Referencias<textarea id="pe_ref" rows="2">${esc(d.referencias)}</textarea></label>
           <label>Notas<textarea id="pe_notas" rows="2">${esc(d.notas)}</textarea></label>
           <label>Foto (opcional)<input type="file" accept="image/*" id="pe_foto"></label>
           <div id="pe_fotoPrev">${tmpFoto?`<img src="${tmpFoto}" class="w-16 h-16 rounded-xl object-cover mt-2">`:''}</div>
         </div>`,
       foot:`
         <button class="btn ghost" onclick="closeModal()">Cancelar</button>
         <button class="btn primary" onclick="savePersona('${p?p.id:''}')">Guardar</button>`
     }));
     $('#pe_foto').addEventListener('change',e=>{
       const f=e.target.files[0];if(!f)return;
       const img=new Image();
       img.onload=()=>{
         const S=240,c=document.createElement('canvas');
         const k=Math.min(S/img.width,S/img.height);
         c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);
         c.getContext('2d').drawImage(img,0,0,c.width,c.height);
         tmpFoto=c.toDataURL('image/jpeg',0.72);
         $('#pe_fotoPrev').innerHTML=`<img src="${tmpFoto}" class="w-16 h-16 rounded-xl object-cover mt-2">`;
         URL.revokeObjectURL(img.src);
       };
       img.src=URL.createObjectURL(f);
     });
   }
   function savePersona(id){
     const nombre=$('#pe_nombre').value.trim();
     if(!nombre)return toast('El nombre es obligatorio');
     const data={nombre,
       cedula:$('#pe_cedula').value.trim(),
       telefono:$('#pe_telefono').value.trim(),
       email:$('#pe_email').value.trim(),
       direccion:$('#pe_direccion').value.trim(),
       referencias:$('#pe_ref').value.trim(),
       notas:$('#pe_notas').value.trim(),
       foto:tmpFoto||''};
     if(id){Object.assign(db.personas.find(x=>x.id===id),data);}
     else{db.personas.push(Object.assign({id:uid(),creado:hoyISO()},data));}
     saveDB();buzz();closeModal();render();toast('Persona guardada');
   }
   
   /* =========================================================
      DETALLE PERSONA
      ========================================================= */
   function openPersonaDetalle(id){
     const p=db.personas.find(x=>x.id===id);if(!p)return;
     const prs=prestamosDePersona(p.id).map(x=>({p:x,r:resumenPrestamo(x)}))
       .sort((a,b)=>b.p.fechaInicio.localeCompare(a.p.fechaInicio));
     const saldo=r2(sum(prs,x=>x.r.saldo));
     const pagado=r2(sum(prs,x=>x.r.pag));
   
     openModal(modalShell({
       title:p.nombre,
       body:`
         <div class="row" style="justify-content:flex-start;gap:12px;margin-bottom:12px">
           ${p.foto?`<img class="avatar" src="${p.foto}">`:`<div class="avatar" style="width:52px;height:52px;font-size:20px">${esc((p.nombre||'?').charAt(0).toUpperCase())}</div>`}
           <div class="text-xs">
           ${p.cedula?`<div><i class="fa-solid fa-id-card mr-1.5 text-slate-400"></i>${esc(p.cedula)}</div>`:''}
           ${p.telefono?`<div><i class="fa-solid fa-phone mr-1.5 text-slate-400"></i><a href="tel:${esc(p.telefono)}" class="text-blue-600 font-medium">${esc(p.telefono)}</a> · <a href="https://wa.me/${waPhone(p.telefono)}" target="_blank" class="text-green-600 font-medium"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a></div>`:''}
           ${p.email?`<div><i class="fa-solid fa-envelope mr-1.5 text-slate-400"></i>${esc(p.email)}</div>`:''}
           ${p.direccion?`<div><i class="fa-solid fa-house mr-1.5 text-slate-400"></i>${esc(p.direccion)}</div>`:''}
           </div>
         </div>
         ${p.referencias?`<div class="card" style="margin-bottom:10px"><b class="text-xs">Referencias</b><div class="text-xs text-slate-500">${esc(p.referencias)}</div></div>`:''}
         ${p.notas?`<div class="card" style="margin-bottom:10px"><b class="text-xs">Notas</b><div class="text-xs text-slate-500">${esc(p.notas)}</div></div>`:''}
         <div class="card">
           <div class="kv"><span>Total prestado</span><b>${money(sum(prs,x=>x.p.capital))}</b></div>
           <div class="kv"><span>Total pagado</span><b>${money(pagado)}</b></div>
           <div class="kv"><span>Saldo pendiente</span><b>${money(saldo)}</b></div>
         </div>
         <h3 class="font-bold my-2">Préstamos</h3>
         ${prs.length?prs.map(({p:pr,r})=>`
           <div class="card cursor-pointer" onclick="closeModalForNew();setTimeout(()=>openPrestamoDetalle('${pr.id}'),50)">
             <div class="row">
               <div>
                 <span class="tag ${r.estado}">${r.estado}</span>
                 <span class="text-xs text-slate-400 ml-1.5">${fmtFecha(pr.fechaInicio)}</span>
               </div>
               <b class="tabular-nums">${money(r.saldo)}</b>
             </div>
             <div class="text-[11px] text-slate-400 mt-1">Capital ${money(pr.capital)} · Total ${money(r.total)}</div>
           </div>`).join(''):'<div class="empty">Sin préstamos</div>'}`,
       foot:`
         <button class="btn ghost" onclick="closeModalForNew();setTimeout(()=>openPersonaForm('${p.id}'),50)">Editar</button>
         <button class="btn" onclick="closeModalForNew();setTimeout(()=>openPrestamoForm(null,'${p.id}'),50)">+ Préstamo</button>
         <button class="btn primary" onclick="closeModalForNew();setTimeout(()=>openPagoForm(null,'${p.id}'),50)">+ Pago</button>`
     }));
   }
   
   async function borrarPersona(id){
     const n=prestamosDePersona(id).length;
     if(n) return toast('No puedes eliminar: tiene '+n+' préstamo(s)');
   
     const r = await Swal.fire({
       icon:'warning',
       title:'¿Eliminar esta persona?',
       showCancelButton:true,
       confirmButtonText:'Eliminar',
       confirmButtonColor:'#dc2626',
       cancelButtonText:'Cancelar'
     });
     if(!r.isConfirmed) return;
   
     db.personas=db.personas.filter(x=>x.id!==id);
     saveDB();closeModal();render();toast('Eliminada');
   }
   
   /* =========================================================
      FORM: PRÉSTAMO
      ========================================================= */
   function openPrestamoForm(id,personaPre){
     const p=id?db.prestamos.find(x=>x.id===id):null;
     if(!db.personas.length){
       toast('Primero registra una persona');
       return closeModalForNew(),setTimeout(()=>openPersonaForm(),50);
     }
     const d=p||{
       personaId:personaPre||db.personas[0].id,
       capital:'',interesModo:'mensual',interesValor:10,
       moraMensual:db.settings.moraDefault??5,
       fechaInicio:hoyISO(),modalidad:'cuotas',numCuotas:4,frecuencia:'mensual',
       primerVencimiento:addMeses(hoyISO(),1),notas:''
     };
     const optP=db.personas.map(x=>`<option value="${x.id}" ${x.id===d.personaId?'selected':''}>${esc(x.nombre)}</option>`).join('');
     const optM=[['ninguno','Sin interés'],['mensual','% mensual'],['fijo','Monto fijo']]
       .map(([v,l])=>`<option value="${v}" ${d.interesModo===v?'selected':''}>${l}</option>`).join('');
     const optF=Object.entries(FREQ).map(([k,v])=>`<option value="${k}" ${d.frecuencia===k?'selected':''}>${v.l}</option>`).join('');
   
     openModal(modalShell({
       title:p?'Editar préstamo':'Nuevo préstamo',
       body:`
         <div class="form">
           <label>Persona<select id="pr_persona">${optP}</select></label>
           <div class="gridk">
             <label style="margin-bottom:0">Capital (RD$)<input id="pr_capital" type="number" inputmode="decimal" min="0" step="0.01" value="${d.capital}"></label>
             <label style="margin-bottom:0">Mora mensual (%)<input id="pr_mora" type="number" min="0" step="0.1" value="${d.moraMensual}"></label>
           </div>
           <div style="height:12px"></div>
           <label>Tipo de interés<select id="pr_modo">${optM}</select></label>
           <label id="pr_valorWrap">Valor<input id="pr_valor" type="number" min="0" step="0.01" value="${d.interesValor}"></label>
           <div class="gridk">
             <label style="margin-bottom:0">Inicio<input id="pr_inicio" type="date" value="${d.fechaInicio}"></label>
             <label style="margin-bottom:0">Modalidad<select id="pr_modalidad">
               <option value="unico" ${d.modalidad==='unico'?'selected':''}>Pago único</option>
               <option value="cuotas" ${d.modalidad==='cuotas'?'selected':''}>En cuotas</option>
             </select></label>
           </div>
           <div style="height:12px"></div>
           <div class="gridk" id="pr_cuotasWrap">
             <label style="margin-bottom:0">Nº cuotas<input id="pr_cuotas" type="number" min="1" step="1" value="${d.numCuotas}"></label>
             <label style="margin-bottom:0">Frecuencia<select id="pr_freq">${optF}</select></label>
           </div>
           <label id="pr_venceLabel">Primer vencimiento<input id="pr_vence" type="date" value="${d.primerVencimiento}"></label>
           <label>Notas<textarea id="pr_notas" rows="2">${esc(d.notas)}</textarea></label>
           <div id="preview" class="preview"></div>
         </div>`,
       foot:`
         <button class="btn ghost" onclick="closeModal()">Cancelar</button>
         <button class="btn primary" onclick="savePrestamo('${p?p.id:''}')">Guardar</button>`
     }));
   
     ['pr_capital','pr_valor','pr_mora','pr_inicio','pr_cuotas','pr_vence','pr_modo','pr_modalidad','pr_freq']
       .forEach(x=>{const el=$('#'+x);if(el)el.addEventListener('input',()=>{toggleCamposPrestamo();updPreview();});});
     toggleCamposPrestamo();updPreview();
   }
   function toggleCamposPrestamo(){
     const modo=$('#pr_modo').value,mod=$('#pr_modalidad').value;
     $('#pr_valorWrap').style.display=modo==='ninguno'?'none':'block';
     $('#pr_cuotasWrap').style.display=mod==='cuotas'?'grid':'none';
     $('#pr_venceLabel').firstChild.textContent=mod==='cuotas'?'Primer vencimiento':'Fecha de vencimiento';
   }
   function leerFormPrestamo(){
     const mod=$('#pr_modalidad').value;
     return {
       personaId:$('#pr_persona').value,
       capital:Number($('#pr_capital').value)||0,
       interesModo:$('#pr_modo').value,
       interesValor:Number($('#pr_valor').value)||0,
       moraMensual:Number($('#pr_mora').value)||0,
       fechaInicio:$('#pr_inicio').value,
       modalidad:mod,
       numCuotas:mod==='cuotas'?Math.max(1,parseInt($('#pr_cuotas').value)||1):1,
       frecuencia:mod==='cuotas'?$('#pr_freq').value:'mensual',
       primerVencimiento:$('#pr_vence').value,
       notas:$('#pr_notas').value.trim()
     };
   }
   function updPreview(){
     const o=leerFormPrestamo();
     if(!(o.capital>0)||!o.primerVencimiento){
       $('#preview').innerHTML='<span class="text-slate-400">Completa capital y fecha para ver el resumen.</span>';return;
     }
     const total=totalPactado(o),inte=interesTotal(o);
     const txt=o.modalidad==='cuotas'
       ?`<div style="margin-top:6px">${o.numCuotas} cuotas ≈ <b>${money(total/o.numCuotas)}</b> (${FREQ[o.frecuencia].l.toLowerCase()})</div>`
       :`<div style="margin-top:6px">Pago único el ${fmtFecha(o.primerVencimiento)}</div>`;
     $('#preview').innerHTML=`
       <div>Total a pagar: <b>${money(total)}</b></div>
       <div class="text-xs">Interés: ${money(inte)} · Capital: ${money(o.capital)}</div>
       ${txt}`;
   }
   function savePrestamo(id){
     const o=leerFormPrestamo();
     if(!o.personaId)return toast('Selecciona una persona');
     if(!(o.capital>0))return toast('Capital debe ser > 0');
     if(!o.fechaInicio)return toast('Falta fecha de inicio');
     if(!o.primerVencimiento)return toast('Falta fecha de vencimiento');
     if(o.primerVencimiento<o.fechaInicio)return toast('Vencimiento antes de inicio');
     if(o.modalidad==='cuotas'&&!(o.numCuotas>=1))return toast('Nº cuotas inválido');
     if(id){Object.assign(db.prestamos.find(x=>x.id===id),o);}
     else{db.prestamos.push(Object.assign({id:uid(),creado:new Date().toISOString()},o));}
     saveDB();buzz();closeModal();render();toast('Préstamo guardado');
   }
   
   /* =========================================================
      DETALLE PRÉSTAMO
      ========================================================= */
   function openPrestamoDetalle(id){
     const p=db.prestamos.find(x=>x.id===id);if(!p)return;
     const r=resumenPrestamo(p);
     const per=personaDe(p.personaId);
     const cuotas=cuotasConEstado(p);
     const pagos=pagosDe(p).slice().reverse();
     const hoy=hoyISO();
   
     openModal(modalShell({
       title:per.nombre,
       body:`
         <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px">
           <span class="tag ${r.estado}">${r.estado}</span>
           <button class="btn sm" onclick="generarPagare('${p.id}')"><i class="fa-solid fa-file-contract mr-1"></i>Pagaré</button>
         </div>
         <div class="card">
           <div class="kv"><span>Capital</span><b>${money(r.cap)}</b></div>
           <div class="kv"><span>Interés</span><b>${money(r.interes)}</b></div>
           <div class="kv"><span>Total</span><b>${money(r.total)}</b></div>
           <div class="kv"><span>Pagado</span><b>${money(r.pag)}</b></div>
           <div class="kv"><span>Saldo</span><b>${money(r.saldo)}</b></div>
           ${r.mora>0?`<div class="kv bad"><span>Mora</span><b>${money(r.mora)}</b></div>`:''}
           <div class="kv"><span>Vence</span><b>${fmtFecha(p.primerVencimiento)}</b></div>
         </div>
         ${p.notas?`<div class="card"><b class="text-xs">Notas</b><div class="text-xs text-slate-500">${esc(p.notas)}</div></div>`:''}
         <h3 class="font-bold my-2">Plan de pagos</h3>
         <div class="card">
           ${cuotas.map(c=>{
             const venc=c.pendiente>0.009&&c.fecha<hoy;
             return `<div class="cuota">
               <span>Cuota ${c.n} · ${fmtFecha(c.fecha)}</span>
               <span class="${c.pendiente<=0.009?'text-green-600 font-bold':venc?'text-red-600 font-bold':''}">
                 ${c.pendiente<=0.009?'<i class="fa-solid fa-check mr-1"></i>pagada':money(c.pendiente)}
               </span>
             </div>`;
           }).join('')}
         </div>
         <h3 class="font-bold my-2">Pagos (${pagos.length})</h3>
         <div class="card">
           ${pagos.length?pagos.map(g=>`
             <div class="cuota">
               <span>${fmtFecha(g.fecha)}${g.nota?` · <span class="text-slate-400">${esc(g.nota)}</span>`:''}</span>
               <span style="display:flex;gap:6px;align-items:center">
                 <b>${money(g.monto)}</b>
                 <button class="btn sm ghost" onclick="openRecibo('${g.id}')" title="Recibo"><i class="fa-solid fa-receipt"></i></button>
                 <button class="btn sm ghost" onclick="borrarPago('${g.id}','${p.id}')" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
               </span>
             </div>`).join(''):'<div class="text-xs text-slate-400">Sin pagos aún</div>'}
         </div>`,
       foot:`
         <button class="btn ghost" onclick="closeModalForNew();setTimeout(()=>openPrestamoForm('${p.id}'),50)">Editar</button>
         <button class="btn" onclick="closeModalForNew();setTimeout(()=>openPersonaDetalle('${p.personaId}'),50)">Persona</button>
         <button class="btn primary" onclick="closeModalForNew();setTimeout(()=>openPagoForm('${p.id}'),50)">+ Pago</button>`
     }));
   }
   
   async function borrarPrestamo(id){
     const pagos=db.pagos.filter(g=>g.prestamoId===id).length;
   
     const r = await Swal.fire({
       icon:'warning',
       title:'¿Eliminar este préstamo?',
       text: pagos ? `Se eliminarán también ${pagos} pago(s).` : '',
       showCancelButton:true,
       confirmButtonText:'Eliminar',
       confirmButtonColor:'#dc2626',
       cancelButtonText:'Cancelar'
     });
     if(!r.isConfirmed) return;
   
     db.prestamos=db.prestamos.filter(x=>x.id!==id);
     db.pagos=db.pagos.filter(g=>g.prestamoId!==id);
     saveDB();closeModal();render();toast('Préstamo eliminado');
   }
   
   async function borrarPago(pagoId,prestamoId){
     const r = await Swal.fire({
       icon:'warning',
       title:'¿Eliminar este pago?',
       showCancelButton:true,
       confirmButtonText:'Eliminar',
       confirmButtonColor:'#dc2626',
       cancelButtonText:'Cancelar'
     });
     if(!r.isConfirmed) return;
   
     db.pagos=db.pagos.filter(g=>g.id!==pagoId);
     saveDB();closeModalForNew();render();
     setTimeout(()=>openPrestamoDetalle(prestamoId),50);
     toast('Pago eliminado');
   }
   
   /* =========================================================
      FORM: PAGO + RECIBO
      ========================================================= */
   function openPagoForm(prestamoId,personaId){
     const activos=db.prestamos.filter(p=>estadoPrestamo(p)!=='pagado');
     if(!activos.length)return toast('No hay préstamos activos');
     let pid=prestamoId;
     if(!pid&&personaId){
       const delPer=activos.filter(p=>p.personaId===personaId);
       if(delPer.length)pid=delPer[0].id;
     }
     pid=pid||activos[0].id;
     const opts=activos.map(p=>{
       const r=resumenPrestamo(p);
       return `<option value="${p.id}" ${p.id===pid?'selected':''}>${esc(personaDe(p.personaId).nombre)} — saldo ${money(r.saldo)}</option>`;
     }).join('');
   
     openModal(modalShell({
       title:'Registrar pago',
       body:`
         <div class="form">
           <label>Préstamo<select id="pa_prestamo">${opts}</select></label>
           <div class="gridk">
             <label style="margin-bottom:0">Monto (RD$)<input id="pa_monto" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></label>
             <label style="margin-bottom:0">Fecha<input id="pa_fecha" type="date" value="${hoyISO()}"></label>
           </div>
           <div style="height:12px"></div>
           <label>Nota (opcional)<input id="pa_nota" placeholder="Ej. efectivo, transferencia…"></label>
           <div id="pa_info" class="preview"></div>
         </div>`,
       foot:`
         <button class="btn ghost" onclick="closeModal()">Cancelar</button>
         <button class="btn primary" onclick="savePago()">Registrar</button>`
     }));
     ['pa_prestamo','pa_monto'].forEach(i=>$('#'+i).addEventListener('input',updPagoInfo));
     updPagoInfo();
     setTimeout(()=>$('#pa_monto').focus(),120);
   }
   function updPagoInfo(){
     const p=db.prestamos.find(x=>x.id===$('#pa_prestamo').value);
     if(!p){$('#pa_info').innerHTML='';return;}
     const r=resumenPrestamo(p);
     const monto=Number($('#pa_monto').value)||0;
     const nuevo=r2(Math.max(0,r.saldo-monto));
     $('#pa_info').innerHTML=`
       <div class="kv"><span>Total</span><b>${money(r.total)}</b></div>
       <div class="kv"><span>Ya pagado</span><b>${money(r.pag)}</b></div>
       <div class="kv"><span>Saldo actual</span><b>${money(r.saldo)}</b></div>
       ${r.mora>0?`<div class="kv bad"><span>Mora</span><b>${money(r.mora)}</b></div>`:''}
       <div class="kv"><span>Saldo tras el pago</span><b>${money(nuevo)}</b></div>`;
   }
   function savePago(){
     const pid=$('#pa_prestamo').value;
     const monto=Number($('#pa_monto').value);
     const fecha=$('#pa_fecha').value||hoyISO();
     if(!(monto>0))return toast('Monto inválido');
     const pago={id:uid(),prestamoId:pid,monto:r2(monto),fecha,nota:$('#pa_nota').value.trim(),creado:new Date().toISOString()};
     db.pagos.push(pago);saveDB();buzz();
     closeModalForNew();
     render();
     const p=db.prestamos.find(x=>x.id===pid);
     const completo=estadoPrestamo(p)==='pagado';
     setTimeout(()=>openRecibo(pago.id,{esNuevo:true}),50);
     if(completo)toast('✅ Préstamo pagado por completo');
   }
   
   function openRecibo(pagoId,{esNuevo=false}={}){
    const g=db.pagos.find(x=>x.id===pagoId);if(!g)return;
    const p=db.prestamos.find(x=>x.id===g.prestamoId);if(!p)return;
    const per=personaDe(p.personaId);
    const r=resumenPrestamo(p);
    const cred=db.settings.creditor||{};
    const acreedor=cred.nombre||'PrestaMe';

     openModal(modalShell({
      title:esNuevo?'<i class="fa-solid fa-circle-check text-green-600 mr-1.5"></i>Pago registrado':'Recibo',
       body:`
         <div id="recibo-preview" class="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-blue-50/50 dark:bg-blue-950/20 text-sm">
           <h4 class="text-center tracking-widest text-xs text-slate-400 mb-1 font-bold">RECIBO DE PAGO</h4>
           <div class="text-center text-3xl font-extrabold text-blue-600 dark:text-blue-400 tabular-nums my-2">${money(g.monto)}</div>

           <div class="flex justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-800/60 text-xs"><span>Cliente</span><b>${esc(per.nombre)}</b></div>
${per.cedula?`<div class="flex justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-800/60 text-xs"><span>Cédula</span><b>${esc(per.cedula)}</b></div>`:''}
<div class="flex justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-800/60 text-xs"><span>Acreedor</span><b>${esc(acreedor)}</b></div>
${cred.cedula?`<div class="flex justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-800/60 text-xs"><span>Céd. acreedor</span><b>${esc(cred.cedula)}</b></div>`:''}


           <div class="flex justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-800/60 text-xs"><span>Fecha</span><b>${fmtFecha(g.fecha)}</b></div>
           ${g.nota?`<div class="flex justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-800/60 text-xs"><span>Nota</span><b>${esc(g.nota)}</b></div>`:''}
           <div class="flex justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-800/60 text-xs"><span>Capital préstamo</span><b>${money(p.capital)}</b></div>
           <div class="flex justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-800/60 text-xs"><span>Total a pagar</span><b>${money(r.total)}</b></div>
           <div class="flex justify-between py-1.5 border-b border-slate-200/60 dark:border-slate-800/60 text-xs"><span>Pagado acumulado</span><b>${money(r.pag)}</b></div>
           <div class="flex justify-between py-1.5 text-xs"><span>Saldo actual</span><b style="color:${r.saldo>0?'#dc2626':'#16a34a'}">${money(r.saldo)}</b></div>
           <div class="text-center mt-3 text-[11px] text-slate-400 italic">Gracias por su pago · ${esc(acreedor)}</div>
         </div>
         <p class="text-xs text-slate-500 text-center my-3">
           Comparte el recibo con tu cliente por WhatsApp.
         </p>`,
         foot:`
  <button class="btn ghost" onclick="copiarRecibo('${g.id}')" title="Copiar texto"><i class="fa-solid fa-copy"></i></button>
  <button class="btn ok" onclick="enviarPorWhatsApp('${g.id}')"><i class="fa-brands fa-whatsapp mr-1.5"></i>WhatsApp</button>
  <button class="btn danger" onclick="compartirReciboPDF('${g.id}')"><i class="fa-solid fa-file-pdf mr-1.5"></i>PDF</button>`
     }));
   }
   
   function textoRecibo(pagoId){
    const g=db.pagos.find(x=>x.id===pagoId);if(!g)return'';
    const p=db.prestamos.find(x=>x.id===g.prestamoId);if(!p)return'';
    const per=personaDe(p.personaId);
    const r=resumenPrestamo(p);
    const cred=db.settings.creditor||{};
    const acreedor=cred.nombre||'PrestaMe';

     const line='━━━━━━━━━━━━━━━';
     return `✅ *RECIBO DE PAGO*
${line}
🏦 *Acreedor:* ${acreedor}${cred.cedula?`\n🪪 Céd. acreedor: ${cred.cedula}`:''}
👤 *Cliente:* ${per.nombre}${per.cedula?`\n🪪 Cédula: ${per.cedula}`:''}
📅 Fecha: ${fmtFecha(g.fecha)}
   
   💵 *Monto recibido:* ${money(g.monto)}${g.nota?`\n📝 Nota: ${g.nota}`:''}
   
   📊 *Detalle del préstamo*
   • Capital: ${money(p.capital)}
   • Total a pagar: ${money(r.total)}
   • Pagado: ${money(r.pag)}
   • *Saldo actual:* ${money(r.saldo)}
   ${r.mora>0?`• Mora acum.: ${money(r.mora)}\n`:''}
   ${line}
Gracias por su pago 🙏
_${acreedor}_`;
   }
   
   async function compartirRecibo(pagoId){
     const texto=textoRecibo(pagoId);
     if(!texto)return toast('Error al generar recibo');
     if(navigator.share){
       try{
         await navigator.share({title:'Recibo de pago',text:texto});
         return;
       }catch(e){
         if(e.name==='AbortError')return;
       }
     }
     try{await navigator.clipboard.writeText(texto);toast('Recibo copiado');}
     catch(e){mostrarTextoParaCopiar('Copia el recibo',texto);}
   }
   function enviarPorWhatsApp(pagoId){
     const texto=textoRecibo(pagoId);
     const g=db.pagos.find(x=>x.id===pagoId);if(!g)return;
     const p=db.prestamos.find(x=>x.id===g.prestamoId);if(!p)return;
     const per=personaDe(p.personaId);
     const tel=waPhone(per.telefono);
     const url=tel?`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`:
                   `https://wa.me/?text=${encodeURIComponent(texto)}`;
     window.open(url,'_blank','noopener');
   }
   async function copiarRecibo(pagoId){
     const texto=textoRecibo(pagoId);
     try{await navigator.clipboard.writeText(texto);buzz();toast('Recibo copiado');}
     catch(e){mostrarTextoParaCopiar('Copia el recibo',texto);}
   }
   
   /* =========================================================
      WHATSAPP HELPER
      ========================================================= */
   function waPhone(tel){
     const d=String(tel||'').replace(/\D/g,'');
     if(!d)return'';
     if(d.length===10)return '1'+d;
     if(d.length===11&&d.startsWith('1'))return d;
     return d;
   }
   
   /* =========================================================
      PAGARÉ
      ========================================================= */
   function apocopar(s){
     return String(s)
       .replace(/veintiuno$/, 'veintiún')
       .replace(/ y uno$/, ' y un')
       .replace(/uno$/, 'un');
   }
   function spellEntero(n){
     n = Math.floor(n);
     if (n === 0) return 'cero';
     if (n < 0) return 'menos ' + spellEntero(-n);
     if (n > 999999999) return String(n);
     const UNIDADES = ['','un','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
       'diez','once','doce','trece','catorce','quince','diecisiete','dieciocho','diecinueve',
       'veinte','veintiuno','veintidós','veintitrés','veinticinco','veintisiete','veintiocho','veintinueve'];
     const DECENAS  = ['','','','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
     const CENTENAS = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
     function seccion(x){
       if (x === 0) return '';
       if (x === 100) return 'cien';
       let out = '';
       if (x >= 100){ out += CENTENAS[Math.floor(x/100)] + ' '; x = x % 100; }
       if (x === 0) return out.trim();
       if (x < 30){ out += UNIDADES[x]; }
       else { out += DECENAS[Math.floor(x/10)]; if (x % 10) out += ' y ' + UNIDADES[x % 10]; }
       return out.trim();
     }
     const millones = Math.floor(n / 1000000);
     const resto1 = n % 1000000;
     const miles = Math.floor(resto1 / 1000);
     const unidades = resto1 % 1000;
     const partes = [];
     if (millones > 0){ partes.push(millones === 1 ? 'un millón' : apocopar(seccion(millones)) + ' millones'); }
     if (miles > 0){ partes.push(miles === 1 ? 'mil' : apocopar(seccion(miles)) + ' mil'); }
     if (unidades > 0){ partes.push(seccion(unidades)); }
     return partes.join(' ');
   }
   function numeroALetras(n){
     n = Math.round((Number(n)||0) * 100) / 100;
     const entero = Math.floor(n);
     const centavos = Math.round((n - entero) * 100);
     let letras = apocopar(spellEntero(entero)).toUpperCase();
     letras += entero === 1 ? ' PESO DOMINICANO' : ' PESOS DOMINICANOS';
     if (centavos > 0) letras += ' CON ' + String(centavos).padStart(2,'0') + '/100';
     return letras;
   }
   
   function openCreditorForm(callback){
     const c = db.settings.creditor || {nombre:'',cedula:'',ciudad:''};
     if(callback) window._creditorCallback = callback;
     openModal(modalShell({
       title:'Mis datos (acreedor)',
       body:`
         <p class="text-xs text-slate-500 mt-0">Estos datos aparecen en los pagarés que generes como acreedor.</p>
         <div class="form">
           <label>Nombre completo *<input id="cr_nombre" value="${esc(c.nombre)}" autocomplete="name"></label>
           <label>Cédula<input id="cr_cedula" value="${esc(c.cedula)}" inputmode="numeric"></label>
           <label>Ciudad<input id="cr_ciudad" value="${esc(c.ciudad)}" placeholder="Ej. Santo Domingo"></label>
         </div>`,
       foot:`
         <button class="btn ghost" onclick="closeModal()">Cancelar</button>
         <button class="btn primary" onclick="saveCreditor()">Guardar</button>`
     }));
   }
   function saveCreditor(){
     const nombre = $('#cr_nombre').value.trim();
     if(!nombre) return toast('El nombre es obligatorio');
     db.settings.creditor = {
       nombre,
       cedula: $('#cr_cedula').value.trim(),
       ciudad: $('#cr_ciudad').value.trim()
     };
     saveDB(); buzz(); closeModal(); toast('Datos guardados');
     render();
     if(window._creditorCallback){
       const cb = window._creditorCallback;
       window._creditorCallback = null;
       setTimeout(cb, 150);
     }
   }
   
   function pagareContent(p, per, cred){
     const total = totalPactado(p);
     const letras = numeroALetras(total);
     const montoCuota = p.modalidad === 'cuotas' ? r2(total / p.numCuotas) : total;
     const freq = (FREQ[p.frecuencia]?.l || 'mensual').toLowerCase();
     const [y, m, d] = hoyISO().split('-');
     const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
     const ciudad = cred.ciudad || '___________________';
     const fechaTexto = `${parseInt(d)} días del mes de ${meses[parseInt(m)-1]} del año ${y}`;
     const firma = (nombre, cedula, rol) => `
       <div style="width:45%;text-align:center">
         <div style="height:55px"></div>
         <div style="border-top:1px solid #000;padding-top:5px">
           <b>${esc((nombre||'').toUpperCase())}</b><br>
           <span style="font-size:11px">${rol}</span>${cedula?`<br><span style="font-size:11px">Cédula: ${esc(cedula)}</span>`:''}
         </div>
       </div>`;
     return `
       <div style="text-align:center;font-size:20px;font-weight:bold;letter-spacing:6px;margin-bottom:24px;padding-bottom:10px;border-bottom:2px solid #000">PAGARÉ</div>
       <p style="text-align:justify;margin:0 0 14px">
         <b>POR: ${money(total)}</b><br>
         <span style="font-size:12px">(${letras})</span>
       </p>
       <p style="text-align:justify;margin:0 0 14px">
         Yo, <b>${esc((per.nombre||'').toUpperCase())}</b>, mayor de edad${per.cedula?`, portador(a) de la Cédula No. <b>${esc(per.cedula)}</b>`:''}${per.direccion?`, domiciliado(a) en ${esc(per.direccion)}`:''}, por medio del presente documento hago constar que debo y me comprometo a pagar incondicionalmente a la orden de <b>${esc((cred.nombre||'').toUpperCase())}</b>${cred.cedula?`, portador(a) de la Cédula No. <b>${esc(cred.cedula)}</b>`:''}, la suma de <b>${money(total)}</b> (${letras}), en concepto de préstamo personal.
       </p>
       <p style="margin:14px 0 8px;font-weight:bold">CONDICIONES DEL PAGO:</p>
       <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:12px">
         <tr><td style="padding:5px 0;width:42%;border-bottom:1px dotted #999"><b>Monto principal:</b></td><td style="padding:5px 0;border-bottom:1px dotted #999">${money(p.capital)}</td></tr>
         <tr><td style="padding:5px 0;border-bottom:1px dotted #999"><b>Interés:</b></td><td style="padding:5px 0;border-bottom:1px dotted #999">${p.interesModo==='ninguno'?'Sin interés':p.interesModo==='fijo'?money(p.interesValor):p.interesValor+'% mensual'}</td></tr>
         <tr><td style="padding:5px 0;border-bottom:1px dotted #999"><b>Total a pagar:</b></td><td style="padding:5px 0;border-bottom:1px dotted #999"><b>${money(total)}</b></td></tr>
         <tr><td style="padding:5px 0;border-bottom:1px dotted #999"><b>Forma de pago:</b></td><td style="padding:5px 0;border-bottom:1px dotted #999">${p.modalidad==='cuotas'?`${p.numCuotas} cuota(s) ${freq}(s) de ${money(montoCuota)} c/u`:'Pago único'}</td></tr>
         <tr><td style="padding:5px 0;border-bottom:1px dotted #999"><b>Primer vencimiento:</b></td><td style="padding:5px 0;border-bottom:1px dotted #999">${fmtFecha(p.primerVencimiento)}</td></tr>
         ${Number(p.moraMensual)>0?`<tr><td style="padding:5px 0;border-bottom:1px dotted #999"><b>Mora por atraso:</b></td><td style="padding:5px 0;border-bottom:1px dotted #999">${p.moraMensual}% mensual sobre saldo vencido</td></tr>`:''}
       </table>
       ${p.notas?`<p style="text-align:justify;margin:0 0 12px;font-size:12px"><b>Observaciones:</b> ${esc(p.notas)}</p>`:''}
       <p style="text-align:justify;margin:0 0 24px">
         El deudor reconoce que esta obligación es cierta, líquida y exigible, y renuncia expresamente a cualquier requerimiento previo para su cobro.
       </p>
       <p style="text-align:right;margin:0 0 40px">
         En ${esc(ciudad)}, a los ${fechaTexto}.
       </p>
       <table style="width:100%;margin-top:50px;font-size:12px">
         <tr>
           <td style="vertical-align:bottom;padding:0">${firma(per.nombre, per.cedula, 'Deudor(a)')}</td>
           <td style="width:10%"></td>
           <td style="vertical-align:bottom;padding:0">${firma(cred.nombre, cred.cedula, 'Acreedor(a)')}</td>
         </tr>
       </table>`;
   }
   
   function generarPagare(prestamoId){
     const p = db.prestamos.find(x=>x.id===prestamoId);
     if(!p) return;
     const per = personaDe(p.personaId);
     const cred = db.settings.creditor || {};
     if(!cred.nombre){
       return openCreditorForm(()=>generarPagare(prestamoId));
     }
     const preview = `<div style="background:#fff;color:#111;padding:22px;border-radius:10px;font-family:Georgia,'Times New Roman',serif;font-size:11.5px;line-height:1.55;max-height:58vh;overflow-y:auto">${pagareContent(p, per, cred)}</div>`;
     openModal(modalShell({
      title:'<i class="fa-solid fa-file-contract mr-1.5 text-slate-500"></i>Pagaré',
       body: preview,
       foot: `
  <button class="btn ghost" onclick="closeModal()" title="Cerrar"><i class="fa-solid fa-xmark"></i></button>
  <button class="btn" onclick="copiarPagareTexto('${prestamoId}')" title="Copiar texto"><i class="fa-solid fa-copy"></i></button>
  <button class="btn ok" onclick="compartirPagareTexto('${prestamoId}')"><i class="fa-brands fa-whatsapp mr-1.5"></i>Enviar</button>
  <button class="btn primary" onclick="imprimirPagare('${prestamoId}')"><i class="fa-solid fa-print mr-1.5"></i>PDF</button>`
     }));
   }
   
   function imprimirPagare(prestamoId){
     const p = db.prestamos.find(x=>x.id===prestamoId); if(!p) return;
     const per = personaDe(p.personaId);
     const cred = db.settings.creditor || {};
   
     const printArea = document.getElementById('print-area');
     printArea.innerHTML = pagareContent(p, per, cred);
   
     document.body.classList.add('printing');
   
     setTimeout(() => {
       window.print();
       document.body.classList.remove('printing');
       printArea.innerHTML = '';
     }, 300);
   }
   
   function pagareTexto(prestamoId){
     const p = db.prestamos.find(x=>x.id===prestamoId); if(!p) return '';
     const per = personaDe(p.personaId);
     const cred = db.settings.creditor || {};
     const total = totalPactado(p);
     const letras = numeroALetras(total);
     const cuota = p.modalidad==='cuotas' ? r2(total/p.numCuotas) : total;
     const freq = (FREQ[p.frecuencia]?.l||'mensual').toLowerCase();
     const [y,m,d] = hoyISO().split('-');
     const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
     const L = '━━━━━━━━━━━━━━━';
     return `📄 *PAGARÉ*
   ${L}
   *POR: ${money(total)}*
   (${letras})
   
   Yo, *${(per.nombre||'').toUpperCase()}*${per.cedula?`, portador(a) de la cédula *${per.cedula}*`:''}, hago constar que debo y me comprometo a pagar a la orden de *${(cred.nombre||'').toUpperCase()}*${cred.cedula?`, portador(a) de la cédula *${cred.cedula}*`:''}, la suma de *${money(total)}* (${letras}), en concepto de préstamo personal.
   
   *CONDICIONES:*
   • Monto principal: ${money(p.capital)}
   • Interés: ${p.interesModo==='ninguno'?'Sin interés':p.interesModo==='fijo'?money(p.interesValor):p.interesValor+'% mensual'}
   • Total a pagar: ${money(total)}
   • Forma de pago: ${p.modalidad==='cuotas'?`${p.numCuotas} cuota(s) ${freq}(s) de ${money(cuota)} c/u`:'Pago único'}
   • Primer vencimiento: ${fmtFecha(p.primerVencimiento)}
   ${Number(p.moraMensual)>0?`• Mora: ${p.moraMensual}% mensual sobre saldo vencido\n`:''}
   ${p.notas?`\n📝 _Observaciones:_ ${p.notas}\n`:''}
   El deudor reconoce que esta obligación es cierta, líquida y exigible.
   
   En ${cred.ciudad||'___________________'}, a los ${parseInt(d)} días del mes de ${meses[parseInt(m)-1]} del ${y}.
   
   ${L}
   *Firma del deudor:* ______________________
   ${(per.nombre||'').toUpperCase()}${per.cedula?`\nCédula: ${per.cedula}`:''}
   
   *Firma del acreedor:* ______________________
   ${(cred.nombre||'').toUpperCase()}${cred.cedula?`\nCédula: ${cred.cedula}`:''}
   ${L}
   _PrestaMe_`;
   }
   
   function compartirPagareTexto(prestamoId){
     const texto = pagareTexto(prestamoId); if(!texto) return;
     if(navigator.share){
       navigator.share({title:'Pagaré', text:texto}).catch(()=>{});
       return;
     }
     const p = db.prestamos.find(x=>x.id===prestamoId);
     const per = personaDe(p.personaId);
     const tel = waPhone(per.telefono);
     const url = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
                     : `https://wa.me/?text=${encodeURIComponent(texto)}`;
     window.open(url, '_blank', 'noopener');
   }
   
   async function copiarPagareTexto(prestamoId){
     const texto = pagareTexto(prestamoId);
     try{ await navigator.clipboard.writeText(texto); buzz(); toast('Pagaré copiado'); }
     catch(e){ mostrarTextoParaCopiar('Copia el pagaré', texto); }
   }
   
   /* =========================================================
      CAMBIAR PIN
      ========================================================= */
   function openCambiarPin(){
     openModal(modalShell({
       title:'Cambiar PIN',
       body:`
         <div class="form">
           <label>PIN actual<input id="cp_old" type="password" inputmode="numeric" maxlength="8"></label>
           <label>Nuevo PIN (4–8 dígitos)<input id="cp_new" type="password" inputmode="numeric" maxlength="8"></label>
           <label>Repite el nuevo PIN<input id="cp_new2" type="password" inputmode="numeric" maxlength="8"></label>
         </div>`,
       foot:`
         <button class="btn ghost" onclick="closeModal()">Cancelar</button>
         <button class="btn primary" onclick="cambiarPin()">Cambiar</button>`
     }));
   }
   async function cambiarPin(){
    const oldp = $('#cp_old').value.trim();
    const n1   = $('#cp_new').value.trim();
    const n2   = $('#cp_new2').value.trim();
  
    if(!(await verificarPin(oldp, db.settings.pinHash)))
      return toast('PIN actual incorrecto');
    if(n1.length < 4) return toast('Mínimo 4 dígitos');
    if(n1 !== n2)     return toast('No coinciden');
  
    db.settings.pinHash = await hashPin(n1);
    saveDB();
    buzz();
    closeModal();
    toast('PIN actualizado');
  }
   
   /* =========================================================
      EXPORTAR / IMPORTAR
      ========================================================= */
   function descargar(nombre,contenido,tipo){
     const b=new Blob([contenido],{type:tipo});
     const a=document.createElement('a');
     a.href=URL.createObjectURL(b);a.download=nombre;
     document.body.appendChild(a);a.click();a.remove();
     setTimeout(()=>URL.revokeObjectURL(a.href),1500);
   }
   function exportarJSON(){
     descargar('PrestaMe-'+hoyISO()+'.json',JSON.stringify(db,null,2),'application/json');
     toast('Respaldo descargado');
   }
   function toCSV(rows){
     return '\uFEFF'+rows.map(r=>r.map(c=>'"'+String(c??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
   }
   function exportarCSV(){
     const fp=[['Persona','Cédula','Teléfono','Capital','Interés','Total','Pagado','Saldo','Mora','Estado','Inicio','Vencimiento']];
     db.prestamos.forEach(p=>{
       const per=personaDe(p.personaId),r=resumenPrestamo(p);
       fp.push([per.nombre,per.cedula||'',per.telefono||'',r.cap,r.interes,r.total,r.pag,r.saldo,r.mora,r.estado,p.fechaInicio,p.primerVencimiento]);
     });
     const fg=[['Persona','Fecha','Monto','Nota']];
     db.pagos.slice().sort((a,b)=>a.fecha.localeCompare(b.fecha)).forEach(g=>{
       const p=db.prestamos.find(x=>x.id===g.prestamoId);
       fg.push([p?personaDe(p.personaId).nombre:'—',g.fecha,g.monto,g.nota||'']);
     });
     descargar('PrestaMe-'+hoyISO()+'.csv',
       'PRESTAMOS\r\n'+toCSV(fp)+'\r\n\r\nPAGOS\r\n'+toCSV(fg),'text/csv;charset=utf-8');
     toast('CSV descargado');
   }
   
   function importarJSON(input){
     const f=input.files[0];if(!f)return;
     const reader=new FileReader();
     reader.onload=async()=>{
       try{
         const d=JSON.parse(reader.result);
         if(!d||!Array.isArray(d.personas)||!Array.isArray(d.prestamos))throw new Error('formato');
   
         const r = await Swal.fire({
           icon:'warning',
           title:'¿Restaurar respaldo?',
           text:'Esto reemplazará TODOS los datos actuales.',
           showCancelButton:true,
           confirmButtonText:'Restaurar',
           confirmButtonColor:'#2563eb',
           cancelButtonText:'Cancelar'
         });
         input.value='';
         if(!r.isConfirmed) return;
   
         db={
          settings:Object.assign({
            pinHash: db.settings.pinHash,
            salt:    db.settings.salt,
            moraDefault: 5,
            creditor: { nombre:'',cedula:'',ciudad:'' }
          }, d.settings || {}),
           personas:d.personas, prestamos:d.prestamos, pagos:d.pagos||[]
         };
         saveDB();render();buzz();toast('Respaldo restaurado');
       }catch(e){ input.value=''; toast('Archivo inválido'); }
     };
     reader.readAsText(f);
   }
   
/* =========================================================
   PWA
   ========================================================= */
   (function initPWA(){
    const icon='data:image/svg+xml;utf8,'+encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#2563eb"/><text x="256" y="330" font-size="240" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="bold">RD$</text></svg>');
    const manifest={
      name:'PrestaMe',short_name:'Presta',start_url:'.',scope:'.',
      display:'standalone',background_color:'#0b1220',theme_color:'#0b1220',
      lang:'es',orientation:'portrait',
      icons:[{src:icon,sizes:'512x512',type:'image/svg+xml',purpose:'any'}]
    };
    let link=document.querySelector('link[rel="manifest"]');
    if(!link){
      link=document.createElement('link');
      link.rel='manifest';
      document.head.appendChild(link);
    }
    try{link.href='data:application/manifest+json;charset=utf-8,'+encodeURIComponent(JSON.stringify(manifest));}catch(e){}
  
    if('serviceWorker' in navigator && location.protocol.startsWith('http')){
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
        .then(reg => {
          // Chequeo periódico de actualizaciones (cada 60 min)
          setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  
          // Si hay un SW esperando, activarlo
          const activarSiEspera = () => {
            if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          };
          activarSiEspera();
  
          // Detectar cuando aparece una nueva versión
          reg.addEventListener('updatefound', () => {
            const nuevo = reg.installing;
            if (!nuevo) return;
            nuevo.addEventListener('statechange', () => {
              if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
                // Hay nueva versión lista → activar
                nuevo.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          });
        })
        .catch(() => {});
  
      // Mensaje del SW → recargar
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'SW_ACTIVATED') {
          toast('App actualizada');
          setTimeout(() => window.location.reload(), 800);
        }
      });
  
      // Cuando el SW toma control (primera vez o tras update) → recargar
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }
  })();
   
   /* =========================================================
      ARRANQUE
      ========================================================= */
   initLock();
   document.addEventListener('keydown',e=>{
     if(e.key==='Escape'&&!$('#modal').classList.contains('hidden'))closeModal();
   });