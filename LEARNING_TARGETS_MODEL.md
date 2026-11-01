# 複数学習対象モデル（2026-10-22）

追加確定仕様§3.1・§4.1–4.3に対応。拼音は任意であり、空欄のまま登録・保存できる。

## 内容・定義・状態の分離

- 内容: 既存のword.meaningとannotations[]を利用する。
- 定義: learning-targets.jsがWorkspaceのprofileからmeaningと、保存されたreading:pinyinを導出する。Reader自動表示では対象を追加しない。
- 追加定義: word.learningTargets[]。IDはcustom:<stable-id>。value、label、enabled、countsTowardMasteryを持つ。enabled/参加の既定値はtrue、初期習得はfalse。
- 正本: study.learningTargets[targetId].learned。各状態の未知フィールドや履歴は保持する。
- SRS: 既存study.level、予定、成績、Study履歴は既存実装が管理する。通常採点は個別ターゲットを一括習得にしない。
- 表示・マスク: 習得とは別の表示設定で管理する。
- 将来のStudy/Problemsは語彙IDとtargetIdの組で参照できる。独自項目を追加・編集するUIはP2として今回作らない。

## 有効性・全体習得

enabledがfalseでなく、値があり、countsTowardMasteryがfalseでない対象がすべて習得済みなら全体習得。対象ゼロは未習得。
context、example、memoは補助情報であり学習対象を自動生成しない。

拼音なし＋意味✓は全体✓。後から読みを保存・修正した場合は読みだけを未習得にし、意味は維持する。
読み削除時は判定から除外して過去の対象履歴は残す。再追加時も新しい学習として未習得から始める。
全体チェックは対象群への一括操作。3対象以上でも同じで、indeterminateとaria-checked=mixedで一部習得を表示する。
一括操作で値なし・無効・判定対象外の項目を生成・有効化しない。

## 移行・互換性

読み取り優先順位はstudy.learningTargets→study.chinese→旧PRのstudy.meaning/study.annotations.pinyin→memorized。
旧フィールドは削除せず、study.chineseを互換ミラーとして保持する。正規化結果は次の通常保存で保存される。
SRS予定・成績、他annotation、未知対象の履歴を保持する。コピー時は既存どおりstudyを除去し、定義・内容を保持して習得をリセットする。
追加定義のない英語Workspaceでは従来の単一memorized操作を維持する。

## フォーム・確認

既存空欄は編集時に補完しない。新規の候補を消した後も単語入力では再補完しない。明示的な自動生成ボタンは利用可能。
記事単語帳・Global Vocabulary・Studyで全体チェック、個別チェック、一部習得を共有する。
tests/learning-targets.test.jsでST-05〜08、旧形式、フォーム空欄、コピーを確認する。
独自項目編集UIは未実装（P2）。スマホ上の中間チェック・フォーム・Studyは要実機確認。Draft維持、mainは変更しない。
