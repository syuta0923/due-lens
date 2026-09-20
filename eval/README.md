# eval（仕様書 4.7）

抽出精度の評価セット。9/20〜9/21 に作る。

```
cases/
  001.jpg
  001.expected.json   … 手で書いた正解（Extraction 型）
  002.pdf
  002.expected.json
```

- 5〜10 件。自分の大学のシラバスと課題一覧を使う。
- 指標は `courses[].name` / `events[].date` / `events[].session_number` / `events[].type` の
  フィールド単位の一致率と、取りこぼし・余計な追加の件数だけ。
- 意図的に難しいケースを入れる：年が書かれていない日付、複数科目が 1 枚に載った課題一覧、
  「第8回」しか書かれていない試験、手書きの書き込みがあるもの。

用途は 3 つ：モデルの選定、画像縮小サイズ（1024 / 1568 / 2048）の決定、リグレッション検知。

```
npm run eval -w eval -- --model gemini-2.5-flash-lite --long-edge 1568
```
