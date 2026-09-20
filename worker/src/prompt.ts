/** LLM へのプロンプト（仕様書 4.1 / 4.2） */
import type { ExtractRequestMeta } from "@syllabus/shared";

export function buildPrompt(meta: ExtractRequestMeta): string {
  return `あなたは大学のシラバス・課題一覧・時間割を読み取る抽出器です。
添付された書類の画像・PDF から、科目と予定（授業・課題の締切・試験）を読み取り、JSON で返してください。

# 前提
- 今日の日付: ${meta.today}
- 学期: ${meta.semester.start} 〜 ${meta.semester.end}
- 年が書かれていない日付は、上の学期の範囲に収まるように年を補ってください。

# 守ること
- date_raw には、書類に書かれていた日付の表記を**そのまま**写してください（例: "10/20（火）"、"第8回"ではなく日付の表記）。
  書かれていない場合は null にしてください。**推測した日付を date_raw に書いてはいけません。**
- date は date_raw を YYYY-MM-DD に正規化したものです。確定できなければ null にしてください。
- date_basis は、日付が書類に明記されていれば "explicit"、他の記述から推測したなら "inferred"、
  「第8回」のように回数しか書かれていなければ "session_only" にしてください。
- date と session_number は、**どちらか一方が必ず埋まっている**必要があります。両方 null は禁止です。
- session_number は「第n回」の n です。日付への変換はアプリ側で行うので、あなたは変換しないでください。
- source_text には、その予定の根拠となった書類上の一文をそのまま入れてください。
- page は、その記述があったページ番号（1 始まり）です。
- course_index は courses 配列の添字です。範囲外の値を使わないでください。
- 書類に複数の科目が載っている場合は、courses に全て並べてください。1 科目だけなら配列の長さは 1 です。
- 授業の毎回の予定（第1回〜第15回の各回の内容）は、試験・課題の締切・重要な回でなければ events に入れないでください。
- 読み取れないものを創作しないでください。予定が見つからなければ events は空配列にしてください。`;
}

/** 修復リトライ（4.5）：何が問題だったかを文章で渡してやり直させる */
export function buildRepairPrompt(errors: string[]): string {
  return `前回の出力に問題がありました：
${errors.map((e) => `- ${e}`).join("\n")}
上記を修正して、JSON 全体を出力し直してください。`;
}
