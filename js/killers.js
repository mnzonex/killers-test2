// ═══════════════════════════════════════════════════════════
//  KILLERS VIP — killers.js  (shared across all pages)
// ═══════════════════════════════════════════════════════════

(function () {
    'use strict';

    /* ── Header scroll ── */
    const hdr = document.getElementById('site-header');
    if (hdr) {
        const onScroll = () => hdr.classList.toggle('scrolled', window.scrollY > 50);
        window.addEventListener('scroll', onScroll, { passive: true });
    }

    /* ── Mobile nav burger ── */
    const burger = document.getElementById('navToggle');
    const nav = document.getElementById('mainNav');
    if (burger && nav) {
        burger.addEventListener('click', () => {
            const open = nav.classList.toggle('nav-open');
            burger.classList.toggle('open', open);
            burger.setAttribute('aria-expanded', open);
        });
        nav.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', () => {
                nav.classList.remove('nav-open');
                burger.classList.remove('open');
                burger.setAttribute('aria-expanded', 'false');
            });
        });
        document.addEventListener('click', e => {
            if (hdr && !hdr.contains(e.target)) {
                nav.classList.remove('nav-open');
                burger.classList.remove('open');
            }
        });
    }

    /* ── Hero canvas particles ── */
    const canvas = document.getElementById('hero-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let W, H, pts = [];

        const resize = () => {
            W = canvas.width = canvas.offsetWidth;
            H = canvas.height = canvas.offsetHeight;
        };
        window.addEventListener('resize', resize, { passive: true });
        resize();

        const N = window.innerWidth < 640 ? 18 : 38;

        const rand = (a, b) => a + Math.random() * (b - a);

        for (let i = 0; i < N; i++) {
            pts.push({
                x: rand(0, W), y: rand(0, H),
                r: rand(1.5, 4.5),
                vx: rand(-.22, .22), vy: rand(-.38, -.12),
                a: rand(.12, .55), da: rand(.002, .006), up: Math.random() > .5
            });
        }

        const draw = () => {
            ctx.clearRect(0, 0, W, H);
            pts.forEach(p => {
                p.x += p.vx; p.y += p.vy;
                p.a += p.up ? p.da : -p.da;
                if (p.a >= .6 || p.a <= .08) p.up = !p.up;
                if (p.y < -10) { p.y = H + 10; p.x = rand(0, W); }
                if (p.x < -10) p.x = W + 10;
                if (p.x > W + 10) p.x = -10;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(247,147,26,${p.a})`;
                ctx.fill();
            });
            requestAnimationFrame(draw);
        };
        draw();
    }

    /* ── Counter animation ── */
    const counters = document.querySelectorAll('.hnum[data-count]');
    if (counters.length) {
        const runCounters = () => {
            counters.forEach(el => {
                const target = +el.dataset.count;
                const dur = 1600;
                const step = 16;
                const steps = Math.ceil(dur / step);
                let cur = 0;
                const t = setInterval(() => {
                    cur++;
                    const ease = 1 - Math.pow(1 - cur / steps, 3);
                    el.textContent = Math.round(target * ease);
                    if (cur >= steps) { el.textContent = target; clearInterval(t); }
                }, step);
            });
        };

        const obs = new IntersectionObserver(entries => {
            entries.forEach(e => { if (e.isIntersecting) { runCounters(); obs.disconnect(); } });
        }, { threshold: 0.5 });
        obs.observe(counters[0]);
    }

    /* ── Scroll-reveal (srv-card, why-list li, wstat) ── */
    const reveals = document.querySelectorAll(
        '.srv-card, .why-list li, .wstat, .pc, .detail-row, .price-box'
    );
    if (reveals.length && 'IntersectionObserver' in window) {
        const ro = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.style.opacity = '1';
                    e.target.style.transform = 'translateY(0)';
                    ro.unobserve(e.target);
                }
            });
        }, { threshold: 0.14, rootMargin: '0px 0px -40px 0px' });

        reveals.forEach((el, i) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(26px)';
            el.style.transition = `opacity .55s ease ${i * 0.07}s, transform .55s ease ${i * 0.07}s`;
            ro.observe(el);
        });
    }

    /* ── Referral Tracking ── */
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
        localStorage.setItem('referral_id', ref);
        console.log('Referral ID saved:', ref);
    }

    /* ── Active nav link ── */
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link').forEach(a => {
        const href = a.getAttribute('href');
        if (href === page || (page === '' && href === 'index.html')) {
            a.classList.add('is-active');
        } else {
            a.classList.remove('is-active');
        }
    });

})();
