// 在 team.html 的 <script> 中或 common.js 中
fetch('team_nav.html')
  .then(res => res.text())
  .then(data => {
    // 假设 team.html 中有一个 <aside id="team-nav-container"></aside>
    const container = document.getElementById('team-nav-container'); 
    // 或者如果你直接用 aside 标签: document.querySelector('aside')
    if (container) {
      container.innerHTML = data;
      // 加载完导航栏后，重新初始化滚动监听
      initScrollSpy(); 
    }
  });

// 滚动监听逻辑 (适配新的 Tailwind 类名)
function initScrollSpy() {
  const links = document.querySelectorAll('.menu a'); // 选择 DaisyUI menu 下的链接
  
  window.addEventListener('scroll', () => {
    let currentId = '';
    const sections = document.querySelectorAll('section[id]');
    
    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      if (window.scrollY >= sectionTop - 180) {
        currentId = section.getAttribute('id');
      }
    });

    if(!currentId && window.scrollY < 200) currentId = 'faculty';

    links.forEach(link => {
      // 移除高亮样式 (Tailwind / Custom CSS)
      link.classList.remove('active', 'bg-[#003366]', 'text-white');
      
      // 添加高亮样式
      if (link.getAttribute('href') === '#' + currentId) {
        // 注意：DaisyUI 的 'active' 类会自动应用主色，
        // 但为了匹配你的深蓝品牌色，我们显式添加颜色类
        link.classList.add('active', 'bg-[#003366]', 'text-white');
      }
    });
  });
}