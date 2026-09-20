/**
 * 送信前の画像の縮小（仕様書 4.1・4.7 の用途 2）
 *
 * アプリ（app/lib/extract.ts の shrink）と同じ結果になるようにする。
 * ここだけ条件が違うと、eval で決めた長辺が本番で再現しない。
 *   - 長辺を longEdge に合わせる（縦長・横長のどちらでも）
 *   - 元より大きくはしない
 *   - JPEG・品質 80 で出す（アプリは expo-image-manipulator の compress: 0.8）
 * PDF は縮小せずそのまま送る。
 */
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import type { AcceptedMime } from "@syllabus/shared";
import type { CasePage } from "./cases";

export type PreparedPage = {
  data: Uint8Array;
  mediaType: AcceptedMime;
  bytes: number;
};

export async function preparePage(page: CasePage, longEdge: number): Promise<PreparedPage> {
  const input = await readFile(page.file);

  if (page.mediaType === "application/pdf") {
    return { data: new Uint8Array(input), mediaType: "application/pdf", bytes: input.byteLength };
  }

  const data = await sharp(input)
    .rotate() // Exif の向きを画素に反映させてから測る。これを忘れると長辺を取り違える
    .resize({
      width: longEdge,
      height: longEdge,
      fit: "inside", // 縦横比を保ったまま longEdge×longEdge に収める＝長辺が longEdge になる
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer();

  return { data: new Uint8Array(data), mediaType: "image/jpeg", bytes: data.byteLength };
}

export function preparePages(pages: CasePage[], longEdge: number): Promise<PreparedPage[]> {
  return Promise.all(pages.map((p) => preparePage(p, longEdge)));
}
