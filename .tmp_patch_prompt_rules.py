from pathlib import Path
import re

p = Path('note-structure-editor.js')
s = p.read_text(encoding='utf-8')
pattern = re.compile(r"    function buildAiInstruction\(\) \{[\s\S]*?\n    \}\n\n    async function copyAiInstruction\(\)")
replacement = r'''    function buildAiInstruction() {
        const source = String(document.getElementById('input-note-eng')?.value || '').trim();
        return `次の英文をSmart Reader用に文構造解析してください。回答はJSONオブジェクトのみを出力してください。説明文は不要です。Smart Reader側はコードフェンス付きJSONも読み取れますが、可能ならJSON本体だけを返してください。\n\n英文:\n${source || '（ここに英文）'}\n\n形式:\n{\n  "originalText": "英文",\n  "translation": "自然な日本語訳",\n  "structure": {\n    "annotations": [\n      {"id":"a1","text":"対象語句","occurrence":1,"kind":"core","label":"S"},\n      {"id":"a2","text":"修飾範囲","occurrence":1,"kind":"modifier","notation":"square"}\n    ],\n    "relations": []\n  },\n  "extra": "構文・語法・解釈の説明"\n}\n\n【文構造ルール】\n\n■ core\n- 文型上の主要要素を kind=\"core\" とする。\n- 主節では label は S / V / O / C を使う。\n- 従属節内では S' / V' / O' / C' を使う。\n- S1 / V1 / O1 / C1 など数字付きラベルは使わない。\n- core の text は、原則として修飾節・修飾句を除いた被修飾語側の主要語句を指定する。単なる中心語だけに狭めすぎず、その文型上の要素として自然な最小の句を使う。\n- 名詞を修飾する節・句は core に含めず、modifier として別annotationにする。\n\n■ modifier\n- kind=\"modifier\" の notation は必ず次の基準で決める。\n- square: 名詞・名詞句を修飾する形容詞的要素。関係詞節、分詞句、名詞を修飾する前置詞句など。表示は [ ]。\n- angle: 動詞・形容詞・副詞・節・文全体を修飾する副詞的要素。副詞、副詞句、副詞節など。表示は 《 》。\n- round: 挿入、同格、補足説明など。表示は ( )。\n\n■ text / occurrence\n- text は originalText に実際に存在する連続した文字列を、そのまま完全一致で使う。\n- 大文字小文字、句読点、空白を勝手に変更しない。\n- occurrence は同じ text が複数回ある場合の出現順を1始まりで指定する。通常は1。\n\n■ 範囲\n- annotation は入れ子にしてよい。\n- 大きなmodifierの内部にcoreや別modifierを置いてよい。\n- ただし、2つの範囲を部分的に交差させない。完全包含か非重複にする。\n- 同じ範囲を複数annotationで重複指定しない。\n\n■ relations\n- 現在Smart Readerでは矢印表示を使わない。\n- relations は必ず [] とする。\n\n■ 出力\n- originalText / translation / structure / extra を含むnote形式で返す。\n- annotations の id は a1, a2, a3... のように一意にする。\n- JSONとして解釈できないコメントや説明をJSONの外側に付けない。`;
    }

    async function copyAiInstruction()'''
new_s, count = pattern.subn(replacement, s, count=1)
if count != 1:
    raise SystemExit(f'buildAiInstruction replacement count={count}')
p.write_text(new_s, encoding='utf-8')

p = Path('note-structure-ui.js')
s = p.read_text(encoding='utf-8')
if 'note-structure-editor.js?v=3' not in s:
    raise SystemExit('editor cache marker not found')
p.write_text(s.replace('note-structure-editor.js?v=3', 'note-structure-editor.js?v=4', 1), encoding='utf-8')

p = Path('index.html')
s = p.read_text(encoding='utf-8')
if 'note-structure-ui.js?v=2.1' not in s:
    raise SystemExit('outer cache marker not found')
p.write_text(s.replace('note-structure-ui.js?v=2.1', 'note-structure-ui.js?v=2.2', 1), encoding='utf-8')
