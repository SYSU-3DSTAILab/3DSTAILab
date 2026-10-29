// 表单独立初始化，避免可选的图表或轮播库加载失败影响提交。
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('form[data-web3form]').forEach(form => {
    const button = form.querySelector('button[type="submit"]');
    // 表单内的 name="dataset" 会遮蔽 form.dataset，直接读取属性。
    const success = document.getElementById(form.getAttribute('data-success-id'));
    const error = document.getElementById(form.getAttribute('data-error-id'));
    const buttonMarkup = button.innerHTML;
    let pending = false;

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (pending || !form.reportValidity()) return;

      const body = new FormData(form);
      if (body.get('botcheck')) return;

      pending = true;
      button.disabled = true;
      button.textContent = '发送中…';
      success.classList.add('hidden');
      error.classList.add('hidden');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body,
          signal: controller.signal
        });
        const result = await response.json();
        if (!response.ok || result?.success !== true) {
          throw new Error(typeof result?.message === 'string' && result.message
            ? result.message : '发送失败，请稍后重试。');
        }

        // 重置联系方式时保留当前申请的数据集，确保再次提交仍对应同一数据。
        const dataset = form.elements.namedItem('dataset');
        const datasetName = dataset?.value;
        form.reset();
        if (dataset) dataset.value = datasetName;
        success.classList.remove('hidden');
      } catch (failure) {
        // 接口响应属于外部输入，只能作为文本显示。
        error.textContent = controller.signal.aborted
          ? '请求超时，提交结果暂未确认，请稍后再试。'
          : failure instanceof SyntaxError || failure instanceof TypeError
            ? '网络或服务响应异常，请稍后重试。'
            : failure.message || '发送失败，请稍后重试。';
        error.classList.remove('hidden');
      } finally {
        clearTimeout(timeout);
        pending = false;
        button.disabled = false;
        button.innerHTML = buttonMarkup;
      }
    });
  });
});
