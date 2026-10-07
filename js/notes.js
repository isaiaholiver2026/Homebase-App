/* Scratchpad (saves as you type) and the Ask AI box (opens Claude or ChatGPT with your question). */
(function () {
  const { $ } = HB;

  /* Scratchpad */
  let t;
  $('#notes').addEventListener('input', () => {
    HB.state.notes = $('#notes').value; $('#noteState').textContent = 'Saving…';
    clearTimeout(t); t = setTimeout(() => { HB.saveQuietly(); $('#noteState').textContent = 'Saved'; }, 600);
  });
  HB.onChange(() => { if (document.activeElement !== $('#notes')) $('#notes').value = HB.state.notes || ''; });

  /* Ask AI: builds the question (plus your tasks and deadlines if you tick the box) and opens it */
  function buildPrompt() {
    const q = $('#askInput').value.trim(); if (!q) return '';
    const st = HB.settings(); let p = '';
    if (st.about) p += `About me: ${st.about}\n`;
    if ($('#askCtx').checked) {
      p += `Today is ${new Date().toDateString()}.\n`;
      p += `My open tasks: ${HB.state.tasks.filter(x => !x.done).map(x => x.text).join('; ') || 'none'}\n`;
      p += `My deadlines: ${HB.state.deadlines.map(d => `${d.title}${d.tag ? ' (' + d.tag + ')' : ''} due ${d.date}`).join('; ') || 'none'}\n`;
    }
    return (p ? p + '\n' : '') + q;
  }
  function update() {
    const p = encodeURIComponent(buildPrompt());
    $('#askClaude').href = p ? `https://claude.ai/new?q=${p}` : 'https://claude.ai/new';
    $('#askGpt').href = p ? `https://chatgpt.com/?q=${p}` : 'https://chatgpt.com/';
  }
  $('#askInput').addEventListener('input', update);
  $('#askCtx').addEventListener('change', update);
  $('#askInput').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { update(); $('#askClaude').click(); } });
  HB.onChange(update);
})();
