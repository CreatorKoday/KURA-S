// ==========================================================
// 商品マスタ(商品属性)の解決・キャッシュ
//
// ・normalized_name: 表記ゆれ(全角/半角・空白・容量表記など)を吸収するための
//   ローカル正規化キー。AI呼び出し前のキャッシュ判定に使う(product_name_alias)。
// ・canonicalName: AIが判定する、ブランドを問わない標準商品名。
//   属性(product_master)を複数ブランド間で共有するためのキー。
// ==========================================================

import { supabaseClient, GEMINI_API_KEY } from "./config.js";

export const FOOD_CATEGORIES = [
  "野菜","果物","肉","魚","乳製品","飲料","調味料","お菓子","パン","米","麺類",
  "冷凍食品","レトルト","缶詰","インスタント","その他"
];
export const DAILY_CATEGORIES = [
  "洗濯用品","掃除用品","キッチン用品","トイレ用品","お風呂用品","ティッシュ・紙製品",
  "衛生用品","スキンケア","ヘアケア","オーラルケア","ベビー用品","ペット用品",
  "消臭・芳香剤","電池・電球","その他"
];
export const FOOD_STORAGE_OPTIONS = ["常温", "冷蔵", "冷凍"];
export const DAILY_STORAGE_OPTIONS = ["洗面所", "キッチン", "トイレ", "浴室", "収納棚", "玄関", "その他"];
export const FOOD_USAGE_OPTIONS = ["朝食", "昼食", "夕食", "おやつ", "飲み物", "料理", "調味料"];
export const DAILY_USAGE_OPTIONS = ["掃除", "洗濯", "衛生", "美容", "生活用品"];

// 商品名の表記ゆれ(全角/半角・空白・容量表記など)を吸収するローカル正規化
export function normalizeProductName(raw) {
  let s = (raw || "").trim().normalize("NFKC");
  s = s.replace(/[\s・,、]+/g, "");
  s = s.replace(/\d+\s*(ml|l|kg|g|個|本|枚|袋|パック|入り?)/gi, "");
  return s.toLowerCase();
}

// カテゴリーからアイコン(絵文字)を決定する(商品ごとではなくカテゴリー単位で統一表示するため)
const CATEGORY_ICON_MAP = {
  "野菜": "🥬", "果物": "🍎", "肉": "🥩", "魚": "🐟", "乳製品": "🥛",
  "飲料": "🥤", "調味料": "🧂", "お菓子": "🍬", "パン": "🍞", "米": "🍚",
  "麺類": "🍜", "冷凍食品": "🧊", "レトルト": "🥫", "缶詰": "🥫", "インスタント": "🍲",
  "洗濯用品": "🧺", "掃除用品": "🧹", "キッチン用品": "🍳", "トイレ用品": "🚽",
  "お風呂用品": "🛁", "ティッシュ・紙製品": "🧻", "衛生用品": "🧼", "スキンケア": "🧴",
  "ヘアケア": "💇", "オーラルケア": "🪥", "ベビー用品": "🍼", "ペット用品": "🐾",
  "消臭・芳香剤": "🌸", "電池・電球": "🔋"
};
export function getCategoryIcon(type, category) {
  return CATEGORY_ICON_MAP[category] || (type === "食品" ? "🍽️" : "🧴");
}

function isCategoryValidForType(type, category) {
  const list = type === "食品" ? FOOD_CATEGORIES : DAILY_CATEGORIES;
  return list.includes(category);
}

// AIに商品属性(canonicalNameを含む)を問い合わせる。
// knownCanonicalNames は将来「既存の標準商品名を優先的に再利用する」仕組み
// (標準名辞書・RAG等)を追加する際の拡張ポイント。現時点では常に空配列で呼ばれ、
// プロンプトには反映されない。
async function identifyProductAttributes(rawName, knownCanonicalNames = []) {
  const knownNamesHint = knownCanonicalNames.length > 0
    ? "\n参考として、既存の標準商品名の候補: " + knownCanonicalNames.join("、") + "。該当するものがあれば優先的に使ってください。"
    : "";

  const prompt =
    "次の商品名から、商品属性をJSONで判定してください。商品名: 「" + rawName + "」\n" +
    "canonicalName(標準商品名)は、ブランド名や商品シリーズ名を除いた一般的な呼び方にしてください" +
    "(例: 「雪印牛乳」「明治おいしい牛乳」→「牛乳」、「ガーナミルク」→「チョコレート」、「アルフォート」→「クッキー」)。" +
    "typeは「食品」か「日用品」のどちらか一方にしてください。" +
    "categoryはtypeに応じて次のいずれか一つにしてください: " +
    "食品の場合は[" + FOOD_CATEGORIES.join("、") + "]、日用品の場合は[" + DAILY_CATEGORIES.join("、") + "]。" +
    "subCategoryはcategoryをさらに細かく分類してください。" +
    "storageはtypeに応じて次のいずれか一つにしてください: " +
    "食品の場合は[" + FOOD_STORAGE_OPTIONS.join("、") + "]、日用品の場合は[" + DAILY_STORAGE_OPTIONS.join("、") + "]。" +
    "usageはtypeに応じて次のいずれか一つにしてください: " +
    "食品の場合は[" + FOOD_USAGE_OPTIONS.join("、") + "]、日用品の場合は[" + DAILY_USAGE_OPTIONS.join("、") + "]。" +
    "searchKeywordsは検索やAI機能で使える関連キーワードを3〜8個返してください。" +
    "ブランド名ではなく商品の種類を優先して分類してください。" +
    knownNamesHint;

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              canonicalName: { type: "STRING" },
              type: { type: "STRING", enum: ["食品", "日用品"] },
              category: { type: "STRING", enum: [...FOOD_CATEGORIES, ...DAILY_CATEGORIES] },
              subCategory: { type: "STRING" },
              storage: { type: "STRING", enum: [...FOOD_STORAGE_OPTIONS, ...DAILY_STORAGE_OPTIONS] },
              usage: { type: "STRING", enum: [...FOOD_USAGE_OPTIONS, ...DAILY_USAGE_OPTIONS] },
              searchKeywords: { type: "ARRAY", items: { type: "STRING" } }
            },
            required: ["canonicalName", "type", "category", "searchKeywords"]
          }
        }
      })
    }
  );

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "商品属性の判定に失敗しました");
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("商品属性を判定できませんでした");
  return JSON.parse(text);
}

// 将来「既存の標準商品名を再利用する」機能(標準名辞書・RAG等)を追加する際の差し込みポイント。
// 現時点では何も取得せず、常に空配列を返す(AIだけで新規判定する)。
async function fetchKnownCanonicalNameCandidates(rawName) {
  return [];
}

// 商品名(生の表記)から商品マスタ行を解決する。
// 既知の表記(表記ゆれ込み)ならAIを呼ばずキャッシュ(product_name_alias)を返す。
// 失敗した場合は null を返し、呼び出し側は product_master_id なしで在庫登録を継続できる。
//
// forceRegenerate: true の場合、キャッシュ確認をスキップし常にAIへ問い合わせる。
// 「商品属性が未設定の商品に新規作成する」場合と、将来の「既存の商品属性を
// 再生成する」機能(AIモデル変更時・分類ルール改善時など)の両方から、
// この同じ関数を共通の入口として使える設計にしている。
// なお、AIが既存の標準商品名(canonicalName)と同じ判定を返した場合は、その
// 既存のproduct_master行(ユーザーによる編集済みの内容を含む)がそのまま
// 再利用されるため、再生成であっても編集内容が上書きされることはない。
export async function resolveProductMaster(rawName, { forceRegenerate = false } = {}) {
  const normalized = normalizeProductName(rawName);
  if (!normalized) return null;

  try {
    if (!forceRegenerate) {
      const { data: existingAlias } = await supabaseClient
        .from("product_name_alias")
        .select("product_master_id")
        .eq("normalized_name", normalized)
        .maybeSingle();

      if (existingAlias) {
        const { data: master } = await supabaseClient
          .from("product_master")
          .select("*")
          .eq("id", existingAlias.product_master_id)
          .maybeSingle();
        if (master) return master;
      }
    }

    const knownNames = await fetchKnownCanonicalNameCandidates(rawName);
    const attrs = await identifyProductAttributes(rawName, knownNames);

    if (!isCategoryValidForType(attrs.type, attrs.category)) {
      attrs.category = "その他";
    }

    const canonicalNormalized = normalizeProductName(attrs.canonicalName);

    let master = null;
    const { data: existingMaster } = await supabaseClient
      .from("product_master")
      .select("*")
      .eq("canonical_normalized_name", canonicalNormalized)
      .maybeSingle();

    if (existingMaster) {
      master = existingMaster;
    } else {
      const { data: inserted, error: insertError } = await supabaseClient
        .from("product_master")
        .insert({
          canonical_name: attrs.canonicalName,
          canonical_normalized_name: canonicalNormalized,
          type: attrs.type,
          category: attrs.category,
          sub_category: attrs.subCategory || null,
          storage: attrs.storage || null,
          usage: attrs.usage || null,
          search_keywords: attrs.searchKeywords || [],
          ai_model: "gemini-flash-latest"
        })
        .select()
        .single();

      if (insertError) {
        // 同時登録などで既に他方が作成済みの場合は、それを取得して使う
        const { data: fallback } = await supabaseClient
          .from("product_master")
          .select("*")
          .eq("canonical_normalized_name", canonicalNormalized)
          .maybeSingle();
        master = fallback;
      } else {
        master = inserted;
      }
    }

    if (!master) return null;

    // forceRegenerate時は同じ表記のエイリアスが既に存在し得るため、
    // 単純なinsertではなくupsertで「あれば紐付け先を更新、なければ新規作成」にする
    await supabaseClient
      .from("product_name_alias")
      .upsert(
        { normalized_name: normalized, raw_name: rawName, product_master_id: master.id },
        { onConflict: "normalized_name" }
      );

    return master;
  } catch (e) {
    console.error("商品マスタの解決に失敗:", e);
    return null;
  }
}

// ユーザーによる手動編集を product_master に反映する(AIへの再問い合わせは行わない)。
// changes に含まれるキーだけを更新し、そのキー名を edited_fields に記録することで、
// どの項目がAI初期値のままで、どの項目がユーザーによって変更されたかを区別できるようにする。
// changes のキー: icon / category / subCategory / storage / usage / searchKeywords
export async function updateProductMasterFields(id, changes) {
  const { data: current, error: fetchError } = await supabaseClient
    .from("product_master")
    .select("edited_fields")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !current) {
    console.error("商品マスタの取得に失敗:", fetchError);
    return null;
  }

  const nextEditedFields = Array.from(new Set([...(current.edited_fields || []), ...Object.keys(changes)]));

  const payload = {
    updated_at: new Date().toISOString(),
    edited_fields: nextEditedFields,
    source: "manual"
  };
  if (changes.icon !== undefined) payload.icon = changes.icon || null;
  if (changes.category !== undefined) payload.category = changes.category;
  if (changes.subCategory !== undefined) payload.sub_category = changes.subCategory || null;
  if (changes.storage !== undefined) payload.storage = changes.storage || null;
  if (changes.usage !== undefined) payload.usage = changes.usage || null;
  if (changes.searchKeywords !== undefined) payload.search_keywords = changes.searchKeywords;

  const { data: updated, error: updateError } = await supabaseClient
    .from("product_master")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("商品マスタの更新に失敗:", updateError);
    return null;
  }
  return updated;
}
