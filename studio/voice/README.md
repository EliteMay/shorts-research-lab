# 日本語音声と字幕の同時生成（試験実装）

目的は「字幕を文字数で均等に並べる」のではなく、実際に音声生成サービスが返す単語境界情報から字幕の時刻を作ること。

## 実行方法

Python 3.11+、ffmpeg/ffprobe、`edge-tts==7.3.1` が必要。これはローカルLLMではなく、**ネットワーク接続を使う外部音声合成サービス**で、可用性・利用条件の確認が必要。有料APIキーは要求しないが、完全オフラインではない。

```sh
python -m pip install edge-tts==7.3.1
python studio/voice/edge_sync.py --script studio/evaluation/sample-ja-story.json --out voice-output
python -m unittest discover -s studio/voice -p "test_*.py" -v
```

出力：
- `voice.wav` — 5シーン分を結合した日本語ナレーション
- `timing.json` — TTS単語境界を使った字幕表示時刻、各シーンの開始・終了

外部サービスが単語境界を返さない、台本と内容が一致しない、不正な時刻を返す場合は**失敗扱い**。代替の推測時刻では黙ってレンダリングしない。

## 実測

2026-10-15、GitHub Actionsの隔離したUbuntu/Python 3.11環境で確認：
- CI [初回成功](https://github.com/EliteMay/shorts-research-lab/actions/runs/38605851865)：音声27.776秒、シーン5件、字幕15件
- この時点で日本語の最終音節「た。」だけの字幕が見つかったため、字幕グルーピングを全文から最適化する処理に変更。
- 修正後の [検証](https://github.com/EliteMay/shorts-research-lab/actions/runs/38606297807)：音声27.776秒、字幕15件、孤立した「た。」は解消。
- ただし「かかっ／て」「照れくさ／そう」などの不自然な活用語境界は残っており、**字幕品質の完成扱いにはしない**。

これらはユーザーに費用が発生する有料AI APIを使わずに実施。GitHub Actionsの一般的な利用枠・サービスの条件は別に適用される。

## 残課題

1. 助動詞・活用形・字幕行の自然な結合を改善し、意図した語境界で字幕をまとめる。
2. 実動画を最後まで試聴し、字幕時刻と音声の一致を確認。
3. 題材に合った画像素材の自動候補取得・権利確認・人による最終採用、MP4編集工程へ接続。
4. 本番では素材の著作権と事実主張の検証が必須。音声タイミングテスト合格だけで完成品とはしない。

`studio/voice/edge_sync.py` は今回の音声側の試験的アダプターで、Electron本体は未実装。
## ローカルの画像と音声からMP4プレビュー

`render_local_preview.py` は、`timing.json` と `voice.wav`、シーンごとの手元の `scene-1.png` ... `scene-N.png` を結合し、日本語字幕を描画した技術確認用MP4を生成する。画像の自動検索や自動生成は**しない**。素材の権利・映像適合性を各自で事前確認する。

```sh
python studio/voice/render_local_preview.py \
  --script studio/evaluation/sample-ja-story.json \
  --timing voice-output/timing.json \
  --audio voice-output/voice.wav \
  --images /path/to/your/approved-images \
  --out /path/to/preview
```

`preview.mp4` と `render-report.json` を出力する。`qualityApproved: false` は設計上の固定値で、動画出力の成功を作品完成と混同させない。現時点のFFmpegレンダリングはLinuxのGitHub Actions環境とローカル実験環境で検証済み。Windowsで同じコマンドを実行したことはまだない。

2026-10-15の追加試作では、以前作成したロボットのオリジナルイラスト5枚と今回のWordBoundaryによるナレーション・字幕を使い、**27.776秒・720×1280、H.264/AACのMP4を実際に出力**した。字幕には一部不自然な活用語区切りがあるため、公開品質には未達。自由なテーマ→画像→動画の全自動制作はまだ未実装。
