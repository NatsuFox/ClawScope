/* ClawScope landing page — interactions */

const root = document.documentElement;
const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.site-nav');

root.classList.add('js');

/* ─── Mobile nav toggle ─── */
const initNav = () => {
  if (!navToggle || !nav) return;
  navToggle.addEventListener('click', () => {
    const isOpen = root.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
  // close on nav link click
  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      root.classList.remove('nav-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
  // close on outside click
  document.addEventListener('click', (e) => {
    if (!navToggle.contains(e.target) && !nav.contains(e.target)) {
      root.classList.remove('nav-open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });
};

/* ─── Scroll-triggered section animations ─── */
const initScrollAnimate = () => {
  const els = document.querySelectorAll('.section-animate');
  if (!els.length || !('IntersectionObserver' in window)) {
    // fallback: show immediately
    els.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; });
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.animationPlayState = 'running';
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 }
  );
  els.forEach(el => {
    el.style.animationPlayState = 'paused';
    observer.observe(el);
  });
};

/* ─── Generic tab + copy terminal helper ─── */
const initTerminalBlock = (container, tabAttr, panelAttr, copyBtn) => {
  if (!container) return;

  const tabs   = container.querySelectorAll(`[${tabAttr}]`);
  const panels = container.querySelectorAll(`[${panelAttr}]`);

  const activate = (targetKey) => {
    tabs.forEach(t => {
      const active = t.getAttribute(tabAttr) === targetKey;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', String(active));
    });
    panels.forEach(p => {
      p.classList.toggle('is-active', p.getAttribute(panelAttr) === targetKey);
    });
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => activate(tab.getAttribute(tabAttr)));
  });

  // copy button
  if (!copyBtn) return;
  const label = copyBtn.querySelector('[data-copy-label]');
  let timeout = null;
  copyBtn.addEventListener('click', () => {
    const activePanel = container.querySelector(`[${panelAttr}].is-active code`);
    if (!activePanel) return;
    navigator.clipboard.writeText(activePanel.textContent.trim()).then(() => {
      copyBtn.classList.add('is-copied');
      if (label) label.textContent = 'Copied!';
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        copyBtn.classList.remove('is-copied');
        if (label) label.textContent = 'Copy';
      }, 900);
    }).catch(() => {});
  });
};

/* ─── Hero install terminal ─── */
const initHeroTerminal = () => {
  const terminal = document.querySelector('[data-terminal]');
  if (!terminal) return;
  initTerminalBlock(
    terminal,
    'data-terminal-tab',
    'data-terminal-panel',
    terminal.querySelector('[data-terminal-copy]')
  );
};

/* ─── Quickstart step terminals ─── */
const initQsTerminals = () => {
  document.querySelectorAll('[data-qs-terminal]').forEach(block => {
    initTerminalBlock(
      block,
      'data-qs-tab',
      'data-qs-panel',
      block.querySelector('[data-qs-copy]')
    );
  });
};

/* ─── Active nav link highlight on scroll ─── */
const initActiveNav = () => {
  const sections = document.querySelectorAll('section[id], div[id="top"]');
  const navLinks = document.querySelectorAll('.site-nav a[href^="#"]');
  if (!sections.length || !navLinks.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          navLinks.forEach(link => {
            const active = link.getAttribute('href') === `#${id}`;
            link.style.color = active ? 'var(--accent-cyan)' : '';
          });
        }
      });
    },
    { threshold: 0.35 }
  );
  sections.forEach(s => observer.observe(s));
};

/* ─── Bootstrap ─── */
const bootstrap = () => {
  initNav();
  initScrollAnimate();
  initHeroTerminal();
  initQsTerminals();
  initActiveNav();
};

bootstrap();
