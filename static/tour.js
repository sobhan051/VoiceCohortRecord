// tour.js – tiny hand-rolled guided tour (no deps, no media files).
// Steps: [{ selector, title, text }]. Missing selectors are skipped so the
// tour never blocks. RTL-safe bubble, Esc/arrows supported.
(function () {
    let overlay = null, bubble = null, ring = null;
    let steps = [], idx = 0, onDone = null;

    function ensureEls() {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.id = 'tour-overlay';
        // ponytail: overlay stays transparent (clicks only) — the dim layer
        // lives on the ring as a giant box-shadow so the target keeps a real
        // unblurred spotlight hole instead of being dimmed like everything else
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:9000',
            'background:rgba(0,0,0,0)',
            'opacity:0', 'transition:opacity .25s ease'
        ].join(';');
        overlay.addEventListener('click', (e) => { if (e.target === overlay) endTour(); });

        ring = document.createElement('div');
        ring.id = 'tour-ring';
        ring.style.cssText = [
            'position:fixed', 'z-index:9001', 'pointer-events:none',
            'border:3px solid #3b82f6', 'border-radius:16px',
            'box-shadow:0 0 0 9999px rgba(15,23,42,0.55),0 0 24px rgba(59,130,246,0.8)',
            'transition:all .3s ease', 'display:none'
        ].join(';');

        bubble = document.createElement('div');
        bubble.id = 'tour-bubble';
        bubble.style.cssText = [
            'position:fixed', 'z-index:9002', 'max-width:min(340px,calc(100vw - 32px))',
            'background:#fff', 'border-radius:20px', 'padding:18px',
            'box-shadow:0 20px 60px rgba(0,0,0,0.3)', 'display:none',
            'font-size:0.875rem', 'line-height:1.9', 'color:#1f2937'
        ].join(';');

        document.body.appendChild(overlay);
        document.body.appendChild(ring);
        document.body.appendChild(bubble);
    }

    function current() { return steps[idx]; }

    // offsetParent is null for position:fixed elements, so rect-based check.
    // minWidth lets steps target desktop-only UI (e.g. the side panel).
    function stepVisible(st) {
        if (st.minWidth && window.innerWidth < st.minWidth) return false;
        if (st.maxWidth && window.innerWidth > st.maxWidth) return false;
        const el = document.querySelector(st.selector);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    function placeBubble(rect) {
        const bw = Math.min(340, window.innerWidth - 32);
        const bh = bubble.offsetHeight || 200;
        let top = rect.bottom + 14;
        if (top + bh > window.innerHeight - 12) top = Math.max(12, rect.top - bh - 14);
        let left = Math.max(16, Math.min(rect.left + rect.width / 2 - bw / 2, window.innerWidth - bw - 16));
        bubble.style.top = top + 'px';
        bubble.style.left = left + 'px';
    }

    function render() {
        // Skip steps whose target is missing or hidden.
        while (idx < steps.length) {
            if (stepVisible(current())) break;
            idx++;
        }
        if (idx >= steps.length) { endTour(); return; }

        const st = current();
        const el = document.querySelector(st.selector);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        setTimeout(() => {
            const r = el.getBoundingClientRect();
            ring.style.display = 'block';
            ring.style.top = (r.top - 8) + 'px';
            ring.style.left = (r.left - 8) + 'px';
            ring.style.width = (r.width + 16) + 'px';
            ring.style.height = (r.height + 16) + 'px';

            bubble.style.display = 'block';
            bubble.innerHTML = '';
            const title = document.createElement('div');
            title.style.cssText = 'font-weight:800;margin-bottom:6px;color:#1d4ed8';
            title.textContent = st.title;
            const body = document.createElement('div');
            body.textContent = st.text;
            const dots = document.createElement('div');
            dots.style.cssText = 'display:flex;gap:6px;justify-content:center;margin:12px 0';
            steps.forEach((_, i) => {
                const d = document.createElement('span');
                d.style.cssText = `width:8px;height:8px;border-radius:50%;background:${i === idx ? '#2563eb' : '#d1d5db'}`;
                dots.appendChild(d);
            });
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:8px;margin-top:4px';
            const mkBtn = (label, primary, fn) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = label;
                b.style.cssText = primary
                    ? 'flex:1;background:#2563eb;color:#fff;font-weight:700;padding:8px;border:none;border-radius:12px;cursor:pointer'
                    : 'flex:1;background:#f1f5f9;color:#475569;font-weight:700;padding:8px;border:none;border-radius:12px;cursor:pointer';
                b.addEventListener('click', fn);
                return b;
            };
            let hasNext = false;
            for (let j = idx + 1; j < steps.length; j++) {
                if (stepVisible(steps[j])) { hasNext = true; break; }
            }
            const last = !hasNext;
            row.appendChild(mkBtn('رد شدن', false, endTour));
            if (idx > 0) row.appendChild(mkBtn('قبلی', false, () => { idx--; render(); }));
            row.appendChild(mkBtn(last ? 'تمام شد' : 'بعدی', true, () => { idx++; render(); }));
            bubble.appendChild(title);
            bubble.appendChild(body);
            bubble.appendChild(dots);
            bubble.appendChild(row);
            placeBubble(r);
        }, 350);
    }

    function onKey(e) {
        if (!overlay || overlay.style.display === 'none') return;
        if (e.key === 'Escape') endTour();
        else if (e.key === 'ArrowLeft') { idx++; render(); }   // RTL: left = forward
        else if (e.key === 'ArrowRight' && idx > 0) { idx--; render(); }
    }

    // ponytail: smooth scrollIntoView keeps moving after render() measures —
    // re-pin ring + bubble to the live rect so the highlight never lags behind
    let scrollRaf = 0, scrollHooked = false;
    function syncToTarget() {
        const st = steps[idx];
        if (!st || !bubble || bubble.style.display === 'none') return;
        const el = document.querySelector(st.selector);
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        ring.style.top = (r.top - 8) + 'px';
        ring.style.left = (r.left - 8) + 'px';
        ring.style.width = (r.width + 16) + 'px';
        ring.style.height = (r.height + 16) + 'px';
        placeBubble(r);
    }
    function hookScrollSync() {
        if (scrollHooked) return;
        scrollHooked = true;
        window.addEventListener('scroll', () => {
            if (!bubble || bubble.style.display === 'none') return;
            cancelAnimationFrame(scrollRaf);
            scrollRaf = requestAnimationFrame(syncToTarget);
        }, { passive: true });
    }

    function endTour() {
        if (overlay) overlay.style.display = 'none';
        if (bubble) bubble.style.display = 'none';
        if (ring) ring.style.display = 'none';
        document.removeEventListener('keydown', onKey);
        document.body.style.overflow = '';
        const cb = onDone;
        onDone = null;
        if (cb) { try { cb(); } catch (e) {} }
    }

    // ponytail: one shared engine; pages only pass step lists + a done callback
    window.startTour = function (list, done) {
        ensureEls();
        steps = Array.isArray(list) ? list : [];
        idx = 0;
        onDone = done || null;
        if (!steps.length) { if (onDone) onDone(); return; }
        overlay.style.display = 'block';
        requestAnimationFrame(() => { overlay.style.opacity = '1'; });
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', onKey);
        hookScrollSync();
        window.addEventListener('resize', () => {
            const st = steps[idx];
            if (!st) return;
            const el = document.querySelector(st.selector);
            if (el && bubble.style.display === 'block') placeBubble(el.getBoundingClientRect());
        });
        render();
    };
    window.endTour = endTour;
})();
