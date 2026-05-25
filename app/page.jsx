"use client";
// @ts-nocheck

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Home,
  Pencil,
  Plus,
  Receipt,
  Settings,
  ShieldCheck,
  Target,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase, supabaseEnabled } from "@/lib/supabase";

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
});

const isProduction = process.env.NODE_ENV === "production";
const todayISO = () => new Date().toISOString().slice(0, 10);
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const storageKey = "sama-money-guard-v4";
const authCooldownStorageKey = "money-guard-auth-cooldown";
const inactivityLimitMs = 15 * 60 * 1000; // 15 minutes
const lastActivityStorageKey = "money-guard-last-activity";

function getStoredAuthCooldown() {
  if (typeof window === "undefined") {
    return 0;
  }

  try {
    const stored = window.localStorage.getItem(authCooldownStorageKey);
    if (!stored) {
      return 0;
    }

    const parsed = JSON.parse(stored);
    if (typeof parsed?.until === "number" && parsed.until > Date.now()) {
      return parsed.until;
    }

    window.localStorage.removeItem(authCooldownStorageKey);
    return 0;
  } catch {
    window.localStorage.removeItem(authCooldownStorageKey);
    return 0;
  }
}

function getCleanDefaultState() {
  return migrateState({
    startingCash: 0,
    transactions: [],
    bills: [],
    goals: [],
    incomeSources: [],
    settings: {},
  });
}

function getUserStorageKey(userId) {
  return `${storageKey}-${userId}`;
}

function loadUserLocalBackup(userId) {
  if (!userId || typeof window === "undefined") {
    return null;
  }

  try {
    const saved = window.localStorage.getItem(getUserStorageKey(userId));
    return saved ? migrateState(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

function saveUserLocalBackup(userId, payload) {
  if (!userId || typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getUserStorageKey(userId), JSON.stringify(payload));
}

function getSafeStartupData() {
  if (!supabaseEnabled && !isProduction) {
    return loadState();
  }

  return getCleanDefaultState();
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dateISO(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function getDaysUntil(date) {
  const start = new Date(todayISO());
  const end = new Date(date);
  return Math.ceil((end - start) / 86400000);
}

function normalizeIncomeSource(source, fallbackDate = dateISO(addDays(todayISO(), 5))) {
  const baseDate = source?.expectedDate || fallbackDate;

  return {
    id: source?.id || makeId(),
    name: source?.name || "Main Income",
    amount: Number(source?.amount || 0),
    expectedDate: baseDate,
    status: source?.status === "Received" || source?.status === "Missed" ? source.status : "Expected",
  };
}

function generateLegacyIncomeSources(settings = {}) {
  const salary = Number(settings.salaryPerPayday || 0);
  if (!salary) {
    return [];
  }

  const paydayDays = [Number(settings.firstPayday || 5), Number(settings.secondPayday || 20)]
    .filter((day) => Number.isFinite(day));

  return paydayDays.map((day, index) => {
    const payday = new Date(todayISO());
    payday.setDate(day);

    if (payday < new Date(todayISO())) {
      payday.setMonth(payday.getMonth() + 1);
    }

    return {
      id: makeId(),
      name: index === 0 ? "Primary Income" : "Secondary Income",
      amount: salary,
      expectedDate: dateISO(payday),
      status: "Expected",
    };
  });
}

function getNextExpectedIncomeSource(incomeSources = []) {
  return [...incomeSources]
    .filter((source) => source.status === "Expected")
    .sort((a, b) => new Date(a.expectedDate) - new Date(b.expectedDate))[0] || null;
}

const cleanDefaultState = {
  startingCash: 0,
  transactions: [],
  bills: [],
  goals: [],
  incomeSources: [],
  settings: {},
};

const demoDefaultState = {
  startingCash: 13000,
  transactions: [
    {
      id: makeId(),
      date: "2026-06-05",
      type: "income",
      category: "Salary",
      amount: 26000,
      notes: "June 5 payout",
      linkedId: "",
    },
    {
      id: makeId(),
      date: "2026-06-20",
      type: "income",
      category: "Salary",
      amount: 26000,
      notes: "June 20 payout",
      linkedId: "",
    },
  ],
  bills: [
    {
      id: makeId(),
      name: "Daughter Tuition",
      type: "Bill",
      dueDate: "2026-06-05",
      amount: 15500,
      balance: 0,
      status: "Pending",
      category: "Daughter",
      recurring: true,
    },
    {
      id: makeId(),
      name: "Motorcycle Payment",
      type: "Debt",
      dueDate: "2026-06-07",
      amount: 3600,
      balance: 28800,
      status: "Pending",
      category: "Motorcycle",
      recurring: true,
    },
    {
      id: makeId(),
      name: "Internet",
      type: "Bill",
      dueDate: "2026-06-10",
      amount: 1389,
      balance: 0,
      status: "Pending",
      category: "Bills",
      recurring: true,
    },
    {
      id: makeId(),
      name: "SPayLater June",
      type: "Debt",
      dueDate: "2026-06-15",
      amount: 2196.39,
      balance: 5726.77,
      status: "Pending",
      category: "Debt",
      recurring: false,
    },
    {
      id: makeId(),
      name: "Daughter Monthly Support",
      type: "Bill",
      dueDate: "2026-06-20",
      amount: 5000,
      balance: 0,
      status: "Pending",
      category: "Daughter",
      recurring: true,
    },
    {
      id: makeId(),
      name: "Parents Electricity",
      type: "Bill",
      dueDate: "2026-06-20",
      amount: 3000,
      balance: 0,
      status: "Pending",
      category: "Family",
      recurring: true,
    },
  ],
  goals: [
    {
      id: makeId(),
      name: "Emergency Fund",
      target: 60000,
      current: 13000,
      monthlyTarget: 10000,
      priority: "High",
    },
    {
      id: makeId(),
      name: "Sorsogon Vacation",
      target: 15000,
      current: 0,
      monthlyTarget: 15000,
      priority: "High",
    },
    {
      id: makeId(),
      name: "Business Starter Fund",
      target: 50000,
      current: 0,
      monthlyTarget: 3000,
      priority: "Medium",
    },
  ],
  incomeSources: [
    {
      id: makeId(),
      name: "Main Income",
      amount: 26000,
      expectedDate: dateISO(addDays(todayISO(), 5)),
      status: "Expected",
    },
  ],
  settings: {},
};

const defaultState = cleanDefaultState;

function migrateState(state) {
  const merged = {
    ...defaultState,
    ...state,
    settings: {
      ...defaultState.settings,
      ...(state?.settings || {}),
    },
  };

  delete merged.paydays;
  delete merged.settings.foodBeforeNextPayday;
  delete merged.settings.emergencyBuffer;
  delete merged.settings.salaryPerPayday;
  delete merged.settings.firstPayday;
  delete merged.settings.secondPayday;

  const normalizedIncomeSources = (Array.isArray(merged.incomeSources) ? merged.incomeSources : []).map((source) =>
    normalizeIncomeSource(source, defaultState.incomeSources[0]?.expectedDate)
  );
  const fallbackIncomeSources =
    normalizedIncomeSources.length > 0
      ? normalizedIncomeSources
      : generateLegacyIncomeSources(merged.settings).length > 0
        ? generateLegacyIncomeSources(merged.settings)
        : defaultState.incomeSources.map((source) => normalizeIncomeSource(source));

  return {
    ...merged,
    incomeSources: fallbackIncomeSources,
    bills: (merged.bills || []).map((b) => {
      const normalized = {
        recurring: false,
        recurrenceFrequency: "monthly",
        secondDueDay: "",
        endDate: "",
        status: "Pending",
        ...b,
      };

      normalized.amount = Number(normalized.amount || 0);
      normalized.balance = Number(normalized.balance || 0);

      const rawRemaining = Number(
        normalized.remainingAmount ?? normalized.amount ?? 0
      );

      normalized.remainingAmount =
        normalized.status === "Paid"
          ? 0
          : normalized.type === "Debt"
            ? Math.min(rawRemaining || normalized.amount, normalized.amount)
            : rawRemaining || normalized.amount;

      return normalized;
    }),
    goals: (merged.goals || []).map((g) => ({ monthlyTarget: 0, priority: "Medium", ...g })),
  };
}

function loadState() {
  if (typeof window === "undefined") {
    return migrateState(demoDefaultState);
  }

  try {
    const saved =
      localStorage.getItem(storageKey) ||
      localStorage.getItem("sama-money-guard-v3") ||
      localStorage.getItem("sama-money-guard-v2");
    return saved ? migrateState(JSON.parse(saved)) : migrateState(demoDefaultState);
  } catch {
    return migrateState(demoDefaultState);
  }
}

function withTimeout(promise, ms = 5000, label = "Request timed out") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      window.setTimeout(() => reject(new Error(label)), ms)
    ),
  ]);
}

async function initializeUserState(userId) {
  if (!supabaseEnabled || !supabase || !userId) {
    return {
      payload: getCleanDefaultState(),
      source: "clean-default",
    };
  }

  const localBackup = loadUserLocalBackup(userId);

  try {
    const remotePayload = await loadRemoteState(userId);

    if (remotePayload) {
      return {
        payload: migrateState(remotePayload),
        source: "remote",
      };
    }

    const fresh = getCleanDefaultState();
    await saveRemoteState(fresh, userId);
    saveUserLocalBackup(userId, fresh);

    return {
      payload: fresh,
      source: "fresh",
    };
  } catch (error) {
    if (localBackup) {
      return {
        payload: migrateState(localBackup),
        source: "local-backup",
      };
    }

    return {
      payload: getCleanDefaultState(),
      source: "remote-error",
    };
  }
}

async function loadRemoteState(userId) {
  if (!supabaseEnabled || !supabase || !userId) {
    return null;
  }

  const { data, error } = await supabase
    .from("money_guard_state")
    .select("payload")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.payload ?? null;
}

async function saveRemoteState(payload, userId) {
  if (!supabaseEnabled || !supabase || !userId) {
    return;
  }

  const { error } = await supabase
    .from("money_guard_state")
    .upsert(
      {
        user_id: userId,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    throw error;
  }
}

function isActiveDebt(bill) {
  if (bill.type !== "Debt") return false;
  if (bill.status === "Paid") return false;
  if (!bill.endDate) return Boolean(bill.recurring);
  return new Date(bill.endDate) >= new Date(todayISO()) && Boolean(bill.recurring || bill.endDate);
}

function isActiveMonthlyObligation(bill) {
  if (bill.status === "Paid") return false;
  if (Number(bill.amount || 0) <= 0) return false;

  if (bill.type === "Bill") {
    return true;
  }

  if (bill.type === "Debt") {
    return isActiveDebt(bill);
  }

  return false;
}

function MoneyCard({ label, value, helper, tone = "slate", icon: Icon }) {
  const styles = {
    emerald: "from-emerald-500 to-teal-600 text-white",
    red: "from-red-500 to-orange-600 text-white",
    amber: "from-amber-400 to-orange-500 text-slate-950",
    blue: "from-blue-500 to-indigo-600 text-white",
    slate: "from-slate-800 to-slate-950 text-white",
  };

  return (
    <div className={`rounded-[1.7rem] bg-gradient-to-br ${styles[tone]} p-5 shadow-lg shadow-slate-300/60`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold opacity-80">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
          {helper && <p className="mt-2 text-xs leading-relaxed opacity-80">{helper}</p>}
        </div>
        {Icon && <Icon className="h-6 w-6 opacity-80" />}
      </div>
    </div>
  );
}

function SmallStat({ label, value, sub, danger }) {
  return (
    <div className={`rounded-2xl border p-4 ${danger ? "border-red-100 bg-red-50" : "border-slate-200 bg-white"}`}>
      <p className={`text-xs font-semibold ${danger ? "text-red-600" : "text-slate-500"}`}>{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function ProgressBar({ value }) {
  const safe = Math.min(Math.max(value, 0), 100);
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${safe}%` }} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-bold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";

function toMonthInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function computeNextDueDate(bill) {
  const baseDate = new Date(bill?.dueDate || todayISO());

  if (bill?.recurrenceFrequency !== "twice-monthly") {
    const next = new Date(baseDate);
    next.setMonth(next.getMonth() + 1);
    return dateISO(next);
  }

  const firstDueDay = baseDate.getDate();
  const secondDueDay = Number(bill?.secondDueDay || 0);

  if (!secondDueDay || secondDueDay <= 0 || secondDueDay > 31) {
    const fallback = new Date(baseDate);
    fallback.setDate(baseDate.getDate() + 15);
    return dateISO(fallback);
  }

  const currentDay = baseDate.getDate();
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  if (currentDay < secondDueDay) {
    const next = new Date(year, month, secondDueDay);
    return dateISO(next);
  }

  const next = new Date(year, month + 1, firstDueDay);
  return dateISO(next);
}

function getBillCategory(type) {
  return type === "Debt" ? "Debt" : "Bills";
}

function getPaymentCategory(type, linkedId, bills, goals) {
  if (type === "bill_payment") {
    const linkedBill = bills.find((bill) => bill.id === linkedId);
    return linkedBill?.name || "Bill payment";
  }

  if (type === "debt_payment") {
    const linkedDebt = bills.find((bill) => bill.id === linkedId);
    return linkedDebt?.name || "Debt payment";
  }

  if (type === "savings") {
    const linkedGoal = goals.find((goal) => goal.id === linkedId);
    return linkedGoal?.name || "Savings contribution";
  }

  return "Expense";
}

function getBillRemainingAmount(bill) {
  if (!bill) {
    return 0;
  }

  return Number(bill.remainingAmount ?? bill.amount ?? 0);
}

function getBillStatusFromRemaining(bill, remainingAmount) {
  const amount = Number(bill.amount || 0);

  if (remainingAmount <= 0) {
    return "Paid";
  }

  if (remainingAmount >= amount) {
    return "Pending";
  }

  return "Partial";
}

function createNextBillInstance(bill, nextDueDate, override = {}) {
  const balance = Number(override.balance ?? bill.balance ?? 0);
  const amount = Number(bill.amount || 0);

  const remainingAmount = Number(
    override.remainingAmount ??
      (bill.type === "Debt" ? Math.min(amount, balance || amount) : amount)
  );

  return {
    id: makeId(),
    name: bill.name,
    type: bill.type,
    dueDate: nextDueDate || bill.dueDate,
    amount,
    balance,
    status: "Pending",
    category: bill.category,
    recurring: Boolean(bill.recurring),
    recurrenceFrequency: bill.recurrenceFrequency || "monthly",
    secondDueDay: bill.secondDueDay || "",
    endDate: bill.endDate || "",
    remainingAmount,
  };
}

function updateBillAfterPayment(bill, paymentAmount) {
  const currentRemaining = getBillRemainingAmount(bill);
  const nextRemaining = Math.max(currentRemaining - paymentAmount, 0);

  const updatedBill = {
    ...bill,
    status: getBillStatusFromRemaining(bill, nextRemaining),
    remainingAmount: nextRemaining,
  };

  if (bill.type === "Debt") {
    updatedBill.balance = Math.max(Number(bill.balance || 0) - paymentAmount, 0);
  }

  return updatedBill;
}

function reverseBillPayment(bill, paymentAmount) {
  const currentRemaining = getBillRemainingAmount(bill);
  const nextRemaining = Math.min(Number(bill.amount || 0), currentRemaining + paymentAmount);

  const updatedBill = {
    ...bill,
    status: getBillStatusFromRemaining(bill, nextRemaining),
    remainingAmount: nextRemaining,
  };

  if (bill.type === "Debt") {
    updatedBill.balance = Number(bill.balance || 0) + paymentAmount;
  }

  return updatedBill;
}

function formatMonthLabel(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function getMonthTransactions(transactions, monthValue) {
  return transactions.filter((transaction) => transaction.date?.slice(0, 7) === monthValue);
}

function summarizeMonthTransactions(transactions) {
  return transactions.reduce(
    (summary, transaction) => {
      const amount = Number(transaction.amount || 0);

      if (transaction.type === "income") {
        summary.income += amount;
      } else if (transaction.type === "savings") {
        summary.savings += amount;
      } else if (transaction.type === "bill_payment") {
        summary.billPayments += amount;
      } else if (transaction.type === "debt_payment") {
        summary.debtPayments += amount;
      } else {
        summary.expenses += amount;
      }

      return summary;
    },
    {
      income: 0,
      expenses: 0,
      savings: 0,
      billPayments: 0,
      debtPayments: 0,
    }
  );
}

export default function MoneyGuardApp() {
  const [mounted, setMounted] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [signupSuccess, setSignupSuccess] = useState(null);
  const [authCooldownUntil, setAuthCooldownUntil] = useState(() => getStoredAuthCooldown());
  const [authRecoveryAction, setAuthRecoveryAction] = useState(null);
  const [data, setData] = useState(() => getSafeStartupData());
  const [tab, setTab] = useState("dashboard");
  const [decisionAmount, setDecisionAmount] = useState("");
  const [historyMonth, setHistoryMonth] = useState(() => toMonthInputValue());
  const [historyType, setHistoryType] = useState("all");
  const [historySearch, setHistorySearch] = useState("");
  const [billStatusFilter, setBillStatusFilter] = useState("all");
  const [billTypeFilter, setBillTypeFilter] = useState("all");
  const [billSearch, setBillSearch] = useState("");
  const [notification, setNotification] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [paymentDialog, setPaymentDialog] = useState(null);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [syncStatus, setSyncStatus] = useState(!isProduction ? "Local only" : "Local only");
  const [editingTransactionId, setEditingTransactionId] = useState(null);
  const [editingBillId, setEditingBillId] = useState(null);
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [transactionForm, setTransactionForm] = useState(() => ({
    date: todayISO(),
    type: "expense",
    category: "Food",
    amount: "",
    notes: "",
    linkedId: "",
  }));
  const [billForm, setBillForm] = useState(() => ({
    name: "",
    type: "Bill",
    dueDate: todayISO(),
    endDate: "",
    amount: "",
    balance: "",
    status: "Pending",
    category: "Bills",
    recurring: false,
    recurrenceFrequency: "monthly",
    secondDueDay: "",
  }));
  const [goalForm, setGoalForm] = useState({
    name: "",
    target: "",
    current: "",
    monthlyTarget: "",
    priority: "Medium",
  });
  const [incomeSourceForm, setIncomeSourceForm] = useState({
    name: "",
    amount: "",
    expectedDate: todayISO(),
  });
  const [editingIncomeSourceId, setEditingIncomeSourceId] = useState(null);
  const [userDataReady, setUserDataReady] = useState(false);
  const [userDataSource, setUserDataSource] = useState("none");
  const [lastLoadedUserId, setLastLoadedUserId] = useState(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState("");
  // ── Use a ref so snapshot comparisons never cause extra re-renders,
  //    and the async save callback can always update it without being
  //    cancelled by the effect cleanup.
  const lastSavedSnapshotRef = useRef("");
  const transactionFormRef = useRef(null);
  const billFormRef = useRef(null);
  const goalFormRef = useRef(null);
  const incomeSourceFormRef = useRef(null);

  function scrollToRef(ref) {
    window.setTimeout(() => {
      ref.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }

  const authRequired = Boolean(supabaseEnabled);
  const authBlocked = isProduction && !supabaseEnabled;
  const localOnlyMode = !supabaseEnabled && !isProduction;

  async function loadAndApplyUserState(userId, active = true) {
    setUserDataReady(false);
    setLastLoadedUserId(null);
    setUserDataSource("loading");

    try {
      const result = await withTimeout(
        initializeUserState(userId),
        5000,
        "Supabase took too long to load your finance data."
      );

      if (!active) {
        return;
      }

      const nextPayload = migrateState(result.payload);

      setData(nextPayload);
      setLastLoadedUserId(userId);
      setUserDataSource(result.source);
      setLastSavedSnapshot(JSON.stringify(nextPayload));
      setUserDataReady(true);

      if (result.source === "remote" || result.source === "fresh") {
        setSyncStatus("Synced");
      } else if (result.source === "local-backup") {
        setSyncStatus("Local backup");
        notify("Loaded local backup", "Supabase could not be reached, so your local backup was loaded.");
      } else if (result.source === "remote-error") {
        setSyncStatus("Sync failed");
        notify("Sync failed", "Supabase could not load your data. No remote data was overwritten.");
      } else {
        setSyncStatus("Ready");
      }
    } catch (error) {
      if (!active) {
        return;
      }

      const localBackup = loadUserLocalBackup(userId);
      const fallback = migrateState(localBackup || getCleanDefaultState());

      setData(fallback);
      setLastLoadedUserId(userId);
      setUserDataSource(localBackup ? "local-backup-timeout" : "load-timeout");
      setLastSavedSnapshot(JSON.stringify(fallback));
      setUserDataReady(Boolean(localBackup));
      setSyncStatus("Sync failed");

      notify(
        "Loading warning",
        error?.message || "Finance data took too long to load. Local backup was used if available."
      );
    }
  }

  useEffect(() => {
    let active = true;

    async function hydrate() {
      try {
        setUserDataReady(false);

        if (!supabaseEnabled || !supabase) {
          const localData = getSafeStartupData();

          if (active) {
            setData(localData);
            setLastSavedSnapshot(JSON.stringify(localData));
            setUserDataSource(localOnlyMode ? "local-dev" : "none");
            setUserDataReady(localOnlyMode);
          }

          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const nextUser = session?.user ?? null;

        if (!active) {
          return;
        }

        setCurrentUser(nextUser);
        setSyncStatus(localOnlyMode ? "Local only" : "Ready");

        if (!nextUser) {
          const clean = getCleanDefaultState();

          setData(clean);
          setLastSavedSnapshot(JSON.stringify(clean));
          setLastLoadedUserId(null);
          setUserDataSource("signed-out");
          setUserDataReady(false);
          return;
        }

        await loadAndApplyUserState(nextUser.id, active);
      } catch (error) {
        const fallback = getSafeStartupData();

        if (active) {
          setData(fallback);
          setLastSavedSnapshot(JSON.stringify(fallback));
          setUserDataSource("hydrate-error");
          setUserDataReady(false);
          setSyncStatus("Sync failed");
        }
      } finally {
        if (active) {
          setAuthReady(true);
          setMounted(true);
        }
      }
    }

    hydrate();

    const { data: authListener } =
      supabaseEnabled && supabase
        ? supabase.auth.onAuthStateChange(async (_event, session) => {
            if (!active) {
              return;
            }

            setUserDataReady(false);

            const nextUser = session?.user ?? null;
            setCurrentUser(nextUser);
            setSyncStatus(localOnlyMode ? "Local only" : "Ready");

            if (!nextUser) {
              const clean = getCleanDefaultState();

              setData(clean);
              setLastSavedSnapshot(JSON.stringify(clean));
              setLastLoadedUserId(null);
              setUserDataSource("signed-out");
              setUserDataReady(false);
              return;
            }

            await loadAndApplyUserState(nextUser.id, active);
          })
        : { data: { subscription: { unsubscribe() {} } } };

    return () => {
      active = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, [localOnlyMode]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    if (!supabaseEnabled || !currentUser?.id) {
      if (!supabaseEnabled && !isProduction) {
        localStorage.setItem(storageKey, JSON.stringify(data));
        setLastSavedSnapshot(JSON.stringify(data));
      }
      return;
    }

    if (!userDataReady) {
      return;
    }

    if (lastLoadedUserId !== currentUser.id) {
      return;
    }

    const nextSnapshot = JSON.stringify(data);

    if (nextSnapshot === lastSavedSnapshot) {
      return;
    }

    saveUserLocalBackup(currentUser.id, data);

    let active = true;
    setSyncStatus("Saving");

    saveRemoteState(data, currentUser.id)
      .then(() => {
        if (!active) {
          return;
        }

        setLastSavedSnapshot(nextSnapshot);
        setSyncStatus("Synced");
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setSyncStatus("Sync failed");
        notify("Sync failed", "Your changes are saved locally. Reconnect to sync again.");
      });

    return () => {
      active = false;
    };
  }, [
    data,
    mounted,
    currentUser,
    userDataReady,
    lastLoadedUserId,
    lastSavedSnapshot,
  ]);

  useEffect(() => {
    if (!notification) {
      return;
    }

    const timeoutId = window.setTimeout(() => setNotification(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [notification]);

  // ── Inactivity auto sign-out ──────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser || !supabaseEnabled || !supabase) {
      return;
    }

    let timeoutId;

    function markActivity() {
      window.localStorage.setItem(lastActivityStorageKey, String(Date.now()));

      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        handleSignOut();
        notify("Signed out", "You were signed out after being inactive.");
      }, inactivityLimitMs);
    }

    const events = ["click", "keydown", "touchstart", "mousemove", "scroll"];

    events.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true });
    });

    markActivity();

    return () => {
      window.clearTimeout(timeoutId);
      events.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });
    };
  }, [currentUser?.id]);

  // ── Stale-session check on tab focus / visibility change ──────────────────
  useEffect(() => {
    if (!currentUser || !supabaseEnabled || !supabase) {
      return;
    }

    function checkStaleSession() {
      const lastActivity = Number(window.localStorage.getItem(lastActivityStorageKey) || 0);

      if (lastActivity && Date.now() - lastActivity > inactivityLimitMs) {
        handleSignOut();
        notify("Signed out", "You were signed out because the session was inactive.");
      }
    }

    checkStaleSession();

    window.addEventListener("focus", checkStaleSession);
    document.addEventListener("visibilitychange", checkStaleSession);

    return () => {
      window.removeEventListener("focus", checkStaleSession);
      document.removeEventListener("visibilitychange", checkStaleSession);
    };
  }, [currentUser?.id]);

  function notify(title, description) {
    setNotification({ title, description });
  }

  function resetForNewUser() {
    setCurrentUser(null);
    setAuthEmail("");
    setAuthPassword("");
    setAuthError("");
    setAuthMessage("");
    setAuthRecoveryAction(null);
    setAuthMode("login");
    setData(getCleanDefaultState());
    setTab("dashboard");
    setSyncStatus(localOnlyMode ? "Local only" : "Ready");
  }

  function clearAuthAlerts() {
    setAuthError("");
    setAuthMessage("");
    setAuthRecoveryAction(null);
  }

  function setAuthCooldown(until) {
    setAuthCooldownUntil(until);
    window.localStorage.setItem(
      authCooldownStorageKey,
      JSON.stringify({ until, updatedAt: Date.now() })
    );
  }

  function clearAuthCooldown() {
    setAuthCooldownUntil(0);
    window.localStorage.removeItem(authCooldownStorageKey);
  }

  const signupCooldownActive = authMode === "signup" && Date.now() < authCooldownUntil;
  const authCooldownSeconds = Math.max(0, Math.ceil((authCooldownUntil - Date.now()) / 1000));

  const summary = useMemo(() => {
    const income = data.transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const outflow = data.transactions
      .filter((t) => ["expense", "bill_payment", "debt_payment", "savings"].includes(t.type))
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const currentCash = Number(data.startingCash || 0) + income - outflow;
    const currentMonth = todayISO().slice(0, 7);
    const receivedIncomeThisMonth = data.transactions
      .filter((t) => t.type === "income" && t.date?.slice(0, 7) === currentMonth)
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const expectedIncomeThisMonth = data.incomeSources
      .filter((source) => source.status === "Expected" && source.expectedDate?.slice(0, 7) === currentMonth)
      .reduce((sum, source) => sum + Number(source.amount || 0), 0);
    const nextIncomeSource = getNextExpectedIncomeSource(data.incomeSources);
    const daysUntilIncome = nextIncomeSource ? getDaysUntil(nextIncomeSource.expectedDate) : null;

    const activeMonthlyObligations = data.bills.filter(isActiveMonthlyObligation);
    const unpaidBills = activeMonthlyObligations
      .filter((b) => b.status !== "Paid")
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    const nextIncomeDate = nextIncomeSource?.expectedDate || dateISO(addDays(todayISO(), 15));
    const upcomingBills = unpaidBills.filter((b) => new Date(b.dueDate) <= new Date(nextIncomeDate));
    const overdueBills = unpaidBills.filter((b) => new Date(b.dueDate) < new Date(todayISO()));
    const dueSoonBills = unpaidBills.filter((b) => getDaysUntil(b.dueDate) >= 0 && getDaysUntil(b.dueDate) <= 3);

    const upcomingBillsTotal = upcomingBills.reduce((sum, b) => sum + getBillRemainingAmount(b), 0);
    const monthlyObligations = activeMonthlyObligations.reduce((sum, b) => sum + getBillRemainingAmount(b), 0);
    const monthlyBillsTotal = activeMonthlyObligations
      .filter((b) => b.type === "Bill")
      .reduce((sum, b) => sum + getBillRemainingAmount(b), 0);
    const monthlyDebtsTotal = activeMonthlyObligations
      .filter((b) => b.type === "Debt")
      .reduce((sum, b) => sum + getBillRemainingAmount(b), 0);

    const goalMonthlyTarget = data.goals.reduce((sum, g) => sum + Number(g.monthlyTarget || 0), 0);
    const goalContributedThisMonth = data.transactions
      .filter((t) => t.type === "savings")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const goalStillNeededThisMonth = Math.max(goalMonthlyTarget - goalContributedThisMonth, 0);

    const safeToSpend = currentCash - upcomingBillsTotal - goalStillNeededThisMonth;

    const totalSavings = data.goals.reduce((sum, g) => sum + Number(g.current || 0), 0);
    const totalSavingsTarget = data.goals.reduce((sum, g) => sum + Number(g.target || 0), 0);
    const totalDebtBalance = data.bills
      .filter((b) => b.type === "Debt")
      .reduce((sum, b) => sum + getBillRemainingAmount(b), 0);

    const expensesThisMonth = data.transactions
      .filter((t) => ["expense", "bill_payment", "debt_payment"].includes(t.type))
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const wantsThisMonth = data.transactions
      .filter((t) => ["Shopping", "Going Out", "Coffee", "Vacation"].includes(t.category))
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    let warning = "You are safe after confirmed income, bills, and monthly goals.";
    if (safeToSpend < 0) warning = "You are short. Bills and goals are not fully covered yet.";
    else if (safeToSpend < 1000) warning = "Danger zone. Your margin is almost gone.";
    else if (safeToSpend < 3000) warning = "Tight cycle. Spend carefully.";

    return {
      income,
      outflow,
      currentCash,
      expectedIncomeThisMonth,
      receivedIncomeThisMonth,
      nextIncomeSource,
      daysUntilIncome,
      upcomingBills,
      unpaidBills,
      overdueBills,
      dueSoonBills,
      upcomingBillsTotal,
      monthlyObligations,
      monthlyBillsTotal,
      monthlyDebtsTotal,
      goalMonthlyTarget,
      goalContributedThisMonth,
      goalStillNeededThisMonth,
      safeToSpend,
      totalSavings,
      totalSavingsTarget,
      totalDebtBalance,
      expensesThisMonth,
      wantsThisMonth,
      warning,
    };
  }, [data]);

  const monthReview = useMemo(() => {
    const selectedTransactions = getMonthTransactions(data.transactions, historyMonth);
    const filteredTransactions = selectedTransactions.filter((transaction) => {
      const matchesType = historyType === "all" || transaction.type === historyType;
      const search = historySearch.trim().toLowerCase();
      const matchesSearch =
        search.length === 0 ||
        transaction.category.toLowerCase().includes(search) ||
        (transaction.notes || "").toLowerCase().includes(search);

      return matchesType && matchesSearch;
    });

    return {
      selected: {
        label: formatMonthLabel(historyMonth),
        transactions: filteredTransactions,
        summary: summarizeMonthTransactions(filteredTransactions),
      },
    };
  }, [data.transactions, historyMonth, historyType, historySearch]);

  async function handleAuthSubmit(e) {
    e.preventDefault();

    if (!supabaseEnabled || !supabase) {
      setAuthError("Supabase is not configured yet. Add your environment variables first.");
      return;
    }

    if (authMode === "signup" && signupCooldownActive) {
      setAuthError(`Please wait ${authCooldownSeconds} second${authCooldownSeconds === 1 ? "" : "s"} before trying again.`);
      return;
    }

    setAuthLoading(true);
    setAuthError("");
    setAuthMessage("");
    setAuthRecoveryAction(null);

    try {
      const result =
        authMode === "login"
          ? await supabase.auth.signInWithPassword({
              email: authEmail,
              password: authPassword,
            })
          : await supabase.auth.signUp({
              email: authEmail,
              password: authPassword,
            });

      if (result.error) {
        throw result.error;
      }

      if (authMode === "signup") {
        const user = result.data.user;
        if (user?.id) {
          await initializeUserState(user.id);
        }
        clearAuthCooldown();
        resetForNewUser();
        setSignupSuccess({
          email: authEmail.trim(),
          message: "Your account was created. Check your email for the confirmation link, then sign in again.",
        });
        return;
      }

      const user = result.data.user;

      if (!user) {
        throw new Error("No authenticated user was returned.");
      }

      setCurrentUser(user);
      await loadAndApplyUserState(user.id, true);
      setTab("dashboard");
    } catch (error) {
      const message = error.message || "Unable to complete authentication.";
      const messageLower = message.toLowerCase();

      if (messageLower.includes("rate limit")) {
        setAuthRecoveryAction("signin");
        setAuthMode("login");
        setAuthError("Too many signup attempts. Please wait a few minutes, then try signing in or resetting your password.");
        setAuthCooldown(Date.now() + 60_000);
        return;
      }

      if (messageLower.includes("already") || messageLower.includes("registered") || messageLower.includes("exists")) {
        setAuthRecoveryAction("signin");
        setAuthMode("login");
        setAuthError("This email is already in use. Go to Sign in to continue.");
        return;
      }

      setAuthRecoveryAction(null);
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handlePasswordReset() {
    if (!supabaseEnabled || !supabase) {
      setAuthError("Supabase is not configured yet. Add your environment variables first.");
      return;
    }

    if (!authEmail.trim()) {
      setAuthError("Enter your email address to request a password reset.");
      return;
    }

    setAuthLoading(true);
    setAuthError("");
    setAuthMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim(), {
        redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      });

      if (error) {
        throw error;
      }

      setAuthMessage("Password reset email sent. Check your inbox for the reset link.");
    } catch (error) {
      setAuthError(error.message || "Unable to send the password reset email.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    const userId = currentUser?.id;
    const clean = getCleanDefaultState();

    if (userId) {
      try {
        saveUserLocalBackup(userId, data);
      } catch {
        // Local backup should not block sign out.
      }
    }

    if (userId && supabaseEnabled && supabase) {
      try {
        setSyncStatus("Saving");

        await Promise.race([
          saveRemoteState(data, userId),
          new Promise((_, reject) =>
            window.setTimeout(() => reject(new Error("Sign out save timeout")), 3000)
          ),
        ]);

        setSyncStatus("Synced");
      } catch {
        setSyncStatus("Sync failed");
        notify(
          "Sync warning",
          "Your data was saved locally, but Supabase sync may not have completed before sign out."
        );
      }
    }

    if (supabaseEnabled && supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        notify("Sign out error", "Supabase sign out failed. Please refresh and try again.");
      }
    }

    window.localStorage.removeItem(lastActivityStorageKey);

    setCurrentUser(null);
    setLogoutConfirm(false);
    setAuthReady(true);
    setMounted(true);
    setSyncStatus(supabaseEnabled ? "Ready" : "Local only");
    setUserDataReady(false);
    setLastLoadedUserId(null);
    setUserDataSource("signed-out");
    setLastSavedSnapshot(JSON.stringify(clean));
    setData(clean);
    setAuthMode("login");
    setAuthError("");
    setAuthMessage("");
    setAuthRecoveryAction(null);
    setSignupSuccess(null);
    setTab("dashboard");
  }

  function resetTransactionForm() {
    setTransactionForm({
      date: todayISO(),
      type: "expense",
      category: "Food",
      amount: "",
      notes: "",
      linkedId: "",
    });
    setEditingTransactionId(null);
  }

  function resetBillForm() {
    setBillForm({
      name: "",
      type: "Bill",
      dueDate: todayISO(),
      endDate: "",
      amount: "",
      balance: "",
      status: "Pending",
      category: getBillCategory("Bill"),
      recurring: false,
      recurrenceFrequency: "monthly",
      secondDueDay: "",
    });
    setEditingBillId(null);
  }

  function resetGoalForm() {
    setGoalForm({ name: "", target: "", current: "", monthlyTarget: "", priority: "Medium" });
    setEditingGoalId(null);
  }

  function startEditingTransaction(transaction) {
    setEditingTransactionId(transaction.id);
    setTransactionForm({
      date: transaction.date,
      type: transaction.type,
      category: transaction.category || "Food",
      amount: String(transaction.amount || 0),
      notes: transaction.notes || "",
      linkedId: transaction.linkedId || "",
    });
    setTab("add");
    scrollToRef(transactionFormRef);
    notify("Edit mode", "Scroll up to update this transaction.");
  }

  function startEditingBill(bill) {
    setEditingBillId(bill.id);
    setBillForm({
      name: bill.name,
      type: bill.type,
      dueDate: bill.dueDate,
      endDate: bill.endDate || "",
      amount: String(bill.amount || 0),
      balance: String(bill.balance || 0),
      status: bill.status,
      category: bill.category || getBillCategory(bill.type),
      recurring: Boolean(bill.recurring),
      recurrenceFrequency: bill.recurrenceFrequency || "monthly",
      secondDueDay: bill.secondDueDay ? String(bill.secondDueDay) : "",
    });
    setTab("bills");
    scrollToRef(billFormRef);
    notify("Edit mode", "Scroll up to update this bill or debt.");
  }

  function startEditingGoal(goal) {
    setEditingGoalId(goal.id);
    setGoalForm({
      name: goal.name,
      target: String(goal.target || 0),
      current: String(goal.current || 0),
      monthlyTarget: String(goal.monthlyTarget || 0),
      priority: goal.priority || "Medium",
    });
    setTab("goals");
    scrollToRef(goalFormRef);
    notify("Edit mode", "Scroll up to update this goal.");
  }

  function addTransaction(e) {
    e.preventDefault();
    const amount = Number(transactionForm.amount);
    if (!amount || amount <= 0) {
      notify("Action needed", "Enter a valid amount before saving this transaction.");
      return;
    }

    const nextCategory = ["bill_payment", "debt_payment", "savings"].includes(transactionForm.type)
      ? getPaymentCategory(transactionForm.type, transactionForm.linkedId, data.bills, data.goals)
      : transactionForm.category;

    const newTransaction = {
      id: editingTransactionId || makeId(),
      ...transactionForm,
      category: nextCategory,
      amount,
    };

    setData((prev) => {
      let bills = prev.bills.map((item) => ({ ...item }));
      let goals = prev.goals.map((item) => ({ ...item }));
      const currentTransaction = prev.transactions.find((item) => item.id === editingTransactionId);

      if (currentTransaction?.linkedId && ["bill_payment", "debt_payment"].includes(currentTransaction.type)) {
        bills = bills.map((bill) =>
          bill.id === currentTransaction.linkedId ? reverseBillPayment(bill, Number(currentTransaction.amount || 0)) : bill
        );
      }

      if (currentTransaction?.type === "savings" && currentTransaction.linkedId) {
        goals = goals.map((goal) =>
          goal.id === currentTransaction.linkedId
            ? { ...goal, current: Math.max(Number(goal.current || 0) - Number(currentTransaction.amount || 0), 0) }
            : goal
        );
      }

      if (newTransaction.linkedId && ["bill_payment", "debt_payment"].includes(newTransaction.type)) {
        const linkedBill = bills.find((bill) => bill.id === newTransaction.linkedId);
        if (!linkedBill) {
          return prev;
        }

        if (amount > getBillRemainingAmount(linkedBill)) {
          notify("Action needed", "This payment would exceed the current remaining amount for the selected bill or debt.");
          return prev;
        }

        bills = bills.map((bill) =>
          bill.id === newTransaction.linkedId ? updateBillAfterPayment(bill, amount) : bill
        );
      }

      if (newTransaction.type === "savings" && newTransaction.linkedId) {
        goals = goals.map((goal) =>
          goal.id === newTransaction.linkedId ? { ...goal, current: Number(goal.current || 0) + amount } : goal
        );
      }

      const transactions = editingTransactionId
        ? prev.transactions.map((item) => (item.id === editingTransactionId ? newTransaction : item))
        : [newTransaction, ...prev.transactions];

      return {
        ...prev,
        bills,
        goals,
        transactions,
      };
    });

    resetTransactionForm();
    notify(editingTransactionId ? "Updated" : "Saved", editingTransactionId ? "Your transaction was updated." : "Your transaction has been added successfully.");
    setTab("dashboard");
  }

  function addBill(e) {
    e.preventDefault();
    if (!billForm.name || !billForm.amount) {
      notify("Action needed", "Add a bill name and amount before saving.");
      return;
    }

    const normalizedBill = {
      id: editingBillId || makeId(),
      ...billForm,
      category: getBillCategory(billForm.type),
      amount: Number(billForm.amount),
      balance: Number(billForm.balance || 0),
      recurring: Boolean(billForm.recurring),
      recurrenceFrequency: billForm.recurring
        ? billForm.recurrenceFrequency || "monthly"
        : "monthly",
      secondDueDay:
        billForm.recurring && billForm.recurrenceFrequency === "twice-monthly"
          ? Number(billForm.secondDueDay || 0)
          : "",
      endDate: billForm.type === "Debt" ? billForm.endDate : "",
      remainingAmount:
        billForm.type === "Debt" && billForm.balance !== ""
          ? Number(billForm.balance || 0)
          : Number(billForm.amount || 0),
      status: billForm.status || "Pending",
    };

    if (
      normalizedBill.recurring &&
      normalizedBill.recurrenceFrequency === "twice-monthly" &&
      (!normalizedBill.secondDueDay || normalizedBill.secondDueDay < 1 || normalizedBill.secondDueDay > 31)
    ) {
      notify("Action needed", "Add a valid second due day between 1 and 31.");
      return;
    }

    setData((prev) => ({
      ...prev,
      bills: editingBillId
        ? prev.bills.map((item) => (item.id === editingBillId ? normalizedBill : item))
        : [normalizedBill, ...prev.bills],
    }));

    resetBillForm();
    notify(editingBillId ? "Updated" : "Saved", editingBillId ? "Your bill or debt was updated." : "Your bill has been added and is now in your list.");
  }

  function addGoal(e) {
    e.preventDefault();
    if (!goalForm.name || !goalForm.target) {
      notify("Action needed", "Add a goal name and target before saving.");
      return;
    }

    const normalizedGoal = {
      id: editingGoalId || makeId(),
      ...goalForm,
      target: Number(goalForm.target),
      current: Number(goalForm.current || 0),
      monthlyTarget: Number(goalForm.monthlyTarget || 0),
    };

    setData((prev) => ({
      ...prev,
      goals: editingGoalId
        ? prev.goals.map((item) => (item.id === editingGoalId ? normalizedGoal : item))
        : [normalizedGoal, ...prev.goals],
    }));

    resetGoalForm();
    notify(editingGoalId ? "Updated" : "Saved", editingGoalId ? "Your goal was updated." : "Your goal has been added successfully.");
  }

  function payBill(bill) {
    const remaining = getBillRemainingAmount(bill);

    setPaymentDialog({
      bill,
      paymentDate: todayISO(),
      nextDueDate: bill.recurring ? computeNextDueDate(bill) : "",
      paymentAmount: String(remaining > 0 ? remaining : bill.amount || 0),
    });
  }

  function handlePaymentConfirm() {
    if (!paymentDialog) return;

    const { bill, paymentDate, nextDueDate, paymentAmount } = paymentDialog;
    const amount = Number(paymentAmount);
    const remaining = getBillRemainingAmount(bill);

    if (!amount || amount <= 0) {
      notify("Action needed", "Enter a payment amount before saving.");
      return;
    }

    if (amount > remaining) {
      notify("Action needed", "This payment would exceed the current remaining amount for this item.");
      return;
    }

    setData((prev) => {
      const updatedBill = updateBillAfterPayment(bill, amount);
      const isFullyPaid = updatedBill.status === "Paid";

      const paymentTransaction = {
        id: makeId(),
        date: paymentDate,
        type: bill.type === "Debt" ? "debt_payment" : "bill_payment",
        category: bill.category,
        amount,
        notes: `Payment for ${bill.name}`,
        linkedId: bill.id,
      };

      let bills = prev.bills.filter((item) => item.id !== bill.id);

      if (!isFullyPaid) {
        bills = [updatedBill, ...bills];
      }

      if (bill.recurring && isFullyPaid) {
        const nextBalance = Number(updatedBill.balance || 0);

        if (bill.type !== "Debt" || nextBalance > 0) {
          const nextInstance = createNextBillInstance(
            bill,
            nextDueDate || computeNextDueDate(bill),
            {
              balance: nextBalance,
              remainingAmount:
                bill.type === "Debt"
                  ? Math.min(Number(bill.amount || 0), nextBalance)
                  : Number(bill.amount || 0),
            }
          );

          bills = [nextInstance, ...bills];
        }
      }

      return {
        ...prev,
        bills,
        transactions: [paymentTransaction, ...prev.transactions],
      };
    });

    notify("Payment recorded", `Payment recorded for ${bill.name}. The next ticket was prepared if recurring.`);
    setPaymentDialog(null);
  }

  function deleteItem(type, id) {
    const item = data[type].find((entry) => entry.id === id);

    setData((prev) => {
      const nextData = {
        ...prev,
        [type]: prev[type].filter((entry) => entry.id !== id),
      };

      if (type === "incomeSources") {
        nextData.transactions = prev.transactions.filter((transaction) => !(transaction.type === "income" && transaction.linkedId === id));
      }

      return nextData;
    });

    const label = type === "transactions" ? item?.category || "transaction" : item?.name || type.slice(0, -1);
    notify("Removed", `${label} was removed successfully.`);
    setConfirmTarget(null);
  }

  function requestDelete(type, id) {
    const item = data[type].find((entry) => entry.id === id);
    setConfirmTarget({ type, id, label: type === "transactions" ? item?.category || "transaction" : item?.name || type.slice(0, -1) });
  }

  function resetIncomeSourceForm() {
    setIncomeSourceForm({
      name: "",
      amount: "",
      expectedDate: todayISO(),
    });
    setEditingIncomeSourceId(null);
  }

  function startEditingIncomeSource(source) {
    setEditingIncomeSourceId(source.id);
    setIncomeSourceForm({
      name: source.name,
      amount: String(source.amount || 0),
      expectedDate: source.expectedDate || todayISO(),
    });
    setTab("settings");
    scrollToRef(incomeSourceFormRef);
    notify("Edit mode", "Scroll up to update this income source.");
  }

  function addIncomeSource(e) {
    e.preventDefault();

    if (!incomeSourceForm.name.trim()) {
      notify("Action needed", "Add a name for this income source.");
      return;
    }

    const amount = Number(incomeSourceForm.amount || 0);
    if (!amount || amount <= 0) {
      notify("Action needed", "Set a positive amount for this income source.");
      return;
    }

    const nextSource = {
      id: editingIncomeSourceId || makeId(),
      name: incomeSourceForm.name.trim(),
      amount,
      expectedDate: incomeSourceForm.expectedDate || todayISO(),
      status: editingIncomeSourceId
        ? data.incomeSources.find((source) => source.id === editingIncomeSourceId)?.status || "Expected"
        : "Expected",
    };

    setData((prev) => {
      const existingSource = prev.incomeSources.find((source) => source.id === editingIncomeSourceId);
      let transactions = prev.transactions;

      if (existingSource && existingSource.status === "Received") {
        transactions = prev.transactions.map((transaction) =>
          transaction.type === "income" && transaction.linkedId === editingIncomeSourceId
            ? {
                ...transaction,
                amount,
                category: nextSource.name,
                date: nextSource.expectedDate,
                notes: `Received ${nextSource.name}`,
              }
            : transaction
        );
      } else if (existingSource && existingSource.status !== "Received") {
        transactions = prev.transactions.filter(
          (transaction) => !(transaction.type === "income" && transaction.linkedId === editingIncomeSourceId)
        );
      }

      if (!existingSource && nextSource.status === "Received") {
        transactions = [
          {
            id: makeId(),
            date: nextSource.expectedDate,
            type: "income",
            category: nextSource.name,
            amount,
            notes: `Received ${nextSource.name}`,
            linkedId: nextSource.id,
          },
          ...prev.transactions,
        ];
      }

      return {
        ...prev,
        incomeSources: editingIncomeSourceId
          ? prev.incomeSources.map((source) => (source.id === editingIncomeSourceId ? nextSource : source))
          : [nextSource, ...prev.incomeSources],
        transactions,
      };
    });

    resetIncomeSourceForm();
    notify(editingIncomeSourceId ? "Updated" : "Saved", editingIncomeSourceId ? "Your income source was updated." : "Your income source has been added.");
  }

  function markIncomeSourceReceived(source) {
    const amount = Number(source.amount || 0);
    if (!amount || amount <= 0) {
      notify("Action needed", "Add a positive amount before marking this source as received.");
      return;
    }

    setData((prev) => {
      const nextIncomeSources = prev.incomeSources.map((item) =>
        item.id === source.id ? { ...item, status: "Received" } : item
      );
      const existingTransaction = prev.transactions.find(
        (transaction) => transaction.type === "income" && transaction.linkedId === source.id
      );

      if (existingTransaction) {
        return {
          ...prev,
          incomeSources: nextIncomeSources,
          transactions: prev.transactions.map((transaction) =>
            transaction.id === existingTransaction.id
              ? {
                  ...transaction,
                  amount,
                  category: source.name,
                  date: source.expectedDate || todayISO(),
                  notes: `Received ${source.name}`,
                }
              : transaction
          ),
        };
      }

      return {
        ...prev,
        incomeSources: nextIncomeSources,
        transactions: [
          {
            id: makeId(),
            date: source.expectedDate || todayISO(),
            type: "income",
            category: source.name,
            amount,
            notes: `Received ${source.name}`,
            linkedId: source.id,
          },
          ...prev.transactions,
        ],
      };
    });

    notify("Updated", `${source.name} is marked as received.`);
  }

  function markIncomeSourceMissed(source) {
    setData((prev) => ({
      ...prev,
      incomeSources: prev.incomeSources.map((item) => (item.id === source.id ? { ...item, status: "Missed" } : item)),
      transactions: prev.transactions.filter(
        (transaction) => !(transaction.type === "income" && transaction.linkedId === source.id)
      ),
    }));

    notify("Updated", `${source.name} is marked as missed.`);
  }

  function updateStartingCash(value) {
    setData((prev) => ({ ...prev, startingCash: Number(value || 0) }));
  }

  const tabs = [
    ["dashboard", "Home", Home],
    ["add", "Add", Plus],
    ["bills", "Bills", CalendarDays],
    ["goals", "Goals", Target],
    ["history", "History", Receipt],
    ["settings", "Setup", Settings],
  ];

  return (
    <main className="min-h-screen bg-[#f5f7fb] pb-28 font-sans text-slate-950">
      {notification && (
        <div className="fixed inset-x-0 top-4 z-[60] px-4">
          <div className="mx-auto max-w-md rounded-[1.4rem] border border-slate-200 bg-slate-950 px-4 py-3 text-white shadow-lg">
            <p className="text-sm font-black">{notification.title}</p>
            <p className="mt-1 text-xs text-slate-200">{notification.description}</p>
          </div>
        </div>
      )}

      {confirmTarget && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-slate-950/55 px-4">
          <div className="w-full max-w-sm rounded-[1.6rem] bg-white p-5 shadow-2xl">
            <p className="text-base font-black text-slate-950">Remove {confirmTarget.label}?</p>
            <p className="mt-2 text-sm text-slate-500">This action cannot be undone. Continue?</p>
            <div className="mt-4 flex gap-2">
              <Button type="button" variant="outline" className="flex-1 rounded-2xl border-slate-200" onClick={() => setConfirmTarget(null)}>
                Cancel
              </Button>
              <Button type="button" className="flex-1 rounded-2xl bg-red-600 text-white" onClick={() => deleteItem(confirmTarget.type, confirmTarget.id)}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}

      {paymentDialog && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-slate-950/55 px-4">
          <div className="w-full max-w-md rounded-[1.6rem] bg-white p-5 shadow-2xl">
            <p className="text-lg font-black text-slate-950">Update payment ticket</p>
            <p className="mt-1 text-sm text-slate-500">
              Record this payment. If it is fully paid and recurring, the app will move it to the next due date.
            </p>

            <div className="mt-4 space-y-3">
              <Field label="Payment amount">
                <input
                  className={inputClass}
                  type="number"
                  step="0.01"
                  value={paymentDialog.paymentAmount}
                  onChange={(e) => setPaymentDialog({ ...paymentDialog, paymentAmount: e.target.value })}
                />
              </Field>
              <p className="text-xs font-semibold text-slate-500">
                Current remaining amount: {peso.format(getBillRemainingAmount(paymentDialog.bill))}
              </p>
              <Field label="Payment date">
                <input
                  className={inputClass}
                  type="date"
                  value={paymentDialog.paymentDate}
                  onChange={(e) => setPaymentDialog({ ...paymentDialog, paymentDate: e.target.value })}
                />
              </Field>

              {paymentDialog.bill.recurring && (
                <Field label="Next due date">
                  <input
                    className={inputClass}
                    type="date"
                    value={paymentDialog.nextDueDate}
                    onChange={(e) => setPaymentDialog({ ...paymentDialog, nextDueDate: e.target.value })}
                  />
                </Field>
              )}
            </div>

            <div className="mt-5 flex gap-2">
              <Button type="button" variant="outline" className="flex-1 rounded-2xl border-slate-200" onClick={() => setPaymentDialog(null)}>
                Cancel
              </Button>
              <Button type="button" className="flex-1 rounded-2xl bg-slate-950 text-white" onClick={handlePaymentConfirm}>
                Save update
              </Button>
            </div>
          </div>
        </div>
      )}

      {signupSuccess && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 px-4">
          <div className="w-full max-w-md rounded-[1.6rem] bg-white p-6 shadow-2xl">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="mt-4 text-lg font-black text-slate-950">Account created</p>
            <p className="mt-2 text-sm text-slate-600">
              {signupSuccess.email ? `A confirmation email has been sent to ${signupSuccess.email}.` : "A confirmation email has been sent to your inbox."}
            </p>
            <p className="mt-3 rounded-[1.2rem] border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              {signupSuccess.message}
            </p>
            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-2xl border-slate-200"
                onClick={() => setSignupSuccess(null)}
              >
                Close
              </Button>
              <Button
                type="button"
                className="flex-1 rounded-2xl bg-slate-950 text-white"
                onClick={() => {
                  setSignupSuccess(null);
                  setAuthMode("login");
                }}
              >
                Sign in
              </Button>
            </div>
          </div>
        </div>
      )}

      {authReady && authBlocked ? (
        <div className="mx-auto max-w-md px-4 py-8">
          <PageCard
            title="Login required"
            subtitle="Your financial data is private."
          >
            <div className="rounded-[1.4rem] border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-black">Supabase is not configured in production.</p>
              <p className="mt-2">Add your Supabase URL and anon key to unlock the login flow and protect the dashboard.</p>
            </div>
          </PageCard>
        </div>
      ) : authReady && authRequired && !currentUser ? (
        <div className="mx-auto max-w-md px-4 py-8">
          <PageCard
            title={authMode === "login" ? "Login required" : "Create your account"}
            subtitle="Your financial data is private."
          >
            <form onSubmit={handleAuthSubmit} className="space-y-3">
              <Field label="Email">
                <input
                  className={inputClass}
                  type="email"
                  autoComplete="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>
              <Field label="Password">
                <input
                  className={inputClass}
                  type="password"
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>
              <Button type="submit" disabled={authLoading || signupCooldownActive} className="w-full rounded-2xl bg-slate-950 py-6 font-black text-white">
                {authLoading
                  ? "Working..."
                  : signupCooldownActive
                    ? `Try again in ${authCooldownSeconds}s`
                    : authMode === "login"
                      ? "Sign in"
                      : "Create account"}
              </Button>
            </form>

            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                type="button"
                className="font-bold text-emerald-700"
                onClick={() => {
                  setAuthMode(authMode === "login" ? "signup" : "login");
                  clearAuthAlerts();
                }}
              >
                {authMode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
              </button>
              <button
                type="button"
                className="font-bold text-slate-700"
                onClick={handlePasswordReset}
              >
                Reset password
              </button>
            </div>

            {authError && (
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">
                {authError}
              </div>
            )}
            {authRecoveryAction === "signin" && (
              <div className="mt-4 flex gap-2">
                <Button
                  type="button"
                  className="flex-1 rounded-2xl bg-slate-950 text-white"
                  onClick={() => {
                    setAuthMode("login");
                    clearAuthAlerts();
                  }}
                >
                  Go to Sign in
                </Button>
              </div>
            )}
            {authMessage && (
              <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                {authMessage}
              </div>
            )}
          </PageCard>
        </div>
      ) : mounted ? (
        <div className="mx-auto max-w-md px-4 pt-5 sm:max-w-lg">
          <header className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Personal Finance</p>
              <h1 className="text-2xl font-black tracking-tight">Money Guard</h1>
              <p className="mt-1 text-xs font-semibold text-slate-500">{currentUser?.email || (supabaseEnabled ? "Login required" : "Local development mode")}</p>
              <p className="mt-1 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
                {supabaseEnabled && !currentUser ? "Login required" : syncStatus}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {currentUser && (
                <Button
                  variant="outline"
                  className="h-10 rounded-full border-slate-200 bg-white px-4 text-xs font-bold text-slate-900"
                  onClick={() => setLogoutConfirm(true)}
                >
                  Sign out
                </Button>
              )}
              <Button
                variant="outline"
                className="h-10 rounded-full border-slate-200 bg-white px-4 text-xs font-bold text-slate-900"
                onClick={() => {
                  if (confirm("Reset all demo data?")) setData(migrateState(defaultState));
                }}
              >
                Reset
              </Button>
            </div>
          </header>

          {tab === "dashboard" && (
            <section className="space-y-4">
              <MoneyCard
                label="Safe to Spend"
                value={peso.format(summary.safeToSpend)}
                helper={summary.warning}
                tone={summary.safeToSpend >= 3000 ? "emerald" : summary.safeToSpend >= 0 ? "amber" : "red"}
                icon={summary.safeToSpend >= 0 ? CheckCircle2 : AlertTriangle}
              />

              {(summary.overdueBills.length > 0 || summary.dueSoonBills.length > 0) && (
                <div className="rounded-[1.4rem] border border-red-100 bg-red-50 p-4">
                  <div className="flex gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                    <div>
                      <p className="font-black text-red-700">Payment warning</p>
                      <p className="mt-1 text-xs font-semibold text-red-600">
                        {summary.overdueBills.length > 0
                          ? `${summary.overdueBills.length} overdue item(s). Handle these before any wants.`
                          : `${summary.dueSoonBills.length} item(s) due in the next 3 days.`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <SmallStat label="Cash Now" value={peso.format(summary.currentCash)} sub="Tracked cash balance" />
                <SmallStat
                  label="Goals This Month"
                  value={peso.format(summary.goalStillNeededThisMonth)}
                  sub={`${peso.format(summary.goalContributedThisMonth)} paid of ${peso.format(summary.goalMonthlyTarget)}`}
                  danger={summary.goalStillNeededThisMonth > 0}
                />
                <SmallStat
                  label="Expected Income"
                  value={peso.format(summary.expectedIncomeThisMonth)}
                  sub="Scheduled this month"
                />
                <SmallStat
                  label="Received Income"
                  value={peso.format(summary.receivedIncomeThisMonth)}
                  sub="Confirmed income this month"
                />
                <SmallStat
                  label="Next Income"
                  value={summary.nextIncomeSource ? peso.format(summary.nextIncomeSource.amount) : "None"}
                  sub={summary.daysUntilIncome === null ? "Add an income source" : summary.daysUntilIncome === 0 ? "Today" : `${summary.daysUntilIncome} day(s) left`}
                />
                <SmallStat label="Debt Left" value={peso.format(summary.totalDebtBalance)} sub="Tracked debt balance" danger={summary.totalDebtBalance > 0} />
                <SmallStat label="Monthly Bills" value={peso.format(summary.monthlyObligations)} sub="Recurring bills + active debts" danger={summary.monthlyObligations > 0} />
              </div>

              <Card className="rounded-[1.7rem] border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h2 className="font-black">Can I buy this?</h2>
                      <p className="text-xs text-slate-500">Checks bills plus your monthly savings goals.</p>
                    </div>
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  </div>
                  <input
                    className={inputClass}
                    type="number"
                    placeholder="Amount"
                    value={decisionAmount}
                    onChange={(e) => setDecisionAmount(e.target.value)}
                  />
                  {decisionAmount && (
                    <div
                      className={`mt-3 rounded-2xl p-3 text-sm font-bold ${
                        Number(decisionAmount) <= summary.safeToSpend
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {Number(decisionAmount) <= summary.safeToSpend
                        ? `Allowed. Safe money after buying: ${peso.format(summary.safeToSpend - Number(decisionAmount))}`
                        : `Do not buy. You are short by ${peso.format(Number(decisionAmount) - summary.safeToSpend)}.`}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-[1.7rem] border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h2 className="font-black">Monthly goal payments</h2>
                      <p className="text-xs text-slate-500">These are treated as required this month.</p>
                    </div>
                    <Target className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="space-y-2">
                    {data.goals.map((g) => (
                      <div key={g.id} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                        <div>
                          <p className="text-sm font-black">{g.name}</p>
                          <p className="text-xs text-slate-500">Monthly target</p>
                        </div>
                        <p className="font-black text-slate-950">{peso.format(g.monthlyTarget || 0)}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <SectionTitle title="Next bills to handle" action="View all" onClick={() => setTab("bills")} />
              <div className="space-y-2">
                {summary.unpaidBills.slice(0, 4).map((b) => (
                  <BillRow key={b.id} bill={b} onPay={() => payBill(b)} />
                ))}
                {summary.unpaidBills.length === 0 && <EmptyBox text="No unpaid bills. Good. Keep it boring." />}
              </div>

              <SectionTitle title="Savings goals" action="View" onClick={() => setTab("goals")} />
              <div className="space-y-3">
                {data.goals.slice(0, 3).map((g) => (
                  <GoalRow key={g.id} goal={g} />
                ))}
              </div>
            </section>
          )}

          {tab === "add" && (
            <div ref={transactionFormRef}>
              <PageCard title="Add money movement" subtitle="Income, expense, bill payment, debt payment, or savings.">
                <form onSubmit={addTransaction} className="space-y-3">
                  <Field label="Date">
                    <input className={inputClass} type="date" value={transactionForm.date} onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })} />
                  </Field>
                  <Field label="Type">
                    <select className={inputClass} value={transactionForm.type} onChange={(e) => setTransactionForm({ ...transactionForm, type: e.target.value, linkedId: "" })}>
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                      <option value="bill_payment">Bill Payment</option>
                      <option value="debt_payment">Debt Payment</option>
                      <option value="savings">Savings Contribution</option>
                    </select>
                  </Field>
                  {!["bill_payment", "debt_payment", "savings"].includes(transactionForm.type) && (
                    <Field label="Category">
                      <select className={inputClass} value={transactionForm.category} onChange={(e) => setTransactionForm({ ...transactionForm, category: e.target.value })}>
                        <option>Salary</option>
                        <option>Food</option>
                        <option>Daughter</option>
                        <option>Motorcycle</option>
                        <option>Debt</option>
                        <option>Bills</option>
                        <option>Gym</option>
                        <option>Vacation</option>
                        <option>Shopping</option>
                        <option>Going Out</option>
                        <option>Coffee</option>
                        <option>Family</option>
                        <option>Business</option>
                      </select>
                    </Field>
                  )}
                  <Field label="Amount">
                    <input className={inputClass} type="number" step="0.01" value={transactionForm.amount} onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })} placeholder="0.00" />
                  </Field>

                  {["bill_payment", "debt_payment"].includes(transactionForm.type) && (
                    <Field label="Link to bill/debt">
                      <select className={inputClass} value={transactionForm.linkedId} onChange={(e) => setTransactionForm({ ...transactionForm, linkedId: e.target.value })}>
                        <option value="">Not linked</option>
                        {data.bills.filter((b) => b.status !== "Paid").map((b) => (
                          <option key={b.id} value={b.id}>{b.name} · {peso.format(b.amount)}</option>
                        ))}
                      </select>
                    </Field>
                  )}

                  {transactionForm.type === "savings" && (
                    <Field label="Savings goal">
                      <select className={inputClass} value={transactionForm.linkedId} onChange={(e) => setTransactionForm({ ...transactionForm, linkedId: e.target.value })}>
                        <option value="">Choose goal</option>
                        {data.goals.map((g) => <option key={g.id} value={g.id}>{g.name} · target {peso.format(g.monthlyTarget || 0)}/mo</option>)}
                      </select>
                    </Field>
                  )}

                  <Field label="Notes">
                    <input className={inputClass} value={transactionForm.notes} onChange={(e) => setTransactionForm({ ...transactionForm, notes: e.target.value })} placeholder="Optional" />
                  </Field>
                  <Button className="w-full rounded-2xl bg-slate-950 py-6 text-base font-black text-white">
                    {editingTransactionId ? "Update transaction" : "Save"}
                  </Button>
                  {editingTransactionId && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full rounded-2xl border-slate-200 bg-white text-sm font-black text-slate-700"
                      onClick={resetTransactionForm}
                    >
                      Cancel edit
                    </Button>
                  )}
                </form>
              </PageCard>
            </div>
          )}

          {tab === "bills" && (
            <section className="space-y-4">
              <div ref={billFormRef}>
                <PageCard title="Add bill or debt" subtitle="Anything you need to pay later goes here first.">
                  <form onSubmit={addBill} className="space-y-3">
                    <Field label="Name"><input className={inputClass} value={billForm.name} onChange={(e) => setBillForm({ ...billForm, name: e.target.value })} placeholder="Example: Gym, SPayLater" /></Field>
                    <Field label="Type"><select className={inputClass} value={billForm.type} onChange={(e) => setBillForm({ ...billForm, type: e.target.value, category: getBillCategory(e.target.value) })}><option>Bill</option><option>Debt</option></select></Field>
                    <p className="-mt-1 text-xs font-semibold text-slate-500">Category is auto-assigned from the type you choose.</p>
                    <Field label="Due date"><input className={inputClass} type="date" value={billForm.dueDate} onChange={(e) => setBillForm({ ...billForm, dueDate: e.target.value })} /></Field>
                    <Field label="Amount due"><input className={inputClass} type="number" step="0.01" value={billForm.amount} onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })} /></Field>
                    {billForm.type === "Debt" && (
                      <Field label="Debt balance"><input className={inputClass} type="number" step="0.01" value={billForm.balance} onChange={(e) => setBillForm({ ...billForm, balance: e.target.value })} placeholder="Only for debt" /></Field>
                    )}
                    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={billForm.recurring}
                        onChange={(e) =>
                          setBillForm({
                            ...billForm,
                            recurring: e.target.checked,
                            recurrenceFrequency: e.target.checked ? billForm.recurrenceFrequency : "monthly",
                            secondDueDay: e.target.checked ? billForm.secondDueDay : "",
                          })
                        }
                      />
                      {billForm.type === "Debt" ? "This debt repeats" : "Recurring obligation"}
                    </label>

                    {billForm.recurring && (
                      <Field label="Repeat schedule">
                        <select
                          className={inputClass}
                          value={billForm.recurrenceFrequency}
                          onChange={(e) =>
                            setBillForm({
                              ...billForm,
                              recurrenceFrequency: e.target.value,
                              secondDueDay: e.target.value === "twice-monthly" ? billForm.secondDueDay : "",
                            })
                          }
                        >
                          <option value="monthly">Monthly</option>
                          <option value="twice-monthly">Twice per month</option>
                        </select>
                      </Field>
                    )}

                    {billForm.recurring && billForm.recurrenceFrequency === "twice-monthly" && (
                      <Field label="Second due day of the month">
                        <input
                          className={inputClass}
                          type="number"
                          min="1"
                          max="31"
                          value={billForm.secondDueDay}
                          onChange={(e) => setBillForm({ ...billForm, secondDueDay: e.target.value })}
                          placeholder="Example: 20"
                        />
                      </Field>
                    )}
                    {billForm.type === "Debt" && (
                      <Field label="End date (optional)">
                        <input className={inputClass} type="date" value={billForm.endDate} onChange={(e) => setBillForm({ ...billForm, endDate: e.target.value })} />
                      </Field>
                    )}
                    <Button className="w-full rounded-2xl bg-slate-950 py-6 font-black text-white">{editingBillId ? "Update bill/debt" : "Save bill/debt"}</Button>
                    {editingBillId && (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full rounded-2xl border-slate-200 bg-white text-sm font-black text-slate-700"
                        onClick={resetBillForm}
                      >
                        Cancel edit
                      </Button>
                    )}
                  </form>
                </PageCard>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.4rem] border border-blue-100 bg-blue-50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700">Monthly bills</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{peso.format(summary.monthlyBillsTotal)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">Active recurring bills</p>
                </div>
                <div className="rounded-[1.4rem] border border-red-100 bg-red-50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-red-700">Monthly debts</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{peso.format(summary.monthlyDebtsTotal)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">Active recurring debts</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Search">
                  <input
                    className={inputClass}
                    placeholder="Search name or category"
                    value={billSearch}
                    onChange={(e) => setBillSearch(e.target.value)}
                  />
                </Field>
                <Field label="Type">
                  <select className={inputClass} value={billTypeFilter} onChange={(e) => setBillTypeFilter(e.target.value)}>
                    <option value="all">All</option>
                    <option value="Bill">Bill</option>
                    <option value="Debt">Debt</option>
                  </select>
                </Field>
                <Field label="Status">
                  <select className={inputClass} value={billStatusFilter} onChange={(e) => setBillStatusFilter(e.target.value)}>
                    <option value="all">All</option>
                    <option value="Pending">Pending</option>
                    <option value="Partial">Partial</option>
                    <option value="Paid">Paid</option>
                  </select>
                </Field>
              </div>

              {(() => {
                const visibleBills = data.bills
                  .filter((b) => b.type === "Bill" && isActiveMonthlyObligation(b))
                  .filter((b) => billTypeFilter === "all" || b.type === billTypeFilter)
                  .filter((b) => billStatusFilter === "all" || b.status === billStatusFilter)
                  .filter((b) => {
                    const search = billSearch.trim().toLowerCase();
                    return (
                      search.length === 0 ||
                      b.name.toLowerCase().includes(search) ||
                      (b.category || "").toLowerCase().includes(search)
                    );
                  });

                const visibleDebts = data.bills
                  .filter((b) => b.type === "Debt" && isActiveMonthlyObligation(b))
                  .filter((b) => billTypeFilter === "all" || b.type === billTypeFilter)
                  .filter((b) => billStatusFilter === "all" || b.status === billStatusFilter)
                  .filter((b) => {
                    const search = billSearch.trim().toLowerCase();
                    return (
                      search.length === 0 ||
                      b.name.toLowerCase().includes(search) ||
                      (b.category || "").toLowerCase().includes(search)
                    );
                  });

                return (
                  <>
                    <SectionTitle title="Bills" />
                    <div className="space-y-2">
                      {visibleBills.map((b) => (
                        <BillRow
                          key={b.id}
                          bill={b}
                          onPay={() => payBill(b)}
                          onEdit={() => startEditingBill(b)}
                          onDelete={() => requestDelete("bills", b.id)}
                          showDelete
                        />
                      ))}
                      {visibleBills.length === 0 && <EmptyBox text="No bills match your filters." />}
                    </div>

                    <SectionTitle title="Debts" />
                    <div className="space-y-2">
                      {visibleDebts.map((b) => (
                        <BillRow
                          key={b.id}
                          bill={b}
                          onPay={() => payBill(b)}
                          onEdit={() => startEditingBill(b)}
                          onDelete={() => requestDelete("bills", b.id)}
                          showDelete
                        />
                      ))}
                      {visibleDebts.length === 0 && <EmptyBox text="No debts match your filters." />}
                    </div>
                  </>
                );
              })()}
            </section>
          )}

          {tab === "goals" && (
            <section className="space-y-4">
              <div ref={goalFormRef}>
                <PageCard title="Add savings goal" subtitle="Set how much you need to pay into each goal every month.">
                  <form onSubmit={addGoal} className="space-y-3">
                    <Field label="Goal name"><input className={inputClass} value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} placeholder="Emergency Fund" /></Field>
                    <Field label="Priority">
                      <select className={inputClass} value={goalForm.priority} onChange={(e) => setGoalForm({ ...goalForm, priority: e.target.value })}>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </Field>
                    <Field label="Target amount"><input className={inputClass} type="number" value={goalForm.target} onChange={(e) => setGoalForm({ ...goalForm, target: e.target.value })} /></Field>
                    <Field label="Current saved"><input className={inputClass} type="number" value={goalForm.current} onChange={(e) => setGoalForm({ ...goalForm, current: e.target.value })} /></Field>
                    <Field label="Monthly payment needed"><input className={inputClass} type="number" value={goalForm.monthlyTarget} onChange={(e) => setGoalForm({ ...goalForm, monthlyTarget: e.target.value })} /></Field>
                    <Button className="w-full rounded-2xl bg-slate-950 py-6 font-black text-white">{editingGoalId ? "Update goal" : "Save goal"}</Button>
                    {editingGoalId && (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full rounded-2xl border-slate-200 bg-white text-sm font-black text-slate-700"
                        onClick={resetGoalForm}
                      >
                        Cancel edit
                      </Button>
                    )}
                  </form>
                </PageCard>
              </div>

              <div className="rounded-[1.4rem] border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Total monthly goal payments</p>
                <p className="mt-1 text-2xl font-black text-emerald-900">{peso.format(summary.goalMonthlyTarget)}</p>
                <p className="mt-1 text-xs font-semibold text-emerald-700">
                  Remaining this month: {peso.format(summary.goalStillNeededThisMonth)}
                </p>
              </div>

              <div className="space-y-3">
                {data.goals.map((g) => <GoalRow key={g.id} goal={g} onEdit={() => startEditingGoal(g)} />)}
              </div>
            </section>
          )}

          {tab === "history" && (
            <section className="space-y-4">
              <PageCard
                title="Monthly review"
                subtitle="Choose any month to inspect your cash flow and transaction history."
              >
                <div className="space-y-3">
                  <Field label="Select month">
                    <input
                      className={inputClass}
                      type="month"
                      value={historyMonth}
                      onChange={(e) => setHistoryMonth(e.target.value)}
                    />
                  </Field>
                  <Field label="Type filter">
                    <select className={inputClass} value={historyType} onChange={(e) => setHistoryType(e.target.value)}>
                      <option value="all">All</option>
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                      <option value="bill_payment">Bill payment</option>
                      <option value="debt_payment">Debt payment</option>
                      <option value="savings">Savings contribution</option>
                    </select>
                  </Field>
                  <Field label="Search category or notes">
                    <input
                      className={inputClass}
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Search category or notes"
                    />
                  </Field>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-emerald-50 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Income</p>
                    <p className="mt-2 text-lg font-black text-emerald-900">{peso.format(monthReview.selected.summary.income)}</p>
                  </div>
                  <div className="rounded-2xl bg-red-50 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-red-700">Expenses</p>
                    <p className="mt-2 text-lg font-black text-red-900">{peso.format(monthReview.selected.summary.expenses)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-700">Savings</p>
                    <p className="mt-2 text-lg font-black text-slate-900">{peso.format(monthReview.selected.summary.savings)}</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Payments</p>
                    <p className="mt-2 text-lg font-black text-amber-900">
                      {peso.format(monthReview.selected.summary.billPayments + monthReview.selected.summary.debtPayments)}
                    </p>
                  </div>
                </div>
              </PageCard>

              <SectionTitle title={`Transactions for ${monthReview.selected.label}`} />
              <div className="space-y-2">
                {monthReview.selected.transactions.length === 0 && <EmptyBox text={`No transactions recorded for ${monthReview.selected.label}.`} />}
                {monthReview.selected.transactions.map((t) => (
                  <TransactionRow
                    key={t.id}
                    item={t}
                    onEdit={() => startEditingTransaction(t)}
                    onDelete={() => requestDelete("transactions", t.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {tab === "settings" && (
            <section className="space-y-4">
              <PageCard title="Account" subtitle="Manage your signed-in session details.">
                <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Signed in as</p>
                  <p className="mt-2 text-sm font-black text-slate-950">{currentUser?.email || (supabaseEnabled ? "Login required" : "Local development mode")}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {currentUser
                      ? "Your data is synced with your authenticated Supabase account."
                      : supabaseEnabled
                        ? "Sign in to unlock synced finance data."
                        : "Local development mode keeps data in this browser only."}
                  </p>
                </div>
                {currentUser && (
                  <div className="mt-3">
                    <Button
                      type="button"
                      className="w-full rounded-2xl bg-slate-950 text-white"
                      onClick={async () => {
                        try {
                          setSyncStatus("Saving");
                          await saveRemoteState(data, currentUser.id);
                          saveUserLocalBackup(currentUser.id, data);
                          setLastSavedSnapshot(JSON.stringify(data));
                          setSyncStatus("Synced");
                          notify("Saved", "Your data has been saved to Supabase.");
                        } catch {
                          setSyncStatus("Sync failed");
                          notify("Sync failed", "Your data could not be saved to Supabase.");
                        }
                      }}
                    >
                      Save now
                    </Button>
                  </div>
                )}
              </PageCard>
              {process.env.NODE_ENV === "development" && (
                <PageCard title="Debug sync status" subtitle="Development-only Supabase state check.">
                  <div className="space-y-1 rounded-[1.4rem] bg-slate-950 p-4 text-xs font-semibold text-white">
                    <p>supabaseEnabled: {String(supabaseEnabled)}</p>
                    <p>currentUser: {currentUser?.email || "none"}</p>
                    <p>currentUserId: {currentUser?.id || "none"}</p>
                    <p>userDataReady: {String(userDataReady)}</p>
                    <p>userDataSource: {userDataSource}</p>
                    <p>lastLoadedUserId: {lastLoadedUserId || "none"}</p>
                    <p>syncStatus: {syncStatus}</p>
                  </div>
                </PageCard>
              )}

              <PageCard title="Money setup" subtitle="Set your starting cash and track flexible income sources. Safe-to-spend uses confirmed income only.">
                <div className="space-y-3">
                  <Field label="Starting cash">
                    <input className={inputClass} type="number" value={data.startingCash} onChange={(e) => updateStartingCash(e.target.value)} />
                  </Field>
                  <p className="text-xs text-slate-500">
                    Starting cash is your baseline cash balance. It is separate from income sources and does not create or edit them.
                  </p>
                </div>
              </PageCard>
              <div ref={incomeSourceFormRef}>
                <PageCard title="Income sources" subtitle="Add or edit your expected cash and mark each source as received or missed.">
                  <div className="space-y-3">
                    <Field label="Source name">
                      <input
                        className={inputClass}
                        value={incomeSourceForm.name}
                        onChange={(e) => setIncomeSourceForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Main Income"
                      />
                    </Field>
                    <Field label="Amount">
                      <input
                        className={inputClass}
                        type="number"
                        value={incomeSourceForm.amount}
                        onChange={(e) => setIncomeSourceForm((prev) => ({ ...prev, amount: e.target.value }))}
                        placeholder="26000"
                      />
                    </Field>
                    <Field label="Expected date">
                      <input
                        className={inputClass}
                        type="date"
                        value={incomeSourceForm.expectedDate}
                        onChange={(e) => setIncomeSourceForm((prev) => ({ ...prev, expectedDate: e.target.value }))}
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button type="button" className="flex-1 rounded-2xl bg-slate-950 text-white" onClick={addIncomeSource}>
                        {editingIncomeSourceId ? "Update source" : "Add source"}
                      </Button>
                      {editingIncomeSourceId && (
                        <Button
                          type="button"
                          variant="outline"
                          className="flex-1 rounded-2xl border-slate-200"
                          onClick={resetIncomeSourceForm}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {data.incomeSources.length === 0 && <EmptyBox text="No income sources yet. Add one to start tracking expected cash." />}
                    {data.incomeSources.map((source) => {
                      const statusTone =
                        source.status === "Received"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                          : source.status === "Missed"
                            ? "bg-red-50 text-red-700 border-red-100"
                            : "bg-amber-50 text-amber-700 border-amber-100";

                      return (
                        <div key={source.id} className="rounded-[1.4rem] border border-slate-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-black text-slate-950">{source.name}</p>
                              <p className="mt-1 text-xs text-slate-500">Expected {source.expectedDate}</p>
                            </div>
                            <p className="text-sm font-black text-emerald-700">{peso.format(source.amount)}</p>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone}`}>
                              {source.status}
                            </span>
                            {source.status !== "Received" && (
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-full border-slate-200 px-3 text-xs font-bold"
                                onClick={() => markIncomeSourceReceived(source)}
                              >
                                Mark received
                              </Button>
                            )}
                            {source.status !== "Missed" && (
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-full border-slate-200 px-3 text-xs font-bold"
                                onClick={() => markIncomeSourceMissed(source)}
                              >
                                Mark missed
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-full border-slate-200 px-3 text-xs font-bold"
                              onClick={() => startEditingIncomeSource(source)}
                            >
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-full border-red-200 px-3 text-xs font-bold text-red-600"
                              onClick={() => requestDelete("incomeSources", source.id)}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </PageCard>
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-md px-4 pt-5 sm:max-w-lg">
          <header className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Personal Finance</p>
              <h1 className="text-2xl font-black tracking-tight">Money Guard</h1>
            </div>
          </header>
          <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Loading your finance data...
          </div>
        </div>
      )}

      {logoutConfirm && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-slate-950/55 px-4">
          <div className="w-full max-w-sm rounded-[1.6rem] bg-white p-5 shadow-2xl">
            <p className="text-base font-black text-slate-950">Confirm sign out</p>
            <p className="mt-2 text-sm text-slate-500">You will need to sign back in to access your finance dashboard.</p>
            <div className="mt-4 flex gap-2">
              <Button type="button" variant="outline" className="flex-1 rounded-2xl border-slate-200" onClick={() => setLogoutConfirm(false)}>
                Cancel
              </Button>
              <Button type="button" className="flex-1 rounded-2xl bg-red-600 text-white" onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
          </div>
        </div>
      )}

      {mounted && (!authRequired || currentUser) && (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-2 pb-3 pt-2 backdrop-blur-xl">
          <div className="mx-auto grid max-w-md grid-cols-6 gap-1">
            {tabs.map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex flex-col items-center justify-center rounded-2xl px-1 py-2 text-[10px] font-bold transition ${
                  tab === key ? "bg-slate-950 text-white shadow-lg" : "bg-white text-slate-500"
                }`}
              >
                <Icon className="mb-1 h-5 w-5" />
                {label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </main>
  );
}

function SectionTitle({ title, action, onClick }) {
  return (
    <div className="flex items-center justify-between pt-1">
      <h2 className="text-base font-black text-slate-950">{title}</h2>
      {action && (
        <button onClick={onClick} className="flex items-center gap-1 text-xs font-bold text-emerald-700">
          {action} <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function PageCard({ title, subtitle, children }) {
  return (
    <section>
      <Card className="rounded-[1.7rem] border-0 shadow-sm">
        <CardContent className="p-5">
          <h2 className="text-lg font-black">{title}</h2>
          {subtitle && <p className="mb-4 mt-1 text-sm text-slate-500">{subtitle}</p>}
          {children}
        </CardContent>
      </Card>
    </section>
  );
}

function EmptyBox({ text }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm font-medium text-slate-500">{text}</div>;
}

function BillRow({ bill, onPay, onEdit, onDelete, showDelete = false }) {
  const isPaid = bill.status === "Paid";
  const isDebt = bill.type === "Debt";
  const daysUntil = getDaysUntil(bill.dueDate);
  const isOverdue = !isPaid && daysUntil < 0;
  const isDueSoon = !isPaid && daysUntil >= 0 && daysUntil <= 3;

  const statusStyle = isPaid
    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
    : isOverdue
      ? "bg-red-50 text-red-700 border-red-100"
      : isDueSoon
        ? "bg-amber-50 text-amber-700 border-amber-100"
        : "bg-slate-50 text-slate-600 border-slate-100";

  const typeStyle = isDebt
    ? "bg-red-50 text-red-700 border-red-100"
    : "bg-blue-50 text-blue-700 border-blue-100";

  const statusText = isPaid ? "Paid" : isOverdue ? "Overdue" : isDueSoon ? "Due Soon" : bill.status;

  return (
    <div className="overflow-hidden rounded-[1.4rem] border border-slate-100 bg-white shadow-sm shadow-slate-200/70">
      <div className={`h-1.5 ${isPaid ? "bg-emerald-500" : isOverdue ? "bg-red-600" : isDebt ? "bg-red-500" : "bg-blue-500"}`} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${typeStyle}`}>{bill.type}</span>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusStyle}`}>{statusText}</span>
              {bill.recurring && (
                <span className="rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  {bill.recurrenceFrequency === "twice-monthly" ? "2x Monthly" : "Monthly"}
                </span>
              )}
            </div>
            <p className="truncate text-base font-black text-slate-950">{bill.name}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Due {bill.dueDate} {daysUntil >= 0 && !isPaid ? `· ${daysUntil} day(s)` : ""}
            </p>
            {bill.recurring && bill.recurrenceFrequency === "twice-monthly" && bill.secondDueDay && (
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Twice-monthly schedule · second due day: {bill.secondDueDay}
              </p>
            )}
            {isDebt && bill.endDate && (
              <p className="mt-1 text-xs font-semibold text-slate-500">Active until {bill.endDate}</p>
            )}
            {isDebt && Number(bill.balance || 0) > 0 && (
              <p className="mt-1 text-xs font-semibold text-red-600">Balance left: {peso.format(bill.balance)}</p>
            )}
            {bill.status === "Partial" && (
              <p className="mt-1 text-xs font-semibold text-amber-600">Remaining: {peso.format(getBillRemainingAmount(bill))}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-black text-slate-950">{peso.format(bill.amount)}</p>
            <p className="text-[11px] font-semibold text-slate-400">Amount due</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
          {!isPaid ? (
            <Button size="sm" className="h-11 rounded-2xl bg-slate-950 text-sm font-black text-white" onClick={onPay}>
              Pay / Record
            </Button>
          ) : (
            <div className="flex h-11 items-center justify-center rounded-2xl bg-emerald-50 text-sm font-black text-emerald-700">Paid</div>
          )}
          {onEdit && (
            <Button size="sm" variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white px-3 text-xs font-black text-slate-700" onClick={onEdit}>
              <span className="flex items-center gap-1"><Pencil className="h-3.5 w-3.5" /> Edit</span>
            </Button>
          )}
          {showDelete && (
            <Button size="sm" variant="outline" className="h-11 w-11 rounded-2xl border-slate-200 bg-white text-slate-700" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function GoalRow({ goal, onEdit }) {
  const progress = (Number(goal.current || 0) / Math.max(Number(goal.target || 1), 1)) * 100;
  const amountLeft = Math.max(Number(goal.target || 0) - Number(goal.current || 0), 0);
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-black">{goal.name}</p>
          <p className="text-xs text-slate-500">Target: {peso.format(goal.target)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-black text-emerald-700">{Math.round(progress)}%</p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{goal.priority || "Medium"}</p>
        </div>
      </div>
      <ProgressBar value={progress} />
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 p-2">
          <p className="font-semibold text-slate-500">Saved</p>
          <p className="font-black text-slate-950">{peso.format(goal.current)}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-2">
          <p className="font-semibold text-emerald-700">Monthly pay</p>
          <p className="font-black text-emerald-900">{peso.format(goal.monthlyTarget || 0)}</p>
        </div>
      </div>
      <p className="mt-2 text-xs font-medium text-slate-500">{peso.format(amountLeft)} left to complete this goal</p>
      {onEdit && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="outline" className="h-10 rounded-2xl border-slate-200 bg-white px-4 text-xs font-black text-slate-700" onClick={onEdit}>
            <span className="flex items-center gap-1"><Pencil className="h-3.5 w-3.5" /> Edit</span>
          </Button>
        </div>
      )}
    </div>
  );
}

function TransactionRow({ item, onEdit, onDelete }) {
  const isIncome = item.type === "income";
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-black text-slate-950">{item.category}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {item.date} · {item.type.replace("_", " ")}
          </p>
          {item.notes && <p className="mt-1 text-xs text-slate-500">{item.notes}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-base font-black ${isIncome ? "text-emerald-700" : "text-red-600"}`}>
            {isIncome ? "+" : "-"}{peso.format(item.amount)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        {onEdit && (
          <Button size="sm" variant="outline" className="h-10 rounded-2xl border-slate-200 bg-white px-4 text-xs font-black text-slate-700" onClick={onEdit}>
            <span className="flex items-center gap-1"><Pencil className="h-3.5 w-3.5" /> Edit</span>
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-10 rounded-2xl border-red-100 bg-red-50 px-4 text-xs font-black text-red-700 hover:bg-red-100" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}