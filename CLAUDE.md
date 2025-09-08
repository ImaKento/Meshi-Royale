# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのリポジトリでコードを扱う際のガイダンスを提供します。

## よく使用する開発コマンド

### 開発サーバー
```bash
npm run dev  # Turbopackで開発サーバーを開始
```

### ビルドとデプロイメント
```bash
npm run build  # Prismaクライアントを生成してNext.jsアプリをビルド
npm run start  # 本番サーバーを開始
```

### コード品質
```bash
npm run lint      # ESLintを実行
npm run format    # Prettierでコードをフォーマット
npm run format:check  # コードフォーマットをチェック
```

### データベース
```bash
npx prisma generate  # Prismaクライアントを生成 (出力先: src/generated/prisma)
npx prisma migrate dev  # データベースマイグレーションを適用
npx prisma studio  # Prisma Studioを開く
```

## アーキテクチャ概要

### 技術スタック
- **フレームワーク**: Next.js 15.5.2 with App Router
- **言語**: TypeScript
- **データベース**: PostgreSQL with Prisma ORM
- **状態管理**: Zustand with persistence
- **UIコンポーネント**: Radix UI with Tailwind CSS v4
- **外部サービス**: Supabase integration

### 主要ディレクトリ構造
```
src/
├── app/                 # Next.js App RouterのページとAPIルート
│   ├── api/            # サーバーサイドAPIエンドポイント
│   ├── games/          # ゲーム固有のページ
│   └── room/           # ルーム管理ページ
├── components/         # 再利用可能なUIコンポーネント
│   └── ui/            # ベースUIコンポーネント（ボタン、ダイアログなど）
├── lib/               # ユーティリティライブラリ（Prisma、Supabase）
├── store/             # Zustand状態管理
└── generated/prisma/  # 生成されたPrismaクライアント
```

### データベーススキーマ
主要エンティティ:
- **User**: 食べ物の好みを含む基本ユーザー情報
- **Room**: 一意のコードと設定を持つゲームルーム
- **RoomUser**: ユーザーとルームの多対多リレーション
- **GameResults**: ゲームスコアと結果を保存

### 状態管理
- ユーザーセッション管理のためのZustandストア (`src/store/userStore.ts`)
- セッション間での永続化のためのlocalStorage統合
- タブ間の整合性のためZustandとlocalStorageの両方にユーザーIDを保存

### API設計
`src/app/api/`のRESTful APIルート:
- `/api/users` - ユーザー作成と管理
- `/api/rooms` - ルーム作成と検索
- `/api/room-users` - ルーム参加管理
- `/api/gameResults` - ゲームスコア保存

### 主要パターン
1. **クライアントサイドユーザー作成**: 各セッションでデフォルト名「ゲスト」の新しいユーザーを作成
2. **ルームコードシステム**: ルーム識別のための6文字の英数字コード
3. **ゲーム統合**: 複数のミニゲーム（ボタン連打、色チャレンジ、タイミングストップ、回避ゲーム）
4. **レスポンシブデザイン**: グラデーション背景とグラスモーフィズムを使用したモバイルファーストUI

### 外部統合
- **Supabase**: 認証と追加データサービス
- **ホットペッパーグルメAPI**: レストランデータ統合（予算/ジャンル/場所エンドポイント）
- **逆ジオコーディング**: 位置ベースのレストラン推薦