# Shorts Studio 素材レビュー画面（初期版）

Wikimedia Commonsの検索候補を**シーンごとに見比べ、出典・ライセンス・映像の意味を確認して採用する**ためのローカルWeb画面。Electron統合前の試作で、既存研究を変更しない。

## 起動（Windows / Node.js 22+）

Repositoryルートから実行：

```sh
node studio/review/serve.mjs
```

表示された `http://127.0.0.1:xxxxx` をPCのブラウザで開く。専用サーバーは**ループバックのみ**で待ち受け、画面表示に必要な5ファイル以外は配信しない。外部サーバーにレビュー記録はアップロードされない。終了はターミナルでCtrl+C。

### 候補を用意

```sh
node studio/assets/commons-assets.mjs studio/assets/examples/sleeping-cat.json candidates.json
```

Commonsの検索はネット接続を使う。画像候補の実物・作者とライセンスは変わり得る。初期サンプルは1シーンだけなので、まずUIの動作確認に利用できる（**候補の権利承認をしたことにはならない**）。

1. `candidates.json` を画面から読み込む。画像候補とナレーションが表示される。
2. Commonsの出典ページで画像を見て、著作者・ライセンス全文・改変/商用利用の条件・クレジット・被写体の権利を確認する。
3. 画像を選んで、権利条件、内容一致、採用承認のチェックを**実際に確認できた場合だけ**入れる。利用条件の確認メモ・日付とクレジットも入力。
4. 全シーンの確認が完了すると `review.json` をダウンロードできる。未確認の場合はボタンが無効。

```sh
node studio/assets/stage-reviewed.mjs candidates.json review.json staged-images
```

上記が作成した `reviewed-assets.json` を、その後の `studio/voice/render_reviewed.py` がSHA-256を再検証してMP4の技術プレビューを出力する。

## 安全と制限

- UIは外部HTMLを描画せず、出典リンクの配信元をCommons、画像URLの配信元をWikimediaに制限。CSPで外部スクリプト・ネットワークAPIの呼び出しを制限。
- 画像プレビュー時には画像配信サーバー（Wikimedia）への接続が必要。JSON自体をサーバーへ送信しない。
- 利用条件のチェックは**人間の自己申告記録**。AIが著作権・肖像権・内容一致を認定した証拠ではない。
- 一件でも権利や内容が不明なら、画像を無理に採用しない。検索し直すか自分で作ったオリジナル素材を検討する。
- 既存の `stage-reviewed.mjs` と形式を合わせているが、外部素材を採用・ダウンロードする本番の通し試験はまだ実施していない。
- ブラウザでの操作・見た目の実機確認は継続項目。ロジックのNode単体テストとローカルWebサーバーのHTTPスモークテストを用意。
- 再読み込みすると未出力のチェック内容は消える。ドラフトの保存・再開、Electron UIへの統合は未実装。
- テーマ入力からの自動映像選定や作品としての品質評価はまだ実装していない。

## テスト

```sh
cd studio
npm test
```
