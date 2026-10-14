# 映像素材の自動候補検索（試作）

Wikimedia Commonsの画像候補をシーンの検索語ごとに取得し、出典・著作者・ライセンス候補情報を確認できるJSONにまとめる。

```sh
node studio/assets/commons-assets.mjs studio/evaluation/sample-ja-story.json candidates.json
```

APIキーは不要。**画像のダウンロード、採用、合成はまだ行わない**。検索結果には常に未承認の印を付ける。

## 品質優先の採用条件

画像の名前と検索語が一致していても、台本との意味一致を保証しない。Commonsのライセンス表示も、著作権や被写体の肖像・商標利用許可を保証するものではない。

- 出典URL・画像URL・ライセンス情報を候補データへ保存する。
- CC0、CC BY、CC BY-SA、Public domain等は「人が利用条件を確認する候補」に分類し、即時の利用許可とは扱わない。
- `validateApprovedPicks` は、出典と画像URLの一致、権利確認、ナレーションとの視覚的一致、人的な採用承認、著作者表示と確認記録がない場合に失敗する。
- 人間が画像を見たか・実際に権利があるかを自動認定する機能ではない。
- 架空のロボット等、適切な実写写真がない題材では無関係な素材を選ばず、今後のオリジナル画像生成を利用する。

## 検証状態

Node.js標準機能のみで実装したため追加パッケージ・有料AI API不要。オフラインモックによる自動テストを付属。Commonsのネットワーク接続、レート制限、検索結果の品質は環境で異なるため別途実機確認が必要。

未実装：Electronの確認画面、画像ダウンロード、完成映像への自動配置、画像モデルによる視覚的意味一致検証。

公式資料：[MediaWikiのファイル情報API](https://www.mediawiki.org/wiki/API:Imageinfo) / [Wikimediaファイル単位のライセンス](https://attribution.wikimedia.org/attribution-signals/license.html)。
