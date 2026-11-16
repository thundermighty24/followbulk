// FOLLOWBULK - Supabase browser configuration
// Keep only the public publishable key here.
// NEVER add a Supabase secret or service_role key.

const SUPABASE_URL = "https://genylcxbfrjkwfaepmjc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_sT79tQnCQVGHXMn7sDXBew_pmih3eJ6";

const client = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const $ = (id) => document.getElementById(id);

let authMode = "login";

// Safe HTML output
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// Notifications
function toast(message) {
  const element = $("toast");
  element.textContent = message;
  element.classList.add("show");

  setTimeout(() => {
    element.classList.remove("show");
  }, 3200);
}

// Authentication dialog
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

// Logout
$("logout").onclick = async () => {
  const { error } = await client.auth.signOut();

  if (error) {
    toast(error.message);
    return;
  }

  toast("You are signed out.");
  await refreshSession();
};

// Login and signup
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

// Refresh account information
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

// Watch login and logout changes
client.auth.onAuthStateChange(() => {
  refreshSession();
});

// Load active services
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
      .limit(60);

    if (error) throw error;

    if (!data || data.length === 0) {
      holder.innerHTML =
        '<div class="empty">No services have been published yet. The admin needs to sync and activate the service catalogue.</div>';
      return;
    }

    holder.innerHTML = data.map((service) => `
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
      </article>
    `).join("");

  } catch (error) {
    console.error("Service loading error:", error);

    holder.innerHTML =
      `<div class="empty">Could not load services: ${escapeHtml(error.message)}</div>`;

  } finally {
    $("refresh-services").disabled = false;
  }
}

$("refresh-services").onclick = loadServices;

// Load customer's own top-up requests
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

// Submit a manual UPI top-up request
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
  $("topup-message").textContent = "Submitting your request...";

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

// Initial page loading
loadServices();
refreshSession();
