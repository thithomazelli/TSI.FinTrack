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
  const end = new Date(year, month, 0).toISOString().split('T')[0];
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
    const monthBalance = totalIncome - spentRealized;

    // Saldo realmente disponível (acumulado, todo o histórico) — via view
    const { data: balRow } = await supabase
      .from('v_available_balance')
      .select('available')
      .eq('owner_id', sub.user_id)
      .maybeSingle();
    const available = Number(balRow?.available ?? 0);

    // Saldo projetado acumulado até fim do mês (equivalente ao get_balance_up_to)
    const [{ data: accRows }, { data: allEntries }, { data: allTxs }] = await Promise.all([
      supabase.from('accounts').select('balance').eq('owner_id', sub.user_id).eq('is_archived', false),
      supabase.from('entries').select('amount').eq('owner_id', sub.user_id).lte('date', end),
      supabase.from('transactions').select('amount').eq('owner_id', sub.user_id).lte('date', end),
    ]);
    const accBalance = (accRows ?? []).reduce((s, a) => s + a.balance, 0);
    const allEntriesSum = (allEntries ?? []).reduce((s, e) => s + e.amount, 0);
    const allTxsSum = (allTxs ?? []).reduce((s, t) => s + t.amount, 0);
    const projectedBalance = accBalance + allEntriesSum - allTxsSum;

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
    msg += `${available >= 0 ? '🏦' : '🔴'} <b>Saldo atual: ${fmt(available)}</b>\n`;
    msg += `${projectedBalance >= 0 ? '📊' : '⚠️'} <b>Saldo projetado: ${fmt(projectedBalance)}</b>\n`;
    msg += `<i>(acumulado, considerando todos os meses)</i>\n\n`;
    msg += `<b>Este mês:</b>\n`;
    msg += `💰 Receitas: ${fmt(totalIncome)}\n`;
    msg += `💸 Gastos realizados: ${fmt(spentRealized)}\n`;
    if (spentProjected > 0) {
      msg += `📋 Gastos projetados: ${fmt(spentProjected)}\n`;
      msg += `⏳ Pendente a pagar: ${fmt(spentProjected)}\n`;
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
  const lastDay = new Date(year, month, 0).toISOString().split('T')[0];
  const monthName = prev.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  const subs = await getAllSubscriptions();

  for (const sub of subs) {
    const { data: txs } = await supabase
      .from('transactions')
      .select('amount, category_id, status')
      .eq('owner_id', sub.user_id)
      .gte('date', `${year}-${monthStr}-01`)
      .lte('date', lastDay);

    const { data: entries } = await supabase
      .from('entries')
      .select('amount')
      .eq('owner_id', sub.user_id)
      .gte('date', `${year}-${monthStr}-01`)
      .lte('date', lastDay);

    const realized = (txs ?? []).filter((t) => t.status === 'REALIZED');
    const totalIncome = (entries ?? []).reduce((s, e) => s + e.amount, 0);
    const totalExpenses = realized.reduce((s, t) => s + t.amount, 0);
    const balance = totalIncome - totalExpenses;

    if (totalIncome === 0 && totalExpenses === 0) continue;

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

// Coleta gasto realizado por categoria + metas do mês corrente.
async function getCurrentMonthGoalData(userId: string, today: Date) {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const monthStr = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).toISOString().split('T')[0];

  const { data: goals } = await supabase
    .from('goals')
    .select('category_id, monthly_limit')
    .eq('owner_id', userId)
    .eq('year', year)
    .eq('month', month);

  const { data: txs } = await supabase
    .from('transactions')
    .select('category_id, amount')
    .eq('owner_id', userId)
    .eq('status', 'REALIZED')
    .gte('date', `${year}-${monthStr}-01`)
    .lte('date', lastDay);

  const spentMap: Record<string, number> = {};
  for (const t of txs ?? []) {
    if (t.category_id) spentMap[t.category_id] = (spentMap[t.category_id] ?? 0) + t.amount;
  }
  return { goals: goals ?? [], spentMap };
}

// Notificação de meio de mês: saúde financeira com base no ritmo vs metas.
async function sendMidMonthHealth(today: Date) {
  const subs = await getAllSubscriptions();
  const dayOfMonth = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const monthProgress = dayOfMonth / daysInMonth; // fração do mês decorrida

  for (const sub of subs) {
    const { goals, spentMap } = await getCurrentMonthGoalData(sub.user_id, today);
    if (!goals.length) continue;

    const catIds = goals.map((g) => g.category_id);
    const { data: cats } = await supabase.from('categories').select('id, name').in('id', catIds);
    const catMap = Object.fromEntries((cats ?? []).map((c) => [c.id, c.name]));

    let onTrack = 0;
    const alerts: string[] = [];
    for (const g of goals) {
      const spent = spentMap[g.category_id] ?? 0;
      const usedPct = g.monthly_limit > 0 ? spent / g.monthly_limit : 0;
      // "saudável" se o ritmo de gasto acompanha o avanço do mês (margem de 10%)
      if (usedPct <= monthProgress + 0.1) {
        onTrack++;
      } else {
        const pct = Math.round(usedPct * 100);
        alerts.push(`  • ${catMap[g.category_id] ?? g.category_id}: ${fmt(spent)} / ${fmt(g.monthly_limit)} (${pct}%)`);
      }
    }

    const healthScore = goals.length ? onTrack / goals.length : 1;
    const status =
      healthScore >= 0.8 ? '🟢 <b>Saúde financeira: BOA</b>' :
      healthScore >= 0.5 ? '🟡 <b>Saúde financeira: ATENÇÃO</b>' :
                           '🔴 <b>Saúde financeira: RUIM</b>';

    let msg = `🩺 <b>Balanço de meio de mês</b>\n\n${status}\n`;
    msg += `${onTrack} de ${goals.length} metas dentro do ritmo esperado.\n`;
    if (alerts.length) {
      msg += `\n<b>Acelerando demais:</b>\n${alerts.join('\n')}\n`;
      msg += `\nDá tempo de ajustar até o fim do mês 💪`;
    } else {
      msg += `\nMandando bem — siga assim! 🎯`;
    }
    await sendMessage(sub.chat_id, msg.trim());
  }
}

// Notificação do último dia: resumo final do mês corrente.
async function sendMonthEndSummary(today: Date) {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const monthStr = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).toISOString().split('T')[0];
  const monthName = today.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  const subs = await getAllSubscriptions();

  for (const sub of subs) {
    const { data: txs } = await supabase
      .from('transactions')
      .select('amount, category_id, status')
      .eq('owner_id', sub.user_id)
      .gte('date', `${year}-${monthStr}-01`)
      .lte('date', lastDay);

    const { data: entries } = await supabase
      .from('entries')
      .select('amount')
      .eq('owner_id', sub.user_id)
      .gte('date', `${year}-${monthStr}-01`)
      .lte('date', lastDay);

    const realized = (txs ?? []).filter((t) => t.status === 'REALIZED');
    const totalIncome = (entries ?? []).reduce((s, e) => s + e.amount, 0);
    const totalExpenses = realized.reduce((s, t) => s + t.amount, 0);
    const balance = totalIncome - totalExpenses;

    if (totalIncome === 0 && totalExpenses === 0) continue;

    const savedPct = totalIncome > 0 ? Math.round((balance / totalIncome) * 100) : 0;

    const spentMap: Record<string, number> = {};
    for (const t of realized) {
      if (t.category_id) spentMap[t.category_id] = (spentMap[t.category_id] ?? 0) + t.amount;
    }

    // Destaques por meta: quem mais economizou (abaixo da meta) e quem mais estourou
    const { goals } = await getCurrentMonthGoalData(sub.user_id, today);
    const allCatIds = [...new Set([...goals.map((g) => g.category_id), ...Object.keys(spentMap)])];
    const { data: cats } = await supabase.from('categories').select('id, name').in('id', allCatIds);
    const catMap = Object.fromEntries((cats ?? []).map((c) => [c.id, c.name]));

    let bestSaver: { name: string; diff: number } | null = null;
    let worstSpender: { name: string; diff: number } | null = null;
    for (const g of goals) {
      const spent = spentMap[g.category_id] ?? 0;
      const diff = g.monthly_limit - spent; // positivo = economizou
      const name = catMap[g.category_id] ?? g.category_id;
      if (diff > 0 && (!bestSaver || diff > bestSaver.diff)) bestSaver = { name, diff };
      if (diff < 0 && (!worstSpender || diff < worstSpender.diff)) worstSpender = { name, diff };
    }

    let msg = `🏁 <b>Fechamento de ${monthName}</b>\n\n`;
    msg += `💰 Receitas: ${fmt(totalIncome)}\n`;
    msg += `💸 Gastos: ${fmt(totalExpenses)}\n`;
    msg += `${balance >= 0 ? '✅' : '❌'} Saldo do mês: ${fmt(balance)}\n`;
    if (balance > 0) {
      msg += `\n🎉 Você economizou ${fmt(balance)} (${savedPct}% da renda)!`;
    } else if (balance < 0) {
      msg += `\n⚠️ O mês fechou no negativo. Vamos ajustar no próximo!`;
    } else {
      msg += `\nMês equilibrado — sem sobra nem falta.`;
    }
    if (bestSaver) {
      msg += `\n\n🟢 <b>Destaque de economia:</b> ${bestSaver.name} (${fmt(bestSaver.diff)} abaixo da meta)`;
    }
    if (worstSpender) {
      msg += `\n🔴 <b>Custo excessivo:</b> ${worstSpender.name} (${fmt(Math.abs(worstSpender.diff))} acima da meta)`;
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

  const day = today.getDate();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const isLastDay = day === lastDay;

  // Conjunto DIÁRIO (cron 1 — todo dia às 9h)
  async function runDaily() {
    await sendDailyDigest(today);
    await notifyBills(today);
    await notifyPendingDebits(today);
    await notifyGoalsExceeded(today);
  }

  // Conjunto MENSAL (cron 2 — 3x no mês: início, meio e fim)
  async function runMonthly() {
    if (day === 1) {
      await sendMonthlyAnalysis(today);   // dia 1: fechamento do mês anterior
    } else if (day === 16) {
      await sendMidMonthHealth(today);    // pós-meio: saúde financeira vs metas
    } else if (isLastDay) {
      await sendMonthEndSummary(today);   // último dia: resumo final + destaques
    }
  }

  if (type === 'daily') {
    await runDaily();
  } else if (type === 'monthly') {
    await runMonthly();
  } else if (type === 'bills_due') {
    await notifyBills(today);
  } else if (type === 'pending_debits') {
    await notifyPendingDebits(today);
  } else if (type === 'goals_exceeded') {
    await notifyGoalsExceeded(today);
  } else if (type === 'monthly_analysis') {
    await sendMonthlyAnalysis(today);
  } else if (type === 'mid_month_health') {
    await sendMidMonthHealth(today);
  } else if (type === 'month_end_summary') {
    await sendMonthEndSummary(today);
  } else if (type === 'daily_digest') {
    await sendDailyDigest(today);
  } else {
    // Sem tipo explícito: roda o diário (compatibilidade).
    await runDaily();
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
