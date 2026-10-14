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