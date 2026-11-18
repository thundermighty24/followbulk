
const SUPABASE_URL = "https://genylcxbfrjkwfaepmjc.supabase.co";
const SUPABASE_KEY = "sb_publishable_sT79tQnCQVGHXMn7sDXBew_pm3hJ6";

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentRole = "customer";
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
  return Number.isFinite(amount) ? "₹" + amount.toFixed(2) : "—";
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN");
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

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function setMessage(id, message, type = "") {
  const element = $(id);
  if (!element) return;
  element.textContent = message;
  element.className = "message" + (type ? " " + type : "");
}

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

  if (authMode === "signup" && !fullName) {
    setMessage("auth-message", "Please enter your full name.");
    return;
  }

  const submit = $("auth-submit");
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
          "Account created. Please check your email if confirmation is required.",
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

/* USER ROLE AND SESSION */

async function refreshSession() {
  const { data } = await client.auth.getSession();
  currentUser = data.session?.user || null;
  currentRole = "customer";

  if (currentUser) {
    const { data: profile, error } = await client
      .from("profiles")
      .select("role,full_name")
      .eq("id", currentUser.id)
      .single();

    if (error) {
      console.error("Profile loading error:", error);
      showToast("Unable to verify your account role.");
    } else {
      currentRole = profile?.role || "customer";
    }
  }

  const isAdmin = currentUser && currentRole === "admin";

  $("login-open").classList.toggle("hidden", !!currentUser);
  $("signup-open").classList.toggle("hidden", !!currentUser);
  $("logout").classList.toggle("hidden", !currentUser);

  $("admin-nav").classList.toggle("hidden", !isAdmin);
  $("admin-dashboard").classList.toggle("hidden", !isAdmin);

  $("user-label").textContent = currentUser
    ? (currentUser.user_metadata?.full_name || currentUser.email)
    : "";

  $("auth-status").textContent = currentUser
    ? (isAdmin ? "Signed in as administrator" : "Signed in as " + currentUser.email)
    : "Sign in to view your account";

  $("topup-amount").disabled = !currentUser;
  $("topup-utr").disabled = !currentUser;
  $("topup-form").querySelector("button").disabled = !currentUser;

  if (currentUser) {
    await loadWalletRequests();
    if (isAdmin) {
      await loadAdminDashboard();
    }
  } else {
    $("wallet-requests").textContent = "Sign in to view requests.";
    clearAdminDashboard();
  }
}

function clearAdminDashboard() {
  $("admin-customer-count").textContent = "—";
  $("admin-order-count").textContent = "—";
  $("admin-pending-count").textContent = "—";
  $("admin-service-count").textContent = "—";
  $("admin-wallet-list").textContent = "Admin login required.";
  $("admin-customer-list").textContent = "Admin login required.";
  $("admin-order-list").textContent = "Admin login required.";
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
      .filter(service => platform === "all" || detectPlatform(service) === platform)
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
      <button class="btn btn-small select-service" data-id="${escapeHTML(service.id)}">Select</button>
    </article>
  `).join("");
}

function selectService(id) {
  selectedService = services.find(service => String(service.id) === String(id));
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

/* CUSTOMER WALLET REQUESTS */

async function submitTopup(event) {
  event.preventDefault();

  if (!currentUser) {
    setMessage("topup-message", "Please login before submitting a top-up request.");
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
      "Your request was submitted for manual verification.",
      "success"
    );

    $("topup-form").reset();
    await loadWalletRequests();

    if (currentRole === "admin") {
      await loadAdminDashboard();
    }
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
      .select("id,amount,utr_reference,status,created_at")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!data || !data.length) {
      holder.textContent = "No top-up requests yet.";
      return;
    }

    holder.innerHTML = data.map(request => `
      <div class="request-row">
        <div>
          <strong>${formatRupees(request.amount)}</strong>
          <small>${escapeHTML(request.utr_reference)}</small>
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

/* ADMIN DASHBOARD */

async function loadAdminDashboard() {
  if (!currentUser || currentRole !== "admin") return;

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
      client.from("profiles").select("id", { count: "exact", head: true }),
      client.from("orders").select("id", { count: "exact", head: true }),
      client.from("wallet_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      client.from("services").select("id", { count: "exact", head: true })
    ]);

    results.forEach(result => {
      if (result.error) throw result.error;
    });

    $("admin-customer-count").textContent = results[0].count ?? "—";
    $("admin-order-count").textContent = results[1].count ?? "—";
    $("admin-pending-count").textContent = results[2].count ?? "—";
    $("admin-service-count").textContent = results[3].count ?? "—";
  } catch (error) {
    console.error("Admin statistics error:", error);
    showToast("Unable to load some dashboard statistics.");
  }
}

async function loadAdminWalletRequests() {
  const holder = $("admin-wallet-list");

  if (currentRole !== "admin") return;

  holder.textContent = "Loading wallet requests...";

  try {
    const { data, error } = await client
      .from("wallet_requests")
      .select("id,user_id,amount,utr_reference,status,admin_note,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    if (!data || !data.length) {
      holder.textContent = "No wallet requests found.";
      return;
    }

    holder.innerHTML = data.map(request => `
      <div class="admin-request-row">
        <div class="admin-request-details">
          <strong>${formatRupees(request.amount)}</strong>
          <small>UTR: ${escapeHTML(request.utr_reference)}</small>
          <small>User ID: ${escapeHTML(request.user_id)}</small>
          <small>${formatDate(request.created_at)}</small>
          <span class="request-status ${escapeHTML(request.status)}">
            ${escapeHTML(request.status)}
          </span>
          ${request.admin_note ? `<small>Note: ${escapeHTML(request.admin_note)}</small>` : ""}
        </div>
        ${request.status === "pending" ? `
          <div class="admin-actions">
            <button class="btn btn-small approve-wallet" data-id="${escapeHTML(request.id)}">Approve</button>
            <button class="btn btn-small btn-danger reject-wallet" data-id="${escapeHTML(request.id)}">Reject</button>
          </div>
        ` : ""}
      </div>
    `).join("");
  } catch (error) {
    holder.textContent = "Unable to load wallet requests.";
    console.error("Admin wallet error:", error);
  }
}

async function reviewWalletRequest(id, action) {
  if (!currentUser || currentRole !== "admin") {
    showToast("Administrator access required.");
    return;
  }

  const note = action === "rejected"
    ? (prompt("Enter a reason for rejecting this request:") || "").trim()
    : (prompt("Optional admin note:") || "").trim();

  if (action === "rejected" && !note) {
    showToast("Please enter a rejection reason.");
    return;
  }

  if (!confirm(`Are you sure you want to ${action} this wallet request?`)) {
    return;
  }

  try {
    let error;

    if (action === "approved") {
      const result = await client.rpc("approve_wallet_request", {
        p_request_id: id,
        p_admin_note: note || null
      });
      error = result.error;
    } else {
      const result = await client
        .from("wallet_requests")
        .update({
          status: "rejected",
          admin_note: note,
          reviewed_by: currentUser.id,
          reviewed_at: new Date().toISOString()
        })
        .eq("id", id)
        .eq("status", "pending");

      error = result.error;
    }

    if (error) throw error;

    showToast(`Wallet request ${action}.`);
    await loadAdminDashboard();
    await loadWalletRequests();
  } catch (error) {
    console.error("Wallet review error:", error);
    showToast(error.message || "Unable to review this request.");
  }
}

async function loadAdminCustomers() {
  const holder = $("admin-customer-list");

  if (currentRole !== "admin") return;

  holder.textContent = "Loading customers...";

  try {
    const { data, error } = await client
      .from("profiles")
      .select("id,email,full_name,role,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    if (!data || !data.length) {
      holder.textContent = "No customer accounts found.";
      return;
    }

    holder.innerHTML = data.map(customer => `
      <div class="admin-list-row">
        <div>
          <strong>${escapeHTML(customer.full_name || "No name")}</strong>
          <small>${escapeHTML(customer.email)}</small>
          <small>${formatDate(customer.created_at)}</small>
        </div>
        <span class="request-status ${customer.role === "admin" ? "approved" : "pending"}">
          ${escapeHTML(customer.role)}
        </span>
      </div>
    `).join("");
  } catch (error) {
    holder.textContent = "Unable to load customers.";
    console.error("Admin customers error:", error);
  }
}

async function loadAdminOrders() {
  const holder = $("admin-order-list");

  if (currentRole !== "admin") return;

  holder.textContent = "Loading orders...";

  try {
    const { data, error } = await client
      .from("orders")
      .select("id,user_id,service_name,target_url,quantity,charge,status,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    if (!data || !data.length) {
      holder.textContent = "No orders found.";
      return;
    }

    holder.innerHTML = data.map(order => `
      <div class="admin-list-row">
        <div>
          <strong>${escapeHTML(order.service_name || "Service")}</strong>
          <small>Quantity: ${escapeHTML(order.quantity)}</small>
          <small>Charge: ${formatRupees(order.charge)}</small>
          <small>Customer ID: ${escapeHTML(order.user_id)}</small>
          <small>Target: ${escapeHTML(order.target_url || "—")}</small>
          <small>${formatDate(order.created_at)}</small>
        </div>
        <span class="request-status ${escapeHTML(order.status)}">
          ${escapeHTML(order.status)}
        </span>
      </div>
    `).join("");
  } catch (error) {
    holder.textContent = "Unable to load orders.";
    console.error("Admin orders error:", error);
  }
}

/* EVENTS */

function setupEvents() {
  $("login-open").addEventListener("click", () => openAuth("login"));
  $("signup-open").addEventListener("click", () => openAuth("signup"));
  $("hero-signup").addEventListener("click", () => openAuth("signup"));

  $("auth-switch").addEventListener("click", () => {
    openAuth(authMode === "login" ? "signup" : "login");
  });

  $("auth-form").addEventListener("submit", handleAuth);

  $("logout").addEventListener("click", async () => {
    const { error } = await client.auth.signOut();

    if (error) {
      showToast(error.message);
      return;
    }

    await refreshSession();
    showToast("Logged out successfully.");
  });

  $("service-search").addEventListener("input", renderServices);

  $("platform-filter").addEventListener("change", () => {
    $("category-filter").value = "all";
    upd
