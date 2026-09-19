import { pathToFileURL } from 'node:url';

export async function launchEngine(config, origin, key, onFailure, { syntheticSilence = false } = {}) {
  const { chromium } = await import(pathToFileURL(config.playwright));
  const browser = await chromium.launch({
    executablePath: config.chromium, headless: true,
    // Playwright normally mutes headless Chromium; real conversations need audio.
    ignoreDefaultArgs: syntheticSilence ? [] : ['--mute-audio'],
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', ...(syntheticSilence ? ['--mute-audio'] : [])],
  });
  let closing = false;
  const close = async () => { closing = true; await browser.close(); };
  browser.on('disconnected', () => { if (!closing) onFailure('Voice audio engine stopped.'); });
  try {
    const context = await browser.newContext();
    await context.grantPermissions(['microphone'], { origin });
    await context.addInitScript(({ key, input, output }) => {
      window.antVoice = { key, input, output };
    }, { key, input: config.inputDeviceId, output: config.outputDeviceId });
    if (syntheticSilence) await context.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const audio = new AudioContext();
        const zero = audio.createConstantSource(); zero.offset.value = 0;
        const destination = audio.createMediaStreamDestination();
        zero.connect(destination); zero.start(); await audio.resume();
        return destination.stream;
      };
    });
    const page = await context.newPage();
    page.on('crash', () => onFailure('Voice audio engine stopped.'));
    await page.goto(origin + '/engine/');
    await page.waitForFunction(() => window.engineReady === true, { timeout: 15000 });
    return { close };
  } catch (error) { await close(); throw error; }
}
