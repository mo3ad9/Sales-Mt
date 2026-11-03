const loginForm = document.getElementById("loginForm");
const activationForm = document.getElementById("activationForm");

async function api(url, options = {}) {
  const response = await fetch("/api" + url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "حدث خطأ");
  }

  return data;
}

function showDashboard(user) {
  document.getElementById("login").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  document.getElementById("welcome").textContent = "مرحبًا، " + user.name;
  loadActivations();
}

loginForm.addEventListener("submit", async function(event) {
  event.preventDefault();

  const form = Object.fromEntries(new FormData(this));

  try {
    const data = await api("/login", {
      method: "POST",
      body: JSON.stringify(form)
    });

    showDashboard(data.user);
  } catch (error) {
    document.getElementById("loginMessage").textContent = error.message;
  }
});

activationForm.addEventListener("submit", async function(event) {
  event.preventDefault();

  const form = Object.fromEntries(new FormData(this));

  try {
    await api("/activations", {
      method: "POST",
      body: JSON.stringify(form)
    });

    document.getElementById("message").textContent =
      "تم إرسال التفعيل بنجاح";

    this.reset();
    loadActivations();

  } catch (error) {
    document.getElementById("message").textContent = error.message;
  }
});

async function loadActivations() {
  try {
    const data = await api("/activations");

    document.getElementById("activationList").textContent =
      data.map(item =>
        `${item.full_name} — ${item.package_name} — ${item.amount} ر.س`
      ).join("\n") || "لا توجد تفعيلات حتى الآن";

  } catch (error) {
    document.getElementById("activationList").textContent = error.message;
  }
}

async function logout() {
  await api("/logout", { method: "POST" });
  location.reload();
}

document.getElementById("logout").addEventListener("click", logout);

api("/me").then(data => {
  if (data.user) showDashboard(data.user);
}).catch(() => {});
