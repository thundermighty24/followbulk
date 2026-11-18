
// ==========================================
// FOLLOWBULK - CUSTOMER APPLICATION
// Supabase configuration
// ==========================================

const SUPABASE_URL = "https://genylcxbfrjkwfaepmjc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_sT79tQnCQVGHXMn7sDXBew_pmih3eJ6";

const client = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const $ = (id) => document.getElementById(id);

let authMode = "login";
let allServices = [];
let servicesById = new Map();

// ==========================================
// SAFE HTML
// ==========================================

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// ==========================================
// NOTIFICATIONS
// ==========================================

function toast(message) {
  const element = $("toast");

  if (!element) return;

  element.textContent = message;
  element.classList.add("show");

  setTimeout(() => {
    element.classList.remove("show");
  }, 3200);
}

// ==========================================
// AUTHENTICATION DIALOG
// ==========================================

function openAuth(mode) {
  authMode = mode;

  $("auth-title").textContent =
    mode === "signup" ? "Create your account" : "Login";

  $("auth-submit").textContent =
    mode === "signup" ? "Create account" : "Login";

  $("name-wrap").classList.toggle("hidden", mode !== "signup");

  $("auth-switch").textContent =
    mode === "signup"
      ? "Already registered? Login"
      : "New here? Create an account";

  $("auth-message").textContent = "";

  $("auth-dialog").showModal();
}

$("login-open").onclick = () => openAuth("login");
$("signup-open").onclick = () => openAuth("signup");
$("hero-signup").onclick = () => openAuth("signup");

$("auth-switch").onclick = () => {
  openAuth(authMode === "signup" ? "login" : "signup");
};

// ==========================================
// LOGOUT
// ==========================================

$("logout").onclick = async () => {
  const { error } = await client.auth.signOut();

  if (error) {
    toast(error.message);
    return;
  }

  toast("You are signed out.");

  await refreshSession();
};

// ==========================================
// LOGIN AND SIGNUP
// ==========================================

$("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;

  $("auth-submit").disabled = true;
  $("auth-message").textContent = "Please wait...";

  try {
    let result;

    if (authMode === "signup") {
      const fullName = $("full-name").value.trim();

      result = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

    } else {
      result = await client.auth.signInWithPassword({
        email,
        password
      });
    }

    if (result.error) throw result.error;

    $("auth-message").textContent =
      authMode === "signup"
        ? "Account created. Check your email if confirmation is enabled, then log in."
        : "Login successful.";

    if (authMode === "login" || result.data.session) {
      $("auth-dialog").close();

      await refreshSession();

      toast("Welcome to Followbulk!");
    }

  } catch (error) {
    $("auth-message").textContent =
      error.message || "Something went wrong.";

  } finally {
    $("auth-submit").disabled = false;
  }
});

// ==========================================
// REFRESH CUSTOMER SESSION
// ==========================================

async function refreshSession() {
  try {
    const {
      data: { session },
      error
    } = await client.auth.getSession();

    if (error) throw error;

    const loggedIn = Boolean(session);

    $("login-open").classList.toggle("hidden", loggedIn);
    $("signup-open").classList.toggle("hidden", loggedIn);
    $("logout").classList.toggle("hidden", !loggedIn);

    $("user-label").textContent =
      loggedIn ? session.user.email : "";

    $("auth-status").textContent =
      loggedIn
        ? `Signed in as ${session.user.email}`
        : "Sign in to view your account";

    $("topup-form").querySelector("button").disabled = !loggedIn;

    if (loggedIn) {
      await loadWalletRequests(session.user.id);
    } else {
      $("wallet-requests").textContent =
        "Sign in to view requests.";
    }

  } catch (error) {
    console.error("Session error:", error);

    $("auth-status").textContent =
      "Unable to check your session. Please refresh.";
  }
}

// ==========================================
// PLATFORM DETECTION
// ==========================================

function getServicePlatform(service) {
  const text = [
    service.name,
    service.category,
    service.description
  ].join(" ").toLowerCase();

  if (text.includes("instagram") || /\big\b/.test(text)) {
    return "instagram";
  }

  if (text.includes("youtube") || /\byt\b/.test(text)) {
    return "youtube";
  }

  if (text.includes("facebook") || /\bfb\b/.test(text)) {
    return "facebook";
  }

  if (text.includes("telegram")) {
    return "telegram";
  }

  return "other";
}

function serviceMatchesPlatform(service, platform) {
  if (platform === "all") return true;

  return getServicePlatform(service) === platform;
}

// ==========================================
// LOAD SERVICES
// ==========================================

async function loadServices() {
  const holder = $("services-list");

  holder.innerHTML =
    '<div class="empty">Loading services...</div>';

  $("refresh-services").disabled = true;

  try {
    const { data, error } = await client
      .from("services")
      .select(
        "id,name,category,description,rate,min_quantity,max_quantity"
      )
      .eq("active", true)
      .order("category")
      .limit(1000);

    if (error) throw error;

    allServices = data || [];

    servicesById = new Map(
      allServices.map(service => [
        String(service.id),
        service
      ])
    );

    if (allServices.length === 0) {
      holder.innerHTML =
        '<div class="empty">No services have been published yet.</div>';

      updateOrderServices();

      return;
    }

    holder.innerHTML = allServices.map((service) => `
      <article class="service-card">
        <div class="eyebrow">
          ${escapeHtml(service.category || "GENERAL")}
        </div>

        <h3>${escapeHtml(service.name)}</h3>

        <p>
          ${escapeHtml(
            service.description || "Social media service"
          )}
        </p>

        <div class="service-meta">
          <span>
            ₹${Number(service.rate).toFixed(2)} / 1,000
          </span>

          <b>
            ${Number(service.min_quantity).toLocaleString("en-IN")}
            –
            ${Number(service.max_quantity).toLocaleString("en-IN")}
          </b>
        </div>

        <button
          type="button"
          class="btn btn-light service-order-btn"
          data-service-id="${escapeHtml(service.id)}"
        >
          Quick Order
        </button>
      </article>
    `).join("");

    updateOrderServices();

  } catch (error) {
    console.error("Service loading error:", error);

    holder.innerHTML =
      `<div class="empty">Could not load services: ${escapeHtml(error.message)}</div>`;

  } finally {
    $("refresh-services").disabled = false;
  }
}

$("refresh-services").onclick = loadServices;

// ==========================================
// ORDER INTERFACE
// ==========================================

function updateOrderServices() {
  const platform = $("order-platform").value;
  const select = $("order-service");

  const filteredServices = allServices.filter(service =>
    serviceMatchesPlatform(service, platform)
  );

  select.innerHTML =
    '<option value="">Choose a service</option>';

  filteredServices.forEach(service => {
    const option = document.createElement("option");

    option.value = String(service.id);

    option.textContent =
      `${service.name} — ₹${Number(service.rate).toFixed(2)}/1000`;

    select.appendChild(option);
  });

  if (filteredServices.length === 0) {
    select.innerHTML =
      '<option value="">No services found for this platform</option>';
  }

  updateOrderCalculation();
}

$("order-platform").addEventListener("change", () => {
  updateOrderServices();
});

$("order-service").addEventListener("change", () => {
  updateOrderCalculation();
});

$("order-quantity").addEventListener("input", () => {
  updateOrderCalculation();
});

// ==========================================
// ORDER PRICE CALCULATION
// ==========================================

function updateOrderCalculation() {
  const serviceId = $("order-service").value;

  const service = servicesById.get(serviceId);

  const quantity = Number($("order-quantity").value);

  if (!service) {
    $("order-rate").textContent = "₹0.00";
    $("order-charge").textContent = "₹0.00";

    $("order-service-info").textContent =
      "Select a service to view its details.";

    return;
  }

  const rate = Number(service.rate);

  const minimum = Number(service.min_quantity);
  const maximum = Number(service.max_quantity);

  $("order-rate").textContent =
    `₹${rate.toFixed(2)}`;

  $("order-service-info").innerHTML = `
    <b>${escapeHtml(service.name)}</b>
    <p>${escapeHtml(service.description || "Social media service")}</p>
    <small>
      Minimum: ${minimum.toLocaleString("en-IN")}
      · Maximum: ${maximum.toLocaleString("en-IN")}
    </small>
  `;

  if (
    !Number.isFinite(quantity) ||
    !Number.isInteger(quantity) ||
    quantity < minimum ||
    quantity > maximum
  ) {
    $("order-charge").textContent = "₹0.00";
    return;
  }

  const charge = (rate * quantity) / 1000;

  $("order-charge").textContent =
    `₹${charge.toFixed(2)}`;
}

// ==========================================
// QUICK ORDER BUTTONS
// ==========================================

$("services-list").addEventListener("click", (event) => {
  const button = event.target.closest(".service-order-btn");

  if (!button) return;

  const serviceId = button.dataset.serviceId;

  const service = servicesById.get(serviceId);

  if (!service) {
    toast("Service not found. Please refresh the catalogue.");
    return;
  }

  const platform = getServicePlatform(service);

  $("order-platform").value =
    platform === "other" ? "all" : platform;

  updateOrderServices();

  $("order-service").value = serviceId;

  updateOrderCalculation();

  $("order-now").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  toast("Service selected. Enter your order details.");
});

// ==========================================
// ORDER SUBMISSION SAFETY
// ==========================================

// Real order submission is intentionally disabled.
// Do not enable this button until the secure
// wallet deduction and GCSMM order backend is ready.

$("place-order-btn").disabled = true;

$("place-order-btn").textContent =
  "Ordering coming soon";

// ==========================================
// LOAD CUSTOMER TOP-UP REQUESTS
// ==========================================

async function loadWalletRequests(userId) {
  const holder = $("wallet-requests");

  holder.innerHTML =
    '<div class="empty">Loading requests...</div>';

  try {
    const { data, error } = await client
      .from("wallet_requests")
      .select("amount,utr_reference,status,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!data || data.length === 0) {
      holder.innerHTML =
        '<div class="empty">No top-up requests yet.</div>';

      return;
    }

    holder.innerHTML = data.map((request) => `
      <div class="request-row">
        <b>₹${Number(request.amount).toFixed(2)}</b>

        <span class="request-status">
          ${escapeHtml(request.status)}
        </span>

        <br>

        <small>
          ${escapeHtml(request.utr_reference || "")}
          ·
          ${new Date(request.created_at).toLocaleString()}
        </small>
      </div>
    `).join("");

  } catch (error) {
    console.error("Wallet request error:", error);

    holder.textContent =
      "Unable to load requests. Please try again.";
  }
}

// ==========================================
// SUBMIT MANUAL UPI TOP-UP REQUEST
// ==========================================

$("topup-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const {
    data: { user },
    error: userError
  } = await client.auth.getUser();

  if (userError || !user) {
    openAuth("login");
    return;
  }

  const amount = Number($("topup-amount").value);

  const utr = $("topup-utr").value.trim();

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isInteger(amount) ||
    !utr
  ) {
    $("topup-message").textContent =
      "Enter a valid whole-number amount and UPI reference.";

    return;
  }

  const button = $("topup-form").querySelector("button");

  button.disabled = true;

  $("topup-message").textContent =
    "Submitting your request...";

  try {
    const { error } = await client
      .from("wallet_requests")
      .insert({
        user_id: user.id,
        amount,
        utr_reference: utr,
        status: "pending"
      });

    if (error) throw error;

    $("topup-message").textContent =
      "Request submitted for manual review. Your wallet has not been credited yet.";

    $("topup-form").reset();

    await loadWalletRequests(user.id);

    toast("Top-up request submitted!");

  } catch (error) {
    console.error("Top-up submission error:", error);

    $("topup-message").textContent =
      error.message || "Unable to submit your request.";

  } finally {
    button.disabled = false;
  }
});

// ==========================================
// WATCH LOGIN AND LOGOUT CHANGES
// ==========================================

client.auth.onAuthStateChange(() => {
  refreshSession();
});

// ==========================================
// INITIAL PAGE LOADING
// ==========================================

loadServices();

refreshSession();
