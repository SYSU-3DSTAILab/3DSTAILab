// 图片预览不向新窗口暴露原页面。
window.openPreview = src => window.open(src, '_blank', 'noopener,noreferrer');

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Swiper !== 'function') return;

  document.querySelectorAll('.swiper').forEach(container => {
    const hasMultipleSlides = container.querySelectorAll('.swiper-slide').length > 1;
    new Swiper(container, {
      loop: hasMultipleSlides,
      autoplay: hasMultipleSlides ? {
        delay: container.classList.contains('city-swiper') ? 3000 : 3500,
        disableOnInteraction: false
      } : false,
      navigation: {
        nextEl: container.querySelector('.swiper-button-next'),
        prevEl: container.querySelector('.swiper-button-prev')
      }
    });
  });
});
