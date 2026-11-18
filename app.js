/* =========================================
   FOLLOWBULK - CUSTOMER + ADMIN APPLICATION
   ========================================= */

const SUPABASE_URL = "https://genylcxbfrjkwfaepmjc.supabase.co";
const SUPABASE_KEY = "sb_publishable_sT79tQnCQVGHXMn7sDXBew_pmih3eJ6";

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let isAdmin = false;
let services = [];
let selectedService = null;
let authMode = "login";

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatRupees(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? "₹" + amount.toFixed(2) : "₹0.00";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IN");
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3500);
}

function setMessage(id, message, type = "") {
  const element = $(id);
  if (!element) return;
  element.textContent = message;
  element.className = "message" + (type ? " " + type : "");
}

function setLoading(id, message) {
  const element = $(id);
  if (element) {
    element.textContent = message;
    element.className = "empty";
  }
}

function detectPlatform(service) {
  const text = `${service.name || ""} ${service.category || ""}`.toLowerCase();
  if (/instagram|\binsta\b/.test(text)) return "instagram";
  if (/youtube|\byt\b/.test(text)) return "youtube";
  if (/facebook|\bfb\b/.test(text)) return "facebook";
  if (/telegram|\btg\b/.test(text)) return "telegram";
  return "other";
}

function detectCategory(service) {
  const text = `${service.name || ""} ${service.category || ""} ${service.description || ""}`.toLowerCase();

  if (/follower|subscriber|member/.test(text)) return "Followers & Subscribers";
  if (/like|reaction/.test(text)) return "Likes & Reactions";
  if (/view|impression|watch/.test(text)) return "Views & Watch";
  if (/comment|reply/.test(text)) return "Comments";
  if (/share|forward/.test(text)) return "Shares";
  if (/save|bookmark/.test(text)) return "Saves";
  if (/story/.test(text)) return "Stories";
  if (/live|stream/.test(text)) return "Live & Streaming";

  return service.category || "Other Services";
}

/* AUTHENTICATION */

function openAuth(mode) {
  authMode = mode;
  $("auth-title").textContent = mode === "signup" ? "Create account" : "Login";
  $("auth-submit").textContent = mode === "signup" ? "Create account" : "Login";
  $("name-wrap").classList.toggle("hidden", mode !== "signup");

  $("auth-switch").textContent = mode === "signup"
    ? "Already registered? Login"
    : "New here? Create an account";

  $("auth-message").textContent = "";
  $("auth-dialog").showModal();
}

function closeAuth() {
  $("auth-dialog").close();
}

async function handleAuth(event) {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;
  const fullName = $("full-name").value.trim();
  const submit = $("auth-submit");

  if (authMode === "signup" && !fullName) {
    setMessage("auth-message", "Please enter your full name.");
    return;
  }

  submit.disabled = true;
  submit.textContent = "Please wait...";

  try {
    if (authMode === "signup") {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName }
        }
      });

      if (error) throw error;

      if (data.session) {
        setMessage("auth-message", "Account created successfully.", "success");
        await refreshSession();
        setTimeout(closeAuth, 800);
      } else {
        setMessage(
          "auth-message",
          "Account created. Check your email if confirmation is required.",
          "success"
        );
      }
    } else {
      const { error } = await client.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      setMessage("auth-message", "Login successful.", "success");
      await refreshSession();
      setTimeout(closeAuth, 500);
    }
  } catch (error) {
    setMessage("auth-message", error.message || "Authentication failed.");
  } finally {
    submit.disabled = false;
    submit.textContent = authMode === "signup" ? "Create account" : "Login";
  }
}

async function logout() {
  const { error } = await client.auth.signOut();

  if (error) {
    showToast(error.message);
    return;
  }

  await refreshSession();
  showToast("Logged out successfully.");
}

/* SESSION AND ROLE */

async function refreshSession() {
  const { data, error } = await client.auth.getSession();

  if (error) console.error(error);

  currentUser = data?.session?.user || null;
  currentProfile = null;
  isAdmin = false;

  if (currentUser) {
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id,email,full_name,role")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile loading error:", profileError);
    } else {
      currentProfile = profile;
      isAdmin = profile?.role === "admin";
    }
  }

  $("login-open").classList.toggle("hidden", !!currentUser);
  $("signup-open").classList.toggle("hidden", !!currentUser);
  $("logout").classList.toggle("hidden", !currentUser);
  $("admin-nav").classList.toggle("hidden", !isAdmin);
  $("admin-dashboard").classList.toggle("hidden", !isAdmin);

  $("user-label").textContent = currentUser
    ? (currentProfile?.full_name || currentUser.email)
    : "";

  $("auth-status").textContent = currentUser
    ? (isAdmin
      ? "Signed in as administrator"
      : "Signed in as " + currentUser.email)
    : "Sign in to view your account";

  $("account-info").textContent = currentUser
    ? `Welcome, ${currentProfile?.full_name || currentUser.email}. Your account is active.`
    : "Your account activity will appear here after login.";

  $("topup-amount").disabled = !currentUser;
  $("topup-utr").disabled = !currentUser;
  $("topup-form").querySelector("button").disabled = !currentUser;

  if (currentUser) {
    await Promise.all([
      loadWalletRequests(),
      loadWalletBalance()
    ]);
  } else {
    $("wallet-requests").textContent = "Sign in to view requests.";
    $("customer-balance").textContent = "₹—";
    $("customer-balance-message").textContent = "Sign in to view your balance.";
  }

  if (isAdmin) {
    await loadAdminDashboard();
  }
}

/* SERVICES */

async function loadServices() {
  const list = $("services-list");
  list.innerHTML = '<div class="empty">Loading services...</div>';

  try {
    const { data, error } = await client
      .from("services")
      .select("id,name,category,description,rate,min_quantity,max_quantity")
      .eq("active", true)
      .order("category", { ascending: true })
      .limit(1000);

    if (error) throw error;

    services = data || [];
    updateCategoryOptions();
    renderServices();

  } catch (error) {
    list.innerHTML = '<div class="empty">Unable to load services. Please refresh and try again.</div>';
    $("service-count").textContent = "Service catalogue unavailable";
    console.error("Service loading error:", error);
  }
}

function updateCategoryOptions() {
  const platform = $("platform-filter").value;

  const categories = [...new Set(
    services
      .filter(service =>
        platform === "all" || detectPlatform(service) === platform
      )
      .map(detectCategory)
  )].sort();

  const select = $("category-filter");
  const previous = select.value;

  select.innerHTML = '<option value="all">All categories</option>';

  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });

  if (categories.includes(previous)) {
    select.value = previous;
  }
}

function renderServices() {
  const search = $("service-search").value.trim().toLowerCase();
  const platform = $("platform-filter").value;
  const category = $("category-filter").value;

  const filtered = services.filter(service => {
    const servicePlatform = detectPlatform(service);
    const serviceCategory = detectCategory(service);

    const searchable = [
      service.name,
      service.category,
      service.description,
      serviceCategory,
      servicePlatform
    ].join(" ").toLowerCase();

    return (
      (platform === "all" || servicePlatform === platform) &&
      (category === "all" || serviceCategory === category) &&
      searchable.includes(search)
    );
  });

  $("service-count").textContent =
    `Showing ${filtered.length} of ${services.length} services`;

  const list = $("services-list");

  if (!filtered.length) {
    list.innerHTML = '<div class="empty">No services found. Try another search or filter.</div>';
    return;
  }

  list.innerHTML = filtered.map(service => `
    <article class="service-row">
      <div class="service-info">
        <strong>${escapeHTML(service.name)}</strong>
        <div class="service-tags">
          <span>${escapeHTML(detectPlatform(service))}</span>
          <span>${escapeHTML(detectCategory(service))}</span>
        </div>
      </div>

      <div class="service-price">
        <strong>${formatRupees(service.rate)}</strong>
        <small>per 1,000</small>
      </div>

      <div class="service-limits">
        <small>Min: ${escapeHTML(service.min_quantity)}</small>
        <small>Max: ${escapeHTML(service.max_quantity)}</small>
      </div>

      <button class="btn btn-small select-service"
        data-id="${escapeHTML(service.id)}">
        Select
      </button>
    </article>
  `).join("");
}

function selectService(id) {
  selectedService = services.find(
    service => String(service.id) === String(id)
  );

  if (!selectedService) return;

  $("selected-service-name").value = selectedService.name;
  $("selected-service-rate").textContent = formatRupees(selectedService.rate);
  $("selected-service-min").textContent = selectedService.min_quantity;
  $("selected-service-max").textContent = selectedService.max_quantity;

  $("order-message").textContent =
    "Service selected. Order placement is not active yet.";

  $("order-now").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

/* CUSTOMER WALLET */

async function submitTopup(event) {
  event.preventDefault();

  if (!currentUser) {
    setMessage(
      "topup-message",
      "Please login before submitting a top-up request."
    );
    return;
  }

  const amount = Number($("topup-amount").value);
  const utr = $("topup-utr").value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    setMessage("topup-message", "Enter a valid amount.");
    return;
  }

  if (!utr) {
    setMessage("topup-message", "Enter your UPI payment reference.");
    return;
  }

  const button = $("topup-form").querySelector("button");
  button.disabled = true;
  button.textContent = "Submitting...";

  try {
    const { error } = await client
      .from("wallet_requests")
      .insert({
        user_id: currentUser.id,
        amount,
        utr_reference: utr,
        status: "pending"
      });

    if (error) throw error;

    setMessage(
      "topup-message",
      "Request submitted for manual verification.",
      "success"
    );

    $("topup-form").reset();
    await loadWalletRequests();

  } catch (error) {
    setMessage("topup-message", error.message || "Unable to submit request.");
  } finally {
    button.disabled = !currentUser;
    button.textContent = "Submit top-up request";
  }
}

async function loadWalletRequests() {
  if (!currentUser) return;

  const holder = $("wallet-requests");
  holder.textContent = "Loading requests...";

  try {
    const { data, error } = await client
      .from("wallet_requests")
      .select("id,amount,utr_reference,status,created_at,admin_note")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!data?.length) {
      holder.textContent = "No top-up requests yet.";
      return;
    }

    holder.innerHTML = data.map(request => `
      <div class="request-row">
        <div>
          <strong>${formatRupees(request.amount)}</strong>
          <small>
            ${escapeHTML(request.utr_reference)}
            · ${formatDate(request.created_at)}
          </small>

          ${request.admin_note
            ? `<small>Admin note: ${escapeHTML(request.admin_note)}</small>`
            : ""}
        </div>

        <span class="request-status ${escapeHTML(request.status)}">
          ${escapeHTML(request.status)}
        </span>
      </div>
    `).join("");

  } catch (error) {
    holder.textContent = "Unable to load your requests.";
    console.error("Wallet request error:", error);
  }
}

async function loadWalletBalance() {
  if (!currentUser) return;

  try {
    const { data, error } = await client.rpc("wallet_balance");

    if (error) throw error;

    $("customer-balance").textContent = formatRupees(data);
    $("customer-balance-message").textContent =
      "Balance from your wallet ledger.";

  } catch (error) {
    $("customer-balance").textContent = "Unavailable";
    $("customer-balance-message").textContent =
      "Balance could not be loaded.";

    console.error("Wallet balance error:", error);
  }
}

/* ADMIN DASHBOARD */

async function loadAdminDashboard() {
  if (!currentUser || !isAdmin) return;

  setLoading("admin-wallet-list", "Loading wallet requests...");
  setLoading("admin-customer-list", "Loading customers...");
  setLoading("admin-order-list", "Loading orders...");

  await Promise.all([
    loadAdminStats(),
    loadAdminWalletRequests(),
    loadAdminCustomers(),
    loadAdminOrders()
  ]);
}

async function loadAdminStats() {
  try {
    const results = await Promise.all([
      client.from("profiles")
        .select("id", { count: "exact", head: true }),

      client.from("orders")
        .select("id", { count: "exact", head: true }),

      client.from("wallet_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),

      client.from("services")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
    ]);

    const [customers, orders, pending, serviceCount] = results;

    if (customers.error) throw customers.error;
    if (orders.error) throw orders.error;
    if (pending.error) throw pending.error;
    if (serviceCount.error) throw serviceCount.error;

    $("admin-customer-count").textContent = customers.count ?? 0;
    $("admin-order-count").textContent = orders.count ?? 0;
    $("admin-pending-count").textContent = pending.count ?? 0;
    $("admin-service-count").textContent = serviceCount.count ?? 0;

  } catch (error) {
    setMessage(
      "admin-message",
      "Some dashboard statistics could not be loaded: " + error.message
    );

    console.error("Admin stats error:", error);
  }
}

async function loadAdminWalletRequests() {
  if (!isAdmin) return;

  const holder = $("admin-wallet-list");

  try {
    const { data, error } = await client
      .from("wallet_requests")
      .select("id,user_id,amount,utr_reference,status,created_at,admin_note")
      .order("created_at", { ascending: false })
     .limit(100);

    if (error) throw error;

    if (!data?.length) {
      holder.textContent = "No wallet requests found.";
      return;
    }

    const userIds = [...new Set(data.map(item => item.user_id))];

    const { data: profiles, error: profileError } = await client
      .from("profiles")
      .select("id,email,full_name")
      .in("id", userIds);

    if (profileError) throw profileError;

    const profileMap = new Map(
      (profiles || []).map(profile => [profile.id, profile])
    );
holder.innerHTML = data.map(request => {
      const profile = profileMap.get(request.user_id) || {};
      const pending = request.status === "pending";

      return `
        <div class="admin-request-row">
          <div class="admin-request-details">
            <strong>
              ${formatRupees(request.amount)}
              · ${escapeHTML(profile.full_name || profile.email || "Customer")}
            </strong>

            <small>Email: ${escapeHTML(profile.email || "Not available")}</small>
            <small>UTR: ${escapeHTML(request.utr_reference)}</small>
            <small>Submitted: ${formatDate(request.created_at)}</small>

            <span class="request-status ${escapeHTML(request.status)}">
              ${escapeHTML(request.status)}
            </span>

            ${request.admin_note
              ? `<small>Note: ${escapeHTML(request.admin_note)}</small>`
              : ""}
          </div>

          ${pending ? `
            <div class="admin-actions">
              <button class="btn btn-small approve-wallet"
                data-id="${escapeHTML(request.id)}">
                Approve
              </button>

              <button class="btn btn-small btn-danger reject-wallet"
                data-id="${escapeHTML(request.id)}">
                Reject
              </button>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");

  } catch (error) {
    holder.textContent =
      "Unable to load wallet requests: " + error.message;

    console.error("Admin wallet error:", error);
  }
}

async function approveWalletRequest(requestId) {
  if (!isAdmin) return;
const confirmed = confirm(
    "Approve this wallet request?\n\nOnly approve after independently verifying the payment in your UPI app."
  );

  if (!confirmed) return;

  setMessage("admin-message", "Processing approval...");

  try {
    const { error } = await client.rpc("approve_wallet_request", {
      p_request_id: requestId,
      p_admin_note: "Payment manually verified by administrator."
    });

    if (error) throw error;

    showToast("Wallet request approved.");

    setMessage(
      "admin-message",
      "Request approved and ledger credit recorded.",
      "success"
    );

    await Promise.all([
      loadAdminWalletRequests(),
      loadAdminStats()
    ]);

  } catch (error) {
    setMessage("admin-message", "Approval failed: " + error.message);
    console.error("Approval error:", error);
  }
}

async function rejectWalletRequest(requestId) {
  if (!isAdmin) return;

  const note = prompt("Enter a reason for rejecting this request:");

  if (note === null) return;

  if (!note.trim()) {
    showToast("Please enter a rejection reason.");
    return;
  }
setMessage("admin-message", "Processing rejection...");

  try {
    const { error } = await client
      .from("wallet_requests")
      .update({
        status: "rejected",
        admin_note: note.trim(),
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", requestId)
      .eq("status", "pending");

    if (error) throw error;

    showToast("Wallet request rejected.");

    setMessage("admin-message", "Request rejected.", "success");

    await Promise.all([
      loadAdminWalletRequests(),
      loadAdminStats()
    ]);

  } catch (error) {
    setMessage("admin-message", "Rejection failed: " + error.message);
    console.error("Rejection error:", error);
  }
}

/* ADMIN CUSTOMERS */

async function loadAdminCustomers() {
  if (!isAdmin) return;

  const holder = $("admin-customer-list");

  try {
    const { data, error } = await client
      .from("profiles")
     .select("id,email,full_name,role,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    if (!data?.length) {
      holder.textContent = "No customer accounts found.";
      return;
    }

    holder.innerHTML = data.map(profile => `
      <div class="admin-list-row">
        <div>
          <strong>${escapeHTML(profile.full_name || "Unnamed customer")}</strong>
          <small>${escapeHTML(profile.email || "")}</small>
          <small>Joined: ${formatDate(profile.created_at)}</small>
        </div>

        <span class="request-status">
          ${escapeHTML(profile.role)}
        </span>
      </div>
    `).join("");

  } catch (error) {
    holder.textContent =
      "Unable to load customers: " + error.message;

    console.error("Admin customers error:", error);
  }
}

/* ADMIN ORDERS - ADDED MISSING FUNCTION */

async function loadAdminOrders() {
  if (!currentUser || !isAdmin) return;

  const holder = $("admin-order-list");

  if (!holder) return;

  holder.textContent = "Loading orders...";

try {
    const { data: orders, error } = await client
      .from("orders")
      .select(`
        id,
        user_id,
        provider_order_id,
        service_name,
        target_url,
        quantity,
        charge,
        status,
        start_count,
        remains,
        created_at
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    if (!orders || orders.length === 0) {
      holder.textContent = "No orders found.";
      return;
    }

    const userIds = [
      ...new Set(orders.map(order => order.user_id))
    ];

    const { data: profiles, error: profileError } = await client
      .from("profiles")
      .select("id,email,full_name")
      .in("id", userIds);

    if (profileError) throw profileError;

    const profileMap = new Map(
      (profiles || []).map(profile => [profile.id, profile])
    );

    holder.innerHTML = orders.map(order => {
      const profile = profileMap.get(order.user_id) || {};

return `
        <div class="admin-list-row">
          <div>
            <strong>${escapeHTML(order.service_name || "Service")}</strong>

            <small>
              Customer:
              ${escapeHTML(profile.full_name || profile.email || "Unknown")}
            </small>

            <small>
              Email: ${escapeHTML(profile.email || "Unavailable")}
            </small>

            <small>
              Target: ${escapeHTML(order.target_url || "—")}
            </small>

            <small>
              Quantity: ${escapeHTML(order.quantity)}
            </small>

            <small>
              Charge: ${formatRupees(order.charge)}
            </small>

            <small>
              Provider order:
              ${escapeHTML(order.provider_order_id || "Not submitted")}
            </small>

            <small>
              Start count: ${escapeHTML(order.start_count ?? "—")}
            </small>

            <small>
              Remaining: ${escapeHTML(order.remains ?? "—")}
            </small>

            <small>
              Created: ${formatDate(order.created_at)}
            </small>
          </div>

<span class="request-status ${escapeHTML(order.status || "pending")}">
            ${escapeHTML(order.status || "pending")}
          </span>
        </div>
      `;
    }).join("");

  } catch (error) {
    holder.textContent =
      "Unable to load orders: " + error.message;

    console.error("Admin orders error:", error);
  }
}

async function loadAdminOrders() {
  if (!currentUser || !isAdmin) return;

  const holder = $("admin-order-list");
  if (!holder) return;

  holder.textContent = "Loading orders...";

  try {
    const { data, error } = await client
      .from("orders")
      .select("id,user_id,provider_order_id,service_name,target_url,quantity,charge,status,start_count,remains,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    if (!data || data.length === 0) {
      holder.textContent = "No orders found yet.";
      return;
    }

    const userIds = [...new Set(data.map(order => order.user_id))];

    const { data: profiles, error: profileError } = await client
      .from("profiles")
      .select("id,email,full_name")
      .in("id", userIds);

    if (profileError) throw profileError;

    const profileMap = new Map(
      (profiles || []).map(profile => [profile.id, profile])
    );

    holder.innerHTML = data.map(order => {
      const profile = profileMap.get(order.user_id) || {};

      return `
        <div class="admin-list-row">
          <div>
            <strong>${escapeHTML(order.service_name || "Service")}</strong>
            <small>Customer: ${escapeHTML(profile.full_name || profile.email || "Unknown")}</small>
            <small>Email: ${escapeHTML(profile.email || "Unavailable")}</small>
            <small>Quantity: ${escapeHTML(order.quantity)}</small>
            <small>Charge: ${formatRupees(order.charge)}</small>
            <small>Target: ${escapeHTML(order.target_url || "Not available")}</small>
            <small>Status: ${escapeHTML(order.status || "Unknown")}</small>
            <small>Provider ID: ${escapeHTML(order.provider_order_id || "Not assigned")}</small>
            <small>Date: ${formatDate(order.created_at)}</small>
          </div>
        </div>
      `;
    }).join("");

  } catch (error) {
    holder.textContent = "Unable to load orders: " + error.message;
    console.error("Admin orders error:", error);
  }
}

/* EVENT HANDLERS */

function setupEvents() {
  $("login-open").addEventListener("click", () => openAuth("login"));
  $("signup-open").addEventListener("click", () => openAuth("signup"));
  $("hero-signup").addEventListener("click", () => openAuth("signup"));

  $("auth-switch").addEventListener("click", () => {
    openAuth(authMode === "login" ? "signup" : "login");
  });

  $("auth-form").addEventListener("submit", handleAuth);
  $("logout").addEventListener("click", logout);

  $("service-search").addEventListener("input", renderServices);

  $("platform-filter").addEventListener("change", () => {
    $("category-filter").value = "all";
    updateCategoryOptions();
    renderServices();
  });

$("category-filter").addEventListener("change", renderServices);

  $("services-list").addEventListener("click", event => {
    const button = event.target.closest(".select-service");

    if (button) {
      selectService(button.dataset.id);
    }
  });

  $("refresh-services").addEventListener("click", loadServices);
  $("topup-form").addEventListener("submit", submitTopup);

  $("admin-refresh-wallet").addEventListener(
    "click",
    loadAdminWalletRequests
  );

  $("admin-refresh-customers").addEventListener(
    "click",
    loadAdminCustomers
  );

  $("admin-refresh-orders").addEventListener(
    "click",
    loadAdminOrders
  );

  $("admin-wallet-list").addEventListener("click", event => {
    const approve = event.target.closest(".approve-wallet");
    const reject = event.target.closest(".reject-wallet");

    if (approve) {
      approveWalletRequest(approve.dataset.id);
    }

    if (reject) {
      rejectWalletRequest(reject.dataset.id);
    }
  });

  client.auth.onAuthStateChange(() => {
    setTimeout(() => refreshSession(), 0);
  });
}

/* START APPLICATION */

async function init() {
  setupEvents();

  await Promise.all([
    refreshSession(),
    loadServices()
  ]);
}

document.addEventListener("DOMContentLoaded", init);
