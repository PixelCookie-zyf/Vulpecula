import { flushSync } from "react-dom";

type DocWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => { ready: Promise<void> };
};

export function revealThemeChange(update: () => void, origin: { x: number; y: number }) {
  const doc = document as DocWithViewTransition;
  if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  const maxRadius = Math.hypot(
    Math.max(origin.x, window.innerWidth - origin.x),
    Math.max(origin.y, window.innerHeight - origin.y),
  );
  const transition = doc.startViewTransition(() => flushSync(update));
  transition.ready
    .then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${origin.x}px ${origin.y}px)`,
            `circle(${maxRadius}px at ${origin.x}px ${origin.y}px)`,
          ],
        },
        { duration: 480, easing: "cubic-bezier(.3,.7,.3,1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {});
}
