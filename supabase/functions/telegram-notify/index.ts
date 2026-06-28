import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function sendMessage(chatId: number, text: string) {
  await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

function fmt(n: number) {
  return `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

async function getAllSubscriptions() {
  const { data } = await supabase
    .from('telegram_subscriptions')
    .select('user_id, chat_id')
    .eq('notifications_enabled', true);
  return data ?? [];
}

async function notifyBillsDue(today: Date) {
  const subs = await getAllSubscriptions();
  for (const sub of subs) {
    const soon3 = new Date(today);
    soon3.setDate(soon3.getDate() + 3);
    const soon7 = new Date(today);
    soon7.setDate(soon7.getDate() + 7);

    const { data: bills } = await supabase
      .from('credit_card_bills')
      .select('due_date, total_amount, status, credit_cards(name, last_four_digits)')
      .eq('owner_id', sub.user_id)
      .in('status', ['OPEN', 'PARTIALLY_PAID'])
      .lte('due_date', soon7.toISOString().split('T')[0])
      .gte('due_date', today.toISOString().split('T')[0]);

    if (!bills?.length) continue;

    let msg = '🔔 <b>Faturas próximas do vencimento</b>\n\n';
    for (const bill of bills) {
      const card = (bill.credit_cards as { name: string; last_four_digits: string } | null);
      const due = new Date(bill.due_date + 'T12:00:00');
      const daysLeft = Math.round((due.getTime() - today.getTime()) / 86400000);
      const label = daysLeft === 0 ? '⚠️ <b>HOJE</b>' : daysLeft === 1 ? '⚠️ amanhã' : `em ${daysLeft} dias`;
      msg += `• ${card?.name ?? 'Cartão'} ****${card?.last_four_digits ?? '????'}\n`;
      msg += `  Venc. ${label} — ${fmt(bill.total_amount)}\n\n`;
    }
    await sendMessage(sub.chat_id, msg.trim());
  }
}

async function notifyGoalsExceeded(today: Date) {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const subs = await getAllSubscriptions();

  for (const sub of subs) {
    const { data: goals } = await supabase
      .from('goals')
      .select('category_id, monthly_limit')
      .eq('owner_id', sub.user_id)
      .eq('year', year)
      .eq('month', month);

    if (!goals?.length) continue;

    const { data: txs } = await supabase
      .from('transactions')
      .select('category_id, amount')
      .eq('owner_id', sub.user_id)
      .eq('status', 'REALIZED')
      .gte('date', `${year}-${String(month).padStart(2, '0')}-01`)
      .lte('date', `${year}-${String(month).padStart(2, '0')}-31`);

    const spentMap: Record<string, number> = {};
    for (const t of txs ?? []) {
      if (t.category_id) spentMap[t.category_id] = (spentMap[t.category_id] ?? 0) + t.amount;
    }

    const exceeded = goals.filter((g) => (spentMap[g.category_id] ?? 0) > g.monthly_limit);
    if (!exceeded.length) continue;

    const catIds = exceeded.map((g) => g.category_id);
    const { data: cats } = await supabase.from('categories').select('id, name').in('id', catIds);
    const catMap = Object.fromEntries((cats ?? []).map((c) => [c.id, c.name]));

    let msg = '⚠️ <b>Metas ultrapassadas este mês</b>\n\n';
    for (const g of exceeded) {
      const spent = spentMap[g.category_id] ?? 0;
      const pct = Math.round((spent / g.monthly_limit) * 100);
      msg += `• ${catMap[g.category_id] ?? g.category_id}: ${fmt(spent)} / ${fmt(g.monthly_limit)} (${pct}%)\n`;
    }
    await sendMessage(sub.chat_id, msg.trim());
  }
}

async function sendMonthlyAnalysis(today: Date) {
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const year = prev.getFullYear();
  const month = prev.getMonth() + 1;
  const monthStr = String(month).padStart(2, '0');
  const monthName = prev.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  const subs = await getAllSubscriptions();

  for (const sub of subs) {
    const { data: txs } = await supabase
      .from('transactions')
      .select('amount, category_id, status')
      .eq('owner_id', sub.user_id)
      .gte('date', `${year}-${monthStr}-01`)
      .lte('date', `${year}-${monthStr}-31`);

    const { data: entries } = await supabase
      .from('entries')
      .select('amount')
      .eq('owner_id', sub.user_id)
      .gte('date', `${year}-${monthStr}-01`)
      .lte('date', `${year}-${monthStr}-31`);

    const realized = (txs ?? []).filter((t) => t.status === 'REALIZED');
    const totalIncome = (entries ?? []).reduce((s, e) => s + e.amount, 0);
    const totalExpenses = realized.reduce((s, t) => s + t.amount, 0);
    const balance = totalIncome - totalExpenses;

    const spentMap: Record<string, number> = {};
    for (const t of realized) {
      if (t.category_id) spentMap[t.category_id] = (spentMap[t.category_id] ?? 0) + t.amount;
    }
    const topCatIds = Object.entries(spentMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);

    const { data: cats } = await supabase.from('categories').select('id, name').in('id', topCatIds);
    const catMap = Object.fromEntries((cats ?? []).map((c) => [c.id, c.name]));

    let msg = `📊 <b>Resumo de ${monthName}</b>\n\n`;
    msg += `💰 Receitas: ${fmt(totalIncome)}\n`;
    msg += `💸 Gastos: ${fmt(totalExpenses)}\n`;
    msg += `${balance >= 0 ? '✅' : '❌'} Saldo: ${fmt(balance)}\n`;

    if (topCatIds.length) {
      msg += '\n<b>Top categorias:</b>\n';
      for (const id of topCatIds) {
        msg += `  • ${catMap[id] ?? id}: ${fmt(spentMap[id])}\n`;
      }
    }
    await sendMessage(sub.chat_id, msg.trim());
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');

  const body = await req.json().catch(() => ({}));
  const type: string = body.type ?? '';
  const today = new Date();

  if (type === 'bills_due') {
    await notifyBillsDue(today);
  } else if (type === 'goals_exceeded') {
    await notifyGoalsExceeded(today);
  } else if (type === 'monthly_analysis') {
    await sendMonthlyAnalysis(today);
  } else {
    // Run all checks when called without explicit type (e.g. from cron)
    await notifyBillsDue(today);
    await notifyGoalsExceeded(today);
    if (today.getDate() === 1) {
      await sendMonthlyAnalysis(today);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
