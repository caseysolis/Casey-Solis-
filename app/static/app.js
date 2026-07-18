let currentSearchId = null;
let pollTimer = null;

const $ = (id) => document.getElementById(id);

function setStatus(el, msg, cls) {
  el.textContent = msg;
  el.className = "status-line" + (cls ? " " + cls : "");
}

$("search-btn").addEventListener("click", async () => {
  const zillowUrl = $("zillow-url").value.trim();
  const location = $("location").value.trim();
  const maxResults = parseInt($("max-results").value, 10) || 15;
  const statusEl = $("search-status");

  if (!zillowUrl && !location) {
    setStatus(statusEl, "Enter a Zillow URL or a location first.", "error");
    return;
  }

  $("search-btn").disabled = true;
  setStatus(statusEl, "Starting search...");
  $("results-card").hidden = true;
  $("report-card").hidden = true;

  try {
    const resp = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zillow_url: zillowUrl, location, max_results: maxResults }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      setStatus(statusEl, data.error || "Search failed to start.", "error");
      $("search-btn").disabled = false;
      return;
    }
    currentSearchId = data.search_id;
    pollStatus();
  } catch (err) {
    setStatus(statusEl, "Could not reach the server: " + err.message, "error");
    $("search-btn").disabled = false;
  }
});

function pollStatus() {
  clearInterval(pollTimer);
  const statusEl = $("search-status");
  pollTimer = setInterval(async () => {
    const resp = await fetch(`/api/search/${currentSearchId}/status`);
    const data = await resp.json();
    setStatus(statusEl, data.progress || data.status);

    if (data.status === "done") {
      clearInterval(pollTimer);
      $("search-btn").disabled = false;
      setStatus(statusEl, data.progress || "Done.", "success");
      loadProperties();
    } else if (data.status === "error") {
      clearInterval(pollTimer);
      $("search-btn").disabled = false;
      setStatus(statusEl, data.error || "Search failed.", "error");
    }
  }, 1500);
}

async function loadProperties() {
  const resp = await fetch(`/api/search/${currentSearchId}/properties`);
  const data = await resp.json();
  const grid = $("results-grid");
  grid.innerHTML = "";

  if (!data.properties.length) {
    grid.innerHTML = "<p>No properties found. Try a different search.</p>";
    $("results-card").hidden = false;
    return;
  }

  for (const prop of data.properties) {
    const thumb = prop.photos.length ? prop.photos[0].display_url : "";
    const card = document.createElement("div");
    card.className = "property-card";
    card.innerHTML = `
      ${thumb ? `<img src="${thumb}" alt="">` : ""}
      <div class="body">
        <div class="price">${prop.price || "Price N/A"}</div>
        <div class="address">${prop.address || "Address unavailable"}${prop.city ? ", " + prop.city : ""} ${prop.state || ""}</div>
        <div class="stats">${prop.beds || "?"} bd &middot; ${prop.baths || "?"} ba ${prop.sqft ? "&middot; " + prop.sqft.toLocaleString() + " sqft" : ""}</div>
        <label class="select-row">
          <input type="checkbox" data-property-id="${prop.id}" ${prop.selected ? "checked" : ""}>
          Include in report
        </label>
      </div>
    `;
    grid.appendChild(card);
  }

  grid.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", async (e) => {
      await fetch(`/api/properties/${e.target.dataset.propertyId}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected: e.target.checked }),
      });
    });
  });

  $("results-card").hidden = false;
  $("report-card").hidden = false;
}

$("report-btn").addEventListener("click", async () => {
  const statusEl = $("report-status");
  $("report-btn").disabled = true;
  setStatus(statusEl, "Building PDF report...");

  try {
    const resp = await fetch(`/api/search/${currentSearchId}/report`, { method: "POST" });
    const data = await resp.json();
    if (!resp.ok) {
      setStatus(statusEl, data.error || "Report generation failed.", "error");
    } else {
      statusEl.innerHTML = `Report ready: <a class="download-link" href="${data.download_url}">Download PDF</a>`;
      statusEl.className = "status-line success";
    }
  } catch (err) {
    setStatus(statusEl, "Could not reach the server: " + err.message, "error");
  } finally {
    $("report-btn").disabled = false;
  }
});
