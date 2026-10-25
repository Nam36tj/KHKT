// Menu mobile
const burger=document.getElementById('burger'),menu=document.getElementById('menu');
burger.addEventListener('click',()=>{menu.classList.toggle('open');burger.textContent=menu.classList.contains('open')?'✕':'☰'});
menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{menu.classList.remove('open');burger.textContent='☰'}));

// Hiệu ứng hiện dần khi cuộn
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

// Chia sẻ
document.getElementById('shareBtn').addEventListener('click',async()=>{
  const data={title:document.title,text:'Hành trình kết nối quá khứ và hiện tại – THPT Bình Gia',url:location.href};
  try{
    if(navigator.share){await navigator.share(data)}
    else{await navigator.clipboard.writeText(location.href);alert('Đã sao chép liên kết trang!')}
  }catch(e){}
});
