# 詰碁ボード（公開用エディタ）

ブラウザだけで動く碁盤エディタ。サーバー不要のため、静的ホスティング（GitHub Pages 等）に
`index.html` / `app.js` / `style.css` を置くだけで公開できる。

- 写真からの読み込み機能は含まない（それは認識サーバーが必要なローカル版のみ）。
- 機能：交互（黒/白の先手切替）・黒/白を置く・消す・動かす・全体移動・隅へ配置・
  取り（交互モード時）・元に戻す・全消去・端末別の初期路数（iPhone=9 / iPad=13 / PC=19）。

## GitHub Pages で公開する手順（ブラウザだけで完結）
1. GitHub アカウントを作成（無料）。
2. 新しい **Public** リポジトリを作成（例: `tsumego-board`）。
3. 「Add file → Upload files」で `index.html` / `app.js` / `style.css` をアップロードして Commit。
   - `index.html` はリポジトリの **ルート（一番上の階層）** に置く。
4. 「Settings → Pages」→ Source を「Deploy from a branch」、Branch を「main / (root)」にして Save。
5. 1〜2分後、`https://<ユーザー名>.github.io/<リポジトリ名>/` で公開される。

## 費用
- GitHub アカウント・リポジトリ・Pages・`github.io` の無料URL：すべて **0円**。
- 独自ドメインを使う場合のみ、年 ¥1,000〜2,000 程度（任意）。
