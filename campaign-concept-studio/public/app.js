const form = document.querySelector("#campaign-form");
const submitButton = document.querySelector("#submit-button");
const emptyState = document.querySelector("#empty-state");
const loadingState = document.querySelector("#loading-state");
const errorState = document.querySelector("#error-state");
const errorMessage = document.querySelector("#error-message");
const results = document.querySelector("#results");

const conceptName = document.querySelector("#concept-name");
const conceptLine = document.querySelector("#concept-line");
const conceptRationale = document.querySelector("#concept-rationale");
const conceptPromise = document.querySelector("#concept-promise");
const copyList = document.querySelector("#copy-list");
const checklist = document.querySelector("#checklist");
const imageGrid = document.querySelector("#image-grid");

function setState(state) {
  emptyState.classList.toggle("hidden", state !== "empty");
  loadingState.classList.toggle("hidden", state !== "loading");
  errorState.classList.toggle("hidden", state !== "error");
  results.classList.toggle("hidden", state !== "results");
  submitButton.disabled = state === "loading";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderCampaign(data) {
  conceptName.textContent = data.concept.name;
  conceptLine.textContent = data.concept.oneLiner;
  conceptRationale.textContent = data.concept.strategicRationale;
  conceptPromise.textContent = data.concept.audiencePromise;

  copyList.innerHTML = data.copyVariants
    .map((variant, index) => `
      <article class="copy-card">
        <span>Variant ${index + 1} · ${escapeHtml(variant.channelFit)}</span>
        <h4>${escapeHtml(variant.headline)}</h4>
        <p>${escapeHtml(variant.body)}</p>
      </article>
    `)
    .join("");

  checklist.innerHTML = data.launchChecklist
    .map((item) => `
      <article class="check-item">
        <p><strong>${escapeHtml(item.task)}</strong></p>
        <p><span>Owner</span>${escapeHtml(item.owner)}</p>
        <p><span>Timing</span>${escapeHtml(item.timing)}</p>
      </article>
    `)
    .join("");

  imageGrid.innerHTML = data.images
    .map((item) => `
      <article class="image-card">
        ${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.label)} campaign direction">` : ""}
        <span>${escapeHtml(item.usage)}</span>
        <h4>${escapeHtml(item.label)}</h4>
        <p class="prompt">${escapeHtml(item.prompt)}</p>
      </article>
    `)
    .join("");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setState("loading");

  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "The campaign could not be generated.");
    }

    renderCampaign(data);
    setState("results");
  } catch (error) {
    errorMessage.textContent = error.message;
    setState("error");
  }
});
