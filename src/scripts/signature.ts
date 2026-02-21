const SIGNATURE_PLAYED_KEY = 'signature-played-once';

declare global {
  interface Window {
    __signatureRouteInitBound?: boolean;
  }
}

const hasPlayedInSession = () => {
  try {
    return window.sessionStorage.getItem(SIGNATURE_PLAYED_KEY) === '1';
  } catch {
    return false;
  }
};

const markPlayedInSession = () => {
  try {
    window.sessionStorage.setItem(SIGNATURE_PLAYED_KEY, '1');
  } catch {
    // Ignore storage access issues; animation still works with in-memory behavior.
  }
};

const initSignatures = () => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const shouldAutoplay = !hasPlayedInSession();
  if (shouldAutoplay) markPlayedInSession();

  document.querySelectorAll<SVGElement>('.sidebar-signature').forEach((svg) => {
    if (svg.dataset.signatureInit === 'true') return;
    svg.dataset.signatureInit = 'true';

    const style = getComputedStyle(svg);
    const speed = Number.parseFloat(style.getPropertyValue('--signature-speed')) || 700;
    const speeds = [
      Number.parseFloat(style.getPropertyValue('--signature-speed-1')) || speed,
      Number.parseFloat(style.getPropertyValue('--signature-speed-2')) || speed,
      Number.parseFloat(style.getPropertyValue('--signature-speed-3')) || speed,
      Number.parseFloat(style.getPropertyValue('--signature-speed-4')) || speed,
    ];
    const overlaps = [
      Number.parseFloat(style.getPropertyValue('--signature-overlap-1-2')) || 0,
      Number.parseFloat(style.getPropertyValue('--signature-overlap-2-3')) || 0,
      Number.parseFloat(style.getPropertyValue('--signature-overlap-3-4')) || 0,
    ];
    const paths = Array.from(svg.querySelectorAll<SVGPathElement>('path'));
    let delay = 0;
    let replayTimer: number | undefined;
    let isComplete = false;

    paths.forEach((path, index) => {
      const length = path.getTotalLength();
      const pathSpeed = speeds[index] || speed;
      const duration = length / pathSpeed;
      const overlapAfter = overlaps[index] || 0;

      path.style.setProperty('--sig-length', String(length));
      path.style.setProperty('--sig-duration', `${duration}s`);
      path.style.setProperty('--sig-delay', `${delay}s`);

      delay += Math.max(0, duration - overlapAfter);
    });

    const scheduleComplete = () => {
      window.clearTimeout(replayTimer);
      replayTimer = window.setTimeout(() => {
        isComplete = true;
      }, delay * 1000);
    };

    const runAnimation = () => {
      paths.forEach((path) => {
        path.style.animation = 'none';
        path.style.strokeDashoffset = path.style.getPropertyValue('--sig-length');
        path.getBoundingClientRect();
        path.style.removeProperty('animation');
        path.style.removeProperty('stroke-dashoffset');
      });

      scheduleComplete();
    };

    const replay = () => {
      if (!isComplete) return;
      isComplete = false;
      runAnimation();
    };

    svg.addEventListener('mouseenter', replay);
    if (shouldAutoplay) {
      isComplete = false;
      runAnimation();
    } else {
      paths.forEach((path) => {
        path.style.animation = 'none';
        path.style.strokeDashoffset = '0';
      });
      isComplete = true;
    }
  });
};

export const initSidebarSignatures = () => {
  initSignatures();

  if (window.__signatureRouteInitBound !== true) {
    document.addEventListener('astro:page-load', initSignatures);
    window.__signatureRouteInitBound = true;
  }
};
