# テーマから日本語Shortsの初稿を生成（品質優先MVP）

## できること

**テーマ1つ**から、PC内のLM StudioなどOpenAI互換ローカルLLMへ問い合わせ、次のファイルを1回につき1セット作成する。ファイルは必ず**未承認の下書き**であり、動画の自動投稿や映像の自動採用は行わない。

- `storyboard.json`：Studioの既存品質ゲート `src/quality-check.mjs` と同じ形式。4〜8シーンに仮の時間を割り当てる。
- `production-script.json`：既存の `voice/edge_sync.py` と `assets/commons-assets.mjs` に入力できる台本。各シーンにナレーション・素材検索語・画像生成案を持つ。
- `generation-report.json`：ローカルモデル名、検査結果、未確認の事実主張件数、未承認フラグ、仮の尺であることを記録。

## Windowsで試す

Node.js 22以上とLM Studioが必要。LM StudioのDeveloper画面でモデルをロードし、ローカルサーバーをONにする。既定ポートは1234。

リポジトリのルートからPowerShellで実行：

```powershell
node studio/generation/generate.mjs --topic "鍵をなくしたロボット" --out "D:\AI\experiments\shorts-draft-01" --mode fiction
```

事実解説の題材：

```powershell
node studio/generation/generate.mjs --topic "猫がゴロゴロ喉を鳴らす理由" --out "D:\AI\experiments\cat-draft-01" --mode factual
```

`--mode` は省略可能。省略時はモデルが fiction（創作）と factual（事実解説）を選択するが、実際に正しく分類できる保証はない。事実が関係する動画はfactual指定を推奨。1つ以上のモデルが表示される場合は `--model "LM StudioのモデルID"` を指定。 `--port 1234` でローカルサーバーのポートだけ変更可能。

**データは127.0.0.1のローカルAPIにだけ送信**し、クラウドの有料AI APIを自動利用しない。モデルとPCの性能により生成時間や日本語品質は大きく変わる。過去のLM Studio環境ではJSONが壊れることがあったため、通常のchat completionsを使い、`response_format` を必須にせず、厳密JSONパースと最大2回の生成試行で安全側に止める。

### 検査と次の工程

```powershell
node studio/src/quality-check.mjs "D:\AI\experiments\shorts-draft-01\storyboard.json"
node studio/assets/commons-assets.mjs "D:\AI\experiments\shorts-draft-01\production-script.json" "D:\AI\experiments\shorts-draft-01\candidates.json"
```

素材レビュー後の `review.json`、画像の権利・出典、事実情報の根拠照合を人が確認してから、[素材→映像制作](../assets/REVIEWED_PIPELINE.md)へ。音声は [WordBoundaryアダプター](../voice/README.md)を使う。初稿のシーン時間は**文字数ベースの編集計画**で、実ナレーションを合成したあとの時刻が正本。ここで仮のシーン秒数を完成動画の尺だと断定しない。

## 品質と安全上の制約

- 台本に導入（フック）・進展・結末が必要。4〜8シーン、日本語のナレーション、視覚上の目的、Commons向け検索語、画像生成案をすべて持つ。
- 台本と音声・検索用スクリプトでナレーションの**文字列が一致**する。初稿は既存 `reviewStoryboard` で必ず構造確認。短すぎるカットは拒否。
- factual（事実解説）なら検証対象の主張を要求する。モデルが勝手に出した `sourceUrl` や `verified:true` をそのまま信用せず、主張は常に `sourceUrl:null, verified:false` に変換。正しい情報かどうかを自動認定する機能ではない。
- 素材は常に `planned`、権利は `pending`、台本承認は `false`。素材が見つからない場合に無関係な映像で穴埋めしない。
- ローカル通信以外はしない。Node.jsの追加パッケージ不要。古い出力フォルダは上書きせず、失敗時に既存ファイルを消さない。
- モデルの回答が形式不正または意味の薄いものなら最大1回だけ再生成。2回とも検査に通らなければ、未承認データとしても保存しない。
- 学習済みモデルが作るhookの面白さ、事実の正確さ、権利と映像の一致は**別に検査**する。合格点はモデルの自己申告では決めない。

## 現段階での証拠

- GitHub Actionsで、**模擬のローカルHTTP LLM**を使って `--topic` から実CLI起動 → ファイル3個生成 → 入力契約検証を実行。
- Modelレスポンスの不正JSON、再生成、複数モデル、事実主張の捏造URL、出力上書き・境界を単体テスト。
- **家PC上の本物のLM StudioによるAI企画生成、事実の情報源調査、AI画像生成、完成MP4制作の連続フローは未実施**。ローカルモデルで魅力的な企画が作れるか判断するには実際のモデル出力を見て評価する必要がある。

参照：[LM Studio OpenAI互換エンドポイント](https://lmstudio.ai/docs/developer/openai-compat)、[制作チェックリスト](../../docs/PRODUCTION_CHECKLIST.md)。
