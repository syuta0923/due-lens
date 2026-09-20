# シラバスカレンダー（仮）

シラバスや課題一覧の PDF・写真を読み込み、授業日・課題締切・試験日を自動でカレンダーに登録する
大学生向けの Android アプリ。RevenueCat Shipaton 2026 / Next Gen Award 応募作品。

仕様書：[syllabus-calendar-spec.md](./syllabus-calendar-spec.md)

## 特徴

- **写真 1 枚から学期分の予定が入る** — 画像・PDF をそのまま LLM に渡し、科目と予定を構造化して取り出す。
- **「第 8 回」が実際の日付になる** — 振替授業日・休講日・祝日・授業を行う祝日を考慮して、
  回数を日付に変換する（判定順は振替＞休講＞祝日＞通常）。計算はすべてアプリ側のコードで決定的に行う。
- **AI の誤りをコードで検出する** — LLM の自己申告スコアは使わない。書類にあった日付表記（`date_raw`）と
  正規化した日付（`date`）を突き合わせ、曜日が食い違えば理由つきで確認画面に出す。
- **登録先は専用カレンダー** — 「シラバス」カレンダーを作って書き込むので、まとめて消せる。
  同じ書類を読み直しても二重登録しない。

## 構成

```
syllabus-calendar/
├─ app/      … Expo（React Native / TypeScript）Android アプリ
│  ├─ app/   … 画面（Expo Router）
│  ├─ lib/   … extract / calendar / purchases / device
│  └─ store/ … Zustand ＋ AsyncStorage
├─ shared/   … アプリ・Worker・eval が共有する唯一の定義
│  └─ src/   … schema（AI 出力）/ api（HTTP 契約）/ schedule（回数→日付）/ review（要確認判定）
├─ worker/   … 中継 API（Cloudflare Workers）
└─ eval/     … 抽出精度の評価セット
```

`shared/src/schema.ts` の zod スキーマ 1 本から、①LLM への出力形式の指定 ②実行時の検証
③TypeScript の型 をすべて導出している。

## セットアップ

必要なもの：Node 20 以降、Android Studio、Android 10 以降の実機、Cloudflare アカウント、
Google AI（Gemini）の API キー。

```bash
npm install
npm test          # 回数→日付変換・要確認判定の単体テスト
npm run typecheck
```

### 中継 API（worker）

```bash
npx wrangler kv namespace create QUOTA          # 出力された id を wrangler.toml に書く
cp worker/.dev.vars.example worker/.dev.vars    # API キーを書く（コミットしない）
npm run worker:dev                              # http://localhost:8787
npx wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY   # デプロイ時
npm run worker:deploy
```

### アプリ（app）

`app/app.json` の `extra.apiBaseUrl` を、実機から届く Worker の URL に変える
（開発中は PC の LAN アドレス、例 `http://192.168.x.x:8787`）。
`extra.revenueCatAndroidKey` に RevenueCat の Test Store API キーを入れる。

```bash
cd app
npx expo run:android    # 開発ビルドを実機にインストール（Expo Go では課金が動かない）
```

## 課金（RevenueCat）

| プラン | 価格 | 内容 |
| --- | --- | --- |
| 無料 | 0 円 | 1 学期あたり 3 科目まで |
| 月額 | 300 円/月 | 科目数無制限、課題チェックリスト、ウィジェット |
| 学期パス | 800 円/6 か月 | 月額と同じ内容。学期単位で割安 |

学生の生活は学期単位なので、課金の単位も「読み込み回数」ではなく「科目」にし、
学期に合わせた学期パスを主軸に置いている。Entitlement は `pro` の 1 本。

審査用に **Test Store** で動かしている。本番では Google Play のキーに切り替える。

## 分かっていて割り切っていること

- 端末 ID も購入状態（`pro`）もクライアントの自己申告で、偽装できる。実質の防衛線は
  LLM 側の予算上限、Cloudflare のレート制限、リクエストサイズの上限に置いている。
  購入状態のサーバー側検証（RevenueCat の Webhook / REST API との照合）は配布段階で入れる。
- 複数ページは最大 5 ページを 1 リクエストにまとめて送る。分割並列は `courses[]` の
  重複解決が必要になるため今回は採らない。
- 複数の書類から同じ科目名を読んだときの統合は、確認画面でユーザーが紐付ける。

## 今後の構想

学年暦の読み込みによる学期設定の自動化、端末上の OCR、iOS 版、
保護者向け（学校プリント・行事予定表）、資格試験、自治体のゴミ収集カレンダー。

## ライセンス

MIT（[LICENSE](./LICENSE)）
