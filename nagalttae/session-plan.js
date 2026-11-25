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

  function withPlans(mode, operation) {
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open("nagalttae.saved-plans", 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore("plans", { keyPath: "id" });
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const database = opening.result;
        try {
          const transaction = database.transaction("plans", mode);
          let result;
          transaction.oncomplete = () => { database.close(); resolve(result); };
          transaction.onabort = () => { database.close(); reject(transaction.error); };
          operation(transaction.objectStore("plans"), value => { result = value; });
        } catch (error) {
          database.close();
          reject(error);
        }
      };
    });
  }

  function readSavedPlans() {
    return withPlans("readonly", (store, finish) => {
      const reading = store.getAll();
      reading.onsuccess = () => {
        const plans = reading.result.filter(record => Number.isSafeInteger(record.revision) && checked(record.plan));
        finish(plans.sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id)));
      };
    });
  }

  async function writeSavedPlan(snapshot, previous) {
    const plan = checked(snapshot);
    if (!plan) throw new TypeError("Invalid plan");
    if (previous) return changeSavedPlan(previous, plan);
    return withPlans("readwrite", (store, finish) => {
      store.add({ id: crypto.randomUUID(), revision: 1, savedAt: Date.now(), plan });
      finish(true);
    });
  }

  function changeSavedPlan(previous, plan) {
    return withPlans("readwrite", (store, finish) => {
      const reading = store.get(previous.id);
      reading.onsuccess = () => {
        const record = reading.result;
        if (!record || record.revision !== previous.revision) {
          finish(false);
          return;
        }
        if (plan) store.put({ id: record.id, revision: record.revision + 1, savedAt: Date.now(), plan });
        else store.delete(record.id);
        finish(true);
      };
    });
  }

  globalThis.NagalSavedPlans = {
    list: readSavedPlans,
    save: writeSavedPlan,
    remove: previous => changeSavedPlan(previous, null)
  };
})();
