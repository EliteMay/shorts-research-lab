## 2026-10-18：ブラウザチャット画面→動く背景つきMP4出力

- 既存の編集・保存を維持し、`studio/editor/render.mjs` でChromeの会話UIスクリーンショットをメッセージ時刻で撮影、FFmpeg concat + loopしたMP4背景で合成。720×1280/30fpsのH.264無音プレビューを生成。周期的な画面揺れは使用しない。
- ローカルWeb UIにボタン/使用権確認/処理状況/ダウンロードを接続。FFprobeで入力・出力の動画情報を検査、プロジェクトrevisionに基づく無効化・途中編集によるレンダリング拒否・同時レンダリング拒否。出力レポートにsha256・hasAudio:false・qualityApproved:falseを記録。
- Windows ChromeとFFmpeg実機で**12.000秒 / 720×1280 / 360フレーム**の実出力・ダウンロード、hash照合、音声stream不在、編集後の旧動画404、HTML画面の動作とエラー0件を検証。テスト用背景はFFmpeg生成素材で、実際の外部素材の権利確認ではない。
- 追加Dependencyは `playwright-core@1.56.1`（Chrome/Edgeは既存PCのものを使用）。有料動画APIは不要。未実装：英語TTS・声別音声mix・正確な音声字幕・チャット吹き出しの出現モーション・視聴品質の承認。既存PR #13の台本検証ブランチは独立。

## 2026-10-18：英語Chat Shortsの制作エディター基盤

- 英語チャットコメディを第一制作ジャンルとして、ChatGPTで台本検討→ローカルWebエディターで制作→実コンポジションで音声・動画化→品質検査→将来Electron化と段階分離。日本語30秒の既存実験は破壊せず保持。
- `studio/editor/` にNode標準HTTPサーバー+Chat UI、9:16 CSSプレビュー、秒数指定・再生/シーク、64MiB以下MP4取込、ローカル`project.json`保存、JSON台本入出力を実装。テキストは`textContent`、Origin/Host/CSP、スキーマ・時刻・revision衝突・安全なAsset Pathを検査。巨大依存なし。
- Windows家PCで既存テスト含むNode 56件PASS（競合保存の同時PUT検査を含む）。Chrome E2Eで新規作成→編集→自動保存/再読込→MP4取込→再読込→JSON入出力→390px画面の横溢れなし→JS例外なしを確認。
- 実画面で大量メッセージの表示切れを検出したため、同時表示の最新3件へ制限。コンポジションによるWYSIWYG / キャラクター音声 / 最終MP4書き出し / 著作権承認 / 一括生成は**未実装**。技術プレビューの正常動作と公開可能品質を混同しない。
- 今回の編集データはテスト用の一時保存ルート（端末実機）を使い、GitHubへ動画・素材は追加しない。詳細は [studio/editor/README.md](studio/editor/README.md)。

## 2026-10-15：テーマ→ローカルAI台本・絵コンテの初稿生成

- [PR #12](https://github.com/EliteMay/shorts-research-lab/pull/12) をmainへ統合。テーマを入力するとLM Studio等のOpenAI互換ローカルAPI（127.0.0.1のみ）で日本語30秒Shortsの台本・絵コンテ案を作る `studio/generation/` のCLIを追加した。
- 同じナレーションを持つ `storyboard.json`（Studioの既存品質ゲート）と `production-script.json`（TTS・Commons候補検索向け）を生成。推定場面時刻・出典の未照合・素材権利の未確認・台本未承認を `generation-report.json` に記録する。
- モデルのJSON形式が壊れた場合は最大2回まで再生成。事実のURL・検証済みフラグや映像の使用権限はモデルの発言を信用せず強制未確認。既存下書きは上書きせず、失敗時は保存しない。Node標準機能だけを使用し有料APIキー不要。
- [GitHub Actions](https://github.com/EliteMay/shorts-research-lab/actions/runs/38676353921)でNode 49/49成功。ローカル模擬HTTPサーバー経由のCLI本体起動→JSON3件生成まで実検証した。
- **ブロッカー**：家PCはオフラインで、ローカルLLM実モデルの日本語台本の出来・推論時間・JSON適合率は未測定。画像モデルからの自由テーマ映像自動生成と最終MP4/人間の品質レビューは未実装。AI下書きを完成品と扱わない。
- 操作と検証方法： [studio/generation/README.md](studio/generation/README.md)。次工程はLM Studioの実モデルで生成結果を採点し、映像素材の生成/レビュー導線へ接続。Issue #3継続。

## 2026-10-15：実ブラウザ検証とBudouX字幕をmainへ統合

- [PR #11](https://github.com/EliteMay/shorts-research-lab/pull/11) にて、Chromiumのブラウザ操作テストで発見した初期非表示のCSS不具合を修正。候補JSON読込から保存まで・モバイル表示・不正データ拒否を実操作で検証。[失敗run](https://github.com/EliteMay/shorts-research-lab/actions/runs/38617281326) と[修正後成功run](https://github.com/EliteMay/shorts-research-lab/actions/runs/38617473897) に証拠を保存。利用した画像は架空の合成画像で、実Commons画像の権利確認ではない。
- [PR #8](https://github.com/EliteMay/shorts-research-lab/pull/8)：BudouX 0.9.3の句境界とEdge TTSのWordBoundaryから自然な字幕区間を生成し、位置が両立しなければ失敗として止める。Python単体テストと[実日本語音声CI](https://github.com/EliteMay/shorts-research-lab/actions/runs/38618134661)が成功。27.776秒、5場面、15字幕区間。「かかっ／て」「照れ／くさそう」等が今回の台本で解消。
- 実音声と固定の独自イラスト5枚で27.776秒・720×1280・H.264/AACの検証MP4を再出力。字幕全文の一致とffprobeの技術検査成功。通し視聴・作品の魅力・テーマ自由の自動映像生成は未完了。
- [Issue #3](https://github.com/EliteMay/shorts-research-lab/issues/3)継続。追加の有料AI APIは使用していない。

## 2026-10-15：シーン別の素材レビュー画面／実ナレーション再レンダリング

- [PR #10](https://github.com/EliteMay/shorts-research-lab/pull/10) をmainへ統合。候補写真と台詞・作者・ライセンス情報を比較するローカルWeb UIを追加。確認済みの場合にのみ `review.json` を保存。3確認条件・クレジット・ライセンス確認記録を必須にする。
- ループバック専用のNodeサーバー、外部HTMLを描画しないテキスト表示、Wikimedia画像URLの制限、CSPを設定。外部パッケージ追加なし。
- [CI](https://github.com/EliteMay/shorts-research-lab/actions/runs/38614615052)でNode.js **37/37件成功**（モデル検証8件 + サーバースモーク1件を含む）。**ブラウザ画面の操作E2E・実際の画像を見ての利用条件確認は未実施**。
- 外部TTSで実生成した日本語ナレーションと以前コードで描いた独自イラスト5枚を合わせて、27.776秒 / 720×1280 / H.264映像 + AAC音声、16字幕区間の技術MP4を別途出力。原画は自作の固定題材で、Commons素材は未採用。未公開の技術プレビューであり作品品質の承認なし。
- [Draft PR #8](https://github.com/EliteMay/shorts-research-lab/pull/8)のPythonユニット＋実TTS検証は[Actions](https://github.com/EliteMay/shorts-research-lab/actions/runs/38615106148)で成功。「かかっ／て」等は改善したが、最終部分で「ロボットは照れ／くさそうに笑いました。」という新たな不自然な字幕切れが観察されるため、**品質優先で未マージを維持**。
- 主目標のテーマだけで高品質のShortsを1本完成は未達。[Issue #3](https://github.com/EliteMay/shorts-research-lab/issues/3)で続行。

## 2026-10-15：採用画像→音声・字幕・動画を安全に連結

- [PR #9](https://github.com/EliteMay/shorts-research-lab/pull/9) をmainへマージ。人間による利用条件・内容一致の確認記録がない画像は素材ステージング時点で拒否する。
- 許可されたCommons画像の直接配信URLに限って取得、HTTPリダイレクトを拒否し、12MiBの取得上限、JPEG/PNG/WebP判定、720×1280への変換、SHA-256固定、既存フォルダへの上書き禁止を実装。
- `render_reviewed.py` は、素材のSHAと確認記録、台本と字幕の一致を再検査してFFmpegへ渡す。作品品質の承認は自動で行わない。
- [結合テスト](https://github.com/EliteMay/shorts-research-lab/actions/runs/38612038828)：Node.js 28/28・Python 17/17成功。**自作の単色画像2枚と合成音**による2.417秒・720×1280・H.264/AACの技術MP4の出力・ffprobe確認に成功。
- **未実施**：実Commons素材の人間による採用と権利調査、実日本語TTSとの組合せでの通し視聴・試聴、検索結果の意味一致を評価するAI、テーマ自由のAI画像生成、Electron UI。公開品質は未達。[Issue #3](https://github.com/EliteMay/shorts-research-lab/issues/3)で継続。

## 2026-10-15：シーン別画像候補の自動検索（第1段階）

- Wikimedia Commons画像検索アダプター、候補の出典・著作者・ライセンス表示の保存、未承認画像を拒否する関数を実装。[PR #7](https://github.com/EliteMay/shorts-research-lab/pull/7)をmainに統合。
- [GitHub Actions実API検証](https://github.com/EliteMay/shorts-research-lab/actions/runs/38609338730)で`sleeping cat`から4候補の画像メタデータ（CC BY / CC BY-SA表示）を取得。APIキー不要。有料AI API追加費用なし。
- Node.js標準モックテスト8件と既存NodeテストがCI成功。4画像は全件未承認。ライセンス表示・候補名だけで実際の利用権利・映像と台詞の一致は認定しない。
- 既存の創作ロボット台本には実写素材が合うとは限らないため、適切な候補がないときは映像生成・オリジナルイラスト等の別経路へ進める。**無関係な画像を勝手に採用しない**。
- 日本語字幕の活用語分断『かかっ／て』『照れくさ／そう』を減らす試験コードと回帰テストを[Draft PR #8](https://github.com/EliteMay/shorts-research-lab/pull/8)に保存。ただしPythonユニットテストと実音声の再検証ができず、**未検証・未マージ**。
- 次の工程：素材候補のレビュー・実素材の取得と検証を一貫した制作フローへ結合し、音声字幕と5シーンの映像の内容一致を実MP4で確認する。完成品質の宣言は行わない。

---
## 2026-10-15：音声単語境界による字幕同期とMP4プレビュー
- [PR #6](https://github.com/EliteMay/shorts-research-lab/pull/6)をmainに統合。Edge TTSが返したWordBoundaryを使い、固定日本語創作台本5シーンの音声27.776秒・字幕15区間を実際に生成。
- 以前は文字数で時刻を推定していたが、今回は読み上げの実タイミングを参照。台本との不一致・未取得の単語位置情報を検査して拒否する。
- 字幕を全文最適化して孤立した「た。」は解消。なお「かかっ／て」「照れくさ／そう」といった活用語分割は未解決。**品質承認ではない。**
- 前回制作したシーン対応のオリジナルイラスト5枚と新音声から27.776秒、720×1280、H.264/AACのMP4をローカルで出力（映像と音声トラック、尺はffprobeで確認）。
- 外部無料のオンラインTTSを使用。追加の有料AI API料金は0円。ローカル完結、自由なテーマのAI画像生成、素材の権利確認の自動化、通し試聴は未実装/未完了。
- [GitHub Actions](https://github.com/EliteMay/shorts-research-lab/actions/runs/38607009917)で新規Python自動テストと実合成が成功。Windowsで同じ処理の起動と視聴テストは今後。
- [Issue #3](https://github.com/EliteMay/shorts-research-lab/issues/3)に残課題を引き継ぐ。次は言語学的に自然な字幕分割とライセンス付き映像候補探索・人手承認を一つの制作フローへまとめる。

# 作業追記 — 2026-10-15（字幕・映像の品質改善）

- [PR #5](https://github.com/EliteMay/shorts-research-lab/pull/5) をmainへ統合。日本語字幕が単語途中で割れる現象に対して、Node.js標準の単語区切りを使う字幕検査と7つの回帰テストを追加。GitHub ActionsはPASS。
- 前回の27.667秒の創作ナレーションを再利用し、ロボット・玄関・街・公園・鍵・結末に対応する独自イラストを5場面生成。手で整えた字幕10件を付与した720×1280 MP4を実際に書き出した。H.264/AACをffprobeで検証。
- 代表的な実フレームを確認し、字幕の単語途中分割と単色背景の意味不一致が改善したことを確認。**人による通し試聴、字幕の厳密な時刻同期、視聴者評価は未実施。公開品質は未承認**。
- プロトタイプの独自イラストは固定題材用で、汎用AI画像生成は未実装。無料API利用・OpenReelsとの同条件フル動画比較は引き続き[Issue #3](https://github.com/EliteMay/shorts-research-lab/issues/3)で管理。
- 家PCがオンラインになり、WindowsのNode.js/FFmpegとVALORANT非起動を確認。ただしOpenReelsを端末へ取得・導入する操作は安全性チェックでブロックされたため、Windowsでの実行比較を成功扱いにはしない。

詳細: [studio/CAPTION_QUALITY.md](studio/CAPTION_QUALITY.md)。

---

# 作業報告 — 2026-10-15（Shorts Studio増設・第1段階）

## Issue #3 追加検証（2026-10-15）
- GitHub Actionsの隔離環境でPurffleShortsの特定コミットから、固定の日本語創作台本をMP4化。初回41.256秒、台本短縮後27.667秒。
- 日本語音声はメタデータ上`edge:ja-JP-KeitaNeural`、映像H.264/音声AAC、360×640を確認。追加の有料API呼出なし。
- 実フレームを確認し、背景はグラデーションのみで意味的に不適切、日本語字幕が途中で分断されることを確認。**技術検証成功、作品の品質は不合格**。
- OpenReelsのローカルLLM設定と画像API依存をソースで確認。無料でのフル動画生成とWindows実機は未検証。
- 証拠と継続条件は [studio/ENGINE_COMPARISON.md](studio/ENGINE_COMPARISON.md) と [Issue #3](https://github.com/EliteMay/shorts-research-lab/issues/3) に記録。

## 今回の実施
- 既存の研究リポジトリに `studio/` を追加。既存の分析・ケース資料は変更せず維持。
- 動画制作の品質基準を `studio/REQUIREMENTS.md` に整理。大量生成ではなく30秒の高品質な1本を目指す。
- 絵コンテJSONの構造・シーン時間・未確認素材・権利・事実根拠・人的確認を検査するCLIと自動テストを追加。
- GitHub ActionsでNode.js 22の自動テストを構成。

## 検証
- ローカル環境（Node.js 22）で `npm test` 8件成功、サンプルの通常検査はPASS。
- サンプルの制作前モード `--ready` は未承認のため期待どおりFAIL。
- GitHub CI結果およびWindows実機動作は別途確認が必要。

## 未実装・次の優先作業
- PurffleShortsとOpenReelsを同一テーマでローカル比較し、ナレーション・映像適合・字幕・追加費用を実測。
- AI台本生成・素材調達・音声生成・レンダリング・MP4実映像検査・Electron UIは未実装。
- 作業ブランチのPRをレビューし、継続する開発の基点とする。素材とモデルをGitHubには保存しない。

---

# 過去の作業報告 — 2026-10-13

## 完了範囲
- 新しい専用リポジトリ Shorts Research Lab に基本方針と初回分析を作成。
- 科学・工学／会話コント／修復工程／挑戦／ゲーム総集編／ゲームの秘密／修復と物語の7本を文字起こしベースで整理。
- 分析の証拠区分、構成パターン、制作品質チェック、反応速度Shorts失敗からの学び、追加候補を記録。
- 原動画や字幕全文は複製せず、URLと独自の批評を保存。

## 未完了・未検証
- 7本の実映像の直接視聴とフレーム単位の確認。
- 実際のカット数、音の演出、編集テンポ、視聴維持率。
- 型を使った新しいShortsの制作、ユーザーテスト、公開後の数値比較。

## 次の優先作業
- 直接再生可能な方法で動画を確認できたら、各分析の映像観察欄を追記する。
- 参加・クイズ、強刺激型、物語・感情型、ASMR・料理などを補充する。
- まず1つの題材で異なる構成を比較制作し、効果を判断する。

## 制約・誠実性
今回は字幕等の調査であり、全動画の映像分析が終わったとは扱わない。高評価・視聴維持に関する因果の証明はない。