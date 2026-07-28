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

async function answerCallback(id: string, text?: string) {
  await fetch(`${API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: id, text }),
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

// ─── Session ─────────────────────────────────────────────────────────────────

type SessionStep =
  | 'awaiting_description'
  | 'awaiting_amount'
  | 'awaiting_date'
  | 'awaiting_category'
  | 'awaiting_payment_type'
  | 'awaiting_account'
  | 'awaiting_card'
  | 'awaiting_source_account'
  | 'awaiting_people'
  | 'awaiting_confirm';

interface SessionData {
  description?: string;
  amount?: number;
  date?: string;
  categoryId?: string | null;
  categoryName?: string;
  paymentType?: 'debit' | 'credit';
  // débito: conta debitada (= fonte pagadora)
  accountId?: string | null;
  accountName?: string;
  // crédito: cartão + conta que paga a fatura
  creditCardId?: string | null;
  creditCardName?: string;
  sourceAccountId?: string | null;
  sourceAccountName?: string;
  people?: string[];
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

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayStr()     { return new Date().toISOString().split('T')[0]; }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; }
function tomorrowStr()  { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; }

function parseDate(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (t === 'hoje'    || t.startsWith('hoje '))    return todayStr();
  if (t === 'ontem'   || t.startsWith('ontem '))   return yesterdayStr();
  if (t === 'amanhã'  || t.startsWith('amanhã '))  return tomorrowStr();
  // strip "(YYYY-MM-DD)" suffix from keyboard buttons
  const stripped = t.replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '').trim();
  if (stripped === 'hoje')   return todayStr();
  if (stripped === 'ontem')  return yesterdayStr();
  if (stripped === 'amanhã') return tomorrowStr();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!m) return null;
  const year = m[3] ? parseInt(m[3]) : new Date().getFullYear();
  const month = String(m[2]).padStart(2, '0');
  const day   = String(m[1]).padStart(2, '0');
  const d = new Date(`${year}-${month}-${day}`);
  if (isNaN(d.getTime())) return null;
  return `${year}-${month}-${day}`;
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ─── Guided flow steps ────────────────────────────────────────────────────────

async function askDescription(chatId: number) {
  await setSession(chatId, 'awaiting_description', {});
  await send(chatId,
    '📝 <b>Novo lançamento</b>\n\n' +
    'Qual a <b>descrição</b> do gasto?\n\n' +
    '<i>Dica: envie tudo de uma vez:\n<code>/add ifood 45,90 alimentação</code></i>',
    removeKeyboard()
  );
}

async function askAmount(chatId: number, data: SessionData) {
  await setSession(chatId, 'awaiting_amount', data);
  await send(chatId,
    `✅ <b>${data.description}</b>\n\n💰 Qual o <b>valor</b>? (ex: <code>45,90</code>)\n/cancelar para desistir`,
    removeKeyboard()
  );
}

async function askDate(chatId: number, data: SessionData) {
  await setSession(chatId, 'awaiting_date', data);
  await send(chatId,
    `✅ Valor: <b>${fmt(data.amount!)}</b>\n\n📅 Qual a <b>data</b>?`,
    {
      reply_markup: {
        keyboard: [
          [{ text: `Hoje (${todayStr()})` }, { text: `Ontem (${yesterdayStr()})` }],
          [{ text: `Amanhã (${tomorrowStr()})` }, { text: 'Outra (DD/MM)' }],
        ],
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

  const rows: { text: string }[][] = [];
  const items = (cats ?? []) as { id: string; name: string }[];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2).map(c => ({ text: c.name })));
  }
  rows.push([{ text: '➡️ Pular categoria' }]);

  await send(chatId,
    `✅ Data: <b>${formatDateBR(data.date!)}</b>\n\n📁 Qual a <b>categoria</b>?`,
    { reply_markup: { keyboard: rows, resize_keyboard: true, one_time_keyboard: true } }
  );
}

async function askPaymentType(chatId: number, data: SessionData) {
  await setSession(chatId, 'awaiting_payment_type', data);
  const catLabel = data.categoryName ? `📁 ${data.categoryName}` : '📁 Sem categoria';
  await send(chatId,
    `✅ ${catLabel}\n\n💰 Forma de <b>pagamento</b>?`,
    {
      reply_markup: {
        keyboard: [
          [{ text: '🏦 Débito' }, { text: '💳 Crédito' }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
}

async function askAccount(chatId: number, userId: string, data: SessionData) {
  await setSession(chatId, 'awaiting_account', data);
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('owner_id', userId)
    .order('name');

  const rows: { text: string }[][] = [];
  const items = (accounts ?? []) as { id: string; name: string }[];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2).map(a => ({ text: a.name })));
  }
  rows.push([{ text: '➡️ Sem conta' }]);

  await send(chatId,
    `🏦 Débito\n\n🏦 Em qual <b>conta</b> foi debitado? (= fonte pagadora)`,
    { reply_markup: { keyboard: rows, resize_keyboard: true, one_time_keyboard: true } }
  );
}

async function askCard(chatId: number, userId: string, data: SessionData) {
  await setSession(chatId, 'awaiting_card', data);
  const { data: cards } = await supabase
    .from('credit_cards')
    .select('id, name, last_four_digits')
    .eq('owner_id', userId)
    .order('name');

  const rows: { text: string }[][] = [];
  const items = (cards ?? []) as { id: string; name: string; last_four_digits: string }[];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2).map(c => ({ text: `${c.name} ****${c.last_four_digits}` })));
  }
  rows.push([{ text: '➡️ Pular cartão' }]);

  await send(chatId,
    `💳 Crédito\n\n💳 Em qual <b>cartão</b>?`,
    { reply_markup: { keyboard: rows, resize_keyboard: true, one_time_keyboard: true } }
  );
}

async function askSourceAccount(chatId: number, userId: string, data: SessionData) {
  await setSession(chatId, 'awaiting_source_account', data);
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('owner_id', userId)
    .order('name');

  const rows: { text: string }[][] = [];
  const items = (accounts ?? []) as { id: string; name: string }[];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2).map(a => ({ text: a.name })));
  }
  rows.push([{ text: '➡️ Sem conta vinculada' }]);

  const cardLabel = data.creditCardName ? `💳 ${data.creditCardName}` : '💳 Cartão';
  await send(chatId,
    `✅ ${cardLabel}\n\n🏦 Qual <b>conta</b> paga a fatura? (fonte pagadora)`,
    { reply_markup: { keyboard: rows, resize_keyboard: true, one_time_keyboard: true } }
  );
}

async function buildPeopleKeyboard(userId: string, selected: string[]): Promise<{ text: string }[][]> {
  const { data: people } = await supabase
    .from('people')
    .select('name')
    .eq('owner_id', userId)
    .order('name');

  const items = (people ?? []) as { name: string }[];
  const rows: { text: string }[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2).map(p => ({
      text: selected.includes(p.name) ? `✅ ${p.name}` : p.name,
    })));
  }
  rows.push([{ text: '✅ Confirmar pessoas' }]);
  rows.push([{ text: '➡️ Pular' }]);
  return rows;
}

async function askAccount(chatId: number, userId: string, data: SessionData) {
  await setSession(chatId, 'awaiting_account', data);
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('owner_id', userId)
    .order('name');

  const rows: { text: string }[][] = [];
  const items = (accounts ?? []) as { id: string; name: string }[];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2).map(a => ({ text: a.name })));
  }
  rows.push([{ text: '➡️ Sem conta' }]);

  await send(chatId,
    `💳 Sem cartão\n\n🏦 Em qual <b>conta</b> saiu o débito?`,
    { reply_markup: { keyboard: rows, resize_keyboard: true, one_time_keyboard: true } }
  );
}

async function askPeople(chatId: number, userId: string, data: SessionData) {
  const people: string[] = [];
  await setSession(chatId, 'awaiting_people', { ...data, people });

  const rows = await buildPeopleKeyboard(userId, people);
  const cardLabel = data.creditCardName
    ? `💳 ${data.creditCardName}${data.sourceAccountName ? ` · 🏦 ${data.sourceAccountName}` : ''}`
    : data.accountName
      ? `🏦 ${data.accountName}`
      : '—';
  await send(chatId,
    `✅ ${cardLabel}\n\n👥 Selecione as <b>pessoas</b> envolvidas (pode escolher várias):\n\n` +
    '<i>Toque nos nomes ou <b>digite um nome</b> e envie. Depois toque em "Confirmar pessoas".</i>',
    { reply_markup: { keyboard: rows, resize_keyboard: true, one_time_keyboard: false } }
  );
}

async function askConfirm(chatId: number, data: SessionData) {
  await setSession(chatId, 'awaiting_confirm', data);

  const peopleLabel = data.people?.length ? data.people.join(', ') : '—';
  const catLabel    = data.categoryName ?? '—';
  const paymentLines = data.paymentType === 'credit'
    ? `💳 ${data.creditCardName ?? 'Cartão'}\n🏦 Fonte: ${data.sourceAccountName ?? '—'}`
    : `🏦 ${data.accountName ?? '—'}`;

  await send(chatId,
    `📋 <b>Confirmar lançamento?</b>\n\n` +
    `📌 <b>${data.description}</b>\n` +
    `💰 ${fmt(data.amount!)}\n` +
    `📅 ${formatDateBR(data.date!)}\n` +
    `📁 ${catLabel}\n` +
    `${paymentLines}\n` +
    `👥 ${peopleLabel}`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Realizado', callback_data: 'flow_status:REALIZED' },
          { text: '📋 Projetado', callback_data: 'flow_status:PROJECTED' },
          { text: '❌ Cancelar',  callback_data: 'flow_cancel' },
        ]],
      },
    }
  );
}

async function finishFlow(chatId: number, userId: string, data: SessionData, status: string) {
  await clearSession(chatId);

  const accountIdToSave = data.paymentType === 'credit'
    ? (data.sourceAccountId ?? null)
    : (data.accountId ?? null);

  const { error } = await supabase
    .from('transactions')
    .insert({
      owner_id:       userId,
      description:    data.description,
      amount:         data.amount,
      date:           data.date ?? todayStr(),
      category_id:    data.categoryId ?? null,
      credit_card_id: data.creditCardId ?? null,
      account_id:     accountIdToSave,
      status,
      labels:         data.people ?? [],
    });

  if (error) {
    await send(chatId, '❌ Erro ao salvar lançamento. Tente novamente.', removeKeyboard());
    return;
  }

  const statusLabel = status === 'REALIZED' ? 'Realizado ✅' : 'Projetado 📋';
  const peopleLabel = data.people?.length ? `\n👥 ${data.people.join(', ')}` : '';
  const paymentLabel = data.paymentType === 'credit'
    ? `\n💳 ${data.creditCardName ?? 'Cartão'}` +
      (data.sourceAccountName ? `\n🏦 Fonte: ${data.sourceAccountName}` : '')
    : data.accountName ? `\n🏦 ${data.accountName}` : '';
  await send(chatId,
    `🎉 <b>Lançamento salvo!</b>\n\n` +
    `📌 ${data.description}\n` +
    `💰 ${fmt(data.amount!)}\n` +
    `📅 ${formatDateBR(data.date ?? todayStr())}\n` +
    `📁 ${data.categoryName ?? 'Sem categoria'}` +
    `${paymentLabel}${peopleLabel}\n` +
    `📊 ${statusLabel}`,
    removeKeyboard()
  );
}

// ─── Session message router ───────────────────────────────────────────────────

async function handleSessionMessage(
  chatId: number, userId: string, text: string,
  session: { step: SessionStep; data: SessionData }
) {
  const { step, data } = session;

  if (text === '/cancelar' || text === '/cancel') {
    await clearSession(chatId);
    await send(chatId, '🗑️ Lançamento cancelado.', removeKeyboard());
    return;
  }

  switch (step) {
    case 'awaiting_description': {
      const description = text.trim();
      if (!description) { await send(chatId, '❌ Descrição não pode ser vazia.'); return; }
      await askAmount(chatId, { ...data, description });
      break;
    }

    case 'awaiting_amount': {
      const amount = parseFloat(text.trim().replace(',', '.'));
      if (isNaN(amount) || amount <= 0) {
        await send(chatId, '❌ Valor inválido. Ex: <code>45,90</code>');
        return;
      }
      await askDate(chatId, { ...data, amount });
      break;
    }

    case 'awaiting_date': {
      if (text === 'Outra (DD/MM)') {
        await send(chatId, '📅 Digite a data no formato <code>DD/MM</code> ou <code>DD/MM/AAAA</code>:',
          removeKeyboard());
        return;
      }
      const date = parseDate(text);
      if (!date) {
        await send(chatId, '❌ Data inválida. Use <code>DD/MM</code> ou <code>DD/MM/AAAA</code>.');
        return;
      }
      await askCategory(chatId, userId, { ...data, date });
      break;
    }

    case 'awaiting_category': {
      let categoryId: string | null = null;
      let categoryName: string | undefined;
      if (text !== '➡️ Pular categoria') {
        const { data: cats } = await supabase.from('categories').select('id, name').eq('owner_id', userId);
        const matched = (cats ?? [] as { id: string; name: string }[]).find(
          (c: { name: string }) => c.name.toLowerCase() === text.trim().toLowerCase()
        );
        if (matched) { categoryId = matched.id; categoryName = matched.name; }
      }
      await askPaymentType(chatId, { ...data, categoryId, categoryName });
      break;
    }

    case 'awaiting_payment_type': {
      if (text === '🏦 Débito') {
        await askAccount(chatId, userId, { ...data, paymentType: 'debit' });
      } else if (text === '💳 Crédito') {
        await askCard(chatId, userId, { ...data, paymentType: 'credit' });
      } else {
        await send(chatId, '❌ Escolha uma opção: <b>🏦 Débito</b> ou <b>💳 Crédito</b>.');
      }
      break;
    }

    case 'awaiting_account': {
      let accountId: string | null = null;
      let accountName: string | undefined;
      if (text !== '➡️ Sem conta') {
        const { data: accounts } = await supabase
          .from('accounts').select('id, name').eq('owner_id', userId);
        const matched = (accounts ?? [] as { id: string; name: string }[]).find(
          (a: { name: string }) => a.name.toLowerCase() === text.trim().toLowerCase()
        );
        if (matched) { accountId = matched.id; accountName = matched.name; }
      }
      await askPeople(chatId, userId, { ...data, accountId, accountName });
      break;
    }

    case 'awaiting_card': {
      let creditCardId: string | null = null;
      let creditCardName: string | undefined;
      if (text !== '➡️ Pular cartão') {
        const { data: cards } = await supabase
          .from('credit_cards').select('id, name, last_four_digits').eq('owner_id', userId);
        const matched = (cards ?? [] as { id: string; name: string; last_four_digits: string }[]).find(
          (c: { name: string; last_four_digits: string }) =>
            text === `${c.name} ****${c.last_four_digits}`
        );
        if (matched) { creditCardId = matched.id; creditCardName = `${matched.name} ****${matched.last_four_digits}`; }
      }
      await askSourceAccount(chatId, userId, { ...data, creditCardId, creditCardName });
      break;
    }

    case 'awaiting_source_account': {
      let sourceAccountId: string | null = null;
      let sourceAccountName: string | undefined;
      if (text !== '➡️ Sem conta vinculada') {
        const { data: accounts } = await supabase
          .from('accounts').select('id, name').eq('owner_id', userId);
        const matched = (accounts ?? [] as { id: string; name: string }[]).find(
          (a: { name: string }) => a.name.toLowerCase() === text.trim().toLowerCase()
        );
        if (matched) { sourceAccountId = matched.id; sourceAccountName = matched.name; }
      }
      await askPeople(chatId, userId, { ...data, sourceAccountId, sourceAccountName });
      break;
    }

    case 'awaiting_people': {
      if (text === '➡️ Pular' || text === '✅ Confirmar pessoas') {
        await askConfirm(chatId, data);
        return;
      }
      // Strip leading checkmark if user tapped a selected name button (e.g. "✅ João")
      const personName = text.trim().replace(/^✅\s*/, '');
      const people = [...(data.people ?? [])];
      const idx = people.indexOf(personName);
      let msg: string;
      if (idx >= 0) {
        people.splice(idx, 1);
        msg = `➖ <b>${personName}</b> removido(a).`;
      } else {
        people.push(personName);
        msg = `➕ <b>${personName}</b> adicionado(a).`;
      }
      const newData = { ...data, people };
      await setSession(chatId, 'awaiting_people', newData);
      // Re-send keyboard so "Confirmar pessoas" stays visible
      const selectedLabel = people.length ? `\n👥 Selecionados: <b>${people.join(', ')}</b>` : '';
      const rows = await buildPeopleKeyboard(userId, people);
      await send(chatId, `${msg}${selectedLabel}`,
        { reply_markup: { keyboard: rows, resize_keyboard: true, one_time_keyboard: false } }
      );
      break;
    }

    case 'awaiting_confirm': {
      // Only reachable if user types instead of tapping inline button
      await send(chatId, '⚠️ Use os botões acima para confirmar ou cancelar o lançamento.');
      break;
    }
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
    .from('telegram_links').select('user_id, used').eq('token', token).single();

  if (error || !link) { await send(chatId, '❌ Token inválido ou expirado. Gere um novo link no app.'); return; }
  if (link.used)      { await send(chatId, '⚠️ Este token já foi utilizado. Gere um novo link no app.'); return; }

  await supabase.from('telegram_links').update({ used: true }).eq('token', token);
  await supabase.from('telegram_subscriptions').upsert(
    { user_id: link.user_id, chat_id: chatId, notifications_enabled: true },
    { onConflict: 'user_id' }
  );
  await send(chatId, '✅ <b>Conta vinculada com sucesso!</b>\n\nUse /ajuda para ver tudo que posso fazer por você.');
}

async function handleAjuda(chatId: number) {
  await send(chatId,
    '📖 <b>Comandos disponíveis</b>\n\n' +
    '💰 /saldo — saldo do mês atual\n\n' +
    '🏦 /poupanca — saldo da poupança\n\n' +
    '💳 /faturas — faturas de cartão do mês\n\n' +
    '🎯 /metas — progresso das metas de gasto\n\n' +
    '📊 /resumo — resumo completo (saldo + metas + faturas)\n\n' +
    '➕ /add — registrar um gasto\n' +
    '   • Sem argumentos: fluxo guiado passo a passo\n' +
    '   • Com argumentos: <code>/add ifood 45,90 alimentação</code>\n\n' +
    '🗑️ /cancelar — cancela um lançamento em andamento\n\n' +
    '❓ /ajuda — mostra esta mensagem'
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
  const realized    = (txs ?? []).filter((t: { status: string }) => t.status === 'REALIZED').reduce((s: number, t: { amount: number }) => s + t.amount, 0);
  const projected   = (txs ?? []).reduce((s: number, t: { amount: number }) => s + t.amount, 0);
  await send(chatId,
    `📊 <b>Saldo — ${String(month).padStart(2,'0')}/${year}</b>\n\n` +
    `💰 Entradas: <b>${fmt(totalIncome)}</b>\n` +
    `💸 Gastos realizados: <b>${fmt(realized)}</b>\n` +
    `📋 Gastos projetados: <b>${fmt(projected)}</b>\n` +
    `─────────────────\n` +
    `✅ Saldo realizado: <b>${fmt(totalIncome - realized)}</b>\n` +
    `🔮 Saldo projetado: <b>${fmt(totalIncome - projected)}</b>`
  );
}

async function handlePoupanca(chatId: number, userId: string) {
  const { data: movements } = await supabase.from('savings_movements').select('amount, type_id').eq('owner_id', userId);
  if (!movements?.length) { await send(chatId, '🏦 Nenhum movimento de poupança encontrado.'); return; }
  const { data: types } = await supabase.from('domain_lists').select('id, code').eq('owner_id', userId).eq('list_code', 'savings_movement_type');
  const withdrawalIds = new Set((types ?? []).filter((t: { code: string }) => t.code === 'WITHDRAWAL').map((t: { id: string }) => t.id));
  const balance = movements.reduce((s: number, m: { amount: number; type_id: string }) =>
    withdrawalIds.has(m.type_id) ? s - m.amount : s + m.amount, 0);
  await send(chatId, `🏦 <b>Saldo da Poupança</b>\n\n💰 Saldo atual: <b>${fmt(balance)}</b>\n📝 ${movements.length} movimentos registrados`);
}

async function handleFaturas(chatId: number, userId: string) {
  const { year, month } = currentYearMonth();
  const { data: bills } = await supabase
    .from('credit_card_bills').select('*, credit_cards(name, last_four_digits)')
    .eq('owner_id', userId).eq('year', year).eq('month', month);
  if (!bills?.length) { await send(chatId, `💳 Nenhuma fatura em ${String(month).padStart(2,'0')}/${year}.`); return; }
  const lines = bills.map((b: { credit_cards?: { name: string; last_four_digits: string }; total_amount: number; status: string; due_date?: string }) => {
    const card   = b.credit_cards;
    const status = ({ OPEN: '🟡 Aberta', CLOSED: '🟠 Fechada', PAID: '🟢 Paga' } as Record<string,string>)[b.status] ?? b.status;
    const due    = b.due_date ? ` | venc. ${b.due_date.slice(0, 10)}` : '';
    return `• ${card?.name ?? 'Cartão'} (****${card?.last_four_digits ?? '????'}): <b>${fmt(b.total_amount ?? 0)}</b> — ${status}${due}`;
  }).join('\n');
  await send(chatId, `💳 <b>Faturas — ${String(month).padStart(2,'0')}/${year}</b>\n\n${lines}`);
}

async function handleMetas(chatId: number, userId: string) {
  const { year, month } = currentYearMonth();
  const { start, end } = monthDateRange(year, month);
  const [{ data: goals }, { data: txs }, { data: cats }] = await Promise.all([
    supabase.from('goals').select('*').eq('owner_id', userId).eq('year', year).eq('month', month),
    supabase.from('transactions').select('amount, category_id').eq('owner_id', userId).eq('status', 'REALIZED').gte('date', start).lte('date', end),
    supabase.from('categories').select('id, name').eq('owner_id', userId),
  ]);
  if (!goals?.length) { await send(chatId, '🎯 Nenhuma meta definida para este mês.'); return; }
  const spentMap: Record<string, number> = {};
  for (const t of (txs ?? [])) {
    if (t.category_id) spentMap[t.category_id] = (spentMap[t.category_id] ?? 0) + t.amount;
  }
  const lines = goals.map((g: { category_id: string; monthly_limit: number }) => {
    const cat  = (cats ?? []).find((c: { id: string }) => c.id === g.category_id) as { name: string } | undefined;
    const spent = spentMap[g.category_id] ?? 0;
    const pct   = g.monthly_limit > 0 ? (spent / g.monthly_limit) * 100 : 0;
    const bar   = '█'.repeat(Math.round(pct / 10)).padEnd(10, '░');
    const icon  = spent > g.monthly_limit ? '🔴' : pct >= 80 ? '🟡' : '🟢';
    return `${icon} <b>${cat?.name ?? g.category_id}</b>\n   ${bar} ${pct.toFixed(0)}% — ${fmt(spent)} / ${fmt(g.monthly_limit)}`;
  }).join('\n\n');
  await send(chatId, `🎯 <b>Metas — ${String(month).padStart(2,'0')}/${year}</b>\n\n${lines}`);
}

async function handleResumo(chatId: number, userId: string) {
  await handleSaldo(chatId, userId);
  await handleMetas(chatId, userId);
  await handleFaturas(chatId, userId);
}

// One-shot: /add descrição valor [categoria]
async function handleAddOneShot(chatId: number, userId: string, args: string) {
  const parts = args.trim().split(/\s+/);
  const amountStr = parts.find((p) => /^\d+([.,]\d{1,2})?$/.test(p));
  if (!amountStr) {
    await send(chatId, '❌ Não encontrei o valor. Ex: <code>/add ifood 45,90 alimentação</code>');
    return;
  }
  const amount    = parseFloat(amountStr.replace(',', '.'));
  const amountIdx = parts.indexOf(amountStr);
  const description  = parts.slice(0, amountIdx).join(' ') || 'Lançamento rápido';
  const categoryHint = parts.slice(amountIdx + 1).join(' ').toLowerCase();

  let categoryId: string | null = null;
  let categoryName = '';
  if (categoryHint) {
    const { data: cats } = await supabase.from('categories').select('id, name').eq('owner_id', userId);
    const matched = (cats ?? [] as { id: string; name: string }[]).find(
      (c: { name: string }) => c.name.toLowerCase().includes(categoryHint) || categoryHint.includes(c.name.toLowerCase())
    );
    if (matched) { categoryId = matched.id; categoryName = matched.name; }
  }

  const date = todayStr();
  // Store in session and show confirmation
  const sessionData: SessionData = { description, amount, date, categoryId, categoryName, creditCardId: null, accountId: null, people: [] };
  await askConfirm(chatId, sessionData);
}

async function handleCallback(cq: { id: string; data: string; message: { chat: { id: number } } }) {
  const chatId = cq.message.chat.id;
  const cbData = cq.data;

  if (cbData === 'flow_cancel') {
    await clearSession(chatId);
    await answerCallback(cq.id, 'Cancelado');
    await send(chatId, '🗑️ Lançamento cancelado.', removeKeyboard());
    return;
  }

  if (cbData.startsWith('flow_status:')) {
    const status = cbData.split(':')[1];
    const userId = await getUserIdFromChat(chatId);
    if (!userId) { await answerCallback(cq.id, 'Conta não vinculada'); return; }
    const session = await getSession(chatId);
    if (!session) {
      await answerCallback(cq.id, 'Sessão expirada');
      await send(chatId, '⚠️ Sessão expirada. Use /add para começar novamente.');
      return;
    }
    await answerCallback(cq.id);
    await finishFlow(chatId, userId, session.data, status);
    return;
  }

  // Legacy one-shot confirm/cancel
  if (cbData.startsWith('confirm_tx:')) {
    const [, txId, status] = cbData.split(':');
    await supabase.from('transactions').update({ status, updated_at: new Date().toISOString() }).eq('id', txId);
    const label = status === 'REALIZED' ? 'Realizado ✅' : 'Projetado 📋';
    await answerCallback(cq.id, `Marcado como ${label}`);
    await send(chatId, `✅ Lançamento salvo como <b>${label}</b>.`);
  } else if (cbData.startsWith('cancel_tx:')) {
    const [, txId] = cbData.split(':');
    await supabase.from('transactions').delete().eq('id', txId);
    await answerCallback(cq.id, 'Cancelado');
    await send(chatId, '🗑️ Lançamento cancelado.');
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
  const text   = message.text.trim();
  const [rawCmd, ...argParts] = text.split(/\s+/);
  const cmd  = rawCmd.toLowerCase().replace(/@\w+$/, '');
  const args = argParts.join(' ');

  if (cmd === '/start') { await handleStart(chatId, args); return new Response('OK'); }

  const userId = await getUserIdFromChat(chatId);
  if (!userId) {
    await send(chatId, '⚠️ Conta não vinculada. Use /start para ver as instruções.');
    return new Response('OK');
  }

  // /add and /lancamento (alias)
  if (cmd === '/add' || cmd === '/lancamento') {
    if (args.trim()) {
      await handleAddOneShot(chatId, userId, args);
    } else {
      await askDescription(chatId);
    }
    return new Response('OK');
  }

  // /cancelar clears active session
  if (cmd === '/cancelar' || cmd === '/cancel') {
    const session = await getSession(chatId);
    if (session) {
      await clearSession(chatId);
      await send(chatId, '🗑️ Lançamento cancelado.', removeKeyboard());
    } else {
      await send(chatId, 'Nenhum lançamento em andamento.');
    }
    return new Response('OK');
  }

  // Active session: route free-text
  const session = await getSession(chatId);
  if (session && !text.startsWith('/')) {
    await handleSessionMessage(chatId, userId, text, session);
    return new Response('OK');
  }

  switch (cmd) {
    case '/ajuda':
    case '/help':     await handleAjuda(chatId);            break;
    case '/saldo':    await handleSaldo(chatId, userId);     break;
    case '/poupanca': await handlePoupanca(chatId, userId);  break;
    case '/faturas':  await handleFaturas(chatId, userId);   break;
    case '/metas':    await handleMetas(chatId, userId);     break;
    case '/resumo':   await handleResumo(chatId, userId);    break;
    default:
      if (session) {
        await send(chatId, '⚠️ Você tem um lançamento em andamento.\nUse /cancelar para desistir, ou continue respondendo as perguntas.');
      } else {
        await send(chatId, '❓ Comando não reconhecido. Use /ajuda para ver os comandos disponíveis.');
      }
  }

  return new Response('OK');
});
