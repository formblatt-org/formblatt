<script setup lang="ts">
/** Every demo page, with the formblatt capabilities it exercises. */
const DEMOS = [
  {
    to: "/account",
    title: "Account form",
    scenario: "A profile form rendered purely from its JSON definition.",
    features: ["populate lookups", "cascading selects", "computed fields", "visibility affects", "external submit"],
  },
  {
    to: "/checkout",
    title: "Checkout",
    scenario: "A storefront checkout with order lines, billing toggle and live totals.",
    features: ["hand-placed layout", "per-row checks", "computed totals", "conditional sections"],
  },
  {
    to: "/cart",
    title: "Cart",
    scenario: "A shopping cart with undoable line removal.",
    features: ["headless field array", "host-side state", "typed components"],
  },
  {
    to: "/todos",
    title: "Todos",
    scenario: "The classic list: add, edit inline, toggle, reorder, remove.",
    features: ["field array CRUD", "row reordering", "typed submit payload", "dirty-gated save"],
  },
  {
    to: "/careers",
    title: "Job application",
    scenario: "A multi-step application that skips the experience step for first-timers.",
    features: ["wizard pages", "per-page validation", "conditional step", "review & submit"],
  },
  {
    to: "/signup",
    title: "Sign up",
    scenario: "Registration validated against a (fake) backend.",
    features: ["remote rules", "custom rules", "server errors on fields", "async submit"],
  },
  {
    to: "/settings",
    title: "Account settings",
    scenario: "An edit workflow over a saved record.",
    features: ["initialData hydration", "dirty tracking", "PATCH of changed fields", "leave guard"],
  },
  {
    to: "/survey",
    title: "Product feedback",
    scenario: "A survey using every control flavor.",
    features: ["custom control registry", "radio group", "multi-enum checkboxes", "touched-gated errors"],
  },
  {
    to: "/contact",
    title: "Contact",
    scenario: "One form, two languages, switchable live.",
    features: ["message catalog", "interpolated errors", "localized UI text"],
  },
  {
    to: "/booking",
    title: "Appointment booking",
    scenario: "Pick a service, stylist and date — the slots follow all three.",
    features: ["multi-dependency options", "cascading reloads", "computed price"],
  },
  {
    to: "/transfer",
    title: "Bank transfer",
    scenario: "A payment form with a saved-beneficiary shortcut.",
    features: ["IBAN mod-97 rule", "populate & revert", "server-side rejection"],
  },
  {
    to: "/donate",
    title: "Donation",
    scenario: "Preset or custom amounts with live fee coverage.",
    features: ["conditional field", "if-expressions", "expression-computed total"],
  },
  {
    to: "/support",
    title: "Support ticket",
    scenario: "One form that reshapes itself per category.",
    features: ["section visibleWhen", "hideAndClear", "cascading subcategory"],
  },
  {
    to: "/event",
    title: "Event registration",
    scenario: "Multiple attendees, each row priced and checked on its own.",
    features: ["per-row expressions", "per-row checks", "remote promo code"],
  },
  {
    to: "/flights",
    title: "Flight search",
    scenario: "Return or one-way, with a declarative cross-date guard.",
    features: ["hideAndClear", "dateDiff expression", "validated computed field"],
  },
  {
    to: "/playground",
    title: "Definition playground",
    scenario: "Edit a raw definition and watch the serving pipeline judge it.",
    features: ["migrations", "shape validation", "referential lint", "live preview"],
  },
];
</script>

<template>
  <div class="landing">
    <header class="hero">
      <h1>formblatt demos</h1>
      <p>
        Every page is one real-life form scenario, built from a JSON
        <code>FormDefinition</code> and the <code>@formblatt/vue</code> components.
        The tags name the capabilities each demo exercises.
      </p>
    </header>

    <div class="grid">
      <NuxtLink v-for="demo in DEMOS" :key="demo.to" :to="demo.to" class="card">
        <h2>{{ demo.title }}</h2>
        <p>{{ demo.scenario }}</p>
        <ul class="features">
          <li v-for="feature in demo.features" :key="feature">{{ feature }}</li>
        </ul>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.landing {
  max-width: 960px;
  margin: 2.5rem auto;
  padding: 0 1.5rem 3rem;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1f2937;
}

.hero h1 {
  margin: 0 0 .35rem;
  font-size: 1.5rem;
  font-weight: 700;
}

.hero p {
  margin: 0 0 1.75rem;
  max-width: 560px;
  font-size: .9rem;
  color: #6b7280;
}

.hero code {
  padding: .05rem .3rem;
  background: #eef2ff;
  border-radius: 4px;
  font-size: .85em;
  color: #4f46e5;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.card {
  display: block;
  padding: 1.1rem 1.25rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  text-decoration: none;
  color: inherit;
  transition: border-color .15s, box-shadow .15s, transform .15s;
}

.card:hover {
  border-color: #c7d2fe;
  box-shadow: 0 10px 30px rgba(79, 70, 229, .08);
  transform: translateY(-1px);
}

.card h2 {
  margin: 0 0 .25rem;
  font-size: 1rem;
  font-weight: 650;
}

.card p {
  margin: 0 0 .625rem;
  font-size: .82rem;
  color: #6b7280;
}

.features {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: .3rem;
}

.features li {
  padding: .12rem .5rem;
  font-size: .7rem;
  font-weight: 550;
  color: #4f46e5;
  background: #eef2ff;
  border-radius: 999px;
}
</style>
