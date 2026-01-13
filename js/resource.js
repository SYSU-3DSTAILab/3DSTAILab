import daisyui from '@catppuccin/daisyui';

/**
 * 数据资源页面交互功能
 */

// 当DOM加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    // 获取所有手风琴按钮
    const accordionButtons = document.querySelectorAll('.accordion-button');
    
    // 为每个按钮添加点击事件监听器
    accordionButtons.forEach(button => {
        button.addEventListener('click', function() {
            // 获取关联的折叠区域
            const targetId = this.getAttribute('data-bs-target');
            const targetElement = document.querySelector(targetId);
            
            // 检查当前状态
            const isExpanded = this.getAttribute('aria-expanded') === 'true';
            
            console.log(`手风琴项 ${this.textContent.trim()} ${isExpanded ? '收起' : '展开'}`);
        });
    });
    
    // 监听手风琴展开/收起事件
    const accordionItems = document.querySelectorAll('.accordion-collapse');
    
    accordionItems.forEach(item => {
        item.addEventListener('show.bs.collapse', function() {
            // 当手风琴项展开时触发
            const button = document.querySelector(`[data-bs-target="#${this.id}"]`);
            console.log(`${button.textContent.trim()} 已展开`);
        });
        
        item.addEventListener('hide.bs.collapse', function() {
            // 当手风琴项收起时触发
            const button = document.querySelector(`[data-bs-target="#${this.id}"]`);
            console.log(`${button.textContent.trim()} 已收起`);
        });
    });
    
    // GitHub 链接点击跟踪（可选）
    const githubLinks = document.querySelectorAll('.dataset-btn');
    githubLinks.forEach(link => {
        link.addEventListener('click', function() {
            const datasetName = this.textContent.replace('访问 ', '').replace(' 项目', '');
            console.log(`用户点击了 ${datasetName} 的GitHub链接`);
        });
    });
});

// 页面加载完成后初始化
window.addEventListener('load', function() {
    console.log('数据资源页面已完全加载');
});