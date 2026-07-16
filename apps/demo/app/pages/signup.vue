<script setup lang="ts">
import { ref } from "vue";
import * as v from "valibot";
import type { FormDefinition, ValidationFactory, ValidationResolver } from "@formblatt/core";
import { DynamicForm, type SubmitContext } from "@formblatt/vue";

const signupDefinition: FormDefinition = {
  id: "signup-v1",
  validate: "initial",
  revalidate: "input",
  fields: [
    {
      name: "username", kind: "string", control: "text", label: "Username",
      validations: [
        { type: "minLength", value: 3, message: "At least 3 characters" },
        { type: "regex", value: "^[a-z0-9-]+$", message: "Lowercase letters, digits and dashes only" },
        // `remote` routes to resolveValidation below — the async check a schema cannot express
        { type: "remote", value: "usernameAvailable", message: "This username is taken" },
      ],
    },
    { name: "email", kind: "string", control: "email", label: "Email", validations: [{ type: "email" }] },
    {
      name: "password", kind: "string", control: "password", label: "Password",
      validations: [
        { type: "minLength", value: 8, message: "At least 8 characters" },
        // host-defined rule, registered through the `rules` prop below
        { type: "passwordStrength", value: 3 },
      ],
    },
    {
      name: "terms", kind: "boolean", control: "checkbox", label: "I accept the terms of service",
      validations: [{ type: "isTrue", message: "You must accept the terms to sign up" }],
    },
  ],
};

/**
 * A custom validation rule the schema builder doesn't ship: password strength
 * as "at least `value` of the four character classes". Registered via the
 * `rules` prop, addressable from the JSON definition like any built-in.
 */
const rules: Record<string, ValidationFactory> = {
  passwordStrength: rule => v.check<string>(
    value => {
      const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(re => re.test(value)).length;
      return classes >= ((rule.value as number) ?? 3);
    },
    rule.message ?? "Mix upper and lower case, digits and symbols",
  ),
};

const TAKEN_USERNAMES = new Set(["admin", "root", "formblatt"]);

/** The resolver runs on EVERY validation pass — cache, or the "server" gets hammered. */
const availability = new Map<string, boolean | string>();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Stands in for GET /users/available?name=… */
const resolveValidation: ValidationResolver = async (source, value) => {
  if (source !== "usernameAvailable") return true;

  const username = String(value).toLowerCase();
  const cached = availability.get(username);
  if (cached !== undefined) return cached;

  await delay(450);
  // `false` fails with the rule's message; a string return overrides it
  const result = username === "admin"
    ? "This username is reserved"
    : !TAKEN_USERNAMES.has(username);
  availability.set(username, result);
  return result;
};

const registered = ref<unknown>(null);

/**
 * Stands in for POST /signup. Some rejections only the server knows about —
 * `setFieldErrors` maps them back onto the fields, where they render exactly
 * like schema errors until the next edit revalidates.
 */
const signUp = async (values: unknown, context: SubmitContext) => {
  await delay(700);

  const { email } = values as { email: string };
  if (email.toLowerCase() === "taken@example.com") {
    context.setFieldErrors({ email: "An account with this email already exists — try signing in instead" });
    return;
  }
  registered.value = values;
}
</script>

<template>
  <div class="signup-demo">
    <h1>Create your account</h1>
    <p class="tagline">
      Async validation against a fake backend: a <code>remote</code> rule checks username
      availability, a host-registered rule scores password strength, and the submit handler
      maps a server-side rejection back onto its field.
    </p>

    <div v-if="registered" class="welcome">
      <h2>Welcome aboard!</h2>
      <pre>{{ JSON.stringify(registered, null, 2) }}</pre>
    </div>

    <template v-else>
      <DynamicForm
        :definition="signupDefinition"
        :rules="rules"
        :resolve-validation="resolveValidation"
        error-display="touched"
        submit-label="Sign up"
        @submit="signUp"
      />

      <aside class="try">
        <strong>Try:</strong>
        <ul>
          <li>username <code>root</code> or <code>formblatt</code> — taken (rule message)</li>
          <li>username <code>admin</code> — reserved (message from the resolver)</li>
          <li>email <code>taken@example.com</code> — rejected by the "server" on submit</li>
          <li>password <code>aaaaaaaa</code> — long enough, but too weak</li>
        </ul>
      </aside>
    </template>
  </div>
</template>

<style scoped>
.signup-demo {
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

.signup-demo h1 {
  margin: 0 0 .35rem;
  font-size: 1.3rem;
  font-weight: 650;
}

.tagline {
  margin: 0 0 1.25rem;
  font-size: .85rem;
  color: #6b7280;
}

.tagline code,
.try code {
  padding: .05rem .3rem;
  background: #f3f4f6;
  border-radius: 4px;
  font-size: .8em;
}

.welcome {
  padding: 1rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  color: #065f46;
}

.welcome h2 {
  margin: 0 0 .5rem;
  font-size: 1.05rem;
}

.welcome pre {
  margin: 0;
  padding: .6rem;
  background: #f0fdf9;
  border-radius: 6px;
  font-size: .75rem;
  overflow: auto;
}

.try {
  margin-top: 1.5rem;
  padding: .875rem 1rem;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  font-size: .82rem;
  color: #78350f;
}

.try ul {
  margin: .4rem 0 0;
  padding-left: 1.1rem;
}

.try li {
  margin: .15rem 0;
}
</style>
