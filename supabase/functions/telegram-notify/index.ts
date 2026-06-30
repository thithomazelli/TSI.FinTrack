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

async function notifyBills(today: Date) {
  const subs = await getAllSubscriptions();
  const todayStr = today.toISOString().split('T')[0];
  for (const sub of subs) {
    const soon7 = new Date(today);
    soon7.setDate(soon7.getDate() + 7);

    // Faturas em aberto que já venceram OU vencem nos próximos 7 dias
    const { data: bills } = await supabase
      .from('credit_card_bills')
      .select('due_date, total_amount, status, credit_cards(name, last_four_digits)')
      .eq('owner_id', sub.user_id)
      .in('status', ['OPEN', 'CLOSED'])
      .lte('due_date', soon7.toISOString().split('T')[0])
      .order('due_date', { ascending: true });

    if (!bills?.length) continue;

    const overdue: string[] = [];
    const upcoming: string[] = [];

    for (const bill of bills) {
      const card = (bill.credit_cards as { name: string; last_four_digits: string } | null);
      const due = new Date(bill.due_date + 'T12:00:00');
      const daysLeft = Math.round((due.getTime() - today.getTime()) / 86400000);
      const name = `${card?.name ?? 'Cartão'} ****${card?.last_four_digits ?? '????'}`;

      if (bill.due_date < todayStr) {
        const daysOver = Math.abs(daysLeft);
        overdue.push(`• ${name}\n  🔴 Vencida há ${daysOver} dia(s) — ${fmt(bill.total_amount)}`);
      } else {
        const label = daysLeft === 0 ? '<b>HOJE</b>' : daysLeft === 1 ? 'amanhã' : `em ${daysLeft} dias`;
        upcoming.push(`• ${name}\n  Vence ${label} — ${fmt(bill.total_amount)}`);
      }
    }

    let msg = '';
    if (overdue.length) {
      msg += '🚨 <b>Faturas vencidas</b>\n\n' + overdue.join('\n\n') + '\n\n';
    }
    if (upcoming.length) {
      msg += '🔔 <b>Faturas próximas do vencimento</b>\n\n' + upcoming.join('\n\n');
    }
    if (msg.trim()) await sendMessage(sub.chat_id, msg.trim());
  }
}

async function notifyPendingDebits(today: Date) {
  const subs = await getAllSubscriptions();
  const todayStr = today.toISOString().split('T')[0];
  const soon7 = new Date(today);
  soon7.setDate(soon7.getDate() + 7);

  for (const sub of subs) {
    // Lançamentos individuais pendentes (status PROJECTED) que não são de cartão
    // — ex.: aluguel, água, inglês. Cartão é coberto pela notificação de faturas.
    const { data: txs } = await supabase
      .from('transactions')
      .select('description, amount, date, status, credit_card_id')
      .eq('owner_id', sub.user_id)
      .eq('status', 'PROJECTED')
      .is('credit_card_id', null)
      .lte('date', soon7.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (!txs?.length) continue;

    const overdue: string[] = [];
    const upcoming: string[] = [];

    for (const tx of txs) {
      const due = new Date(tx.date + 'T12:00:00');
      const daysLeft = Math.round((due.getTime() - today.getTime()) / 86400000);
      if (tx.date < todayStr) {
        overdue.push(`• ${tx.description}\n  🔴 Em atraso há ${Math.abs(daysLeft)} dia(s) — ${fmt(tx.amount)}`);
      } else {
        const label = daysLeft === 0 ? '<b>HOJE</b>' : daysLeft === 1 ? 'amanhã' : `em ${daysLeft} dias`;
        upcoming.push(`• ${tx.description}\n  Vence ${label} — ${fmt(tx.amount)}`);
      }
    }

    let msg = '';
    if (overdue.length) {
      msg += '🚨 <b>Contas em atraso</b>\n\n' + overdue.join('\n\n') + '\n\n';
    }
    if (upcoming.length) {
      msg += '🔔 <b>Contas a vencer</b>\n\n' + upcoming.join('\n\n');
    }
    if (msg.trim()) await sendMessage(sub.chat_id, msg.trim());
  }
}

async function sendDailyDigest(today: Date) {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const monthStr = String(month).padStart(2, '0');
  const start = `${year}-${monthStr}-01`;
  const end = `${year}-${monthStr}-31`;
  const todayStr = today.toISOString().split('T')[0];
  const monthName = today.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  const subs = await getAllSubscriptions();

  for (const sub of subs) {
    const { data: txs } = await supabase
      .from('transactions')
      .select('amount, status')
      .eq('owner_id', sub.user_id)
      .gte('date', start)
      .lte('date', end);

    const { data: entries } = await supabase
      .from('entries')
      .select('amount')
      .eq('owner_id', sub.user_id)
      .gte('date', start)
      .lte('date', end);

    const realized = (txs ?? []).filter((t) => t.status === 'REALIZED');
    const projected = (txs ?? []).filter((t) => t.status === 'PROJECTED');
    const totalIncome = (entries ?? []).reduce((s, e) => s + e.amount, 0);
    const spentRealized = realized.reduce((s, t) => s + t.amount, 0);
    const spentProjected = projected.reduce((s, t) => s + t.amount, 0);
    const balance = totalIncome - spentRealized;

    // Faturas em aberto vencidas ou a vencer (contagem rápida)
    const soon7 = new Date(today);
    soon7.setDate(soon7.getDate() + 7);
    const { data: bills } = await supabase
      .from('credit_card_bills')
      .select('due_date, total_amount, status')
      .eq('owner_id', sub.user_id)
      .in('status', ['OPEN', 'CLOSED'])
      .lte('due_date', soon7.toISOString().split('T')[0]);

    const overdueCount = (bills ?? []).filter((b) => b.due_date < todayStr).length;
    const dueSoonCount = (bills ?? []).filter((b) => b.due_date >= todayStr).length;

    // Lançamentos individuais pendentes (não-cartão) — atraso e a vencer
    const { data: pendingTxs } = await supabase
      .from('transactions')
      .select('date')
      .eq('owner_id', sub.user_id)
      .eq('status', 'PROJECTED')
      .is('credit_card_id', null)
      .lte('date', soon7.toISOString().split('T')[0]);
    const debitOverdue = (pendingTxs ?? []).filter((t) => t.date < todayStr).length;
    const debitDueSoon = (pendingTxs ?? []).filter((t) => t.date >= todayStr).length;

    let msg = `📅 <b>Resumo de hoje — ${monthName}</b>\n\n`;
    msg += `💰 Receitas no mês: ${fmt(totalIncome)}\n`;
    msg += `💸 Gastos realizados: ${fmt(spentRealized)}\n`;
    msg += `${balance >= 0 ? '✅' : '❌'} Saldo atual: ${fmt(balance)}\n`;
    if (spentProjected > 0) {
      msg += `📉 Gastos projetados: ${fmt(spentProjected)}\n`;
    }
    if (overdueCount || dueSoonCount) {
      msg += `\n<b>Faturas:</b>\n`;
      if (overdueCount) msg += `  🚨 ${overdueCount} vencida(s)\n`;
      if (dueSoonCount) msg += `  🔔 ${dueSoonCount} a vencer em 7 dias\n`;
    }
    if (debitOverdue || debitDueSoon) {
      msg += `\n<b>Contas:</b>\n`;
      if (debitOverdue) msg += `  🚨 ${debitOverdue} em atraso\n`;
      if (debitDueSoon) msg += `  🔔 ${debitDueSoon} a vencer em 7 dias\n`;
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
    await notifyBills(today);
  } else if (type === 'pending_debits') {
    await notifyPendingDebits(today);
  } else if (type === 'goals_exceeded') {
    await notifyGoalsExceeded(today);
  } else if (type === 'monthly_analysis') {
    await sendMonthlyAnalysis(today);
  } else if (type === 'daily_digest') {
    await sendDailyDigest(today);
  } else {
    // Sem tipo explícito (cron diário): roda o conjunto diário.
    await sendDailyDigest(today);
    await notifyBills(today);
    await notifyPendingDebits(today);
    await notifyGoalsExceeded(today);
    if (today.getDate() === 1) {
      await sendMonthlyAnalysis(today);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
