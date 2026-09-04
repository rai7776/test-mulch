const fs = require('fs');
const vm = require('vm');

let source = fs.readFileSync('flashcard-study.js', 'utf8');
const tail = `    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);\n    else init();\n})();`;
const replacement = `    globalThis.__flashcardTest = {\n        readStudy, ensureStudy, adaptiveIntervalDays, difficultyLabel, applyStudyResult,\n        setSession(value) { session = value; }\n    };\n})();`;
if (!source.includes(tail)) throw new Error('test instrumentation marker missing');
source = source.replace(tail, replacement);

const sandbox = {
  console,
  Date,
  Math,
  Set,
  Map,
  JSON,
  Number,
  String,
  Array,
  Object,
  localStorage: { getItem() { return null; }, setItem() {} }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const t = sandbox.__flashcardTest;
if (!t) throw new Error('test API unavailable');

function makeSession() {
  return { evaluated: new Set(), attempts: new Map() };
}
function entry(word, key = 'a') { return { key, word }; }
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// 1) New word known immediately: treat as already familiar, start at Lv2 and schedule several days out.
{
  const word = { memorized: false };
  t.setSession(makeSession());
  const effect = t.applyStudyResult(entry(word), 'known');
  const study = t.readStudy(word);
  assert(effect.promoted, 'new immediate known should promote');
  assert(study.level === 2, `expected Lv2, got ${study.level}`);
  assert(study.difficultyScore === 27, `expected difficulty 27, got ${study.difficultyScore}`);
  assert(study.intervalDays >= 3, `easy new word should not return tomorrow: ${study.intervalDays}`);
  assert(study.firstKnownCount === 1 && study.lastSessionAttempts === 1, 'first-pass counters incorrect');
}

// 2) New word needing repetitions: no multi-level promotion; every extra × makes it harder.
{
  const word = { memorized: false };
  const session = makeSession();
  t.setSession(session);
  const first = t.applyStudyResult(entry(word, 'b'), 'wrong');
  const afterFirst = t.readStudy(word);
  assert(!first.lapse, 'brand-new wrong must not count as lapse');
  assert(afterFirst.level === 0 && afterFirst.intervalDays === 1, 'new wrong should stay cautious and return tomorrow');
  const d1 = afterFirst.difficultyScore;
  t.applyStudyResult(entry(word, 'b'), 'wrong');
  const d2 = t.readStudy(word).difficultyScore;
  t.applyStudyResult(entry(word, 'b'), 'known');
  const final = t.readStudy(word);
  assert(d2 > d1, 'extra wrong should raise difficulty');
  assert(final.level === 0, 'same-session final known must not increase long-term level');
  assert(final.lastSessionAttempts === 3 && final.lastSessionWrongCount === 2, 'attempt history incorrect');
  assert(final.intervalDays === 1, 'hard item should remain scheduled for tomorrow');
}

// 3) Previously learned word forgotten: count a lapse and demote cautiously.
{
  const word = { memorized: true, study: { version: 2, level: 4, sessionCount: 3, firstKnownCount: 2, difficultyScore: 40, lapseCount: 0 } };
  t.setSession(makeSession());
  const effect = t.applyStudyResult(entry(word, 'c'), 'wrong');
  const study = t.readStudy(word);
  assert(effect.lapse, 'learned wrong should count as lapse');
  assert(study.lapseCount === 1, 'lapse counter should increment');
  assert(study.level === 3, `mastered lapse should return to Lv3, got ${study.level}`);
  assert(study.difficultyScore === 65, `lapse should strongly raise difficulty, got ${study.difficultyScore}`);
  assert(study.intervalDays === 1 && !word.memorized, 'forgotten mastered word should return tomorrow and leave memorized state');
}

// 4) Repeatedly failed but never learned is not a lapse.
{
  const word = { memorized: false, study: { version: 2, level: 0, sessionCount: 4, firstKnownCount: 0, difficultyScore: 70, lapseCount: 0 } };
  t.setSession(makeSession());
  const effect = t.applyStudyResult(entry(word, 'd'), 'wrong');
  assert(!effect.lapse, 'never-learned item must not be labeled forgotten');
  assert(t.readStudy(word).lapseCount === 0, 'never-learned lapse counter changed');
}

// 5) Same Lv should produce longer intervals for easy items and shorter for hard items.
assert(t.adaptiveIntervalDays(3, 20) > t.adaptiveIntervalDays(3, 50), 'easy interval should exceed normal');
assert(t.adaptiveIntervalDays(3, 50) > t.adaptiveIntervalDays(3, 80), 'normal interval should exceed hard');
assert(t.difficultyLabel(20) === '低' && t.difficultyLabel(85) === '非常に高', 'difficulty labels incorrect');

console.log('adaptive flashcard behavior tests passed');
