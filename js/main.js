// ==========================================================
// エントリーポイント
// 各機能モジュールを読み込むことで、それぞれの中にある
// イベントリスナー登録などの初期化処理が実行される
// ==========================================================

import "./config.js";
import "./elements.js";
import "./utils.js";

import "./quantity.js";
import "./tags.js";
import "./units.js";

import "./shopping.js";
import "./items.js";

import "./aiPhoto.js";
import "./barcode.js";
import "./consume.js";

import "./navigation.js";
import "./auth.js";

import "./calendar.js";

// 静的に配置されているアイコン(ナビ・ボタンなど)を初期化する
if (window.lucide) lucide.createIcons();
