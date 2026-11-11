// Satu generasi load aktif. Hasil load lama tidak boleh membuka layar pemulihan baru.
export function createLoader({ load, stop, failed, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let generation = 0;
  let timeout;
  let retry;
  function cancel() {
    generation++;
    clearTimer(timeout);
    clearTimer(retry);
    stop();
  }
  function start(url) {
    cancel();
    const current = generation;
    let settled = false;
    function fail() {
      if (current !== generation || settled) return;
      settled = true;
      clearTimer(timeout);
      stop();
      failed();
      retry = setTimer(() => { if (current === generation) start(url); }, 10_000);
    }
    timeout = setTimer(fail, 15_000);
    Promise.resolve().then(() => {
      if (current !== generation || settled) return;
      return load(url);
    }).then(() => {
      if (current !== generation || settled) return;
      settled = true;
      clearTimer(timeout);
    }, fail);
  }
  return { start, cancel };
}
