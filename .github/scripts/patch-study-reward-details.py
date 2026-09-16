from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing target: {label}')
    return text.replace(old, new, 1)


flash_path = Path('flashcard-study.js')
flash = flash_path.read_text()

flash = replace_once(
    flash,
    "stats: { responses: 0, known: 0, unsure: 0, wrong: 0, promoted: 0, demoted: 0, lapses: 0 }",
    "stats: { responses: 0, known: 0, unsure: 0, wrong: 0, promoted: 0, demoted: 0, lapses: 0, currentStreak: 0, bestStreak: 0, weakCleared: 0 }",
    'session reward stats defaults'
)

flash = replace_once(
    flash,
    """        // Only the visual transition to the next card is delayed.\n        answerCurrent(result, { deferRender: true });\n\n        const timerId = window.setTimeout(() => {\n""",
    """        // Reward feedback is deliberately measured outside answerCurrent so the stable\n        // answer / queue transition path stays untouched.\n        const rewardEntry = session.queue[session.index] || null;\n        let rewardBefore = null;\n        try {\n            if (rewardEntry?.word) rewardBefore = studyView(rewardEntry.word);\n        } catch (_) {}\n\n        // Only the visual transition to the next card is delayed.\n        answerCurrent(result, { deferRender: true });\n\n        try {\n            if (session && rewardEntry?.word) {\n                const rewardAfter = studyView(rewardEntry.word);\n                const currentStreak = result === 'known'\n                    ? (Number(session.stats.currentStreak) || 0) + 1\n                    : 0;\n                session.stats.currentStreak = currentStreak;\n                session.stats.bestStreak = Math.max(Number(session.stats.bestStreak) || 0, currentStreak);\n\n                const beforeWeakness = Number(rewardBefore?.weaknessScore);\n                const afterWeakness = Number(rewardAfter?.weaknessScore);\n                const weakCleared = result === 'known' && !!rewardBefore?.difficult && !rewardAfter?.difficult;\n                if (weakCleared) session.stats.weakCleared = (Number(session.stats.weakCleared) || 0) + 1;\n\n                window.dispatchEvent(new CustomEvent('smartreader:study-answer-feedback', {\n                    detail: {\n                        result,\n                        key: rewardEntry.key || '',\n                        word: String(rewardEntry.word.word || rewardEntry.word.surfaceText || ''),\n                        beforeWeakness: Number.isFinite(beforeWeakness) ? beforeWeakness : null,\n                        afterWeakness: Number.isFinite(afterWeakness) ? afterWeakness : null,\n                        weakCleared,\n                        currentStreak,\n                        bestStreak: Number(session.stats.bestStreak) || 0,\n                        levelUp: Number(rewardAfter?.study?.level) > Number(rewardBefore?.study?.level),\n                        mastered: !!rewardAfter?.mastered\n                    }\n                }));\n            }\n        } catch (error) {\n            console.warn('Study reward feedback skipped', error);\n        }\n\n        const timerId = window.setTimeout(() => {\n""",
    'safe reward feedback after stable answer path'
)

export_anchor = """    function init() {\n"""
export_helpers = r'''    function getActiveSessionSnapshot() {
        if (!session) return null;
        const entries = (Array.isArray(session.initialEntries) ? session.initialEntries : []).map(entry => {
            const attempt = session.attempts instanceof Map ? session.attempts.get(entry.key) : null;
            const senseDisplay = resolveStudySenseDisplay(entry.word || {});
            const view = entry.word ? studyView(entry.word) : null;
            return {
                key: entry.key || '',
                articleId: entry.articleId ?? entry.article?.id ?? null,
                articleTitle: String(entry.articleTitle || entry.article?.name || ''),
                chapterId: entry.chapterId ?? null,
                chapterTitle: String(entry.chapterTitle || ''),
                word: String(entry.word?.word || entry.word?.surfaceText || ''),
                meaning: senseDisplay.meaning,
                otherMeanings: [...senseDisplay.otherMeanings],
                weaknessScore: Number(view?.weaknessScore) || 0,
                difficult: !!view?.difficult,
                mastered: !!view?.mastered,
                attempt: attempt ? { ...attempt } : { responses: 0, known: 0, unsure: 0, wrong: 0, firstResult: null }
            };
        });
        return {
            label: String(session.label || '学習'),
            startedAt: Number(session.startedAt) || null,
            finished: !!session.finished,
            initialCount: Number(session.initialCount) || entries.length,
            round: Number(session.round) || 1,
            stats: { ...(session.stats || {}) },
            entries
        };
    }

    function retryActiveSession(mode = 'missed') {
        if (!session || !session.finished) return false;
        const attempts = session.attempts instanceof Map ? session.attempts : new Map();
        const selected = (Array.isArray(session.initialEntries) ? session.initialEntries : []).filter(entry => {
            const attempt = attempts.get(entry.key);
            if (!attempt) return false;
            if (mode === 'wrong') return (Number(attempt.wrong) || 0) > 0;
            return (Number(attempt.wrong) || 0) + (Number(attempt.unsure) || 0) > 0;
        });
        if (!selected.length) return false;
        const label = mode === 'wrong' ? `✕だけ再挑戦 · ${selected.length}語` : `?・✕を再挑戦 · ${selected.length}語`;
        closeSession(true);
        window.setTimeout(() => startSession(selected, label), 0);
        return true;
    }

'''
flash = replace_once(flash, export_anchor, export_helpers + export_anchor, 'reward summary helpers')

flash = replace_once(
    flash,
    """            getHistory: () => studyHistoryCache.map(item => ({ ...item, stats: { ...(item.stats || {}) }, words: Array.isArray(item.words) ? item.words.map(word => ({ ...word })) : [] })),\n            loadHistory: () => ensureStudyHistoryLoaded(),\n""",
    """            getHistory: () => studyHistoryCache.map(item => ({ ...item, stats: { ...(item.stats || {}) }, words: Array.isArray(item.words) ? item.words.map(word => ({ ...word })) : [] })),\n            getActiveSession: getActiveSessionSnapshot,\n            retryActiveSession,\n            loadHistory: () => ensureStudyHistoryLoaded(),\n""",
    'reward public helpers'
)
flash_path.write_text(flash)


study_path = Path('study-center.js')
study = study_path.read_text()
study = replace_once(
    study,
    """            <article class=\"study-center-word-card ${held ? 'is-held' : ''} ${manualMastered ? 'is-manual-mastered' : ''}\">\n""",
    """            <article class=\"study-center-word-card ${held ? 'is-held' : ''} ${manualMastered ? 'is-manual-mastered' : ''}\" data-study-entry-key=\"${escapeHtml(entry.key)}\" tabindex=\"0\" role=\"button\" aria-label=\"${escapeHtml(entry.word.word || entry.word.surfaceText || '単語')} の学習詳細を開く\">\n""",
    'study word detail hook'
)
study_path.write_text(study)


reward_js = r'''(function () {
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
'''
Path('study-reward-ui.js').write_text(reward_js)


word_detail_js = r'''(function () {
    'use strict';

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    }

    function formatDate(timestamp, withTime = false) {
        if (!Number.isFinite(Number(timestamp))) return '—';
        const options = withTime
            ? { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }
            : { year: 'numeric', month: 'numeric', day: 'numeric' };
        return new Intl.DateTimeFormat('ja-JP', options).format(new Date(Number(timestamp)));
    }

    function senseDisplay(word) {
        try {
            const display = window.SmartReaderWordSenses?.getSenseDisplay?.(word);
            if (display?.context) {
                return {
                    meaning: String(display.context.meaning || word?.meaning || '').trim(),
                    others: Array.isArray(display.others) ? display.others.map(item => String(item?.meaning || '').trim()).filter(Boolean) : []
                };
            }
        } catch (_) {}
        const meaning = String(word?.meaning || '').trim();
        const senses = Array.isArray(word?.senses) ? word.senses : [];
        return { meaning, others: senses.map(item => String(item?.meaning || '').trim()).filter(item => item && item !== meaning) };
    }

    function getEntry(key) {
        try {
            const model = window.SmartReaderStudyCenter?.getReviewModel?.();
            return model?.entries?.find(entry => entry.key === key) || null;
        } catch (_) { return null; }
    }

    function recentHistory(entry) {
        let sessions = [];
        try { sessions = window.SmartReaderStudy?.getHistory?.() || []; } catch (_) {}
        const rows = [];
        sessions.forEach(session => {
            const item = (Array.isArray(session.words) ? session.words : []).find(word => word.key === entry.key)
                || (Array.isArray(session.words) ? session.words : []).find(word => String(word.articleId) === String(entry.articleId) && String(word.word || '') === String(entry.word?.word || entry.word?.surfaceText || ''));
            if (!item) return;
            rows.push({ stamp: Number(session.completedAt || session.startedAt) || 0, result: item.finalResult || item.firstResult || '', responses: Number(item.responses) || 0 });
        });
        return rows.slice(0, 8);
    }

    function resultMark(result) {
        if (result === 'known') return '✓';
        if (result === 'wrong') return '✕';
        if (result === 'unsure') return '?';
        return '—';
    }

    function ensureOverlay() {
        let overlay = document.getElementById('study-word-detail-overlay');
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'study-word-detail-overlay';
        overlay.className = 'study-word-detail-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `<section class="study-word-detail-modal" role="dialog" aria-modal="true" aria-label="単語の学習詳細"><div data-study-word-detail-body></div></section>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', event => {
            if (event.target === overlay || event.target.closest('[data-study-word-detail-close]')) closeDetail();
            const studyButton = event.target.closest('[data-study-word-detail-review]');
            if (studyButton) {
                const entry = getEntry(studyButton.dataset.studyWordDetailReview);
                if (entry) {
                    closeDetail();
                    window.SmartReaderStudy?.open?.([entry], `${entry.word?.word || entry.word?.surfaceText || '1語'}を復習`);
                }
            }
        });
        return overlay;
    }

    function openDetail(key) {
        const entry = getEntry(key);
        if (!entry?.word) return;
        const overlay = ensureOverlay();
        const body = overlay.querySelector('[data-study-word-detail-body]');
        const view = window.SmartReaderStudy?.getWordView?.(entry.word) || {};
        const study = view.study || window.SmartReaderStudy?.getWordStudy?.(entry.word) || {};
        const senses = senseDisplay(entry.word);
        const seen = Number(study.seenCount) || 0;
        const known = Number(study.knownCount) || 0;
        const accuracy = seen ? Math.round(known / seen * 100) : 0;
        const weakness = Math.round(Number(view.weaknessScore ?? study.difficultyScore) || 0);
        const history = recentHistory(entry);
        const source = `${entry.articleTitle || ''}${entry.chapterTitle ? ` / ${entry.chapterTitle}` : ''}`;
        body.innerHTML = `
            <header class="study-word-detail-header">
                <div><span>WORD DETAIL</span><h2>${escapeHtml(entry.word.word || entry.word.surfaceText || '—')}</h2><p>${escapeHtml(source)}</p></div>
                <button type="button" data-study-word-detail-close aria-label="閉じる">×</button>
            </header>
            <div class="study-word-detail-meaning"><strong>${escapeHtml(senses.meaning || '意味未登録')}</strong>${senses.others.length ? `<div>${senses.others.map(value => `<span>・${escapeHtml(value)}</span>`).join('')}</div>` : ''}</div>
            <div class="study-word-detail-hero">
                <div><span>苦手度</span><strong>${weakness}</strong><small>${view.difficult ? '苦手' : '通常'}</small></div>
                <div><span>正答率</span><strong>${accuracy}%</strong><small>${known} / ${seen || 0}</small></div>
                <div><span>次回復習</span><strong class="date">${formatDate(study.nextReviewAt)}</strong><small>${view.overdue ? '期限超過' : (view.dueToday ? '今日が期限' : '')}</small></div>
            </div>
            <div class="study-word-detail-stats">
                <span>✓ <b>${known}</b></span><span>? <b>${Number(study.unsureCount) || 0}</b></span><span>✕ <b>${Number(study.wrongCount) || 0}</b></span><span>忘却 <b>${Number(study.lapseCount) || 0}</b></span><span>連続✓ <b>${Number(study.correctStreak) || 0}</b></span><span>Level <b>${Number(study.level) || 0}</b></span>
            </div>
            <section class="study-word-detail-dates"><div><span>最終学習</span><strong>${formatDate(study.lastStudiedAt, true)}</strong></div><div><span>最終復習</span><strong>${formatDate(study.lastReviewAt, true)}</strong></div></section>
            <section class="study-word-detail-history">
                <div class="study-word-detail-section-title"><strong>最近の判定</strong><span>${history.length ? `${history.length}件` : '履歴なし'}</span></div>
                ${history.length ? `<div class="study-word-detail-timeline">${history.map(item => `<div><time>${escapeHtml(formatDate(item.stamp))}</time><b class="result-${escapeHtml(item.result)}">${resultMark(item.result)}</b><span>${item.responses}回答</span></div>`).join('')}</div>` : '<p>この単語の学習履歴はまだありません。</p>'}
            </section>
            <button type="button" class="study-word-detail-review" data-study-word-detail-review="${escapeHtml(entry.key)}">この単語を復習</button>
        `;
        overlay.hidden = false;
        document.body.classList.add('study-word-detail-open');
    }

    function closeDetail() {
        const overlay = document.getElementById('study-word-detail-overlay');
        if (overlay) overlay.hidden = true;
        document.body.classList.remove('study-word-detail-open');
    }

    function injectStyle() {
        if (document.getElementById('study-word-detail-style')) return;
        const style = document.createElement('style');
        style.id = 'study-word-detail-style';
        style.textContent = `
            .study-center-word-card[data-study-entry-key]{cursor:pointer}.study-center-word-card[data-study-entry-key]:focus-visible{outline:3px solid rgba(111,90,72,.22);outline-offset:2px}
            .study-word-detail-open{overflow:hidden}.study-word-detail-overlay{position:fixed;inset:0;z-index:14500;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(50,43,37,.38);backdrop-filter:blur(6px)}.study-word-detail-overlay[hidden]{display:none!important}
            .study-word-detail-modal{width:min(620px,100%);max-height:min(82vh,760px);overflow:auto;padding:20px;border:1px solid #e4d9cf;border-radius:22px;background:#fbf8f4;box-shadow:0 24px 70px rgba(49,40,34,.24);color:#40362f}
            .study-word-detail-header{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.study-word-detail-header span{color:#9c7f66;font-size:.68rem;font-weight:900;letter-spacing:.13em}.study-word-detail-header h2{margin:2px 0 2px;font-size:1.65rem}.study-word-detail-header p{margin:0;color:#918477;font-size:.76rem}.study-word-detail-header button{width:38px;height:38px;border:1px solid #ded3c9;border-radius:50%;background:#fff;color:#66594e;font-size:1.3rem}
            .study-word-detail-meaning{margin-top:14px;padding:14px;border-radius:15px;background:#fff;border:1px solid #e9e0d8}.study-word-detail-meaning>strong{display:block;font-size:1.15rem}.study-word-detail-meaning>div{display:grid;gap:2px;margin-top:6px;color:#887b70;font-size:.84rem}
            .study-word-detail-hero{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}.study-word-detail-hero>div{padding:12px;border-radius:13px;background:#fff;border:1px solid #e6ddd5}.study-word-detail-hero span,.study-word-detail-hero small{display:block;color:#897c71;font-size:.72rem}.study-word-detail-hero strong{display:block;margin:3px 0;font-size:1.45rem}.study-word-detail-hero strong.date{font-size:1rem;line-height:1.45}
            .study-word-detail-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:9px}.study-word-detail-stats span{padding:8px;border-radius:10px;background:#f0ebe6;color:#75685d;font-size:.78rem}.study-word-detail-stats b{float:right;color:#41372f}
            .study-word-detail-dates{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}.study-word-detail-dates>div{padding:10px 12px;border-bottom:1px solid #e5dcd4}.study-word-detail-dates span,.study-word-detail-dates strong{display:block}.study-word-detail-dates span{color:#8b7f74;font-size:.72rem}.study-word-detail-dates strong{margin-top:3px;font-size:.82rem}
            .study-word-detail-history{margin-top:14px}.study-word-detail-section-title{display:flex;justify-content:space-between;align-items:center}.study-word-detail-section-title span{color:#94877a;font-size:.72rem}.study-word-detail-timeline{margin-top:7px;border-radius:12px;background:#fff;border:1px solid #e7ddd5;overflow:hidden}.study-word-detail-timeline>div{display:grid;grid-template-columns:1fr 34px 60px;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #f0e9e3}.study-word-detail-timeline>div:last-child{border-bottom:0}.study-word-detail-timeline time,.study-word-detail-timeline span{font-size:.74rem;color:#827568}.study-word-detail-timeline b{text-align:center;font-size:1rem}.study-word-detail-timeline .result-known{color:#27824e}.study-word-detail-timeline .result-wrong{color:#b94747}.study-word-detail-timeline .result-unsure{color:#7d6b55}
            .study-word-detail-history>p{margin:8px 0;color:#918477;font-size:.8rem}.study-word-detail-review{width:100%;min-height:44px;margin-top:16px;border:0;border-radius:12px;background:#6f5a48;color:#fff;font-weight:850}
            @media(max-width:600px){.study-word-detail-overlay{align-items:flex-end;padding:0}.study-word-detail-modal{width:100%;max-height:88vh;border-radius:20px 20px 0 0;padding:17px 14px calc(18px + env(safe-area-inset-bottom))}.study-word-detail-hero{grid-template-columns:1fr 1fr}.study-word-detail-hero>div:last-child{grid-column:1/-1}.study-word-detail-dates{grid-template-columns:1fr}.study-word-detail-stats{grid-template-columns:1fr 1fr 1fr}}
        `;
        document.head.appendChild(style);
    }

    function init() {
        injectStyle();
        ensureOverlay();
        document.addEventListener('click', event => {
            const card = event.target.closest?.('.study-center-word-card[data-study-entry-key]');
            if (!card || event.target.closest('button, a, input, select, textarea')) return;
            openDetail(card.dataset.studyEntryKey);
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !document.getElementById('study-word-detail-overlay')?.hidden) {
                closeDetail();
                return;
            }
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const card = event.target.closest?.('.study-center-word-card[data-study-entry-key]');
            if (!card || event.target.closest('button, a, input, select, textarea')) return;
            event.preventDefault();
            openDetail(card.dataset.studyEntryKey);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
'''
Path('study-word-detail.js').write_text(word_detail_js)


index_path = Path('index.html')
index = index_path.read_text()
index = replace_once(index, 'flashcard-study.js?v=1.14', 'flashcard-study.js?v=1.15', 'flashcard cache version')
index = replace_once(index, '<script src="flashcard-study.js?v=1.15"></script>', '<script src="flashcard-study.js?v=1.15"></script>\n    <script src="study-reward-ui.js?v=1"></script>', 'reward script include')
index = replace_once(index, 'study-center.js?v=11', 'study-center.js?v=12', 'study center cache version')
index = replace_once(index, '<script src="study-center.js?v=12"></script>', '<script src="study-center.js?v=12"></script>\n    <script src="study-word-detail.js?v=1"></script>', 'word detail include')
index_path.write_text(index)
