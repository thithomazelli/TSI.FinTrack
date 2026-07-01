import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Telegram helpers ────────────────────────────────────────────────────────

async function send(chatId: number, text: string, extra: Record<string, unknown> = {}) {
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

function removeKeyboard() {
  return { reply_markup: { remove_keyboard: true } };
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
  return `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
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

// ─── Session helpers (guided /lancamento flow) ───────────────────────────────

type SessionStep =
  | 'awaiting_description'
  | 'awaiting_amount'
  | 'awaiting_date'
  | 'awaiting_category'
  | 'awaiting_status';

interface SessionData {
  description?: string;
  amount?: number;
  date?: string;
  categoryId?: string | null;
  categoryName?: string;
}

async function getSession(chatId: number): Promise<{ step: SessionStep; data: SessionData } | null> {
  const { data } = await supabase
    .from('telegram_sessions')
    .select('step, data')
    .eq('chat_id', chatId)
    .maybeSingle();
  if (!data) return null;
  return { step: data.step as SessionStep, data: data.data as SessionData };
}

async function setSession(chatId: number, step: SessionStep, data: SessionData) {
  await supabase.from('telegram_sessions').upsert(
    { chat_id: chatId, step, data, updated_at: new Date().toISOString() },
    { onConflict: 'chat_id' }
  );
}

async function clearSession(chatId: number) {
  await supabase.from('telegram_sessions').delete().eq('chat_id', chatId);
}

// ─── Guided flow steps ────────────────────────────────────────────────────────

async function askDescription(chatId: number) {
  await setSession(chatId, 'awaiting_description', {});
  await send(chatId,
    '📝 <b>Novo lançamento</b>\n\n' +
    'Qual a <b>descrição</b> do gasto?\n\n' +
    '<i>Dica: você também pode enviar tudo de uma vez:\n' +
    '<code>/lancamento ifood 45,90 alimentação</code></i>',
    removeKeyboard()
  );
}

async function askAmount(chatId: number, data: SessionData) {
  await setSession(chatId, 'awaiting_amount', data);
  await send(chatId,
    `✅ Descrição: <b>${data.description}</b>\n\n` +
    '💰 Qual o <b>valor</b>? (ex: <code>45,90</code>)\n\n' +
    '/cancelar para desistir',
    removeKeyboard()
  );
}

async function askDate(chatId: number, data: SessionData) {
  await setSession(chatId, 'awaiting_date', data);
  const today = new Date().toISOString().split('T')[0];
  await send(chatId,
    `✅ Valor: <b>${fmt(data.amount!)}</b>\n\n` +
    '📅 Qual a <b>data</b>? Envie no formato <code>DD/MM</code> ou <code>DD/MM/AAAA</code>, ' +
    'ou toque em <b>Hoje</b> para usar a data de hoje.',
    {
      reply_markup: {
        keyboard: [[{ text: `Hoje (${today})` }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
}

async function askCategory(chatId: number, userId: string, data: SessionData) {
  await setSession(chatId, 'awaiting_category', data);
  const { data: cats } = await supabase
    .from('categories')
    .select('id, name')
    .eq('owner_id', userId)
    .order('name');

  const keyboard = (cats ?? [])
    .map((c: { name: string }) => [{ text: c.name }]);
  keyboard.push([{ text: '➡️ Pular categoria' }]);

  await send(chatId,
    `✅ Data: <b>${data.date}</b>\n\n` +
    '📁 Qual a <b>categoria</b>? Toque em uma ou envie o nome.',
    {
      reply_markup: {
        keyboard,
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
}

async function askStatus(chatId: number, data: SessionData) {
  await setSession(chatId, 'awaiting_status', data);
  const catLabel = data.categoryName ? `📁 Categoria: <b>${data.categoryName}</b>\n` : '';
  await send(chatId,
    `✅ ${catLabel ? catLabel : '<i>Sem categoria</i>\n'}` +
    '\n💳 O gasto já foi <b>realizado</b> ou ainda é <b>projetado</b>?',
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Realizado', callback_data: 'flow_status:REALIZED' },
          { text: '📋 Projetado', callback_data: 'flow_status:PROJECTED' },
        ]],
      },
    }
  );
}

async function finishFlow(chatId: number, userId: string, data: SessionData, status: string) {
  await clearSession(chatId);
  const today = new Date().toISOString().split('T')[0];

  const { data: inserted, error } = await supabase
    .from('transactions')
    .insert({
      owner_id: userId,
      description: data.description,
      amount: data.amount,
      date: data.date ?? today,
      category_id: data.categoryId ?? null,
      account_id: null,
      credit_card_id: null,
      status,
      labels: [],
    })
    .select('id')
    .single();

  if (error || !inserted) {
    await send(chatId, '❌ Erro ao salvar lançamento. Tente novamente.', removeKeyboard());
    return;
  }

  const statusLabel = status === 'REALIZED' ? 'Realizado ✅' : 'Projetado 📋';
  await send(chatId,
    `🎉 <b>Lançamento salvo!</b>\n\n` +
    `📌 ${data.description}\n` +
    `💰 ${fmt(data.amount!)}\n` +
    `📅 ${data.date ?? today}\n` +
    (data.categoryName ? `📁 ${data.categoryName}\n` : '') +
    `📊 ${statusLabel}`,
    removeKeyboard()
  );
}

// Tenta interpretar data no formato DD/MM ou DD/MM/AAAA
function parseDate(text: string): string | null {
  const clean = text.replace(/^Hoje \((.+)\)$/, '$1');
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const m2 = clean.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!m2) return null;
  const year = m2[3] ? parseInt(m2[3]) : new Date().getFullYear();
  const month = String(m2[2]).padStart(2, '0');
  const day = String(m2[1]).padStart(2, '0');
  const d = new Date(`${year}-${month}-${day}`);
  if (isNaN(d.getTime())) return null;
  return `${year}-${month}-${day}`;
}

// ─── Session message handler ──────────────────────────────────────────────────

async function handleSessionMessage(chatId: number, userId: string, text: string, session: { step: SessionStep; data: SessionData }) {
  const { step, data } = session;

  if (text === '/cancelar') {
    await clearSession(chatId);
    await send(chatId, '🗑️ Lançamento cancelado.', removeKeyboard());
    return;
  }

  if (step === 'awaiting_description') {
    const description = text.trim();
    if (!description) {
      await send(chatId, '❌ Descrição não pode ser vazia. Tente novamente.');
      return;
    }
    await askAmount(chatId, { ...data, description });

  } else if (step === 'awaiting_amount') {
    const amount = parseFloat(text.trim().replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      await send(chatId, '❌ Valor inválido. Informe um número, ex: <code>45,90</code>');
      return;
    }
    await askDate(chatId, { ...data, amount });

  } else if (step === 'awaiting_date') {
    const date = parseDate(text.trim());
    if (!date) {
      await send(chatId, '❌ Data inválida. Use o formato <code>DD/MM</code> ou <code>DD/MM/AAAA</code>.');
      return;
    }
    await askCategory(chatId, userId, { ...data, date });

  } else if (step === 'awaiting_category') {
    let categoryId: string | null = null;
    let categoryName: string | undefined;
    if (text !== '➡️ Pular categoria') {
      const { data: cats } = await supabase.from('categories').select('id, name').eq('owner_id', userId);
      const matched = (cats ?? []).find((c: { name: string }) =>
        c.name.toLowerCase() === text.trim().toLowerCase() ||
        c.name.toLowerCase().includes(text.trim().toLowerCase())
      );
      if (matched) {
        categoryId = matched.id;
        categoryName = matched.name;
      }
    }
    await askStatus(chatId, { ...data, categoryId, categoryName });

  } else if (step === 'awaiting_status') {
    // Only reachable if user types instead of tapping button
    const lower = text.trim().toLowerCase();
    const status = lower.includes('realiz') ? 'REALIZED' : lower.includes('projet') ? 'PROJECTED' : null;
    if (!status) {
      await send(chatId, '❌ Responda "Realizado" ou "Projetado", ou use os botões acima.');
      return;
    }
    await finishFlow(chatId, userId, data, status);
  }
}

// ─── Command handlers ────────────────────────────────────────────────────────

async function handleStart(chatId: number, args: string) {
  const token = args.trim();
  if (!token) {
    await send(chatId,
      '👋 Olá! Sou o bot do <b>TSI FinTrack</b>.\n\n' +
      'Para vincular sua conta, acesse o app e vá em <b>Configurações → Perfil → Conectar Telegram</b>.\n\n' +
      'Após vincular, use /ajuda para ver os comandos disponíveis.'
    );
    return;
  }

  const { data: link, error } = await supabase
    .from('telegram_links')
    .select('user_id, used')
    .eq('token', token)
    .single();

  if (error || !link) {
    await send(chatId, '❌ Token inválido ou expirado. Gere um novo link no app.');
    return;
  }
  if (link.used) {
    await send(chatId, '⚠️ Este token já foi utilizado. Gere um novo link no app.');
    return;
  }

  await supabase.from('telegram_links').update({ used: true }).eq('token', token);
  await supabase.from('telegram_subscriptions').upsert(
    { user_id: link.user_id, chat_id: chatId, notifications_enabled: true },
    { onConflict: 'user_id' }
  );

  await send(chatId,
    '✅ <b>Conta vinculada com sucesso!</b>\n\n' +
    'Use /ajuda para ver tudo que posso fazer por você.'
  );
}

async function handleAjuda(chatId: number) {
  await send(chatId,
    '📖 <b>Comandos disponíveis</b>\n\n' +
    '💰 <b>/saldo</b>\n' +
    '   Mostra receitas, gastos e saldo do mês atual\n\n' +
    '🏦 <b>/poupanca</b>\n' +
    '   Saldo acumulado da poupança\n\n' +
    '💳 <b>/faturas</b>\n' +
    '   Faturas de cartão do mês atual\n\n' +
    '🎯 <b>/metas</b>\n' +
    '   Progresso das metas de gasto do mês\n\n' +
    '📊 <b>/resumo</b>\n' +
    '   Resumo completo (saldo + metas + faturas)\n\n' +
    '➕ <b>/lancamento</b>\n' +
    '   Registra um gasto — o bot vai te guiar passo a passo\n' +
    '   Ou envie tudo de uma vez:\n' +
    '   <code>/lancamento ifood 45,90 alimentação</code>\n\n' +
    '🗑️ <b>/cancelar</b>\n' +
    '   Cancela um lançamento em andamento\n\n' +
    '❓ <b>/ajuda</b>\n' +
    '   Mostra esta mensagem'
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

  await send(chatId,
    `📊 <b>Saldo — ${String(month).padStart(2, '0')}/${year}</b>\n\n` +
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
    await send(chatId, '🏦 Nenhum movimento de poupança encontrado.');
    return;
  }

  const { data: types } = await supabase
    .from('domain_lists')
    .select('id, code')
    .eq('owner_id', userId)
    .eq('list_code', 'savings_movement_type');

  const withdrawalIds = new Set(
    (types ?? []).filter((t: { code: string }) => t.code === 'WITHDRAWAL').map((t: { id: string }) => t.id)
  );

  const balance = movements.reduce((s: number, m: { amount: number; type_id: string }) =>
    withdrawalIds.has(m.type_id) ? s - m.amount : s + m.amount, 0
  );

  await send(chatId,
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
    await send(chatId, `💳 Nenhuma fatura em ${String(month).padStart(2, '0')}/${year}.`);
    return;
  }

  const lines = bills.map((b: { credit_cards?: { name: string; last_four_digits: string }; total_amount: number; status: string; due_date?: string }) => {
    const card = b.credit_cards;
    const status = { OPEN: '🟡 Aberta', CLOSED: '🟠 Fechada', PAID: '🟢 Paga' }[b.status] ?? b.status;
    const due = b.due_date ? ` | venc. ${b.due_date.slice(0, 10)}` : '';
    return `• ${card?.name ?? 'Cartão'} (${card?.last_four_digits ?? '????'}): <b>${fmt(b.total_amount ?? 0)}</b> — ${status}${due}`;
  }).join('\n');

  await send(chatId, `💳 <b>Faturas — ${String(month).padStart(2, '0')}/${year}</b>\n\n${lines}`);
}

async function handleMetas(chatId: number, userId: string) {
  const { year, month } = currentYearMonth();
  const { start, end } = monthDateRange(year, month);

  const [{ data: goals }, { data: txs }, { data: cats }] = await Promise.all([
    supabase.from('goals').select('*').eq('owner_id', userId).eq('year', year).eq('month', month),
    supabase.from('transactions').select('amount, category_id').eq('owner_id', userId).eq('status', 'REALIZED').gte('date', start).lte('date', end),
    supabase.from('categories').select('id, name').eq('owner_id', userId),
  ]);

  if (!goals?.length) {
    await send(chatId, '🎯 Nenhuma meta definida para este mês.');
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

  await send(chatId, `🎯 <b>Metas — ${String(month).padStart(2, '0')}/${year}</b>\n\n${lines}`);
}

async function handleResumo(chatId: number, userId: string) {
  await handleSaldo(chatId, userId);
  await handleMetas(chatId, userId);
  await handleFaturas(chatId, userId);
}

// One-shot: /lancamento descrição valor [categoria]
async function handleLancamentoOneShot(chatId: number, userId: string, args: string) {
  const parts = args.trim().split(/\s+/);
  const amountStr = parts.find((p) => /^\d+([.,]\d{1,2})?$/.test(p));
  if (!amountStr) {
    await send(chatId, '❌ Não encontrei o valor. Ex: <code>/lancamento ifood 45,90 alimentação</code>');
    return;
  }

  const amount = parseFloat(amountStr.replace(',', '.'));
  const amountIdx = parts.indexOf(amountStr);
  const description = parts.slice(0, amountIdx).join(' ') || 'Lançamento rápido';
  const categoryHint = parts.slice(amountIdx + 1).join(' ').toLowerCase();

  let categoryId: string | null = null;
  let categoryName = '';
  if (categoryHint) {
    const { data: cats } = await supabase.from('categories').select('id, name').eq('owner_id', userId);
    const matched = (cats ?? []).find((c: { name: string }) =>
      c.name.toLowerCase().includes(categoryHint) || categoryHint.includes(c.name.toLowerCase())
    );
    if (matched) { categoryId = matched.id; categoryName = matched.name; }
  }

  const today = new Date().toISOString().split('T')[0];

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
    await send(chatId, '❌ Erro ao criar lançamento. Tente novamente.');
    return;
  }

  await send(chatId,
    `📝 <b>Confirmar lançamento?</b>\n\n` +
    `📌 Descrição: <b>${description}</b>\n` +
    `💰 Valor: <b>${fmt(amount)}</b>\n` +
    `📁 Categoria: <b>${categoryName || '(sem categoria)'}</b>\n` +
    `📅 Data: <b>${today}</b>`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Realizado', callback_data: `confirm_tx:${inserted.id}:REALIZED` },
          { text: '📋 Projetado', callback_data: `confirm_tx:${inserted.id}:PROJECTED` },
          { text: '❌ Cancelar', callback_data: `cancel_tx:${inserted.id}` },
        ]],
      },
    }
  );
}

async function handleCallback(cq: { id: string; data: string; message: { chat: { id: number } } }) {
  const chatId = cq.message.chat.id;
  const data = cq.data;

  if (data.startsWith('confirm_tx:')) {
    const [, txId, status] = data.split(':');
    await supabase.from('transactions').update({ status, updated_at: new Date().toISOString() }).eq('id', txId);
    const label = status === 'REALIZED' ? 'Realizado ✅' : 'Projetado 📋';
    await answerCallback(cq.id, `Marcado como ${label}`);
    await send(chatId, `✅ Lançamento salvo como <b>${label}</b>.`);
  } else if (data.startsWith('cancel_tx:')) {
    const [, txId] = data.split(':');
    await supabase.from('transactions').delete().eq('id', txId);
    await answerCallback(cq.id, 'Cancelado');
    await send(chatId, '🗑️ Lançamento cancelado.');
  } else if (data.startsWith('flow_status:')) {
    const status = data.split(':')[1];
    const userId = await getUserIdFromChat(chatId);
    if (!userId) return;
    const session = await getSession(chatId);
    if (!session) {
      await answerCallback(cq.id, 'Sessão expirada');
      await send(chatId, '⚠️ Sessão expirada. Use /lancamento para começar novamente.');
      return;
    }
    await answerCallback(cq.id);
    await finishFlow(chatId, userId, session.data, status);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('OK');

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return new Response('Bad Request', { status: 400 }); }

  if (body.callback_query) {
    await handleCallback(body.callback_query as { id: string; data: string; message: { chat: { id: number } } });
    return new Response('OK');
  }

  const message = body.message as { chat: { id: number }; text?: string } | undefined;
  if (!message?.text) return new Response('OK');

  const chatId = message.chat.id;
  const text = message.text.trim();
  const [rawCmd, ...argParts] = text.split(/\s+/);
  const cmd = rawCmd.toLowerCase().replace(/@\w+$/, '');
  const args = argParts.join(' ');

  if (cmd === '/start') { await handleStart(chatId, args); return new Response('OK'); }

  const userId = await getUserIdFromChat(chatId);
  if (!userId) {
    await send(chatId, '⚠️ Conta não vinculada. Use /start para ver as instruções.');
    return new Response('OK');
  }

  // Check for active guided flow (any non-command message continues it)
  const session = await getSession(chatId);

  // /lancamento: one-shot if args given, guided if not
  if (cmd === '/lancamento') {
    if (args.trim()) {
      await handleLancamentoOneShot(chatId, userId, args);
    } else {
      await askDescription(chatId);
    }
    return new Response('OK');
  }

  // /cancelar clears active session
  if (cmd === '/cancelar') {
    if (session) {
      await clearSession(chatId);
      await send(chatId, '🗑️ Lançamento cancelado.', removeKeyboard());
    } else {
      await send(chatId, 'Nenhum lançamento em andamento.');
    }
    return new Response('OK');
  }

  // If there's an active session, route free-text to the flow
  if (session && !text.startsWith('/')) {
    await handleSessionMessage(chatId, userId, text, session);
    return new Response('OK');
  }

  switch (cmd) {
    case '/ajuda':
    case '/help':      await handleAjuda(chatId); break;
    case '/saldo':     await handleSaldo(chatId, userId); break;
    case '/poupanca':  await handlePoupanca(chatId, userId); break;
    case '/faturas':   await handleFaturas(chatId, userId); break;
    case '/metas':     await handleMetas(chatId, userId); break;
    case '/resumo':    await handleResumo(chatId, userId); break;
    default:
      if (session) {
        // User sent a command mid-flow — ask if wants to cancel
        await send(chatId,
          '⚠️ Você tem um lançamento em andamento.\n\n' +
          'Use /cancelar para desistir, ou continue respondendo as perguntas.'
        );
      } else {
        await send(chatId,
          '❓ Comando não reconhecido. Use /ajuda para ver os comandos disponíveis.'
        );
      }
  }

  return new Response('OK');
});
