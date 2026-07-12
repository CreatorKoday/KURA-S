// ==========================================================
// 商品名から分類タグ(飲料・肉・野菜など)を自動判定する
// ==========================================================

import { loadItems } from "./items.js";

export const TAG_RULES = [
  { tag: "飲料", keywords: ["牛乳","ジュース","お茶","紅茶","コーヒー","水","ミネラルウォーター","ビール","酒","炭酸","乳酸菌飲料"] },
  { tag: "肉", keywords: ["肉","鶏","豚","牛肉","ひき肉","ベーコン","ソーセージ","ハム"] },
  { tag: "魚介", keywords: ["魚","鮭","サーモン","マグロ","エビ","イカ","タコ","刺身","干物","ちくわ","かまぼこ"] },
  { tag: "野菜", keywords: ["野菜","トマト","キャベツ","レタス","にんじん","人参","玉ねぎ","たまねぎ","じゃがいも","ピーマン","きゅうり","なす","ねぎ","もやし","ブロッコリー","大根"] },
  { tag: "果物", keywords: ["りんご","バナナ","みかん","いちご","ぶどう","メロン","果物","フルーツ","柿","桃"] },
  { tag: "乳製品", keywords: ["チーズ","ヨーグルト","バター","生クリーム"] },
  { tag: "パン・穀物", keywords: ["パン","米","お米","麺","パスタ","うどん","そば","シリアル"] },
  { tag: "卵", keywords: ["卵","たまご"] },
  { tag: "調味料", keywords: ["醤油","しょうゆ","味噌","みそ","塩","砂糖","油","ソース","ケチャップ","マヨネーズ","だし","スパイス","こしょう"] },
  { tag: "冷凍食品", keywords: ["冷凍"] },
  { tag: "お菓子", keywords: ["お菓子","チョコ","クッキー","スナック","ポテトチップス","アイス"] },
  { tag: "洗剤・掃除用品", keywords: ["洗剤","漂白剤","柔軟剤","スポンジ","掃除"] },
  { tag: "衛生用品", keywords: ["トイレットペーパー","ティッシュ","石鹸","シャンプー","歯磨き","歯ブラシ","マスク"] }
];
export const ALL_TAGS = TAG_RULES.map(r => r.tag).concat(["その他"]);

export function guessTag(name) {
  const target = name || "";
  for (const rule of TAG_RULES) {
    if (rule.keywords.some(k => target.includes(k))) return rule.tag;
  }
  return "その他";
}

const filterTagSelect = document.getElementById("filter-tag");
ALL_TAGS.forEach(tag => {
  const opt = document.createElement("option");
  opt.value = tag;
  opt.textContent = tag;
  filterTagSelect.appendChild(opt);
});

// アロー関数越しに呼ぶことで、モジュール読み込み順に関係なく安全に動作させる
document.getElementById("filter-category").addEventListener("change", () => loadItems());
document.getElementById("filter-tag").addEventListener("change", () => loadItems());
