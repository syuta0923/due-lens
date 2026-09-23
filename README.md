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
├─ app/         … Expo（React Native / TypeScript）Android アプリ
│  ├─ app/        … 画面（Expo Router）
│  ├─ components/ … Material Design 3 の部品（Button / Card / TextField / ListItem）
│  ├─ lib/        … extract / calendar / purchases / device / theme
│  └─ store/      … Zustand ＋ AsyncStorage
├─ shared/   … アプリ・Worker・eval が共有する唯一の定義
│  └─ src/   … schema（AI 出力）/ api（HTTP 契約）/ schedule（回数→日付）/ review（要確認判定）
├─ worker/   … 中継 API（Cloudflare Workers）
└─ eval/     … 抽出精度の評価セット
```

`shared/src/schema.ts` の zod スキーマ 1 本から、①LLM への出力形式の指定 ②実行時の検証
③TypeScript の型 をすべて導出している。

## セットアップ

必要なもの：Node 20 以降、Android Studio、Android 10 以降の実機、Cloudflare アカウント、
OpenAI の API キー。

モデル ID を変えるだけでプロバイダが切り替わる（`worker/src/provider.ts`）。`gemini-*` なら
Google、それ以外は OpenAI を使い、`worker/wrangler.toml` の `MODEL` 1 行で差し替えられる。
既定を OpenAI にしているのは、開発者が 18 歳未満で、Gemini API の規約（18 歳以上、保護者の
同意による例外なし）を満たせないため。OpenAI は保護者の許可があれば 13 歳以上で利用できる。

```bash
npm install
npm test          # 回数→日付変換・要確認判定・evalの採点ロジックの単体テスト
npm run typecheck
```

### 抽出精度の評価（eval）

モデルと画像の縮小サイズを、勘ではなく正解つきのテストセットで決める。

```bash
npm run eval -- --dry-run                                  # APIキー不要の検算
npm run eval -- --model gpt-4o-mini --long-edge 1568
npm run eval -- --model gpt-4o-mini,gpt-4.1-mini --long-edge 1024,1568,2048
```

プロンプト・スキーマ・検証・修復リトライは `worker/src` をそのまま使うので、
ここで選んだ条件が本番と一致する。詳しくは [eval/README.md](./eval/README.md)。
評価ケース（自分の大学のシラバス）は公開リポジトリに含めていない。

### 中継 API（worker）

**キーを作る前に、OpenAI 側で使用量の上限と請求アラートを設定し、自動チャージ
（auto-recharge）をオフにする**（防衛線 1）。OpenAI は前払いなので、自動チャージが有効だと
「残高が尽きれば止まる」という一番確実な歯止めが消える。

ローカル開発に **Cloudflare のアカウントは要らない**。`wrangler dev` は PC の中で動き、
KV もローカルのものが使われる（`wrangler.toml` の id はプレースホルダのままでよい）。

```bash
cp worker/.dev.vars.example worker/.dev.vars    # API キーを書く（コミットしない）
npm run worker:dev                              # http://localhost:8787
curl http://localhost:8787/health               # 設定が揃ったかの確認（下記）
```

デプロイするときだけアカウントと KV が要る。応募には必須ではない。

```bash
npx wrangler login
npx wrangler kv namespace create QUOTA          # 出力された id を wrangler.toml に書く
npx wrangler secret put OPENAI_API_KEY          # ファイルではなくシークレットに置く
npm run worker:deploy
```

`/health` はキーと KV が揃っているかを返す（キーの値は返さない）。
`ok: true` になるまで `/extract` は通らない。

```json
{ "ok": true, "model": "gpt-4o-mini", "provider": "openai",
  "apiKey": { "name": "OPENAI_API_KEY", "present": true }, "kv": true }
```

- **`.dev.vars` を置いてから `worker:dev` を起動する。** 起動中に作っても読み込まれず、
  `present: false` のままになる（一度止めて起動し直す）。
- ローカルの `kv` は常に `true`（wrangler が用意するローカル KV を見ているため）。
  `wrangler.toml` の id が正しいかは、デプロイ後の `/health` で確かめる。

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

### 中継 API は偽装できる

`ExtractRequestMeta` の `deviceId` と `pro` はクライアントが送る値で、サーバーは検証していない。
リポジトリが公開なので、抜け道も読めば分かる。隠さずに書いておく。

| 抜け道 | 内容 | 現状 |
| --- | --- | --- |
| `pro: true` を送る | 無料枠の判定を飛ばせる | `PRO_HARD_LIMIT`（200 科目／端末・学期）で頭打ちにした |
| `deviceId` を変える | KV のキーが変わり、枠が新品に戻る | **未対策**（Play Integrity が本来の答え） |

防衛線は効く順にこの 4 つ。**1 が唯一の絶対的な歯止め**で、デプロイより先に設定する。

1. **LLM 側の予算上限・使用量アラート**（月 1,000 円など）。他が全部破られても請求は止まる
2. **購入状態のサーバー側検証**（RevenueCat の Webhook / REST API と照合）。配布段階で入れる
3. **端末の正当性証明**（Play Integrity API）。`deviceId` 偽装への根本対策だが実装が重い
4. **レート制限とサイズ上限**（IP 単位 1 分 6 回、5 ページ、12 MB）

`pro` も KV に加算するようにしてあるので、騙られた場合も使用量が記録に残り、
`pro_hard_limit` のログで検知できる。レート制限の KV は結果整合なので、
同時リクエストでは上限をわずかに超えうる（暴走を止める目的には足りる）。

### 開発中は送った書類が OpenAI のモデル改善に使われる

中継 API は画像・PDF を保存しない。ただし**「保存しない」のはこのリポジトリのコードの話で、
LLM 側の扱いは別**なので、そこも書いておく。

開発中は OpenAI のデータ共有を有効にしている。送信内容がモデル改善に使われる代わりに、
小型モデルなら 1 日 250 万トークンまで無料で使える。eval の総当たりを何度も回すため、
この枠を使っている。

**そのため、通すのは自分のシラバスだけに限っている。**他人の書類を扱う前と、実際に配布する
段階では、共有を無効にして有料枠（送信内容が学習に使われない枠）に切り替える（仕様書 7.4・7.5）。

評価ケースを公開リポジトリに入れていない理由（担当教員名などの個人情報）と、同じ線引きで判断している。

### その他
- 複数ページは最大 5 ページを 1 リクエストにまとめて送る。分割並列は `courses[]` の
  重複解決が必要になるため今回は採らない。
- 複数の書類から同じ科目名を読んだときの統合は、確認画面でユーザーが紐付ける。
- 応募には Cloudflare へのデプロイは要らない（配布しない部門のため）。`wrangler dev` は
  アカウント無しで動き、実機からは同一 Wi-Fi の LAN アドレスで届く。

## 今後の構想

学年暦の読み込みによる学期設定の自動化、端末上の OCR、iOS 版、
保護者向け（学校プリント・行事予定表）、資格試験、自治体のゴミ収集カレンダー。

## ライセンス

MIT（[LICENSE](./LICENSE)）
