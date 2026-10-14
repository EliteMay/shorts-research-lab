# 採用確認済み素材をShortsへ接続する

目的：すでに実装したCommons素材検索と、日本語音声・字幕付きFFmpegプレビューを、安全な「素材確認」工程を挟んでつなげる。

## 操作の順序

1. `node studio/assets/commons-assets.mjs storyboard.json candidates.json` でシーン別の画像候補を取得する。候補は**すべて未承認**。
2. 候補の実物・著作者・ライセンス全文・用途に合うかを人が確認し、`review.json` にシーン単位の採用記録を作る。利用権利・表示義務・被写体の個別権利は最終的に利用者側で確認する。
3. 次のコマンドで素材をダウンロードして720×1280のPNGに変換する。URLの配信元はWikimedia Commonsに限定し、外部へのリダイレクトを拒否する。上限は1画像12MiB。画像はSHA-256ハッシュ付きで記録され、出力先が既に存在したら上書きしない。

```sh
node studio/assets/stage-reviewed.mjs candidates.json review.json staged-images
```

4. ナレーション音声とWordBoundaryを含む `voice.wav` / `timing.json` を用意して、次のコマンドでテスト用MP4を出力。

```sh
python studio/voice/render_reviewed.py \
  --script storyboard.json \
  --timing voice-output/timing.json \
  --images staged-images \
  --audio voice-output/voice.wav \
  --out technical-preview
```

`reviewed-assets.json` と実画像のSHA-256が一致しない場合は出力を拒否する。出力物には `provenance.json`（著作者・ライセンス・出典）と `render-report.json` を保存する。

## レビュー記録の書式

`review.json` は各シーンに対して、以下の情報を持つ配列。

```json
[
  {
    "sceneIndex": 0,
    "sourcePage": "https://commons.wikimedia.org/wiki/File:EXAMPLE.png",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/EXAMPLE.png",
    "rightsReviewed": false,
    "visualMatchesNarration": false,
    "humanApproved": false,
    "credit": "",
    "licenseSnapshot": "",
    "reviewNotes": ""
  }
]
```

これは**書式の例**で、実際の画像URLではない。単にフラグをtrueに書き換えただけでは本当の使用許可にならない。AIも著作権や絵の意味一致を自動証明したとは主張しない。

## テストと証拠

- `npm test`：採用条件、URLの配信元、ダウンロードの最大サイズ、不正な画像形式、既存フォルダ保護、素材のSHAを検査。
- `python -m unittest discover -s studio/voice -p 'test_*.py' -v`：変更された画像・未承認・時刻と台本の不一致を拒否。
- `node studio/evaluation/reviewed-smoke.mjs`：**自作の単色画像2枚と合成音**だけで、素材ステージングから動画書き出しまでの結合テスト。実際のCommons画像や日本語音声を使う品質テストではない。

安全境界：画像ダウンロードはレビュー記録が正しい場合に限る。トラッキングなどの余計なURLを使い回さず、利用許可が不明な素材は採用しない。APIキーや外部有料AI APIは必要ない。

**未実装**：視覚的に画像を確認するUI、画像の意味一致の自動判定、素材の権利状態の自動認定、完成動画の公開品質判定、ユーザーがテーマだけを入れて終わる一括パイプライン。動画を出せても `qualityApproved:false` のまま。
