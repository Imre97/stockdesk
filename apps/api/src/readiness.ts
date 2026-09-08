export interface Readiness {
  isReady: () => boolean;
  markReady: () => void;
}

export const alwaysReady: Readiness = {
  isReady: () => true,
  markReady: () => undefined,
};

export function createReadiness(): Readiness {
  let ready = false;

  return {
    isReady: () => ready,
    markReady: () => {
      ready = true;
    },
  };
}
