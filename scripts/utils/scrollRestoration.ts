/**
 * Scroll Restoration Utility
 * 
 * Manages intelligent scroll position restoration across page navigation.
 * 
 * Behavior:
 * - List pages (/work, /journal, /) remember scroll position when navigating back
 * - Detail pages (/work/:slug, /journal/:slug) always scroll to top when opened
 * - Uses sessionStorage to persist scroll positions during the session
 */

const SCROLL_STORAGE_KEY = 'portfolioScrollPositions';

// Pages that should remember their scroll position
const LIST_PAGES = ['/', '/work', '/journal', '/about', '/thumbnails'];

export const isListPage = (pathname: string): boolean => {
  return LIST_PAGES.includes(pathname);
};

export const isDetailPage = (pathname: string): boolean => {
  return pathname.startsWith('/work/') || pathname.startsWith('/journal/');
};

export const saveScrollPosition = (pathname: string): void => {
  if (isListPage(pathname)) {
    const scrollY = window.scrollY;
    const positions = getScrollPositions();
    positions[pathname] = scrollY;
    
    try {
      sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(positions));
    } catch (error) {
      console.warn('Failed to save scroll position:', error);
    }
  }
};

export const restoreScrollPosition = (pathname: string): void => {
  if (isListPage(pathname)) {
    const positions = getScrollPositions();
    const savedPosition = positions[pathname];
    
    if (savedPosition !== undefined) {
      // Try restoring after layout settles; retry a few frames for images/content
      let attempts = 0;
      const maxAttempts = 10; // ~10 frames
      const tryRestore = () => {
        attempts++;
        const maxScrollable = document.documentElement.scrollHeight - window.innerHeight;
        const target = Math.min(savedPosition, Math.max(0, maxScrollable));
        
        if (maxScrollable <= 0 && attempts < maxAttempts) {
          requestAnimationFrame(tryRestore);
          return;
        }
        
        window.scrollTo(0, target);
        // If content is still growing and we haven't reached target, retry briefly
        if (attempts < maxAttempts && Math.abs(window.scrollY - target) > 2) {
          requestAnimationFrame(tryRestore);
        }
      };
      requestAnimationFrame(tryRestore);
    } else {
      // New visit to this list page, scroll to top
      window.scrollTo(0, 0);
    }
  } else if (isDetailPage(pathname)) {
    // Detail pages always scroll to top
    window.scrollTo(0, 0);
  } else {
    // Default behavior for other pages
    window.scrollTo(0, 0);
  }
};

export const clearScrollPosition = (pathname: string): void => {
  const positions = getScrollPositions();
  delete positions[pathname];
  
  try {
    sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(positions));
  } catch (error) {
    console.warn('Failed to clear scroll position:', error);
  }
};

export const clearAllScrollPositions = (): void => {
  try {
    sessionStorage.removeItem(SCROLL_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear all scroll positions:', error);
  }
};

const getScrollPositions = (): Record<string, number> => {
  try {
    const stored = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn('Failed to retrieve scroll positions:', error);
    return {};
  }
};
