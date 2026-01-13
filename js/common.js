/* 1. 配置 Tailwind 主题色 (必须保持在最顶层，以便脚本加载时立即读取) */
window.tailwind = window.tailwind || {};
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: '#003366',
        secondary: '#00BFFF',
        accent: '#f8f9fa',
        navbg: '#d0d0d0',
        navtext: '#003366'
      }
    }
  }
};

/* 2. 将所有涉及页面元素的操作包装在事件监听中 */
document.addEventListener('DOMContentLoaded', () => {
  
  // 注入导航栏
  fetch('nav.html')
    .then(res => {
      if (!res.ok) throw new Error('Network response was not ok');
      return res.text();
    })
    .then(data => {
      // 此时 DOM 已准备好，document.body 肯定存在
      document.body.insertAdjacentHTML('afterbegin', data);
    })
    .catch(err => console.warn('导航栏加载失败:', err));

    // 注入页脚 (插入到 body 的最后面)
  fetch('footer.html')
    .then(res => res.text())
    .then(data => {
      document.body.insertAdjacentHTML('beforeend', data);
    })
    .catch(err => console.warn('页脚加载失败:', err));
});

/* 3. 访客地图（全局函数，由于它是被页面手动调用的，不需要改动） */
window.initClustrmaps = function(key, path, id){
  // 这里的执行逻辑通常在页面底部的脚本块中调用，所以没问题
  if(document.getElementById(id)) {
    var script = document.createElement('script');
    script.src = 'https://cdn.clustrmaps.com/map_v2.js';
    // 传递配置给脚本
    window._clustrmaps = {key: key, path: path, id: id};
    document.body.appendChild(script);
  }
};

