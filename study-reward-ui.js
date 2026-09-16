(function () {
    'use strict';

    let feedbackTimer = null;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

    function prefersReducedMotion() {
        return !!reducedMotion?.matches;
    }

    function clearFeedbackLater(node) {
        if (feedbackTimer) window.clearTimeout(feedbackTimer);
        feedbackTimer = window.setTimeout(() => {
            node?.classList.remove('show', 'known', 'unsure', 'wrong', 'special');
        }, 980);
    }

    function rewardCopy(detail) {
        const before = Number(detail?.beforeWeakness);
        const after = Number(detail?.afterWeakness);
        const hasDelta = Number.isFinite(before) && Number.isFinite(after) && before !== after;
        const deltaText = hasDelta ? `苦手度 ${before} → ${after}` : '';
        if (detail?.weakCleared) return { title: '🎉 苦手克服！', sub: deltaText || '苦手判定を抜けました', special: true };
        if (detail?.result === 'known' && Number(detail?.currentStreak) >= 5) {
            return { title: `🔥 ${detail.currentStreak} streak`, sub: deltaText || 'いい流れです', special: true };
        }
        if (detail?.result === 'known' && Number(detail?.currentStreak) >= 3) {
            return { title: `🔥 ${detail.currentStreak}連続`, sub: deltaText || '連続正解', special: true };
        }
        if (detail?.result === 'known') return { title: '✓ Nice!', sub: deltaText || (detail?.levelUp ? 'レベルアップ' : '定着中'), special: !!detail?.levelUp };
        if (detail?.result === 'unsure') return { title: '? もう一度でOK', sub: 'この周でもう一度出題します', special: false };
        return { title: '✕ 次で取り返そう', sub: 'この周でもう一度出題します', special: false };
    }

    function makeBurst(detail) {
        if (prefersReducedMotion() || (!detail?.weakCleared && Number(detail?.currentStreak) < 3)) return;
        const shell = document.querySelector('.study-session-shell');
        if (!shell) return;
        const burst = document.createElement('div');
        burst.className = `study-reward-burst ${detail.weakCleared ? 'is-weak-clear' : 'is-streak'}`;
        burst.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 10; i += 1) {
            const particle = document.createElement('i');
            particle.style.setProperty('--reward-i', String(i));
            burst.appendChild(particle);
        }
        shell.appendChild(burst);
        window.setTimeout(() => burst.remove(), 850);
    }

    function showAnswerReward(detail) {
        const node = document.getElementById('study-answer-feedback');
        if (!node) return;
        const copy = rewardCopy(detail || {});
        node.className = 'study-answer-feedback';
        node.replaceChildren();
        const title = document.createElement('strong');
        title.textContent = copy.title;
        const sub = document.createElement('span');
        sub.textContent = copy.sub;
        node.append(title, sub);
        node.classList.add(detail?.result || 'known');
        if (copy.special) node.classList.add('special');
        void node.offsetWidth;
        node.classList.add('show');
        clearFeedbackLater(node);

        const streak = document.getElementById('study-session-streak');
        if (streak) {
            const count = Number(detail?.currentStreak) || 0;
            streak.hidden = count < 2;
            streak.textContent = count >= 2 ? `🔥 ${count}` : '';
        }
        const stage = document.getElementById('study-session-stage');
        if (stage) {
            stage.classList.remove('reward-known', 'reward-special');
            if (detail?.result === 'known') stage.classList.add('reward-known');
            if (copy.special) stage.classList.add('reward-special');
            window.setTimeout(() => stage.classList.remove('reward-known', 'reward-special'), 360);
        }
        makeBurst(detail || {});
    }

    function sessionSnapshot() {
        try { return window.SmartReaderStudy?.getActiveSession?.() || null; } catch (_) { return null; }
    }

    function enhanceSummary(summary) {
        if (!summary || summary.dataset.rewardEnhanced === '1') return;
        const snapshot = sessionSnapshot();
        if (!snapshot?.stats) return;
        summary.dataset.rewardEnhanced = '1';
        const stats = snapshot.stats;
        const responses = Number(stats.responses) || 0;
        const known = Number(stats.known) || 0;
        const accuracy = responses ? Math.round(known / responses * 100) : 0;
        const bestStreak = Number(stats.bestStreak) || 0;
        const weakCleared = Number(stats.weakCleared) || 0;
        const mastered = (snapshot.entries || []).filter(entry => entry.mastered).length;

        const recap = document.createElement('div');
        recap.className = 'study-reward-summary-recap';
        recap.innerHTML = `
            <div><span>正解率</span><strong>${accuracy}%</strong></div>
            <div><span>最高streak</span><strong>🔥 ${bestStreak}</strong></div>
            <div><span>苦手克服</span><strong>${weakCleared}</strong></div>
            <div><span>暗記済み</span><strong>${mastered}</strong></div>
        `;
        const grid = summary.querySelector('.study-summary-grid');
        if (grid) grid.insertAdjacentElement('beforebegin', recap);
        else summary.appendChild(recap);

        if (weakCleared > 0) {
            const celebrate = document.createElement('div');
            celebrate.className = 'study-reward-summary-celebrate';
            celebrate.textContent = `🎉 今回 ${weakCleared}語の苦手を克服しました`;
            recap.insertAdjacentElement('beforebegin', celebrate);
        }

        const wrongEntries = (snapshot.entries || []).filter(entry => Number(entry.attempt?.wrong) > 0);
        const missedEntries = (snapshot.entries || []).filter(entry => (Number(entry.attempt?.wrong) || 0) + (Number(entry.attempt?.unsure) || 0) > 0);
        if (wrongEntries.length || missedEntries.length) {
            const retry = document.createElement('div');
            retry.className = 'study-reward-retry-actions';
            if (wrongEntries.length) {
                const wrong = document.createElement('button');
                wrong.type = 'button';
                wrong.className = 'study-reward-retry wrong';
                wrong.textContent = `✕だけもう一度 · ${wrongEntries.length}語`;
                wrong.addEventListener('click', () => window.SmartReaderStudy?.retryActiveSession?.('wrong'));
                retry.appendChild(wrong);
            }
            if (missedEntries.length) {
                const missed = document.createElement('button');
                missed.type = 'button';
                missed.className = 'study-reward-retry missed';
                missed.textContent = `?・✕を復習 · ${missedEntries.length}語`;
                missed.addEventListener('click', () => window.SmartReaderStudy?.retryActiveSession?.('missed'));
                retry.appendChild(missed);
            }
            summary.querySelector('.study-summary-actions')?.insertAdjacentElement('beforebegin', retry);
        }
    }

    function scanSummary(root = document) {
        const summary = root.querySelector?.('.study-session-summary');
        if (summary) enhanceSummary(summary);
    }

    function injectStyle() {
        if (document.getElementById('study-reward-ui-style')) return;
        const style = document.createElement('style');
        style.id = 'study-reward-ui-style';
        style.textContent = `
            .study-session-stage.reward-known .study-card-face{box-shadow:0 18px 44px rgba(54,143,87,.2)}
            .study-session-stage.reward-special .study-card-face{box-shadow:0 20px 54px rgba(226,154,42,.27)}
            .study-reward-burst{position:absolute;z-index:24;left:50%;top:42%;width:10px;height:10px;pointer-events:none}
            .study-reward-burst i{--a:calc(var(--reward-i) * 36deg);position:absolute;left:0;top:0;width:7px;height:7px;border-radius:2px;background:#e5a83d;animation:study-reward-particle .72s ease-out forwards;transform:rotate(var(--a)) translateY(-8px)}
            .study-reward-burst.is-weak-clear i:nth-child(3n){background:#64ad7d}.study-reward-burst i:nth-child(2n){border-radius:50%;background:#d87562}
            @keyframes study-reward-particle{0%{opacity:1;transform:rotate(var(--a)) translateY(-8px) scale(1)}100%{opacity:0;transform:rotate(var(--a)) translateY(-115px) scale(.3)}}
            .study-reward-summary-celebrate{margin:12px 0 4px;padding:10px 12px;border-radius:12px;background:#fff6df;color:#8a5a10;font-weight:850}
            .study-reward-summary-recap{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:12px 0}
            .study-reward-summary-recap>div{padding:9px 7px;border:1px solid #e8ded3;border-radius:11px;background:#fffaf5}
            .study-reward-summary-recap span,.study-reward-summary-recap strong{display:block}.study-reward-summary-recap span{color:#837468;font-size:.7rem}.study-reward-summary-recap strong{margin-top:3px;color:#433930;font-size:1.05rem}
            .study-reward-retry-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
            .study-reward-retry{min-height:42px;border:1px solid #ddd1c6;border-radius:11px;background:#fff;color:#5f5146;font-weight:850}.study-reward-retry.wrong{border-color:#e7c1bc;color:#9b4c45}.study-reward-retry.missed{border-color:#d6d4d1}
            @media(max-width:520px){.study-reward-summary-recap{grid-template-columns:1fr 1fr}.study-reward-retry-actions{grid-template-columns:1fr}}
            @media(prefers-reduced-motion:reduce){.study-reward-burst{display:none}.study-session-stage.reward-known .study-card-face,.study-session-stage.reward-special .study-card-face{box-shadow:0 15px 38px rgba(79,63,50,.14)}}
        `;
        document.head.appendChild(style);
    }

    function init() {
        injectStyle();
        window.addEventListener('smartreader:study-answer-feedback', event => showAnswerReward(event.detail || {}));
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes || []) {
                    if (!(node instanceof Element)) continue;
                    if (node.matches?.('.study-session-summary')) enhanceSummary(node);
                    else scanSummary(node);
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        scanSummary();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
