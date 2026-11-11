const bridge = window.desktop;
const error = document.querySelector('#error');
async function action(run) {
  error.textContent = '';
  const buttons = document.querySelectorAll('button');
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const result = await run();
    if (result?.error) error.textContent = result.error;
  } catch { error.textContent = 'Operasi gagal. Silakan coba lagi.'; }
  finally { buttons.forEach((button) => { button.disabled = false; }); }
}
const state = await bridge.state();
document.querySelector('#notice').textContent = state.notice;
document.querySelector(`#${state.screen === 'recovery' ? 'recovery' : 'settings'}`).hidden = false;
document.querySelector('#origin').value = state.config?.origin ?? '';
document.querySelector('#deviceId').value = state.config?.deviceId ?? '';
document.querySelector('#cancel').hidden = !state.config;
document.querySelector('#form').addEventListener('submit', (event) => {
  event.preventDefault();
  void action(() => bridge.save({ origin: document.querySelector('#origin').value, deviceId: document.querySelector('#deviceId').value }));
});
for (const [id, method] of [['cancel', 'cancel'], ['reset', 'reset'], ['retry', 'retry'], ['configure', 'settings']]) {
  document.querySelector(`#${id}`).addEventListener('click', () => { void action(() => bridge[method]()); });
}
