/** 'auto' (an instant jump) when someone asks for reduced motion, otherwise 'smooth'. */
export function scrollBehavior(): ScrollBehavior {
  const reduce = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduce ? 'auto' : 'smooth';
}
