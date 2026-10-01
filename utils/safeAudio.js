let RealAudio = null;
try {
  const expoAv = require('expo-av');
  RealAudio = expoAv?.Audio || null;
} catch (e) {
  RealAudio = null;
}

const safeAudio = RealAudio || {
  isAvailable: false,
  setAudioModeAsync: async () => {},
  requestPermissionsAsync: async () => ({ status: 'denied' }),
  AndroidOutputFormat: { MPEG_4: 2 },
  AndroidAudioEncoder: { AAC: 3 },
  IOSAudioQuality: { LOW: 0, MEDIUM: 1, HIGH: 2 },
  IOSOutputFormat: { MPEG4AAC: 'aac ' },
  Recording: {
    createAsync: async () => {
      throw new Error('Audio recording is not supported on this platform architecture.');
    },
  },
  Sound: {
    createAsync: async () => {
      throw new Error('Audio playback is not supported on this platform architecture.');
    },
  },
};

export default safeAudio;
