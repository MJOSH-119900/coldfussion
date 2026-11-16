export const playSound = (soundPath: string): void => {
  if (typeof window !== 'undefined') {
    const audio = new Audio(soundPath);
    audio.volume = 0.4; // Set comfortable volume
    audio.play().catch((err) => console.log("Audio playback blocked until user interacts: ", err));
  }
};
