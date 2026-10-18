# Shorts Studio（段階的な増設）

## 2026-10-18：Windowsデスクトップアプリ化（Electron）

- [Windows Electron版](desktop/README.md) を増設。既存チャット編集画面を独立ウィンドウとして開き、内部Nodeサーバーを自動起動・単一起動制御・権限制限を設定。ブラウザ画面とproject.json正本は共有し、既存保存先 `D:\AI\shorts-studio-projects` を維持。
- `cd studio; npm run desktop` で開発起動。実機ではパッケージ化した `Shorts Studio.exe` の直接起動、会話編集と保存、英語音声付きH.264/AAC技術MP4の出力を検証。配布用のポータブルEXEとWindowsインストーラーは `npm run desktop:build` で生成。
- 動画処理に必要なFFmpeg/FFprobeはWindowsビルドへ同梱。Electron独自キャッシュはD:\AI側に置き、プロジェクト保存データと分離。英語TTSのみ外部ネットワーク・Python環境と未検証の商用条件が残る。完成動画の公開品質検証は今後。



## 2026-10-18：英語キャラクター別TTSの追加

- 編集画面のMP4技術書き出しに、オプションで話者別の英語音声（Edge TTS、外部ネットワーク利用）を合成できるようにした。実際の音声長を計測し、吹き出し表示時刻と同期し、重なりは拒否する。映像720×1280/H.264、音声AAC。従来の無音書き出しも選択可能。
- 利用時に会話テキストが外部サービスへ送られる。**商用利用条件は未確認**なので自動的な公開承認は行わない。Pythonの既存`studio/voice/requirements.txt`でセットアップし、`SHORTS_PYTHON`でPythonを指定する。詳細は [editor/README.md](editor/README.md) を参照。

## 2026-10-18：チャット動画のMP4技術書き出し

- `studio/editor/` の既存チャットDOM/CSSをChromeでシーンごとに描画して、FFmpegで連続再生の背景MP4と合成する「MP4プレビューを書き出す」操作を実装。720×1280 / 30fps、表示時刻に合うH.264動画をローカル保存しダウンロードできる。
- 音声なし。権利確認の明示チェック、二重レンダリング拒否、編集後の旧MP4失効、FFprobeの技術確認とsha256レポートを導入。**音声入りの公開用MP4は未実装・未承認**。詳細は [editor/README.md](editor/README.md)。

## 2026-10-18：チャット動画の制作エディター基盤

- [ローカルChat Editor](editor/README.md) を追加。新規プロジェクト、英語チャット台本の編集、表示秒設定、縦9:16のブラウザプレビュー、64MiB以下MP4背景の保存・再生、JSON自動保存/読込に対応。
- `cd studio; npm run start:editor` で `127.0.0.1` のローカルURLを表示。編集データの標準保存先は `D:\AI\shorts-studio-projects`。Node標準機能のみ使用し、追加API料金なし。
- これは編集・保存の基盤であり、**音声生成や最終動画のMP4書き出しは未実装**。従来の日本語TTS・静止画動画生成CLIは引き続き独立して利用可能。
- 30秒固定の日本語ストーリー試験から、今後は英語チャットコメディ（25〜40秒中心）へ制作目標を更新。ただし作品としての面白さと海外優位性は今後の公開データで検証する。


`shorts-research-lab` の分析で得た構成原理を活用し、**量より品質**を優先してShortsを制作するための独立領域です。

## テーマからローカルAIで初稿を作る（2026-10-15）

- [PR #12](https://github.com/EliteMay/shorts-research-lab/pull/12)：日本語のテーマ1つから、LM Studio等のローカルLLMで**未承認の台本・絵コンテ・制作スクリプト**を生成するCLIを追加。
- [起動方法](generation/README.md)：`node studio/generation/generate.mjs --topic "鍵をなくしたロボット" --out "D:\\AI\\experiments\\shorts-draft-01" --mode fiction`。外部の有料AI APIは利用せず、127.0.0.1のOpenAI互換ローカルサーバーだけを使用。
- 台本の構造・フック/進展/結末・4〜8シーン、仮の編集尺、映像候補の検索語/生成指示、事実主張を検査。既存の `storyboard.json` 品質ゲートと `voice/edge_sync.py`/`assets/commons-assets.mjs` 向け `production-script.json` を同時出力。
- 事実の出典URL・権利・台本承認はローカルモデルが自称しても信頼しない。台本/映像素材/ソースは人が実際に確認するまで**全部未承認**。
- [GitHub CI](https://github.com/EliteMay/shorts-research-lab/actions/runs/38676353921)：49件のNodeテスト成功。模擬のローカルHTTP LLMを使ってCLI→JSONファイルの実作成まで検証。**実LM Studioの台本品質は家PCがオフラインで未検証**、AI映像生成や完成MP4への一貫した実運用も未実装。

## 現在動くもの

台本・絵コンテの品質ゲートに加えて、**日本語字幕の単語途中分割や台本との不一致を検知する品質ゲート**を実装しています。 [字幕の品質改善記録](CAPTION_QUALITY.md) で原理と未検証点を説明しています。**自由テーマからの高品質なAI映像生成、Electron UI、素材の自動選定・完成品質確認はまだ未実装**です。台本・絵コンテのローカルAI初稿生成はCLIとして実装済み。確認済み素材の取得とプレビュー生成処理は実装済み。日本語音声の生成と素材候補の取得、字幕付きMP4の技術試作は別工程として動いています。

```sh
cd studio
npm test
npm run check:example
npm run check:ready  # 未確認の素材があるため失敗するのが正しい
```

依存パッケージは不要で Node.js 22+ だけでテストできます。

## 2026-10-15：ブラウザ操作検証と自然な日本語字幕

- [PR #11](https://github.com/EliteMay/shorts-research-lab/pull/11)：Chromiumの実ブラウザテストで初期非表示UIの表示バグを発見・修正。候補JSON読込、2場面レビュー、未承認時のダウンロード禁止、確認記録の出力、モバイル表示、不正JSON拒否が [CI](https://github.com/EliteMay/shorts-research-lab/actions/runs/38617473897) で成功。テスト画像は合成素材で、実画像の許諾ではない。
- [PR #8](https://github.com/EliteMay/shorts-research-lab/pull/8)：BudouXの自然な日本語区切りとEdge TTSの実WordBoundary時刻が両方一致する位置で字幕を生成。自然に区切れなければ失敗として止める。[実日本語音声CI](https://github.com/EliteMay/shorts-research-lab/actions/runs/38618134661)で27.776秒・5シーン・15字幕区間を確認。依存はstudio/voice/requirements.txtで固定。
- 以前のオリジナルイラスト5枚と改善音声・字幕から、27.776秒・720×1280・H.264/AACの技術MP4を再生成。映像は固定題材で、作品としての最終品質審査や自由テーマの全自動制作は未達。

## 日本語ナレーションと字幕の同時生成（実験）
- [実装と実測](voice/README.md)：外部のEdge TTSサービスが返す単語境界から字幕表示時刻を作る。日本語台本と境界が一致しない場合は失敗とする。
- [PR #6](https://github.com/EliteMay/shorts-research-lab/pull/6)をmainへ統合し、実音声27.776秒・5シーン・字幕15件から字幕付きMP4（720×1280、H.264/AAC）を技術プレビューとして出力できた。
- 使用した映像は**以前手作業で制作したオリジナルイラスト**。自由なテーマから絵を自動検索・生成する機能や、任意の文章における字幕の自然さを保証する機能は未実装。映像の人手による最後までの視聴・公開品質審査も未完了。
- この仕組みは現段階では**外部音声合成サービスが必要**であり、完全ローカル・オフライン生成ではない。有料AI APIは使用していない。

## シーン別の画像候補検索（実APIで検証済み）

- [素材候補検索の説明](assets/README.md)：Wikimedia Commonsから、検索語・出典・作者・ライセンス表示をキー不要で取得する。
- [PR #7](https://github.com/EliteMay/shorts-research-lab/pull/7) で候補検索・採用前の権利／映像一致確認ゲートと8件の自動テストを導入。
- [実APIテスト](https://github.com/EliteMay/shorts-research-lab/actions/runs/38609338730)：`sleeping cat` で写真4候補とCC BY / CC BY-SAの表示を取得。**画像の採用は全件未承認**で、内容の意味一致と実使用可能性は未確認。
- 自由な題材の「画像生成」や「全自動選定」ではなく、現段階は検索候補の自動収集まで。未確認素材を勝手に映像へ採用しない。

## 素材採用の記録から字幕付きMP4へ接続

- [PR #9](https://github.com/EliteMay/shorts-research-lab/pull/9) で、画像検索後の人間の確認記録を必須にした素材取得・正規化・ハッシュ固定と、音声・字幕付きレンダリングを連結した。
- [使い方](assets/REVIEWED_PIPELINE.md)：`stage-reviewed.mjs` で画像を720×1280へ正規化して保存、`render_reviewed.py` で台本・WordBoundary・画像SHAを再検査して技術MP4を出力する。
- [E2E](https://github.com/EliteMay/shorts-research-lab/actions/runs/38612038828)：Node.js 28件、Python 17件、合成画像2枚・合成音から2.417秒、720×1280、H.264/AACの動画出力に成功。**これは実際の日本語ナレーションでも実Commons画像でもない技術テスト**。
- すべての出力で`qualityApproved:false`。画像と台詞の意味一致・権利確認・公開できる品質は自動的には判定できない。
- 未実装：採用を確認するUI、画像素材の適合性を判定するAI、テーマから台本・絵コンテ・画像まで作る全自動エンジン。

## シーン別の画像を比較・承認する画面

- [素材レビュー画面](review/README.md) を追加。[PR #10](https://github.com/EliteMay/shorts-research-lab/pull/10) をmainへマージ。Windowsなどで `node studio/review/serve.mjs` を実行し、表示されたローカルURLを開いて `candidates.json` を読み込む。
- 各場面で画像とナレーション、作者・ライセンス・出典を見比べ、確認が済んだ候補だけを `review.json` に保存。素材の権利と意味一致は**人の確認が必要**で、自動で合法・適切と認定しない。
- [GitHub Actions](https://github.com/EliteMay/shorts-research-lab/actions/runs/38614615052)で既存テストを含むNode.js **37/37件成功**。ローカルサーバーの配信経路のHTTPテストも成功。**ブラウザUIの操作・見た目E2Eは未実施**。
- テーマから自動的に素材を決めるAI、実Commons画像の権利確認、Electron統合、レビューの途中保存はまだ未実装。

## 実行済みの限定レンダリング検証

- [動画エンジン比較記録](ENGINE_COMPARISON.md)（実フレーム、字幕、処理時間、未検証を記載）
- `studio/evaluation/` に固定日本語台本とPurffleShortsの再現テストを保存。GitHub Actionsの手動実行で追加の有料APIなしにMP4の書き出し検証が可能。
- 検証の結果、約30秒の日本語音声付きMP4は生成できた。一方、映像はグラデーション背景で台詞に合わず、字幕分割も不自然なため**公開品質では不合格**。
- このテストは外部OSSを一時取得するベンチマークであり、**Studioアプリの動画生成機能を実装したわけではない**。
- 字幕の再分割と場面別オリジナルイラストを使う独立試作では、27.667秒/720×1280の音声付きMP4を生成。映像と台詞の対応が目視で改善。ただし**固定題材・手作業での演出**で、音声同期の最終確認やテーマ自由のAI生成は未実装。詳細は [字幕・映像改善の実験記録](CAPTION_QUALITY.md)。

## 品質ゲートの意味

- `check:example`：構造、シーンの時間、目的、台詞、視覚的意図、事実主張を検査。素材未選定は警告する。
- `check:ready`：素材・権利・台詞と映像の一致・台本の人的確認が完了したか検査。未確認なら失敗する。
- `src/japanese-caption-gate.mjs`：日本語字幕の語境界・台本文字列の一致・表示時間・行長を検査。`npm test`で7件の回帰テストを含む。音声を聴かずに同期精度を保証するものではない。
- このチェックは **動画の面白さ・事実の真偽・実際の映像との一致を自動的に認定しません**。人間の確認結果が入力されたかと、時間などの機械的な矛盾だけを検出します。
- 映像生成APIや有料サービスは、この段階では使用しません。

## 今後の順序

1. 同一テーマでPurffleShortsとOpenReelsをローカル実機比較し、無料構成の品質・日本語音声・素材一致・所要時間を測る。
2. 結果から再利用する生成エンジンを選定。研究 `docs/PRODUCTION_CHECKLIST.md` に基づく人のレビューを残す。
3. 品質基準を満たした制作機能に、ElectronのUIとシーン単位の修正機能を追加。
4. FFprobeで実際のMP4の寸法・時間・音声トラックを検査し、画面全体の視聴レビューを行う。自動投稿は当面実装しない。

大容量素材・モデル・動画はGitへ追加せず、利用者が管理するローカルフォルダに保存します。外部サービスの認証情報はRepositoryへ入れません。
