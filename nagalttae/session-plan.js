(() => {
  "use strict";

  const key = "nagalttae.session-plan";
  const version = 1;

  function checked(plan) {
    if (!plan || typeof plan.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(plan.date)) return null;
    if (plan.date.startsWith("0000") || !globalThis.NagalPlanner.calculatePlan(plan)) return null;
    const day = new Date(plan.date + "T00:00:00Z");
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== plan.date) return null;
    const { date, target, prep, travel, buffer } = plan;
    return { date, target, prep, travel, buffer };
  }

  function save(snapshot) {
    try {
      const plan = checked(snapshot);
      if (plan) sessionStorage.setItem(key, JSON.stringify({ version, plan }));
    } catch {
      // Editing can continue when the browser denies access or has no space.
    }
  }

  function load() {
    try {
      const record = JSON.parse(sessionStorage.getItem(key));
      return record?.version === version ? checked(record.plan) : null;
    } catch {
      return null;
    }
  }

  function clear() {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // The browser may block storage, including on local-file previews.
    }
  }

  globalThis.NagalDraft = { save, load, clear };
})();
