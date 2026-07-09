const state = {
  products: [],
  users: [],
  orders: [],
};

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.message || `${res.status} ${res.statusText}`);
  }
  return body?.data;
}

function money(amount) {
  return amount === null || amount === undefined ? '—' : `$${Number(amount).toFixed(2)}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Order creation is async now (orders-service hands stock reservation off
// to products-service over a queue) — POST /api/orders returns immediately
// with status "pending", so poll until products-service's result lands.
async function pollOrder(orderId, { intervalMs = 600, timeoutMs = 15000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const order = await api(`/api/orders/${orderId}`);
    if (order.status !== 'pending') return order;
    await sleep(intervalMs);
  }
  throw new Error('Timed out waiting for order confirmation.');
}

function renderProducts() {
  const tbody = document.querySelector('#products-table tbody');
  tbody.innerHTML = state.products
    .map(p => `<tr><td>${p.id}</td><td>${p.name}</td><td>${money(p.price)}</td><td>${p.stock}</td></tr>`)
    .join('') || '<tr><td colspan="4">No products</td></tr>';
}

function renderUsers() {
  const tbody = document.querySelector('#users-table tbody');
  tbody.innerHTML = state.users
    .map(u => `<tr><td>${u.id}</td><td>${u.name}</td><td>${u.email}</td><td>${u.joinedAt ?? ''}</td></tr>`)
    .join('') || '<tr><td colspan="4">No users</td></tr>';
}

function renderOrders() {
  const tbody = document.querySelector('#orders-table tbody');
  const userName = id => state.users.find(u => u.id === id)?.name ?? `#${id}`;
  const productName = id => state.products.find(p => p.id === id)?.name ?? `#${id}`;
  tbody.innerHTML = state.orders
    .slice()
    .reverse()
    .map(o => {
      const items = o.items.map(i => `${productName(i.productId)} ×${i.quantity}`).join(', ');
      const created = o.createdAt ? new Date(o.createdAt).toLocaleString() : '';
      const status = `<span class="status-pill ${o.status}">${o.status}${o.reason ? ` · ${o.reason}` : ''}</span>`;
      return `<tr><td>${o.id}</td><td>${userName(o.userId)}</td><td>${items}</td><td>${money(o.totalPrice)}</td><td>${status}</td><td>${created}</td></tr>`;
    })
    .join('') || '<tr><td colspan="6">No orders yet</td></tr>';
}

function renderUserSelect() {
  const select = document.getElementById('order-user');
  select.innerHTML = state.users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
}

function productOptions() {
  return state.products.map(p => `<option value="${p.id}">${p.name} (stock: ${p.stock})</option>`).join('');
}

function addItemRow() {
  const container = document.getElementById('order-items');
  const row = document.createElement('div');
  row.className = 'order-item-row';
  row.innerHTML = `
    <select class="item-product">${productOptions()}</select>
    <input class="item-qty" type="number" min="1" value="1" required>
    <button type="button" class="remove-item-btn">✕</button>
  `;
  row.querySelector('.remove-item-btn').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

async function loadAll() {
  const [products, users, orders] = await Promise.all([
    api('/api/products'),
    api('/api/users'),
    api('/api/orders'),
  ]);
  state.products = products ?? [];
  state.users = users ?? [];
  state.orders = orders ?? [];
  renderProducts();
  renderUsers();
  renderOrders();
  renderUserSelect();
  const itemsContainer = document.getElementById('order-items');
  if (!itemsContainer.children.length) addItemRow();
  document.querySelectorAll('.item-product').forEach(sel => {
    sel.innerHTML = productOptions();
  });
}

async function checkHealth() {
  const dot = document.getElementById('status-dot');
  try {
    const res = await fetch('/health');
    dot.className = 'status-dot ' + (res.ok ? 'ok' : 'down');
  } catch {
    dot.className = 'status-dot down';
  }
}

async function submitOrder(event) {
  event.preventDefault();
  const feedback = document.getElementById('order-feedback');
  feedback.textContent = '';
  feedback.className = 'feedback';

  const userId = Number(document.getElementById('order-user').value);
  const items = [...document.querySelectorAll('.order-item-row')].map(row => ({
    productId: Number(row.querySelector('.item-product').value),
    quantity: Number(row.querySelector('.item-qty').value),
  }));

  if (!userId || items.length === 0) {
    feedback.textContent = 'Select a user and at least one item.';
    feedback.className = 'feedback error';
    return;
  }

  const submitBtn = event.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const pending = await api('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, items }),
    });
    feedback.textContent = `Order #${pending.id} pending — reserving stock…`;
    feedback.className = 'feedback';
    await loadAll();

    const order = await pollOrder(pending.id);
    if (order.status === 'confirmed') {
      feedback.textContent = `Order #${order.id} confirmed — total ${money(order.totalPrice)}.`;
      feedback.className = 'feedback success';
      document.getElementById('order-items').innerHTML = '';
      addItemRow();
    } else {
      feedback.textContent = `Order #${order.id} rejected — ${order.reason ?? 'insufficient stock'}.`;
      feedback.className = 'feedback error';
    }
    await loadAll();
  } catch (err) {
    feedback.textContent = err.message;
    feedback.className = 'feedback error';
  } finally {
    submitBtn.disabled = false;
  }
}

document.getElementById('order-form').addEventListener('submit', submitOrder);
document.getElementById('add-item-btn').addEventListener('click', addItemRow);
document.getElementById('refresh-btn').addEventListener('click', () => { loadAll(); checkHealth(); });

loadAll();
checkHealth();
setInterval(checkHealth, 15000);
