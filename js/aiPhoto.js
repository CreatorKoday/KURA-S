// ==========================================================
// 写真によるAI商品判定(商品登録・複数商品一括登録)
// ==========================================================

import { GEMINI_API_KEY } from "./config.js";
import { addMessageBox, reviewMessageBox } from "./elements.js";
import { showMessage, escapeHtml, buildQuantityOptionsHtml } from "./utils.js";
import { setupReviewQuantityToggle, isContinuousUnit, getReviewQuantityValue } from "./quantity.js";
import { upsertItemByName } from "./items.js";

document.getElementById("photo-btn").addEventListener("click", () => {
  document.getElementById("photo-input").click();
});

document.getElementById("photo-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  showMessage(addMessageBox, "AIが商品を判定中です。少々お待ちください...", false);

  try {
    const base64Data = await fileToBase64(file);
    const items = await identifyProductsWithAI(base64Data, file.type);

    if (!items || items.length === 0) {
      showMessage(addMessageBox, "商品を判定できませんでした。商品名を手入力してください。", true);
      return;
    }

    showMessage(addMessageBox, "", false);
    renderReviewList(items);
  } catch (err) {
    showMessage(addMessageBox, "判定エラー: " + err.message, true);
  } finally {
    e.target.value = "";
  }
});

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function identifyProductsWithAI(base64Data, mimeType) {
  const prompt = "この写真に写っている食品・日用品をすべて識別してください。" +
    "商品名(name)は、ブランド名や「おいしい」「厳選」などの宣伝文句を除いた、一般的な呼び方にしてください(例:「おいしい牛乳」ではなく「牛乳」、「〇〇農園のキャベツ」ではなく「キャベツ」)。" +
    "同じ種類の商品が複数写っている場合は1つの項目にまとめて、その個数をquantityに入れてください。" +
    "違う商品ごとに別の項目として出力してください。" +
    "categoryは「食材」か「日用品」のどちらか一方にしてください。" +
    "unitには個・本・パック・袋・箱など、その商品に自然な単位を日本語で入れてください。" +
    "商品が何も認識できない場合は空の配列を返してください。";

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                category: { type: "STRING", enum: ["食材", "日用品"] },
                unit: { type: "STRING" },
                quantity: { type: "NUMBER" }
              },
              required: ["name", "category", "unit", "quantity"]
            }
          }
        }
      })
    }
  );

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "AIとの通信に失敗しました");
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return [];

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("AIの応答を解析できませんでした");
  }
}

function renderReviewList(items) {
  const reviewSection = document.getElementById("review-section");
  const reviewList = document.getElementById("review-list");

  reviewList.innerHTML = items.map((item, index) => `
    <div class="review-card" data-index="${index}">
      <label>商品名</label>
      <input type="text" class="review-name" value="${escapeHtml(item.name || "")}">

      <div class="row2">
        <div>
          <label>分類</label>
          <select class="review-category">
            <option value="食材" ${item.category === "食材" ? "selected" : ""}>食材</option>
            <option value="日用品" ${item.category === "日用品" ? "selected" : ""}>日用品</option>
          </select>
        </div>
        <div>
          <label>単位</label>
          <input type="text" class="review-unit" value="${escapeHtml(item.unit || "個")}">
        </div>
      </div>

      <div class="row2">
        <div>
          <label>数量</label>
          <select class="review-quantity ${isContinuousUnit(item.unit) ? "hidden" : ""}">${buildQuantityOptionsHtml(item.quantity || 1)}</select>
          <input type="number" class="review-quantity-numeric ${isContinuousUnit(item.unit) ? "" : "hidden"}" min="0" step="any" inputmode="decimal" placeholder="例: 500" value="${item.quantity || ""}">
        </div>
        <div>
          <label>消費・賞味期限(任意)</label>
          <input type="text" class="review-expiry date-display" placeholder="タップして選択" readonly>
        </div>
      </div>

      <div class="review-card-actions">
        <button type="button" class="btn-secondary review-register-btn"><span class="material-symbols-rounded">check</span> 登録</button>
        <button type="button" class="btn-secondary review-remove-btn"><span class="material-symbols-rounded">delete</span> 削除</button>
      </div>
    </div>
  `).join("");

  if (window.lucide) lucide.createIcons();

  reviewList.querySelectorAll(".review-card").forEach(card => setupReviewQuantityToggle(card));

  reviewList.querySelectorAll(".review-remove-btn").forEach(btn => {
    btn.addEventListener("click", () => removeReviewCard(btn.closest(".review-card")));
  });

  reviewList.querySelectorAll(".review-register-btn").forEach(btn => {
    btn.addEventListener("click", () => registerReviewCard(btn.closest(".review-card")));
  });

  reviewSection.classList.remove("hidden");
  reviewSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

// カードが1件も残っていなければ、AI登録エリア自体を閉じる(まとめて登録完了時と同じ後処理)
function closeReviewIfEmpty() {
  if (document.querySelectorAll("#review-list .review-card").length === 0) {
    document.getElementById("review-section").classList.add("hidden");
    document.getElementById("review-list").innerHTML = "";
  }
}

// 「削除」: AIへの再問い合わせはせず、そのカードを画面から取り除くだけ
function removeReviewCard(card) {
  card.remove();
  closeReviewIfEmpty();
}

// 「登録」: そのカード1件だけを登録する
async function registerReviewCard(card) {
  const name = card.querySelector(".review-name").value.trim();
  if (!name) {
    showMessage(reviewMessageBox, "商品名を入力してください", true);
    return;
  }

  const registerBtn = card.querySelector(".review-register-btn");
  registerBtn.disabled = true;

  const id = await upsertItemByName({
    name,
    category: card.querySelector(".review-category").value,
    unit: card.querySelector(".review-unit").value.trim() || "個",
    quantity: parseFloat(getReviewQuantityValue(card)) || 0,
    expiry_date: card.querySelector(".review-expiry").value || null
  });

  if (!id) {
    registerBtn.disabled = false;
    showMessage(reviewMessageBox, "登録に失敗しました。もう一度お試しください。", true);
    return;
  }

  card.remove();
  closeReviewIfEmpty();
  showMessage(addMessageBox, "「" + name + "」を登録しました", false);
}

document.getElementById("cancel-review-btn").addEventListener("click", () => {
  document.getElementById("review-section").classList.add("hidden");
  document.getElementById("review-list").innerHTML = "";
});

document.getElementById("register-all-btn").addEventListener("click", async () => {
  const cards = document.querySelectorAll("#review-list .review-card");
  if (cards.length === 0) {
    showMessage(reviewMessageBox, "登録する商品がありません", true);
    return;
  }

  let count = 0;
  for (const card of cards) {
    const name = card.querySelector(".review-name").value.trim();
    if (!name) continue;
    await upsertItemByName({
      name,
      category: card.querySelector(".review-category").value,
      unit: card.querySelector(".review-unit").value.trim() || "個",
      quantity: parseFloat(getReviewQuantityValue(card)) || 0,
      expiry_date: card.querySelector(".review-expiry").value || null
    });
    count++;
  }

  if (count === 0) {
    showMessage(reviewMessageBox, "商品名が入力されていません", true);
    return;
  }

  document.getElementById("review-section").classList.add("hidden");
  document.getElementById("review-list").innerHTML = "";
  showMessage(addMessageBox, count + "件登録しました", false);
});
