'use strict';
// Sin bibliotecas externas. Todos los análisis usan la misma muestra filtrada.
const $ = id => document.getElementById(id);
const COLORS = ['#245B70', '#6B9B83', '#F2C66D', '#91B3C2', '#9CA795'];
const variables = [
  {key:'sector',label:'Sector',question:'¿Cuál es la actividad principal del negocio?',type:'Cualitativa nominal',values:['Comercio','Alimentos','Servicios']},
  {key:'canal',label:'Canal principal',question:'¿Qué canal de publicidad utilizó principalmente este mes?',type:'Cualitativa nominal',values:['Redes sociales','Rótulos y volantes','Recomendaciones','Sin publicidad']},
  {key:'promocion',label:'Usa promociones',question:'¿Ofreció alguna promoción durante este mes?',type:'Cualitativa nominal',values:['No','Sí']},
  {key:'antiguedad',label:'Antigüedad',question:'¿Cuántos meses completos lleva funcionando el negocio?',type:'Cuantitativa discreta',unit:'meses',min:1,max:1200,integer:true},
  {key:'empleados',label:'Personas ocupadas',question:'¿Cuántas personas trabajaron habitualmente, incluyendo al propietario?',type:'Cuantitativa discreta',unit:'personas',min:1,max:50,integer:true},
  {key:'inversion',label:'Inversión publicitaria',question:'¿Cuánto gastó en publicidad este mes, sin incluir el costo de los descuentos?',type:'Cuantitativa continua',unit:'C$',min:0,max:10000000},
  {key:'publicaciones',label:'Publicaciones',question:'¿Cuántas publicaciones promocionales realizó en redes este mes?',type:'Cuantitativa discreta',unit:'publicaciones',min:0,max:10000,integer:true},
  {key:'descuento',label:'Descuento promedio',question:'¿Cuál fue el porcentaje promedio de descuento de sus promociones? Sin promociones: 0.',type:'Cuantitativa continua',unit:'%',min:0,max:100},
  {key:'diasPromo',label:'Días con promoción',question:'¿Durante cuántos días del mes ofreció promociones? Sin promociones: 0.',type:'Cuantitativa discreta',unit:'días',min:0,max:31,integer:true},
  {key:'clientes',label:'Compras atendidas',question:'¿Cuántas transacciones de compra atendió este mes? Incluya compras repetidas.',type:'Cuantitativa discreta',unit:'transacciones',min:0,max:10000000,integer:true},
  {key:'ventasAntes',label:'Ventas mes anterior',question:'¿Cuáles fueron sus ingresos brutos por ventas en el mes anterior?',type:'Cuantitativa continua',unit:'C$',min:0,max:1000000000},
  {key:'ventas',label:'Ventas del mes',question:'¿Cuáles fueron sus ingresos brutos por ventas en el mes de referencia?',type:'Cuantitativa continua',unit:'C$',min:0,max:1000000000},
  {key:'satisfaccion',label:'Satisfacción',question:'¿Cómo califica su satisfacción con las ventas del mes?',type:'Cualitativa ordinal',values:['Baja','Media','Alta']}
];
const nums=variables.filter(v=>!v.values), cats=variables.filter(v=>v.values);
const meta = key => variables.find(v=>v.key===key);
const name = key => `${meta(key).label}${meta(key).unit ? ' ('+meta(key).unit+')' : ''}`;
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite = x => typeof x==='number' && Number.isFinite(x);
const fmt = (v,d=2) => finite(v)?v.toLocaleString('es-NI',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const pct = (v,d=1) => finite(v)?fmt(100*v,d)+' %':'—';
const sum = a=>a.reduce((s,x)=>s+x,0);
const mean = a=>a.length?sum(a)/a.length:NaN;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const values = (rows,key)=>rows.map(r=>r[key]).filter(finite);
let data=[], filtered=[], page=1, sortKey='id', ascending=true, currentModel=null;
const PAGE_SIZE=12;
function table(headers,rows,caption=''){
  return `<div class="table-wrap"><table>${caption?`<caption>${esc(caption)}</caption>`:''}<thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">No hay casos válidos para este análisis.</td></tr>`}</tbody></table></div>`;
}
function reading(text){return `<div class="interpret"><h3>¿Cómo se interpreta?</h3><p>${text}</p></div>`;}
function empty(text='No hay datos suficientes con los filtros actuales.'){return `<p class="empty">${esc(text)}</p>`;}
function metrics(items){return `<div class="metrics">${items.map(([a,b])=>`<div class="metric">${esc(a)}<strong>${esc(b)}</strong></div>`).join('')}</div>`;}
function validPairs(rows,x,y){return rows.filter(r=>finite(r[x])&&finite(r[y]));}
function quantile(sorted,p){if(!sorted.length)return NaN;const pos=(sorted.length-1)*p, i=Math.floor(pos);return sorted[i]+(pos-i)*((sorted[i+1]??sorted[i])-sorted[i]);}
function modes(a){const counts=new Map();a.forEach(x=>counts.set(x,(counts.get(x)||0)+1));const max=Math.max(0,...counts.values());return {count:max,items:max>1?[...counts].filter(([,n])=>n===max).map(([x])=>x):[]};}
function stats(a){const s=[...a].sort((a,b)=>a-b),n=s.length,m=mean(s),variance=n>1?sum(s.map(x=>(x-m)**2))/(n-1):NaN;return {n,mean:m,median:quantile(s,.5),min:n?s[0]:NaN,max:n?s[n-1]:NaN,range:n?s[n-1]-s[0]:NaN,variance,sd:Math.sqrt(variance),q1:quantile(s,.25),q3:quantile(s,.75),p10:quantile(s,.1),p90:quantile(s,.9),cv:m>0?Math.sqrt(variance)/m:NaN,modes:modes(s)};}
function modeText(m){if(!m.items.length)return 'Sin moda (sin repeticiones)';if(m.items.length>5)return `${m.items.length} modas (frecuencia ${m.count})`;return m.items.map(x=>typeof x==='number'?fmt(x):x).join(' / ');}
function frequencies(rows,key){const v=meta(key),n=rows.filter(r=>v.values.includes(r[key])).length;let cum=0;return {n,items:v.values.map(label=>{const f=rows.filter(r=>r[key]===label).length;cum+=f;return {label,f,cum,p:n?f/n:NaN};})};}
function grouped(a,requested='auto'){
  if(!a.length)return [];
  const lo=Math.min(...a),hi=Math.max(...a),k=hi===lo?1:(requested==='auto'?Math.ceil(1+Math.log2(a.length)):Number(requested));
  const width=hi===lo?Math.max(1,Math.abs(lo)*.01):(hi-lo)/k;
  const bins=Array.from({length:k},(_,i)=>({lo:lo+i*width,hi:lo+(i+1)*width,mid:lo+(i+.5)*width,f:0,last:i===k-1}));
  if(hi!==lo)bins[k-1].hi=hi;
  for(const value of a){const i=clamp(Math.floor((value-lo)/width),0,k-1);bins[i].f++;}
  let cum=0;return bins.map(b=>({...b,cum:cum+=b.f,p:b.f/a.length}));
}
// Gamma regularizada superior Q(a,x): cola derecha de chi-cuadrado con a=gl/2, x=chi²/2.
function logGamma(z){const c=[676.5203681218851,-1259.1392167224028,771.3234287776531,-176.6150291621406,12.507343278686905,-.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);z-=1;let x=.9999999999998099;for(let i=0;i<c.length;i++)x+=c[i]/(z+i+1);const t=z+c.length-.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);}
function gammaQ(a,x){
  if(x===0)return 1;if(x<0||a<=0)return NaN;
  const factor=Math.exp(-x+a*Math.log(x)-logGamma(a)), eps=1e-14,tiny=1e-300;
  if(x<a+1){let ap=a,term=1/a,total=term;for(let i=1;i<10000;i++){term*=x/(++ap);total+=term;if(Math.abs(term)<Math.abs(total)*eps)break;}return clamp(1-total*factor,0,1);}
  let b=x+1-a,c=1/tiny,d=1/(Math.abs(b)<tiny?tiny:b),h=d;
  for(let i=1;i<10000;i++){const an=-i*(i-a);b+=2;d=an*d+b;if(Math.abs(d)<tiny)d=tiny;c=b+an/c;if(Math.abs(c)<tiny)c=tiny;d=1/d;const delta=d*c;h*=delta;if(Math.abs(delta-1)<eps)break;}
  return clamp(factor*h,0,1);
}
function chiSquare(rows,a,b){
  const pairs=rows.filter(r=>meta(a).values.includes(r[a])&&meta(b).values.includes(r[b]));
  const aa=meta(a).values.filter(v=>pairs.some(r=>r[a]===v)),bb=meta(b).values.filter(v=>pairs.some(r=>r[b]===v));
  const observed=aa.map(x=>bb.map(y=>pairs.filter(r=>r[a]===x&&r[b]===y).length)),rt=observed.map(sum),ct=bb.map((_,j)=>sum(observed.map(row=>row[j]))),n=pairs.length;
  const expected=rt.map(t=>ct.map(u=>n?t*u/n:0)),flat=expected.flat();let chi=0;
  observed.forEach((row,i)=>row.forEach((o,j)=>{if(expected[i][j]>0)chi+=(o-expected[i][j])**2/expected[i][j];}));
  const df=(aa.length-1)*(bb.length-1),valid=aa.length>1&&bb.length>1&&n>0;
  return {aa,bb,observed,expected,rt,ct,n,chi,df,p:valid?gammaQ(df/2,chi/2):NaN,valid,under5:flat.filter(v=>v<5).length,min:flat.length?Math.min(...flat):NaN,cells:flat.length};
}
function regression(rows,x,y){
  const pairs=validPairs(rows,x,y),n=pairs.length,xs=pairs.map(r=>r[x]),ys=pairs.map(r=>r[y]),mx=mean(xs),my=mean(ys),sxx=sum(xs.map(v=>(v-mx)**2)),syy=sum(ys.map(v=>(v-my)**2)),sxy=sum(pairs.map(r=>(r[x]-mx)*(r[y]-my)));
  const valid=n>=3&&sxx>0&&syy>0&&x!==y,b=valid?sxy/sxx:NaN,a=valid?my-b*mx:NaN,r=valid?clamp(sxy/Math.sqrt(sxx*syy),-1,1):NaN;
  return {pairs,n,a,b,r,r2:r*r,valid,min:n?Math.min(...xs):NaN,max:n?Math.max(...xs):NaN,x,y};
}
function strength(r){const a=Math.abs(r);return a<.1?'prácticamente nula':a<.3?'débil':a<.5?'moderada':a<.7?'considerable':'fuerte';}
function normal(){const u=Math.max(Math.random(),Number.EPSILON),v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function pick(a){return a[Math.floor(Math.random()*a.length)];}
function round(x){return Math.round(x*100)/100;}
function makeSample(n){
  return Array.from({length:n},(_,i)=>{
    const sector=pick(meta('sector').values),canal=pick(meta('canal').values),promocion=Math.random()<.55?'Sí':'No',empleados=1+Math.floor(Math.random()*7);
    const inversion=canal==='Sin publicidad'?0:Math.round(clamp(1800+normal()*1250+empleados*210,100,8500)/50)*50;
    const descuento=promocion==='Sí'?pick([5,10,15,20,25,30]):0,diasPromo=promocion==='Sí'?3+Math.floor(Math.random()*22):0;
    const ventasAntes=Math.round(clamp(19000+empleados*4800+(sector==='Comercio'?7000:0)+normal()*13000,5000,105000)/100)*100;
    const ventas=Math.round(clamp(ventasAntes*.85+inversion*2.7+(promocion==='Sí'?2500:0)+normal()*14500,2500,160000)/100)*100;
    const score=(ventas-ventasAntes)/Math.max(ventasAntes,1)+normal()*.27;
    return {id:i+1,sector,canal,promocion,antiguedad:3+Math.floor(Math.random()*178),empleados,inversion,publicaciones:canal==='Redes sociales'?Math.floor(Math.random()*30)+3:Math.floor(Math.random()*8),descuento,diasPromo,clientes:Math.max(10,Math.round(ventas/(80+Math.random()*240)+normal()*25)),ventasAntes,ventas,satisfaccion:score<-.12?'Baja':score>.15?'Alta':'Media'};
  });
}
function setup(){
  $('questions').innerHTML=`<thead><tr><th>#</th><th>Pregunta</th><th>Variable y tipo</th><th>Codificación / dominio</th></tr></thead><tbody>${variables.map((v,i)=>`<tr><td>${i+1}</td><td>${esc(v.question)}</td><td><b>${esc(v.label)}</b><br>${esc(v.key)} · ${esc(v.type)}</td><td>${v.values?v.values.map((x,j)=>`${j+1} = ${esc(x)}`).join('; '):`${v.integer?'Entero':'Número'} de ${v.min} a ${fmt(v.max,0)} ${esc(v.unit)}; vacío = faltante`}</td></tr>`).join('')}</tbody>`;
  const options = list=>list.map(v=>`<option value="${v.key}">${esc(name(v.key))}</option>`).join('');
  $('freq-var').innerHTML=options(variables);$('freq-var').value='canal';
  ['chi-a','chi-b'].forEach(id=>$(id).innerHTML=options(cats));$('chi-a').value='promocion';$('chi-b').value='satisfaccion';
  ['x-var','y-var','hist-var'].forEach(id=>$(id).innerHTML=options(nums));$('x-var').value='inversion';$('y-var').value='ventas';$('hist-var').value='ventas';
  $('sector-filter').innerHTML='<option value="">Todos los sectores</option>'+meta('sector').values.map(v=>`<option>${esc(v)}</option>`).join('');
  $('promo-filter').innerHTML='<option value="">Todas las respuestas</option>'+meta('promocion').values.map(v=>`<option>${esc(v)}</option>`).join('');
  $('entry-form').innerHTML=variables.map(v=>`<label>${esc(name(v.key))}${v.values?`<select name="${v.key}"><option value="">Sin respuesta</option>${v.values.map(s=>`<option>${esc(s)}</option>`).join('')}</select>`:`<input name="${v.key}" type="number" min="${v.min}" max="${v.max}" step="${v.integer?'1':'.01'}" placeholder="Sin respuesta">`}</label>`).join('')+'<button class="button primary" type="submit">Agregar negocio</button>';
  $('entry-form').addEventListener('submit',addRecord);
  $('generate').addEventListener('click',()=>{const n=Number($('sample-size').value);if(!Number.isInteger(n)||n<40||n>500){$('sample-size').reportValidity();return;}data=makeSample(n);clearFilters();$('entry-status').textContent='';update();});
  ['search','sector-filter','promo-filter'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',()=>{page=1;update();}));
  $('reset').addEventListener('click',()=>{clearFilters();update();});
  ['freq-var','bins','chi-a','chi-b','alpha','x-var','y-var','hist-var'].forEach(id=>$(id).addEventListener('change',update));
  $('prev').addEventListener('click',()=>{page--;renderData();});$('next').addEventListener('click',()=>{page++;renderData();});
  $('csv').addEventListener('click',downloadCSV);$('predict').addEventListener('click',predict);
  $('print').addEventListener('click',()=>window.print());
  window.addEventListener('beforeprint',()=>{renderData(true);$('fitted').closest('details').open=true;});
  window.addEventListener('afterprint',()=>renderData());
  if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+entry.target.id));}},{rootMargin:'-5% 0px -70% 0px'});document.querySelectorAll('main section').forEach(s=>observer.observe(s));}
  data=makeSample(60);update();
}
function clearFilters(){ $('search').value='';$('sector-filter').value='';$('promo-filter').value='';page=1;}
function addRecord(event){
  event.preventDefault();const form=new FormData(event.target),record={id:Math.max(0,...data.map(r=>r.id))+1};
  for(const v of variables){const raw=form.get(v.key);record[v.key]=raw===''?null:v.values?raw:Number(raw);if(!v.values&&record[v.key]!==null&&(!finite(record[v.key])||record[v.key]<v.min||record[v.key]>v.max||(v.integer&&!Number.isInteger(record[v.key])))){ $('entry-status').textContent='Revisa el campo '+v.label;return;}}
  if(record.promocion==='No'){record.descuento=0;record.diasPromo=0;}
  if(record.canal==='Sin publicidad'&&record.inversion>0){$('entry-status').textContent='Sin publicidad debe tener inversión publicitaria cero o sin respuesta.';return;}
  data.push(record);clearFilters();update();event.target.reset();$('entry-status').textContent=`Negocio ${String(record.id).padStart(3,'0')} agregado. Los análisis ya incluyen la respuesta.`;
}
function update(){
  const q=$('search').value.trim().toLocaleLowerCase();
  filtered=data.filter(r=>(!q||`negocio ${String(r.id).padStart(3,'0')}`.includes(q))&&(!$('sector-filter').value||r.sector===$('sector-filter').value)&&(!$('promo-filter').value||r.promocion===$('promo-filter').value));
  filtered.sort((a,b)=>{const x=a[sortKey],y=b[sortKey];if(x==null)return y==null?0:1;if(y==null)return -1;return (typeof x==='number'?x-y:String(x).localeCompare(String(y),'es'))*(ascending?1:-1);});
  renderData();renderKpis();renderFrequency();renderDescriptive();renderChi();renderRelations();renderCharts();renderSynthesis();
}
function renderData(all=false){
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));page=clamp(page,1,pages);const rows=all?filtered:filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
  const headers=[{key:'id',label:'Negocio'},...variables];
  $('data-table').innerHTML=`<thead><tr>${headers.map(v=>`<th scope="col" aria-sort="${sortKey===v.key?(ascending?'ascending':'descending'):'none'}"><button data-sort="${v.key}">${esc(v.label)}${sortKey===v.key?(ascending?' ↑':' ↓'):''}${v.unit?`<br><small>${esc(v.unit)}</small>`:''}</button></th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${headers.map(v=>`<td>${v.key==='id'?'Negocio '+String(r.id).padStart(3,'0'):r[v.key]==null?'Sin respuesta':finite(r[v.key])?fmt(r[v.key],v.integer?0:2):esc(r[v.key])}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="14">No hay registros que coincidan con los filtros.</td></tr>`}</tbody>`;
  $('data-table').querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{ascending=sortKey===b.dataset.sort?!ascending:true;sortKey=b.dataset.sort;update();}));
  $('data-status').textContent=`Muestra sintética: ${filtered.length} de ${data.length} negocios seleccionados. Resultados calculados sobre todos los registros seleccionados, con exclusión de faltantes por procedimiento.`;
  $('page-status').textContent=`Página ${page} de ${pages}`;$('prev').disabled=page<=1;$('next').disabled=page>=pages;
}
function renderKpis(){
  const p=filtered.filter(r=>r.promocion==='Sí').length,den=filtered.filter(r=>meta('promocion').values.includes(r.promocion)).length;
  $('kpis').innerHTML=[['Negocios seleccionados',fmt(filtered.length,0),'Unidad: un negocio'],['Ventas medias',`C$ ${fmt(mean(values(filtered,'ventas')))}`,'Ingresos brutos del mes'],['Inversión media',`C$ ${fmt(mean(values(filtered,'inversion')))}`,'Publicidad mensual'],['Usan promociones',den?pct(p/den):'—','Entre respuestas válidas']].map(([label,value,note])=>`<div class="kpi"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(note)}</span></div>`).join('');
}
function renderFrequency(){
  const key=$('freq-var').value,v=meta(key);let html;
  if(v.values){const f=frequencies(filtered,key),ordinal=v.type.includes('ordinal'),heads=['Categoría','fi','hi','%'];if(ordinal)heads.push('Fi','Hi acumulada','% acumulado');
    html=table(heads,f.items.map(b=>[b.label,b.f,fmt(b.p,4),pct(b.p),...(ordinal?[b.cum,fmt(f.n?b.cum/f.n:NaN,4),pct(f.n?b.cum/f.n:NaN)]:[])]),`${name(key)} · n válido = ${f.n}`);
    const top=[...f.items].sort((a,b)=>b.f-a.f)[0];
    html+=reading(`fi cuenta negocios; hi = fi / n; el porcentaje es 100 × hi. ${f.n?`La categoría más frecuente es «${esc(top.label)}», con ${top.f} negocios (${pct(top.p)}).`:'No hay respuestas válidas.'} ${ordinal?'Las frecuencias acumuladas suman desde Baja hasta Alta, respetando el orden.':'No se acumulan categorías nominales: no existe un orden natural.'} La distribución describe esta muestra, no la población. Faltantes excluidos: ${filtered.length-f.n}.`);
  }else{const a=values(filtered,key),bins=grouped(a,$('bins').value);html=table(['Intervalo','Marca xi','fi','hi','%','Fi','Hi acumulada','% acumulado'],bins.map(b=>[`${fmt(b.lo)} – ${fmt(b.hi)}${b.last?' (cerrado)':''}`,fmt(b.mid),b.f,fmt(b.p,4),pct(b.p),b.cum,fmt(b.cum/a.length,4),pct(b.cum/a.length)]),`${name(key)} · n válido = ${a.length}`);
    html+=reading(`Los intervalos son [límite inferior, límite superior), excepto el último, cerrado en ambos extremos. La marca xi es el punto medio. fi cuenta observaciones, hi es su proporción y Fi acumula desde el intervalo menor. Se usan ${bins.length} clases ${$('bins').value==='auto'?'según k = techo(1 + log₂ n)':'seleccionadas manualmente'}; si todos los valores coinciden se usa una sola clase. Los límites se muestran redondeados a dos decimales, pero se calculan con precisión completa. Agrupar simplifica la distribución y pierde detalle; las medidas descriptivas usan los datos sin agrupar. Faltantes excluidos: ${filtered.length-a.length}.`);
  }
  $('frequency').innerHTML=html;
}
function renderDescriptive(){
  const heads=['Variable (unidad)','n válido','Faltantes','Media','Mediana','Moda','Mínimo','Máximo','Rango','Varianza s²','Desv. s','Q1 (P25)','Q3 (P75)','P10','P90','CV'];
  const rows=nums.map(v=>{const s=stats(values(filtered,v.key));return [name(v.key),s.n,filtered.length-s.n,fmt(s.mean),fmt(s.median),modeText(s.modes),fmt(s.min),fmt(s.max),fmt(s.range),fmt(s.variance),fmt(s.sd),fmt(s.q1),fmt(s.q3),fmt(s.p10),fmt(s.p90),pct(s.cv)];});
  $('descriptive').innerHTML='<thead><tr>'+heads.map(h=>`<th>${esc(h)}</th>`).join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>`<td>${esc(c)}</td>`).join('')+'</tr>').join('')+'</tbody>';
  $('categorical-modes').innerHTML='<h3>Moda de las variables cualitativas</h3>'+table(['Variable','Moda','Frecuencia modal'],cats.map(v=>{const a=filtered.map(r=>r[v.key]).filter(x=>v.values.includes(x)),m=modes(a);return [v.label,modeText(m),m.count];}));
  const s=stats(values(filtered,'ventas'));
  $('descriptive-reading').innerHTML=`<h3>¿Cómo se interpreta?</h3><p>${s.n?`Las ventas medias son C$ ${fmt(s.mean)} y la mediana C$ ${fmt(s.median)}. La mitad de los negocios queda a cada lado de la mediana (con posibles empates). La desviación muestral es C$ ${fmt(s.sd)} y el 50 % central se sitúa entre Q1 = C$ ${fmt(s.q1)} y Q3 = C$ ${fmt(s.q3)}.`:'No hay ventas válidas para resumir.'}</p><p>La media resume el centro y es sensible a valores extremos; la mediana es más resistente. La moda indica el valor más repetido; si ningún valor se repite se indica «sin moda». El rango es máximo − mínimo. La varianza usa n − 1 y se expresa en unidades al cuadrado; la desviación conserva la unidad original. Con n &lt; 2 ambas quedan sin estimar.</p><p>Los percentiles interpolados P10 y P90 sitúan aproximadamente el 10 % y el 90 % de las observaciones por debajo de sus valores. CV = s / media × 100 compara dispersión relativa en escalas con cero real; no se calcula con media cero. El descuento se expresa en % y su desviación en puntos porcentuales. Ninguna de estas medidas demuestra que la publicidad cause ventas.</p>`;
}
function renderChi(){
  const a=$('chi-a').value,b=$('chi-b').value,alpha=Number($('alpha').value);
  if(a===b){$('chi-result').innerHTML=empty('Selecciona dos variables cualitativas diferentes.')+reading('Cruzar una variable consigo misma produce una asociación trivial y no sirve para probar independencia.');return;}
  const t=chiSquare(filtered,a,b);
  const h=`<p><b>H₀:</b> ${esc(meta(a).label)} y ${esc(meta(b).label)} son independientes.<br><b>H₁:</b> existe asociación entre ambas variables. Nivel α = ${fmt(alpha)}.</p>`;
  if(!t.valid){$('chi-result').innerHTML=h+empty('Se necesitan al menos dos categorías observadas en cada variable.')+reading('No se estima chi-cuadrado si una variable es constante o no hay respuestas completas. Quita filtros o amplía la muestra.');return;}
  const ok=t.min>=1&&t.under5/t.cells<=.2,decision=t.p<alpha?'Se rechaza H₀':'No se rechaza H₀';
  $('chi-result').innerHTML=h+table([`${meta(a).label} / ${meta(b).label}`,...t.bb,'Total'],t.aa.map((s,i)=>[s,...t.observed[i],t.rt[i]]).concat([['Total',...t.ct,t.n]]),'Frecuencias observadas (O)')+'<br>'+table([`${meta(a).label} / ${meta(b).label}`,...t.bb,'Total'],t.aa.map((s,i)=>[s,...t.expected[i].map(v=>fmt(v)),t.rt[i]]).concat([['Total',...t.ct,t.n]]),'Frecuencias esperadas (E = total fila × total columna / n)')+metrics([['χ² de Pearson',fmt(t.chi,4)],['Grados de libertad',String(t.df)],['Valor p',t.p<.0001?'< 0,0001':fmt(t.p,4)],['Casos completos',String(t.n)]])+`<div class="notice ${ok?'ok':''}"><b>${ok?'Aproximación admisible según frecuencias esperadas.':'Aproximación poco fiable: frecuencias esperadas pequeñas.'}</b> Mínimo E = ${fmt(t.min)}; ${t.under5} de ${t.cells} celdas (${pct(t.under5/t.cells)}) tienen E &lt; 5. Criterio: ninguna E &lt; 1 y como máximo 20 % de E &lt; 5. La independencia entre negocios se asume por el diseño, no se verifica con esta tabla.</div>`+reading(`χ² suma (O − E)² / E: cuanto mayor es, más se aleja la tabla de la independencia. gl = (${t.aa.length} − 1) × (${t.bb.length} − 1) = ${t.df}. ${ok?`${decision} porque p ${t.p<alpha?'&lt;':'≥'} α; ${t.p<alpha?'hay evidencia estadística de asociación en este ejercicio':'no hay evidencia suficiente de asociación; esto no prueba independencia'}.`:'El valor p se muestra con fines didácticos, pero no se emite una decisión inferencial fiable. Para una tabla 2×2 se recomienda la prueba exacta de Fisher; en tablas mayores, una prueba exacta o simulación Monte Carlo. También se puede ampliar la muestra; solo deben agruparse categorías si existe justificación conceptual.'} Faltantes excluidos: ${filtered.length-t.n}. No establece causalidad ni generalización a negocios reales. Las categorías sin observaciones se eliminan antes de calcular gl.`);
}
function renderRelations(){
  const x=$('x-var').value,y=$('y-var').value,m=regression(filtered,x,y);currentModel=m;
  if(!m.valid){const message=x===y?'Selecciona dos variables cuantitativas diferentes.':'Se necesitan al menos tres pares válidos y variación en ambas variables.';$('pearson').innerHTML='<h3>Correlación de Pearson</h3>'+empty(message)+reading('Pearson necesita dos variables distintas con variación. Para respuestas ordinales conviene una correlación de rangos, no asignarles promedios arbitrarios.');$('regression').innerHTML='<h3>Regresión lineal simple</h3>'+empty(message)+reading('Sin variación en X no hay una pendiente estimable; con Y constante no se informa Pearson ni R².');$('fitted').innerHTML='';$('prediction-result').textContent='Sin modelo disponible.';$('predict').disabled=true;return;}
  $('predict').disabled=false;
  $('pearson').innerHTML='<h3>Correlación de Pearson</h3>'+metrics([['Coeficiente r',fmt(m.r,4)],['Pares completos',String(m.n)],['Dirección',m.r>0?'Positiva':m.r<0?'Negativa':'Nula'],['Intensidad orientativa',strength(m.r)]])+reading(`r mide la asociación lineal entre ${esc(name(x))} y ${esc(name(y))}, en una escala de −1 a 1. Aquí r = ${fmt(m.r,4)}, una asociación ${strength(m.r)} ${m.r>=0?'positiva':'negativa'}: ${m.r>=0?'valores mayores de X tienden a acompañarse de valores mayores de Y':'valores mayores de X tienden a acompañarse de valores menores de Y'}. Los umbrales de intensidad son orientativos: |r| &lt; 0,10 casi nula; &lt; 0,30 débil; &lt; 0,50 moderada; &lt; 0,70 considerable; resto fuerte. Revisa el diagrama: curvaturas y valores atípicos pueden distorsionar el coeficiente. Se excluyen ${filtered.length-m.n} registros sin el par completo. <b>Una correlación no demuestra causalidad.</b>`);
  $('regression').innerHTML='<h3>Regresión lineal simple</h3>'+`<div class="equation">ŷ = ${fmt(m.a,4)} ${m.b>=0?'+':'−'} ${fmt(Math.abs(m.b),4)} × X</div>`+metrics([['Intercepto a',fmt(m.a,4)],['Pendiente b',fmt(m.b,4)],['R²',fmt(m.r2,4)],['Variación descrita',pct(m.r2)]])+reading(`Y es ${esc(name(y))} y X es ${esc(name(x))}. Al aumentar X en una unidad (${esc(meta(x).unit)}), el modelo estima un cambio medio de ${fmt(m.b)} unidades de Y (${esc(meta(y).unit)}). El intercepto es la estimación para X = 0${m.min>0?'; ese valor está fuera del rango observado y no tiene interpretación empírica directa':''}. R² = ${fmt(m.r2,4)} describe qué fracción de la variación de Y recoge esta recta en la muestra; no es el porcentaje de ventas «causado» por X. El rango de predicción permitido es [${fmt(m.min)}, ${fmt(m.max)}] ${esc(meta(x).unit)}. Se asume una tendencia aproximadamente lineal; los residuos permiten explorar errores y heterogeneidad. Las predicciones son medias estimadas, sin intervalo de predicción ni garantía para un negocio individual.`);
  $('fitted').innerHTML='<thead><tr><th>Negocio</th><th>'+esc(name(x))+'</th><th>'+esc(name(y))+' observada</th><th>Y estimada</th><th>Residuo (Y − Ŷ)</th></tr></thead><tbody>'+m.pairs.map(r=>`<tr><td>${r.id}</td><td>${fmt(r[x])}</td><td>${fmt(r[y])}</td><td>${fmt(m.a+m.b*r[x])}</td><td>${fmt(r[y]-m.a-m.b*r[x])}</td></tr>`).join('')+'</tbody>';
  const input=$('predict-x');input.min=m.min;input.max=m.max;input.value=round((m.min+m.max)/2);predict();
}
function predict(){const m=currentModel,input=$('predict-x'),v=Number(input.value);if(!m?.valid){$('prediction-result').textContent='Sin modelo disponible.';return;}if(input.value.trim()===''||!finite(v)||v<m.min||v>m.max){$('prediction-result').textContent=`Introduce X entre ${fmt(m.min)} y ${fmt(m.max)} ${meta(m.x).unit}. Se evita extrapolar.`;return;}const estimate=m.a+m.b*v;$('prediction-result').textContent=`Para X = ${fmt(v)} ${meta(m.x).unit}, Ŷ = ${fmt(estimate)} ${meta(m.y).unit}. Estimación media dentro del rango observado.${estimate<0?' La estimación negativa carece de sentido para esta variable; el modelo no es adecuado en esta zona.':''}`;}
// Gráficos SVG accesibles, escalables y sin recursos externos.
const W=720,H=360,L=88,R=28,T=28,B=86;
const sxText=(x,y,text,extra='')=>`<text x="${x}" y="${y}" fill="#64748B" font-size="11" ${extra}>${esc(text)}</text>`;
function svg(content,title){return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${content}</svg>`;}
function line(x1,y1,x2,y2,color='#dce5e9',extra=''){return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${extra}/>`;}
function shortNumber(x){return Math.abs(x)>=1000000?fmt(x/1000000,1)+' M':Math.abs(x)>=1000?fmt(x/1000,1)+' mil':fmt(x,Math.abs(x)<5?1:0);}
function axes(xmin,xmax,ymax,xLabel,yLabel){
  const pw=W-L-R,ph=H-T-B,xx=v=>L+(v-xmin)/(xmax-xmin)*pw,yy=v=>H-B-v/ymax*ph;let html='';
  for(let i=0;i<=5;i++){const v=ymax*i/5,y=yy(v);html+=line(L,y,W-R,y)+sxText(L-10,y+4,shortNumber(v),'text-anchor="end"');}
  html+=line(L,T,L,H-B,'#9aafb8')+line(L,H-B,W-R,H-B,'#9aafb8');
  html+=sxText((L+W-R)/2,H-12,xLabel,'text-anchor="middle"')+sxText(18,(T+H-B)/2,yLabel,`text-anchor="middle" transform="rotate(-90 18 ${(T+H-B)/2})"`);
  return {html,xx,yy};
}
function barChart(labels,counts,title,unit='Negocios',xLabel='Categoría'){
  if(!counts.length||!counts.some(finite))return empty();
  const max=Math.max(...counts)*1.18||1,ax=axes(0,labels.length,max,xLabel,unit),bw=(W-L-R)/labels.length;let content=ax.html;
  labels.forEach((label,i)=>{const x=L+i*bw+bw*.2,y=ax.yy(counts[i]),height=H-B-y;
    content+=`<rect x="${x}" y="${y}" width="${bw*.6}" height="${height}" fill="${COLORS[i%COLORS.length]}" rx="3"><title>${esc(label)}: ${fmt(counts[i])} ${esc(unit)}</title></rect>`;
    content+=sxText(x+bw*.3,y-8,shortNumber(counts[i]),'text-anchor="middle"');
    const words=label.split(' '),a=words.length>2?words.slice(0,2).join(' '):label,b=words.length>2?words.slice(2).join(' '):'';
    content+=sxText(x+bw*.3,H-B+20,a,'text-anchor="middle"')+(b?sxText(x+bw*.3,H-B+35,b,'text-anchor="middle"'):'');
  });return svg(content,title);
}
function pieChart(items,n){
  if(!n)return empty();let angle=-Math.PI/2,content='',cx=235,cy=170,r=105;
  items.forEach((item,i)=>{const p=item.f/n,next=angle+2*Math.PI*p;if(p===1){content+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${COLORS[i]}"/>`;}else if(p>0){const x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle),x2=cx+r*Math.cos(next),y2=cy+r*Math.sin(next);content+=`<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${p>.5?1:0} 1 ${x2} ${y2} Z" fill="${COLORS[i]}" stroke="white" stroke-width="2"><title>${esc(item.label)}: ${item.f}, ${pct(p)}</title></path>`;}angle=next;
    content+=`<rect x="410" y="${120+i*60}" width="13" height="13" fill="${COLORS[i]}" rx="2"/>`+sxText(434,131+i*60,`${item.label}: ${item.f} (${pct(p)})`);
  });content+=`<circle cx="${cx}" cy="${cy}" r="61" fill="white"/>`+`<text x="${cx}" y="${cy}" text-anchor="middle" font-size="31" font-weight="600" fill="#245B70">${n}</text>`+sxText(cx,cy+23,'negocios','text-anchor="middle"')+sxText(W/2,H-25,'Proporción de negocios con respuesta válida','text-anchor="middle"');return svg(content,'Uso de promociones: número y porcentaje de negocios');
}
function distributionCharts(a,key){
  const bins=grouped(a,$('bins').value);if(!bins.length)return {hist:empty(),poly:empty(),bins};
  const xmin=bins[0].lo,xmax=bins[bins.length-1].hi,ymax=Math.max(...bins.map(b=>b.f))*1.2||1,ax=axes(xmin,xmax,ymax,name(key),'Frecuencia (negocios)');let hist=ax.html,poly=ax.html;
  const maxTicks=6;
  for(let i=0;i<=maxTicks;i++){const v=xmin+(xmax-xmin)*i/maxTicks,tick=sxText(ax.xx(v),H-B+22,shortNumber(v),'text-anchor="middle"');hist+=tick;poly+=tick;}
  for(const b of bins){hist+=`<rect x="${ax.xx(b.lo)}" y="${ax.yy(b.f)}" width="${Math.max(1,ax.xx(b.hi)-ax.xx(b.lo))}" height="${H-B-ax.yy(b.f)}" fill="#6B9B83" stroke="white"><title>[${fmt(b.lo)}, ${fmt(b.hi)}${b.last?']':')'}: ${b.f} negocios</title></rect>`;}
  poly+=`<polyline points="${bins.map(b=>`${ax.xx(b.mid)},${ax.yy(b.f)}`).join(' ')}" fill="none" stroke="#245B70" stroke-width="3"/>`;
  bins.forEach(b=>{poly+=`<circle cx="${ax.xx(b.mid)}" cy="${ax.yy(b.f)}" r="5" fill="#245B70"><title>Marca ${fmt(b.mid)}: ${b.f} negocios</title></circle>`;});
  return {hist:svg(hist,'Histograma de '+name(key)),poly:svg(poly,'Polígono de frecuencias de '+name(key)),bins};
}
function scatterChart(m){
  if(!m.n)return empty();
  const xs=m.pairs.map(r=>r[m.x]),ys=m.pairs.map(r=>r[m.y]),lo=Math.min(...xs),hi=Math.max(...xs),yr=Math.max(...ys)-Math.min(...ys),xr=hi-lo,xmin=lo-(xr||1)*.05,xmax=hi+(xr||1)*.05,ymin=Math.min(...ys)-(yr||1)*.1,ymax=Math.max(...ys)+(yr||1)*.12;
  const xx=x=>L+(x-xmin)/(xmax-xmin)*(W-L-R),yy=y=>H-B-(y-ymin)/(ymax-ymin)*(H-T-B);let content='';
  for(let i=0;i<=5;i++){const xv=xmin+(xmax-xmin)*i/5,yv=ymin+(ymax-ymin)*i/5;content+=line(L,yy(yv),W-R,yy(yv))+sxText(L-10,yy(yv)+4,shortNumber(yv),'text-anchor="end"')+sxText(xx(xv),H-B+23,shortNumber(xv),'text-anchor="middle"');}
  content+=line(L,T,L,H-B,'#9aafb8')+line(L,H-B,W-R,H-B,'#9aafb8');
  m.pairs.forEach(r=>{content+=`<circle cx="${xx(r[m.x])}" cy="${yy(r[m.y])}" r="4.3" fill="#6B9B83" opacity=".73"><title>Negocio ${r.id}: X ${fmt(r[m.x])}, Y ${fmt(r[m.y])}</title></circle>`;});
  if(m.valid){const a=m.a+m.b*lo,b=m.a+m.b*hi;content+=`<defs><clipPath id="plot-clip"><rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}"/></clipPath></defs>`+line(xx(lo),yy(a),xx(hi),yy(b),'#245B70','stroke-width="3" clip-path="url(#plot-clip)"');}
  content+=sxText((L+W-R)/2,H-15,name(m.x),'text-anchor="middle"')+sxText(18,(T+H-B)/2,name(m.y),`text-anchor="middle" transform="rotate(-90 18 ${(T+H-B)/2})"`);
  return svg(content,`Dispersión de ${name(m.x)} y ${name(m.y)}`)+'<div class="legend"><span><i style="background:#6B9B83"></i>Observación</span><span><i style="background:#245B70"></i>Recta estimada (si es válida)</span></div>';
}
function renderCharts(){
  const channel=frequencies(filtered,'canal'),promotion=frequencies(filtered,'promocion');
  $('bar-chart').innerHTML=barChart(channel.items.map(b=>b.label),channel.items.map(b=>b.f),'Canal principal de publicidad','Negocios','Canal principal');
  $('bar-reading').innerHTML='<h3>¿Cómo se interpreta?</h3><p>La altura de cada barra cuenta negocios por canal principal. Una barra mayor significa mayor frecuencia, no mayores ventas ni mayor eficacia. Solo se registra un canal por negocio; pueden existir canales secundarios no medidos.</p>';
  $('pie-chart').innerHTML=pieChart(promotion.items,promotion.n);
  $('pie-reading').innerHTML=`<h3>¿Cómo se interpreta?</h3><p>Cada sector representa la proporción de respuestas Sí o No; las categorías son excluyentes y suman el 100 % de ${promotion.n} respuestas válidas. ${promotion.n?`Usan promociones ${pct(promotion.items.find(x=>x.label==='Sí').p)}.`:'No hay respuestas válidas.'} El gráfico describe adopción, no rentabilidad.</p>`;
  const key=$('hist-var').value,a=values(filtered,key),dist=distributionCharts(a,key);$('hist-title').textContent='Histograma · '+meta(key).label;$('poly-title').textContent='Polígono · '+meta(key).label;$('hist-chart').innerHTML=dist.hist;$('polygon-chart').innerHTML=dist.poly;
  $('hist-reading').innerHTML=`<h3>¿Cómo se interpreta?</h3><p>Las barras contiguas agrupan ${a.length} valores válidos de ${esc(name(key))} en ${dist.bins.length} intervalos de igual amplitud. Alturas mayores indican rangos más habituales; la forma permite explorar asimetría y valores extremos. La elección del número de clases puede cambiar la apariencia. Las clases se controlan en Frecuencias.</p>`;
  $('poly-reading').innerHTML='<h3>¿Cómo se interpreta?</h3><p>Cada punto usa una marca de clase y su frecuencia; las líneas unen clases vecinas. Los picos muestran mayor concentración. No es una evolución temporal ni representa valores individuales. Usa exactamente las mismas clases que el histograma; con una sola clase solo aparece un punto.</p>';
  $('scatter-title').textContent=`${meta(currentModel.x).label} y ${meta(currentModel.y).label} · dispersión`;$('scatter-chart').innerHTML=scatterChart(currentModel);
  $('scatter-reading').innerHTML=`<h3>¿Cómo se interpreta?</h3><p>Cada punto es un negocio con un par válido. ${currentModel.valid?`La recta resume la tendencia lineal (r = ${fmt(currentModel.r,3)}; R² = ${fmt(currentModel.r2,3)}). La distancia vertical de cada punto a la recta es su residuo.`:'No se puede estimar una relación lineal con esta selección.'} Curvaturas, puntos aislados y cambios en la dispersión requieren cautela. Una relación visible no demuestra causalidad.</p>`;
  const comp=meta('promocion').values.map(label=>{const a=values(filtered.filter(r=>r.promocion===label),'ventas');return {label,n:a.length,avg:mean(a)};}).filter(c=>c.n);
  $('comparison-chart').innerHTML=barChart(comp.map(c=>`${c.label} (n=${c.n})`),comp.map(c=>c.avg),'Ventas medias según promociones','Ventas medias (C$)','Uso de promociones');
  $('comparison-reading').innerHTML=`<h3>¿Cómo se interpreta?</h3><p>${comp.map(c=>`${c.label}: ventas medias C$ ${fmt(c.avg)} en ${c.n} negocios`).join('; ')||'No hay grupos con ventas válidas'}. La diferencia de medias es descriptiva. Los grupos pueden diferir en tamaño, sector y demanda; esta comparación no identifica el efecto causal de ofrecer promociones ni incluye incertidumbre inferencial.</p>`;
}
function renderSynthesis(){
  const m=currentModel,s=stats(values(filtered,'ventas'));
  $('synthesis').innerHTML='<h3>Lectura de la muestra actual</h3>'+`<p>Se seleccionaron <b>${filtered.length}</b> negocios de una base de ${data.length}. ${s.n?`Las ventas medias son C$ ${fmt(s.mean)}, con desviación estándar muestral C$ ${fmt(s.sd)}.`:'No hay ventas válidas.'} ${m.valid?`Entre ${esc(meta(m.x).label)} y ${esc(meta(m.y).label)} se observa una asociación lineal ${strength(m.r)} (r = ${fmt(m.r,3)}).`:'La selección actual no permite estimar una correlación válida.'}</p>`+reading('Estas cifras describen la muestra sintética seleccionada. Permiten practicar y proponer hipótesis sobre publicidad, promociones y ventas, pero no recomendar una inversión óptima ni afirmar que una promoción aumenta los ingresos. Un estudio real requeriría una muestra adecuada, datos verificados, control de factores de confusión y, para evaluar efectos, un diseño experimental o causal sólido.');
}
function downloadCSV(){
  const keys=['id',...variables.map(v=>v.key)],quote=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
  // Los valores cualitativos se exportan como etiquetas; el diccionario muestra sus códigos.
  const csv='\uFEFF'+keys.map(quote).join(',')+'\r\n'+filtered.map(r=>keys.map(k=>quote(r[k])).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='negocios_datos_sinteticos.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
setup();
