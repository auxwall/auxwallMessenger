// audioManager.js

let currentSound = null;
let currentUrl = null;

export async function stopCurrent() {
  try {
    if (currentSound) {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
    }
  } catch (e) {
    // ignore
  } finally {
    currentSound = null;
    currentUrl = null;
  }
}

export function getCurrent() {
  return { currentSound, currentUrl };
}

export function setCurrent(sound, url) {
  currentSound = sound;
  currentUrl = url;
}
