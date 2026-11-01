let played = false;

export const kaelIntroSession = {
  hasPlayed: () => played,
  markPlayed: () => {
    played = true;
  },
  reset: () => {
    played = false;
  },
};
