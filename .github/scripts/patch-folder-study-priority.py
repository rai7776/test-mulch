from pathlib import Path
import re

path = Path('folder-study-range.js')
text = path.read_text()
new_block = '''    function shuffledCopy(entries) {
        const copy = [...entries];
        for (let i = copy.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    function studySelectionBucket(entry) {
        const word = entry?.word || {};
        const study = word.study && typeof word.study === 'object' ? word.study : {};
        const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
        const seenCount = number(study.seenCount);
        const knownCount = number(study.knownCount);
        const unsureCount = number(study.unsureCount);
        const wrongCount = number(study.wrongCount);
        const lapseCount = number(study.lapseCount);
        const difficultyScore = Number.isFinite(Number(study.difficultyScore)) ? Number(study.difficultyScore) : 45;
        const level = number(study.level);
        const correctStreak = number(study.correctStreak);
        const lastResult = String(study.lastReviewResult || study.lastResult || '');
        const unstudied = seenCount === 0 && knownCount === 0 && unsureCount === 0 && wrongCount === 0 && !word.memorized;
        if (unstudied) return 'new';

        const stable = !!word.memorized || level >= 4 || correctStreak >= 3;
        const difficult = lastResult === 'wrong'
            || lastResult === 'unsure'
            || difficultyScore >= 65
            || lapseCount >= 1
            || (!stable && (wrongCount >= 1 || unsureCount >= 1));
        return difficult ? 'difficult' : 'known';
    }

    function chooseEntries(entries) {
        const limit = Math.min(normalizeLimit(), entries.length);
        if (entries.length <= limit) return [...entries];

        const buckets = { new: [], difficult: [], known: [] };
        entries.forEach(entry => buckets[studySelectionBucket(entry)].push(entry));
        Object.keys(buckets).forEach(key => { buckets[key] = shuffledCopy(buckets[key]); });

        const targetNew = Math.round(limit * 0.60);
        const targetDifficult = Math.round(limit * 0.30);
        const targetKnown = Math.max(0, limit - targetNew - targetDifficult);
        const selected = [];

        const take = (key, count) => {
            if (count <= 0 || !buckets[key].length) return;
            selected.push(...buckets[key].splice(0, Math.min(count, buckets[key].length)));
        };

        take('new', targetNew);
        take('difficult', targetDifficult);
        take('known', targetKnown);

        let remaining = limit - selected.length;
        ['new', 'difficult', 'known'].forEach(key => {
            if (remaining <= 0) return;
            const count = Math.min(remaining, buckets[key].length);
            take(key, count);
            remaining -= count;
        });

        return selected.slice(0, limit);
    }
'''

pattern = r"    function chooseEntries\(entries\) \{.*?\n    \}\n\n(?=    function ensurePanel\(\))"
text, count = re.subn(pattern, new_block + '\n', text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'chooseEntries replacement count={count}')

old_preview = "if (preview) preview.textContent = matched.length ? `${matched.length}語から${selected}語を出題` : 'この条件に一致する単語はありません';"
new_preview = "if (preview) preview.textContent = matched.length ? `${matched.length}語から${selected}語を出題 · 未学習60% / 苦手30% / その他10%を目安` : 'この条件に一致する単語はありません';"
if old_preview not in text:
    raise SystemExit('preview block not found')

path.write_text(text.replace(old_preview, new_preview, 1))
