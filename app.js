
/* =========================================
   FOLLOWBULK - CUSTOMER + ADMIN APPLICATION
   WITH CATEGORY-FILTERED PRICING MANAGEMENT
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
let selectedPricingService = null;
let pendingOrderIdempotencyKey = null;
let authMode = "login";

let defaultMarkup = 30;
let categoryMarkups = {};
let pricingViewData = {};

/* BASIC HELPERS */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
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

function validMarkup(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 10000;
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
  updateOrderFormAvailability();

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

    if (services.length) {
      await loadCustomerPrices();
    }
  } else {
    $("wallet-requests").textContent = "Sign in to view requests.";
    $("customer-balance").textContent = "₹—";
    $("customer-balance-message").textContent = "Sign in to view your balance.";

    services.forEach(service => {
      service.customer_rate = null;
    });

    renderServices();
  }

  if (isAdmin) {
    await loadAdminDashboard();
    await loadAdminPricing();
  }
}

/* SERVICES */

async function loadServices() {
  const list = $("services-list");
  list.innerHTML = '<div class="empty">Loading services...</div>';

  try {
    const { data, error } = await client
      .from("services")
      .select("id,name,category,description,rate,min_quantity,max_quantity,markup_percent")
      .eq("active", true)
      .order("category", { ascending: true })
      .limit(1000);

    if (error) throw error;

    services = data || [];

    updateCategoryOptions();
    populatePricingCategories();
    populatePricingServiceCategories();

    if (currentUser) {
      await loadCustomerPrices();
    } else {
      renderServices();
    }

    if (isAdmin) {
      await loadAdminPricing();
    }

  } catch (error) {
    list.innerHTML = '<div class="empty">Unable to load services. Please refresh and try again.</div>';
    $("service-count").textContent = "Service catalogue unavailable";
    console.error("Service loading error:", error);
  }
}

/* CUSTOMER SELLING PRICES */

async function loadCustomerPrices() {
  if (!currentUser || !services.length) {
    renderServices();
    return;
  }

  try {
    const { data, error } = await client
      .from("services_with_pricing")
      .select("*")
      .limit(1000);

    if (error) throw error;

    pricingViewData = {};

    (data || []).forEach(item => {
      pricingViewData[String(item.id)] = item;
    });

    services = services.map(service => {
      const pricing = pricingViewData[String(service.id)];

      return {
        ...service,
        customer_rate: pricing ? Number(pricing.customer_rate) : null,
        effective_markup: pricing
          ? Number(pricing.effective_markup ?? pricing.markup_percent)
          : null
      };
    });

    // Refresh the selected service object after login/pricing reload so its
    // customer_rate is current even if it was selected before signing in.
    if (selectedService) {
      selectedService = services.find(
        service => String(service.id) === String(selectedService.id)
      ) || null;

      if (selectedService) {
        $("selected-service-rate").textContent =
          Number.isFinite(Number(selectedService.customer_rate))
            ? formatRupees(selectedService.customer_rate)
            : "Login to view price";
        updateOrderEstimate();
        updateOrderFormAvailability();
      }
    }

    renderServices();

  } catch (error) {
    console.error("Customer pricing could not be loaded:", error);

    services = services.map(service => ({
      ...service,
      customer_rate: null
    }));

    renderServices();
  }
}

/* SERVICE CATEGORY FILTERS */

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
        <strong>${
          Number.isFinite(Number(service.customer_rate))
            ? formatRupees(service.customer_rate)
            : "Login to view price"
        }</strong>
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

  $("selected-service-rate").textContent =
    Number.isFinite(Number(selectedService.customer_rate))
      ? formatRupees(selectedService.customer_rate)
      : "Login to view price";

  $("selected-service-min").textContent = selectedService.min_quantity;
  $("selected-service-max").textContent = selectedService.max_quantity;

  const min = Number(selectedService.min_quantity);
  const max = Number(selectedService.max_quantity);
  const quantityInput = $("order-quantity");

  quantityInput.min = Number.isSafeInteger(min) && min > 0 ? String(min) : "1";
  quantityInput.max = Number.isSafeInteger(max) && max >= min ? String(max) : "";
  quantityInput.value = quantityInput.min;

  setMessage(
    "order-message",
    currentUser
      ? "Service selected. Enter your target URL and quantity."
      : "Service selected. Please log in before placing an order."
  );

  updateOrderEstimate();
  updateOrderFormAvailability();

  $("order-now").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function updateOrderFormAvailability() {
  const button = $("place-order-button");
  const urlInput = $("order-target-url");
  const quantityInput = $("order-quantity");

  if (!button || !urlInput || !quantityInput) return;

  const canOrder = Boolean(currentUser && selectedService);
  button.disabled = !canOrder;
  urlInput.disabled = !currentUser;
  quantityInput.disabled = !canOrder;
}

function updateOrderEstimate() {
  const estimate = $("order-estimated-total");
  if (!estimate) return;

  const rate = Number(selectedService?.customer_rate);
  const quantity = Number($("order-quantity")?.value);

  if (!selectedService || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
    estimate.textContent = "—";
    return;
  }

  estimate.textContent = formatRupees(rate * quantity / 1000);
}

function createOrderIdempotencyKey() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return "fb-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

async function submitOrder(event) {
  event.preventDefault();

  if (!currentUser) {
    setMessage("order-message", "Please log in before placing an order.");
    openAuth("login");
    return;
  }

  if (!selectedService) {
    setMessage("order-message", "Please select a service from the catalogue first.");
    return;
  }

  const quantity = Number($("order-quantity").value);
  const targetUrl = $("order-target-url").value.trim();
  const min = Number(selectedService.min_quantity);
  const max = Number(selectedService.max_quantity);
  const customerRate = Number(selectedService.customer_rate);

  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity < min || quantity > max) {
    setMessage("order-message", `Enter a whole-number quantity between ${min} and ${max}.`);
    return;
  }

  if (!Number.isFinite(customerRate) || customerRate <= 0) {
    setMessage("order-message", "The selling price is unavailable. Refresh the catalogue and try again.");
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (_) {
    setMessage("order-message", "Enter a valid target URL, including https://");
    return;
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol) || targetUrl.length > 2000) {
    setMessage("order-message", "Enter a valid http or https target URL (maximum 2,000 characters).");
    return;
  }

  const button = $("place-order-button");
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Submitting order...";
  setMessage("order-message", "Checking your login and submitting your order...");

  // Keep the same key after an uncertain network response. A retry with this key
  // cannot create or submit a second order.
  if (!pendingOrderIdempotencyKey) {
    pendingOrderIdempotencyKey = createOrderIdempotencyKey();
  }

  try {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;

    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      pendingOrderIdempotencyKey = null;
      setMessage("order-message", "Your login session has expired. Please log in again.");
      openAuth("login");
      return;
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/gcsmm-place-order`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        service_id: Number(selectedService.id),
        quantity,
        target_url: targetUrl,
        idempotency_key: pendingOrderIdempotencyKey
      })
    });

    const result = await response.json().catch(() => ({}));

    if (result.pending) {
      setMessage(
        "order-message",
        `${result.message || "Your order is awaiting provider verification."} Order reference: ${result.order_id || "available in your order records"}. Do not submit a new order for this request.`
      );
      await Promise.all([loadWalletBalance(), isAdmin ? loadAdminOrders() : Promise.resolve()]);
      return;
    }

    if (result.refunded) {
      pendingOrderIdempotencyKey = null;
      setMessage("order-message", `${result.message || "The provider rejected the order and your wallet was refunded."} Reference: ${result.order_id || "—"}`, "success");
      await Promise.all([loadWalletBalance(), isAdmin ? loadAdminOrders() : Promise.resolve()]);
      return;
    }

    if (response.ok && result.success) {
      const existingOrder = result.order || {};

      if (result.existing && !existingOrder.provider_order_id && existingOrder.status === "pending") {
        setMessage(
          "order-message",
          `This request already exists and is still pending provider verification. It was not submitted twice. Order reference: ${existingOrder.id || "—"}. Please do not create another request for the same order.`
        );
      } else {
        pendingOrderIdempotencyKey = null;
        setMessage(
          "order-message",
          `${result.message || "Your order was successfully submitted."} Order reference: ${existingOrder.id || "—"}. Provider reference: ${existingOrder.provider_order_id || "pending"}.`,
          "success"
        );
        $("order-target-url").value = "";
        $("order-quantity").value = $("order-quantity").min || "1";
        updateOrderEstimate();
      }

      await Promise.all([
        loadWalletBalance(),
        isAdmin ? Promise.all([loadAdminOrders(), loadAdminStats()]) : Promise.resolve()
      ]);
      return;
    }

    // A definite HTTP/application error means the server returned a response.
    // Retain the key only for pending/uncertain cases, handled above.
    pendingOrderIdempotencyKey = null;
    setMessage("order-message", result.message || `Order could not be submitted (HTTP ${response.status}). Please review your details and try again.`);

    if (response.status === 401) {
      await refreshSession();
      openAuth("login");
    }

    await Promise.all([loadWalletBalance(), isAdmin ? loadAdminOrders() : Promise.resolve()]);

  } catch (error) {
    console.error("Followbulk order submission error:", error);
    setMessage(
      "order-message",
      "We could not confirm the server response. Do not create a new order. You can press the button again to safely retry this same request."
    );
  } finally {
    button.disabled = !(currentUser && selectedService);
    button.textContent = pendingOrderIdempotencyKey ? "Retry same request" : originalLabel;
  }
}

/* CUSTOMER WALLET */

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

    setMessage("topup-message", "Request submitted for manual verification.", "success");

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
    $("customer-balance-message").textContent = "Balance from your wallet ledger.";

  } catch (error) {
    $("customer-balance").textContent = "Unavailable";
    $("customer-balance-message").textContent = "Balance could not be loaded.";

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
      client.from("profiles").select("id", { count: "exact", head: true }),
      client.from("orders").select("id", { count: "exact", head: true }),
      client.from("wallet_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      client.from("services").select("id", { count: "exact", head: true }).eq("active", true)
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
    setMessage("admin-message", "Some dashboard statistics could not be loaded: " + error.message);
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

    const profileMap = new Map((profiles || []).map(profile => [profile.id, profile]));

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
            <span class="request-status ${escapeHTML(request.status)}">${escapeHTML(request.status)}</span>
            ${request.admin_note ? `<small>Note: ${escapeHTML(request.admin_note)}</small>` : ""}
          </div>

          ${pending ? `
            <div class="admin-actions">
              <button class="btn btn-small approve-wallet" data-id="${escapeHTML(request.id)}">Approve</button>
              <button class="btn btn-small btn-danger reject-wallet" data-id="${escapeHTML(request.id)}">Reject</button>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");

  } catch (error) {
    holder.textContent = "Unable to load wallet requests: " + error.message;
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
    setMessage("admin-message", "Request approved and ledger credit recorded.", "success");

    await Promise.all([loadAdminWalletRequests(), loadAdminStats()]);

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

    await Promise.all([loadAdminWalletRequests(), loadAdminStats()]);

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
        <span class="request-status">${escapeHTML(profile.role)}</span>
      </div>
    `).join("");

  } catch (error) {
    holder.textContent = "Unable to load customers: " + error.message;
    console.error("Admin customers error:", error);
  }
}

/* ADMIN ORDERS */

async function loadAdminOrders() {
  if (!currentUser || !isAdmin) return;

  const holder = $("admin-order-list");
  if (!holder) return;

  holder.textContent = "Loading orders...";

  try {
    const { data: orders, error } = await client
      .from("orders")
      .select(`
        id,user_id,provider_order_id,service_name,target_url,
        quantity,charge,status,start_count,remains,created_at
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    if (!orders?.length) {
      holder.textContent = "No orders found.";
      return;
    }

    const userIds = [...new Set(orders.map(order => order.user_id))];

    const { data: profiles, error: profileError } = await client
      .from("profiles")
      .select("id,email,full_name")
      .in("id", userIds);

    if (profileError) throw profileError;

    const profileMap = new Map((profiles || []).map(profile => [profile.id, profile]));

    holder.innerHTML = orders.map(order => {
      const profile = profileMap.get(order.user_id) || {};

      return `
        <div class="admin-list-row">
          <div>
            <strong>${escapeHTML(order.service_name || "Service")}</strong>
            <small>Customer: ${escapeHTML(profile.full_name || profile.email || "Unknown")}</small>
            <small>Email: ${escapeHTML(profile.email || "Unavailable")}</small>
            <small>Target: ${escapeHTML(order.target_url || "—")}</small>
            <small>Quantity: ${escapeHTML(order.quantity)}</small>
            <small>Charge: ${formatRupees(order.charge)}</small>
            <small>Provider order: ${escapeHTML(order.provider_order_id || "Not submitted")}</small>
            <small>Start count: ${escapeHTML(order.start_count ?? "—")}</small>
            <small>Remaining: ${escapeHTML(order.remains ?? "—")}</small>
            <small>Created: ${formatDate(order.created_at)}</small>
          </div>
          <span class="request-status ${escapeHTML(order.status || "pending")}">${escapeHTML(order.status || "pending")}</span>
        </div>
      `;
    }).join("");

  } catch (error) {
    holder.textContent = "Unable to load orders: " + error.message;
    console.error("Admin orders error:", error);
  }
}

/* =========================================
   ADMIN PRICING MANAGEMENT
   ========================================= */

async function loadAdminPricing() {
  if (!currentUser || !isAdmin) return;

  setMessage("admin-pricing-message", "Loading pricing settings...");

  try {
    const { data: settings, error: settingsError } = await client
      .from("followbulk_pricing_settings")
      .select("default_markup")
      .eq("id", true)
      .maybeSingle();

    if (settingsError) throw settingsError;

    defaultMarkup = Number(settings?.default_markup ?? 30);

    if ($("default-markup")) {
      $("default-markup").value = defaultMarkup;
    }

    const { data: categories, error: categoryError } = await client
      .from("followbulk_category_pricing")
      .select("category,markup_percent")
      .order("category");

    if (categoryError) throw categoryError;

    categoryMarkups = {};

    (categories || []).forEach(item => {
      categoryMarkups[item.category] = Number(item.markup_percent);
    });

    populatePricingCategories();
    populatePricingServiceCategories();
    renderPricingServiceList();

    setMessage("admin-pricing-message", "Pricing settings loaded.", "success");

  } catch (error) {
    setMessage("admin-pricing-message", "Unable to load pricing settings: " + error.message);
    console.error("Admin pricing load error:", error);
  }
}

/* CATEGORY MARKUP DROPDOWN */

function populatePricingCategories() {
  const select = $("pricing-category");
  if (!select) return;

  const previous = select.value;

  const categories = [...new Set(
    services.map(service => service.category).filter(Boolean)
  )].sort();

  select.innerHTML = '<option value="">Choose a category</option>';

  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });

  if (categories.includes(previous)) {
    select.value = previous;
  }

  updateCategoryMarkupField();
}

function updateCategoryMarkupField() {
  const category = $("pricing-category")?.value;
  const input = $("category-markup");

  if (!input) return;

  if (!category) {
    input.value = "";
    return;
  }

  input.value = Object.prototype.hasOwnProperty.call(categoryMarkups, category)
    ? categoryMarkups[category]
    : "";
}

/* NEW: INDIVIDUAL SERVICE CATEGORY FILTER */

function populatePricingServiceCategories() {
  const select = $("pricing-service-category");
  if (!select) return;

  const previous = select.value;

  const categories = [...new Set(
    services
      .map(service => service.category)
      .filter(category => category && String(category).trim())
  )].sort((a, b) => String(a).localeCompare(String(b)));

  select.innerHTML = '<option value="all">All categories</option>';

  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });

  if (categories.includes(previous)) {
    select.value = previous;
  } else {
    select.value = "all";
  }

  renderPricingServiceList();
}

/* SAVE DEFAULT MARKUP */

async function saveDefaultMarkup() {
  if (!isAdmin) return;

  const value = Number($("default-markup")?.value);

  if (!validMarkup(value)) {
    setMessage("admin-pricing-message", "Enter a markup between 0 and 10000.");
    return;
  }

  const button = $("save-default-markup");
  if (button) button.disabled = true;

  setMessage("admin-pricing-message", "Saving default markup...");

  try {
    const { error } = await client
      .from("followbulk_pricing_settings")
      .update({
        default_markup: value,
        updated_at: new Date().toISOString()
      })
      .eq("id", true);

    if (error) throw error;

    defaultMarkup = value;

    setMessage("admin-pricing-message", "Default markup saved successfully.", "success");
    showToast("Default markup updated.");

    await refreshPricingAfterChange();

  } catch (error) {
    setMessage("admin-pricing-message", "Unable to save default markup: " + error.message);
    console.error("Default markup save error:", error);
  } finally {
    if (button) button.disabled = false;
  }
}

/* SAVE CATEGORY MARKUP */

async function saveCategoryMarkup() {
  if (!isAdmin) return;

  const category = $("pricing-category")?.value;
  const value = Number($("category-markup")?.value);

  if (!category) {
    setMessage("category-pricing-message", "Please choose a category.");
    return;
  }

  if (!validMarkup(value)) {
    setMessage("category-pricing-message", "Enter a markup between 0 and 10000.");
    return;
  }

  const button = $("save-category-markup");
  if (button) button.disabled = true;

  setMessage("category-pricing-message", "Saving category markup...");

  try {
    const { error } = await client
      .from("followbulk_category_pricing")
      .upsert({
        category,
        markup_percent: value,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "category"
      });

    if (error) throw error;

    categoryMarkups[category] = value;

    setMessage("category-pricing-message", "Category markup saved successfully.", "success");
    showToast("Category markup updated.");

    await refreshPricingAfterChange();

  } catch (error) {
    setMessage("category-pricing-message", "Unable to save category markup: " + error.message);
    console.error("Category markup save error:", error);
  } finally {
    if (button) button.disabled = false;
  }
}

/* RESET CATEGORY MARKUP */

async function resetCategoryMarkup() {
  if (!isAdmin) return;

  const category = $("pricing-category")?.value;

  if (!category) {
    setMessage("category-pricing-message", "Please choose a category.");
    return;
  }

  if (!confirm(`Remove the custom markup for ${category}?`)) return;

  setMessage("category-pricing-message", "Resetting category markup...");

  try {
    const { error } = await client
      .from("followbulk_category_pricing")
      .delete()
      .eq("category", category);

    if (error) throw error;

    delete categoryMarkups[category];
    updateCategoryMarkupField();

    setMessage(
      "category-pricing-message",
      "Category markup removed. It will now use the default markup unless a service has its own markup.",
      "success"
    );

    await refreshPricingAfterChange();

  } catch (error) {
    setMessage("category-pricing-message", "Unable to reset category markup: " + error.message);
    console.error("Category markup reset error:", error);
  }
}

/* SEARCH AND FILTER INDIVIDUAL SERVICES */

function renderPricingServiceList() {
  const holder = $("pricing-service-list");
  if (!holder) return;

  const search = ($("pricing-service-search")?.value || "")
    .trim()
    .toLowerCase();

  const selectedCategory = $("pricing-service-category")?.value || "all";

  const filtered = services.filter(service => {
    const searchable = [
      service.name,
      service.category,
      service.description,
      service.id,
      service.provider_service_id
    ].join(" ").toLowerCase();

    const matchesSearch = searchable.includes(search);

    const matchesCategory =
      selectedCategory === "all" ||
      String(service.category || "") === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  if (!filtered.length) {
    holder.innerHTML = '<div class="empty">No matching services found.</div>';
    return;
  }

  holder.innerHTML = filtered.map(service => `
    <div class="admin-list-row">
      <div>
        <strong>${escapeHTML(service.name)}</strong>
        <small>${escapeHTML(service.category || "Uncategorized")}</small>
        <small>Provider rate: ${formatRupees(service.rate)} per 1,000</small>
      </div>

      <button class="btn btn-small pricing-select-service"
        data-id="${escapeHTML(service.id)}">
        Edit markup
      </button>
    </div>
  `).join("");
}

/* SELECT ONE SERVICE */

function selectPricingService(id) {
  selectedPricingService = services.find(
    service => String(service.id) === String(id)
  );

  if (!selectedPricingService) return;

  const service = selectedPricingService;

  const individualMarkup = service.markup_percent;
  const categoryMarkup = categoryMarkups[service.category];

  let effectiveMarkup = defaultMarkup;

  if (categoryMarkup !== undefined) {
    effectiveMarkup = categoryMarkup;
  }

  if (individualMarkup !== null && individualMarkup !== undefined) {
    effectiveMarkup = Number(individualMarkup);
  }

  const customerRate = Number(service.rate) * (1 + effectiveMarkup / 100);

  $("individual-pricing-editor").classList.remove("hidden");

  $("pricing-selected-service").textContent = service.name;

  $("pricing-provider-rate").textContent =
    "Provider rate: " + formatRupees(service.rate) + " per 1,000";

  $("pricing-current-markup").textContent =
    "Effective markup: " + effectiveMarkup + "%";

  $("pricing-customer-rate").textContent =
    "Customer selling price: " + formatRupees(customerRate) + " per 1,000";

  $("individual-markup").value =
    individualMarkup === null || individualMarkup === undefined
      ? ""
      : individualMarkup;

  setMessage(
    "individual-pricing-message",
    individualMarkup === null || individualMarkup === undefined
      ? "This service inherits its markup from its category or the default setting."
      : "This service has an individual markup override."
  );
}

/* SAVE INDIVIDUAL MARKUP */

async function saveIndividualMarkup() {
  if (!isAdmin || !selectedPricingService) {
    setMessage("individual-pricing-message", "Select a service first.");
    return;
  }

  const value = Number($("individual-markup")?.value);

  if (!validMarkup(value)) {
    setMessage("individual-pricing-message", "Enter a markup between 0 and 10000.");
    return;
  }

  const button = $("save-individual-markup");
  if (button) button.disabled = true;

  setMessage("individual-pricing-message", "Saving individual markup...");

  try {
    const { error } = await client
      .from("services")
      .update({ markup_percent: value })
      .eq("id", selectedPricingService.id);

    if (error) throw error;

    selectedPricingService.markup_percent = value;

    setMessage("individual-pricing-message", "Individual service markup saved successfully.", "success");
    showToast("Individual service markup updated.");

    const selectedId = selectedPricingService.id;

    await refreshPricingAfterChange();
    selectPricingService(selectedId);

  } catch (error) {
    setMessage("individual-pricing-message", "Unable to save individual markup: " + error.message);
    console.error("Individual markup save error:", error);
  } finally {
    if (button) button.disabled = false;
  }
}

/* RESET INDIVIDUAL MARKUP */

async function resetIndividualMarkup() {
  if (!isAdmin || !selectedPricingService) {
    setMessage("individual-pricing-message", "Select a service first.");
    return;
  }

  if (!confirm("Remove this service's individual markup?")) return;

  setMessage("individual-pricing-message", "Resetting individual markup...");

  try {
    const selectedId = selectedPricingService.id;

    const { error } = await client
      .from("services")
      .update({ markup_percent: null })
      .eq("id", selectedId);

    if (error) throw error;

    setMessage(
      "individual-pricing-message",
      "Individual markup removed. The service will inherit category or default markup.",
      "success"
    );

    await refreshPricingAfterChange();
    selectPricingService(selectedId);

  } catch (error) {
    setMessage("individual-pricing-message", "Unable to reset individual markup: " + error.message);
    console.error("Individual markup reset error:", error);
  }
}

/* REFRESH PRICING */

async function refreshPricingAfterChange() {
  await loadAdminPricing();

  if (currentUser) {
    await loadCustomerPrices();
  }

  populatePricingServiceCategories();
  renderPricingServiceList();
}

/* =========================================
   EVENT HANDLERS
   ========================================= */

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

  $("order-form").addEventListener("submit", submitOrder);
  $("order-quantity").addEventListener("input", updateOrderEstimate);

  $("services-list").addEventListener("click", event => {
    const button = event.target.closest(".select-service");
    if (button) selectService(button.dataset.id);
  });

  $("refresh-services").addEventListener("click", loadServices);
  $("topup-form").addEventListener("submit", submitTopup);

  $("admin-refresh-wallet").addEventListener("click", loadAdminWalletRequests);
  $("admin-refresh-customers").addEventListener("click", loadAdminCustomers);
  $("admin-refresh-orders").addEventListener("click", loadAdminOrders);

  $("admin-wallet-list").addEventListener("click", event => {
    const approve = event.target.closest(".approve-wallet");
    const reject = event.target.closest(".reject-wallet");

    if (approve) approveWalletRequest(approve.dataset.id);
    if (reject) rejectWalletRequest(reject.dataset.id);
  });

  /* PRICING EVENTS */

  if ($("save-default-markup")) {
    $("save-default-markup").addEventListener("click", saveDefaultMarkup);
  }

  if ($("save-category-markup")) {
    $("save-category-markup").addEventListener("click", saveCategoryMarkup);
  }

  if ($("reset-category-markup")) {
    $("reset-category-markup").addEventListener("click", resetCategoryMarkup);
  }

  if ($("pricing-category")) {
    $("pricing-category").addEventListener("change", updateCategoryMarkupField);
  }

  if ($("pricing-service-search")) {
    $("pricing-service-search").addEventListener("input", renderPricingServiceList);
  }

  /* NEW CATEGORY FILTER EVENT */

  if ($("pricing-service-category")) {
    $("pricing-service-category").addEventListener("change", renderPricingServiceList);
  }

  if ($("pricing-service-list")) {
    $("pricing-service-list").addEventListener("click", event => {
      const button = event.target.closest(".pricing-select-service");
      if (button) selectPricingService(button.dataset.id);
    });
  }

  if ($("save-individual-markup")) {
    $("save-individual-markup").addEventListener("click", saveIndividualMarkup);
  }

  if ($("reset-individual-markup")) {
    $("reset-individual-markup").addEventListener("click", resetIndividualMarkup);
  }

  if ($("admin-refresh-pricing")) {
    $("admin-refresh-pricing").addEventListener("click", loadAdminPricing);
  }

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
