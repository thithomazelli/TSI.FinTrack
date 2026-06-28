import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Telegram helpers ────────────────────────────────────────────────────────

async function sendMessage(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra }),
  });
}

async function answerCallback(callbackQueryId: string, text?: string) {
  await fetch(`${API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function getUserIdFromChat(chatId: number): Promise<string | null> {
  const { data } = await supabase
    .from('telegram_subscriptions')
    .select('user_id')
    .eq('chat_id', chatId)
    .single();
  return data?.user_id ?? null;
}

function fmt(n: number): string {
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function monthDateRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(year, month, 0).toISOString().split('T')[0];
  return { start, end };
}

// ─── Command handlers ────────────────────────────────────────────────────────

async function handleStart(chatId: number, args: string) {
  const token = args.trim();

  if (!token) {
    await sendMessage(chatId,
      '👋 Olá! Sou o bot do <b>TSI FinTrack</b>.\n\n' +
      'Para vincular sua conta, acesse o app e vá em <b>Configurações → Perfil → Conectar Telegram</b>. ' +
      'Você receberá um link com token único.\n\n' +
      'Comandos disponíveis após vinculação:\n' +
      '/saldo — saldo do mês atual\n' +
      '/poupanca — saldo da poupança\n' +
      '/faturas — faturas abertas\n' +
      '/resumo — resumo completo do mês\n' +
      '/metas — progresso das metas\n' +
      '/lancamento — registrar gasto rápido'
    );
    return;
  }

  // Validate token
  const { data: link, error } = await supabase
    .from('telegram_links')
    .select('user_id, used')
    .eq('token', token)
    .single();

  if (error || !link) {
    await sendMessage(chatId, '❌ Token inválido ou expirado. Gere um novo link no app.');
    return;
  }
  if (link.used) {
    await sendMessage(chatId, '⚠️ Este token já foi utilizado. Gere um novo link no app.');
    return;
  }

  // Mark token as used
  await supabase.from('telegram_links').update({ used: true }).eq('token', token);

  // Upsert subscription
  await supabase.from('telegram_subscriptions').upsert(
    { user_id: link.user_id, chat_id: chatId, notifications_enabled: true },
    { onConflict: 'user_id' }
  );

  await sendMessage(chatId,
    '✅ Conta vinculada com sucesso!\n\nUse /resumo para ver seu saldo do mês.'
  );
}

async function handleSaldo(chatId: number, userId: string) {
  const { year, month } = currentYearMonth();
  const { start, end } = monthDateRange(year, month);

  const [{ data: txs }, { data: entries }] = await Promise.all([
    supabase.from('transactions').select('amount, status').eq('owner_id', userId).gte('date', start).lte('date', end),
    supabase.from('entries').select('amount').eq('owner_id', userId).gte('date', start).lte('date', end),
  ]);

  const totalIncome = (entries ?? []).reduce((s: number, e: { amount: number }) => s + e.amount, 0);
  const realized = (txs ?? []).filter((t: { status: string }) => t.status === 'REALIZED').reduce((s: number, t: { amount: number }) => s + t.amount, 0);
  const projected = (txs ?? []).reduce((s: number, t: { amount: number }) => s + t.amount, 0);

  await sendMessage(chatId,
    `📊 <b>Saldo — ${month.toString().padStart(2, '0')}/${year}</b>\n\n` +
    `💰 Entradas: <b>${fmt(totalIncome)}</b>\n` +
    `💸 Gastos realizados: <b>${fmt(realized)}</b>\n` +
    `📋 Gastos projetados: <b>${fmt(projected)}</b>\n` +
    `─────────────────\n` +
    `✅ Saldo realizado: <b>${fmt(totalIncome - realized)}</b>\n` +
    `🔮 Saldo projetado: <b>${fmt(totalIncome - projected)}</b>`
  );
}

async function handlePoupanca(chatId: number, userId: string) {
  const { data: movements } = await supabase
    .from('savings_movements')
    .select('amount, type_id')
    .eq('owner_id', userId);

  if (!movements?.length) {
    await sendMessage(chatId, '🏦 Nenhum movimento de poupança encontrado.');
    return;
  }

  // Get domain list for savings types
  const { data: types } = await supabase
    .from('domain_lists')
    .select('id, code, value')
    .eq('owner_id', userId)
    .eq('list_code', 'savings_movement_type');

  const withdrawalIds = new Set(
    (types ?? []).filter((t: { code: string }) => t.code === 'WITHDRAWAL').map((t: { id: string }) => t.id)
  );

  const balance = movements.reduce((s: number, m: { amount: number; type_id: string }) =>
    withdrawalIds.has(m.type_id) ? s - m.amount : s + m.amount, 0
  );

  await sendMessage(chatId,
    `🏦 <b>Saldo da Poupança</b>\n\n` +
    `💰 Saldo atual: <b>${fmt(balance)}</b>\n` +
    `📝 ${movements.length} movimentos registrados`
  );
}

async function handleFaturas(chatId: number, userId: string) {
  const { year, month } = currentYearMonth();

  const { data: bills } = await supabase
    .from('credit_card_bills')
    .select('*, credit_cards(name, last_four_digits)')
    .eq('owner_id', userId)
    .eq('year', year)
    .eq('month', month);

  if (!bills?.length) {
    await sendMessage(chatId, `💳 Nenhuma fatura em ${month.toString().padStart(2,'0')}/${year}.`);
    return;
  }

  const lines = bills.map((b: { credit_cards?: { name: string; last_four_digits: string }; total_amount: number; status: string; due_date?: string }) => {
    const card = b.credit_cards;
    const status = { OPEN: '🟡 Aberta', CLOSED: '🟠 Fechada', PAID: '🟢 Paga' }[b.status] ?? b.status;
    const due = b.due_date ? ` | venc. ${b.due_date.slice(0, 10)}` : '';
    return `• ${card?.name ?? 'Cartão'} (${card?.last_four_digits ?? '????'}): <b>${fmt(b.total_amount ?? 0)}</b> — ${status}${due}`;
  }).join('\n');

  await sendMessage(chatId,
    `💳 <b>Faturas — ${month.toString().padStart(2,'0')}/${year}</b>\n\n${lines}`
  );
}

async function handleMetas(chatId: number, userId: string) {
  const { year, month } = currentYearMonth();
  const { start, end } = monthDateRange(year, month);

  const [{ data: goals }, { data: txs }, { data: cats }] = await Promise.all([
    supabase.from('goals').select('*').eq('owner_id', userId).eq('year', year).eq('month', month),
    supabase.from('transactions').select('amount, category_id, status').eq('owner_id', userId).eq('status', 'REALIZED').gte('date', start).lte('date', end),
    supabase.from('categories').select('id, name').eq('owner_id', userId),
  ]);

  if (!goals?.length) {
    await sendMessage(chatId, '🎯 Nenhuma meta definida para este mês.');
    return;
  }

  const spentMap: Record<string, number> = {};
  for (const t of (txs ?? [])) {
    if (t.category_id) spentMap[t.category_id] = (spentMap[t.category_id] ?? 0) + t.amount;
  }

  const lines = goals.map((g: { category_id: string; monthly_limit: number }) => {
    const cat = (cats ?? []).find((c: { id: string; name: string }) => c.id === g.category_id);
    const spent = spentMap[g.category_id] ?? 0;
    const pct = g.monthly_limit > 0 ? (spent / g.monthly_limit) * 100 : 0;
    const bar = '█'.repeat(Math.round(pct / 10)).padEnd(10, '░');
    const icon = spent > g.monthly_limit ? '🔴' : pct >= 80 ? '🟡' : '🟢';
    return `${icon} <b>${cat?.name ?? g.category_id}</b>\n   ${bar} ${pct.toFixed(0)}% — ${fmt(spent)} / ${fmt(g.monthly_limit)}`;
  }).join('\n\n');

  await sendMessage(chatId, `🎯 <b>Metas — ${month.toString().padStart(2,'0')}/${year}</b>\n\n${lines}`);
}

async function handleResumo(chatId: number, userId: string) {
  await handleSaldo(chatId, userId);
  await handleMetas(chatId, userId);
  await handleFaturas(chatId, userId);
}

// Quick entry: /lancamento ifood 45.90 alimentação
async function handleLancamento(chatId: number, userId: string, args: string) {
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    await sendMessage(chatId,
      '❓ Uso: <code>/lancamento DESCRIÇÃO VALOR [CATEGORIA]</code>\n' +
      'Exemplo: <code>/lancamento ifood 45.90 alimentação</code>'
    );
    return;
  }

  const amountStr = parts.find((p) => /^\d+([.,]\d{1,2})?$/.test(p));
  if (!amountStr) {
    await sendMessage(chatId, '❌ Não encontrei o valor. Ex: <code>/lancamento ifood 45.90</code>');
    return;
  }

  const amount = parseFloat(amountStr.replace(',', '.'));
  const amountIdx = parts.indexOf(amountStr);
  const description = parts.slice(0, amountIdx).join(' ') || 'Lançamento rápido';
  const categoryHint = parts.slice(amountIdx + 1).join(' ').toLowerCase();

  // Try to match category
  let categoryId: string | null = null;
  let categoryName = '';
  if (categoryHint) {
    const { data: cats } = await supabase.from('categories').select('id, name').eq('owner_id', userId);
    const matched = (cats ?? []).find((c: { name: string }) =>
      c.name.toLowerCase().includes(categoryHint) || categoryHint.includes(c.name.toLowerCase())
    );
    if (matched) {
      categoryId = matched.id;
      categoryName = matched.name;
    }
  }

  const today = new Date().toISOString().split('T')[0];

  // Show confirmation with inline keyboard
  const confirmText =
    `📝 <b>Confirmar lançamento?</b>\n\n` +
    `📌 Descrição: <b>${description}</b>\n` +
    `💰 Valor: <b>${fmt(amount)}</b>\n` +
    `📁 Categoria: <b>${categoryName || '(sem categoria)'}</b>\n` +
    `📅 Data: <b>${today}</b>`;

  // Store pending entry in a temp key using Supabase (simplest: insert as PROJECTED, confirm changes to REALIZED)
  const { data: inserted } = await supabase
    .from('transactions')
    .insert({
      owner_id: userId,
      description,
      amount,
      date: today,
      category_id: categoryId,
      account_id: null,
      credit_card_id: null,
      status: 'PROJECTED',
      labels: [],
    })
    .select('id')
    .single();

  if (!inserted) {
    await sendMessage(chatId, '❌ Erro ao criar lançamento. Tente novamente.');
    return;
  }

  await sendMessage(chatId, confirmText, {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Confirmar (Realizado)', callback_data: `confirm_tx:${inserted.id}:REALIZED` },
        { text: '📋 Manter projetado', callback_data: `confirm_tx:${inserted.id}:PROJECTED` },
        { text: '❌ Cancelar', callback_data: `cancel_tx:${inserted.id}` },
      ]],
    },
  });
}

async function handleCallback(callbackQuery: {
  id: string;
  data: string;
  message: { chat: { id: number } };
}) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data.startsWith('confirm_tx:')) {
    const [, txId, status] = data.split(':');
    await supabase.from('transactions').update({ status, updated_at: new Date().toISOString() }).eq('id', txId);
    const label = status === 'REALIZED' ? 'Realizado ✅' : 'Projetado 📋';
    await answerCallback(callbackQuery.id, `Lançamento marcado como ${label}`);
    await sendMessage(chatId, `✅ Lançamento salvo como <b>${label}</b>.`);
  } else if (data.startsWith('cancel_tx:')) {
    const [, txId] = data.split(':');
    await supabase.from('transactions').delete().eq('id', txId);
    await answerCallback(callbackQuery.id, 'Lançamento cancelado');
    await sendMessage(chatId, '🗑️ Lançamento cancelado.');
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('OK');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Callback query (inline button press)
  if (body.callback_query) {
    const cq = body.callback_query as {
      id: string;
      data: string;
      message: { chat: { id: number } };
    };
    await handleCallback(cq);
    return new Response('OK');
  }

  const message = body.message as { chat: { id: number }; text?: string } | undefined;
  if (!message?.text) return new Response('OK');

  const chatId = message.chat.id;
  const text = message.text.trim();
  const [rawCmd, ...argParts] = text.split(/\s+/);
  const cmd = rawCmd.toLowerCase().replace(/@\w+$/, ''); // strip bot username
  const args = argParts.join(' ');

  // /start with token — no auth needed
  if (cmd === '/start') {
    await handleStart(chatId, args);
    return new Response('OK');
  }

  // All other commands require linked account
  const userId = await getUserIdFromChat(chatId);
  if (!userId) {
    await sendMessage(chatId,
      '⚠️ Conta não vinculada. Use /start para ver as instruções.'
    );
    return new Response('OK');
  }

  switch (cmd) {
    case '/saldo':      await handleSaldo(chatId, userId); break;
    case '/poupanca':   await handlePoupanca(chatId, userId); break;
    case '/faturas':    await handleFaturas(chatId, userId); break;
    case '/metas':      await handleMetas(chatId, userId); break;
    case '/resumo':     await handleResumo(chatId, userId); break;
    case '/lancamento': await handleLancamento(chatId, userId, args); break;
    default:
      await sendMessage(chatId,
        '❓ Comando não reconhecido.\n\n' +
        'Comandos disponíveis:\n' +
        '/saldo — saldo do mês\n' +
        '/poupanca — saldo da poupança\n' +
        '/faturas — faturas do mês\n' +
        '/metas — progresso das metas\n' +
        '/resumo — resumo completo\n' +
        '/lancamento — registrar gasto rápido'
      );
  }

  return new Response('OK');
});
