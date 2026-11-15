// Followbulk browser configuration. The publishable/anon key is designed for browser use.
// Never put a Supabase secret/service_role key in this file.
const SUPABASE_URL = "https://genlycxbfrjkwfaepmjc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_sT79tQnCQVGHXMn7sDXBew_pmih3eJ6";

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (id) => document.getElementById(id);
let authMode = "login";

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 3200);
}
function openAuth(mode) {
  authMode = mode;
  $("auth-title").textContent = mode === "signup" ? "Create your account" : "Login";
  $("auth-submit").textContent = mode === "signup" ? "Create account" : "Login";
  $("name-wrap").classList.toggle("hidden", mode !== "signup");
  $("auth-switch").textContent = mode === "signup" ? "Already registered? Login" : "New here? Create an account";
  $("auth-message").textContent = "";
  $("auth-dialog").showModal();
}
$("login-open").onclick = () => openAuth("login");
$("signup-open").onclick = () => openAuth("signup");
$("hero-signup").onclick = () => openAuth("signup");
$("auth-switch").onclick = () => openAuth(authMode === "signup" ? "login" : "signup");
$("logout").onclick = async () => { await client.auth.signOut(); toast("You are signed out."); };

$("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("email").value.trim();
  const password = $("password").value;
  $("auth-submit").disabled = true;
  $("auth-message").textContent = "Please wait…";
  try {
    let result;
    if (authMode === "signup") {
      result = await client.auth.signUp({
        email, password,
        options: { data: { full_name: $("full-name").value.trim() } }
      });
    } else {
      result = await client.auth.signInWithPassword({ email, password });
    }
    if (result.error) throw result.error;
    $("auth-message").textContent = authMode === "signup"
      ? "Account created. Check your email if confirmation is enabled, then log in."
      : "Login successful.";
    if (authMode === "login" || result.data.session) {
      $("auth-dialog").close();
      await refreshSession();
    }
  } catch (error) {
    $("auth-message").textContent = error.message || "Something went wrong.";
  } finally {
    $("auth-submit").disabled = false;
  }
});

async function refreshSession() {
  const { data: { session } } = await client.auth.getSession();
  const loggedIn = !!session;
  $("login-open").classList.toggle("hidden", loggedIn);
  $("signup-open").classList.toggle("hidden", loggedIn);
  $("logout").classList.toggle("hidden", !loggedIn);
  $("user-label").textContent = loggedIn ? session.user.email : "";
  $("auth-status").textContent = loggedIn ? `Signed in as ${session.user.email}` : "Sign in to view your account";
  $("topup-form").querySelector("button").disabled = !loggedIn;
  if (loggedIn) await loadWalletRequests(session.user.id);
  else $("wallet-requests").textContent = "Sign in to view requests.";
}
client.auth.onAuthStateChange(() => { refreshSession(); });

async function loadServices() {
  const holder = $("services-list");
  holder.innerHTML = '<div class="empty">Loading services…</div>';
  const { data, error } = await client.from("services")
    .select("id,name,category,description,rate,min_quantity,max_quantity")
    .eq("active", true).order("category").limit(60);
  if (error) {
    holder.innerHTML = `<div class="empty">Could not load services: ${escapeHtml(error.message)}</div>`;
    return;
  }
  if (!data || !data.length) {
    holder.innerHTML = '<div class="empty">No services have been published yet. The admin needs to sync and activate the service catalogue.</div>';
    return;
  }
  holder.innerHTML = data.map(s => `<article class="service-card"><div class="eyebrow">${escapeHtml(s.category || "GENERAL")}</div><h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.description || "Social media service")}</p><div class="service-meta"><span>₹${Number(s.rate).toFixed(2)} / 1,000</span><b>${Number(s.min_quantity)}–${Number(s.max_quantity).toLocaleString("en-IN")}</b></div></article>`).join("");
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
$("refresh-services").onclick = loadServices;

async function loadWalletRequests(userId) {
  const holder = $("wallet-requests");
  const { data, error } = await client.from("wallet_requests")
    .select("amount,utr_reference,status,created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
  if (error) { holder.textContent = "Unable to load requests."; return; }
  if (!data.length) { holder.textContent = "No top-up requests yet."; return; }
  holder.innerHTML = data.map(r => `<div class="request-row"><b>₹${Number(r.amount).toFixed(2)}</b> · ${escapeHtml(r.status)}<br><small>${escapeHtml(r.utr_reference || "")} · ${new Date(r.created_at).toLocaleString()}</small></div>`).join("");
}
$("topup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const { data: { user } } = await client.auth.getUser();
  if (!user) { openAuth("login"); return; }
  const amount = Number($("topup-amount").value);
  const utr = $("topup-utr").value.trim();
  if (!Number.isFinite(amount) || amount <= 0 || !utr) {
    $("topup-message").textContent = "Enter a valid amount and UPI reference.";
    return;
  }
  const button = $("topup-form").querySelector("button");
  button.disabled = true;
  $("topup-message").textContent = "Submitting…";
  const { error } = await client.from("wallet_requests").insert({
    user_id: user.id, amount, utr_reference: utr, status: "pending"
  });
  button.disabled = false;
  if (error) { $("topup-message").textContent = error.message; return; }
  $("topup-message").textContent = "Request submitted for manual review. Your wallet has not been credited yet.";
  $("topup-form").reset();
  await loadWalletRequests(user.id);
});

loadServices();
refreshSession();
