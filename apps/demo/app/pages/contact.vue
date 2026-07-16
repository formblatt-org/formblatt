<script setup lang="ts">
import { computed, ref } from "vue";
import type { FormDefinition, MessageCatalog } from "@formblatt/core";
import { DynamicForm, type UiText } from "@formblatt/vue";

type Locale = "en" | "de";

const locale = ref<Locale>("en");

/**
 * Everything language-dependent in one place: field labels and options live
 * in the DEFINITION (a real backend would serve it localized), validation
 * error templates in the `messages` catalog — interpolating `{field}` and
 * `{value}` — and the built-in UI strings in the `text` prop.
 */
const LOCALIZED = {
  en: {
    heading: "Contact us",
    intro: "The same form, twice: switch the language and every label, placeholder, button and validation message follows.",
    sent: "Thanks — we usually reply within two business days.",
    labels: {
      name: "Your name",
      email: "Email",
      topic: "Topic",
      orderNumber: "Order number",
      message: "Message",
    },
    topics: [
      { label: "Sales", value: "sales" },
      { label: "Support", value: "support" },
      { label: "Feedback", value: "feedback" },
    ],
    messages: {
      required: "{field} is required",
      email: "This doesn't look like a valid email address",
      minLength: "{field} needs at least {value} characters",
      regex: "Format: FB- followed by 6 digits, e.g. FB-123456",
    } satisfies MessageCatalog,
    text: {
      submit: "Send message",
      submitting: "Sending…",
      reset: "Reset",
      selectPlaceholder: "— Select —",
      requiredMessage: "This field is required",
    } satisfies Partial<UiText>,
  },
  de: {
    heading: "Kontaktieren Sie uns",
    intro: "Dasselbe Formular, zweimal: Beim Sprachwechsel folgen alle Beschriftungen, Buttons und Fehlermeldungen.",
    sent: "Danke — wir melden uns in der Regel innerhalb von zwei Werktagen.",
    labels: {
      name: "Ihr Name",
      email: "E-Mail",
      topic: "Thema",
      orderNumber: "Bestellnummer",
      message: "Nachricht",
    },
    topics: [
      { label: "Vertrieb", value: "sales" },
      { label: "Support", value: "support" },
      { label: "Feedback", value: "feedback" },
    ],
    messages: {
      required: "{field} ist ein Pflichtfeld",
      email: "Das sieht nicht nach einer gültigen E-Mail-Adresse aus",
      minLength: "{field} braucht mindestens {value} Zeichen",
      regex: "Format: FB- gefolgt von 6 Ziffern, z. B. FB-123456",
    } satisfies MessageCatalog,
    text: {
      submit: "Nachricht senden",
      submitting: "Wird gesendet…",
      reset: "Zurücksetzen",
      selectPlaceholder: "— Bitte wählen —",
      requiredMessage: "Dieses Feld ist ein Pflichtfeld",
    } satisfies Partial<UiText>,
  },
} as const;

const t = computed(() => LOCALIZED[locale.value]);

/** Rules carry no inline `message` — the catalog supplies every error text per locale. */
const contactDefinition = (loc: Locale): FormDefinition => {
  const { labels, topics } = LOCALIZED[loc];
  return {
    id: `contact-${loc}-v1`,
    validate: "initial",
    revalidate: "input",
    fields: [
      { name: "name", kind: "string", control: "text", label: labels.name },
      { name: "email", kind: "string", control: "email", label: labels.email, validations: [{ type: "email" }] },
      { name: "topic", kind: "enum", control: "select", label: labels.topic, options: topics },
      {
        name: "orderNumber", kind: "string", control: "text", label: labels.orderNumber,
        validations: [{ type: "regex", value: "^FB-[0-9]{6}$" }],
      },
      {
        name: "message", kind: "string", control: "textarea", label: labels.message,
        validations: [{ type: "minLength", value: 20 }],
      },
    ],
    affects: [
      // the order number only matters for support requests — and is only required while visible
      { effect: "show", when: { path: ["topic"], op: "eq", value: "support" }, targets: [["orderNumber"]] },
    ],
  };
};

const sent = ref(false);

const send = () => {
  sent.value = true;
}
</script>

<template>
  <div class="contact-demo">
    <div class="lang-switch" role="group" aria-label="Language">
      <button
        v-for="lang in (['en', 'de'] as const)"
        :key="lang"
        type="button"
        class="lang"
        :class="{ 'is-active': locale === lang }"
        @click="locale = lang; sent = false"
      >{{ lang.toUpperCase() }}</button>
    </div>

    <h1>{{ t.heading }}</h1>
    <p class="tagline">{{ t.intro }}</p>

    <p v-if="sent" class="sent">{{ t.sent }}</p>

    <!-- messages and text are compiled into the schema at mount — the :key remounts per locale -->
    <DynamicForm
      v-else
      :key="locale"
      :definition="contactDefinition(locale)"
      :messages="t.messages"
      :text="t.text"
      error-display="touched"
      @submit="send"
    />
  </div>
</template>

<style scoped>
.contact-demo {
  position: relative;
  max-width: 460px;
  margin: 2.5rem auto;
  padding: 1.75rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .06), 0 10px 30px rgba(0, 0, 0, .05);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1f2937;
}

.contact-demo h1 {
  margin: 0 0 .35rem;
  font-size: 1.3rem;
  font-weight: 650;
}

.tagline {
  margin: 0 0 1.25rem;
  font-size: .85rem;
  color: #6b7280;
}

.lang-switch {
  position: absolute;
  top: 1.75rem;
  right: 1.75rem;
  display: flex;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  overflow: hidden;
}

.lang {
  padding: .3rem .6rem;
  font: inherit;
  font-size: .78rem;
  font-weight: 600;
  color: #6b7280;
  background: #fff;
  border: none;
  cursor: pointer;
}

.lang + .lang {
  border-left: 1px solid #d1d5db;
}

.lang.is-active {
  color: #fff;
  background: #4f46e5;
}

.sent {
  padding: .875rem 1rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  color: #065f46;
  font-size: .9rem;
}
</style>
