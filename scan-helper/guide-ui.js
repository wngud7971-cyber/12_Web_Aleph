(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  let mode='home',step=1;
  function reveal(section,disclosure){
    if($(section).hidden)return;
    $(disclosure).open=true;
    const summary=$(disclosure).querySelector('summary');summary.tabIndex=-1;summary.focus({preventScroll:true});
    $(section).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  }
  document.addEventListener('scanlab:flow-change',event=>{
    const next=event.detail;
    if(mode!==next.mode||step!==next.step){for(const id of ['cost-disclosure','history-disclosure','sql-disclosure'])$(id).open=false;}
    mode=next.mode;step=next.step;$('result-actions').hidden=mode!=='csv'||step!==3;
  });
  $('result-again').addEventListener('click',()=>ScanFlow.show('csv',1));
  $('result-history').addEventListener('click',()=>reveal('history','history-disclosure'));
  $('result-sql').addEventListener('click',()=>reveal('sql-tools','sql-disclosure'));
})();
