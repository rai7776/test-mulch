(function () {
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
